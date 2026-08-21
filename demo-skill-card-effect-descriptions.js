// Sheet 화면 스킬 카드의 효과 설명이 실제 스킬 데이터에 쓰이는 27종
// effects[].type 전부 + 알 수 없는 타입에 대한 폴백 + 패시브 전용 필드까지
// 하나도 빠짐없이 텍스트를 만들어내는지 검증. 2026-08-22 사용자 신고:
// "Sheet 화면에서 스킬의 효과가... 하나도 빠트리는 것 없이 제대로
// 설명되어야 한다" — 조사 결과 EFFECT_TYPES/effectChips가 27종 중 20종을
// 조용히 버리고 있었음(빈 문자열 반환 → 카드에서 완전히 사라짐).
//
// web/character-sheet.html은 브라우저 전용 인라인 스크립트라 Node에서 직접
// require할 수 없음 — TEAM_RESOURCE_TYPES~describePassiveFields가 정의된
// 구간(329~670줄)만 파일 텍스트에서 그대로 잘라내 vm으로 실행함(로직을
// 복붙하지 않고 실제 파일 내용을 그대로 씀 — 로직이 바뀌면 이 스크립트가
// 자동으로 최신 버전을 검증하게 됨).
const vm = require("vm");
const fs = require("fs");
const path = require("path");

const lines = fs.readFileSync(path.join(__dirname, "web/character-sheet.html"), "utf8").split("\n");
// "const TEAM_RESOURCE_TYPES = {"부터 "function describePassiveFields(s) {...}"의
// 닫는 줄까지 — 두 앵커 문자열로 매번 새로 찾아서, 파일이 편집돼 줄 번호가
// 밀려도 이 스크립트가 깨지지 않게 함.
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
if (startIdx === -1 || endIdx === -1) throw new Error("앵커를 못 찾음 — character-sheet.html 구조가 바뀐 것으로 보임");
const chunk = lines.slice(startIdx, endIdx + 1).join("\n");

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(chunk, sandbox);
const { describeEffect, describePassiveFields } = sandbox;

