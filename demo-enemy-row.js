// ============================================================================
// demo-enemy-row.js — 전투 편성(BATTLE_MONSTER_POOLS)의 row가 실제 적 캐릭터에
// 반영되는지 결정적으로 검증.
//
// 왜 필요한가: 2026-09-29 이전까지 dispatch.html/battle-view.html이
// spawnEnemies() 결과에서 monsterId만 뽑아 넘겼고, buildEnemyFromMonsterKey()도
// row를 설정하지 않아 적은 전원 "front"였다(2026-08-15 발견). 그래서
// targetPriority:"backRow" 스킬이나 rowMultiplier가 적에게 한 번도 의미를
// 가진 적이 없었음. 이 데모는 그 연결이 다시 끊기지 않게 지킨다.
//
// 검증 항목:
//   1) buildEnemyFromMonsterKey의 row 우선순위 — 인자 > monsterDef.row > "front"
//   2) runBattle이 { monsterId, row } 객체 스폰을 받아 row를 그대로 적용하는지
//   3) 기존 문자열 스폰도 회귀 없이 동작하는지(demo/시뮬 호환)
// ============================================================================

const { loadAdapterEnv } = require("./simulate");

const env = loadAdapterEnv();
const { BattleAdapter, BattleSim } = env;

let pass = 0, fail = 0;
function check(label, actual, expected) {
  if (actual === expected) { pass++; console.log(`  ✓ ${label}: ${actual}`); }
  else { fail++; console.log(`  ✗ ${label}: got ${actual}, expected ${expected}`); }
}

const monsterTable = {
  plain: { name: "평범", realStats: { str: 5 }, combatReal: { atk: 1 }, maxHp: 50, patterns: [] },
  backByDef: { name: "후열기본", row: "back", realStats: { str: 5 }, combatReal: { atk: 1 }, maxHp: 50, patterns: [] },
};

console.log("\n[1] buildEnemyFromMonsterKey의 row 우선순위");
check("인자 없음 + 정의 없음 → front", BattleAdapter.buildEnemyFromMonsterKey(monsterTable, "plain", 0).row, "front");
check("인자 back → back", BattleAdapter.buildEnemyFromMonsterKey(monsterTable, "plain", 0, "back").row, "back");
check("정의 row:back → back", BattleAdapter.buildEnemyFromMonsterKey(monsterTable, "backByDef", 0).row, "back");
check("인자 front가 정의 back보다 우선", BattleAdapter.buildEnemyFromMonsterKey(monsterTable, "backByDef", 0, "front").row, "front");

// runBattle 안에서 만들어진 적을 직접 보려고, 엔진 생성자를 감싸 적 배열을 붙잡는다.
// battle-adapter.js는 호출 시점마다 window.BattleSim.BattleEngine을 조회하므로
// 샌드박스 쪽 속성을 바꾸면 그대로 적용됨.
const OriginalEngine = BattleSim.BattleEngine;
let capturedEnemies = null;
class CapturingEngine extends OriginalEngine {
  constructor(allies, enemies, logger, opts) {
    super(allies, enemies, logger, opts);
    capturedEnemies = enemies;
  }
}
CapturingEngine.GAUGE_THRESHOLD = OriginalEngine.GAUGE_THRESHOLD;
env.sandbox.window.BattleSim.BattleEngine = CapturingEngine;

const ally = {
  id: "a1", name: "테스터", job: "전사", level: 1,
  realStats: { str: 10, int: 10, dex: 10, spd: 10, luk: 10 },
  equipment: {}, learnedSkillNames: [], presets: [{ name: "기본", rows: [] }], activePresetIdx: 0,
};

console.log("\n[2] runBattle — { monsterId, row } 객체 스폰");
BattleAdapter.runBattle({
  allyRosterChars: [ally], monsterTable,
  enemySpawnKeys: [{ monsterId: "plain", row: "front" }, { monsterId: "plain", row: "back" }],
  maxTurns: 1, username: "demo", logger: () => {},
});
check("적 수", capturedEnemies.length, 2);
check("첫 번째 적 row", capturedEnemies[0].row, "front");
check("두 번째 적 row", capturedEnemies[1].row, "back");
check("같은 키 두 번째 개체 id", capturedEnemies[1].id, "plain#1");

console.log("\n[3] runBattle — 기존 문자열 스폰(회귀 없음)");
BattleAdapter.runBattle({
  allyRosterChars: [ally], monsterTable,
  enemySpawnKeys: ["plain", "backByDef"],
  maxTurns: 1, username: "demo", logger: () => {},
});
check("문자열 스폰 적 수", capturedEnemies.length, 2);
check("문자열 스폰 기본 row", capturedEnemies[0].row, "front");
check("문자열 스폰도 정의 row는 반영", capturedEnemies[1].row, "back");

env.sandbox.window.BattleSim.BattleEngine = OriginalEngine;

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
if (fail > 0) process.exit(1);
