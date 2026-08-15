-- ============================================================================
-- characters.battle_preset_idx 추가 — "전투에 어떤 패턴 프리셋을 들고 갈지"를
-- 저장할 곳이 아예 없어서, 실전투/파견 양쪽 다 항상 presets[0]으로 고정
-- 동작하고 있었음(battle-view.html의 mapCharacterRow가 activePresetIdx를
-- 아예 안 채워서 항상 undefined -> 0으로 폴백). 사용자 피드백으로 발견.
--
-- character-sheet.html은 이 컬럼을 data.battlePresetIdx로 매핑해서 프리셋
-- 탭에 "이 패턴을 전투에 사용" 토글 UI를 추가하고, battle-view.html/
-- dispatch.html의 mapCharacterRow는 그대로 activePresetIdx 필드명으로
-- 매핑함(battle-adapter.js의 buildAllyFromRoster(c, c.activePresetIdx)가
-- 이미 그 필드명을 읽고 있어서 그쪽 코드는 변경 불필요).
-- ============================================================================

alter table public.characters
  add column battle_preset_idx integer not null default 0;
