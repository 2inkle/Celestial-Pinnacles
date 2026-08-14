const { BattleCharacter } = require("./src/character");
const { SkillRegistry } = require("./src/skillRegistry");
const { applyDamageAndEffects } = require("./src/skillResolution");

SkillRegistry.register({
  name: "물리타격", targetFaction: "enemy", targetCount: "single",
  skillType: "physical", stat: "str", coefficient: 1.0, costs: [],
  preDelay: 0, preDelayType: "action", postDelay: 0, effects: [],
});
SkillRegistry.register({
  name: "마법타격", targetFaction: "enemy", targetCount: "single",
  skillType: "magic", stat: "int", coefficient: 1.0, costs: [],
  preDelay: 0, preDelayType: "action", postDelay: 0, effects: [],
});

function makeCtx(attacker, target) {
  return {
    allies: [attacker], enemies: [target],
    getOpponents(actor) { return actor.side === "ally" ? this.enemies : this.allies; },
    log: () => {},
  };
}

function makeAttacker() {
  const a = new BattleCharacter("공격자", "ally", { str: 100, int: 100 });
  a.realAtk = 10;
  a.realMatk = 10;
  return a;
}

console.log("==================================================");
console.log("1) guardType:\"physical\" — 물리는 막고 마법은 통과(+Guard 유지)");
console.log("==================================================");

const target1 = new BattleCharacter("대상1", "enemy", { str: 100 });
target1.isGuarding = true;
target1.guardType = "physical";

const attacker1 = makeAttacker();
applyDamageAndEffects(attacker1, SkillRegistry.get("마법타격"), makeCtx(attacker1, target1));
console.log(`물리 전용 Guard 상태에서 마법 공격 받음 -> HP ${target1.currentHp}/${target1.maxHp} (기대: 데미지 그대로 들어가야 함)`, target1.currentHp < target1.maxHp ? "✅ 마법은 안 막힘" : "❌");
console.log(`마법을 맞고도 Guard가 안 소모됨(isGuarding 그대로 true):`, target1.isGuarding === true ? "✅" : "❌");

applyDamageAndEffects(attacker1, SkillRegistry.get("물리타격"), makeCtx(attacker1, target1));
console.log(`이어서 물리 공격 -> Guard 소모됨(isGuarding false):`, target1.isGuarding === false ? "✅ 물리는 막힘" : "❌");

console.log("\n==================================================");
console.log("2) guardType:\"magic\" — 마법은 막고 물리는 통과");
console.log("==================================================");

const target2 = new BattleCharacter("대상2", "enemy", { str: 100 });
target2.isGuarding = true;
target2.guardType = "magic";

const attacker2 = makeAttacker();
applyDamageAndEffects(attacker2, SkillRegistry.get("물리타격"), makeCtx(attacker2, target2));
console.log(`마법 전용 Guard 상태에서 물리 공격 받음 -> HP ${target2.currentHp}/${target2.maxHp}`, target2.currentHp < target2.maxHp ? "✅ 물리는 안 막힘" : "❌");
console.log(`Guard 그대로 유지:`, target2.isGuarding === true ? "✅" : "❌");

const hpBeforeMagic = target2.currentHp;
applyDamageAndEffects(attacker2, SkillRegistry.get("마법타격"), makeCtx(attacker2, target2));
console.log(`이어서 마법 공격 -> HP 변화 없음(막힘): ${hpBeforeMagic} -> ${target2.currentHp}`, target2.currentHp === hpBeforeMagic ? "✅" : "❌");
console.log(`Guard 소모됨:`, target2.isGuarding === false ? "✅" : "❌");

console.log("\n==================================================");
console.log("3) guardType:\"all\"(기본값) — 물리/마법 둘 다 막음");
console.log("==================================================");

const target3 = new BattleCharacter("대상3", "enemy", { str: 100 });
target3.isGuarding = true;
console.log("기본 guardType:", target3.guardType);

const attacker3 = makeAttacker();
const hpBefore3 = target3.currentHp;
applyDamageAndEffects(attacker3, SkillRegistry.get("마법타격"), makeCtx(attacker3, target3));
console.log(`"all" Guard로 마법도 막힘: ${hpBefore3} -> ${target3.currentHp}`, target3.currentHp === hpBefore3 ? "✅" : "❌");
console.log(`Guard 소모됨:`, target3.isGuarding === false ? "✅" : "❌");
