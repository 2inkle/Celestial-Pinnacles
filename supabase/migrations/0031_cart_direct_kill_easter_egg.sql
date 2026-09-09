-- ============================================================================
-- 0031_cart_direct_kill_easter_egg.sql — "불길한 마력 파편"을 보물상자가
-- 아니라 "고블린 마차를 직접 처치했을 때"만 확정 드랍하도록 이전
--
-- 배경: 고블린 마차(goblin_cart)는 원래 "직접 처치 불가" 컨셉이다 —
-- HP 50% 이하가 되면 대사→보물상자 생성→자폭(RETREAT류 연출)이 체인으로
-- 발동해서, 정상적인 공략으로는 마차 본체를 죽일 수 없고 항상 이 스크립트로
-- 마무리된다(src/engine.js:340-373 executeAction, 패턴은 마차 "자기 턴"에만
-- 평가됨). 그런데 엔진 구조상 아군의 한 타격(또는 한 턴 다단히트 합산)이
-- 그 순간 마차의 잔여 HP를 한 번에 0 이하로 만들면, 마차는 다음 자기 턴을
-- 받지 못해 저 체인이 아예 발동하지 못하고 "그냥" 죽는다(isAlive은
-- currentHp>0 하나로 즉시 판정되고, checkForDeaths()가 매 유닛 행동 직후
-- 곧바로 도는 구조라 죽음 처리가 마차의 다음 턴보다 먼저 확정됨). 사용자가
-- 실전 공략 중 이 현상을 몇 차례 관측해서 원인을 물어봤고(정확한 조건: 그
-- 타격 시점의 마차 잔여 HP 이상의 화력이 한 번에 들어갈 때, HP 몇 %인지와
-- 무관하게 발생), 조사 결과를 들은 뒤 이 "우연한 처치 가능성"을 정식
-- 이스터에그로 승격시키기로 결정함.
--
-- 새 설계: "불길한 마력 파편"(AFTERMATH="???"전 입장권)을 보물상자의 30%
-- 확률 드랍에서 빼고, 대신 **마차 본체를 직접 처치했을 때만 확정(100%)
-- 드랍**하도록 옮김. 정상적인 공략(퇴각→보물상자를 부숴 마무리)으로는 이제
-- 이 아이템을 얻을 수 없다 — "마차는 원래 처치 불가"라는 세계관을 곧이곧대로
-- 믿은 플레이어는 절대 못 얻고, "정말 안 죽는지" 화력으로 직접 시험해본
-- 플레이어만 우연히 얻게 되는 구조. 이후 레벨 상한 해방에 "???"전 승리가
-- 필요해질 예정이므로, 그 시작점 자체가 하나의 비밀로 남는다(사용자 의도).
--
-- 0028/0029/0030과 동일한 정밀 병합 패턴 — monsterRoster 배열 전체를 다시
-- 쓰지 않고 id가 goblin_cart인 원소 하나만 찾아 두 가지를 함께 적용:
--   1) rewardObjectSpec.dropTable에서 "불길한 마력 파편" 항목 제거
--   2) 마차 본체(top-level)의 dropTable을 확정 100% 드랍 1건으로 설정
-- 둘 다 jsonb_set(교체)이지 append가 아니므로 재실행해도 안전(멱등) —
-- 0029(append라 재실행 시 중복 위험)와는 다른 패턴임에 유의.
-- ============================================================================

update public.game_content
set
  data = (
    select coalesce(jsonb_agg(
      case when elem->>'id' = 'goblin_cart'
        then jsonb_set(
          jsonb_set(
            elem,
            '{rewardObjectSpec,dropTable}',
            coalesce((
              select jsonb_agg(d)
              from jsonb_array_elements(elem->'rewardObjectSpec'->'dropTable') d
              where d->>'name' <> '불길한 마력 파편'
            ), '[]'::jsonb)
          ),
          '{dropTable}',
          jsonb_build_array(
            jsonb_build_object(
              'name', '불길한 마력 파편',
              'category', 'keyItem',
              'chance', 1.0,
              'quantity', jsonb_build_array(1, 1)
            )
          )
        )
        else elem
      end
    ), '[]'::jsonb)
    from jsonb_array_elements(data) elem
  ),
  version = '2026-09-07a'
where key = 'monsterRoster';
