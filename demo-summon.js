const { BattleCharacter } = require("./src/character");
const { BattleEngine } = require("./src/engine");

console.log("==================================================");
console.log("고블린 마차: 자신의 턴마다 고블린을 소환 — 인원수/HP 총량 변동 검증");
console.log("==================================================");

const hero = new BattleCharacter("용사", "ally", { str: 15, spd: 15 });
hero.realAtk = 8;
hero.patternSlots = [{ cond: "ALWAYS", val: 0, act: "ATTACK" }];

const goblinCart = new BattleCharacter("고블린 마차", "enemy", { str: 5, spd: 15 });
goblinCart.summonPool = [
  {
    name: "소환된 고블린",
    stats: { str: 6, int: 5, dex: 8, spd: 10, luk: 5 },
    patternSlots: [{ cond: "ALWAYS", val: 0, act: "ATTACK" }],
    expReward: 2,
    weight: 1,
  },
];
// SummonEff가 0이면 소환수 스펙이 전부 0으로 뭉개지므로, 의미 있는 소환을
// 확인하려면 소환력을 실제로 부여해야 함(장비/패시브가 있는 것처럼).
goblinCart.realSummonEff = 3;
goblinCart.patternSlots = [{ cond: "ALWAYS", val: 0, act: "SUMMON" }];

console.log(`전투 시작 시점 — 아군 1명, 적군 1명(고블린 마차)`);
console.log(`전투 시작 시점 적군 총 maxHp: ${goblinCart.maxHp} (고블린 마차 혼자)`);

const engine = new BattleEngine([hero], [goblinCart], () => {});
const result = engine.startBattle(15);

console.log("\n결과:", JSON.stringify({ outcome: result.outcome, turnsElapsed: result.turnsElapsed, survivorCounts: result.survivorCounts }));

const enemyTotalMaxHp = result.participants.enemy.reduce((sum, p) => sum + p.maxHp, 0);
console.log(`\n전투 종료 시점 적군 총 인원(참여 이력 전체, 죽은 것 포함): ${result.survivorCounts.enemy.total}`);
console.log(`전투 종료 시점 적군 총 maxHp 합계: ${enemyTotalMaxHp}`);

console.log("\n검증:");
console.log("적군 총 인원수가 처음(1명)보다 늘어남(소환됨):", result.survivorCounts.enemy.total > 1 ? "✅" : "❌");
console.log("적군 총 maxHp 합계가 고블린 마차 혼자 있을 때보다 늘어남:", enemyTotalMaxHp > goblinCart.maxHp ? "✅" : "❌");
console.log("소환된 유닛들이 실제로 이름에 나타남:", result.participants.enemy.some((p) => p.name === "소환된 고블린") ? "✅" : "❌");

console.log("\n적군 참여 인원 목록:");
result.participants.enemy.forEach((p) => console.log(`  - ${p.name}: HP ${p.currentHp}/${p.maxHp} (${p.isAlive ? "생존" : "전투불능"})`));
