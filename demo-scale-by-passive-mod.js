// %버프 효과(statUpPercent/combatStatUpPercent/maxHpUpPercent)의 base
// effect.value를 시전자의 특정 passiveMod 값에 비례해 곱셈으로 증폭하는
// 범용 메커니즘(effect.scaleByPassiveMod + effect.scaleFactor) 검증.
// 2026-08-24: FullAssist(하이드루이드) 스킬의 note에 "치유숙련에 비례하여
// 효과 증가, 초기 INT와 치유숙련에 비례하여 한계 증가"가 미구현으로 남아
// 있던 것을 해소 — "치유숙련"을 이미 구현된 healingDealtPct(가하는
// 회복량%)로 치환하고, FullAssist 하나에 하드코딩하지 않고 재사용 가능한
// 범용 엔진 메커니즘으로 만듦(grantPassiveMod의 scaleByStat+scaleFactor
// 관례를 그대로 재사용).
//
// 공식(사용자가 직접 제시한 예시 수치로 확정, 곱셈): 최종% = base% ×
// (1 + 시전자 healingDealtPct% / 100). 예: base 40, healingDealtPct 30
// → 40 × 1.3 = 52.
//
// 상한: 별도 캡 시스템을 새로 안 만들고 기존 전역 캡
// (src/character.js의 calculateEffectiveStat, real×5=500%)에 위임 —
// 이 캡은 bonusStr 등에 값을 더하는 시점이 아니라 effectiveStr 같은
// getter가 "읽는" 시점에 적용되므로, 아무리 큰 scaleByPassiveMod 값을
// 넣어도 bonusStr 자체는 그대로 커지되 effectiveStr은 real×5를 못 넘는다
// — 이 구분을 그대로 검증한다.
const { BattleCharacter } = require("./src/character");
const { SkillRegistry } = require("./src/skillRegistry");
const { applyDamageAndEffects } = require("./src/skillResolution");

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
console.log("1) scaleByPassiveMod 없는 기존 statUpPercent — 완전히 회귀 없음");
console.log("==================================================");
SkillRegistry.register({
  name: "기존버프(스케일없음)", targetFaction: "ally", targetCount: "single",
  skillType: "magic", stat: "int", coefficient: 0, costs: [],
  preDelay: 0, preDelayType: "action", postDelay: 0,
  effects: [{ type: "statUpPercent", stat: "str", value: 40 }],
});
{
  logs = [];
  const caster = new BattleCharacter("시전자", "ally", { int: 10 });
  caster.passiveMods.healingDealtPct = 999; // 스케일 필드가 없으므로 무관해야 함
  const ally = new BattleCharacter("전사", "ally", { str: 100 });
  applyDamageAndEffects(caster, SkillRegistry.get("기존버프(스케일없음)"), makeCtx([ally], []));
  const joined = logs.join(" ");
  check("정확히 기존과 동일한 40% 증가(시전자 healingDealtPct와 무관)", ally.bonusStr === Math.floor(100 * 0.40));
  check(`로그에 "+40%"로 그대로 표시(스케일 언급 없음)`, joined.includes("STR +40%"));
}

console.log("\n==================================================");
console.log("2) FullAssist형 버프, healingDealtPct=0 — 기존과 동일한 40%(변경 없음 재확인)");
console.log("==================================================");
SkillRegistry.register({
  name: "FullAssist형", targetFaction: "ally", targetCount: "all",
  skillType: "magic", stat: "int", coefficient: 0, costs: [],
  preDelay: 0, preDelayType: "action", postDelay: 0,
  effects: [
    { type: "statUpPercent", stat: "str", value: 40, scaleByPassiveMod: "healingDealtPct", scaleFactor: 1 },
  ],
});
{
  logs = [];
  const caster = new BattleCharacter("하이드루이드", "ally", { int: 10 }); // passiveMods.healingDealtPct 미설정 -> 0
  const ally = new BattleCharacter("전사", "ally", { str: 100 });
  applyDamageAndEffects(caster, SkillRegistry.get("FullAssist형"), makeCtx([ally], []));
  const joined = logs.join(" ");
  check("healingDealtPct=0이면 정확히 기존과 동일한 40% 증가", ally.bonusStr === Math.floor(100 * 0.40));
  check(`로그도 "+40%"로 표시(스케일 배율 0이라 원래 값 그대로)`, joined.includes("STR +40%"));
}

console.log("\n==================================================");
console.log("3) FullAssist형, healingDealtPct=30 — 40×1.3=52%로 정확히 스케일");
console.log("==================================================");
{
  logs = [];
  const caster = new BattleCharacter("하이드루이드", "ally", { int: 10 });
  caster.passiveMods.healingDealtPct = 30;
  const ally = new BattleCharacter("전사", "ally", { str: 100 });
  applyDamageAndEffects(caster, SkillRegistry.get("FullAssist형"), makeCtx([ally], []));
  const joined = logs.join(" ");
  check("bonusStr이 정확히 currentEffective(100)×0.52의 floor값", ally.bonusStr === Math.floor(100 * 0.52));
  check(`로그에 스케일된 "+52%"가 정확히 표시됨(base 40이 아님): "${joined}"`, joined.includes("STR +52%"));
  check(`base 값(40%)은 더 이상 안 뜸`, !joined.includes("+40%"));
}

