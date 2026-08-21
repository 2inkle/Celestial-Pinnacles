// 보스(creatureTier:"boss")에게 가한 공격이 로그에서 통째로 사라지던 버그와,
// 그 1차 수정이 과도했던(데미지 자체까지 가려짐) 문제의 회귀 검증.
// 2026-08-21, 두 차례 사용자 신고:
//   1차: "보스에게 발생한 모든 공격이 로그에서 패싱되고 있다. 원래 숨겨야
//        하는 건 보스의 MaxHP/MaxSP/HP/SP와 그 증감·증감 후 수치이지,
//        그 행동/공격이 있었다는 사실 자체가 아니다."
//   2차(1차 수정 이후): "데미지 자체는 보여줬으면 좋겠다. 그저 증감치만
//        보이지 않으면 되는 것이다." — 즉 "증감치"(amount, 754 같은 값)는
//        가리면 안 되고, "증감 후 절대 수치"(before/after, 1200 > 446 같은
//        절대 HP)만 가려야 함.
//
// 원인(1차): statChangeLine()이 보스 대상이면 빈 문자열("")을 반환했는데,
// 호출부가 전부 `if (line)`("내용이 있어야 로그를 남긴다")라 행동 전체가
// 로그에서 사라졌음.
// 원인(2차, 1차 수정 직후 재조사): 1차 수정 때 amount까지 "???"로 가렸던
// 게 과도한 마스킹이었음 — 사용자 의도는 "총 HP/SP 절대치를 역산 못 하게"
// 였지 "이번 히트가 얼마나 아팠는지"까지 감추는 게 아니었음.
//
// 최종 동작: `${amount} ${label} ▷ ${target.name} (??? > ???)` — 증감량은
// 그대로, 전/후 절대 수치만 "???".
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
console.log("1) 스킬 기반 공격(applyDamageAndEffects) — 보스에게 맞아도 로그 줄이 남고, 데미지량은 보이되 절대 HP만 가려짐");
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

  const dealt = hpBefore - boss.currentHp;
  check("보스 HP는 실제로 깎임(수치 자체는 정상 적용)", dealt > 0);
  check("로그에 최소 한 줄이라도 남음(행동 자체가 사라지지 않음)", logs.length > 0);
  const detailLine = logs.find((l) => l.includes("▷"));
  check("데미지 상세 줄이 존재함", !!detailLine);
  check(`실제로 가한 데미지량(${dealt})이 로그에 그대로 노출됨: "${detailLine}"`, !!detailLine && detailLine.includes(String(dealt)));
  check(`절대 HP 수치는 "(??? > ???)"로 가려짐`, !!detailLine && detailLine.includes("(??? > ???)"));
  check(
    "실제 절대 HP 수치(변화 전/후 값) 쌍은 로그에 노출 안 됨",
    !!detailLine && !detailLine.includes(`(${hpBefore} > ${boss.currentHp})`)
  );
}

console.log("\n==================================================");
console.log("2) 몬스터 기본 공격(ActionRegistry.ATTACK) — 아군이 일반 대상에게 맞을 때는 정상(비교군, 보스가 아님)");
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
console.log("3) 몬스터 기본 공격(ActionRegistry.ATTACK) — 보스를 공격할 때도 로그 줄이 남고 데미지량은 보임");
console.log("==================================================");
{
  logs = [];
  const attacker = new BattleCharacter("전사", "ally", { str: 50 });
  const boss = new BattleCharacter("고블린의 왕", "enemy", { def: 5 });
  boss.creatureTier = "boss";
  const hpBefore = boss.currentHp;
  ActionRegistry.execute("ATTACK", attacker, makeCtx([attacker], [boss]));
  const dealt = hpBefore - boss.currentHp;
  const detailLine = logs.find((l) => l.includes("▷"));
  check("보스 대상 기본 공격도 상세 줄이 남음", !!detailLine);
  check(`데미지량(${dealt})이 그대로 노출됨: "${detailLine}"`, !!detailLine && dealt > 0 && detailLine.includes(String(dealt)));
  check(`절대 HP 수치는 "(??? > ???)"로 가려짐`, !!detailLine && detailLine.includes("(??? > ???)"));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
