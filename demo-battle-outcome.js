const { BattleCharacter } = require("./src/character");
const { BattleEngine } = require("./src/engine");

// ============================================================================
// 1) 정상적으로 한쪽이 전멸하는 경우 — 승/패 판정 확인
// ============================================================================
console.log("==================================================");
console.log("1) 정상 승부 판정");
console.log("==================================================");

const strongAlly = new BattleCharacter("강한 아군", "ally", { str: 50, spd: 50 });
strongAlly.realAtk = 20;
strongAlly.patternSlots = [{ cond: "ALWAYS", val: 0, act: "ATTACK" }];

const weakEnemy = new BattleCharacter("약한 적", "enemy", { str: 5, spd: 10 });
weakEnemy.patternSlots = [{ cond: "ALWAYS", val: 0, act: "ATTACK" }];

const result1 = new BattleEngine([strongAlly], [weakEnemy], () => {}).startBattle(100);
console.log("결과:", JSON.stringify(result1), result1.outcome === "allyWin" ? "✅ 아군 승리로 정확히 판정" : "❌");

// ============================================================================
// 2) 양쪽 다 못 죽이고 턴 소진 — 무승부 판정 확인
// ============================================================================
console.log("\n==================================================");
console.log("2) 턴 소진 시 무승부 판정");
console.log("==================================================");

const tankA = new BattleCharacter("불멸의 아군", "ally", { str: 10, spd: 10 });
tankA.realAtk = 0;
tankA.patternSlots = []; // 아무 패턴도 없어서 매번 PASS(0-딜레이) -> 데미지 없음

const tankB = new BattleCharacter("불멸의 적", "enemy", { str: 10, spd: 10 });
tankB.realAtk = 0;
tankB.patternSlots = [];

const result2 = new BattleEngine([tankA], [tankB], () => {}).startBattle(5);
console.log("결과:", JSON.stringify(result2), result2.outcome === "draw" && result2.turnsElapsed === 5 ? "✅ 5턴 소진 후 무승부" : "❌");

// ============================================================================
// 3) 개전 패턴 — 이제 액션에 하드코딩된 제한이 아니라, 패턴 자체의
//    "AND(턴수 조건 + 슬롯 사용횟수 조건)"으로 "1회까지만 반드시" 발동시킴
// ============================================================================
console.log("\n==================================================");
console.log("3) 개전 패턴 — AND + SLOT_USE_COUNT_LESS_THAN으로 1회 제한 검증");
console.log("==================================================");

const tankC = new BattleCharacter("불멸의 아군2", "ally", { str: 10, spd: 10 });
tankC.realAtk = 0;
tankC.patternSlots = [];

const gimmickBoss = new BattleCharacter("개전 기믹 보스", "enemy", { str: 10, spd: 10 });
gimmickBoss.realAtk = 0;
gimmickBoss.patternSlots = [
  {
    cond: "AND",
    val: [
      { cond: "BATTLE_TURN_AT_LEAST", val: 2 },
      { cond: "SLOT_USE_COUNT_LESS_THAN", val: 1 }, // 이 슬롯 자체는 1회까지만 반드시
    ],
    act: "EXTEND_BATTLE_LIMIT",
  },
  { cond: "ALWAYS", val: 0, act: "USE_POTION" }, // 확장 다 쓰고 나면 그냥 무해한 행동으로 대체
];

const engine3 = new BattleEngine([tankC], [gimmickBoss], () => {});
const result3 = engine3.startBattle(3);

console.log("결과:", JSON.stringify(result3));
console.log("기본 3턴 -> 53턴으로 정확히 1회만 늘어남:", engine3.maxTurns === 53 ? "✅" : `❌ (실제 ${engine3.maxTurns})`);
console.log("슬롯[0] 발동 횟수가 정확히 1회:", gimmickBoss.slotTriggerCounts[0] === 1 ? "✅" : `❌ (${gimmickBoss.slotTriggerCounts[0]})`);
console.log("결국 53턴 소진 후 무승부:", result3.outcome === "draw" && result3.turnsElapsed === 53 ? "✅" : `❌ (${result3.outcome}, ${result3.turnsElapsed}턴)`);

// ============================================================================
// 3-1) 말씀하신 예시 — "HP 50% 미만" AND "1회까지 반드시" -> U.Item류 사용
//      (U.Item 실배선 전이라 개념적으로 동일한 USE_POTION으로 대체 검증)
// ============================================================================
console.log("\n==================================================");
console.log("3-1) 'HP 50% 미만 + 1회까지 반드시 + 아이템 사용' 패턴 검증");
console.log("==================================================");

const desperateHealer = new BattleCharacter("벼랑 끝 힐러", "ally", { str: 10, spd: 30 });
desperateHealer.realAtk = 0;
desperateHealer.patternSlots = [
  {
    cond: "AND",
    val: [
      { cond: "MY_HP_LESS_THAN_PCT", val: 50 },
      { cond: "SLOT_USE_COUNT_LESS_THAN", val: 1 },
    ],
    act: "USE_POTION",
  },
  { cond: "ALWAYS", val: 0, act: "ATTACK" },
];

const attacker2 = new BattleCharacter("적 공격수", "enemy", { str: 30, spd: 20 });
attacker2.realAtk = 15;
attacker2.patternSlots = [{ cond: "ALWAYS", val: 0, act: "ATTACK" }];

console.log(`힐러 Max HP: ${desperateHealer.maxHp}`);
const engine4 = new BattleEngine([desperateHealer], [attacker2], () => {});
const result4 = engine4.startBattle(20);
console.log("결과:", JSON.stringify(result4));
console.log("포션 슬롯(0번)이 딱 1번만 발동:", desperateHealer.slotTriggerCounts[0] === 1 ? "✅" : `❌ (${desperateHealer.slotTriggerCounts[0] || 0})`);

// ============================================================================
// 4) 절대 상한(ABSOLUTE_MAX_TURNS) 검증
// ============================================================================
console.log("\n==================================================");
console.log("4) 절대 상한 클램프 검증");
console.log("==================================================");

const { ActionRegistry } = require("./src/registries");
const dummyActor = { name: "테스트", side: "enemy", effectiveSpeed: 10 };
const dummyCtx = { maxTurns: 280, constructor: BattleEngine, log: () => {}, getOpponents: () => [] };

ActionRegistry.execute("EXTEND_BATTLE_LIMIT", dummyActor, dummyCtx);
console.log("280 + 50 = 330이어야 하지만 절대 상한 300에서 캡됨:", dummyCtx.maxTurns === 300 ? "✅" : `❌ (${dummyCtx.maxTurns})`);

ActionRegistry.execute("EXTEND_BATTLE_LIMIT", dummyActor, dummyCtx);
console.log("반복 호출해도(300+50) 절대 상한 300을 넘지 않음:", dummyCtx.maxTurns === 300 ? "✅" : "❌");
