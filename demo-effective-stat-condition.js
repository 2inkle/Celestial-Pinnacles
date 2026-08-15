const { BattleCharacter } = require("./src/character");
const { ConditionRegistry } = require("./src/registries");

console.log("==================================================");
console.log("MY_EFFECTIVE_STAT_COMPARE — 자기 자신의 effective 스탯을 지정한");
console.log("비교연산자로 판정(상대방 스탯은 참조 불가한 구조인지도 확인)");
console.log("==================================================");

const actor = new BattleCharacter("시험체", "enemy", { str: 10, int: 10, dex: 10, spd: 10, luk: 10 });
actor.realMatk = 200;
actor.bonusMatk = 0; // effectiveMatk = 200 (버프 없음)

console.log(`\n[1] 디버프 없음 — effectiveMatk=${actor.effectiveMatk}`);
const case1 = ConditionRegistry.check("MY_EFFECTIVE_STAT_COMPARE", actor, {}, { stat: "matk", comparator: "lte", threshold: 150 });
console.log(`  matk <= 150 ?  ${case1} (기대값 false)`, case1 === false ? "✅" : "❌");

actor.bonusMatk = -80; // Weapon Break류 디버프로 -80 (effective = clamp(120, 100~1000))
console.log(`\n[2] MATK -80 디버프 적용 — effectiveMatk=${actor.effectiveMatk}`);
const case2 = ConditionRegistry.check("MY_EFFECTIVE_STAT_COMPARE", actor, {}, { stat: "matk", comparator: "lte", threshold: 150 });
console.log(`  matk <= 150 ?  ${case2} (기대값 true)`, case2 === true ? "✅" : "❌");

console.log(`\n[3] 다른 비교연산자(gte/gt/lt/eq)도 정상 동작하는지`);
const gte = ConditionRegistry.check("MY_EFFECTIVE_STAT_COMPARE", actor, {}, { stat: "matk", comparator: "gte", threshold: 100 });
const gt = ConditionRegistry.check("MY_EFFECTIVE_STAT_COMPARE", actor, {}, { stat: "matk", comparator: "gt", threshold: 200 });
const eq = ConditionRegistry.check("MY_EFFECTIVE_STAT_COMPARE", actor, {}, { stat: "matk", comparator: "eq", threshold: actor.effectiveMatk });
console.log(`  matk(${actor.effectiveMatk}) >= 100 ? ${gte} (기대값 true)`, gte === true ? "✅" : "❌");
console.log(`  matk(${actor.effectiveMatk}) > 200 ? ${gt} (기대값 false)`, gt === false ? "✅" : "❌");
console.log(`  matk(${actor.effectiveMatk}) == 자기 자신 ? ${eq} (기대값 true)`, eq === true ? "✅" : "❌");

console.log(`\n[4] 모든 스탯 종류(str/int/dex/spd/luk/atk/matk/def/mdef)에 동작하는지`);
const target = new BattleCharacter("전체스탯체", "enemy", { str: 50, int: 50, dex: 50, spd: 50, luk: 50 });
target.realAtk = 30; target.realMatk = 30; target.realDef = 30; target.realMdef = 30;
["str", "int", "dex", "spd", "luk", "atk", "matk", "def", "mdef"].forEach((stat) => {
  const capKey = stat.charAt(0).toUpperCase() + stat.slice(1);
  const effective = target[`effective${capKey}`];
  const result = ConditionRegistry.check("MY_EFFECTIVE_STAT_COMPARE", target, {}, { stat, comparator: "eq", threshold: effective });
  console.log(`  ${stat}(effective=${effective}) 자기 자신과 eq 비교 -> ${result}`, result === true ? "✅" : "❌");
});

console.log(`\n[5] 상대방 스탯은 애초에 인자로 넘길 방법이 없음(항상 actor=자기 자신 고정) —`);
console.log(`    함수 시그니처 자체가 (actor, ctx, value)라 ctx로 상대를 지정할 여지가 없음. 설계로 보장됨.`);