let pass = 0, fail = 0;
function check(label, ok) {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

console.log("==================================================");
console.log("1) 실제 스킬 데이터에 쓰이는 27종 effects[].type 전부 — 빈 문자열이 아닌 텍스트를 반환하는지");
console.log("==================================================");
const realEffects = [
  { type: "actionDelay", value: 50 },
  { type: "applyTick", kind: "hp", amountPerTick: 30, duration: 5 },
  { type: "barrierUp", value: 100, cap: 500 },
  { type: "castDelay", value: 30 },
  { type: "clearCastDelay" },
  { type: "clearTicks" },
  { type: "combatStatUpPercent", stat: "atk", value: -30 },
  { type: "convertResource", from: "hp", to: "sp", fromPct: 10, toPct: 20 },
  { type: "drainPersonalResource", resource: "focusMana" },
  { type: "enterStance", key: "corruptedFocus", label: "집속" },
  { type: "grantPassiveMod", key: "accuracyBonusPct", value: 10 },
  { type: "heal", value: 100 },
  { type: "healMissingPercent", value: 30 },
  { type: "huntingSign" },
  { type: "maxHpUpPercent", value: 20 },
  { type: "maxSpUp", value: 50 },
  { type: "refillPersonalResource", resource: "arrow" },
  { type: "resurrect", tpCost: 20 },
  { type: "scaledHeal", intFactor: 0.01, multiplier: 3 },
  { type: "setRow", value: "back" },
  { type: "shield", charges: 2, shieldType: "physical" },
  { type: "spUp", value: 50 },
  { type: "statUp", stat: "dex", value: 100 },
  { type: "statUpPercent", stat: "int", value: -40 },
  { type: "stealTeamResource", resource: "magicCircle", eraseAmount: 1, gainAmount: 1 },
  { type: "teamResourceGain", resource: "magicCircle", value: 1 },
];
check(`실제 데이터에 쓰이는 26종을 전부 나열함(문서화된 27종 중 guard는 별도 검증)`, realEffects.length === 26);
realEffects.forEach((e) => {
  const { text, polarity } = describeEffect(e);
  check(`${e.type}: 빈 문자열 아님("${text}", ${polarity})`, !!text && text.trim().length > 0);
});

console.log("\n==================================================");
console.log("2) guard(기존에도 있었던 타입) — 회귀 없이 여전히 물리/마법/전체 구분됨");
console.log("==================================================");
{
  const physical = describeEffect({ type: "guard", guardType: "physical" });
  const magic = describeEffect({ type: "guard", guardType: "magic" });
  const all = describeEffect({ type: "guard" });
  check(`guardType:physical -> "물리" 포함: "${physical.text}"`, physical.text.includes("물리"));
  check(`guardType:magic -> "마법" 포함: "${magic.text}"`, magic.text.includes("마법"));
  check(`guardType 생략 -> "전체" 포함(기본값 회귀 없음): "${all.text}"`, all.text.includes("전체"));
}

console.log("\n==================================================");
console.log("3) statUp/statUpPercent/combatStatUpPercent — 스탯 이름과 부호가 정확히 표시됨");
console.log("==================================================");
{
  const r1 = describeEffect({ type: "statUp", stat: "dex", value: 100 });
  check(`statUp DEX 100 -> 텍스트에 "DEX"와 "+100" 포함: "${r1.text}"`, r1.text.includes("DEX") && r1.text.includes("+100") && r1.polarity === "buff");

  const r2 = describeEffect({ type: "combatStatUpPercent", stat: "atk", value: -30 });
  check(`combatStatUpPercent 공격력 -30% -> "공격력"과 "-30%" 포함, polarity debuff: "${r2.text}"`, r2.text.includes("공격력") && r2.text.includes("-30%") && r2.polarity === "debuff");

  const r3 = describeEffect({ type: "combatStatUpPercent", stat: "atk", value: 20 });
  check(`combatStatUpPercent 공격력 +20% -> "+20%" 포함, polarity buff: "${r3.text}"`, r3.text.includes("+20%") && r3.polarity === "buff");
}

console.log("\n==================================================");
console.log("4) 알 수 없는 타입(EFFECT_TYPES에 없는 완전히 새로운 타입) — 폴백으로 존재를 알림, 빈 문자열 아님");
console.log("==================================================");
{
  const r = describeEffect({ type: "totallyMadeUpEffectType", value: 1 });
  check(`폴백 텍스트가 비어있지 않고 타입명을 포함함: "${r.text}"`, !!r.text && r.text.includes("totallyMadeUpEffectType"));
}

console.log("\n==================================================");
console.log("5) 패시브 전용 필드(effects 없이 statBonus 등으로만 존재하는 스킬) — 전부 칩으로 나옴");
console.log("==================================================");
{
  const passiveSkill = {
    statBonus: { str: 10 },
    maxHpBonus: 200,
    maxSpBonus: 50,
    combatBonus: { def: 15 },
    patternSlotBonus: 1,
    passiveMods: { accuracyBonusPct: 10, physicalDamageDealtPct: -5 },
    conditionalPassiveMods: [{ key: "physicalDamageDealtPct", value: 100, condition: { type: "isGuarding" } }],
  };
  const chips = describePassiveFields(passiveSkill);
  check("statBonus/maxHpBonus/maxSpBonus/combatBonus/patternSlotBonus/passiveMods(2개)/conditionalPassiveMods 전부 합쳐 8개 칩", chips.length === 8);
  check("conditionalPassiveMods의 조건 라벨이 정확히 표시됨(Guard 중일 때)", chips.some((c) => c.text.includes("Guard 중일 때")));
  check("음수 passiveMods는 debuff로 분류됨", chips.some((c) => c.polarity === "debuff"));

  const emptySkill = {};
  check("아무 패시브 필드도 없는 스킬은 빈 배열(회귀 없음)", describePassiveFields(emptySkill).length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
