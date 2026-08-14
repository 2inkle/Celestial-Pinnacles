const { BattleCharacter } = require("./src/character");
const { SkillRegistry } = require("./src/skillRegistry");
const { applyDamageAndEffects, applyEffect } = require("./src/skillResolution");

// ============================================================================
// Shield는 Guard와 짝을 이루는 별개 개념 — "이 공격 전체"가 아니라 "받는 피해
// 판정 N회"를 정확히 무효화함. 히트마다 독립적으로 소모되므로, 다단히트
// 스킬을 맞으면 딱 N히트만 막히고 나머지는 정상적으로 들어감.
// 우선순위: Guard가 있으면 Guard가 먼저 막고, Shield는 안 깎임(보험으로 보존).
// ============================================================================

SkillRegistry.register({
  name: "4연타",
  targetFaction: "enemy",
  targetCount: "all",
  skillType: "physical",
  stat: "str",
  coefficient: 1.0,
  costs: [],
  hits: 4,
  preDelay: 0,
  preDelayType: "action",
  postDelay: 0,
  effects: [],
});

console.log("==================================================");
console.log("1) Shield 단독 — N=1이면 4히트 중 딱 1히트만 막힘");
console.log("==================================================");
{
  const attacker = new BattleCharacter("공격자", "ally", { str: 20, spd: 10 });
  attacker.realAtk = 20;
  const target = new BattleCharacter("보호막대상", "enemy", { str: 1, spd: 1 });
  applyEffect(target, target, { type: "shield", charges: 1, shieldType: "all" }, { log: () => {} });

  const logs = [];
  const ctx = { allies: [attacker], enemies: [target], getOpponents: () => [target], log: (l) => logs.push(l), recordDamageDealt: () => {} };
  applyDamageAndEffects(attacker, SkillRegistry.get("4연타"), ctx);
  logs.forEach((l) => console.log(" " + l.trim()));

  const shieldBlocks = logs.filter((l) => l.includes("Shield")).length;
  const damageHits = logs.filter((l) => l.includes("데미지")).length;
  console.log(`Shield 무효화 1회: ${shieldBlocks === 1 ? "✅" : "❌"} (실제 ${shieldBlocks})`);
  console.log(`나머지 3히트는 정상 적중: ${damageHits === 3 ? "✅" : "❌"} (실제 ${damageHits})`);
  console.log(`전투 종료 후 shieldCharges: ${target.shieldCharges} (0이어야 함)`);
}

console.log("\n==================================================");
console.log("2) Guard+Shield 동시 보유 — Guard가 우선, 이 스킬 전체를 막고 Shield는 안 건드려짐");
console.log("==================================================");
{
  const attacker = new BattleCharacter("공격자2", "ally", { str: 20, spd: 10 });
  attacker.realAtk = 20;
  const target = new BattleCharacter("이중방어대상", "enemy", { str: 1, spd: 1 });
  applyEffect(target, target, { type: "guard", guardType: "all" }, { log: () => {} });
  applyEffect(target, target, { type: "shield", charges: 1, shieldType: "all" }, { log: () => {} });

  const logs = [];
  const ctx = { allies: [attacker], enemies: [target], getOpponents: () => [target], log: (l) => logs.push(l), recordDamageDealt: () => {} };
  applyDamageAndEffects(attacker, SkillRegistry.get("4연타"), ctx);
  logs.forEach((l) => console.log(" " + l.trim()));

  const guardBlocks = logs.filter((l) => l.includes("Guard")).length;
  console.log(`Guard가 4히트 전부 막음: ${guardBlocks === 4 ? "✅" : "❌"} (실제 ${guardBlocks})`);
  console.log(`Shield는 안 깎임(여전히 1, 다음 공격에 대한 보험): ${target.shieldCharges === 1 ? "✅" : "❌"} (실제 ${target.shieldCharges})`);

  // 다음 공격(Guard 소모된 상태) — 이번엔 Shield가 실제로 막아줘야 함
  const logs2 = [];
  const ctx2 = { ...ctx, log: (l) => logs2.push(l) };
  applyDamageAndEffects(attacker, SkillRegistry.get("4연타"), ctx2);
  const shieldBlocks2 = logs2.filter((l) => l.includes("Shield")).length;
  console.log(`다음 공격에서 보존해둔 Shield가 실제로 1회 막아줌: ${shieldBlocks2 === 1 ? "✅" : "❌"} (실제 ${shieldBlocks2})`);
}

console.log("\n==================================================");
console.log("3) Shield 재적용 시 중첩(추가) 안 됨 — Guard와 동일 규칙");
console.log("==================================================");
{
  const t = new BattleCharacter("비중첩테스트", "ally", { str: 1, spd: 1 });
  const desc1 = applyEffect(t, t, { type: "shield", charges: 1, shieldType: "all" }, { log: () => {} });
  console.log("1차 적용 설명:", JSON.stringify(desc1));
  const desc2 = applyEffect(t, t, { type: "shield", charges: 5, shieldType: "all" }, { log: () => {} });
  console.log("2차 적용(이미 보유) 설명:", JSON.stringify(desc2));
  console.log(`charges가 1로 유지(5로 늘지 않음): ${t.shieldCharges === 1 ? "✅" : "❌"} (실제 ${t.shieldCharges})`);
}
