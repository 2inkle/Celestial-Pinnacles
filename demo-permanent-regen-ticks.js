// 사용자 지적으로 발견: ManaRegen/Self Regeneration/Regene Heal/Regeneration/
// Spirit of Mana 6곳(2곳은 Regene Heal 안에 HP+SP 둘) 전부 applyTick에
// duration:1이 박혀있어서, "버프/디버프(리젠·틱데미지 포함)는 영구지속"이라는
// 이 게임의 확립된 규칙과 어긋나 있었다 — 한 번 틱하고 바로 소멸했음. 전부
// duration 필드를 제거(=Infinity 기본값)해서 고침. 이 데모는 그 수정이
// 실제로 "영구 지속"으로 동작하는지 엔진 레벨에서 검증한다.
const { BattleCharacter } = require("./src/character");
const { applyEffect } = require("./src/skillResolution");
const { BattleEngine } = require("./src/engine");

console.log("==================================================");
console.log("리젠류 tick 효과 영구지속 확인 (duration 미지정 = Infinity)");
console.log("==================================================");

console.log("\n[1] applyTick(duration 미지정) — remainingTicks가 Infinity인지");
{
  const target = new BattleCharacter("대상", "ally", { str: 10, int: 10, dex: 10, spd: 10, luk: 10 });
  applyEffect(target, target, { type: "applyTick", name: "HP리젠", kind: "hp", percentOfMax: 5 }, { log: () => {} });
  const tick = target.activeTicks.find((t) => t.name === "HP리젠");
  console.log(`  remainingTicks: ${tick.remainingTicks} (기대값 Infinity)`, tick.remainingTicks === Infinity ? "✅" : "❌");
}

console.log("\n[2] processActiveTicks를 여러 번(10회) 돌려도 tick이 안 사라지고 계속 발동하는지");
{
  const target = new BattleCharacter("대상", "ally", { str: 10, int: 10, dex: 10, spd: 10, luk: 10 });
  const enemy = new BattleCharacter("적", "enemy", { str: 10, int: 10, dex: 10, spd: 10, luk: 10 });
  const engine = new BattleEngine([target], [enemy], () => {});
  applyEffect(target, target, { type: "applyTick", name: "HP리젠", kind: "hp", percentOfMax: 5 }, { log: () => {} });
  target.currentHp = 10; // 낮춰두고 반복 회복되는지 확인
  let fireCount = 0;
  for (let i = 0; i < 10; i++) {
    target.currentHp = 10; // 매번 다시 깎아서 tick이 실제로 회복시키는지 확인
    engine.processActiveTicks(target);
    if (target.currentHp > 10) fireCount++;
  }
  console.log(`  10회 중 실제로 회복이 발동한 횟수: ${fireCount} (기대값 10 — 매번 발동)`, fireCount === 10 ? "✅" : "❌");
  const tick = target.activeTicks.find((t) => t.name === "HP리젠");
  console.log(`  10회 처리 후에도 tick이 남아있음: ${!!tick} (기대값 true)`, tick ? "✅" : "❌");
}

console.log("\n[3] 실제 라이브 소스(web/skill-table-editor.html의 LEGACY_SKILL_SEED)를 훑어서");
console.log("    리젠류 tick에 duration 필드가 하나도 안 남았는지 재확인");
{
  const path = require("path");
  const fs = require("fs");
  const html = fs.readFileSync(path.join(__dirname, "web/skill-table-editor.html"), "utf-8");
  const idx = html.indexOf("const LEGACY_SKILL_SEED");
  const braceStart = html.indexOf("{", idx);
  let depth = 0, i = braceStart;
  for (; i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}") { depth--; if (depth === 0) break; }
  }
  const seed = eval("(" + html.slice(braceStart, i + 1) + ")");
  const all = [...seed.commonSkills, ...Object.values(seed.jobSkills).flat()];
  const offenders = [];
  all.forEach((s) => {
    (s.effects || []).forEach((e) => {
      if (e.type === "applyTick" && e.duration != null) offenders.push(`${s.name}/${e.name}`);
    });
  });
  console.log(`  duration이 박혀있는 tick: ${offenders.length}개 ${JSON.stringify(offenders)} (기대값 0개)`, offenders.length === 0 ? "✅" : "❌");
}
