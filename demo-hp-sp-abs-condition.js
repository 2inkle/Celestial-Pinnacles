// HP/SP 조건에서 unit:"pt"(절대치)를 골라도 항상 %로 번역되던 버그의 회귀
// 검증. 2026-08-21: 실제 유저 캐릭터 "레나"의 패턴에서 발견 — 아래 실제 신고된
// 패턴 그대로 재현함:
//   { "action":"Mana Recharge", "metric":"sp", "subject":"self",
//     "comparator":"lt", "unit":"pt", "value":150 }
// battle-adapter.js의 translateCondition()이 row.unit을 전혀 안 보고 항상
// MY_SP_LESS_THAN_PCT로만 번역해서, "SP < 150"이 "SP% < 150"이 돼버려 SP가
// 얼마든(최대 100%) 항상 참이었음 — 그래서 1번 슬롯(Mana Recharge)만 매턴
// 반복되고 2/3번 슬롯(SpellFocus/Lightning Ball)이 영영 선택되지 못했다.
//
// loadAdapterEnv()로 실제 web/battle-adapter.js(수정된 진짜 코드)를 그대로
// 얹어서, translatePatternRow()가 이 정확한 row를 어떤 엔진 조건으로
// 번역하는지와 그 조건이 실제로 올바르게 평가되는지를 함께 검증한다.
const { loadAdapterEnv } = require("./simulate");

const env = loadAdapterEnv();
const { BattleAdapter, BattleSim } = env;
const { ConditionRegistry, BattleCharacter } = BattleSim;

let pass = 0, fail = 0;
function check(label, ok) {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

console.log("==================================================");
console.log("1) 레나의 실제 신고된 row — translatePatternRow()가 ABS 조건으로 번역하는지");
console.log("==================================================");
const reportedRow = {
  unit: "pt", value: 150, action: "Mana Recharge",
  metric: "sp", subject: "self", comparator: "lt",
};
const translated = BattleAdapter.translatePatternRow(reportedRow);
console.log("  번역 결과:", JSON.stringify(translated));
check('cond가 MY_SP_LESS_THAN_ABS로 번역됨(PCT 아님)', translated.cond === "MY_SP_LESS_THAN_ABS");
check("val이 150 그대로 보존됨", translated.val === 150);

console.log("\n==================================================");
console.log("2) 번역된 조건이 실제로 절대치(SP 값 자체)로 평가되는지");
console.log("==================================================");
{
  const actor = new BattleCharacter("레나", "ally", { int: 50 });
  actor.maxSpBonus = 200; // maxSp를 넉넉하게 키움(레나가 실제로 SP가 큰 캐릭터라고 가정)

  actor.currentSp = actor.maxSp; // 풀 SP
  check(
    `풀 SP(${actor.currentSp}/${actor.maxSp})에서는 조건이 거짓(더 이상 Mana Recharge만 반복 안 함)`,
    ConditionRegistry.check(translated.cond, actor, {}, translated.val) === false
  );

  actor.currentSp = 100;
  check(
    "SP=100(150 미만)일 때는 조건이 참(Mana Recharge가 정상적으로 선택됨)",
    ConditionRegistry.check(translated.cond, actor, {}, translated.val) === true
  );

  // MY_SP_LESS_THAN_ABS/PCT 둘 다 lt/lte를 구분 안 하고 항상 "<="로 판정함
  // (기존 PCT 버전부터 있던 컨벤션 그대로 유지 — 이 버그 수정 범위 밖).
  actor.currentSp = 151;
  check(
    "SP=151(임계값 초과)일 때는 조건이 거짓",
    ConditionRegistry.check(translated.cond, actor, {}, translated.val) === false
  );
}

console.log("\n==================================================");
console.log("3) unit이 \"%\"(또는 미지정, 기본값)인 기존 패턴 — 회귀 없이 그대로 PCT로 번역");
console.log("==================================================");
{
  const pctRow = { value: 30, action: "Mana Recharge", metric: "sp", subject: "self", comparator: "lt" };
  const translatedPct = BattleAdapter.translatePatternRow(pctRow);
  check("unit 미지정이면 여전히 MY_SP_LESS_THAN_PCT로 번역됨(회귀 없음)", translatedPct.cond === "MY_SP_LESS_THAN_PCT");

  const hpRow = { value: 50, action: "힐", metric: "hp", subject: "self", comparator: "lte" };
  const translatedHp = BattleAdapter.translatePatternRow(hpRow);
  check("HP 조건도 unit 미지정이면 MY_HP_LESS_THAN_PCT로 번역됨(회귀 없음)", translatedHp.cond === "MY_HP_LESS_THAN_PCT");

  const hpAbsRow = { value: 300, unit: "pt", action: "힐", metric: "hp", subject: "self", comparator: "lte" };
  const translatedHpAbs = BattleAdapter.translatePatternRow(hpAbsRow);
  check("HP 조건도 unit:pt면 MY_HP_LESS_THAN_ABS로 번역됨(SP와 동일하게 수정됨)", translatedHpAbs.cond === "MY_HP_LESS_THAN_ABS");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
