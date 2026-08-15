const { BattleCharacter } = require("./src/character");
const { applyEffect } = require("./src/skillResolution");
const { FactionResourceManager } = require("./src/resourceManager");

console.log("==================================================");
console.log("stealTeamResource — 상대 진영 자원을 지우고, 지우는 데 성공했을");
console.log("때만(=실제 변동 발생) 그 대가로 시전자 진영에 같은 자원을 적립");
console.log("==================================================");

function freshCtx() {
  const rm = new FactionResourceManager();
  rm.registerResource("ally", "MAGIC_CIRCLE", 0, 10);
  rm.registerResource("enemy", "MAGIC_CIRCLE", 0, 10);
  return { resourceManager: rm };
}

const enemyCaster = new BattleCharacter("???", "enemy", { str: 10, int: 10, dex: 10, spd: 10, luk: 10 });
const dummyTarget = new BattleCharacter("더미", "enemy", { str: 10, int: 10, dex: 10, spd: 10, luk: 10 });

console.log("\n[1] 상대(ally) 진영에 마법진이 있을 때 — 삭제 성공 + 자기 진영 적립까지");
{
  const ctx = freshCtx();
  ctx.resourceManager.addResource("ally", "MAGIC_CIRCLE", 3);
  const line = applyEffect(enemyCaster, dummyTarget, { type: "stealTeamResource", resource: "magicCircle" }, ctx);
  const allyLeft = ctx.resourceManager.getResource("ally", "MAGIC_CIRCLE");
  const enemyGained = ctx.resourceManager.getResource("enemy", "MAGIC_CIRCLE");
  console.log(`  로그: "${line}"`);
  console.log(`  ally 진영 남은 마법진: ${allyLeft} (기대값 2)`, allyLeft === 2 ? "✅" : "❌");
  console.log(`  enemy(시전자) 진영 마법진: ${enemyGained} (기대값 1)`, enemyGained === 1 ? "✅" : "❌");
  console.log(`  로그가 null이 아님`, line !== null ? "✅" : "❌");
}

console.log("\n[2] 상대 진영에 마법진이 하나도 없을 때 — 삭제 자체가 불발, 내 쪽도 적립 안 됨");
{
  const ctx = freshCtx(); // ally MAGIC_CIRCLE = 0
  const line = applyEffect(enemyCaster, dummyTarget, { type: "stealTeamResource", resource: "magicCircle" }, ctx);
  const allyLeft = ctx.resourceManager.getResource("ally", "MAGIC_CIRCLE");
  const enemyGained = ctx.resourceManager.getResource("enemy", "MAGIC_CIRCLE");
  console.log(`  로그: ${line}`);
  console.log(`  로그가 null(불발, 로그 자체를 안 남김)`, line === null ? "✅" : "❌");
  console.log(`  ally 진영 마법진 변동 없음: ${allyLeft} (기대값 0)`, allyLeft === 0 ? "✅" : "❌");
  console.log(`  enemy(시전자) 진영도 변동 없음: ${enemyGained} (기대값 0)`, enemyGained === 0 ? "✅" : "❌");
}

console.log("\n[3] eraseAmount/gainAmount를 분리 지정 — 상대 것 2개 지우고 자긴 1개만 얻는 비대칭 조합도 가능");
{
  const ctx = freshCtx();
  ctx.resourceManager.addResource("ally", "MAGIC_CIRCLE", 3);
  const line = applyEffect(enemyCaster, dummyTarget, { type: "stealTeamResource", resource: "magicCircle", eraseAmount: 2, gainAmount: 1 }, ctx);
  const allyLeft = ctx.resourceManager.getResource("ally", "MAGIC_CIRCLE");
  const enemyGained = ctx.resourceManager.getResource("enemy", "MAGIC_CIRCLE");
  console.log(`  로그: "${line}"`);
  console.log(`  ally 진영 남은 마법진: ${allyLeft} (기대값 1)`, allyLeft === 1 ? "✅" : "❌");
  console.log(`  enemy(시전자) 진영 마법진: ${enemyGained} (기대값 1)`, enemyGained === 1 ? "✅" : "❌");
}

console.log("\n[4] 시전자가 ally측일 때도 방향이 자동으로 뒤집히는지(상대=enemy가 됨)");
{
  const ctx = freshCtx();
  ctx.resourceManager.addResource("enemy", "MAGIC_CIRCLE", 5);
  const allyCaster = new BattleCharacter("인퀴지터", "ally", { str: 10, int: 10, dex: 10, spd: 10, luk: 10 });
  const line = applyEffect(allyCaster, dummyTarget, { type: "stealTeamResource", resource: "magicCircle" }, ctx);
  const enemyLeft = ctx.resourceManager.getResource("enemy", "MAGIC_CIRCLE");
  const allyGained = ctx.resourceManager.getResource("ally", "MAGIC_CIRCLE");
  console.log(`  로그: "${line}"`);
  console.log(`  enemy 진영 남은 마법진: ${enemyLeft} (기대값 4)`, enemyLeft === 4 ? "✅" : "❌");
  console.log(`  ally(시전자) 진영 마법진: ${allyGained} (기대값 1)`, allyGained === 1 ? "✅" : "❌");
}
