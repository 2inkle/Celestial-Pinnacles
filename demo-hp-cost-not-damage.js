const { BattleCharacter } = require("./src/character");
const { BattleEngine } = require("./src/engine");
const { SkillRegistry } = require("./src/skillRegistry");

SkillRegistry.register({
  name: "출혈 강타",
  targetFaction: "self",
  targetCount: "single",
  skillType: "physical",
  stat: "str",
  coefficient: 0,
  costs: [{ type: "hp", amount: 50 }],
  preDelay: 0,
  preDelayType: "action",
  postDelay: 10,
  effects: [],
});

const caster = new BattleCharacter("피의 전사", "ally", { str: 20, spd: 30 });
caster.patternSlots = [{ cond: "ALWAYS", val: 0, act: "출혈 강타" }];

const bystander = new BattleCharacter("구경꾼", "enemy", { str: 0, spd: 5 });
bystander.patternSlots = [];

console.log(`시전자 시작 HP: ${caster.currentHp}/${caster.maxHp}`);

const engine = new BattleEngine([caster], [bystander], () => {});
const result = engine.startBattle(3);

console.log(`시전자 최종 HP: ${caster.currentHp}/${caster.maxHp} (HP 코스트로 깎였어야 함)`);
console.log("결과:", JSON.stringify({ outcome: result.outcome, damageDealt: result.damageDealt }));

console.log("");
console.log("시전자 HP가 실제로 깎였음(코스트 지불됨):", caster.currentHp < caster.maxHp ? "✅" : "❌");
console.log("HP 코스트 지불이 damageDealt.ally에 전혀 안 잡힘:", result.damageDealt.ally === 0 ? "✅" : `❌ (${result.damageDealt.ally})`);
console.log("damageDealt.enemy도 0(구경꾼이 아무것도 안 했으니):", result.damageDealt.enemy === 0 ? "✅" : "❌");
