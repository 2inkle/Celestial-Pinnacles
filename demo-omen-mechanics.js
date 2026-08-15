const { BattleCharacter } = require("./src/character");
const { ActionRegistry, ConditionRegistry } = require("./src/registries");
const { FactionResourceManager } = require("./src/resourceManager");

console.log("==================================================");
console.log("'???' 궁극기(OMEN) 관련 신규 메커니즘 검증:");
console.log("RETREAT / PANIC_FULL_RECOVERY / MY_EFFECTIVE_STAT_COMPARE의");
console.log("thresholdPctOfReal 모드 / FACTION_RESOURCE_GREATER_THAN(자기 진영)");
console.log("==================================================");

function freshCtx() {
  const logs = [];
  const rm = new FactionResourceManager();
  rm.registerResource("ally", "MAGIC_CIRCLE", 0, 10);
  rm.registerResource("enemy", "MAGIC_CIRCLE", 0, 10);
  return { resourceManager: rm, log: (l) => logs.push(l), logs };
}

console.log("\n[1] RETREAT — 방어 파이프라인 없이 즉시 HP 0, 전투 이탈로 취급 가능");
{
  const boss = new BattleCharacter("???", "enemy", { str: 10, int: 10, dex: 10, spd: 10, luk: 10 });
  boss.currentHp = Math.floor(boss.maxHp * 0.25); // HP 30% 이하 상황 재현
  const ctx = freshCtx();
  ActionRegistry.execute("RETREAT", boss, ctx);
  console.log(`  전투 이탈 후 HP: ${boss.currentHp} (기대값 0)`, boss.currentHp === 0 ? "✅" : "❌");
  console.log(`  로그: "${ctx.logs[0]}"`);
}

console.log("\n[2] PANIC_FULL_RECOVERY — HP/SP 둘 다 최대치로 완전 회복, maxUses는 패턴 쪽 책임");
{
  const boss = new BattleCharacter("???", "enemy", { str: 10, int: 10, dex: 10, spd: 10, luk: 10 });
  boss.currentHp = Math.floor(boss.maxHp * 0.4);
  boss.currentSp = Math.floor(boss.maxSp * 0.1);
  const ctx = freshCtx();
  ActionRegistry.execute("PANIC_FULL_RECOVERY", boss, ctx);
  console.log(`  회복 후 HP: ${boss.currentHp}/${boss.maxHp}`, boss.currentHp === boss.maxHp ? "✅" : "❌");
  console.log(`  회복 후 SP: ${boss.currentSp}/${boss.maxSp}`, boss.currentSp === boss.maxSp ? "✅" : "❌");
}

console.log("\n[3] MY_EFFECTIVE_STAT_COMPARE — thresholdPctOfReal 모드(realMatk 100 기준 60% = 60)");
{
  const boss = new BattleCharacter("???", "enemy", { str: 10, int: 10, dex: 10, spd: 10, luk: 10 });
  boss.realMatk = 100;

  boss.bonusMatk = 0; // effectiveMatk = 100 (60 이상)
  const notTriggered = ConditionRegistry.check("MY_EFFECTIVE_STAT_COMPARE", boss, {}, { stat: "matk", comparator: "lt", thresholdPctOfReal: 60 });
  console.log(`  effectiveMatk=100, 60%(=60) 미만? ${notTriggered} (기대값 false)`, notTriggered === false ? "✅" : "❌");

  boss.bonusMatk = -45; // effectiveMatk = 55 (< 60)
  const triggered = ConditionRegistry.check("MY_EFFECTIVE_STAT_COMPARE", boss, {}, { stat: "matk", comparator: "lt", thresholdPctOfReal: 60 });
  console.log(`  effectiveMatk=${boss.effectiveMatk}, 60%(=60) 미만? ${triggered} (기대값 true)`, triggered === true ? "✅" : "❌");

  console.log(`\n  [3-1] Arcane Surge(combatStatUpPercent matk +150) 발동 후 조건이 다시 거짓이 되는지(무한루프 방지 확인)`);
  const { applyEffect } = require("./src/skillResolution");
  const ctx = freshCtx();
  applyEffect(boss, boss, { type: "combatStatUpPercent", stat: "matk", value: 150 }, ctx);
  const afterBuff = ConditionRegistry.check("MY_EFFECTIVE_STAT_COMPARE", boss, {}, { stat: "matk", comparator: "lt", thresholdPctOfReal: 60 });
  console.log(`  버프 후 effectiveMatk=${boss.effectiveMatk}, 60% 미만? ${afterBuff} (기대값 false — 재발동 안 함)`, afterBuff === false ? "✅" : "❌");
}

console.log("\n[4] FACTION_RESOURCE_GREATER_THAN — 자기 진영 마법진 5개 이상(OMEN 게이팅)");
{
  const boss = new BattleCharacter("???", "enemy", { str: 10, int: 10, dex: 10, spd: 10, luk: 10 });
  const ctx = freshCtx();
  ctx.resourceManager.addResource("enemy", "MAGIC_CIRCLE", 4);
  const before = ConditionRegistry.check("FACTION_RESOURCE_GREATER_THAN", boss, ctx, { resource: "magicCircle", amount: 5 });
  console.log(`  4개 상태에서 5개 이상? ${before} (기대값 false)`, before === false ? "✅" : "❌");
  ctx.resourceManager.addResource("enemy", "MAGIC_CIRCLE", 1);
  const after = ConditionRegistry.check("FACTION_RESOURCE_GREATER_THAN", boss, ctx, { resource: "magicCircle", amount: 5 });
  console.log(`  5개 상태에서 5개 이상? ${after} (기대값 true)`, after === true ? "✅" : "❌");
}

console.log("\n[5] OMEN 스킬의 teamResource 코스트가 실제로 마법진 5개를 소모하는지(costs 파이프라인)");
{
  const { checkAffordability, payCosts } = require("./src/prepState");
  const boss = new BattleCharacter("???", "enemy", { str: 10, int: 10, dex: 10, spd: 10, luk: 10 });
  const ctx = freshCtx();
  ctx.resourceManager.addResource("enemy", "MAGIC_CIRCLE", 5);
  const costs = [{ type: "teamResource", resource: "magicCircle", amount: 5 }];
  const afford = checkAffordability(boss, costs, ctx.resourceManager);
  console.log(`  코스트 감당 가능? ${afford.ok} (기대값 true)`, afford.ok ? "✅" : "❌");
  payCosts(boss, costs, ctx.resourceManager);
  const left = ctx.resourceManager.getResource("enemy", "MAGIC_CIRCLE");
  console.log(`  차감 후 남은 마법진: ${left} (기대값 0)`, left === 0 ? "✅" : "❌");
  const afterAfford = checkAffordability(boss, costs, ctx.resourceManager);
  console.log(`  소모 직후엔 5개 코스트 다시 감당 불가(재발동 방지 확인)? ${!afterAfford.ok} (기대값 true)`, !afterAfford.ok ? "✅" : "❌");
}
