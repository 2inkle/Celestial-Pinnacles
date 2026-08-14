const { BattleCharacter } = require("./src/character");
const { ActionRegistry } = require("./src/registries");

function summonOnce(realLuk, realSummonEff, bonusLuk = 0) {
  const actor = new BattleCharacter("소환사", "enemy", { luk: realLuk });
  actor.realSummonEff = realSummonEff;
  actor.bonusLuk = bonusLuk;
  actor.summonPool = [{ name: "표본", stats: { str: 1000000 }, weight: 1 }];
  const ctx = { units: [], allies: [], enemies: [], log: () => {} };
  ActionRegistry.execute("SUMMON", actor, ctx);
  return ctx.enemies[0].realStr / 1000000; // 최종 배율(multiplier) 그대로
}

console.log("==================================================");
console.log("1) SummonEff=0 -> 100%(기준선) — 장비 없어도 소환 자체는 정상 작동");
console.log("==================================================");
// realLuk=100(LUK 투자 배율 정확히 1), 버프 없음(성장 배율 1)으로 고정해두면,
// 최종 배율이 곧 SummonEff 배율(1 + realSummonEff/100) 그 자체가 됨
const noGear = summonOnce(100, 0);
console.log(`SummonEff=0 -> 최종 배율 ${noGear.toFixed(3)} (기대 1.0 = 100%)`);
console.log(Math.abs(noGear - 1) < 0.001 ? "✅" : "❌");

console.log("\n==================================================");
console.log("2) SummonEff +30 -> 130% 그대로 반영되는지");
console.log("==================================================");
const withGear = summonOnce(100, 30);
console.log(`SummonEff=30 -> 최종 배율 ${withGear.toFixed(3)} (기대 1.3 = 130%)`);
console.log(Math.abs(withGear - 1.3) < 0.001 ? "✅" : "❌");

console.log("\n==================================================");
console.log("3) SummonEff=0인데 LUK 투자가 부족해도(realLuk<100), 0이 아니라 그 비율만큼은 나오는지");
console.log("==================================================");
const lowLukNoGear = summonOnce(50, 0); // LUK 투자 배율 0.5 × SummonEff 배율 1.0(100%) = 0.5
console.log(`realLuk=50, SummonEff=0 -> 최종 배율 ${lowLukNoGear.toFixed(3)} (기대 0.5 — 0이 아님)`);
console.log(Math.abs(lowLukNoGear - 0.5) < 0.001 ? "✅" : "❌");

console.log("\n==================================================");
console.log("4) SummonEff가 LUK 투자 부족분을 곱셈으로 보완할 수 있는지");
console.log("==================================================");
// realLuk=50(투자 배율 0.5)인데 SummonEff를 100(=200%)으로 올리면 0.5×2.0=1.0으로 원본 성능 복구
const compensated = summonOnce(50, 100);
console.log(`realLuk=50(투자 배율 0.5), SummonEff=100(200%) -> 최종 배율 ${compensated.toFixed(3)} (기대 1.0)`);
console.log(Math.abs(compensated - 1) < 0.001 ? "✅" : "❌");
