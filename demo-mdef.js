const { BattleCharacter } = require("./src/character");

console.log("==================================================");
console.log("1) MDEF도 DEF와 완전히 같은 규칙 — 퍼센트 20/30 예시 그대로");
console.log("==================================================");

const mdef20 = new BattleCharacter("마방20", "ally", {});
mdef20.realMdef = 20;
const applied20 = mdef20.takeDamage(100, "magic");
console.log(`realMdef 20, 마법 100데미지 -> ${applied20} (기대 80)`, applied20 === 80 ? "✅" : "❌");

const mdef30 = new BattleCharacter("마방30", "ally", {});
mdef30.realMdef = 30;
const applied30 = mdef30.takeDamage(100, "magic");
console.log(`realMdef 30, 마법 100데미지 -> ${applied30} (기대 70)`, applied30 === 70 ? "✅" : "❌");

console.log("\n==================================================");
console.log("2) DEF는 물리만, MDEF는 마법만 — 서로 독립적으로 적용되는지");
console.log("==================================================");

const physTank = new BattleCharacter("물리방벽", "ally", { str: 100 });
physTank.realDef = 50;
const physOnPhys = physTank.takeDamage(100, "physical");
console.log(`DEF만 50인 대상 — 물리 100데미지 -> ${physOnPhys} (기대 50, DEF 적용)`, physOnPhys === 50 ? "✅" : "❌");

const physTank2 = new BattleCharacter("물리방벽2", "ally", { str: 100 });
physTank2.realDef = 50;
const magicOnPhys = physTank2.takeDamage(100, "magic");
console.log(`DEF만 50인 대상 — 마법 100데미지 -> ${magicOnPhys} (기대 100, DEF는 마법에 안 먹힘)`, magicOnPhys === 100 ? "✅" : "❌");

const magicTank = new BattleCharacter("마법방벽", "ally", { str: 100 });
magicTank.realMdef = 50;
const magicOnMagic = magicTank.takeDamage(100, "magic");
console.log(`MDEF만 50인 대상 — 마법 100데미지 -> ${magicOnMagic} (기대 50, MDEF 적용)`, magicOnMagic === 50 ? "✅" : "❌");

const magicTank2 = new BattleCharacter("마법방벽2", "ally", { str: 100 });
magicTank2.realMdef = 50;
const physOnMagic = magicTank2.takeDamage(100, "physical");
console.log(`MDEF만 50인 대상 — 물리 100데미지 -> ${physOnMagic} (기대 100, MDEF는 물리에 안 먹힘)`, physOnMagic === 100 ? "✅" : "❌");

console.log("\n==================================================");
console.log("3) bonusMdef 절대값 감소 + 상/하한 클램프");
console.log("==================================================");

const buffedMdef = new BattleCharacter("마방버프", "ally", { str: 100 });
buffedMdef.realMdef = 20;
buffedMdef.bonusMdef += 15;
const appliedBuffedMdef = buffedMdef.takeDamage(100, "magic");
console.log(`realMdef 20(퍼센트) + bonusMdef 15(절대값) -> ${appliedBuffedMdef} (기대 65 = 80-15)`, appliedBuffedMdef === 65 ? "✅" : "❌");

const overMdef = new BattleCharacter("마방과버프", "ally", { str: 100 });
overMdef.realMdef = 10;
overMdef.bonusMdef += 100000;
console.log("effectiveMdef(클램프):", overMdef.effectiveMdef, "(기대 500)", overMdef.effectiveMdef === 500 ? "✅" : "❌");
const appliedOverMdef = overMdef.takeDamage(1000, "magic");
console.log(`극단적 마방 버프 -> ${appliedOverMdef} (기대 410 = 900 - (500-10))`, appliedOverMdef === 410 ? "✅" : "❌");

console.log("\n==================================================");
console.log("4) realMdef도 전투 중 절대 안 변함");
console.log("==================================================");

const stable = new BattleCharacter("확인용2", "ally", {});
stable.realMdef = 25;
stable.bonusMdef += 999;
stable.takeDamage(50, "magic");
stable.takeDamage(9999, "magic");
console.log("여러 번 겪은 뒤 realMdef:", stable.realMdef, stable.realMdef === 25 ? "✅ 안 변함" : "❌ 변함");

console.log("\n==================================================");
console.log("5) 실제 스킬(applyDamageAndEffects) 경로에서도 skillType별로 DEF/MDEF가 갈리는지");
console.log("==================================================");

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

const attacker1 = new BattleCharacter("공격자1", "ally", { str: 100, int: 100 });
attacker1.realAtk = 10;
attacker1.realMatk = 10;
const defender1 = new BattleCharacter("수비자1", "enemy", { str: 100 });
defender1.realDef = 50;
defender1.realMdef = 0;

applyDamageAndEffects(attacker1, SkillRegistry.get("물리타격"), makeCtx(attacker1, defender1));
const hpAfterPhysical = defender1.currentHp;
applyDamageAndEffects(attacker1, SkillRegistry.get("마법타격"), makeCtx(attacker1, defender1));
const hpAfterMagic = defender1.currentHp;

const physicalDamage = defender1.maxHp - hpAfterPhysical;
const magicDamage = hpAfterPhysical - hpAfterMagic;
console.log(`물리타격 데미지: ${physicalDamage}, 마법타격 데미지: ${magicDamage}`);
console.log("DEF 50이 물리에만 적용돼 마법 데미지가 더 크게 나와야 함:", magicDamage > physicalDamage ? "✅" : "❌");
