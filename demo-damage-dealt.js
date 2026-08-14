const { BattleCharacter } = require("./src/character");
const { BattleEngine } = require("./src/engine");
const { SkillRegistry } = require("./src/skillRegistry");

console.log("==================================================");
console.log("1) 진영별 가한 데미지 총량 집계 검증");
console.log("==================================================");

const hero = new BattleCharacter("용사", "ally", { str: 30, spd: 30 });
hero.realAtk = 20;
hero.patternSlots = [{ cond: "ALWAYS", val: 0, act: "ATTACK" }];

const goblin = new BattleCharacter("고블린", "enemy", { str: 15, spd: 20 });
goblin.patternSlots = [{ cond: "ALWAYS", val: 0, act: "ATTACK" }];

const engine = new BattleEngine([hero], [goblin], () => {});
const result = engine.startBattle(30);

console.log("결과:", JSON.stringify({ outcome: result.outcome, turnsElapsed: result.turnsElapsed, damageDealt: result.damageDealt }));

console.log(`고블린 maxHp: ${goblin.maxHp}`);
console.log(`아군이 가한 데미지: ${result.damageDealt.ally} (고블린을 죽였으니 정확히 maxHp만큼이어야 함)`, result.damageDealt.ally === goblin.maxHp ? "✅" : "❌");
console.log(`적군이 가한 데미지: ${result.damageDealt.enemy} (용사도 몇 번 맞았을 테니 0보다 커야 함)`, result.damageDealt.enemy > 0 ? "✅" : "❌");
console.log(`적군이 가한 데미지가 용사가 잃은 HP와 일치: ${result.damageDealt.enemy} === ${hero.maxHp - hero.currentHp}`, result.damageDealt.enemy === (hero.maxHp - hero.currentHp) ? "✅" : "❌");

console.log("\n==================================================");
console.log("2) Guard로 막힌 데미지는 집계에서 제외되는지");
console.log("==================================================");

SkillRegistry.register({
  name: "패링", targetFaction: "self", targetCount: "single",
  stat: "str", coefficient: 0, costs: [],
  skillType: "support", preDelay: 0, preDelayType: "action", postDelay: 10,
  effects: [{ type: "guard" }],
});

const guardian = new BattleCharacter("수호자", "ally", { str: 10, spd: 200 });
guardian.patternSlots = [
  { cond: "NOT_GUARDING", val: null, act: "패링" },
  { cond: "ALWAYS", val: 0, act: "ATTACK" },
];
const attacker = new BattleCharacter("공격자", "enemy", { str: 15, spd: 0 });
attacker.patternSlots = [{ cond: "ALWAYS", val: 0, act: "ATTACK" }];

const engine2 = new BattleEngine([guardian], [attacker], () => {});
const result2 = engine2.startBattle(15);
console.log(`수호자 HP 손실: ${guardian.maxHp - guardian.currentHp}, 적군이 가한 데미지 집계: ${result2.damageDealt.enemy}`);
console.log("Guard로 막힌 만큼은 집계에서 빠짐(실제 HP 손실과 정확히 일치):", result2.damageDealt.enemy === (guardian.maxHp - guardian.currentHp) ? "✅" : "❌");
