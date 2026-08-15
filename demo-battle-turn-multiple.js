// BATTLE_TURN_MULTIPLE_OF — "N턴마다" 주기적 발동 조건 검증. "???"의
// Arcane Pulse(10턴마다 마법진 순증가) 게이팅용으로 신설.
const { ConditionRegistry } = require("./src/registries");

console.log("==================================================");
console.log("BATTLE_TURN_MULTIPLE_OF — N턴마다 정확히 그 순간만 참");
console.log("==================================================");

function ctxAt(turn) { return { currentTurn: turn }; }

[1, 5, 9, 10, 11, 19, 20, 25, 30].forEach((turn) => {
  const result = ConditionRegistry.check("BATTLE_TURN_MULTIPLE_OF", {}, ctxAt(turn), 10);
  const expected = turn > 0 && turn % 10 === 0;
  console.log(`  turn=${turn}: ${result} (기대값 ${expected})`, result === expected ? "✅" : "❌");
});

console.log("\n다른 배수(N=3)로도 정상 동작하는지");
[3, 6, 7, 9].forEach((turn) => {
  const result = ConditionRegistry.check("BATTLE_TURN_MULTIPLE_OF", {}, ctxAt(turn), 3);
  const expected = turn % 3 === 0;
  console.log(`  turn=${turn}, N=3: ${result} (기대값 ${expected})`, result === expected ? "✅" : "❌");
});

console.log("\nvalue가 0/undefined일 때 안전하게 false인지(0으로 나누기류 방어)");
const zeroCase = ConditionRegistry.check("BATTLE_TURN_MULTIPLE_OF", {}, ctxAt(10), 0);
console.log(`  value=0: ${zeroCase} (기대값 false)`, zeroCase === false ? "✅" : "❌");
const undefCase = ConditionRegistry.check("BATTLE_TURN_MULTIPLE_OF", {}, ctxAt(10), undefined);
console.log(`  value=undefined: ${undefCase} (기대값 false)`, undefCase === false ? "✅" : "❌");
