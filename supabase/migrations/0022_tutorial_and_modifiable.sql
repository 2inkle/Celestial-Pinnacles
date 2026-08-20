-- ============================================================================
-- 0022_tutorial_and_modifiable.sql — 온보딩(튜토리얼) 진행 상태 + 개조 불가 플래그
--
-- 1) profiles.tutorial_state
--    홈 화면(roster-index.html) 튜토리얼 패널의 "보상 수령 여부"만 기록한다.
--    단계 달성 조건 자체(캐릭터 보유/장비 장착/패턴 작성/전투 클리어)는
--    저장하지 않고 기존 테이블(characters / warehouse_items.held_by /
--    characters.presets / battle_progress)에서 매번 즉석 계산한다 —
--    quest_progress(0020)와 같은 방침. 그래서 별도 테이블 없이 컬럼 하나로 충분.
--    형태: { "<stepId>": { "claimedAt": "<ISO8601>" }, "dismissed": true }
--
-- 2) warehouse_items.modifiable
--    조합공방(workshop.html)의 "개조"는 지금까지 아무 플래그도 보지 않고
--    "미강화 + 미개조 장비"면 전부 대상으로 삼았다. 초심자 세트처럼 강화도
--    개조도 불가능해야 하는 장비를 표현할 방법이 없어서 nullable 컬럼을 추가함.
--    NULL/true = 개조 가능(기존 아이템 전부 그대로), false만 개조 불가.
--    ※ 강화(refinery.html) 쪽은 이미 enhanceable이 opt-in이라 별도 플래그 불필요.
-- ============================================================================

alter table public.profiles
  add column tutorial_state jsonb not null default '{}'::jsonb;

alter table public.warehouse_items
  add column modifiable boolean;
