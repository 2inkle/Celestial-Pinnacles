-- ============================================================================
-- 0033_adjust_gold_rpc.sql — 골드를 "절대값 덮어쓰기"가 아니라 "증감치 원자
-- 적용"으로 바꾸는 RPC 신설.
--
-- 배경: CLAUDE.md "타 플레이어 상호작용" 섹션에 이미 기록돼 있던 알려진
-- 버그 — shop.html/battle-view.html/dispatch.html 등 골드가 바뀌는 모든
-- 곳이 "①페이지 로드 시 gold를 한 번 읽어 currentGold에 캐시 → ②그 값에
-- ±증감분을 더해 새 절대값을 계산 → ③그 절대값을 그대로 update"하는
-- 3단계 패턴을 씀. 그 사이(①~③) 다른 경로(경매장 낙찰·다른 탭·서버
-- RPC)로 골드가 바뀌면, ③이 그 외부 변동분을 통째로 덮어써서 지운다.
-- 사용자 결정(2026-09-09): "행동마다 절대값을 쏘지 말고, 그 행동이
-- 만드는 증감분만 서버에 보내고, 서버가 원자적으로 gold+=delta를 적용
-- 하되 delta가 음수일 때 마이너스로 내려가지 않게 방어하자."
--
-- ── 구현 ────────────────────────────────────────────────────────────────
-- `adjust_gold(p_delta)` 하나로 게임의 모든 골드 증감(구매/판매/전투 보상/
-- 파견 보상/고용비/강화비/감정비/퀘스트 보상/튜토리얼 보상)을 통일한다.
-- 단일 UPDATE 문 안에서 "gold + delta >= 0"까지 함께 검사하므로 read-then-
-- write 사이의 경쟁 창 자체가 없다(Postgres 행 잠금이 UPDATE 문 하나의
-- 생명주기 안에서만 걸리므로) — 이게 클라이언트가 미리 currentGold를 읽어
-- "이 정도면 충분하겠지"라고 판단하는 것보다 근본적으로 안전한 이유.
-- 조건을 만족 못 하면(행이 매치 안 되면) `v_new_gold`가 NULL로 남고,
-- 그걸 골드 부족으로 판정해 명시적 예외를 던진다 — 호출부가
-- `error.message`로 "insufficient_gold"를 그대로 받아 기존 "골드가
-- 부족합니다" 문구를 재사용할 수 있게 함.
--
-- ── auth.uid()로만 행위자를 판별(파라미터로 안 받음) ─────────────────────
-- 경매장 RPC(0026)와 같은 원칙 — 대상 유저를 인자로 받으면 사칭이
-- 가능해지므로, 항상 함수 안에서 `auth.uid()`로 "나 자신"만 갱신한다.
-- ============================================================================

create or replace function public.adjust_gold(p_delta integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_gold integer;
begin
  update public.profiles
  set gold = gold + p_delta
  where user_id = auth.uid()
    and gold + p_delta >= 0
  returning gold into v_new_gold;

  if v_new_gold is null then
    raise exception 'insufficient_gold';
  end if;

  return v_new_gold;
end;
$$;

grant execute on function public.adjust_gold(integer) to authenticated;
