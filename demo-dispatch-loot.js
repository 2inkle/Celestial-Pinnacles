// ============================================================================
// 파견 전리품 정산 방식 검증
//
// dispatch.html의 finalLoot 계산이 "확률적 반올림"인 이유를 실측으로 확인한다.
//   A 현행-이전 : floor(raw/100)              — 나머지를 버림
//   B 드랍율    : chance/100으로 굴림          — 기댓값은 같지만 분산 폭증
//   C 채택안    : floor(raw/100) + 나머지 확률 — 기댓값 보존 + 저분산
//
// 확인 항목(아래 ASSERT):
//   1. A는 원본 누적량이 100 미만인 희귀 아이템을 100% 확률로 0개로 만든다
//      (= 파견으로는 영구히 획득 불가). C는 그렇지 않다.
//   2. C의 기댓값은 raw/100에 수렴한다(A는 내림 때문에 체계적으로 미달).
//   3. C는 흔한 재료에서 0개가 나오지 않는다(B는 절반이 0개).
//
// 확률적 검증이라 simulate.js와 성격이 겹쳐 보이지만, 목적은 "이 정산식이
// 명세대로 도는가"를 고정 조건에서 확인하는 것이라 demo-* 쪽에 둔다.
// ============================================================================
const DISPATCHES = 50000;
const BATTLES = 100;   // 2000턴 동안 대략 100회 전투
const D = 100;         // LOOT_DIVISOR

// 실제 monster-roster.html 시드값에서 가져온 대표 사례
// [이름, chance, qtyMin, qtyMax, 전투당 처치 수]
const ITEMS = [
  ["고블린의 이빨(섭정)",  0.7,  2, 4, 1],     // 흔함
  ["왕관 조각(섭정)",      0.18, 1, 1, 1],     // 희귀
  ["오래된 바퀴 자국(왕)", 0.12, 1, 1, 0.25],  // 매우 희귀(왕이 25% 전투에만 등장)
];

const qty = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

// dispatch.html의 finalLoot와 동일한 식
function settleC(raw) {
  const exact = raw / D;
  let q = Math.floor(exact);
  if (Math.random() < exact - q) q += 1;
  return q;
}

function run(name, chance, min, max, killsPerBattle) {
  let aSum = 0, bSum = 0, cSum = 0, rawSum = 0;
  let aZero = 0, bZero = 0, cZero = 0;

  for (let d = 0; d < DISPATCHES; d++) {
    let raw = 0, bTotal = 0;
    for (let b = 0; b < BATTLES; b++) {
      const kills = killsPerBattle >= 1
        ? killsPerBattle
        : (Math.random() < killsPerBattle ? 1 : 0);
      for (let k = 0; k < kills; k++) {
        if (Math.random() <= chance) raw += qty(min, max);
        if (Math.random() <= chance / D) bTotal += qty(min, max);
      }
    }
    const a = Math.floor(raw / D);
    const c = settleC(raw);
    rawSum += raw; aSum += a; bSum += bTotal; cSum += c;
    if (!a) aZero++;
    if (!bTotal) bZero++;
    if (!c) cZero++;
  }

  const r = (x) => x / DISPATCHES;
  return {
    name,
    ideal: r(rawSum) / D,
    a: r(aSum), b: r(bSum), c: r(cSum),
    aZero: r(aZero) * 100, bZero: r(bZero) * 100, cZero: r(cZero) * 100,
  };
}

let failed = 0;
function assert(cond, msg) {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failed++;
}

console.log(`파견 전리품 정산 검증 — 파견 ${DISPATCHES.toLocaleString()}회 × 전투 ${BATTLES}회\n`);

const results = ITEMS.map((i) => run(...i));

for (const x of results) {
  console.log(`=== ${x.name} ===`);
  console.log(`  이상적 기댓값(raw/${D})  ${x.ideal.toFixed(3)}`);
  console.log(`  A 내림       평균 ${x.a.toFixed(3)}   0개 ${x.aZero.toFixed(1)}%`);
  console.log(`  B 드랍율÷${D}  평균 ${x.b.toFixed(3)}   0개 ${x.bZero.toFixed(1)}%`);
  console.log(`  C 채택안     평균 ${x.c.toFixed(3)}   0개 ${x.cZero.toFixed(1)}%`);
  console.log("");
}

const common = results[0];
const rare = results.slice(1);

console.log("검증 결과:");
// 1. 희귀 아이템: A는 완전 봉쇄, C는 획득 가능
rare.forEach((x) => {
  assert(x.aZero === 100, `[${x.name}] 이전 방식(A)은 100% 0개 — 파견으로 획득 불가였음`);
  assert(x.cZero < 100, `[${x.name}] 채택안(C)은 획득 가능(0개 비율 ${x.cZero.toFixed(1)}%)`);
});
// 2. 기댓값 보존 — C는 이상값과 오차 2% 이내, A는 체계적으로 미달
assert(Math.abs(common.c - common.ideal) / common.ideal < 0.02,
  `[${common.name}] C의 기댓값이 이상값(${common.ideal.toFixed(3)})과 2% 이내로 일치`);
assert(common.a < common.ideal * 0.95,
  `[${common.name}] A는 내림 손실로 이상값 대비 5% 이상 미달(${common.a.toFixed(3)})`);
// 3. 분산 — C는 흔한 재료에서 0개가 안 나오고, B는 자주 0개
assert(common.cZero < 1, `[${common.name}] C는 0개가 거의 안 나옴(${common.cZero.toFixed(1)}%)`);
assert(common.bZero > 30, `[${common.name}] B는 분산이 커서 0개가 자주 나옴(${common.bZero.toFixed(1)}%)`);

console.log(failed ? `\n${failed}건 실패` : "\n전부 통과");
process.exit(failed ? 1 : 0);
