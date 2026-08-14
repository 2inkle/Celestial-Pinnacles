const { BattleCharacter } = require("./src/character");
const { BattleEngine } = require("./src/engine");
const { SkillRegistry } = require("./src/skillRegistry");

// ============================================================================
// "패링" 스킬 등록 — 자신에게 Guard를 씌움(데미지 없음, 다음 피격 1회 완전 무효화)
// ============================================================================
SkillRegistry.register({
  name: "패링",
  targetFaction: "self",
  targetCount: "single",
  skillType: "support",
  stat: "str", coefficient: 0,
  costs: [],
  preDelay: 0,
  preDelayType: "action",
  postDelay: 10,
  effects: [{ type: "guard" }],
});

// ============================================================================
// 용사: 1번 패턴 = "자신이 Guard 상태가 아닐 때 -> 패링", 2번 패턴 = 평타(폴백)
// 속도를 낮게 잡아서 고블린 3번에 용사 1번 꼴로 행동하게 함
// ============================================================================
const hero = new BattleCharacter("용사", "ally", { str: 20, spd: 0 });
hero.realAtk = 15;
hero.patternSlots = [
  { cond: "NOT_GUARDING", val: null, act: "패링" },
  { cond: "ALWAYS", val: 0, act: "ATTACK" },
];

// 고블린: 반드시 공격만 함, 속도를 훨씬 높게 잡아서 용사 1행동당 3행동 정도 나오게 함
const goblin = new BattleCharacter("고블린", "enemy", { str: 15, spd: 200 });
goblin.patternSlots = [{ cond: "ALWAYS", val: 0, act: "ATTACK" }];

console.log(`용사 effectiveSpeed: ${hero.effectiveSpeed.toFixed(1)}`);
console.log(`고블린 effectiveSpeed: ${goblin.effectiveSpeed.toFixed(1)} (기대 비율: 약 3배)`);
console.log(`속도 비율: ${(goblin.effectiveSpeed / hero.effectiveSpeed).toFixed(2)}`);

const engine = new BattleEngine([hero], [goblin]);
const result = engine.startBattle(15);

console.log("\n==================================================");
console.log("사후 검증");
console.log("==================================================");
console.log("결과:", JSON.stringify(result));
console.log(`용사의 "패링" 슬롯(0번) 발동 횟수: ${hero.slotTriggerCounts[0]} (여러 번 발동해야 함)`, hero.slotTriggerCounts[0] > 1 ? "✅" : "❌");
