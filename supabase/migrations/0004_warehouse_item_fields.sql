-- ============================================================================
-- warehouse_items 누락 필드 추가 (2026-08-14)
--
-- 발견 경위: roster-index.html을 Supabase 기반으로 전환하는 작업 중,
-- 캐릭터 카드의 Max HP/SP·패턴 슬롯 수 추정에 쓰이는 장비 필드
-- (patternSlotBonus/statRealBonus 등)가 0001의 warehouse_items 컬럼
-- 목록에 빠져 있는 걸 발견함. web/battle-adapter.js(로스터/몬스터 데이터를
-- src/ 엔진 객체로 바꾸는 유일한 다리, CLAUDE.md 참조)를 다시 확인한 결과
-- statRealBonus/critMultiplier/conditionalPassiveMods/grantsResource가
-- 실제 전투 수치 계산에 쓰이고, character-sheet.html/item.html은 추가로
-- patternSlotBonus/equipmentType/avatarPortrait/grantsSkill/consumable/
-- usesPerBattle을 읽으며, refinery.html이 쓰는 enhanceable도 빠져 있었음.
--
-- web/shop.html의 구매 확정 로직—
--   const { name, category, price, ...spec } = it;
--   warehouse.push({ name, category, quantity: qty, ...spec });
-- — 이 아이템 정의의 모든 필드를 그대로 펼쳐서 저장하는 방식이라, 컬럼을
-- 하나라도 빠뜨리면 그 필드는 조용히 유실된다. CLAUDE.md에 이미 기록된
-- 과거 버그("예전엔 name/category/quantity만 저장돼서 장착해도 스탯이
-- 0이 되는 문제")와 정확히 같은 패턴이 스키마 레벨에서 재발할 뻔한 것.
--
-- 저장 방식은 사용자와 상의해서 "타입 컬럼을 전부 추가" 쪽으로 결정함(JSONB
-- 한 덩어리로 통합하는 대안도 검토했으나 기각) — Postgres 컬럼은 기본이
-- NULL 허용이라 "장비가 아닌 아이템엔 필요 없는 수치"·"장비여도 모든
-- 필드가 채워질 필요는 없음"이 컬럼 방식으로도 자연히 만족되기 때문
-- (지금 combat_real/stat_bonus/max_hp_bonus 등 기존 컬럼도 이미 그렇게
-- 동작 중 — 강제로 채울 필요 없이 비워두면 됨).
--
-- 지금 시드 데이터(shop.html/monster-roster.html) 어디에도 이 필드들을
-- 쓰는 아이템은 아직 없지만, 코드 경로(battle-adapter.js 등)는 이미
-- 이 필드들을 실제로 읽고 있으므로 스키마가 먼저 지원해둬야 함 — 나중에
-- 이 필드를 쓰는 아이템이 추가돼도 조용히 유실되지 않도록.
--
-- 패턴 메모: 앞으로 다른 페이지를 전환하다가 또 빠진 필드가 나오면, 이
-- 파일처럼 nullable 컬럼을 추가하는 작은 마이그레이션(000N)으로 잡으면 됨
-- — 이미 적용된 0001~0003은 고치지 않는다는 원칙 계속 유지.
-- ============================================================================

alter table public.warehouse_items
  add column stat_real_bonus jsonb,
  add column pattern_slot_bonus integer,
  add column crit_multiplier numeric,
  add column conditional_passive_mods jsonb,
  add column grants_resource jsonb,
  add column equipment_type text,
  add column avatar_portrait text,
  add column grants_skill text,
  add column consumable boolean,
  add column uses_per_battle integer,
  add column enhanceable boolean;
