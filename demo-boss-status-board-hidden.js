// 턴마다 찍히는 현황판(BattleEngine.renderStatusBoard)과 최종 결과 요약에서
// 보스의 HP/SP 절대 수치·퍼센티지 게이지가 숨겨지는지 검증. 2026-08-21,
// 사용자 요청: "턴이 지나갈 때마다 표기되는 전황판에서도... 보스의 상태를
// 숨기고 백분율을 나타내는 게이지 또한 표기되지 않도록 했으면 좋겠다...
// 패턴이 발생하기 위한 '정확한 기준 수치'를 숨기는 역할도 있다."
//
// statChangeLine()의 데미지 줄 마스킹(demo-boss-log-line-missing.js)과는
// 별개 코드 경로 — renderStatusBoard()는 매 턴 시작마다 모든 유닛의 HP/SP를
// 그대로 텍스트로 찍는 "현황판" 줄을 만들고, web/battle-log-render.js가 그
// 줄을 정규식으로 파싱해서 %게이지로 그린다. 보스는 이 두 곳 모두에서
// 수치가 새지 않아야 함.
//
// 시나리오 5(2026-08-21 추가): 위 4가지를 다 고친 뒤 사용자가 "다른 건 다
// 숨기는 데에 성공했는데, 결과창에서는 여전히 정상적으로 출력되고 있다"고
// 재신고 — battle-view.html/battle-log-view.html이 공통으로 쓰는 결과
// 화면(renderResultSideBox)이 statChangeLine/renderStatusBoard 둘 다와도
// 다른 세 번째 별개 경로였음: engine.js의 summarize()가 만드는
// result.participants(진영별 참전 인원의 currentHp/maxHp)를 그대로 합산해서
// "1234 / 2000 HP" 식으로 진영 전체 HP를 보여주는데, 보스가 그 진영의
// 유일한(또는 주요) 참전자면 이 합계가 사실상 보스의 정확한 HP 그 자체임.
const { BattleEngine } = require("./src/engine");
const { BattleCharacter } = require("./src/character");
const fs = require("fs");
const path = require("path");

// web/battle-log-render.js는 브라우저 전용(window.*)이라 최소 sandbox로 로드.
const vm = require("vm");
const sandbox = { window: {}, console };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, "web/battle-log-render.js"), "utf8"), sandbox);
const { parseBattleLog } = sandbox.window.BattleLogRender;

