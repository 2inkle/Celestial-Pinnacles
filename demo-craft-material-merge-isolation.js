// 개조된(craft_material) 장비 스택이 상점 구매/전투 전리품과 잘못 합쳐지던
// 버그의 회귀 검증. 2026-08-22 사용자 신고: "왕관 조각 개조가 된 모자를
// 하나 가지고 있었다. 그런데 이 상태에서 모자를 100개 샀더니, 왕관 조각
// 개조가 된 모자가 101개가 되었다."
//
// 원인: shop.html의 구매 확정, battle-view.html/dispatch.html의 전리품 병합
// 로직이 병합 대상 조회 시 held_by/enhance_level만 필터하고 craft_material은
// 안 봤음 — refinery.html/workshop.html/character-sheet.html은 이미
// 2026-08-20 전후로 이 필드를 반영해뒀는데 딱 이 세 경로만 놓쳐 있었음.
//
// web/*.html은 브라우저 전용이라 실제 Supabase 호출은 흉내낼 수밖에 없음 —
// 여기서는 "병합 대상을 찾는 쿼리 조건 자체"가 실제 파일에 존재하는지를
// 정적으로 확인함(런타임 목킹보다 이 버그의 본질에 더 가까움 — 문제는
// "쿼리가 craft_material을 거르는가"였지 로직 분기가 아니었음).
const fs = require("fs");
const path = require("path");

let pass = 0, fail = 0;
function check(label, ok) {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

function readInlineScript(file) {
  const src = fs.readFileSync(path.join(__dirname, "web", file), "utf8");
  return src;
}

console.log("==================================================");
console.log("1) web/shop.html — 구매 병합 조회가 craft_material까지 거르는지");
console.log("==================================================");
{
  const src = readInlineScript("shop.html");
  const poolQueryMatch = /const \{ data: poolRows.*?\}\);/s.exec(src);
  check("poolRows 조회 코드를 찾음", !!poolQueryMatch);
  const snippet = poolQueryMatch ? poolQueryMatch[0] : "";
  check(`poolRows 쿼리가 held_by를 거름`, snippet.includes('is("held_by", null)'));
  check(`poolRows 쿼리가 enhance_level을 거름`, snippet.includes('is("enhance_level", null)'));
  check(`poolRows 쿼리가 craft_material도 거름(이번 수정)`, snippet.includes('is("craft_material", null)'));
  check(`구매품 insert가 craft_material:null을 명시함`, src.includes("craft_material: null, // 상점 구매품은 항상 미개조"));
}

console.log("\n==================================================");
console.log("2) web/battle-view.html — 전리품 병합 조회가 craft_material까지 거르는지");
console.log("==================================================");
{
  const src = readInlineScript("battle-view.html");
  const lootQueryMatch = /const \{ data: existing, error: findError \} = await window\.sbClient[\s\S]*?maybeSingle\(\);/.exec(src);
  check("전리품 병합 조회 코드를 찾음", !!lootQueryMatch);
  const snippet = lootQueryMatch ? lootQueryMatch[0] : "";
  check(`전리품 조회가 held_by를 거름`, snippet.includes('is("held_by", null)'));
  check(`전리품 조회가 enhance_level을 거름`, snippet.includes('is("enhance_level", null)'));
  check(`전리품 조회가 craft_material도 거름(이번 수정)`, snippet.includes('is("craft_material", null)'));
  check(`전리품 insert가 craft_material:null을 명시함`, src.includes("craft_material: null, // 드랍 전리품은 항상 미개조"));
}

console.log("\n==================================================");
console.log("3) web/dispatch.html — 전리품 병합 조회가 craft_material까지 거르는지");
console.log("==================================================");
{
  const src = readInlineScript("dispatch.html");
  const lootQueryMatch = /const \{ data: existing, error: findError \} = await window\.sbClient[\s\S]*?maybeSingle\(\);/.exec(src);
  check("전리품 병합 조회 코드를 찾음", !!lootQueryMatch);
  const snippet = lootQueryMatch ? lootQueryMatch[0] : "";
  check(`전리품 조회가 held_by를 거름`, snippet.includes('is("held_by", null)'));
  check(`전리품 조회가 enhance_level을 거름`, snippet.includes('is("enhance_level", null)'));
  check(`전리품 조회가 craft_material도 거름(이번 수정)`, snippet.includes('is("craft_material", null)'));
  check(`전리품 insert가 craft_material:null을 명시함`, src.includes("craft_material: null, // 드랍 전리품은 항상 미개조"));
}

console.log("\n==================================================");
console.log("4) 이미 올바르게 처리하고 있던 기존 경로들 — 회귀 없이 그대로인지 확인(비교군)");
console.log("==================================================");
{
  const refinerySrc = readInlineScript("refinery.html");
  check("refinery.html은 이미 craft_material을 조건부로 거름(2026-08-20 수정, 회귀 없음)",
    refinerySrc.includes('baseQuery.eq("craft_material", craftMaterial) : baseQuery.is("craft_material", null)'));

  const workshopSrc = readInlineScript("workshop.html");
  check("workshop.html의 개조 병합도 craft_material을 거름(회귀 없음)",
    workshopSrc.includes('stackQuery.eq("craft_material", crafted.craftMaterial) : stackQuery.is("craft_material", null)'));

  const sheetSrc = readInlineScript("character-sheet.html");
  check("character-sheet.html의 해제(unequip) 병합도 craft_material을 거름(회귀 없음)",
    sheetSrc.includes('query.is("craft_material", null) : query.eq("craft_material", item.craftMaterial)'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
