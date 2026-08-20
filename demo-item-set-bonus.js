// ============================================================================
// demo-item-set-bonus.js — 세트(시리즈) 보너스가 "실제 전투 캐릭터"에 반영되는지
// 결정적으로 검증.
//
// 왜 필요한가: 2026-08-20 이전까지 세트 보너스는 character-sheet.html 안에서만
// 계산되는 화면 표시 전용이었고, battle-adapter.js의 sumEquipmentCombatStats()는
// setId를 아예 보지 않았다. 즉 "세트 효과"라고 화면에 떠도 전투에서는 아무
// 일도 일어나지 않았음(오래 미해결로 남아있던 항목). web/item-sets.js를 공용
// 모듈로 빼고 어댑터가 읽도록 고쳤으므로, 그게 유지되는지 여기서 지킨다.
//
// 검증 항목:
//   1) 임계값 분기 — 2부위만 장착하면 2세트 티어만, 3부위면 2+3세트 티어 누적
//   2) maxHp/maxSp가 티어 수치만큼 정확히 증가
//   3) real 전투수치(combatReal)/핵심스탯(statBonus·statRealBonus) 반영
//   4) spRegenPerTurn이 영구 activeTicks(kind:"sp")로 심어지는지 —
//      resetForBattle()이 activeTicks를 비우므로 runBattle()의 엔진 생성 이후
//      보정 블록에서 심어야 한다는 함정이 지켜지는지 확인
// ============================================================================

const path = require("path");
const { loadAdapterEnv } = require("./simulate");

const env = loadAdapterEnv();
const { BattleAdapter } = env;

let pass = 0, fail = 0;
function check(label, actual, expected) {
  if (actual === expected) { pass++; console.log(`  ✓ ${label}: ${actual}`); }
  else { fail++; console.log(`  ✗ ${label}: got ${actual}, expected ${expected}`); }
}

// 테스트 전용 세트를 주입 — 자리표시자 수치(초심자 세트)에 의존하지 않기 위함.
// 사용자가 초심자 세트 수치를 나중에 바꿔도 이 검증은 계속 유효해야 하므로,
// 검증용 세트를 따로 등록해서 쓴다.
env.sandbox.window.ItemSets.ITEM_SET_TABLE.__demo_set = {
  name: "검증용 세트",
  thresholds: [
    { count: 2, maxHpBonus: 50, maxSpBonus: 25, combatReal: { def: 3 }, description: "2세트" },
    // statRealBonus는 LUK를 씀 — INT로 하면 Max SP 공식(int×10)에 끼어들어
    // maxSpBonus 검증이 교란된다(실제로 처음엔 int로 뒀다가 +40이 더 붙어서
    // 발견함). LUK은 Max HP/SP 어느 쪽에도 안 들어가서 독립적으로 확인 가능.
    { count: 3, maxHpBonus: 120, maxSpBonus: 60, spRegenPerTurn: 6,
      statBonus: { str: 2 }, statRealBonus: { luk: 4 }, description: "3세트" },
  ],
};

function piece(slot, extra) {
  return Object.assign({ name: `조각-${slot}`, category: "equipment", slot, setId: "__demo_set", weight: 0 }, extra || {});
}

function buildChar(equipment) {
  return {
    id: "set-test",
    name: "세트테스터",
    job: "전사",
    level: 1,
    realStats: { str: 10, int: 10, dex: 10, spd: 10, luk: 10 },
    learnedSkillNames: [],
    personalResources: {},
    presets: [{ name: "기본", rows: [{ subject: "self", metric: "always", action: "공격" }] }],
    activePresetIdx: 0,
    equipment,
  };
}

// 기준선 — 세트 미장착
const base = BattleAdapter.buildAllyFromRoster(buildChar({}), 0);
const baseHp = base.maxHp, baseSp = base.maxSp, baseDef = base.realDef;

console.log("\n[기준선] 세트 미장착");
console.log(`  maxHp=${baseHp} maxSp=${baseSp} realDef=${baseDef} realLuk=${base.realLuk}`);

// ── 1) 2부위만 — 2세트 티어만 적용되어야 함 ────────────────────────────────
console.log("\n[1] 2부위 장착 — 2세트 티어만 적용되어야 함");
const two = BattleAdapter.buildAllyFromRoster(buildChar({
  armor: piece("armor"), head: piece("head"),
}), 0);
check("maxHp (+50)", two.maxHp - baseHp, 50);
check("maxSp (+25)", two.maxSp - baseSp, 25);
check("realDef (+3)", two.realDef - baseDef, 3);
check("realLuk 변화 없음(3세트 전용)", two.realLuk - base.realLuk, 0);

// ── 2) 3부위 — 2세트 + 3세트 누적 ──────────────────────────────────────────
console.log("\n[2] 3부위 장착 — 2세트+3세트 누적");
const threeChar = buildChar({ armor: piece("armor"), head: piece("head"), shoes: piece("shoes") });
const three = BattleAdapter.buildAllyFromRoster(threeChar, 0);
check("maxHp (+50+120)", three.maxHp - baseHp, 170);
check("maxSp (+25+60)", three.maxSp - baseSp, 85);
check("realDef (+3)", three.realDef - baseDef, 3);
check("realLuk (statRealBonus +4)", three.realLuk - base.realLuk, 4);

// ── 3) spRegenPerTurn이 영구 SP 틱으로 심어지는지 ─────────────────────────
// buildAllyFromRoster 시점이 아니라 runBattle()이 엔진을 만든 뒤 심는 게 핵심
// (resetForBattle이 activeTicks를 비우기 때문). 그래서 runBattle을 실제로 돌려서
// 확인한다 — 전투 로그에 "장비 SP 재생"이 찍히면 성공.
console.log("\n[3] SP 재생 틱 — runBattle() 경유(resetForBattle 이후에 심어지는지)");
const logLines = [];
const monsterTable = {
  dummy: {
    id: "dummy", name: "허수아비", tier: "normal",
    realStats: { str: 1, int: 1, dex: 1, spd: 1, luk: 1 },
    combatReal: { def: 0, mdef: 0 },
    patterns: [{ subject: "self", metric: "always", action: "공격" }],
    expReward: 0, goldReward: 0,
  },
};
// SP를 실제로 쓰도록 넉넉히 소모시키지 않아도, 틱 자체는 매 턴 찍힌다.
env.BattleAdapter.runBattle({
  allyRosterChars: [threeChar],
  monsterTable,
  enemySpawnKeys: ["dummy"],
  maxTurns: 5,
  username: "검증",
  logger: (line) => logLines.push(line),
});
const regenLines = logLines.filter((l) => l.includes("장비 SP 재생"));
check("전투 로그에 SP 재생 틱이 찍힘", regenLines.length > 0, true);
if (regenLines.length) console.log(`     예: ${regenLines[0].trim()}`);

// 세트 미장착 캐릭터에는 틱이 안 생겨야 함
const noSetLines = [];
env.BattleAdapter.runBattle({
  allyRosterChars: [buildChar({})],
  monsterTable,
  enemySpawnKeys: ["dummy"],
  maxTurns: 5,
  username: "검증",
  logger: (line) => noSetLines.push(line),
});
check("세트 미장착이면 SP 재생 틱 없음", noSetLines.some((l) => l.includes("장비 SP 재생")), false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
