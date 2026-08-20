// combatStatUpPercent/statUpPercent가 음수 value(디버프)를 받았을 때 표기가
// 깨지던 버그의 회귀 검증. 2026-08-21: 실제 유저가 고블린 왕 Break Down 전투
// 로그에서 발견 — "5의 공격력이 더 이상 증가할 수 없다. 5의 방어력 +-30%."
// (디버프인데 "증가" 캡 메시지가 뜨고, 부호가 "+-30%"로 깨져서 표시됨).
//
// 원인: 이 게임은 %디버프를 별도 타입(combatStatDownPercent 등) 없이
// combatStatUpPercent/statUpPercent에 음수 value를 넣는 방식으로 구현한다
// (Break Down/Weapon Break/MindBreak/Exorcism/OMEN 등 게임 전역의 %디버프
// 스킬 전부 이 방식 — 별도 Down 타입은 데이터상 전혀 안 쓰임). 그런데 문구
// 조립("+" 고정)과 describeStatCap()에 넘기는 isIncrease 플래그(true 고정)가
// value의 부호를 전혀 안 봐서, 음수가 들어와도 항상 "+"와 "증가 캡" 판정만
// 적용됐음. atkUp/atkDown 케이스(고정치)는 이미 `effect.value >= 0`으로
// 부호를 갈라 처리하고 있었는데, %버전 두 케이스만 이 처리가 빠져 있었음.
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
console.log("1) Break Down(combatStatUpPercent, 음수) — 정상 범위에서 표기 확인");
console.log("==================================================");
SkillRegistry.register({
  name: "Break Down", targetFaction: "enemy", targetCount: "single",
  skillType: "physical", stat: "str", coefficient: 5.7, costs: [],
  preDelay: 0, preDelayType: "action", postDelay: 10,
  effects: [
    { type: "combatStatUpPercent", stat: "atk", value: -30 },
    { type: "combatStatUpPercent", stat: "def", value: -30 },
  ],
});
{
  logs = [];
  const king = new BattleCharacter("고블린의 왕", "enemy", { str: 100 });
  king.realAtk = 200;
  const player = new BattleCharacter("플레이어", "ally", { str: 50, def: 40 });
  player.realAtk = 30;
  player.realDef = 40;
  applyDamageAndEffects(king, SkillRegistry.get("Break Down"), makeCtx([player], [king]));
  const joined = logs.join(" ");
  check("bonusAtk가 실제로 감소함(음수)", player.bonusAtk < 0);
  check("bonusDef가 실제로 감소함(음수)", player.bonusDef < 0);
  check(`"+-" 같은 깨진 부호가 로그에 없음: "${joined}"`, !joined.includes("+-"));
  check(`공격력 문구가 "-30%"로 정확히 표시됨`, joined.includes("공격력 -30%"));
  check(`방어력 문구가 "-30%"로 정확히 표시됨`, joined.includes("방어력 -30%"));
  check(`"증가할 수 없다"(반대 방향 캡 메시지)가 안 뜸`, !joined.includes("증가할 수 없다"));
}

console.log("\n==================================================");
console.log("2) Break Down — 이미 최저치(realAtk*0.5)에 도달한 경우, '감소할 수 없다'로 정확히 표시");
console.log("==================================================");
{
  logs = [];
  const king = new BattleCharacter("고블린의 왕", "enemy", { str: 100 });
  king.realAtk = 200;
  const player = new BattleCharacter("플레이어2", "ally", { str: 50, def: 40 });
  // realAtk를 안 세팅(0) -> effectiveAtk 상하한이 전부 0 -> 이미 하한에 도달한 상태
  player.realDef = 40;
  const originalRandom = Math.random;
  Math.random = () => 0; // 명중/크리티컬 등 모든 확률 판정을 결정적으로(항상 명중, 항상 성공 방향) 고정
  applyDamageAndEffects(king, SkillRegistry.get("Break Down"), makeCtx([player], [king]));
  Math.random = originalRandom;
  const joined = logs.join(" ");
  check(`"더 이상 감소할 수 없다"로 정확한 방향 표시: "${joined}"`, joined.includes("공격력이 더 이상 감소할 수 없다"));
  check(`"증가할 수 없다"(반대 방향)가 아님`, !joined.includes("증가할 수 없다"));
}

console.log("\n==================================================");
console.log("3) 실제 버프(양수, MindBreak의 정반대 케이스) — 기존 동작 회귀 없음");
console.log("==================================================");
SkillRegistry.register({
  name: "격려강화", targetFaction: "ally", targetCount: "single",
  skillType: "physical", stat: "str", coefficient: 1, costs: [],
  preDelay: 0, preDelayType: "action", postDelay: 0,
  effects: [{ type: "combatStatUpPercent", stat: "atk", value: 20 }],
});
{
  logs = [];
  const caster = new BattleCharacter("사제", "ally", { str: 10 });
  const ally = new BattleCharacter("전사", "ally", { str: 10 });
  ally.realAtk = 30;
  applyDamageAndEffects(caster, SkillRegistry.get("격려강화"), makeCtx([ally], []));
  const joined = logs.join(" ");
  check("bonusAtk가 실제로 증가함(양수)", ally.bonusAtk > 0);
  check(`양수는 여전히 "+20%"로 표시됨: "${joined}"`, joined.includes("공격력 +20%"));
  check(`"감소할 수 없다"가 안 뜸(정상 버프인데 반대 방향 캡 메시지 안 나옴)`, !joined.includes("감소할 수 없다"));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
