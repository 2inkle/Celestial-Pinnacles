const { BattleCharacter } = require("./src/character");
const { BattleEngine } = require("./src/engine");
const { SkillRegistry } = require("./src/skillRegistry");
const { ActionRegistry } = require("./src/registries");
const { applyEffect } = require("./src/skillResolution");

// ============================================================================
// 1) 이미 Guard 상태일 때 다시 Guard가 씌워지면 추가 레이어/메시지 없이
//    조용히 무시되는지 직접 확인(전투 없이 단위 테스트 형태로)
// ============================================================================
console.log("==================================================");
console.log("1) 이미 Guard 상태에서 재적용 시 조용히 무시되는지");
console.log("==================================================");

const dummy = new BattleCharacter("테스트", "ally", {});
const dummyCtx = { log: () => {} };

const desc1 = applyEffect(dummy, dummy, { type: "guard" }, dummyCtx);
console.log("1차 적용 후 isGuarding:", dummy.isGuarding, "/ 반환된 설명:", JSON.stringify(desc1));
console.log("첫 적용은 설명 문자열이 반환돼야 함:", desc1 ? "✅" : "❌");

const desc2 = applyEffect(dummy, dummy, { type: "guard" }, dummyCtx);
console.log("2차 적용(이미 Guard 상태) 반환값:", JSON.stringify(desc2));
console.log("추가 설명 없이 null이어야 함:", desc2 === null ? "✅" : "❌");

// ============================================================================
// 2) 고블린의 "공격"을 2연타 스킬로 만들고, 속도를 반전(용사가 빠름)시켜서
//    Guard가 다단히트 전체를 막는지 확인
// ============================================================================
console.log("\n==================================================");
console.log("2) 다단히트(2연타) 전체 차단 검증 — 속도 반전");
console.log("==================================================");

// 이번 데모 전용 2연타 액션 — 공용 ATTACK/공격을 건드리지 않고 별도로 등록
ActionRegistry.register("DOUBLE_ATTACK", (actor, ctx) => {
  const target = ctx.getOpponents(actor).find((e) => e.isAlive);
  if (!target) return 0;

  // ⚠ Guard 판정은 이 행동 전체에 대해 "딱 한 번만" — 히트마다 다시 판정하면
  // 첫 히트에서만 막히고 두 번째 히트는 이미 소모된 상태라 그냥 맞아버림.
  const blocked = target.checkAndConsumeGuard();
  if (blocked) {
    ctx.log(`   🛡️ ${target.name}이(가) 패링으로 2연타 공격을 전부 막아냈다! (1/2, 2/2 모두 무효화)`);
    return 0;
  }

  for (let hit = 1; hit <= 2; hit++) {
    if (!target.isAlive) break;
    const damage = Math.floor(actor.effectiveStr * 1.1);
    const isCrit = Math.random() * 100 <= actor.critRate;
    const finalDamage = isCrit ? Math.floor(damage * 1.5) : damage;
    const applied = target.takeDamage(finalDamage);
    ctx.log(`   ⚔️ [공격 ${hit}/2] ${actor.name} -> ${target.name} (${applied} 데미지${isCrit ? " 💥치명타!" : ""}) [남은 HP: ${target.currentHp}/${target.maxHp}]`);
  }
  return 0;
});

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

// 속도를 서로 반전: 지난번엔 용사가 느리고 고블린이 빨랐음 -> 이번엔 반대
const hero = new BattleCharacter("용사", "ally", { str: 20, spd: 200 });
hero.realAtk = 15;
hero.patternSlots = [
  { cond: "NOT_GUARDING", val: null, act: "패링" },
  { cond: "ALWAYS", val: 0, act: "ATTACK" },
];

const goblin = new BattleCharacter("고블린", "enemy", { str: 15, spd: 0 });
goblin.patternSlots = [{ cond: "ALWAYS", val: 0, act: "DOUBLE_ATTACK" }];

console.log(`용사 effectiveSpeed: ${hero.effectiveSpeed.toFixed(1)}`);
console.log(`고블린 effectiveSpeed: ${goblin.effectiveSpeed.toFixed(1)} (지난번과 반대로 용사가 더 빠름)`);
console.log(`속도 비율(용사/고블린): ${(hero.effectiveSpeed / goblin.effectiveSpeed).toFixed(2)}`);

const engine = new BattleEngine([hero], [goblin]);
const result = engine.startBattle(15);

console.log("\n==================================================");
console.log("사후 검증");
console.log("==================================================");
console.log("결과:", JSON.stringify(result));
console.log(`용사의 "패링" 슬롯(0번) 발동 횟수: ${hero.slotTriggerCounts[0]}`);
