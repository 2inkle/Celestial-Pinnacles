const { BattleCharacter } = require("./src/character");
const { ActionRegistry } = require("./src/registries");

function measureGrowth(ratio) {
  const actor = new BattleCharacter("측정용", "enemy", { luk: 100 });
  actor.realSummonEff = 1;
  actor.bonusLuk = Math.round(100 * (ratio - 1));
  actor.summonPool = [{ name: "표본", stats: { str: 1000000 }, weight: 1 }];
  const ctx = { units: [], allies: [], enemies: [], log: () => {} };
  ActionRegistry.execute("SUMMON", actor, ctx);
  return ctx.enemies[0].realStr / 1000000;
}

console.log("==================================================");
console.log("1) 경계값 정확도 — ratio=1일 때 1배, ratio=20일 때 정확히 3배");
console.log("==================================================");

const g1 = measureGrowth(1);
const g20 = measureGrowth(20);
console.log(`ratio=1 -> growth ${g1.toFixed(3)} (기대 1.0, SUMMON 경유 간접측정이라 약간의 반올림 잡음 허용)`, Math.abs(g1 - 1) < 0.05 ? "✅" : "❌");
console.log(`ratio=20 -> growth ${g20.toFixed(3)} (기대 3.0, SUMMON 경유 간접측정이라 약간의 반올림 잡음 허용)`, Math.abs(g20 - 3) < 0.05 ? "✅" : "❌");

console.log("\n==================================================");
console.log("2) 로그 곡선 — 초반엔 가파르게, 후반엔 완만하게");
console.log("   (같은 '배수' 비교가 아니라 같은 '절대 증가폭 +1'로 비교해야 함 —");
console.log("    로그 함수는 같은 배수 변화면 항상 같은 증가폭이 나오는 게 정상이라,");
console.log("    그걸로는 곡률을 볼 수 없음)");
console.log("==================================================");

const points = [1, 2, 5, 10, 15, 20];
const growths = points.map((r) => ({ ratio: r, growth: measureGrowth(r) }));
growths.forEach((p) => console.log(`  ratio ${p.ratio.toString().padStart(2)} -> growth ${p.growth.toFixed(3)}`));

const earlyStep = measureGrowth(2) - measureGrowth(1); // ratio 1 -> 2 (+1)
const lateStep = measureGrowth(20) - measureGrowth(19); // ratio 19 -> 20 (+1, 동일한 절대 증가폭)
console.log(`\n초반 구간(ratio 1->2, 절대 증가폭 +1): ${earlyStep.toFixed(4)}`);
console.log(`후반 구간(ratio 19->20, 절대 증가폭 +1, 동일): ${lateStep.toFixed(4)}`);
console.log("같은 +1인데 후반부일수록 growth 증가폭이 훨씬 작음(로그 곡선 확인):", lateStep < earlyStep ? "✅" : "❌");
console.log(`체감 배율: 초반이 후반보다 ${(earlyStep / lateStep).toFixed(1)}배 더 가파름`);

console.log("\n==================================================");
console.log("3) 디버프(ratio<1)면 1배보다 약해지는지");
console.log("==================================================");
const gDebuff = measureGrowth(0.5);
console.log(`ratio=0.5 -> growth ${gDebuff.toFixed(3)} (1보다 작아야 함)`, gDebuff < 1 ? "✅" : "❌");
