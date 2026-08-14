-- ============================================================================
-- characters.key_items 추가 (2026-08-14)
--
-- character-sheet.html의 keyItems(전직 조건 판정용 개인 플래그, 문자열
-- 배열)가 0001의 characters 컬럼 목록에 빠져 있었다. learned_skill_names와
-- 같은 text[] 컬럼으로 추가.
-- ============================================================================

alter table public.characters add column key_items text[] not null default '{}';