console.log("\n==================================================");
console.log("4) 극단적으로 큰 healingDealtPct — bonusStr은 커지지만 effectiveStr은 전역 캡(real×5)을 못 넘음");
console.log("==================================================");
{
  logs = [];
  const caster = new BattleCharacter("하이드루이드", "ally", { int: 10 });
  caster.passiveMods.healingDealtPct = 5000; // 극단값 — 새 캡 로직이 없다는 것 자체를 확인하는 용도
  const ally = new BattleCharacter("전사", "ally", { str: 100 });
  applyDamageAndEffects(caster, SkillRegistry.get("FullAssist형"), makeCtx([ally], []));
  check("bonusStr 자체는 매우 크게 누적됨(쓰기 시점엔 캡이 안 걸림)", ally.bonusStr > ally.realStr * 5);
  check("effectiveStr(읽기 시점)은 real×5(=500) 상한을 절대 못 넘음(새 캡 로직 없이 기존 전역 캡만 적용됨)", ally.effectiveStr <= ally.realStr * 5);
  check("effectiveStr이 정확히 상한값(500)에 클램프됨", ally.effectiveStr === ally.realStr * 5);
}

console.log("\n==================================================");
console.log("5) combatStatUpPercent에도 동일 메커니즘 적용됨(범용성 확인)");
console.log("==================================================");
SkillRegistry.register({
  name: "전투버프형", targetFaction: "ally", targetCount: "single",
  skillType: "magic", stat: "int", coefficient: 0, costs: [],
  preDelay: 0, preDelayType: "action", postDelay: 0,
  effects: [{ type: "combatStatUpPercent", stat: "atk", value: 20, scaleByPassiveMod: "healingDealtPct", scaleFactor: 1 }],
});
{
  logs = [];
  const caster = new BattleCharacter("시전자", "ally", { int: 10 });
  caster.passiveMods.healingDealtPct = 50; // 20 × 1.5 = 30
  const ally = new BattleCharacter("전사", "ally", { str: 10 });
  ally.realAtk = 100;
  applyDamageAndEffects(caster, SkillRegistry.get("전투버프형"), makeCtx([ally], []));
  const joined = logs.join(" ");
  check("bonusAtk가 정확히 100×0.30의 floor값(20×1.5=30% 스케일)", ally.bonusAtk === Math.floor(100 * 0.30));
  check(`로그에 "+30%"로 정확히 표시`, joined.includes("공격력 +30%"));
}

console.log("\n==================================================");
console.log("6) maxHpUpPercent에도 동일 메커니즘 적용됨(범용성 확인)");
console.log("==================================================");
SkillRegistry.register({
  name: "체력버프형", targetFaction: "ally", targetCount: "single",
  skillType: "magic", stat: "int", coefficient: 0, costs: [],
  preDelay: 0, preDelayType: "action", postDelay: 0,
  effects: [{ type: "maxHpUpPercent", value: 10, scaleByPassiveMod: "healingDealtPct", scaleFactor: 2 }],
});
{
  logs = [];
  const caster = new BattleCharacter("시전자", "ally", { int: 10 });
  caster.passiveMods.healingDealtPct = 10; // scaleFactor 2 -> scalePct=20 -> 10×1.2=12%
  const ally = new BattleCharacter("전사", "ally", { str: 50 }); // maxHp = 200 + 50*20 = 1200
  const beforeMaxHp = ally.maxHp;
  applyDamageAndEffects(caster, SkillRegistry.get("체력버프형"), makeCtx([ally], []));
  const expectedDelta = Math.floor(beforeMaxHp * 0.12);
  check("scaleFactor(2)까지 반영되어 10×(1+10×2/100)=12%로 정확히 스케일", ally.maxHpBonus === expectedDelta);
}

console.log("\n==================================================");
console.log("7) Sheet 표시(web/character-sheet.html의 describeEffect) — scaleByPassiveMod 있으면 '비례' 접미사, 없으면 회귀 없음");
console.log("==================================================");
{
  const vm = require("vm");
  const fs = require("fs");
  const path = require("path");
  const lines = fs.readFileSync(path.join(__dirname, "web/character-sheet.html"), "utf8").split("\n");
  const startIdx = lines.findIndex((l) => l.startsWith("const TEAM_RESOURCE_TYPES = {"));
  const fnStartIdx = lines.findIndex((l) => l.startsWith("function describePassiveFields(s) {"));
  let depth = 0, endIdx = -1;
  for (let i = fnStartIdx; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === "{") depth++;
      else if (ch === "}") { depth--; if (depth === 0) { endIdx = i; break; } }
    }
    if (endIdx !== -1) break;
  }
  const chunk = lines.slice(startIdx, endIdx + 1).join("\n");
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(chunk, sandbox);
  const { describeEffect } = sandbox;

  const withScale = describeEffect({ type: "statUpPercent", stat: "str", value: 40, scaleByPassiveMod: "healingDealtPct", scaleFactor: 1 });
  check(`scaleByPassiveMod 있으면 "비례" 접미사 표시: "${withScale.text}"`, withScale.text.includes("비례"));
  check(`한글 라벨("가하는 회복량")로 표시(원문 키 그대로 아님): "${withScale.text}"`, withScale.text.includes("가하는 회복량"));

  const withoutScale = describeEffect({ type: "statUpPercent", stat: "str", value: 40 });
  check(`scaleByPassiveMod 없으면 기존과 동일하게 접미사 없음(회귀 없음): "${withoutScale.text}"`, !withoutScale.text.includes("비례") && withoutScale.text === "STR +40%");

  const maxHpWithScale = describeEffect({ type: "maxHpUpPercent", value: 10, scaleByPassiveMod: "healingDealtPct", scaleFactor: 2 });
  check(`maxHpUpPercent도 동일하게 접미사 표시: "${maxHpWithScale.text}"`, maxHpWithScale.text.includes("비례"));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
