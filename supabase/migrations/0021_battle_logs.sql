-- ============================================================================
-- 0021_battle_logs.sql — 전투 로그 저장/공유 기능
--
-- 설계 원칙(CLAUDE.md "전투 로그 저장/공유 기능" 섹션 참고, 요약만 남김):
--   1) 저장은 수동("저장" 버튼) — battle-view.html(직접 도전)만 대상.
--      파견(dispatch.html)은 애초에 서사 로그를 안 만들어서(no-op logger)
--      자연히 스코프 밖.
--   2) lines/result/events는 저장 시점의 원문 그대로(verbatim) 보존한다 —
--      "전투 당시 로그의 완벽한 재현"이 이 기능의 존재 이유이므로, 요약·
--      정규화·재가공은 금지. 나중에 "용량 아끼자"며 손대면 기능 자체가
--      무의미해짐.
--   3) 비공개가 기본: 본인 소유가 아니면 조회 불가. 공개는 "로그 id를
--      소유자에게 직접 받은 사람만" — 시스템이 목록/검색/피드로 임의
--      노출하는 경로는 만들지 않는다("감출 이유도 없지만 공개할 이유도
--      없다, 공략에 들인 노력과 스펙업의 가치를 존중" — 사용자 원칙).
--      ⚠ 이 원칙을 RLS만으로(`using (true)`) 구현하면 안 됨 — PostgREST는
--      쿼리에 id 필터를 걸었는지와 무관하게 RLS만 통과하면 응답하므로,
--      `using (true)`는 사실상 "필터 없이 전체 테이블 공개"가 된다. 그래서
--      테이블 자체는 본인 소유만 RLS로 잠그고, 공유 조회는 "정확한 id
--      하나"만 받는 SECURITY DEFINER RPC(get_shared_battle_log)로만 연다.
--   4) FIFO 10개(유저당) — 오래된 것부터 자동 삭제. 단, pinned(고정)는
--      정리 대상에서 빠짐 — AFTERMATH 최초 클리어 같은 "잃으면 안 되는
--      기록"을 남겨두기 위함(나중에 만들 수 있는 "공략 리더보드"에 쓰일
--      데이터이기도 함 — 사용자 등재 방식일 예정이라 이 비공개 원칙과
--      충돌하지 않음). 고정 상한은 유저당 5개.
-- ============================================================================

create table public.battle_logs (
  id uuid primary key default gen_random_uuid(),  -- 이 id 자체가 "공유 시드"
  user_id uuid not null references auth.users(id) on delete cascade,
  battle_id text,          -- battle-themes.js의 battle.id (표시용, 정적 데이터라 FK로 안 묶음)
  battle_name text,        -- 저장 시점의 전투 이름(테마 데이터가 나중에 바뀌어도 로그는 그대로 남게)
  saved_by text,           -- 저장자 표시 이름(공유 화면에서 "누구의 전투인지")
  outcome text not null,
  turns_elapsed integer,
  lines jsonb not null,    -- 서사 로그 문자열 배열 — 원문 그대로(verbatim)
  result jsonb not null,   -- BattleEngine.startBattle()이 반환한 결과 객체 통째로
  events jsonb,            -- 구조화 이벤트(행동 순서/명중·치명타·완전방어 판정 등, recordEvents:true일 때만 채워짐)
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);

create index battle_logs_user_id_created_at_idx on public.battle_logs(user_id, created_at desc);

alter table public.battle_logs enable row level security;

create policy "battle_logs: 본인 소유만 CRUD" on public.battle_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 고정 개수 제한(유저당 5개) — pinned를 true로 바꾸는 순간 트리거로 강제.
-- 클라이언트에서도 막겠지만, 우회 가능하므로 DB에서도 강제해야 안전함.
-- ----------------------------------------------------------------------------

create or replace function public.enforce_battle_log_pin_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.pinned and not old.pinned then
    if (select count(*) from public.battle_logs where user_id = new.user_id and pinned) >= 5 then
      raise exception '고정할 수 있는 전투 기록은 최대 5개입니다.';
    end if;
  end if;
  return new;
end;
$$;

create trigger battle_logs_pin_limit_before_update
before update on public.battle_logs
for each row execute function public.enforce_battle_log_pin_limit();

-- ----------------------------------------------------------------------------
-- FIFO 10개(고정 로그는 제외) — 매 저장 시점에 "그 유저 소유, 비고정 행 중
-- 최신 10개를 벗어난 것"을 지움. 클라이언트가 개수를 세서 지우는 방식은
-- 경합에 취약하므로 DB에서 처리.
-- ----------------------------------------------------------------------------

create or replace function public.trim_battle_logs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.battle_logs
   where user_id = new.user_id
     and not pinned
     and id not in (
       select id from public.battle_logs
        where user_id = new.user_id
          and not pinned
        order by created_at desc
        limit 10
     );
  return null;
end;
$$;

create trigger battle_logs_trim_after_insert
after insert on public.battle_logs
for each row execute function public.trim_battle_logs();

-- ----------------------------------------------------------------------------
-- 공유 조회 RPC — RLS를 우회하지만 "정확한 id 하나"만 받는 좁은 통로.
-- 테이블 전체를 훑는 경로 자체가 없으므로 id를 모르면 원천적으로 조회 불가.
-- anon(비로그인)에게도 execute를 줘서 "공유 링크는 비로그인도 열람 가능"
-- 요건을 만족시킴 — 이게 그 결정의 실제 구현 지점.
-- ----------------------------------------------------------------------------

create or replace function public.get_shared_battle_log(p_id uuid)
returns table (
  id uuid, battle_id text, battle_name text, saved_by text,
  outcome text, turns_elapsed integer, lines jsonb, result jsonb, events jsonb, created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select id, battle_id, battle_name, saved_by, outcome, turns_elapsed, lines, result, events, created_at
    from public.battle_logs where id = p_id;
$$;

grant execute on function public.get_shared_battle_log(uuid) to anon, authenticated;
