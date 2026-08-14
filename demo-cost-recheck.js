const { BattleCharacter } = require("./src/character");
const { PrepState } = require("./src/prepState");

// ============================================================================
// 시나리오: SP 100을 요구하는 스킬을 준비 중인데, 그 선딜레이 도중 SP 감소
// 효과를 맞아 100 미만이 되면 발동이 불발되어야 한다. (완전 차단 효과는 없고,
// 이 "코스트 재판정"만이 유일한 발동 실패 사유)
// ============================================================================

const prep = new PrepState();

const caster = new BattleCharacter("시전자 E", "ally", { int: 20 });
caster.currentSp = 120; // 시작 시점엔 충분

const bigSpell = {
  name: "대폭발 마법",
  skillType: "magic",
  stat: "int",
  coefficient: 3.0,
  preDelay: 250,
  preDelayType: "casting",
  costs: [{ type: "sp", amount: 100 }],
};

console.log("==================================================");
console.log("A) 정상 케이스 — 선딜레이 중 아무 방해 없음 -> 발동 성공");
console.log("==================================================");

console.log(`\n[0틱] E, "${bigSpell.name}" 시전 시작 (SP ${caster.currentSp}, 요구 SP ${bigSpell.costs[0].amount})`);
prep.begin("E", bigSpell, 0);

console.log(`[${bigSpell.preDelay}틱] 발동 시점 도래 -> 코스트 재판정`);
const okResult = prep.resolve("E", caster);
if (okResult.activated) {
  console.log(`   ✅ 발동 성공! SP ${caster.currentSp + bigSpell.costs[0].amount} -> ${caster.currentSp} (100 소모)`);
} else {
  console.log(`   ❌ 발동 실패: ${okResult.reason}`);
}

// ============================================================================
// B) 실패 케이스 — 선딜레이 도중 SP 감소 효과를 맞아 요구치 미만이 됨
// ============================================================================
console.log("\n==================================================");
console.log("B) 실패 케이스 — 선딜레이 중 SP 감소 효과를 맞음 -> 발동 실패");
console.log("==================================================");

const caster2 = new BattleCharacter("시전자 F", "ally", { int: 20 });
caster2.currentSp = 120;

console.log(`\n[1000틱] F, "${bigSpell.name}" 시전 시작 (SP ${caster2.currentSp}, 요구 SP ${bigSpell.costs[0].amount})`);
prep.begin("F", bigSpell, 1000);
console.log(`         -> 발동 예정: ${prep.get("F").readyAtTick}틱`);

// 1150틱에 상대가 "SP 갈취" 같은 스킬로 F에게 spDown 효과를 적중시킴 (effects: spDown, value: 40)
console.log(`\n[1150틱] 상대가 F에게 "SP 감소(-40)" 효과 적중`);
caster2.currentSp -= 40;
console.log(`         F의 남은 SP: ${caster2.currentSp} (요구치 ${bigSpell.costs[0].amount}에 미달)`);

console.log(`\n[${1000 + bigSpell.preDelay}틱] 발동 시점 도래 -> 코스트 재판정`);
const failResult = prep.resolve("F", caster2);
if (failResult.activated) {
  console.log(`   ✅ 발동 성공! (예상과 다름 — 버그 의심)`);
} else {
  console.log(`   ❌ 발동 실패: ${failResult.reason}`);
  console.log(`   -> 이 실패는 반드시 전투 로그에 "F의 "${bigSpell.name}" 발동 실패!" 형태로 알려져야 함`);
}

console.log(`\n검증: A는 성공(${okResult.activated}), B는 실패(${failResult.activated === false}) -> ${okResult.activated && failResult.activated === false ? "✅ 일치" : "❌ 불일치"}`);

// F의 SP는 실패해도 이미 깎인 40은 그대로 남아있어야 함(코스트 100은 애초에 못 냈으니 안 깎임)
console.log(`F 최종 SP: ${caster2.currentSp} (spDown으로 깎인 40만 반영, 스킬 코스트 100은 발동 실패라 차감 안 됨) -> ${caster2.currentSp === 80 ? "✅ 일치" : "❌ 불일치"}`);
