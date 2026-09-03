-- ============================================================================
-- 0029_king_drops_raid_summon.sql — "심층의 부름"(레이드 소환 아이템)을
-- 고블린의 왕 드랍테이블에 아주 낮은 확률로 추가
--
-- 배경: 0028이 raidTable에 "심층의 부름"을 소환 아이템으로 지정해뒀지만
-- 획득 경로가 없었다(CLAUDE.md "레이드 기믹 판정 로직" 섹션의 다음 세션
-- TODO 참고). 사용자 결정(2026-08-31): "보스 드랍 아이템 중에서도 아주 낮은
-- 확률로 드랍되도록 하겠다." 지금 실제 dropTable을 가진 보스는 고블린의 왕
-- (0-tier)뿐이라 여기 붙임 — 동굴 5층 보스가 생기면 그쪽에도 추가할 수 있음.
--
-- 확률 0.02(2%)는 기존 이 보스의 가장 희귀한 항목("오래된 바퀴 자국" 0.12,
-- "왕의 대검" 0.15)보다 뚜렷하게 낮게 잡음 — 레이드를 여는 열쇠라는 무게에
-- 맞춤. category는 "consumable"(0027 헤더에서 이미 확정한 이유: keyItem이면
-- 경매 거래에서 제외되는데, "양산 가능한 인스턴스제"라면 소환서 자체가
-- 거래돼야 시장이 형성된다).
--
-- ⚠ 파견의 LOOT_DIVISOR 구조 결함(CLAUDE.md "[P0] 파견 전리품 정산" 섹션)이
-- 아직 안 고쳐진 채로 남아있다 — 고블린의 왕은 파견 2000턴 예산 안에서
-- 300회 이상 반복 조우되므로, 이 확률(0.02)도 파견으로 반복 파밍하면
-- 원본 누적량이 100을 넘어 사실상 확정 획득이 될 위험이 있다. 레이드
-- 소환 아이템처럼 "희귀해야 의미 있는" 재료를 새로 추가할 때마다 이
-- 구조적 위험이 반복된다는 걸 다시 한번 남겨둔다 — dispatch loot 구조
-- 개편이 먼저 됐어야 할 이유가 여기서도 드러남.
--
-- 0023/0024와 같은 정밀 병합 패턴 — monsterRoster 배열 전체를 다시 쓰지
-- 않고 id가 goblin_king인 원소 하나만 찾아 dropTable에 항목 하나를 이어붙임.
-- 재실행해도 매번 추가되므로(멱등 아님) 한 번만 실행할 것.
-- ============================================================================

update public.game_content
set
  data = (
    select coalesce(jsonb_agg(
      case when elem->>'id' = 'goblin_king'
        then jsonb_set(
          elem,
          '{dropTable}',
          (elem->'dropTable') || jsonb_build_array(
            jsonb_build_object(
              'name', '심층의 부름',
              'category', 'consumable',
              'chance', 0.02,
              'quantity', jsonb_build_array(1, 1)
            )
          )
        )
        else elem
      end
    ), '[]'::jsonb)
    from jsonb_array_elements(data) elem
  ),
  version = '2026-08-31c'
where key = 'monsterRoster';
