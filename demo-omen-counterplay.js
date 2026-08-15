// "OMEN이 발동했을 때 파훼법이 아예 없는 건 아니다" — 사용자가 지적한 이론상
// 공략법이 실제 엔진에서 그대로 성립하는지 end-to-end로 확인.
//
// 시나리오: "???"가 마법진 5개를 채워 OMEN(casting형, preDelay 200)을 시전
// 시작함 → 인퀴지터가 Magic Jammer로 그 시전을 castDelay(방해)해서 늘림→
// 그 벌어진 시간 동안 인퀴지터가 Circle Erase를 반복 사용해 "???"의 마법진을
// 5개 미만으로 깎음 → OMEN의 readyAtTick 도래 시 PrepState.resolve()가 코스트
// (마법진 5개)를 다시 확인 → 감당 못 해서 발동 실패("불발").
const { BattleCharacter } = require("./src/character");
const { PrepState, checkAffordability, payCosts } = require("./src/prepState");
const { applyEffect } = require("./src/skillResolution");
const { FactionResourceManager } = require("./src/resourceManager");

console.log("==================================================");
console.log("OMEN 이론상 파훼법 — Magic Jammer로 시전 연장 + Circle Erase로");
console.log("마법진을 5개 미만으로 깎아 궁극기를 '불발'시키는 시나리오 재현");
console.log("==================================================");

const boss = new BattleCharacter("???", "enemy", { str: 10, int: 10, dex: 10, spd: 10, luk: 10 });
const inquisitor = new BattleCharacter("인퀴지터", "ally", { str: 10, int: 30, dex: 10, spd: 10, luk: 10 });

const rm = new FactionResourceManager();
rm.registerResource("ally", "MAGIC_CIRCLE", 0, 10);
rm.registerResource("enemy", "MAGIC_CIRCLE", 0, 10);
const ctx = { resourceManager: rm, log: (l) => console.log(l), totalBattleTick: 0 };

const OMEN = {
  name: "OMEN",
  preDelay: 200,
  preDelayType: "casting",
  costs: [{ type: "teamResource", resource: "magicCircle", amount: 5 }],
};

console.log("\n[1] '???'가 마법진 5개를 채움");
rm.addResource("enemy", "MAGIC_CIRCLE", 5);
console.log(`  enemy 마법진: ${rm.getResource("enemy", "MAGIC_CIRCLE")} (기대값 5)`, rm.getResource("enemy", "MAGIC_CIRCLE") === 5 ? "✅" : "❌");

console.log("\n[2] OMEN 시전 시작(tick 0, preDelay 200 → readyAtTick 200)");
const prepState = new PrepState();
const record = prepState.begin(boss, OMEN, 0, OMEN.preDelay);
console.log(`  readyAtTick: ${record.readyAtTick} (기대값 200)`, record.readyAtTick === 200 ? "✅" : "❌");

console.log("\n[3] 인퀴지터가 Magic Jammer로 방해(castDelay 55%, preDelayType 'casting' 일치 확인)");
const jamResult = prepState.applyDelayEffect(boss, { requiresPreDelayType: "casting", value: 55 });
console.log(`  적용됨? ${jamResult.applied} (기대값 true)`, jamResult.applied ? "✅" : "❌");
console.log(`  readyAtTick 연장: ${jamResult.beforeTick} -> ${jamResult.afterTick} (200 -> 310 기대)`, jamResult.afterTick === 310 ? "✅" : "❌");

console.log("\n[4] 벌어진 시간(tick 200~310) 동안 인퀴지터가 Circle Erase를 5번 연속 사용");
for (let i = 1; i <= 5; i++) {
  const line = applyEffect(inquisitor, inquisitor, { type: "stealTeamResource", resource: "magicCircle", eraseAmount: 1, gainAmount: 1 }, ctx);
  console.log(`  ${i}회차: "${line}" (enemy 남은 마법진: ${rm.getResource("enemy", "MAGIC_CIRCLE")})`);
}
const enemyLeft = rm.getResource("enemy", "MAGIC_CIRCLE");
console.log(`  최종 enemy 마법진: ${enemyLeft} (기대값 0, 5개 전부 깎임)`, enemyLeft === 0 ? "✅" : "❌");

console.log("\n[5] tick 310(연장된 readyAtTick) 도래 — OMEN 실제 발동 판정(PrepState.resolve)");
const result = prepState.resolve(boss, boss, rm);
console.log(`  발동 성공(activated)? ${result.activated} (기대값 false — 코스트 부족으로 불발)`, result.activated === false ? "✅" : "❌");
console.log(`  실패 사유: "${result.reason}"`);
console.log(`  사유에 '마법진' 포함(어떤 코스트가 부족했는지 로그로 드러남)?`, result.reason.includes("마법진") ? "✅" : "❌");

console.log("\n[6] 대조군 — 방해도 없고 Circle Erase도 안 맞으면 정상 발동하는지");
{
  const rm2 = new FactionResourceManager();
  rm2.registerResource("enemy", "MAGIC_CIRCLE", 0, 10);
  rm2.addResource("enemy", "MAGIC_CIRCLE", 5);
  const ps2 = new PrepState();
  ps2.begin(boss, OMEN, 0, OMEN.preDelay);
  const result2 = ps2.resolve(boss, boss, rm2);
  console.log(`  발동 성공? ${result2.activated} (기대값 true)`, result2.activated === true ? "✅" : "❌");
  console.log(`  발동 후 남은 마법진: ${rm2.getResource("enemy", "MAGIC_CIRCLE")} (기대값 0, costs로 소모됨)`, rm2.getResource("enemy", "MAGIC_CIRCLE") === 0 ? "✅" : "❌");
}
