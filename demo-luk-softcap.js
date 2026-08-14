const { BattleCharacter } = require("./src/character");
const { ActionRegistry } = require("./src/registries");

function summonOnce(realLuk, realSummonEff = 0) {
  const actor = new BattleCharacter("소환사", "enemy", { luk: realLuk });
  actor.realSummonEff = realSummonEff;
  actor.summonPool = [{ name: "표본", stats: { str: 1000000 }, weight: 1 }];
  const ctx = { units: [], allies: [], enemies: [], log: () => {} };
  ActionRegistry.execute("SUMMON", actor, ctx);
  return ctx.enemies[0].realStr / 1000000;
}

console.log("==================================================");
console.log("1) 100 지점에서 연속적으로 이어지는지(끊김 없음)");
console.log("==================================================");
const at99 = summonOnce(99);
const at100 = summonOnce(100);
const at101 = summonOnce(101);
console.log(`99 -> ${at99.toFixed(4)}, 100 -> ${at100.toFixed(4)}, 101 -> ${at101.toFixed(4)}`);
console.log("100에서 정확히 1.0:", Math.abs(at100 - 1) < 0.001 ? "✅" : "❌");

console.log("\n==================================================");
console.log("2) 100~150 구간은 아직 확실히 투자 가치가 있고, 150~200은 확 둔화되는지");
console.log("==================================================");
const at150 = summonOnce(150);
const at200 = summonOnce(200);
const gain100to150 = at150 - at100;
const gain150to200 = at200 - at150;
console.log(`100->150(50점 투자) 증가량: ${gain100to150.toFixed(4)}`);
console.log(`150->200(50점 투자) 증가량: ${gain150to200.toFixed(4)}`);
console.log("같은 50점인데 150~200 구간이 훨씬 덜 늘어남(체감 둔화):", gain150to200 < gain100to150 / 5 ? "✅" : "❌");

console.log("\n==================================================");
console.log("3) 200을 넘으면 사실상 무의미해지는지");
console.log("==================================================");
const at300 = summonOnce(300);
const gain200to300 = at300 - at200;
console.log(`200->300(100점 투자) 증가량: ${gain200to300.toFixed(4)} (기대: 거의 0에 가까움)`);
console.log("200 넘는 투자는 사실상 무의미:", gain200to300 < 0.01 ? "✅" : "❌");

console.log("\n==================================================");
console.log("4) 레벨 60 상한을 고려했을 때 현실적인 범위(예: realLuk 150) 안에서도 자연스러운지");
console.log("==================================================");
console.log(`realLuk 150 -> 배율 ${at150.toFixed(4)} (여전히 1보다 크고 실질적인 보너스)`);
console.log(at150 > 1.15 ? "✅ 150에서도 의미 있는 보너스 유지" : "❌");

console.log("\n==================================================");
console.log("5) SummonEff=0(=100% 기준선)이어도 소환이 무의미해지진 않음(새 규칙)");
console.log("==================================================");
const noGear = summonOnce(300, 0);
console.log(`realLuk=300, SummonEff=0 -> ${noGear.toFixed(4)} (기대: 소프트캡 배율(~1.25) 그대로, 0이 아님)`);
console.log(noGear > 1 ? "✅ 장비 없이도 소환 자체는 정상 작동" : "❌");
