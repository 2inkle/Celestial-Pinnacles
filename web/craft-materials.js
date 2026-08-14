// ============================================================================
// 제작 소재 정의 (CRAFT_MATERIAL_TABLE)
//
// 장비 제작/개조에 소재를 "하나만" 넣을 수 있고, 그 소재가 결과물에 고정된
// 효과를 얹음. 같은 소재는 언제나 같은 효과 — 개체별 편차는 없음(장비 성능의
// 랜덤성은 레어드랍과 강화 두 축이 이미 담당하므로, 소재까지 랜덤이면
// 삼중 랜덤이 되어 빌드를 의도적으로 설계할 수 없게 됨).
//
// ── 설계 원칙: 이득에는 대가가 따른다 ──────────────────────────────────
// 소재 효과를 순수 이득으로만 두면, 소재를 넣은 장비가 항상 상위 호환이 되어
// 다음 티어에 어느 수준의 장비를 줘야 할지 계산이 무너짐(티어 인플레).
// 그래서 각 소재는 "그 소재답게" 한쪽을 올리는 대신 다른 쪽을 깎음 —
// 수치를 억지로 낮추는 대신 개성으로 균형을 잡는 방식.
//   · 이빨   가볍고 날카롭다      → ATK↑ 내구(DEF)↓
//   · 마력가루 마력이 스며든다    → MATK↑ 물리방어↓
//   · 성채열쇠 무겁고 단단하다    → DEF↑↑ ATK↓ 무게↑
//   · 왕관조각 왕의 위엄          → 능력치↑ + 세트 부여, 대신 무게↑
//
// modifier는 장비의 필드와 같은 형태로 적으면 그대로 병합됨(음수면 감소).
//
// ── 감정(appraisal) ────────────────────────────────────────────────────
// 감정은 개별 인스턴스 단위이고, 감정비는 오직 희귀도만 반영함(던전 난이도를
// 곱하면 후반에 금액이 터무니없이 커지고, 이 시스템으로 큰 골드 싱크를
// 만들 생각이 없음). 감정하지 않아도 제작에 넣을 수 있음 — 강제가 아니라
// "미리 알아보는 편의"를 사는 것. 남이 공유한 정보를 참고하는 것도
// 유효한 플레이로 봄.
// ============================================================================

const CRAFT_MATERIAL_TABLE = {
  "고블린의 이빨": {
    label: "고블린의 이빨",
    appraisalCost: 50,
    flavor: "가볍고 날카롭다. 잘 파고들지만 손이 베일 만큼 거칠어 다루기 까다롭다.",
    // 흔한 소재라 이득도 소폭. 페널티는 명중률로 — 방어력을 음수로 만들면
    // "받는 피해가 오히려 늘어나는" 부작용이 생기고(realDef가 음수면 데미지
    // 증폭), 무기에 방어 페널티를 붙이는 것도 어색해서 개성에 맞는 축으로 잡음.
    modifier: {
      combatReal: { atk: 3 },
      passiveBonus: { accuracyBonusPct: -3 },
    },
    describe: "ATK +3 / 명중률 -3%",
  },

  "마력 가루": {
    label: "마력 가루",
    appraisalCost: 120,
    flavor: "주술사가 남긴 마력의 잔재. 마법을 잘 실어 나르지만 마력을 계속 빨아들인다.",
    // 마법 화력을 얻는 대신 SP 소모가 늘어남 — 장기전에서 부담이 되는
    // 형태의 페널티라, "짧게 끝낼 수 있는 전투"와 궁합이 갈림.
    modifier: {
      combatReal: { matk: 4 },
      passiveBonus: { spCostReductionPct: -10 },
    },
    describe: "MATK +4 / SP 소모 +10%",
  },

  "은빛 성채 열쇠": {
    label: "은빛 성채 열쇠",
    appraisalCost: 300,
    flavor: "성채의 무쇠를 녹여 만든 열쇠. 단단하지만 다루기 버겁다.",
    // 방어 보너스를 크게 얻는 대신 무겁고 둔해짐. ATK를 깎지 않고 무게와
    // 명중률로 대가를 치르게 해서, 방어구에 붙였을 때 이중 페널티가 되지
    // 않도록 함(무기에 붙이면 무게 때문에 다른 부위를 포기해야 함).
    modifier: {
      combatBonus: { def: 18, mdef: 12 },
      passiveBonus: { accuracyBonusPct: -5 },
      weight: 2,
    },
    describe: "DEF보너스 +18, MDEF보너스 +12 / 명중률 -5%, 무게 +2",
  },

  "왕관 조각": {
    label: "왕관 조각",
    appraisalCost: 800,
    flavor: "고블린 왕관의 파편. 착용자에게 위엄을 나눠주지만, 그 무게도 함께 얹는다.",
    modifier: {
      statBonus: { str: 2, int: 2 },
      maxHpBonus: 40,
      weight: 1,
    },
    setId: "goblin_crown_series", // 이 소재로 만든 장비는 세트에 속함
    describe: "STR +2, INT +2, MaxHP +40, 무게 +1 · [고블린 왕관 시리즈]",
  },
};

// 제작/개조 결과에 소재 modifier를 병합해서 최종 장비를 만듦.
// 같은 키는 더하고(음수면 감소), setId가 있으면 붙임. 무게는 0 밑으로 안 내려감.
function applyCraftMaterial(baseItem, materialName) {
  const mat = CRAFT_MATERIAL_TABLE[materialName];
  if (!mat) return { ...baseItem };

  const result = JSON.parse(JSON.stringify(baseItem));
  const mod = mat.modifier || {};

  ["combatReal", "combatBonus", "statBonus", "statRealBonus", "passiveBonus"].forEach((group) => {
    if (!mod[group]) return;
    result[group] = result[group] || {};
    Object.entries(mod[group]).forEach(([k, v]) => {
      result[group][k] = (result[group][k] || 0) + v;
    });
  });

  ["maxHpBonus", "maxSpBonus", "patternSlotBonus", "critMultiplier"].forEach((k) => {
    if (mod[k] != null) result[k] = (result[k] || 0) + mod[k];
  });

  if (mod.weight != null) result.weight = Math.max(0, (result.weight || 0) + mod.weight);
  if (mat.setId) result.setId = mat.setId;

  // 어떤 소재로 만들었는지 기록 — 표시 이름은 원본 그대로 두되(유저에게는
  // 감추는 게 의도), 창고에서 서로 다른 소재의 동명 장비가 병합되지 않도록
  // 구분하는 키로 씀.
  result.craftMaterial = materialName;
  return result;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { CRAFT_MATERIAL_TABLE, applyCraftMaterial };
}
if (typeof window !== "undefined") {
  window.CRAFT_MATERIAL_TABLE = CRAFT_MATERIAL_TABLE;
  window.applyCraftMaterial = applyCraftMaterial;
}
