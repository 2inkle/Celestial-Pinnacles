// Guard가 데미지 없는 버프/디버프 히트까지 막아버리던 버그의 회귀 검증.
// 2026-08-21: 실제 유저 신고(고블린 왕 Break Down 전투)로 발견 — Guard/Shield/
// 완전방어 판정이 "이 히트가 실제로 데미지를 낼 수 있는가"와 무관하게 무조건
// 실행돼서, stat/coefficient가 없는 순수 버프·디버프 스킬까지 "공격"으로
// 취급돼 Guard에 막히고 Guard 자원까지 헛되이 소모됐음. 데미지+디버프가
// 결합된 스킬(Break Down류)은 Guard가 전체를 막는 기존 동작(패링) 그대로
// 유지돼야 함 — 이 둘을 한 스크립트에서 같이 검증.
const { BattleCharacter } = require("./src/character");
const { SkillRegistry } = require("./src/skillRegistry");
const { applyDamageAndEffects } = require("./src/skillResolution");

function makeCtx(allies, enemies) {
  return {
    allies, enemies,
    getOpponents(actor) { return actor.side === "ally" ? this.enemies : this.allies; },
    log: () => {},
  };
}

let pass = 0, fail = 0;
function check(label, ok) {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

console.log("==================================================");
console.log("1) 순수 아군 버프(stat/coefficient 없음) — Guard 중인 아군에게 걸어도 그대로 적용");
console.log("==================================================");
SkillRegistry.register({
  name: "격려", targetFaction: "ally", targetCount: "single",
  skillType: "physical", costs: [],
  preDelay: 0, preDelayType: "action", postDelay: 0,
  effects: [{ type: "atkUp", value: 20 }],
});
{
  const caster = new BattleCharacter("사제", "ally", { str: 10 });
  const guardingAlly = new BattleCharacter("전사", "ally", { str: 10 });
  guardingAlly.isGuarding = true;
  applyDamageAndEffects(caster, SkillRegistry.get("격려"), makeCtx([guardingAlly], []));
  check("버프가 정상 적용됨(bonusAtk +20)", guardingAlly.bonusAtk === 20);
  check("Guard가 소모되지 않고 유지됨", guardingAlly.isGuarding === true);
}

console.log("\n==================================================");
console.log("2) 자기 자신에게 거는 버프 — 스스로 Guard 중이어도 자기 버프는 그대로 적용");
console.log("==================================================");
SkillRegistry.register({
  name: "기합", targetFaction: "self", targetCount: "single",
  skillType: "physical", costs: [],
  preDelay: 0, preDelayType: "action", postDelay: 0,
  effects: [{ type: "atkUp", value: 15 }],
});
{
  const selfCaster = new BattleCharacter("검사", "ally", { str: 10 });
  selfCaster.isGuarding = true;
  applyDamageAndEffects(selfCaster, SkillRegistry.get("기합"), makeCtx([selfCaster], []));
  check("자기 버프가 정상 적용됨(bonusAtk +15)", selfCaster.bonusAtk === 15);
  check("Guard가 소모되지 않고 유지됨", selfCaster.isGuarding === true);
}

console.log("\n==================================================");
console.log("3) 순수 적 디버프(stat/coefficient 없음, MindBreak류) — Guard 중이어도 그대로 적용");
console.log("==================================================");
SkillRegistry.register({
  name: "정신붕괴", targetFaction: "enemy", targetCount: "single",
  skillType: "magic", costs: [],
  preDelay: 0, preDelayType: "action", postDelay: 0,
  effects: [{ type: "statUpPercent", stat: "int", value: -20 }],
});
{
  const caster = new BattleCharacter("인퀴지터", "ally", { str: 10, int: 10 });
  const guardingEnemy = new BattleCharacter("적", "enemy", { int: 100 });
  guardingEnemy.isGuarding = true;
  const before = guardingEnemy.bonusInt;
  applyDamageAndEffects(caster, SkillRegistry.get("정신붕괴"), makeCtx([caster], [guardingEnemy]));
  check("순수 디버프가 정상 적용됨(bonusInt 감소)", guardingEnemy.bonusInt < before);
  check("Guard가 소모되지 않고 유지됨", guardingEnemy.isGuarding === true);
}

console.log("\n==================================================");
console.log("4) Break Down류(데미지+디버프 결합) — Guard가 이전과 동일하게 전체를 막음(회귀 없음)");
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
  const king = new BattleCharacter("고블린의 왕", "enemy", { str: 100 });
  king.realAtk = 50;
  const guardingPlayer = new BattleCharacter("플레이어", "ally", { str: 50, def: 20 });
  guardingPlayer.realDef = 20;
  guardingPlayer.isGuarding = true;

  const hpBefore = guardingPlayer.currentHp;
  applyDamageAndEffects(king, SkillRegistry.get("Break Down"), makeCtx([guardingPlayer], [king]));
  check("데미지가 막힘(HP 불변)", guardingPlayer.currentHp === hpBefore);
  check("디버프도 같이 막힘(bonusAtk/bonusDef 불변)", guardingPlayer.bonusAtk === 0 && guardingPlayer.bonusDef === 0);
  check("Guard가 소모됨(공격 전체를 한 번에 막고 소진)", guardingPlayer.isGuarding === false);
}

console.log("\n==================================================");
console.log("5) Break Down류 — Guard가 없으면 데미지와 디버프 둘 다 정상 적용(비교군)");
console.log("==================================================");
{
  const king = new BattleCharacter("고블린의 왕", "enemy", { str: 100 });
  king.realAtk = 50;
  const player = new BattleCharacter("플레이어2", "ally", { str: 50, def: 20 });
  player.realDef = 20;
  player.realAtk = 30;

  const hpBefore = player.currentHp;
  applyDamageAndEffects(king, SkillRegistry.get("Break Down"), makeCtx([player], [king]));
  check("데미지가 들어감", player.currentHp < hpBefore);
  check("ATK 디버프가 들어감(bonusAtk < 0)", player.bonusAtk < 0);
  check("DEF 디버프가 들어감(bonusDef < 0)", player.bonusDef < 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
