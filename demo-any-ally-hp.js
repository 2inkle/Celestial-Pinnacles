// ANY_ALLY_HP_LESS_THAN_PCT — MY_HP_LESS_THAN_PCT의 파티 전체 버전 검증.
const { BattleCharacter } = require("./src/character");
const { ConditionRegistry } = require("./src/registries");

console.log("==================================================");
console.log("ANY_ALLY_HP_LESS_THAN_PCT — 자기 진영 중 누군가라도 HP%가");
console.log("낮으면 true(자기 자신 여부와 무관)");
console.log("==================================================");

const healer = new BattleCharacter("힐러", "ally", { str: 10, int: 10, dex: 10, spd: 10, luk: 10 });
const tank = new BattleCharacter("탱커", "ally", { str: 10, int: 10, dex: 10, spd: 10, luk: 10 });
const dps = new BattleCharacter("딜러", "ally", { str: 10, int: 10, dex: 10, spd: 10, luk: 10 });
const enemy = new BattleCharacter("적", "enemy", { str: 10, int: 10, dex: 10, spd: 10, luk: 10 });
const ctx = { allies: [healer, tank, dps], enemies: [enemy] };

console.log("\n[1] 전원 풀피일 때 — false");
{
  const r = ConditionRegistry.check("ANY_ALLY_HP_LESS_THAN_PCT", healer, ctx, 70);
  console.log(`  ${r} (기대값 false)`, r === false ? "✅" : "❌");
}

console.log("\n[2] 힐러 자신이 아니라 '탱커'가 70% 아래로 떨어졌을 때 — true(자기 자신이 멀쩡해도 감지)");
{
  tank.currentHp = Math.floor(tank.maxHp * 0.5);
  const r = ConditionRegistry.check("ANY_ALLY_HP_LESS_THAN_PCT", healer, ctx, 70);
  console.log(`  ${r} (기대값 true)`, r === true ? "✅" : "❌");
  tank.currentHp = tank.maxHp;
}

console.log("\n[3] 죽은 아군은 판정에서 제외되는지(isAlive 체크)");
{
  dps.currentHp = 0;
  const r = ConditionRegistry.check("ANY_ALLY_HP_LESS_THAN_PCT", healer, ctx, 70);
  console.log(`  ${r} (기대값 false — 죽은 유닛은 '위험'이 아니라 '이미 끝난 상태'라 카운트 안 함)`, r === false ? "✅" : "❌");
  dps.currentHp = dps.maxHp;
}

console.log("\n[4] enemy 쪽 유닛이 이 조건을 검사하면 enemy 진영끼리만 보는지");
{
  const enemy2 = new BattleCharacter("적2", "enemy", { str: 10, int: 10, dex: 10, spd: 10, luk: 10 });
  ctx.enemies.push(enemy2);
  enemy2.currentHp = Math.floor(enemy2.maxHp * 0.3);
  const r = ConditionRegistry.check("ANY_ALLY_HP_LESS_THAN_PCT", enemy, ctx, 70);
  console.log(`  ${r} (기대값 true, enemy 진영 내부에서만 판정)`, r === true ? "✅" : "❌");
}
