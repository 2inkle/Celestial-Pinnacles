// 보스(creatureTier:"boss")에게 가한 공격이 로그에서 통째로 사라지던 버그의
// 회귀 검증. 2026-08-21: 사용자 신고 — "보스에게 발생한 모든 공격이 로그에서
// 패싱되고 있다. 원래 숨겨야 하는 건 보스의 MaxHP/MaxSP/HP/SP와 그 증감·증감
// 후 수치이지, 그 행동/공격이 있었다는 사실 자체가 아니다."
//
// 원인: src/skillResolution.js·src/registries.js에 중복 존재하는
// statChangeLine()이 보스 대상이면 빈 문자열("")을 반환했는데, 호출부
// (resolveOneHit/applyDamageAndEffects, ActionRegistry의 ATTACK/
// DETONATE_MAGIC_CIRCLE)가 전부 `if (line)`으로 "내용이 있어야 로그를
// 남긴다"는 패턴이라, 빈 문자열이 "이 행동이 로그에 안 남아도 된다"로
// 잘못 해석돼 행동 전체(데미지든 회복이든)가 로그에서 완전히 빠졌다.
// 데미지/회복 수치를 가리는 것과, 그 행동이 있었다는 사실 자체를 로그에서
// 지우는 것은 서로 다른 문제였다.
//
// 수정: 보스 대상이면 정확한 수치 대신 "???"로 채운 placeholder 줄
// ("??? 데미지 ▷ 보스 (??? > ???)")을 반환하도록 바꿔서, 줄 자체는 항상
// 남고 수치만 가려지게 함.
const { BattleCharacter } = require("./src/character");
const { SkillRegistry } = require("./src/skillRegistry");
const { ActionRegistry } = require("./src/registries");
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
console.log("1) 스킬 기반 공격(applyDamageAndEffects) — 보스에게 맞아도 로그 줄이 남고, 수치만 가려짐");
console.log("==================================================");
SkillRegistry.register({
  name: "강타", targetFaction: "enemy", targetCount: "single",
  skillType: "physical", stat: "str", coefficient: 3, costs: [],
  preDelay: 0, preDelayType: "action", postDelay: 0, effects: [],
});
{
  logs = [];
  const attacker = new BattleCharacter("전사", "ally", { str: 50 });
  attacker.realAtk = 50;
  const boss = new BattleCharacter("고블린의 왕", "enemy", { def: 10 });
  boss.creatureTier = "boss";
  const hpBefore = boss.currentHp;

  const originalRandom = Math.random;
  Math.random = () => 0; // 명중/크리티컬 판정을 결정적으로(항상 명중) 고정
  applyDamageAndEffects(attacker, SkillRegistry.get("강타"), makeCtx([attacker], [boss]));
  Math.random = originalRandom;

  check("보스 HP는 실제로 깎임(수치 자체는 정상 적용)", boss.currentHp < hpBefore);
  check("로그에 최소 한 줄이라도 남음(행동 자체가 사라지지 않음)", logs.length > 0);
  const detailLine = logs.find((l) => l.includes("▷"));
  check("데미지 상세 줄이 존재함", !!detailLine);
  check(`수치가 "???"로 가려짐: "${detailLine}"`, !!detailLine && detailLine.includes("???"));
  check("실제 HP 수치(변화 전/후 값)는 로그에 노출 안 됨", !!detailLine && !detailLine.includes(String(hpBefore)) && !detailLine.includes(String(boss.currentHp)));
}

console.log("\n==================================================");
console.log("2) 몬스터 기본 공격(ActionRegistry.ATTACK) — 아군이 보스에게 얻어맞을 때는 정상(비교군, 보스가 아니라 일반 대상)");
console.log("==================================================");
{
  logs = [];
  const monster = new BattleCharacter("고블린", "enemy", { str: 30 });
  const player = new BattleCharacter("플레이어", "ally", { def: 5 });
  ActionRegistry.execute("ATTACK", monster, makeCtx([player], [monster]));
  const detailLine = logs.find((l) => l.includes("▷"));
  check("일반 대상은 여전히 실제 수치가 그대로 보임(회귀 없음)", !!detailLine && !detailLine.includes("???"));
}

console.log("\n==================================================");
console.log("3) 몬스터 기본 공격(ActionRegistry.ATTACK) — 보스를 공격할 때도 로그 줄이 남음");
console.log("==================================================");
{
  logs = [];
  const attacker = new BattleCharacter("전사", "ally", { str: 50 });
  const boss = new BattleCharacter("고블린의 왕", "enemy", { def: 5 });
  boss.creatureTier = "boss";
  ActionRegistry.execute("ATTACK", attacker, makeCtx([attacker], [boss]));
  const detailLine = logs.find((l) => l.includes("▷"));
  check("보스 대상 기본 공격도 상세 줄이 남음", !!detailLine);
  check(`수치가 "???"로 가려짐: "${detailLine}"`, !!detailLine && detailLine.includes("???"));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
