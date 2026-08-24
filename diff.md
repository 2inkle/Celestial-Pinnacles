# diff.md — Sheet 스킬 카드 효과 표시 누락 2건 수정 (2026-08-24)

이 파일은 오늘(2026-08-24) 별도 작업 세션(Node.js가 설치 안 된 환경)에서
진행한 수정 전체를 기록한 것 — 주 워크스페이스에서 이 파일 하나만 보고
병합 여부를 판단할 수 있게 하는 목적. **전수 재조사가 필요 없도록** 배경·
근거·실제 diff를 전부 담았다.

- **기준 브랜치**: `main` (커밋 `89eeb0c`, 이 브랜치를 만들 때 최신이었고
  드리프트 없이 그 위에 그대로 얹음 — 별도 확인해서 병합 시 `main`이 그
  사이 더 앞서있지 않은지만 재확인하면 됨)
- **작업 브랜치**: `skill-card-effect-fix-2026-08-24`
- **변경 파일**: `CLAUDE.md`, `demo-skill-card-effect-descriptions.js`,
  `web/character-sheet.html` — 이 3개뿐. 엔진(`src/`)은 전혀 안 건드림.

## 배경 요약

2026-08-22에 "스킬 카드 효과 27종 전수 등록" 수정이 있었는데, 그 "27종"
목록이 실제 데이터에서 뽑은 게 아니라 검증 스크립트에 사람이 직접 나열한
목록이었다. 이번에 사용자 요청으로 재검증한 결과 실제로 2건이 더 빠져
있었음을 발견해서 수정함 — 자세한 배경/조사 과정은 `CLAUDE.md`의 새 항목
("Sheet 스킬 카드 효과 표시 — '27종 전수 등록'(2026-08-22) 이후에도
남아있던 누락 2건 수정")에 그대로 들어있음(아래 diff의 `CLAUDE.md` 부분
참고).

## 병합 전 체크리스트 (반드시 실행)

이 세션 환경에 Node.js가 없어서 아래를 직접 실행 못 했음 — 코드 리뷰와
브레이스 균형 대조로 구문 오류는 없다고 판단했지만, **병합 전 반드시
실제로 돌려서 확인할 것**:

```bash
node demo-skill-card-effect-descriptions.js   # 새로 추가한 검증 7개 섹션 전부 통과해야 함
node index.js
for f in demo-*.js; do node "$f" || echo "FAILED: $f"; done   # 전체 회귀, 전부 통과해야 함
```

위 전부 통과하면, 순수 표시 계층 수정(`web/character-sheet.html`
`EFFECT_TYPES`/`describeEffect()`/`PASSIVE_MOD_LABELS`/
`describePassiveFields()`만 수정, 엔진 로직 무관)이라 회귀 위험은 낮다고
판단됨.

## 병합 방법

```bash
# 주 워크스페이스(진짜 작업 중인 clone)에서
git remote add review C:/Users/user/Downloads/Celestial-Pinnacles-review   # 경로는 실제 위치로 변경
git fetch review
git log review/skill-card-effect-fix-2026-08-24 -p   # 아래 diff와 대조해 재확인 원하면
git merge review/skill-card-effect-fix-2026-08-24     # 위 체크리스트 통과 후 병합
```

## 전체 diff