let pass = 0, fail = 0;
function check(label, ok) {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

console.log("==================================================");
console.log("1) renderStatusBoard() — 보스는 HP/SP 절대 수치 없이 \"???\"만 찍힘");
console.log("==================================================");
{
  const player = new BattleCharacter("전사", "ally", { str: 30 });
  const boss = new BattleCharacter("고블린의 왕", "enemy", { def: 10 });
  boss.creatureTier = "boss";
  const normalEnemy = new BattleCharacter("고블린", "enemy", { def: 5 });

  const logs = [];
  const engine = new BattleEngine([player], [boss, normalEnemy], (l) => logs.push(l));
  engine.currentTurn = 1;
  engine.renderStatusBoard();

  const bossLine = logs.find((l) => l.includes("고블린의 왕"));
  const normalLine = logs.find((l) => l.trim().startsWith("고블린 "));
  const playerLine = logs.find((l) => l.includes("전사"));

  check(`보스 줄에 HP/SP 절대 수치가 없음: "${bossLine}"`, !!bossLine && !/HP \d+\/\d+/.test(bossLine));
  check(`보스 줄이 "???"로 표시됨`, !!bossLine && bossLine.includes("???"));
  check(`일반 적(비보스)은 회귀 없이 그대로 HP/SP 수치가 보임: "${normalLine}"`, !!normalLine && /HP \d+\/\d+/.test(normalLine));
  check(`아군도 회귀 없이 그대로 HP/SP 수치가 보임: "${playerLine}"`, !!playerLine && /HP \d+\/\d+/.test(playerLine));
}

console.log("\n==================================================");
console.log("2) parseBattleLog()가 \"???\" 줄을 hidden 유닛으로 파싱하고, 게이지를 그릴 hp/maxHp가 없음");
console.log("==================================================");
{
  const rawLines = [
    "==================================================",
    "[ TURN 1 ]",
    "[ 아군 ]",
    "  전사   HP 300/300   SP 50/50",
    "[ 적군 ]",
    "  고블린의 왕   ???",
    "  고블린   HP 200/200   SP 20/20",
    "==================================================",
  ];
  const { turns } = parseBattleLog(rawLines);
  check("턴 1개가 정상 파싱됨", turns.length === 1);
  const enemySnapshot = turns[0].snapshot.enemy;
  const bossEntry = enemySnapshot.find((u) => u.name === "고블린의 왕");
  const normalEntry = enemySnapshot.find((u) => u.name === "고블린");
  check("보스가 snapshot에서 완전히 누락되지 않고 hidden 유닛으로 잡힘", !!bossEntry);
  check("보스 entry에 hp/maxHp 필드가 없음(게이지를 못 그림)", !!bossEntry && bossEntry.hp === undefined && bossEntry.maxHp === undefined);
  check("보스 entry가 hidden:true로 표시됨", !!bossEntry && bossEntry.hidden === true);
  check("일반 적은 회귀 없이 hp/maxHp가 정상 파싱됨", !!normalEntry && normalEntry.hp === 200 && normalEntry.maxHp === 200);
}

console.log("\n==================================================");
console.log("3) renderUnitRow — hidden 유닛은 게이지(bar-fill) 없이 렌더링됨");
console.log("==================================================");
{
  const html = sandbox.window.BattleLogRender.renderUnitRow({ name: "고블린의 왕", alive: true, hidden: true });
  check(`게이지(bar-fill)가 전혀 없음: "${html.replace(/\s+/g, " ").trim()}"`, !html.includes("bar-fill"));
  check(`이름은 그대로 보임`, html.includes("고블린의 왕"));
}

console.log("\n==================================================");
console.log("4) 최종 결과 요약(startBattle) — 보스 HP도 \"???\"로 나옴(전투 끝났다고 예외 없음)");
console.log("==================================================");
{
  const player = new BattleCharacter("전사", "ally", { str: 30 });
  const boss = new BattleCharacter("고블린의 왕", "enemy", { def: 999999 }); // 절대 안 죽게
  boss.creatureTier = "boss";
  player.currentHp = 0; // 즉시 패배로 끝나게(전투 로직 자체는 이 검증의 관심사가 아님)

  const logs = [];
  const engine = new BattleEngine([player], [boss], (l) => logs.push(l));
  engine.startBattle(100, "테스터"); // player.currentHp=0이라 첫 턴에 즉시 패배로 종료됨

  const bossResultLine = logs.find((l) => l.includes("고블린의 왕") && l.includes("HP"));
  check(`최종 결과 텍스트 로그에도 보스 HP는 "???"로 나옴: "${bossResultLine}"`, !!bossResultLine && bossResultLine.includes("???") && !/HP \d+\/\d+/.test(bossResultLine));
}

console.log("\n==================================================");
console.log("5) 결과 화면(renderResultSideBox) — 보스가 낀 진영은 HP 합계 자체가 \"???\"로 나옴");
console.log("==================================================");
{
  // battle-view.html/battle-log-view.html이 실제로 렌더링하는 결과 화면
  // (renderBattleLog -> renderResult -> renderResultSideBox)이 result.participants
  // (engine.js의 summarize() 산출물)를 그대로 받아 진영별 HP 합계를 보여주는데,
  // statChangeLine()/renderStatusBoard()와는 또 다른 별개 경로라 이전 수정
  // 때는 빠져있었음 — 사용자가 "결과창에서는 여전히 정상 출력된다"고 재신고해서
  // 발견됨(2026-08-21). summarize()에 creatureTier를 실어서 renderResultSideBox가
  // "이 진영에 보스가 있으면 합계 전체를 가린다"고 판정하도록 수정.
  const player = new BattleCharacter("전사", "ally", { str: 30 });
  const boss = new BattleCharacter("고블린의 왕", "enemy", { def: 999999 });
  boss.creatureTier = "boss";
  player.currentHp = 0;

  const engine = new BattleEngine([player], [boss], () => {});
  const result = engine.startBattle(100, "테스터");

  check("engine.js의 summarize()가 creatureTier를 참전 정보에 실어보냄", result.participants.enemy[0].creatureTier === "boss");

  const enemyBoxHtml = sandbox.window.BattleLogRender.renderResultSideBox(
    "💀 적군", "enemy", result.survivorCounts.enemy, result.participants.enemy, result.damageDealt.enemy
  );
  check(`보스가 낀 진영은 HP 합계가 "???"로 가려짐: "${enemyBoxHtml.match(/result-hp-figure">(.+?)<\/div>/)[1]}"`, enemyBoxHtml.includes("???") && !/\d+\s*<\/b>\s*\/\s*\d+ HP/.test(enemyBoxHtml));

  const allyBoxHtml = sandbox.window.BattleLogRender.renderResultSideBox(
    "🛡️ 아군", "ally", result.survivorCounts.ally, result.participants.ally, result.damageDealt.ally
  );
  check(`보스가 없는 진영(아군)은 회귀 없이 실제 HP 합계가 그대로 보임: "${allyBoxHtml.match(/result-hp-figure">(.+?)<\/div>/)[1]}"`, /\d+\s*<\/b>\s*\/\s*\d+ HP/.test(allyBoxHtml));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
