const { BattleCharacter } = require("./src/character");
const { BattleEngine } = require("./src/engine");
const { CharacterImporter } = require("./src/importer");

console.log("==================================================");
console.log("1) CharacterImporter가 id를 그대로 넘겨받는지");
console.log("==================================================");

const imported = CharacterImporter.importCharacter({ id: "2inkle_7", name: "임포트캐릭", side: "ally", stats: {} });
console.log("id 반영:", imported.id, imported.id === "2inkle_7" ? "✅" : "❌");

console.log("\n==================================================");
console.log("2) 중간에 죽은 캐릭터는 그 이후 처치분을 못 받는지");
console.log("==================================================");

const survivor = new BattleCharacter("생존자", "ally", { str: 40, spd: 40 });
survivor.id = "2inkle_1";
survivor.realAtk = 30;
survivor.realDef = 60; // 든든하게 버텨서 끝까지 생존하도록
survivor.patternSlots = [{ cond: "ALWAYS", val: 0, act: "ATTACK" }];

const fragile = new BattleCharacter("약골", "ally", { str: 5, spd: 5 });
fragile.id = "2inkle_2";
fragile.patternSlots = [];

// 배열 순서 중요: 레거시 ATTACK은 "상대 진영의 첫 생존자"를 때리므로, 약골이
// 먼저 맞고 죽도록 앞에 둠(생존자가 앞에 있으면 계속 생존자만 맞아버려서
// "중간에 죽는 캐릭터" 시나리오 자체가 안 됨).
const allies = [fragile, survivor];

const bruiser = new BattleCharacter("강타자", "enemy", { str: 60, spd: 50 });
bruiser.expReward = 20;
bruiser.patternSlots = [{ cond: "ALWAYS", val: 0, act: "ATTACK" }]; // 약골(HP 300)을 금방 잡을 위력

const straggler = new BattleCharacter("약졸", "enemy", { str: 5, spd: 15 });
straggler.expReward = 15;
straggler.patternSlots = [{ cond: "ALWAYS", val: 0, act: "ATTACK" }];

const engine = new BattleEngine(allies, [bruiser, straggler], () => {});
const result = engine.startBattle(80);

console.log("결과:", JSON.stringify({ outcome: result.outcome, turnsElapsed: result.turnsElapsed, expGained: result.expGained }));
console.log("expByCharacter:", JSON.stringify(result.expByCharacter));

const survivorGain = result.expByCharacter.find((c) => c.id === "2inkle_1").gainExp;
const fragileGain = result.expByCharacter.find((c) => c.id === "2inkle_2").gainExp;
console.log(`생존자 gainExp: ${survivorGain}, 약골 gainExp: ${fragileGain}`);
console.log("약골이 중간에 죽었다면 생존자보다 적거나 같아야 함:", fragileGain <= survivorGain ? "✅" : "❌");
console.log("id로 정확히 구분됨:", result.expByCharacter.every((c) => c.id === "2inkle_1" || c.id === "2inkle_2") ? "✅" : "❌");

console.log("\n==================================================");
console.log("3) 둘 다 끝까지 생존하는 일반적인 경우 — gainExp 합과 파티 총량 관계 확인");
console.log("==================================================");

const heroX = new BattleCharacter("영웅X", "ally", { str: 50, spd: 50 });
heroX.id = "2inkle_10";
heroX.realAtk = 40;
heroX.patternSlots = [{ cond: "ALWAYS", val: 0, act: "ATTACK" }];

const heroY = new BattleCharacter("영웅Y", "ally", { str: 5, spd: 5 });
heroY.id = "2inkle_11";
heroY.patternSlots = [];

const weakGoblin = new BattleCharacter("약한고블린", "enemy", { str: 3, spd: 8 });
weakGoblin.expReward = 12;
weakGoblin.patternSlots = [{ cond: "ALWAYS", val: 0, act: "ATTACK" }];

const result2 = new BattleEngine([heroX, heroY], [weakGoblin], () => {}).startBattle(50);
const gainX = result2.expByCharacter.find((c) => c.id === "2inkle_10").gainExp;
const gainY = result2.expByCharacter.find((c) => c.id === "2inkle_11").gainExp;
console.log(`파티 총량: ${result2.expGained}, 영웅X: ${gainX}, 영웅Y: ${gainY}`);
console.log("둘 다 생존 -> 각자 파티 총량과 동일(전액 지급):", gainX === result2.expGained && gainY === result2.expGained ? "✅" : "❌");
