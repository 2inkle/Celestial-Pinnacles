-- ============================================================================
-- 0027_coop_raid.sql — 협동 레이드(비동기 누적 데미지) 스키마 + RPC
--
-- ⚠ 이 마이그레이션은 아직 실행되지 않았다. 실행해야 실제 반영됨.
-- ⚠ 0026_auction_house.sql이 먼저 실행돼 있어야 한다 — _grant_item_snapshot()을
--    보상 지급에 재사용한다.
--
-- ── 모델(사용자 확정, 2026-08-31) ──────────────────────────────────────────
-- · 비동기 누적: 각자 자기 시간에 도전하고, 그 결과가 공유 HP 풀에서 깎인다.
--   다음 도전자는 이미 깎여 있는 보스를 상대한다.
-- · 양산 가능한 인스턴스제: 소환 아이템을 "전투 밖에서" 소모해 인스턴스를 연다.
-- · 기믹 가산점: 특정 기믹을 성공시킬 때마다 데미지와 별도로 기여 점수를 얻는다.
--   "퍼즐이라는 요소가 제대로 적용될 수 있도록" 하려는 것이 핵심 의도.
-- · 공개: 살아있는 레이드는 전부 공유되고, 참여 가능한 것만 골라 볼 수 있게 한다.
-- · 보상: 처치 시 참가자 전원에게 기여도(데미지+기믹점수) 비례로 분배.
--
-- ── 엔진을 건드리지 않는 이유 ──────────────────────────────────────────────
-- "전투에서 아이템을 사용해 소환"이 원안이었으나, 조사 결과 엔진에는 아이템
-- 사용 액션이 아예 없다(warehouse_items의 consumable/uses_per_battle 컬럼은
-- 데이터 경로에는 다 실려 다니지만 src/ 안에 참조가 0곳인 죽은 필드다 —
-- ignoreEvade와 같은 상태). 그래서 사용자 확정에 따라 "전투 밖에서 아이템을
-- 소모해 인스턴스를 개설"하는 쪽으로 간다. src/engine.js와
-- web/battle-adapter.js는 전혀 수정하지 않는다.
--
-- ── 왜 레이드 정의는 game_content인가(정적 JS 관례에서 벗어나는 지점) ────────
-- battle-themes.js / quest-table.js는 "정적 콘텐츠는 JS 파일로"라는 확립된
-- 관례를 따르고, 0020 헤더가 그 판단 근거를 남겨뒀다. 그런데 레이드는 그
-- 관례를 따를 수 없다 — 기믹 배점이 클라이언트에 있으면 아무나 "나 999999점
-- 획득했다"고 주장할 수 있기 때문이다. 배점은 반드시 서버가 쥐고 있어야 한다.
-- 새 테이블을 만드는 대신 game_content의 key 목록에 'raidTable'을 추가한다 —
-- 공개 읽기 + 관리자 전용 쓰기 + updated_at 트리거가 이미 다 붙어 있고,
-- 나중에 raid-table-editor.html을 만들면 기존 편집기 4개와 모양이 같아진다.
--
-- ── 데미지를 파라미터로 받지 않는 이유(가장 값싸고 효과 큰 방어) ─────────────
-- 전투는 100% 클라이언트에서 끝나므로(web/battle-adapter.js:572 →
-- src/engine.js:152) 서버가 재시뮬레이션할 방법이 없다. 그래서 데미지는
-- 어차피 자기신고값이다 — 하지만 "rpc 호출의 숫자 하나를 바꾸면 끝"인 것과
-- "앞뒤가 맞는 전투 로그를 통째로 위조해야 하고 그 위조물이 DB에 증거로 남는"
-- 것은 공격 비용이 전혀 다르다. 그래서 submit_raid_run은 데미지 인자를 받지
-- 않고, 호출자가 방금 저장한 battle_logs 행의 result->'damageDealt'->>'ally'
-- (src/engine.js:309)에서 읽는다. 전투 로그 1건은 레이드 런 1회에만 쓸 수 있다
-- (유니크 인덱스).
--
-- ── 그래도 못 막는 것(반드시 알고 있을 것) ──────────────────────────────────
-- 악의적 클라이언트는 여전히 (1) 앞뒤 맞는 battle_logs를 위조해 임의 데미지를
-- 넣을 수 있고, (2) 하지 않은 기믹을 했다고 주장할 수 있다. 아래 장치들은
-- 전부 "막는" 게 아니라 피해 범위를 유계로 만들고 흔적을 남기는 것이다:
--   · max_damage_per_run — 한 번에 넣을 수 있는 데미지 상한(거절이 아니라 클램프.
--     정직한 플레이어의 대박 런도 그만큼은 인정해줘야 하므로).
--   · max_attempts_per_user + 소환 아이템 소모 + run_cooldown_seconds —
--     "몇 번 주입할 수 있나"를 유계로 만듦. 이건 서버 상태라 진짜로 강제된다.
--   · 기믹은 id만 받고 배점은 서버가 가짐 + 유저·레이드당 id 1회만 인정.
--     무한 점수가 유계 점수가 됨.
--   · raid_runs 원장 + 관리자 조회 정책 — 예방이 아니라 사후 적발용.
-- 근본 해결은 전투 판정을 서버 권위로 옮기는 것뿐이고, 그건 Edge Function
-- 도입이나 엔진의 서버사이드 이식이 필요한 별개의 큰 작업이다.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. game_content에 'raidTable' 키 허용(위 설명 참고).
--    data 형태(예):
--    { "cave-deep-1": {
--        "name": "심층의 무언가", "battleId": "raid-cave-deep-1",
--        "summonItem": "심층의 부름", "bossMaxHp": 3000000,
--        "durationHours": 72, "maxParticipants": 20, "maxAttemptsPerUser": 5,
--        "maxDamagePerRun": 400000, "runCooldownSeconds": 10,
--        "gimmickPoints": { "break-core": 300000, "survive-quake": 120000 },
--        "rewardPool": { "gold": 500000, "items": [ ... ] } } }
--    gimmickPoints의 값은 "데미지 환산 기여점"이다 — 기여도를
--    damage + gimmick_points로 단순 합산하기 때문에, 배점을 bossMaxHp 대비
--    비율로 잡으면 "퍼즐을 푼 사람이 딜만 넣은 사람보다 낫다"가 그대로 성립한다.
-- ----------------------------------------------------------------------------
alter table public.game_content drop constraint game_content_key_check;
alter table public.game_content add constraint game_content_key_check
  check (key in ('skillTable', 'jobTable', 'monsterRoster', 'shopTable', 'raidTable'));

