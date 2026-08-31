// ============================================================================
// 원자재 카탈로그(MATERIAL_TABLE) + 제작 레시피(RECIPE_TABLE)
//
// craft-materials.js의 CRAFT_MATERIAL_TABLE("개조" 전용 — 장비 하나에 소재
// 하나를 얹어 성격을 바꿈)과는 완전히 별개 시스템이다. 여기는 "신규 제작" —
// 재료 여러 개를 소모해서 장비를 처음부터 만들어냄. 두 시스템은 재료 이름이
// 겹칠 수 있음(예: "고블린의 이빨"은 개조 소재로도, 제작 재료로도 쓰임 —
// 그 자체가 의도임, 같은 파밍 타겟이 두 가지 쓸모를 갖게 하려는 것).
//
// ── 설계 방향(2026-08-17, 사용자 지시) ──────────────────────────────────
// 고블린 장비(이 빠진 도끼/주술사의 나뭇가지/수문장의 방패/섭정의 인장/
// 왕의 대검)는 지금까지 해당 몬스터를 직접 잡아 저확률로 드랍받는 것 외에는
// 얻을 방법이 없었다. 이 레시피들은 "일반 원자재(나무/돌/광석) + 고블린
// 테마 특산품(고블린의 이빨/마력 가루/은빛 성채 열쇠/왕관 조각 — 전부
// 이미 존재하는 개조용 소재를 그대로 재사용)"을 조합해서 그 장비들을
// 직접 만들 수 있게 한다 — 저확률 드랍만 바라보지 않고도, 강화까지 고려한
// 장비 확보 계획을 세울 수 있게 하려는 목적. 수량은 첫 시도값이라 밸런스
// 조정 여지가 있음.
// ============================================================================

const MATERIAL_TABLE = {
  "나무": { label: "나무", flavor: "고블린 마을 주변 숲에서 흔히 구할 수 있는 재목." },
  "돌": { label: "돌", flavor: "성채 주변에 굴러다니는 잡석. 가공하면 제법 단단하다." },
  "광석": { label: "광석", flavor: "고블린들이 캐낸 금속 원석. 무기와 갑옷의 뼈대가 된다." },
  // 동굴(1티어) 상위 재료 — "돌"/"광석"보다 한 단계 위, 다음 파밍 단계
  // ("철 기반 아이템 — 무겁지만 성능 우수")로 이어지는 떡밥(2026-08-31,
  // CLAUDE.md "동굴 저층 실제 데이터 작성" 참고).
  "철광석": { label: "철광석", flavor: "동굴 깊은 곳에서만 나는 무거운 원석. 일반 광석보다 훨씬 단단하다." },
  "정동석": { label: "정동석", flavor: "속이 결정으로 가득 찬 희귀한 돌. 무게가 상당해 다루기 까다롭다." },
};

// result는 해당 몬스터 dropTable에 실제로 등록된 장비 스펙과 완전히 동일하게
// 맞춤(web/monster-roster.html의 goblin_warrior/goblin_shaman/goblin_elite_guard/
// goblin_regent/goblin_king dropTable 참조) — 드랍으로 얻든 제작으로 얻든
// 같은 물건이어야 하므로.
const RECIPE_TABLE = {
  "이 빠진 도끼": {
    category: "무기",
    materials: [
      { name: "나무", quantity: 2 },
      { name: "돌", quantity: 2 },
      { name: "고블린의 이빨", quantity: 3 },
    ],
    result: {
      name: "이 빠진 도끼", category: "equipment", enhanceable: true,
      slot: "mainhand", equipmentType: "axe",
      combatReal: { atk: 22 }, weight: 0,
    },
  },
  "주술사의 나뭇가지": {
    category: "무기",
    materials: [
      { name: "나무", quantity: 3 },
      { name: "마력 가루", quantity: 2 },
    ],
    result: {
      name: "주술사의 나뭇가지", category: "equipment", enhanceable: true,
      slot: "mainhand", equipmentType: "wand",
      combatReal: { atk: 1, matk: 17 }, weight: 0,
    },
  },
  "수문장의 방패": {
    category: "방어구",
    materials: [
      { name: "돌", quantity: 3 },
      { name: "광석", quantity: 2 },
      { name: "고블린의 이빨", quantity: 2 },
    ],
    result: {
      name: "수문장의 방패", category: "equipment", enhanceable: true,
      slot: "subhand", equipmentType: "shield",
      combatReal: { def: 17, mdef: 12 }, combatBonus: { def: 32, mdef: 26 },
      weight: 1, passiveBonus: { completeDefenseChancePct: 10 },
    },
  },
  "섭정의 인장": {
    category: "장신구",
    materials: [
      { name: "광석", quantity: 2 },
      { name: "왕관 조각", quantity: 1 },
    ],
    result: {
      name: "섭정의 인장", category: "equipment", enhanceable: true,
      slot: "jItem",
      combatReal: { mdef: 11 }, combatBonus: { mdef: 17 }, weight: 0,
    },
  },
  "왕의 대검": {
    category: "무기",
    materials: [
      { name: "광석", quantity: 6 },
      { name: "돌", quantity: 3 },
      { name: "왕관 조각", quantity: 2 },
    ],
    result: {
      name: "왕의 대검", category: "equipment", enhanceable: true,
      slot: "mainhand", equipmentType: "greatsword",
      combatReal: { atk: 97, def: 8, mdef: 4 }, combatBonus: { def: 72, mdef: 59 },
      weight: 2, twoHanded: true,
    },
  },
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = { MATERIAL_TABLE, RECIPE_TABLE };
}
if (typeof window !== "undefined") {
  window.MATERIAL_TABLE = MATERIAL_TABLE;
  window.RECIPE_TABLE = RECIPE_TABLE;
}
