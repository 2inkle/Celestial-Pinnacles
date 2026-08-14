const { BattleCharacter } = require("./src/character");
const { BattleEngine } = require("./src/engine");

console.log("==================================================");
console.log("1) 같은 캐릭터로 연속 전투 시 버프/상태가 안 새는지");
console.log("==================================================");

const hero = new BattleCharacter("용사", "ally", { str: 20, spd: 20 });
hero.realAtk = 15;
hero.patternSlots = [{ cond: "ALWAYS", val: 0, act: "ATTACK" }];

const goblin1 = new BattleCharacter("고블린1", "enemy", { str: 5, spd: 10 });
goblin1.patternSlots = [{ cond: "ALWAYS", val: 0, act: "ATTACK" }];

hero.bonusStr = 999;
hero.bonusAtk = 999;
hero.bonusDef = 999;
hero.bonusMatk = 999;
hero.bonusMdef = 999;
hero.maxHpBonus = 500;
hero.isGuarding = true;
hero.guardType = "magic";
hero.slotTriggerCounts = [7, 3];

new BattleEngine([hero], [goblin1], () => {}).startBattle(30);

console.log("1차 전투 종료 직후(생성자가 리셋 적용됨) 상태:");
console.log("  bonusStr:", hero.bonusStr, hero.bonusStr === 0 ? "✅" : "❌");
console.log("  bonusAtk:", hero.bonusAtk, hero.bonusAtk === 0 ? "✅" : "❌");
console.log("  bonusDef:", hero.bonusDef, hero.bonusDef === 0 ? "✅" : "❌");
console.log("  bonusMatk:", hero.bonusMatk, hero.bonusMatk === 0 ? "✅" : "❌");
console.log("  bonusMdef:", hero.bonusMdef, hero.bonusMdef === 0 ? "✅" : "❌");
console.log("  maxHpBonus:", hero.maxHpBonus, hero.maxHpBonus === 0 ? "✅" : "❌");
console.log("  isGuarding:", hero.isGuarding, hero.isGuarding === false ? "✅" : "❌");
console.log("  guardType:", hero.guardType, hero.guardType === "all" ? "✅" : "❌");
console.log("  realStr(영구값, 안 변해야 함):", hero.realStr, hero.realStr === 20 ? "✅" : "❌");
console.log("  (참고: slotTriggerCounts는 이번 전투에서 실제로 패턴이 발동하며 다시 쌓이므로 0이 아닌 게 정상 —",
  "리셋 자체가 됐는지는 별도로 확인:", (() => {
    const check = new BattleCharacter("체크용", "ally", {});
    check.slotTriggerCounts = [7, 3];
    check.patternSlots = [];
    const dummy = new BattleCharacter("더미", "enemy", {});
    dummy.patternSlots = [];
    new BattleEngine([check], [dummy], () => {});
    return check.slotTriggerCounts.length === 0 ? "✅ 리셋됨" : "❌";
  })(), ")");

console.log("\n==================================================");
console.log("2) Result 데이터 구조 검증");
console.log("==================================================");

const heroA = new BattleCharacter("용사A", "ally", { str: 30, spd: 30 });
heroA.realAtk = 20;
heroA.patternSlots = [{ cond: "ALWAYS", val: 0, act: "ATTACK" }];

const heroB = new BattleCharacter("용사B", "ally", { str: 5, spd: 5 });
heroB.patternSlots = [];

const enemy1 = new BattleCharacter("고블린A", "enemy", { str: 5, spd: 15 });
enemy1.expReward = 10;
enemy1.goldReward = 5;
enemy1.dropTable = [{ name: "고블린의 이빨", category: "material", chance: 1.0, quantity: [1, 1] }];
enemy1.patternSlots = [{ cond: "ALWAYS", val: 0, act: "ATTACK" }];

const enemy2 = new BattleCharacter("고블린B", "enemy", { str: 5, spd: 12 });
enemy2.expReward = 8;
enemy2.goldReward = 3;
enemy2.patternSlots = [{ cond: "ALWAYS", val: 0, act: "ATTACK" }];

const result = new BattleEngine([heroA, heroB], [enemy1, enemy2], () => {}).startBattle(50);

console.log(JSON.stringify(result, null, 2));

console.log("\n검증:");
console.log("turnsElapsed 존재:", typeof result.turnsElapsed === "number" ? "✅" : "❌");
console.log("participants.ally 길이 2:", result.participants.ally.length === 2 ? "✅" : "❌");
console.log("participants.enemy 길이 2:", result.participants.enemy.length === 2 ? "✅" : "❌");
console.log("각 참가자에 name/currentHp/maxHp/isAlive 다 있음:",
  result.participants.ally.every((p) => "name" in p && "currentHp" in p && "maxHp" in p && "isAlive" in p) ? "✅" : "❌");
console.log("survivorCounts.enemy.total === 2:", result.survivorCounts.enemy.total === 2 ? "✅" : "❌");
console.log("survivorCounts.ally.alive <= total:", result.survivorCounts.ally.alive <= result.survivorCounts.ally.total ? "✅" : "❌");
console.log("expGained가 캐릭터별 객체가 아니라 파티 총량 숫자 하나:", typeof result.expGained === "number" ? "✅" : "❌");
console.log("expGained 값(고블린A 10 + 고블린B 8 = 18):", result.expGained, result.expGained === 18 ? "✅" : "❌");
console.log("goldGained/lootGained 존재:", typeof result.goldGained === "number" && Array.isArray(result.lootGained) ? "✅" : "❌");
