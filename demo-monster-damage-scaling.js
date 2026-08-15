// 몬스터의 대인(유저 tier) 데미지 일괄 축소(passiveMods.damageDealtTo_userPct)
// 검증. buildEnemyFromMonsterKey에 monsterDef.passiveMods 지원을 새로
// 추가했으므로, 실제로 ATTACK 데미지가 1/10로 줄어드는지 엔진 레벨에서 확인.
const { BattleCharacter } = require("./src/character");
const { ActionRegistry } = require("./src/registries");

console.log("==================================================");
console.log("passiveMods.damageDealtTo_userPct — 몬스터의 대인 데미지 일괄 축소");
console.log("==================================================");

function freshCtx(allies, enemies) {
  const logs = [];
  return {
    log: (l) => logs.push(l), logs, recordDamageDealt: () => {},
    allies, enemies,
    getOpponents: (actor) => (actor.side === "ally" ? enemies : allies),
  };
}

console.log("\n[1] passiveMods 없음 — 기존과 동일하게 정상 데미지");
{
  const boss = new BattleCharacter("보스", "enemy", { str: 100, int: 10, dex: 10, spd: 10, luk: 0 });
  boss.realAtk = 1000;
  const user = new BattleCharacter("유저", "ally", { str: 10, int: 10, dex: 10, spd: 10, luk: 10 });
  const before = user.currentHp;
  ActionRegistry.execute("ATTACK", boss, freshCtx([user], [boss]));
  const dealt = before - user.currentHp;
  console.log(`  피해량: ${dealt} (기대값 > 0)`, dealt > 0 ? "✅" : "❌");
  global.__baselineDealt = dealt;
}

console.log("\n[2] passiveMods.damageDealtTo_userPct: -90 — 정확히 1/10로 축소");
{
  const boss = new BattleCharacter("보스", "enemy", { str: 100, int: 10, dex: 10, spd: 10, luk: 0 });
  boss.realAtk = 1000;
  boss.passiveMods.damageDealtTo_userPct = -90;
  const user = new BattleCharacter("유저", "ally", { str: 10, int: 10, dex: 10, spd: 10, luk: 10 });
  const before = user.currentHp;
  ActionRegistry.execute("ATTACK", boss, freshCtx([user], [boss]));
  const dealt = before - user.currentHp;
  const expected = Math.round(global.__baselineDealt * 0.1);
  console.log(`  피해량: ${dealt} (기대값 ≈ ${expected}, 기존의 1/10)`, Math.abs(dealt - expected) <= 1 ? "✅" : "❌");
}

console.log("\n[3] creatureTier가 'user'가 아닌 대상(소환수 등)에겐 안 걸리는지");
{
  const boss = new BattleCharacter("보스", "enemy", { str: 100, int: 10, dex: 10, spd: 10, luk: 0 });
  boss.realAtk = 1000;
  boss.passiveMods.damageDealtTo_userPct = -90;
  const summon = new BattleCharacter("소환수", "ally", { str: 10, int: 10, dex: 10, spd: 10, luk: 10 });
  summon.creatureTier = "creature";
  const before = summon.currentHp;
  ActionRegistry.execute("ATTACK", boss, freshCtx([summon], [boss]));
  const dealt = before - summon.currentHp;
  console.log(`  소환수(creatureTier:creature) 피해량: ${dealt} (기대값 ≈ 기존 그대로 ${global.__baselineDealt})`, Math.abs(dealt - global.__baselineDealt) <= 1 ? "✅" : "❌");
}

console.log("\n[4] buildEnemyFromMonsterKey가 monsterDef.passiveMods를 실제로 심는지");
{
  const path = require("path");
  const { loadAdapterEnv } = require("./simulate.js");
  const env = loadAdapterEnv({ baseDir: __dirname });
  const monsterTable = {
    test_boss: {
      id: "test_boss", name: "테스트보스", realStats: { str: 10, int: 10, dex: 10, spd: 10, luk: 10 },
      combatReal: { atk: 10 }, passiveMods: { damageDealtTo_userPct: -90 }, patterns: [],
    },
  };
  const enemy = env.BattleAdapter.buildEnemyFromMonsterKey(monsterTable, "test_boss", 0);
  console.log(`  passiveMods: ${JSON.stringify(enemy.passiveMods)} (기대값 damageDealtTo_userPct: -90 포함)`, enemy.passiveMods.damageDealtTo_userPct === -90 ? "✅" : "❌");
}