-- ----------------------------------------------------------------------------
-- 1. raid_instances — 열려 있는 레이드 하나.
--
--    ⚠ 규칙 수치는 전부 개설 시점에 여기로 복사(스냅샷)한다. raidTable이
--    나중에 바뀌어도 진행 중인 인스턴스의 규칙이 흔들리면 안 되기 때문 —
--    battle_logs가 battle_name을 스냅샷해두는 것과 같은 원칙.
-- ----------------------------------------------------------------------------
create table public.raid_instances (
  id uuid primary key default gen_random_uuid(),

  raid_id text not null,   -- game_content.raidTable의 키(정적 콘텐츠라 FK 안 묶음)
  battle_id text not null, -- BATTLE_MONSTER_POOLS 키(실제 편성)
  name text not null,      -- 개설 시점 표시명 스냅샷

  opener_user_id uuid not null references auth.users(id) on delete cascade,
  opener_username text not null, -- profiles가 본인 행만 읽히므로 스냅샷 필수

  boss_max_hp bigint not null check (boss_max_hp > 0),
  boss_hp_remaining bigint not null check (boss_hp_remaining >= 0),

  -- 개설 시점에 얼어붙는 규칙 스냅샷
  max_participants integer not null default 20 check (max_participants >= 1),
  max_attempts_per_user integer not null default 5 check (max_attempts_per_user >= 1),
  max_damage_per_run bigint not null check (max_damage_per_run > 0),
  run_cooldown_seconds integer not null default 10 check (run_cooldown_seconds >= 0),
  gimmick_points jsonb not null default '{}'::jsonb,
  reward_pool jsonb not null default '{}'::jsonb,

  participant_count integer not null default 0,
  status text not null default 'open'
    check (status in ('open', 'cleared', 'settled', 'expired')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  cleared_at timestamptz,
  settled_at timestamptz
);

create trigger raid_instances_set_updated_at
  before update on public.raid_instances
  for each row execute function public.set_updated_at();

create index raid_instances_open_idx
  on public.raid_instances(expires_at) where status = 'open';
create index raid_instances_raid_id_idx on public.raid_instances(raid_id, status);
create index raid_instances_opener_idx on public.raid_instances(opener_user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 2. raid_participants — 참가자별 누적(보상 계산의 근거).
-- ----------------------------------------------------------------------------
create table public.raid_participants (
  raid_id uuid not null references public.raid_instances(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null, -- 위와 같은 이유로 스냅샷

  damage_total bigint not null default 0 check (damage_total >= 0),
  gimmick_points integer not null default 0 check (gimmick_points >= 0),
  -- 이미 인정받은 기믹 id — 같은 기믹을 반복 신고해 점수를 긁는 걸 막는다.
  gimmick_ids text[] not null default '{}',
  contribution bigint not null default 0, -- damage_total + gimmick_points

  attempts integer not null default 0,
  last_run_at timestamptz,

  reward_snapshot jsonb, -- 정산 시 확정(수령 전에도 화면에 보여줄 수 있게)
  reward_claimed boolean not null default false,
  reward_claimed_at timestamptz,

  joined_at timestamptz not null default now(),
  primary key (raid_id, user_id)
);

create index raid_participants_user_idx on public.raid_participants(user_id, joined_at desc);
-- 기여도 순위표(레이드 상세 화면의 핵심 UI).
create index raid_participants_rank_idx on public.raid_participants(raid_id, contribution desc);

-- ----------------------------------------------------------------------------
-- 3. raid_runs — 런 단위 원장(추가 전용, 감사용).
--    누적치(raid_participants)와 분리하는 이유: 누적치는 보상이 읽는 작고
--    공개된 값이고, 원장은 "이 데미지가 어디서 나왔나"를 관리자가 들여다보는
--    비공개 기록이다.
-- ----------------------------------------------------------------------------
create table public.raid_runs (
  id uuid primary key default gen_random_uuid(),
  raid_id uuid not null references public.raid_instances(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  -- ★ 이 런의 근거가 된 전투 기록. 데미지는 파라미터가 아니라 여기서 읽는다.
  battle_log_id uuid references public.battle_logs(id) on delete set null,

  reported_damage bigint not null check (reported_damage >= 0), -- 로그에서 읽은 원본
  applied_damage bigint not null check (applied_damage >= 0),   -- 클램프 후 실반영값
  gimmick_ids text[] not null default '{}',
  gimmick_points_awarded integer not null default 0,
  outcome text,
  turns_elapsed integer,
  created_at timestamptz not null default now()
);

-- 전투 로그 1건은 레이드 런 1회에만 — 같은 승리를 반복 제출하는 걸 막는다.
create unique index raid_runs_battle_log_once_idx
  on public.raid_runs(battle_log_id) where battle_log_id is not null;
create index raid_runs_raid_idx on public.raid_runs(raid_id, created_at desc);
create index raid_runs_user_idx on public.raid_runs(user_id, created_at desc);
-- 관리자용 이상치 조회.
create index raid_runs_audit_idx on public.raid_runs(raid_id, reported_damage desc);

-- ----------------------------------------------------------------------------
-- 4. RLS — 읽기만, 쓰기 정책 없음(0026과 같은 원칙).
--
--    raid_instances/raid_participants를 넓게 여는 것은 요구사항 그 자체다
--    ("살아있는 레이드는 전부 공유"). 기여도 순위표는 남의 기여도를 보여줘야
--    하는 협동 UI의 핵심이라 좁은 RPC로 감싸도 어차피 전원 목록을 반환하게 되어
--    얻는 게 없다.
--    raid_runs만 본인+관리자로 좁힌다 — 런 단위 감사 데이터라 공개할 이유가 없다.
-- ----------------------------------------------------------------------------
alter table public.raid_instances enable row level security;
alter table public.raid_participants enable row level security;
alter table public.raid_runs enable row level security;

create policy "raid_instances: 로그인 사용자 전체 조회(공개 레이드 목록)"
  on public.raid_instances
  for select using (auth.role() = 'authenticated');

create policy "raid_participants: 로그인 사용자 전체 조회(기여도 순위표)"
  on public.raid_participants
  for select using (auth.role() = 'authenticated');

create policy "raid_runs: 본인 기록만 조회"
  on public.raid_runs
  for select using (auth.uid() = user_id);

create policy "raid_runs: 관리자 전체 조회(이상치 감사)"
  on public.raid_runs
  for select using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 5. open_raid_instance — 소환 아이템을 소모해 인스턴스 개설.
--
--    web/battle-entry.js의 consumeEntryItems()는 select→delete 2단계라
--    원자적이지 않다(두 탭이 동시에 수량 1을 읽고 둘 다 차감할 수 있음).
--    레이드는 남에게 영향을 주므로 여기서는 서버에서 원자적으로 소모한다.
--    일반 전투는 기존 클라이언트 경로를 그대로 둔다 — 의도적 비대칭.
-- ----------------------------------------------------------------------------
create or replace function public.open_raid_instance(p_raid_id text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_def jsonb;
  v_username text;
  v_wid uuid;
  v_qty integer;
  v_summon text;
  v_id uuid;
begin
  if v_uid is null then raise exception '로그인이 필요합니다.'; end if;

  select data -> p_raid_id into v_def
    from public.game_content where key = 'raidTable';
  if v_def is null then raise exception '존재하지 않는 레이드입니다.'; end if;

  v_summon := v_def ->> 'summonItem';
  if v_summon is null then raise exception '레이드 정의에 소환 아이템이 없습니다.'; end if;

  -- 소환 아이템 원자적 소모 — 수량이 가장 적은 스택부터(잔량 정리 겸).
  update public.warehouse_items
     set quantity = quantity - 1
   where id = (
     select id from public.warehouse_items
      where user_id = v_uid and name = v_summon and held_by is null and quantity > 0
      order by quantity
      limit 1
      for update skip locked
   )
  returning id, quantity into v_wid, v_qty;
  if not found then raise exception '"%" 이(가) 필요합니다.', v_summon; end if;
  if v_qty = 0 then delete from public.warehouse_items where id = v_wid; end if;

  select username into v_username from public.profiles where user_id = v_uid;

  insert into public.raid_instances (
    raid_id, battle_id, name, opener_user_id, opener_username,
    boss_max_hp, boss_hp_remaining,
    max_participants, max_attempts_per_user, max_damage_per_run, run_cooldown_seconds,
    gimmick_points, reward_pool, expires_at
  ) values (
    p_raid_id,
    v_def ->> 'battleId',
    coalesce(v_def ->> 'name', p_raid_id),
    v_uid, coalesce(v_username, '알 수 없음'),
    (v_def ->> 'bossMaxHp')::bigint,
    (v_def ->> 'bossMaxHp')::bigint,
    coalesce((v_def ->> 'maxParticipants')::integer, 20),
    coalesce((v_def ->> 'maxAttemptsPerUser')::integer, 5),
    coalesce((v_def ->> 'maxDamagePerRun')::bigint, (v_def ->> 'bossMaxHp')::bigint),
    coalesce((v_def ->> 'runCooldownSeconds')::integer, 10),
    coalesce(v_def -> 'gimmickPoints', '{}'::jsonb),
    coalesce(v_def -> 'rewardPool', '{}'::jsonb),
    now() + make_interval(hours => coalesce((v_def ->> 'durationHours')::integer, 72))
  ) returning id into v_id;

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. _settle_raid_rewards — 처치된 레이드의 보상 확정(멱등, 내부 전용).
--
--    골드 분배는 단순 floor()가 아니라 최대잉여법(largest remainder)을 쓴다.
--    floor()만 쓰면 나머지가 그냥 증발해서 "총 보상 50만"이라고 표시해놓고
--    실제 지급 합계가 그보다 적어진다. 나머지는 기여도 높은 순으로 1G씩 배분.
-- ----------------------------------------------------------------------------
create or replace function public._settle_raid_rewards(p_raid_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_r public.raid_instances;
  v_total bigint;
  v_pool_gold bigint;
  v_assigned bigint := 0;
  v_remainder bigint;
  v_p record;
begin
  select * into v_r from public.raid_instances where id = p_raid_id for update;
  if not found or v_r.status <> 'cleared' or v_r.settled_at is not null then
    return; -- 멱등
  end if;

  select coalesce(sum(contribution), 0) into v_total
    from public.raid_participants where raid_id = p_raid_id;
  v_pool_gold := coalesce((v_r.reward_pool ->> 'gold')::bigint, 0);

  if v_total > 0 and v_pool_gold > 0 then
    -- 1차: 내림 배분
    for v_p in
      select user_id, contribution from public.raid_participants
       where raid_id = p_raid_id order by contribution desc, user_id
    loop
      update public.raid_participants
         set reward_snapshot = jsonb_build_object(
               'gold', (v_pool_gold * v_p.contribution) / v_total,
               'items', coalesce(v_r.reward_pool -> 'items', '[]'::jsonb))
       where raid_id = p_raid_id and user_id = v_p.user_id;
      v_assigned := v_assigned + (v_pool_gold * v_p.contribution) / v_total;
    end loop;

    -- 2차: 남은 나머지를 기여도 높은 순으로 1G씩
    v_remainder := v_pool_gold - v_assigned;
    for v_p in
      select user_id from public.raid_participants
       where raid_id = p_raid_id order by contribution desc, user_id
       limit greatest(v_remainder, 0)
    loop
      update public.raid_participants
         set reward_snapshot = jsonb_set(reward_snapshot, '{gold}',
               to_jsonb((reward_snapshot ->> 'gold')::bigint + 1))
       where raid_id = p_raid_id and user_id = v_p.user_id;
    end loop;
  else
    update public.raid_participants
       set reward_snapshot = jsonb_build_object('gold', 0, 'items', '[]'::jsonb)
     where raid_id = p_raid_id;
  end if;

  update public.raid_instances
     set status = 'settled', settled_at = now()
   where id = p_raid_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. submit_raid_run — 도전 결과 제출.
--    ⚠ 데미지 인자가 없다. 호출자가 방금 저장한 battle_logs에서 읽는다.
-- ----------------------------------------------------------------------------
create or replace function public.submit_raid_run(
  p_raid_instance_id uuid,
  p_battle_log_id uuid,
  p_gimmick_ids text[] default '{}'
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_r public.raid_instances;
  v_log public.battle_logs;
  v_part public.raid_participants;
  v_username text;
  v_reported bigint;
  v_applied bigint;
  v_new_gimmicks text[];
  v_award integer := 0;
  v_is_new boolean := false;
  v_cleared boolean := false;
begin
  if v_uid is null then raise exception '로그인이 필요합니다.'; end if;

  select * into v_r from public.raid_instances where id = p_raid_instance_id for update;
  if not found then raise exception '레이드를 찾을 수 없습니다.'; end if;
  if v_r.status <> 'open' then raise exception '이미 종료된 레이드입니다.'; end if;
  if v_r.expires_at <= now() then
    update public.raid_instances set status = 'expired' where id = p_raid_instance_id;
    raise exception '만료된 레이드입니다.';
  end if;

  -- 전투 기록은 반드시 호출자 본인 것이어야 하고(소유권도 auth.uid()로),
  -- 이 레이드의 실제 편성에서 나온 것이어야 한다.
  select * into v_log from public.battle_logs
   where id = p_battle_log_id and user_id = v_uid;
  if not found then raise exception '전투 기록을 찾을 수 없습니다.'; end if;
  if v_log.battle_id is distinct from v_r.battle_id then
    raise exception '이 레이드의 전투 기록이 아닙니다.';
  end if;

  v_reported := coalesce((v_log.result -> 'damageDealt' ->> 'ally')::bigint, 0);

  select * into v_part from public.raid_participants
   where raid_id = p_raid_instance_id and user_id = v_uid for update;

  if not found then
    v_is_new := true;
    if v_r.participant_count >= v_r.max_participants then
      raise exception '레이드 정원이 찼습니다.';
    end if;
    select username into v_username from public.profiles where user_id = v_uid;
    insert into public.raid_participants (raid_id, user_id, username)
    values (p_raid_instance_id, v_uid, coalesce(v_username, '알 수 없음'))
    returning * into v_part;
    update public.raid_instances
       set participant_count = participant_count + 1
     where id = p_raid_instance_id;
  end if;

  if v_part.attempts >= v_r.max_attempts_per_user then
    raise exception '이 레이드에서의 도전 횟수를 모두 사용했습니다.';
  end if;
  if v_part.last_run_at is not null
     and now() - v_part.last_run_at < make_interval(secs => v_r.run_cooldown_seconds) then
    raise exception '아직 다시 도전할 수 없습니다.';
  end if;

  -- 기믹: 아직 인정 안 된 것만, 그리고 서버 배점표에 실제로 있는 id만.
  v_new_gimmicks := array(
    select g from unnest(coalesce(p_gimmick_ids, '{}')) as g
     where g <> all(v_part.gimmick_ids)
       and v_r.gimmick_points ? g
  );
  select coalesce(sum((v_r.gimmick_points ->> g)::integer), 0) into v_award
    from unnest(v_new_gimmicks) as g;

  -- 클램프(거절이 아니라) — 정직한 대박 런도 상한까지는 인정해준다.
  v_applied := least(v_reported, v_r.max_damage_per_run, v_r.boss_hp_remaining);

  update public.raid_instances
     set boss_hp_remaining = boss_hp_remaining - v_applied
   where id = p_raid_instance_id
  returning boss_hp_remaining = 0 into v_cleared;

  update public.raid_participants
     set damage_total = damage_total + v_applied,
         gimmick_points = gimmick_points + v_award,
         gimmick_ids = gimmick_ids || v_new_gimmicks,
         contribution = damage_total + v_applied + gimmick_points + v_award,
         attempts = attempts + 1,
         last_run_at = now()
   where raid_id = p_raid_instance_id and user_id = v_uid;

  insert into public.raid_runs (
    raid_id, user_id, battle_log_id, reported_damage, applied_damage,
    gimmick_ids, gimmick_points_awarded, outcome, turns_elapsed
  ) values (
    p_raid_instance_id, v_uid, p_battle_log_id, v_reported, v_applied,
    v_new_gimmicks, v_award, v_log.outcome, v_log.turns_elapsed
  );

  if v_cleared then
    update public.raid_instances
       set status = 'cleared', cleared_at = now()
     where id = p_raid_instance_id;
    -- 참가자 집합이 확정되는 바로 그 순간에 같은 트랜잭션 안에서 정산.
    perform public._settle_raid_rewards(p_raid_instance_id);
  end if;

  return jsonb_build_object(
    'appliedDamage', v_applied,
    'reportedDamage', v_reported,
    'gimmickPointsAwarded', v_award,
    'bossHpRemaining', greatest(v_r.boss_hp_remaining - v_applied, 0),
    'bossMaxHp', v_r.boss_max_hp,
    'cleared', v_cleared
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. claim_raid_rewards — 보상 수령.
--    정산 시점에 자동 지급하지 않고 수령 단계를 둔 이유: 비동기 모델이라
--    정산 순간 참가자 대부분이 접속 중이 아니다. 수령을 거치면 골드가
--    "그 사람의 클라이언트가 켜져 있고 곧바로 profiles.gold를 다시 읽는"
--    시점에 들어와서, 상점 등의 절대값 덮어쓰기와 충돌할 여지가 줄어든다
--    (0026 헤더의 선행 수정 항목 참고).
-- ----------------------------------------------------------------------------
create or replace function public.claim_raid_rewards(p_raid_instance_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_part public.raid_participants;
  v_gold bigint;
  v_item jsonb;
begin
  if v_uid is null then raise exception '로그인이 필요합니다.'; end if;

  select * into v_part from public.raid_participants
   where raid_id = p_raid_instance_id and user_id = v_uid
   for update;
  if not found then raise exception '이 레이드에 참가하지 않았습니다.'; end if;
  if v_part.reward_snapshot is null then raise exception '아직 정산되지 않았습니다.'; end if;
  if v_part.reward_claimed then raise exception '이미 보상을 수령했습니다.'; end if;

  v_gold := coalesce((v_part.reward_snapshot ->> 'gold')::bigint, 0);
  if v_gold > 0 then
    update public.profiles set gold = gold + v_gold where user_id = v_uid;
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(v_part.reward_snapshot -> 'items', '[]'::jsonb))
  loop
    perform public._grant_item_snapshot(v_uid, v_item);
  end loop;

  update public.raid_participants
     set reward_claimed = true, reward_claimed_at = now()
   where raid_id = p_raid_instance_id and user_id = v_uid;

  return jsonb_build_object('gold', v_gold, 'items', coalesce(v_part.reward_snapshot -> 'items', '[]'::jsonb));
end;
$$;

-- ----------------------------------------------------------------------------
-- 9. expire_raid_instances — 만료 스위퍼(0026과 같은 지연 정산 방식).
--
--    ⚠ 미해결 정책: 실패한(만료된) 레이드의 기여도를 어떻게 할 것인가.
--    지금은 보상 없음 + 소환 아이템도 돌려주지 않음으로 둔다 — 실패가 실제
--    손실이어야 공유 HP 풀에 긴장이 생기기 때문. 위로 보상(기여도 비례 일부
--    지급)으로 바꾸고 싶으면 여기서 _settle_raid_rewards를 축소 호출하면 됨.
--    사용자 확인 필요.
-- ----------------------------------------------------------------------------
create or replace function public.expire_raid_instances(p_limit integer default 50)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
  v_n integer := 0;
begin
  for v_id in
    select id from public.raid_instances
     where status = 'open' and expires_at <= now()
     order by expires_at
     limit greatest(1, least(p_limit, 500))
     for update skip locked
  loop
    update public.raid_instances set status = 'expired' where id = v_id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- ----------------------------------------------------------------------------
-- 10. 실행 권한.
-- ----------------------------------------------------------------------------
revoke all on function public._settle_raid_rewards(uuid) from public, anon, authenticated;

revoke all on function public.open_raid_instance(text) from public, anon;
revoke all on function public.submit_raid_run(uuid, uuid, text[]) from public, anon;
revoke all on function public.claim_raid_rewards(uuid) from public, anon;
revoke all on function public.expire_raid_instances(integer) from public, anon;

grant execute on function public.open_raid_instance(text) to authenticated;
grant execute on function public.submit_raid_run(uuid, uuid, text[]) to authenticated;
grant execute on function public.claim_raid_rewards(uuid) to authenticated;
grant execute on function public.expire_raid_instances(integer) to authenticated;
