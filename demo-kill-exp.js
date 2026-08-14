const { BattleCharacter } = require("./src/character");
const { BattleEngine } = require("./src/engine");

// ============================================================================
// 1) 몬스터 하나를 잡으면 파티 전체 경험치 풀에 정확히 그 몬스터의 expReward만큼만
//    더해지는지(생존자 수와 무관하게 "고정된 총량") 확인
// ============================================================================
console.log("==================================================");
console.log("1) 처치 경험치 — 파티 총량 풀 지급(아군 2명, 몬스터 1마리)");
console.log("==================================================");

const heroA = new BattleCharacter("용사 A", "ally", { str: 30, spd: 30 });
heroA.realAtk = 15;
heroA.patternSlots = [{ cond: "ALWAYS", val: 0, act: "ATTACK" }];

const heroB = new BattleCharacter("용사 B", "ally", { str: 5, spd: 5 });
heroB.realAtk = 0;
heroB.patternSlots = [];

const goblin = new BattleCharacter("고블린", "enemy", { str: 5, spd: 10 });
goblin.expReward = 30;
goblin.patternSlots = [{ cond: "ALWAYS", val: 0, act: "ATTACK" }];

const engine1 = new BattleEngine([heroA, heroB], [goblin], () => {});
const result1 = engine1.startBattle(50);

console.log("결과:", JSON.stringify(result1));
console.log(`Result.expGained: ${result1.expGained} (기대 30 — 생존자가 2명이든 몇 명이든 총량은 몬스터 하나분 그대로)`, result1.expGained === 30 ? "✅" : "❌");
console.log(`캐릭터 개별 필드는 이제 존재하지 않음: ${heroA.battleExpGained}`, heroA.battleExpGained === undefined ? "✅" : "❌");

// ============================================================================
// 2) 몬스터 여러 마리를 순차로 잡으면 풀이 누적되는지(등장한 몬스터 종류·수로
//    총량이 정해진다는 설계 그대로)
// ============================================================================
console.log("\n==================================================");
console.log("2) 몬스터 2마리 순차 처치 시 경험치 풀 누적");
console.log("==================================================");

const heroC = new BattleCharacter("용사 C", "ally", { str: 40, spd: 40 });
heroC.realAtk = 25;
heroC.patternSlots = [{ cond: "ALWAYS", val: 0, act: "ATTACK" }];

const goblin1 = new BattleCharacter("고블린1", "enemy", { str: 3, spd: 8 });
goblin1.expReward = 10;
goblin1.patternSlots = [{ cond: "ALWAYS", val: 0, act: "ATTACK" }];

const goblin2 = new BattleCharacter("고블린2", "enemy", { str: 3, spd: 8 });
goblin2.expReward = 15;
goblin2.patternSlots = [{ cond: "ALWAYS", val: 0, act: "ATTACK" }];

const engine2 = new BattleEngine([heroC], [goblin1, goblin2], () => {});
const result2 = engine2.startBattle(100);

console.log("결과:", JSON.stringify(result2));
console.log(`Result.expGained 누적: ${result2.expGained} (기대 25 = 10+15)`, result2.expGained === 25 ? "✅" : "❌");

// ============================================================================
// 3) 중복 지급 방지 확인 — checkForDeaths를 여러 번 더 불러도 풀이 안 늘어나야 함
// ============================================================================
console.log("\n==================================================");
console.log("3) 중복 지급 방지 확인(파티 풀 기준)");
console.log("==================================================");

engine1.checkForDeaths();
engine1.checkForDeaths();
engine1.checkForDeaths();
console.log(`engine1.battleExpGained(추가 호출 후에도 그대로 30이어야 함): ${engine1.battleExpGained}`, engine1.battleExpGained === 30 ? "✅" : "❌");
