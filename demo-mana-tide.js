// "???"의 SP 자가재생 기믹: SP를 낮추는 공략은 한두 번은 유효하지만, SP가
// 일정 % 이하로 떨어지면 영구 재생 tick이 걸려서 이후로는 SP 디버프가
// 사실상 무효해진다는 설계 검증.
const { BattleCharacter } = require("./src/character");
const { ConditionRegistry } = require("./src/registries");
const { applyEffect } = require("./src/skillResolution");

console.log("==================================================");
console.log("Mana Tide — MY_SP_LESS_THAN_PCT 조건 + SP 영구 재생 tick");
console.log("==================================================");

const boss = new BattleCharacter("???", "enemy", { str: 10, int: 10, dex: 10, spd: 10, luk: 10 });

console.log("\n[1] MY_SP_LESS_THAN_PCT — SP 충분할 때는 false, 20% 이하면 true");
{
  boss.currentSp = boss.maxSp; // 100%
  const full = ConditionRegistry.check("MY_SP_LESS_THAN_PCT", boss, {}, 20);
  console.log(`  SP 100%일 때 20% 이하? ${full} (기대값 false)`, full === false ? "✅" : "❌");

  boss.currentSp = Math.floor(boss.maxSp * 0.15); // 15%
  const low = ConditionRegistry.check("MY_SP_LESS_THAN_PCT", boss, {}, 20);
  console.log(`  SP 15%일 때 20% 이하? ${low} (기대값 true)`, low === true ? "✅" : "❌");
}

console.log("\n[2] Mana Tide 발동 — SP에 영구(duration 미지정=Infinity) 재생 tick이 걸리는지");
{
  const ctx = { log: () => {} };
  applyEffect(boss, boss, { type: "applyTick", kind: "sp", percentOfMax: 15, name: "마력의 조류" }, ctx);
  const tick = boss.activeTicks.find((t) => t.name === "마력의 조류");
  console.log(`  tick 등록됨? ${!!tick}`, tick ? "✅" : "❌");
  console.log(`  kind: ${tick.kind} (기대값 sp)`, tick.kind === "sp" ? "✅" : "❌");
  console.log(`  틱당 회복량: ${tick.amountPerTick} (maxSp의 15% = ${Math.floor(boss.maxSp * 0.15)})`, tick.amountPerTick === Math.floor(boss.maxSp * 0.15) ? "✅" : "❌");
  console.log(`  remainingTicks: ${tick.remainingTicks} (기대값 Infinity — 영구)`, tick.remainingTicks === Infinity ? "✅" : "❌");
}

console.log("\n[3] 실제 tick 처리(BattleEngine.processActiveTicks 재현) — SP를 계속 깎아도 재생이 계속 상쇄");
{
  const { BattleEngine } = require("./src/engine");
  const ally = new BattleCharacter("아군", "ally", { str: 10, int: 10, dex: 10, spd: 10, luk: 10 });
  const engine = new BattleEngine([ally], [boss], () => {});
  boss.currentSp = Math.floor(boss.maxSp * 0.1); // 10% — 이미 위급한 상태에서 재생 tick이 걸려있다고 가정
  boss.activeTicks = [{ name: "마력의 조류", kind: "sp", amountPerTick: Math.floor(boss.maxSp * 0.15), remainingTicks: Infinity }];

  // 파티가 SP 디버프를 걸어 SP를 0까지 깎아도(spDown류) 다음 tick 한 번이면 다시 15%만큼 채워짐을 확인
  boss.currentSp = 0;
  engine.processActiveTicks(boss);
  console.log(`  SP 0에서 tick 1회 처리 후: ${boss.currentSp} (기대값 ${Math.floor(boss.maxSp * 0.15)})`, boss.currentSp === Math.floor(boss.maxSp * 0.15) ? "✅" : "❌");

  boss.currentSp = 0;
  engine.processActiveTicks(boss);
  console.log(`  다시 0으로 깎여도 또 tick으로 회복(무한 재생 확인): ${boss.currentSp}`, boss.currentSp === Math.floor(boss.maxSp * 0.15) ? "✅" : "❌");

  const tickAfter = boss.activeTicks.find((t) => t.name === "마력의 조류");
  console.log(`  tick 자체는 여전히 남아있음(remainingTicks: ${tickAfter.remainingTicks}, 기대값 Infinity)`, tickAfter.remainingTicks === Infinity ? "✅" : "❌");
}
