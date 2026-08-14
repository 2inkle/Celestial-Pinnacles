// ============================================================================
// 경험치 테이블 / 레벨업 검증 (web/exp-table.js)
//
// 확정된 공식:
//   Lv1        100
//   Lv2        200
//   Lv3 이상   160 + 17 × Lv²
//   Lv30(상한) EXP_HARD_CAP(999999) — 만렙에서 레벨업이 절대 안 일어나게 하는 값
//
// 예전엔 이 공식이 battle-view.html 안에만 있어서 실제로는 거의 적용되지 않았음
// (hire/village가 신규 캐릭터를 expToNext:1000으로 생성, dispatch는 레벨업 판정
// 자체를 안 함). 공용 모듈로 분리하면서 이 데모로 고정함.
// ============================================================================
const ExpTable = require("./web/exp-table.js");
const { LEVEL_CAP, EXP_HARD_CAP, expToNextForLevel, syncExpFields, grantExp } = ExpTable;

let failed = 0;
function assert(cond, msg) {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failed++;
}
function eq(actual, expected, msg) {
  assert(actual === expected, `${msg} (기대 ${expected}, 실제 ${actual})`);
}

console.log("1) 공식 자체\n");
eq(expToNextForLevel(1), 100, "Lv1 → 100");
eq(expToNextForLevel(2), 200, "Lv2 → 200");
eq(expToNextForLevel(3), 160 + 17 * 9, "Lv3 → 160+17×3²=313");
eq(expToNextForLevel(10), 160 + 17 * 100, "Lv10 → 160+17×10²=1860");
eq(expToNextForLevel(29), 160 + 17 * 841, "Lv29 → 160+17×29²=14457");
eq(expToNextForLevel(LEVEL_CAP), EXP_HARD_CAP, "Lv30(상한) → EXP_HARD_CAP");

console.log("\n2) 레벨업 동작\n");
{
  const c = { level: 1, exp: 0, expToNext: expToNextForLevel(1) };
  grantExp(c, 99);
  assert(c.level === 1 && c.exp === 99, "99 경험치로는 Lv1 유지");

  grantExp(c, 1); // 누적 100
  assert(c.level === 2 && c.exp === 0, "정확히 100에서 Lv2로 상승, 잉여 0");
  eq(c.expToNext, 200, "Lv2의 expToNext가 200으로 갱신됨");
}
{
  const c = { level: 1, exp: 0, expToNext: expToNextForLevel(1) };
  grantExp(c, 350); // 100(→2) + 200(→3) = 300 소모, 50 남음
  assert(c.level === 3 && c.exp === 50, "한 번에 여러 레벨 상승하고 잉여가 이월됨");
}

console.log("\n3) 만렙 안전장치\n");
{
  const c = { level: 1, exp: 0, expToNext: expToNextForLevel(1) };
  grantExp(c, 10 ** 9);
  eq(c.level, LEVEL_CAP, "경험치를 아무리 줘도 상한을 못 넘음");
  eq(c.expToNext, EXP_HARD_CAP, "만렙의 expToNext는 EXP_HARD_CAP");
  assert(c.exp <= EXP_HARD_CAP, "exp도 EXP_HARD_CAP을 안 넘음");

  const before = c.level;
  grantExp(c, 10 ** 9);
  eq(c.level, before, "만렙에서 추가 경험치를 줘도 레벨이 안 오름");
}

console.log("\n4) 잘못 저장된 값 자동 교정\n");
{
  // 예전 hire.html이 만들던 형태 — Lv1인데 expToNext가 1000
  const legacy = { level: 1, exp: 0, expToNext: 1000 };
  syncExpFields(legacy);
  eq(legacy.expToNext, 100, "Lv1 캐릭터의 expToNext:1000이 100으로 교정됨");

  // 예전 village.html 예제 캐릭터 — Lv30인데 expToNext가 50000
  const legacyMax = { level: 30, exp: 0, expToNext: 50000 };
  syncExpFields(legacyMax);
  eq(legacyMax.expToNext, EXP_HARD_CAP, "Lv30 캐릭터의 expToNext:50000이 상한값으로 교정됨");

  // 교정 후 실제 레벨업도 공식대로 되는지
  const c = { level: 1, exp: 0, expToNext: 1000 };
  grantExp(c, 100);
  eq(c.level, 2, "expToNext가 1000으로 저장돼 있어도 100 경험치에 Lv2로 상승");

  // 범위 밖 값 방어
  const broken = { level: 0, exp: -5, expToNext: 0 };
  syncExpFields(broken);
  assert(broken.level === 1 && broken.exp === 0, "level 0 / 음수 exp도 안전하게 보정됨");
}

console.log("\n5) Lv1→30 누적 필요 경험치\n");
{
  let total = 0;
  for (let lv = 1; lv < LEVEL_CAP; lv++) total += expToNextForLevel(lv);
  console.log(`  Lv1 → Lv${LEVEL_CAP} 누적: ${total.toLocaleString()}`);
  // 설계 의도는 "약 150,000" — 크게 벗어나면 곡선이 바뀐 것이므로 알림
  assert(total > 120000 && total < 180000, "누적 필요 경험치가 설계 의도(약 15만) 범위 안");
}

console.log(failed ? `\n${failed}건 실패` : "\n전부 통과");
process.exit(failed ? 1 : 0);