```diff
diff --git a/CLAUDE.md b/CLAUDE.md
index 4366944..3adcda2 100644
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -6,6 +6,102 @@ JS로 만드는 턴제 전투 시뮬레이션 웹게임. 패턴 빌드로 스킬
 테마(마을→왕국→그 뒤) 하나만 구현돼 있고, 이걸로 엔진과 성장곡선이
 유효한지 검증하는 게 목표.
 
+## Sheet 스킬 카드 효과 표시 — "27종 전수 등록"(2026-08-22) 이후에도 남아있던 누락 2건 수정 (2026-08-24)
+
+바로 아래(2026-08-22) "실전투 신고 4건 일괄 수정"의 4번 항목("Sheet 화면
+스킬 카드가 효과의 74%를 설명 안 하고 있던 문제")이 27종 effects[].type을
+전수 등록했다고 마무리됐었는데, 사용자가 "Sheet에서 보여주는 스킬 효과가
+실제로 해당 스킬에 대한 모든 걸 알려주고 있는지 확인해보겠다"며 재검증을
+요청 → 실제로 2건이 더 있었음을 발견.
+
+**핵심 원인**: 그 "27종" 목록은 실제 스킬 데이터에서 뽑아낸 게 아니라
+`demo-skill-card-effect-descriptions.js`에 사람이 직접 나열한 목록이었고,
+그 나열 작업 자체에서 실사용 타입 하나가 빠졌던 것 — "전수 등록했다"는
+검증이 스스로가 만든 목록만 검증하고 있어서, 목록 자체의 누락은 못 잡는
+구조였다.
+
+### 1. `spDamage`(SP 직접 피해) 타입이 통째로 등록 누락
+
+`EFFECT_TYPES`/`describeEffect()`(`web/character-sheet.html`) 어디에도
+`spDamage` case가 없어서, 이 타입을 쓰는 실사용 스킬 7개(Mana Break/Soul
+Break/EnergyRob/EnergyCollect/Soul Storm/Mana Burn/Banishment)가 값(SP
+피해%)도 `casterSpRestorePct`(EnergyRob/EnergyCollect류 "SP 흡수" 핵심
+메커니즘)도 하나도 안 보이고 `"spDamage(설명 미등록)"`이라는 빈 폴백만
+뜨고 있었음.
+
+**폴백 구조 자체의 근본 결함도 같이 발견**: `describeEffect()`의 `default`
+분기가 `!meta`(카탈로그에 없는 타입)일 때 `e.value`/`e.stat`/`e.resource`
+등 원본 필드를 아예 안 보고 `"{type}(설명 미등록)"`만 반환하고 있었음 —
+"타입의 존재는 알린다"는 8/22 설계 의도는 지켜졌지만 "수치까지는 여전히
+숨겨진다"는 구멍이 구조적으로 남아있었고, `spDamage`가 정확히 이 구멍에
+걸렸던 것. 앞으로 또 등록을 깜빡해도 재발하는 구조였음.
+
+### 2. `dexDamageDealtPct` 패시브 라벨 누락(Job Master: Arcane Archer)
+
+16개 패시브 스킬(`passive:true`) 전부를 하나하나 필드 단위로 대조하는
+과정에서 발견 — Job Master: Arcane Archer의
+`passiveMods.dexDamageDealtPct:8`이 `PASSIVE_MOD_LABELS`에 없어서 한글
+라벨 없이 `"dexDamageDealtPct +8"`로 **내부 필드명이 그대로 카드에
+노출**되고 있었음. 나머지 8개 `passiveMods` 키는 전부 정상이었고 이
+하나만 빠져 있었음.
+
+### 검증 방법론 — 필드 존재 확인이 아니라 실제 렌더 텍스트를 계산해서 대조
+
+이번 재검증의 핵심은 "그 필드가 표시 코드에 언급돼 있는가"가 아니라
+**"그 필드를 넣었을 때 실제로 어떤 텍스트가 나오는가"를 코드 로직 그대로
+손으로 계산해서 스킬 하나하나 대조**한 것 — `dexDamageDealtPct` 누락은
+필드 존재 여부만 봤으면 못 잡았을 것("passiveMods가 있다"는 사실 자체는
+맞았으므로). 16개 패시브 스킬 전부의 예상 카드 텍스트를 표로 만들어
+사용자에게 직접 보여주고 나서야 이 gap이 드러남.
+
+**수정 범위**: `web/character-sheet.html` 한 파일, `EFFECT_TYPES`/
+`describeEffect()`/`PASSIVE_MOD_LABELS`/`describePassiveFields()` 네
+곳(엔진 `src/skillResolution.js`는 전혀 안 건드림 — 순수 표시 계층 수정):
+1. `describeEffect()`에 `spDamage` case 신설(값 + `casterSpRestorePct`
+   흡수 정보 반영).
+2. `default` 폴백 자체를 구조적으로 강화 — `!meta`여도 `value`/`stat`/
+   `resource` 중 존재하는 필드는 텍스트에 최소한 보이게 함(같은 종류의
+   재발을 원천 차단).
+3. `PASSIVE_MOD_LABELS`에 `dexDamageDealtPct` 한글 라벨 추가.
+4. `EFFECT_TYPES`에 실사용 0건이지만 엔진이 지원하는 유휴 타입 4종
+   (`mdefUp`/`mdefDown`/`maxSpDown`/`statDownPercent`) 선등록 — 나중에
+   이 타입을 쓰는 스킬이 추가되는 순간 자동으로 라벨이 붙게 미리 채움.
+5. `describePassiveFields()`에 `critMultiplier` 필드 지원 추가 — 실사용
+   0건이지만 `battle-adapter.js`가 이미 이 필드를 소비하도록 배선돼
+   있어서(학습한 패시브 스킬들의 `critMultiplier` 최댓값을 크리티컬
+   배율에 반영) 같은 이유로 선반영.
+
+**부수 발견(수정 안 함, 참고만)**: `CircleErase` 스킬의 `effects`가
+`skill-table.json`(빈 배열)과 `web/skill-table-editor.html`(실제
+`stealTeamResource` 효과 있음) 사이에 데이터 드리프트가 있음. 다만 둘 다
+이제 라이브 데이터가 아니라(라이브는 Supabase `game_content.skillTable`
+DB에만 있음) 죽은 참고용 사본이라 로컬 파일 수정으로 게임에 영향을 줄
+수 없고 DB 접근 권한도 없어서 손대지 않음.
+
+**"치유숙련" 관련 후속 논의(이번 수정 범위 밖, 다음 세션에서 별도 진행)**:
+재검증 도중 사용자가 "치유숙련"(healing mastery)이 회복량 관련 필드와
+구분되는지 질문 → 조사 결과 코드베이스에 딱 한 곳(`FullAssist` 스킬의
+`note`)에만 "미구현" 상태로 언급될 뿐, 실제 스탯/필드로는 존재하지 않음이
+확인됨. 유일하게 구현된 회복 배율은 `healingDealtPct`/`healingDealtFlat`
+뿐. 사용자는 "치유숙련"을 이 `healingDealtPct`로 치환하고, 앞으로도
+재사용 가능한 **범용 "버프 효과가 시전자 특정 passiveMod 값에 비례해
+커지고 상한도 계산되는" 엔진 메커니즘**을 신설하길 원함(FullAssist
+하나에 하드코딩하지 않음) — 다만 "분리해서 순서대로" 진행하기로 확정해
+이번 계획 범위에서는 제외하고 사실 관계만 기록해둠. 정확한 배율/상한
+공식은 다음 세션에서 사용자와 함께 확정 필요.
+
+**검증**: `demo-skill-card-effect-descriptions.js`에 시나리오 확장(섹션
+4~7 신설 — spDamage 상세, 강화된 폴백이 실제로 값을 보여주는지, 패시브
+필드 9개 칩, dexDamageDealtPct 한글 라벨 확인). ⚠ **이 세션 환경에
+Node.js가 설치돼 있지 않아 `node --check`/`node demo-*.js`/전체 회귀
+스위트를 직접 실행하지 못함** — 대신 전체 코드를 라인 단위로 재검토하고
+브레이스/괄호 균형을 기계적으로 대조해 구문 오류가 없음을 최대한
+확인했으나(코멘트 안의 한글 텍스트·번호 매김 문자열 때문에 나이브한
+괄호 카운트는 여러 차례 오탐이 있었고, 원인을 각각 추적해 전부 무해함을
+확인함), **사용자가 실제 환경에서 `node index.js` + 전체 `demo-*.js`
+회귀와 `node demo-skill-card-effect-descriptions.js`를 직접 실행해
+최종 확인 필요**.
+
 ## 개조된 장비가 상점 구매/전리품과 잘못 합쳐지던 버그 — 3곳에 동일 패턴 (2026-08-22)
 
 **증상(사용자 신고)**: "왕관 조각 개조가 된 모자를 하나 가지고 있었다.
diff --git a/demo-skill-card-effect-descriptions.js b/demo-skill-card-effect-descriptions.js
index 9a26554..d674588 100644
--- a/demo-skill-card-effect-descriptions.js
+++ b/demo-skill-card-effect-descriptions.js
@@ -68,12 +68,16 @@ const realEffects = [
   { type: "setRow", value: "back" },
   { type: "shield", charges: 2, shieldType: "physical" },
   { type: "spUp", value: 50 },
+  // spDamage — 2026-08-22 "27종 등록" 나열에서 통째로 빠졌던 타입(2026-08-24
+  // 전수 재검증으로 발견). Mana Break/Soul Break/EnergyRob/EnergyCollect/
+  // Soul Storm/Mana Burn/Banishment 7개 실사용 스킬이 이 타입을 씀.
+  { type: "spDamage", value: 15 },
   { type: "statUp", stat: "dex", value: 100 },
   { type: "statUpPercent", stat: "int", value: -40 },
   { type: "stealTeamResource", resource: "magicCircle", eraseAmount: 1, gainAmount: 1 },
   { type: "teamResourceGain", resource: "magicCircle", value: 1 },
 ];
-check(`실제 데이터에 쓰이는 26종을 전부 나열함(문서화된 27종 중 guard는 별도 검증)`, realEffects.length === 26);
+check(`실제 데이터에 쓰이는 27종을 전부 나열함(문서화된 27종 중 guard는 별도 검증)`, realEffects.length === 27);
 realEffects.forEach((e) => {
   const { text, polarity } = describeEffect(e);
   check(`${e.type}: 빈 문자열 아님("${text}", ${polarity})`, !!text && text.trim().length > 0);
@@ -106,15 +110,37 @@ console.log("==================================================");
 }
 
 console.log("\n==================================================");
-console.log("4) 알 수 없는 타입(EFFECT_TYPES에 없는 완전히 새로운 타입) — 폴백으로 존재를 알림, 빈 문자열 아님");
+console.log("4) spDamage 상세 — 값과 casterSpRestorePct(SP 흡수) 둘 다 텍스트에 반영되는지");
+console.log("==================================================");
+{
+  const noRestore = describeEffect({ type: "spDamage", value: 20 });
+  check(`값만 있을 때 "20%" 포함, 흡수 문구 없음: "${noRestore.text}"`, noRestore.text.includes("20%") && !noRestore.text.includes("흡수"));
+
+  const withRestore = describeEffect({ type: "spDamage", value: 15, casterSpRestorePct: 100 });
+  check(`casterSpRestorePct 있으면 "15%"와 "흡수" 둘 다 포함(EnergyRob/EnergyCollect 실데이터 형태): "${withRestore.text}"`,
+    withRestore.text.includes("15%") && withRestore.text.includes("흡수") && withRestore.text.includes("100%"));
+  check("spDamage는 항상 debuff", withRestore.polarity === "debuff");
+}
+
+console.log("\n==================================================");
+console.log("5) 알 수 없는 타입(EFFECT_TYPES에 없는 완전히 새로운 타입) — 폴백으로 존재+수치를 알림, 빈 문자열 아님");
 console.log("==================================================");
 {
   const r = describeEffect({ type: "totallyMadeUpEffectType", value: 1 });
   check(`폴백 텍스트가 비어있지 않고 타입명을 포함함: "${r.text}"`, !!r.text && r.text.includes("totallyMadeUpEffectType"));
+
+  // 2026-08-24 재발 방지 수정 검증 — spDamage가 실제로 걸렸던 구멍(값이
+  // 있어도 폴백이 그 값을 숨겼던 문제)이 다시 생기지 않는지 확인.
+  const rv = describeEffect({ type: "yetAnotherUnregisteredType", value: 42 });
+  check(`값(value)이 있으면 폴백 텍스트에도 그 값이 그대로 보임: "${rv.text}"`, rv.text.includes("42"));
+  const rs = describeEffect({ type: "yetAnotherUnregisteredType", stat: "luk", value: 7 });
+  check(`stat이 있으면 폴백 텍스트에도 그대로 보임: "${rs.text}"`, rs.text.includes("luk") && rs.text.includes("7"));
+  const rr = describeEffect({ type: "yetAnotherUnregisteredType", resource: "arrow" });
+  check(`resource가 있으면 폴백 텍스트에도 그대로 보임: "${rr.text}"`, rr.text.includes("arrow"));
 }
 
 console.log("\n==================================================");
-console.log("5) 패시브 전용 필드(effects 없이 statBonus 등으로만 존재하는 스킬) — 전부 칩으로 나옴");
+console.log("6) 패시브 전용 필드(effects 없이 statBonus 등으로만 존재하는 스킬) — 전부 칩으로 나옴");
 console.log("==================================================");
 {
   const passiveSkill = {
@@ -123,17 +149,32 @@ console.log("==================================================");
     maxSpBonus: 50,
     combatBonus: { def: 15 },
     patternSlotBonus: 1,
+    critMultiplier: 2,
     passiveMods: { accuracyBonusPct: 10, physicalDamageDealtPct: -5 },
     conditionalPassiveMods: [{ key: "physicalDamageDealtPct", value: 100, condition: { type: "isGuarding" } }],
   };
   const chips = describePassiveFields(passiveSkill);
-  check("statBonus/maxHpBonus/maxSpBonus/combatBonus/patternSlotBonus/passiveMods(2개)/conditionalPassiveMods 전부 합쳐 8개 칩", chips.length === 8);
+  check("statBonus/maxHpBonus/maxSpBonus/combatBonus/patternSlotBonus/critMultiplier/passiveMods(2개)/conditionalPassiveMods 전부 합쳐 9개 칩", chips.length === 9);
   check("conditionalPassiveMods의 조건 라벨이 정확히 표시됨(Guard 중일 때)", chips.some((c) => c.text.includes("Guard 중일 때")));
   check("음수 passiveMods는 debuff로 분류됨", chips.some((c) => c.polarity === "debuff"));
+  check("critMultiplier가 배율 칩으로 표시됨(×2)", chips.some((c) => c.text.includes("치명타 배율") && c.text.includes("×2")));
 
   const emptySkill = {};
   check("아무 패시브 필드도 없는 스킬은 빈 배열(회귀 없음)", describePassiveFields(emptySkill).length === 0);
 }
 
+console.log("\n==================================================");
+console.log("7) Job Master: Arcane Archer 실제 데이터(dexDamageDealtPct) — 한글 라벨로 표시되는지");
+console.log("==================================================");
+{
+  // 2026-08-24 재검증에서 발견: PASSIVE_MOD_LABELS에 dexDamageDealtPct가
+  // 없어서 원문 필드명이 그대로 "dexDamageDealtPct +8"로 노출되고 있었음.
+  // skill-table.json:3534-3538의 실제 데이터 그대로 재현.
+  const jobMaster = { passiveMods: { dexDamageDealtPct: 8 } };
+  const chips = describePassiveFields(jobMaster);
+  check(`원문 필드명("dexDamageDealtPct")이 그대로 노출되지 않음: "${chips[0].text}"`, !chips[0].text.startsWith("dexDamageDealtPct"));
+  check(`한글 라벨("DEX")과 값("+8")이 포함됨: "${chips[0].text}"`, chips[0].text.includes("DEX") && chips[0].text.includes("+8"));
+}
+
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail > 0 ? 1 : 0);
diff --git a/web/character-sheet.html b/web/character-sheet.html
index a5e007a..a3d5579 100644
--- a/web/character-sheet.html
+++ b/web/character-sheet.html
@@ -413,11 +413,27 @@ const EFFECT_TYPES = {
   atkDown:        { label:"공격력 감소", polarity:"debuff" },
   defUp:          { label:"방어력 증가", polarity:"buff" },
   defDown:        { label:"방어력 감소", polarity:"debuff" },
+  // mdefUp/mdefDown — defUp/defDown과 완전히 같은 성격(마법방어력 버전).
+  // 2026-08-24 전수 재검증 시점 실사용 0건이지만 엔진(skillResolution.js의
+  // case "mdefUp"/"mdefDown")은 이미 지원하는 유효 타입이라, 나중에 이 타입을
+  // 쓰는 스킬이 추가되는 순간 자동으로 라벨이 붙게 미리 등록해둠.
+  mdefUp:         { label:"마법방어력 증가", polarity:"buff" },
+  mdefDown:       { label:"마법방어력 감소", polarity:"debuff" },
   maxHpUp:        { label:"최대 HP 증가", polarity:"buff" },
   maxHpDown:      { label:"최대 HP 감소", polarity:"debuff" },
   heal:           { label:"HP 회복",     polarity:"buff" },
   spUp:           { label:"SP 증가",     polarity:"buff" },
   spDown:         { label:"SP 감소",     polarity:"debuff" },
+  // SP를 대상의 maxSp 대비 %만큼 직접 깎음(HP 데미지 파이프라인과 무관,
+  // 방어력/Guard/Shield 안 거침) — casterSpRestorePct(선택)가 있으면 깎인
+  // 만큼의 그 %를 시전자가 흡수(EnergyRob/EnergyCollect류 "SP 흡수").
+  // 2026-08-24 재검증에서 발견: EFFECT_TYPES/describeEffect 어디에도
+  // 등록이 없어서 실사용 스킬 7개(Mana Break/Soul Break/EnergyRob/
+  // EnergyCollect/Soul Storm/Mana Burn/Banishment)가 값도 흡수 정보도 없이
+  // "spDamage(설명 미등록)"만 뜨고 있었음 — 아래 describeEffect()에 case
+  // 신설로 실제 텍스트는 그쪽에서 조립하고, 여기 메타는 default 폴백을 위한
+  // 안전망으로만 유지.
+  spDamage:       { label:"SP 피해", polarity:"debuff", valueUnit:"%" },
   // STR/INT/DEX/SPD/LUK 중 하나의 bonus를 고정치만큼 올림 — effect.stat으로
   // 어떤 스탯인지 지정(예: { type:"statUp", stat:"str", value:20 }). 매 발동마다
   // 그대로 누적됨(statUpPercent처럼 "그 순간 값의 %"가 아니라 순수 고정치라
@@ -470,8 +486,15 @@ const EFFECT_TYPES = {
   // ============================================================================
   combatStatUpPercent: { label:"전투 스탯 변화", polarity:"buff" }, // 부호는 effectChips가 동적 판정
   statUpPercent:       { label:"핵심 스탯 변화", polarity:"buff" }, // 위와 동일
+  // statUpPercent와 같은 "그 순간 값 기준 %" 방식이지만 항상 감소 방향으로
+  // 고정된 별도 타입(엔진 case "statDownPercent") — statUpPercent가 음수
+  // value로도 디버프를 표현할 수 있어서 실제 스킬 데이터는 전부 그쪽만
+  // 쓰고 이 타입은 죽은 코드에 가깝다(2026-08-24 재검증 시점 실사용 0건).
+  // 그래도 엔진이 지원하는 유효 타입이라 재발 방지 차원에서 등록만 해둠.
+  statDownPercent:     { label:"핵심 스탯 변화", polarity:"debuff" },
   maxHpUpPercent:      { label:"최대 HP 변화",   polarity:"buff" },
   maxSpUp:             { label:"최대 SP 증가",   polarity:"buff" },
+  maxSpDown:           { label:"최대 SP 감소",   polarity:"debuff" }, // maxSpUp의 대칭(엔진은 이미 "maxSpUp"/"maxSpDown"을 같은 case로 처리)
   scaledHeal:          { label:"HP 회복(스탯 비례)", polarity:"buff" },
   healMissingPercent:  { label:"결손 HP 비례 회복", polarity:"buff" },
   applyTick:           { label:"지속 효과", polarity:"neutral" }, // 재생(buff)/출혈(debuff) 둘 다 있어 동적 판정
@@ -518,6 +541,13 @@ const PASSIVE_MOD_LABELS = {
   physicalDamageTakenPct: "받는 물리 피해(%)",
   magicDamageDealtPct: "가하는 마법 피해(%)",
   magicDamageTakenPct: "받는 마법 피해(%)",
+  // {stat}DamageDealtPct — combatFormulas.js의 applyDealtPassiveMods()가
+  // damageType(물리/마법) 구분과 별개로 "어떤 스탯 기반 스킬인지"로 추가
+  // 곱하는 배율(Job Master: Arcane Archer의 "DEX 기반 스킬 위력 증가+8%" 등).
+  // 2026-08-24 재검증에서 발견: dexDamageDealtPct만 라벨이 없어서
+  // "Job Master: Arcane Archer" 카드에 한글 라벨 없이 "dexDamageDealtPct
+  // +8"로 원문 필드명이 그대로 노출되고 있었음.
+  dexDamageDealtPct: "DEX 기반 피해량 증가(%)",
 };
 
 // 효과 하나를 사람이 읽을 텍스트로 변환 — src/skillResolution.js의 applyEffect()
@@ -609,6 +639,18 @@ function describeEffect(e) {
       const kindLabel = { hp: "HP", sp: "SP" };
       return { text: `${kindLabel[e.from] || e.from} ${e.fromPct ?? 0}% 소모 → ${kindLabel[e.to] || e.to} ${e.toPct ?? 0}% 충전`, polarity: "neutral" };
     }
+    // SP 직접 피해 — 대상의 "최대" SP 대비 %만큼 깎음(방어력/Guard/Shield 등
+    // HP 데미지 경감 체계를 전혀 안 거치는 별개 파이프라인,
+    // src/skillResolution.js의 case "spDamage" 참고). casterSpRestorePct(선택,
+    // EnergyRob/EnergyCollect류 "SP 흡수")가 있으면 깎인 SP의 그 %만큼을
+    // 시전자가 되돌려받는다는 사실도 같이 알림 — 2026-08-24: 이 case 자체가
+    // 없어서 실사용 스킬 7개(Mana Break/Soul Break/EnergyRob/EnergyCollect/
+    // Soul Storm/Mana Burn/Banishment)가 값도 흡수 정보도 없이 "spDamage(설명
+    // 미등록)"만 표시되고 있었음.
+    case "spDamage": {
+      const restoreText = e.casterSpRestorePct ? ` (시전자 SP ${e.casterSpRestorePct}% 흡수)` : "";
+      return { text: `SP 피해 ${e.value}%${restoreText}`, polarity: "debuff" };
+    }
     case "resurrect":
       return { text: `부활 (TP ${e.tpCost ?? 20} 소모, HP 50%로)`, polarity: "buff" };
     case "refillPersonalResource":
@@ -616,7 +658,22 @@ function describeEffect(e) {
     case "drainPersonalResource":
       return { text: `${resourceLabel} 완전 소진`, polarity: "debuff" };
     default: {
-      if (!meta) return { text: `${e.type}(설명 미등록)`, polarity: "neutral" };
+      // ⚠ 2026-08-24 재검증에서 발견한 구조적 결함 수정: 카탈로그(EFFECT_TYPES)에
+      // 없는 타입(!meta)이면 예전엔 e.value/e.stat/e.resource 등 원본 필드를
+      // 전혀 안 보고 "{type}(설명 미등록)"만 반환했음 — "타입의 존재는 알린다"는
+      // 원래 취지는 지켜졌지만 "수치까지는 여전히 숨겨진다"는 구멍이 있었고,
+      // spDamage가 실제로 여기 걸려서 값·부가정보 전부 안 보이는 사고가 났었음
+      // (지금은 위에 전용 case가 생겨서 spDamage는 더 이상 이 분기를 안 타지만,
+      // 같은 종류의 등록 누락이 또 재발해도 최소한 수치는 보이도록 안전망을
+      // 강화함). stat/resource/value 중 실제로 존재하는 필드만 이어붙임.
+      if (!meta) {
+        const knownParts = [
+          e.stat ? `stat=${e.stat}` : "",
+          e.resource ? `resource=${e.resource}` : "",
+          e.value !== undefined ? `value=${e.value}` : "",
+        ].filter(Boolean).join(", ");
+        return { text: `${e.type}(설명 미등록)${knownParts ? ` [${knownParts}]` : ""}`, polarity: "neutral" };
+      }
       const unit = meta.valueUnit || "";
       const valueLabel = e.value !== undefined ? ` ${e.value > 0 ? "+" : ""}${e.value}${unit}` : "";
       const resourcePart = resourceLabel ? `(${resourceLabel})` : "";
@@ -645,6 +702,13 @@ function describePassiveFields(s) {
     });
   }
   if (s.patternSlotBonus) chips.push({ text: `패턴 슬롯 +${s.patternSlotBonus}`, polarity: "buff" });
+  // 크리티컬 배율 — battle-adapter.js가 학습한 패시브 스킬들 중 이 필드의
+  // 최댓값을 character.critMultiplierBonus에 반영함(장비의 critMultiplier와
+  // 동일한 "여러 출처 중 가장 높은 것 하나" 규칙). 2026-08-24 재검증 시점
+  // 실사용 0건이지만 엔진이 이미 소비하도록 배선돼 있는 필드라, 나중에 이
+  // 필드를 쓰는 패시브 스킬이 추가되는 순간 조용히 안 보이는 사고를 미리
+  // 차단하는 선반영.
+  if (s.critMultiplier) chips.push({ text: `치명타 배율 ×${s.critMultiplier}`, polarity: "buff" });
   if (s.passiveMods) {
     Object.entries(s.passiveMods).forEach(([k, v]) => {
       const label = PASSIVE_MOD_LABELS[k] || k;
```
