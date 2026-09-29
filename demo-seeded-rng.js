// ============================================================================
// demo-seeded-rng.js — 엔진 난수 공급원(src/rng.js)이 "시드가 같으면 전투가
// 한 글자도 다르지 않게" 재현되는지 결정적으로 검증.
//
// 왜 필요한가: 밸런스 개편 전/후를 같은 난수로 비교하고(simulate.js), Unity(C#)
// 이식 때 골든 로그(같은 시드의 JS 전투 로그)와 C# 결과를 줄 단위로 대조하려면
// 엔진의 모든 난수가 이 한 곳을 거쳐야 한다. 누군가 엔진에 Math.random()을
// 다시 직접 쓰면 3번 검증이 깨져서 바로 드러난다.
//
// 검증 항목:
//   1) mulberry32 — 같은 시드 = 같은 수열, [0,1) 범위, 고정 기준값(이식 대조용)
//   2) 기본(시드 없음) 상태는 Math.random을 "호출 시점에" 따름 — 기존 데모들의
//      Math.random 몽키패치가 계속 통해야 함
//   3) 실제 전투(battle-adapter 경유) — 같은 시드 두 번은 로그 완전 일치,
//      다른 시드는 달라짐
//   4) withSeed가 끝난 뒤 시드 해제 상태로 복구되는지
// ============================================================================

const { Rng, mulberry32 } = require("./src/rng");
const { loadAdapterEnv } = require("./simulate");

let pass = 0, fail = 0;
function check(label, actual, expected) {
  if (actual === expected) { pass++; console.log(`  ✓ ${label}: ${actual}`); }
  else { fail++; console.log(`  ✗ ${label}: got ${actual}, expected ${expected}`); }
}

console.log("\n[1] mulberry32 결정성");
const seqA = Array.from({ length: 5 }, ((g) => () => g())(mulberry32(12345)));
const seqB = Array.from({ length: 5 }, ((g) => () => g())(mulberry32(12345)));
const seqC = Array.from({ length: 5 }, ((g) => () => g())(mulberry32(54321)));
check("같은 시드 = 같은 수열", JSON.stringify(seqA) === JSON.stringify(seqB), true);
check("다른 시드 = 다른 수열", JSON.stringify(seqA) === JSON.stringify(seqC), false);
check("전부 [0,1) 범위", [...seqA, ...seqC].every((x) => x >= 0 && x < 1), true);
// 고정 기준값 — C# 이식본의 mulberry32가 이 값과 비트 단위로 같아야 함.
// (이 값이 바뀌었다면 알고리즘이 바뀐 것 — 골든 로그 전부 무효가 됨)
const firstOf42 = mulberry32(42)();
check("시드 42의 첫 값(기준값)", firstOf42.toFixed(10), "0.6011037519");

console.log("\n[2] 기본 상태는 Math.random을 호출 시점에 따름");
Rng.reset();
const originalRandom = Math.random;
Math.random = () => 0.123;
check("몽키패치된 Math.random이 그대로 보임", Rng.random(), 0.123);
Math.random = originalRandom;
check("시드 없음 상태", Rng.isSeeded(), false);

console.log("\n[3] 실제 전투 — 같은 시드면 로그 완전 일치");
const env = loadAdapterEnv();
const { BattleAdapter, BattleSim } = env;
const SandboxRng = BattleSim.Rng;

// 확률 조건(randomChancePct)과 치명타(LUK) 판정이 매 턴 난수를 쓰게 구성 —
// 시드가 전투 흐름 전체를 좌우하는지 보기 위함.
const monsterTable = {
  dice: {
    name: "주사위", realStats: { str: 12, spd: 12, luk: 60 }, combatReal: { atk: 8, def: 10 }, maxHp: 900,
    patterns: [{ subject: "self", metric: "randomChancePct", value: 50, action: "ATTACK" }],
  },
};
const ally = {
  id: "a1", name: "시험관", job: "전사", level: 1,
  realStats: { str: 12, int: 10, dex: 10, spd: 12, luk: 60 },
  equipment: {}, learnedSkillNames: [], presets: [{ name: "기본", rows: [] }], activePresetIdx: 0,
};
function runSeeded(seed) {
  const lines = [];
  SandboxRng.withSeed(seed, () => BattleAdapter.runBattle({
    allyRosterChars: [ally], monsterTable, enemySpawnKeys: ["dice", "dice"],
    maxTurns: 30, username: "demo", logger: (l) => lines.push(l),
  }));
  return lines.join("\n");
}
const run1 = runSeeded(7);
const run2 = runSeeded(7);
const run3 = runSeeded(8);
check("시드 7 두 번 — 로그 완전 일치", run1 === run2, true);
check("로그가 비어있지 않음", run1.length > 0, true);
check("시드 7 vs 8 — 로그가 달라짐", run1 === run3, false);

console.log("\n[4] withSeed 이후 복구");
check("샌드박스 Rng 시드 해제 상태로 복구", SandboxRng.isSeeded(), false);

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
if (fail > 0) process.exit(1);
