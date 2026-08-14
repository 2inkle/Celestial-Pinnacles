const { BattleCharacter } = require("./src/character");
const { PrepState, DELAY_RESISTANCE_CAP_RATIO } = require("./src/prepState");

// ============================================================================
// 딜레이 저항 규칙 검증
// 원래 선딜레이 300틱짜리 스킬에 105%짜리 지연 효과를 4번 연속으로 맞힌다.
// 총 발동 지연이 원래 선딜레이의 250%(=750틱)를 절대 못 넘어야 한다.
// 즉 추가로 밀 수 있는 양은 원래 선딜의 1.5배인 450틱까지.
//   1번째: +315 (누적 315)  -> 그대로 적용
//   2번째: +315 (누적 630)  -> 그대로 적용
//   2번째: +315 요청이지만 남은 여유가 135뿐 -> 135만 적용(누적 450, 한도 도달)
//   4번째: 이미 한도 도달 -> 완전히 무효
// ============================================================================

console.log("==================================================");
console.log(`딜레이 저항 규칙 검증 (캡 비율: 원래 선딜레이의 ${DELAY_RESISTANCE_CAP_RATIO * 100}%)`);
console.log("==================================================");

const prep = new PrepState();
const target = new BattleCharacter("영원히 캐스팅하는 자", "enemy", { int: 20 });

const castSkill = { name: "장대한 의식", preDelay: 300, preDelayType: "casting" };
const record = prep.begin(target, castSkill, 0);
console.log(`\n[0틱] "${target.name}" 시전 시작 (선딜레이 ${castSkill.preDelay}틱) -> 원래 발동 예정: ${record.readyAtTick}틱`);
console.log(`딜레이 저항 한도: ${castSkill.preDelay} × ${DELAY_RESISTANCE_CAP_RATIO} = ${castSkill.preDelay * DELAY_RESISTANCE_CAP_RATIO}틱까지만 추가 가능\n`);

const effect = { requiresPreDelayType: "casting", value: 105 };

for (let i = 1; i <= 4; i++) {
  const result = prep.applyDelayEffect(target, effect);
  console.log(`--- ${i}번째 방해 시도 (105% = 요청 ${(castSkill.preDelay * 1.05).toFixed(1)}틱) ---`);
  if (!result.applied) {
    console.log(`   ❌ 완전 무효: ${result.reason}`);
  } else if (result.resisted) {
    console.log(`   🛡️ 저항 발동: 요청 ${result.requestedDelay.toFixed(1)}틱 중 ${result.addedDelay.toFixed(1)}틱만 적용 (발동 예정 ${result.beforeTick.toFixed(1)} -> ${result.afterTick.toFixed(1)}틱)`);
  } else {
    console.log(`   ✅ 전량 적용: +${result.addedDelay.toFixed(1)}틱 (발동 예정 ${result.beforeTick.toFixed(1)} -> ${result.afterTick.toFixed(1)}틱)`);
  }
}

const finalRecord = prep.get(target);
console.log(`\n최종 발동 예정 시점: ${finalRecord.readyAtTick}틱 (원래 선딜 300 × 캡 2.5 = 750틱이 상한)`);
console.log(`검증: 최종 누적 추가 딜레이 ${finalRecord.addedDelay}틱 === 추가한도(450틱)? ${finalRecord.addedDelay === 450 ? "✅ 일치" : "❌ 불일치"}`);
console.log(`검증: 최종 발동 예정 ${finalRecord.readyAtTick}틱 === 750틱(원래의 2.5배)? ${finalRecord.readyAtTick === 750 ? "✅ 일치" : "❌ 불일치"}`);
