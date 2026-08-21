// 집속 마력(focusMana) 관련 3건 회귀 검증. 2026-08-22 사용자 신고:
//   ①Vortex Overload가 시전자가 아니라 피격 대상의 집속 마력을 지움
//   ②Corrupted Focus 스탠스로 집속 마력이 쌓이는데 전투 로그에 안 보임
//   ③현황판(턴마다 찍히는 상태 보드)에 개인 자원이 전혀 안 보임
const { BattleCharacter } = require("./src/character");
const { SkillRegistry } = require("./src/skillRegistry");
const { applyDamageAndEffects } = require("./src/skillResolution");
const { payCosts } = require("./src/prepState");
const { BattleEngine } = require("./src/engine");

function makeCtx(allies, enemies) {
  return {
    allies, enemies,
    getOpponents(actor) { return actor.side === "ally" ? this.enemies : this.allies; },
    log: (msg) => logs.push(msg),
  };
}
let logs = [];

let pass = 0, fail = 0;
function check(label, ok) {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

console.log("==================================================");
console.log("1) Vortex Overload — target:self 수정 후 시전자의 집속 마력만 소진됨");
console.log("==================================================");
SkillRegistry.register({
  name: "Vortex Overload", targetFaction: "enemy", targetCount: "single",
  skillType: "magic", stat: "int", coefficient: 7.5, hits: 7, costs: [],
  invalid: true, preDelay: 0, preDelayType: "action", postDelay: 0,
  effects: [
    { type: "statUpPercent", stat: "str", value: -5 },
    { type: "statUpPercent", stat: "int", value: -5 },
    { type: "statUpPercent", stat: "dex", value: -5 },
    { type: "drainPersonalResource", resource: "focusMana", target: "self" },
  ],
});
{
  logs = [];
  const boss = new BattleCharacter("고블린의 왕(둠로드)", "enemy", { int: 100 });
  boss.realMatk = 200;
  boss.personalResources.focusMana = { current: 1000, max: 1000 };
  const player = new BattleCharacter("플레이어", "ally", { str: 50, int: 50, dex: 50, def: 20, mdef: 20 });
  player.personalResources.focusMana = { current: 700, max: 1000 };

  const originalRandom = Math.random;
  Math.random = () => 0;
  applyDamageAndEffects(boss, SkillRegistry.get("Vortex Overload"), makeCtx([player], [boss]));
  Math.random = originalRandom;

  check("시전자(보스)의 집속 마력이 0으로 소진됨", boss.personalResources.focusMana.current === 0);
  check("피격 대상(플레이어)의 집속 마력은 그대로 유지됨(700)", player.personalResources.focusMana.current === 700);
  check("피격 대상의 STR/INT/DEX 디버프는 정상 적용됨(의도된 동작, 회귀 없음)", player.bonusStr < 0 && player.bonusInt < 0 && player.bonusDex < 0);
}

console.log("\n==================================================");
console.log("2) refillPersonalResource/drainPersonalResource 로그가 원문 키 대신 한글 라벨을 씀");
console.log("==================================================");
SkillRegistry.register({
  name: "재충전기", targetFaction: "self", targetCount: "single",
  skillType: "physical", costs: [], preDelay: 0, preDelayType: "action", postDelay: 0,
  effects: [{ type: "refillPersonalResource", resource: "focusMana" }],
});
{
  logs = [];
  const caster = new BattleCharacter("스펠마", "ally", {});
  caster.personalResources.focusMana = { current: 100, max: 1000 };
  applyDamageAndEffects(caster, SkillRegistry.get("재충전기"), makeCtx([caster], []));
  const line = logs.find((l) => l.includes("재충전"));
  check(`로그에 "focusMana" 원문이 아니라 "집속 마력" 라벨이 보임: "${line}"`, !!line && line.includes("집속 마력") && !line.includes("focusMana"));
}

console.log("\n==================================================");
console.log("3) applyResourceOnCost(스탠스로 SP를 쓰면 집속 마력이 쌓이는 경로) — 이제 로그가 남음");
console.log("==================================================");
{
  const actor = new BattleCharacter("둠로드", "ally", {});
  actor.currentSp = 1000;
  actor.personalResources.focusMana = { current: 0, max: 1000 };
  actor.stances.corruptedFocus = { resourceOnCost: { resource: "focusMana", costType: "sp", ratio: 0.5 } };

  const resourceLogs = payCosts(actor, [{ type: "sp", amount: 100 }], null);
  check("payCosts가 자원 증가 로그를 배열로 반환함(빈 배열 아님)", resourceLogs.length === 1);
  check(`로그 문구에 한글 라벨과 정확한 증가량(+50)이 포함됨: "${resourceLogs[0]}"`, resourceLogs[0].includes("집속 마력") && resourceLogs[0].includes("+50"));
  check("실제 자원도 정확히 50만큼 쌓임", actor.personalResources.focusMana.current === 50);

  const noStanceActor = new BattleCharacter("전사", "ally", {});
  noStanceActor.currentSp = 1000;
  const emptyLogs = payCosts(noStanceActor, [{ type: "sp", amount: 100 }], null);
  check("스탠스가 없는 유닛은 로그가 빈 배열(회귀 없음)", emptyLogs.length === 0);
}

console.log("\n==================================================");
console.log("4) renderStatusBoard — 개인 자원이 있는 유닛/없는 유닛/보스 세 경우");
console.log("==================================================");
{
  const doomlord = new BattleCharacter("둠로드", "ally", {});
  doomlord.personalResources.focusMana = { current: 350, max: 1000 };
  const warrior = new BattleCharacter("전사", "ally", {});
  const boss = new BattleCharacter("???", "enemy", {});
  boss.creatureTier = "boss";
  boss.personalResources.focusMana = { current: 800, max: 1000 }; // 보스도 이 값은 절대 노출되면 안 됨

  const statusLogs = [];
  const engine = new BattleEngine([doomlord, warrior], [boss], (l) => statusLogs.push(l));
  engine.currentTurn = 1;
  engine.renderStatusBoard();

  const doomlordLine = statusLogs.find((l) => l.includes("둠로드"));
  const warriorLine = statusLogs.find((l) => l.trim().startsWith("전사"));
  const bossLine = statusLogs.find((l) => l.includes("???") && l.includes("HP") === false && l.trim().startsWith("???"));

  check(`집속 마력 보유 유닛은 현황판에 수치가 보임: "${doomlordLine}"`, !!doomlordLine && doomlordLine.includes("집속 마력 350/1000"));
  check(`집속 마력이 없는 유닛은 그 항목 자체가 안 붙음(노이즈 없음): "${warriorLine}"`, !!warriorLine && !warriorLine.includes("집속 마력"));
  check(`보스는 여전히 "???"만 찍히고 집속 마력 수치가 절대 안 보임(회귀 없음)`, !!bossLine && !bossLine.includes("800") && !bossLine.includes("집속 마력"));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
