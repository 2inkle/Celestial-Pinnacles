// applyDealtPassiveMods가 덧셈이 아니라 복리(곱연산)로 바뀐 것 검증.
// "???"의 damageDealtTo_userPct(-95)와 Mana Guard류 자기 버프
// (magicDamageDealtPct:+25)가 서로 독립적으로 곱해지는지 확인 —
// 예전(덧셈) 방식이었다면 -95+25=-70%에 그쳤을 것.
const { BattleCharacter } = require("./src/character");
const { ActionRegistry } = require("./src/registries");

console.log("==================================================");
console.log("applyDealtPassiveMods 복리 적용 검증");
console.log("==================================================");

function freshCtx(allies, enemies) {
  return { log: () => {}, recordDamageDealt: () => {}, allies, enemies, getOpponents: (a) => (a.side === "ally" ? enemies : allies) };
}

console.log("\n[1] 기준 데미지(패시브 없음)");
let baseline;
{
  const boss = new BattleCharacter("보스", "enemy", { str: 100, int: 10, dex: 10, spd: 10, luk: 0 });
  boss.realAtk = 1000;
  const user = new BattleCharacter("유저", "ally", { str: 10, int: 10, dex: 10, spd: 10, luk: 10 });
  const before = user.currentHp;
  ActionRegistry.execute("ATTACK", boss, freshCtx([user], [boss]));
  baseline = before - user.currentHp;
  console.log(`  기준 피해량: ${baseline}`);
}

console.log("\n[2] damageDealtTo_userPct: -95 단독 — 기준의 5%");
{
  const boss = new BattleCharacter("보스", "enemy", { str: 100, int: 10, dex: 10, spd: 10, luk: 0 });
  boss.realAtk = 1000;
  boss.passiveMods.damageDealtTo_userPct = -95;
  const user = new BattleCharacter("유저", "ally", { str: 10, int: 10, dex: 10, spd: 10, luk: 10 });
  const before = user.currentHp;
  ActionRegistry.execute("ATTACK", boss, freshCtx([user], [boss]));
  const dealt = before - user.currentHp;
  const expected = Math.round(baseline * 0.05);
  console.log(`  피해량: ${dealt} (기대값 ≈ ${expected})`, Math.abs(dealt - expected) <= 1 ? "✅" : "❌");
}

console.log("\n[3] damageDealtTo_userPct:-95 + physicalDamageDealtPct:+25 동시(복리) — (1-0.95)×(1+0.25) = 0.0625배");
{
  const boss = new BattleCharacter("보스", "enemy", { str: 100, int: 10, dex: 10, spd: 10, luk: 0 });
  boss.realAtk = 1000;
  boss.passiveMods.damageDealtTo_userPct = -95;
  boss.passiveMods.physicalDamageDealtPct = 25;
  const user = new BattleCharacter("유저", "ally", { str: 10, int: 10, dex: 10, spd: 10, luk: 10 });
  const before = user.currentHp;
  ActionRegistry.execute("ATTACK", boss, freshCtx([user], [boss]));
  const dealt = before - user.currentHp;
  const expected = Math.round(baseline * 0.05 * 1.25);
  console.log(`  피해량: ${dealt} (기대값 ≈ ${expected}, 복리라면 5%가 아니라 6.25%가 돼야 함)`, Math.abs(dealt - expected) <= 2 ? "✅" : "❌");
  console.log(`  (참고: 예전 덧셈 방식이었다면 -95+25=-70% → ${Math.round(baseline * 0.30)} 정도가 나왔을 것)`);
}

console.log("\n[4] 극단적으로 낮은 개별 출처(-150%)가 있어도 배율이 음수로 안 뒤집히는지(개별 클램프)");
{
  const boss = new BattleCharacter("보스", "enemy", { str: 100, int: 10, dex: 10, spd: 10, luk: 0 });
  boss.realAtk = 1000;
  boss.passiveMods.physicalDamageDealtPct = -150; // 1+(-1.5) = -0.5, 클램프 없으면 음수
  boss.passiveMods.damageDealtTo_userPct = -150;  // 여기도 음수 배율 -> 곱하면 다시 양수(버그)가 될 뻔한 케이스
  const user = new BattleCharacter("유저", "ally", { str: 10, int: 10, dex: 10, spd: 10, luk: 10 });
  const before = user.currentHp;
  ActionRegistry.execute("ATTACK", boss, freshCtx([user], [boss]));
  const dealt = before - user.currentHp;
  console.log(`  피해량: ${dealt} (기대값 0 — 두 출처 다 0으로 클램프돼서 곱해도 0)`, dealt === 0 ? "✅" : "❌");
}
