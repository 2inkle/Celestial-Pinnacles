// 보스 전투에서 모든 행동이 좌측정렬(아군)로 뜨던 버그의 회귀 검증.
// 2026-08-22 사용자 재신고: "보스 전투에서 로그 표기가 엉망이다. 전부
// 아군의 행동인 좌측정렬로 표시되는 중이다."
//
// 원인: src/engine.js의 renderStatusBoard()가 방금(같은 세션) 개인 자원
// 표시를 추가하면서, 현황판 유닛 줄이 "HP x/y   SP a/b" 뒤에 "   집속
// 마력 c/d" 같은 텍스트가 더 붙게 됐음. web/battle-log-render.js의
// parseBattleLog()가 이 줄을 매칭하는 unitMatch 정규식이 "SP a/b" 직후
// 줄이 바로 끝나야만("\s*$") 매칭되도록 돼 있어서, 개인 자원이 붙은 줄은
// 매칭 실패 -> 현황판을 훑는 while 루프가 그 자리에서 break -> 아직 못
// 훑은 [ 적군 ] 섹션이 통째로 빈 snapshot.enemy로 남음 -> 모든 적 행동의
// sideOf()가 null -> "ally" 폴백 -> 적 행동까지 전부 좌측정렬(.action-block
// .ally)로 렌더링됨.
const vm = require("vm");
const fs = require("fs");
const path = require("path");

const sandbox = { window: {}, console };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, "web/battle-log-render.js"), "utf8"), sandbox);
const { parseBattleLog, renderBattleLog } = sandbox.window.BattleLogRender;

let pass = 0, fail = 0;
function check(label, ok) {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

console.log("==================================================");
console.log("1) 개인 자원을 가진 아군이 있는 현황판 — snapshot.enemy가 더 이상 비어있지 않음");
console.log("==================================================");
{
  // src/engine.js의 renderStatusBoard()가 실제로 찍는 형태 그대로 재현.
  const rawLines = [
    "==================================================",
    "[ TURN 1 ]",
    "[ 아군 ]",
    "  둠로드   HP 400/400   SP 150/150   집속 마력 350/1000",
    "  전사   HP 800/800   SP 100/100",
    "[ 적군 ]",
    "  고블린의 왕   HP 3000/3000   SP 200/200",
    "==================================================",
    "",
    '"고블린의 왕" (ENEMY) 행동!',
    "고블린의 왕, Break Down",
    "   754 데미지 ▷ 전사 (800 > 46)",
    "",
    '"둠로드" (ALLY) 행동!',
    "둠로드, 공격",
    "   100 데미지 ▷ 고블린의 왕 (3000 > 2900)",
  ];
  const { turns } = parseBattleLog(rawLines);
  check("턴 1개가 정상 파싱됨", turns.length === 1);
  const snapshot = turns[0].snapshot;
  check(`아군 스냅샷에 둠로드/전사 둘 다 잡힘(자원 접미사로 인한 매칭 실패 없음): ${JSON.stringify(snapshot.ally.map((u) => u.name))}`, snapshot.ally.length === 2 && snapshot.ally.some((u) => u.name === "둠로드") && snapshot.ally.some((u) => u.name === "전사"));
  check(`적군 스냅샷이 더 이상 비어있지 않고 "고블린의 왕"이 정상적으로 들어감: ${JSON.stringify(snapshot.enemy.map((u) => u.name))}`, snapshot.enemy.length === 1 && snapshot.enemy[0].name === "고블린의 왕");
  check("둠로드의 HP/SP 자체는 정상 파싱됨(자원 접미사는 무시하되 앞부분은 그대로 읽힘)", snapshot.ally.find((u) => u.name === "둠로드")?.hp === 400 && snapshot.ally.find((u) => u.name === "둠로드")?.sp === 150);
}

console.log("\n==================================================");
console.log("2) 렌더링된 HTML — 적 행동 블록이 더 이상 \"ally\"로 잘못 분류되지 않음");
console.log("==================================================");
{
  const rawLines = [
    "==================================================",
    "[ TURN 1 ]",
    "[ 아군 ]",
    "  둠로드   HP 400/400   SP 150/150   집속 마력 350/1000",
    "[ 적군 ]",
    "  고블린의 왕   HP 3000/3000   SP 200/200",
    "==================================================",
    "",
    '"고블린의 왕" (ENEMY) 행동!',
    "고블린의 왕, Break Down",
    "   754 데미지 ▷ 둠로드 (400 > 0)",
    "",
    '"둠로드" (ALLY) 행동!',
    "둠로드, 공격",
    "   50 데미지 ▷ 고블린의 왕 (3000 > 2950)",
  ];
  const result = {
    outcome: "enemyWin", username: "테스터", turnsElapsed: 1,
    participants: { ally: [], enemy: [] },
    survivorCounts: { ally: { alive: 0, total: 1 }, enemy: { alive: 1, total: 1 } },
    damageDealt: { ally: 0, enemy: 754 },
    goldGained: 0, expGained: 0, lootGained: [],
  };
  const html = renderBattleLog(rawLines, result);
  check(`"고블린의 왕"의 행동 블록이 action-block enemy로 렌더링됨(더 이상 ally 폴백 아님)`, /action-block enemy/.test(html));
  check(`"둠로드"의 행동 블록은 회귀 없이 action-block ally로 정확히 남음(전부 enemy로 오염되지도 않음)`, /action-block ally/.test(html));
}

console.log("\n==================================================");
console.log("3) 개인 자원이 없는 아군만 있는 기존 로그 — 회귀 없이 그대로 정상 파싱됨");
console.log("==================================================");
{
  const rawLines = [
    "==================================================",
    "[ TURN 1 ]",
    "[ 아군 ]",
    "  전사   HP 800/800   SP 100/100",
    "[ 적군 ]",
    "  고블린   HP 200/200   SP 20/20",
    "==================================================",
  ];
  const { turns } = parseBattleLog(rawLines);
  const snapshot = turns[0].snapshot;
  check("자원 접미사가 아예 없는 기존 형식도 회귀 없이 정상 파싱됨(아군 1명)", snapshot.ally.length === 1 && snapshot.ally[0].hp === 800 && snapshot.ally[0].maxHp === 800);
  check("적군도 정상 파싱됨", snapshot.enemy.length === 1 && snapshot.enemy[0].name === "고블린");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
