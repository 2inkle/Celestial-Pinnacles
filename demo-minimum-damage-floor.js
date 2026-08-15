// "방어력이 아무리 높아도 최소 10%는 통과한다" 규칙이, 이번 세션에서 손댄
// 것들(applyDealtPassiveMods 복리화, damageDealtTo_userPct)과 맞물려도 여전히
// 지켜지는지 재확인. 규칙 자체(src/character.js의 takeDamage)는 이번 세션에
// 손댄 적 없지만, "가하는 피해" 쪽 계산이 크게 바뀌었으니 상호작용을 명시적으로
// 검증해둘 가치가 있음(2026-08-16, 사용자 요청).
const { BattleCharacter } = require("./src/character");

console.log("==================================================");
console.log("최소피해 10% 규칙 재검증 — 방어력을 아무리 올려도 원본의 10%는 통과");
console.log("==================================================");

console.log("\n[1] MDEF 0일 때 기준 피해량(맞고 죽지 않게 HP를 넉넉히 잡음)");
let baseline;
{
  const target = new BattleCharacter("대상", "ally", { str: 10, int: 10, dex: 10, spd: 10, luk: 10 });
  target.maxHpOverride = 100000;
  target.currentHp = 100000;
  baseline = target.takeDamage(1000, "magic");
  console.log(`  피해량: ${baseline} (기대값 1000, MDEF 없으니 그대로)`, baseline === 1000 ? "✅" : "❌");
}

console.log("\n[2] MDEF를 극단적으로 높여도(realMdef 500, effectiveMdef 500%캡) 최소 10%(=100)는 통과");
{
  const target = new BattleCharacter("대상", "ally", { str: 10, int: 10, dex: 10, spd: 10, luk: 10 });
  target.realMdef = 500; // realMitigation/100 = 5.0 → percentMultiplier가 0으로 클램프
  target.bonusMdef = 2000; // effectiveMdef = clamp(500+2000, 250, 2500) = 2500(=real*5 캡)
  const applied = target.takeDamage(1000, "magic");
  console.log(`  피해량: ${applied} (기대값 100 = 1000×0.1, 방어로 전부 막혀도 최소치는 통과)`, applied === 100 ? "✅" : "❌");
}

console.log("\n[3] 방어측 MDEF가 얼마나 높든, minimumDamageBasis를 넘겨주면 그 기준의 10%가 적용되는지");
console.log("    (연타점감/damageDealtTo_userPct처럼 '공격 측이 의도적으로 낮춘 위력'은");
console.log("     방어력의 최소피해 보장 기준에서 빠지면 안 됨 — 최소치 자체가 공격 측 조정 이후 값 기준)");
{
  const target = new BattleCharacter("대상", "ally", { str: 10, int: 10, dex: 10, spd: 10, luk: 10 });
  target.realMdef = 999;
  target.bonusMdef = 5000;
  // 공격 측이 이미 damageDealtTo_userPct 등으로 낮춘 "최종" 위력이 50이라면,
  // 방어력이 아무리 높아도 그 50의 10%(=5)는 반드시 통과해야 함.
  const applied = target.takeDamage(50, "magic", { minimumDamageBasis: 50 });
  console.log(`  피해량: ${applied} (기대값 5 = 50×0.1)`, applied === 5 ? "✅" : "❌");
}

console.log("\n[4] 실전 시나리오: '???'(damageDealtTo_userPct:-95, 복리 적용) vs 500% MDEF 캡을 찍은 파티원");
{
  const { computeSkillPower } = require("./src/combatFormulas");
  const { applyDealtPassiveMods } = require("./src/combatFormulas");
  const boss = new BattleCharacter("???", "enemy", { str: 10, int: 30, dex: 10, spd: 10, luk: 10 });
  boss.realMatk = 25;
  boss.passiveMods.damageDealtTo_userPct = -95;
  const skill = { stat: "int", coefficient: 2.6, skillType: "magic" };
  const rawPower = Math.floor(computeSkillPower(boss, skill));
  const finalPower = applyDealtPassiveMods(boss, rawPower, "magic", "int", "user");
  console.log(`  raw power: ${rawPower}, -95% 적용 후: ${finalPower}`);

  const target = new BattleCharacter("화이트아크", "ally", { str: 10, int: 10, dex: 10, spd: 10, luk: 10 });
  target.realMdef = 50;
  target.bonusMdef = 200; // effectiveMdef = clamp(250, 25, 250) = 250 (500%캡)
  const applied = target.takeDamage(finalPower, "magic", { minimumDamageBasis: finalPower, attackerTier: "boss" });
  const expectedMin = Math.floor(finalPower * 0.1);
  console.log(`  실제 피해량: ${applied} (최소 보장 기준 ${expectedMin} 이상이어야 함)`, applied >= expectedMin ? "✅" : "❌");
}
