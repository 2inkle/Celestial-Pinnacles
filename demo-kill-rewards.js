const { BattleCharacter } = require("./src/character");
const { BattleEngine } = require("./src/engine");

// ============================================================================
// 1) 골드 + 확정 드랍(100%) + 절대 안 나오는 드랍(0%) 검증, 로그 메시지도
//    실제로 어떻게 찍히는지 눈으로 보이게 console.log 로거 그대로 사용
// ============================================================================
console.log("==================================================");
console.log("1) 처치 시 경험치+골드+드랍 통합 로그");
console.log("==================================================");

const hero = new BattleCharacter("용사", "ally", { str: 40, spd: 40 });
hero.realAtk = 25;
hero.patternSlots = [{ cond: "ALWAYS", val: 0, act: "ATTACK" }];

const goblin = new BattleCharacter("고블린", "enemy", { str: 5, spd: 10 });
goblin.expReward = 20;
goblin.goldReward = 15;
goblin.dropTable = [
  { name: "고블린의 이빨", category: "material", chance: 1.0, quantity: [2, 2] },
  { name: "전설의 검", category: "equipment", chance: 0.0, quantity: [1, 1] },
];
goblin.patternSlots = [{ cond: "ALWAYS", val: 0, act: "ATTACK" }];

const engine1 = new BattleEngine([hero], [goblin]);
const result1 = engine1.startBattle(50);

console.log("\n최종 반환값:", JSON.stringify(result1));
console.log("골드 15 정확히 누적:", result1.goldGained === 15 ? "✅" : "❌");
console.log(
  "이빨만 있고 전설의 검은 없음:",
  result1.lootGained.length === 1 && result1.lootGained[0].name === "고블린의 이빨" && result1.lootGained[0].quantity === 2 ? "✅" : "❌"
);

// ============================================================================
// 2) 같은 아이템이 여러 마리에서 드랍되면 수량이 합산되는지
// ============================================================================
console.log("\n==================================================");
console.log("2) 동일 아이템 여러 마리 드랍 시 수량 합산");
console.log("==================================================");

const hero2 = new BattleCharacter("용사2", "ally", { str: 40, spd: 40 });
hero2.realAtk = 25;
hero2.patternSlots = [{ cond: "ALWAYS", val: 0, act: "ATTACK" }];

const goblinA = new BattleCharacter("고블린A", "enemy", { str: 3, spd: 8 });
goblinA.goldReward = 5;
goblinA.dropTable = [{ name: "고블린의 이빨", category: "material", chance: 1.0, quantity: [3, 3] }];
goblinA.patternSlots = [{ cond: "ALWAYS", val: 0, act: "ATTACK" }];

const goblinB = new BattleCharacter("고블린B", "enemy", { str: 3, spd: 8 });
goblinB.goldReward = 7;
goblinB.dropTable = [{ name: "고블린의 이빨", category: "material", chance: 1.0, quantity: [4, 4] }];
goblinB.patternSlots = [{ cond: "ALWAYS", val: 0, act: "ATTACK" }];

const engine2 = new BattleEngine([hero2], [goblinA, goblinB], () => {});
const result2 = engine2.startBattle(100);

console.log("결과:", JSON.stringify(result2));
console.log("골드 12(5+7) 합산:", result2.goldGained === 12 ? "✅" : "❌");
console.log(
  "고블린의 이빨 7개(3+4)로 합산(항목 1개로 병합):",
  result2.lootGained.length === 1 && result2.lootGained[0].quantity === 7 ? "✅" : "❌"
);

// ============================================================================
// 3) 확률 드랍 통계 검증(50%, 300회)
// ============================================================================
console.log("\n==================================================");
console.log("3) 확률 드랍 통계 검증 (50%, 300회)");
console.log("==================================================");

let dropCount = 0;
const total = 300;
for (let i = 0; i < total; i++) {
  const h = new BattleCharacter("용사3", "ally", { str: 40, spd: 40 });
  h.realAtk = 25;
  h.patternSlots = [{ cond: "ALWAYS", val: 0, act: "ATTACK" }];

  const g = new BattleCharacter("고블린C", "enemy", { str: 3, spd: 8 });
  g.dropTable = [{ name: "희귀 조각", category: "material", chance: 0.5, quantity: [1, 1] }];
  g.patternSlots = [{ cond: "ALWAYS", val: 0, act: "ATTACK" }];

  const e = new BattleEngine([h], [g], () => {});
  const r = e.startBattle(50);
  if (r.lootGained.some((it) => it.name === "희귀 조각")) dropCount++;
}
console.log(`300회 중 드랍 횟수: ${dropCount} (기대 약 150 근처)`);
console.log(Math.abs(dropCount - 150) < 40 ? "✅ 대체로 50%에 근접" : "❌ 편차가 너무 큼");
