# diff.md — "치유숙련" 미구현 해소: FullAssist + 범용 패시브비례 %버프 증폭 메커니즘 (2026-08-24)

이 파일은 Node.js가 설치 안 된 별도 작업 세션에서 진행한 수정 전체를
기록한 것 — 주 워크스페이스에서 이 파일 하나만 보고 병합 여부를 판단할
수 있게 하는 목적.

- **기준 브랜치**: `main`(커밋 `89eeb0c`, 브랜치 생성 시점 최신, 드리프트
  없이 그 위에 얹음)
- **작업 브랜치**: `fullassist-heal-mastery-2026-08-24`
- **변경 파일**: `CLAUDE.md`, `src/skillResolution.js`,
  `web/character-sheet.html`, `skill-table.json`,
  `web/skill-table-editor.html`,
  `supabase/migrations/0024_fullassist_heal_mastery_scaling.sql`(신규),
  `demo-scale-by-passive-mod.js`(신규)

## 배경 요약

`FullAssist`(하이드루이드) 스킬의 `note`에 "치유숙련에 비례하여 효과
증가, 초기 INT와 치유숙련에 비례하여 한계 증가"가 미구현으로 남아있던 것을
해소. "치유숙련"은 코드베이스에 이 note 한 곳에만 존재하던 개념이라
사용자 결정으로 이미 구현된 `healingDealtPct`(가하는 회복량%)로 치환.
FullAssist 하나에 하드코딩하지 않고 재사용 가능한 범용 엔진 메커니즘으로
설계(같은 부류의 "OO에 비례하여" 미구현 note가 6곳 더 있어서).

**공식(사용자가 직접 제시한 예시 수치로 확정, 곱셈)**: 최종% = base% ×
(1 + 시전자 `healingDealtPct`% / 100). 예: base 40%, `healingDealtPct`
30% → 40 × 1.3 = **52%**. 처음 덧셈으로 설계했다가 사용자가 "FullAssist의
스탯 증가는 퍼센티지가 아니라 포인트 아닌가. 40+치유숙련 30%면 52가
된다"고 정정해서 곱셈으로 확정됨.

**상한**: 새 캡 시스템 없음 — 기존 전역 캡(`calculateEffectiveStat`의
real×5=500%)에 그대로 위임(사용자 결정, 2026-08-15 확정 원칙과 일치).

자세한 배경/설계 근거는 `CLAUDE.md`의 새 항목("치유숙련" 미구현 해소 —
FullAssist + 범용 "패시브 비례 %버프 증폭" 메커니즘 신설)에 그대로 있음
(아래 diff의 `CLAUDE.md` 부분 참고 — 이번엔 CLAUDE.md diff 자체는 너무
길어서 이 diff.md엔 코드 파일만 포함, CLAUDE.md는 브랜치의 커밋을 직접
확인).

## 병합 전 체크리스트 (반드시 실행)

이 세션 환경에 Node.js가 없어서 아래를 직접 실행 못 했음 — 코드 리뷰와
브레이스 균형 대조, 손으로 한 인터프리터 트레이싱으로 구문/로직 오류는
없다고 판단했지만, **병합 전 반드시 실제로 돌려서 확인할 것**:

```bash
node demo-scale-by-passive-mod.js   # 새로 추가한 검증 7개 시나리오 전부 통과해야 함
node index.js
for f in demo-*.js; do node "$f" || echo "FAILED: $f"; done   # 전체 회귀, 특히 demo-percent-debuff-sign.js(같은 case문을 건드림)
```

**DB 반영도 별도로 필요**: `supabase/migrations/0024_fullassist_heal_mastery_scaling.sql`을
Supabase Dashboard SQL Editor에서 직접 실행해야 실제 게임(라이브
`game_content.skillTable`)에 반영됨 — 파일 편집만으로는 안 됨
(`skill-table-editor.html`은 2026-08-16부터 조회 전용 뷰어). 0023과
동일한 정밀 patch 패턴이라 멱등하게 재실행 가능.

## 병합 방법

```bash
git remote add review C:/Users/user/Downloads/Celestial-Pinnacles-review   # 경로는 실제 위치로 변경
git fetch review
git log review/fullassist-heal-mastery-2026-08-24 -p
git merge review/fullassist-heal-mastery-2026-08-24     # 위 체크리스트 통과 후 병합
```

(참고: 이 브랜치는 GitHub `origin`에도 push돼 있으므로, 로컬 경로 remote
대신 `git fetch origin` + `origin/fullassist-heal-mastery-2026-08-24`로도
동일하게 접근 가능.)

## 전체 diff (코드 파일만 — CLAUDE.md는 브랜치 커밋에서 직접 확인)

```diff
diff --git a/demo-scale-by-passive-mod.js b/demo-scale-by-passive-mod.js
new file mode 100644
index 0000000..863377f
--- /dev/null
+++ b/demo-scale-by-passive-mod.js
@@ -0,0 +1,187 @@
+// %버프 효과(statUpPercent/combatStatUpPercent/maxHpUpPercent)의 base
+// effect.value를 시전자의 특정 passiveMod 값에 비례해 곱셈으로 증폭하는
+// 범용 메커니즘(effect.scaleByPassiveMod + effect.scaleFactor) 검증.
+// 2026-08-24: FullAssist(하이드루이드) 스킬의 note에 "치유숙련에 비례하여
+// 효과 증가, 초기 INT와 치유숙련에 비례하여 한계 증가"가 미구현으로 남아
+// 있던 것을 해소 — "치유숙련"을 이미 구현된 healingDealtPct(가하는
+// 회복량%)로 치환하고, FullAssist 하나에 하드코딩하지 않고 재사용 가능한
+// 범용 엔진 메커니즘으로 만듦(grantPassiveMod의 scaleByStat+scaleFactor
+// 관례를 그대로 재사용).
+//
+// 공식(사용자가 직접 제시한 예시 수치로 확정, 곱셈): 최종% = base% ×
+// (1 + 시전자 healingDealtPct% / 100). 예: base 40, healingDealtPct 30
+// → 40 × 1.3 = 52.
+//
+// 상한: 별도 캡 시스템을 새로 안 만들고 기존 전역 캡
+// (src/character.js의 calculateEffectiveStat, real×5=500%)에 위임 —
+// 이 캡은 bonusStr 등에 값을 더하는 시점이 아니라 effectiveStr 같은
+// getter가 "읽는" 시점에 적용되므로, 아무리 큰 scaleByPassiveMod 값을
+// 넣어도 bonusStr 자체는 그대로 커지되 effectiveStr은 real×5를 못 넘는다
+// — 이 구분을 그대로 검증한다.
+const { BattleCharacter } = require("./src/character");
+const { SkillRegistry } = require("./src/skillRegistry");
+const { applyDamageAndEffects } = require("./src/skillResolution");
+
+function makeCtx(allies, enemies) {
+  return {
+    allies, enemies,
+    getOpponents(actor) { return actor.side === "ally" ? this.enemies : this.allies; },
+    log: (msg) => logs.push(msg),
+  };
+}
+let logs = [];
+
+let pass = 0, fail = 0;
+function check(label, ok) {
+  if (ok) { pass++; console.log(`  ✓ ${label}`); }
+  else { fail++; console.log(`  ✗ ${label}`); }
+}
+
+console.log("==================================================");
+console.log("1) scaleByPassiveMod 없는 기존 statUpPercent — 완전히 회귀 없음");
+console.log("==================================================");
+SkillRegistry.register({
+  name: "기존버프(스케일없음)", targetFaction: "ally", targetCount: "single",
+  skillType: "magic", stat: "int", coefficient: 0, costs: [],
+  preDelay: 0, preDelayType: "action", postDelay: 0,
+  effects: [{ type: "statUpPercent", stat: "str", value: 40 }],
+});
+{
+  logs = [];
+  const caster = new BattleCharacter("시전자", "ally", { int: 10 });
+  caster.passiveMods.healingDealtPct = 999; // 스케일 필드가 없으므로 무관해야 함
+  const ally = new BattleCharacter("전사", "ally", { str: 100 });
+  applyDamageAndEffects(caster, SkillRegistry.get("기존버프(스케일없음)"), makeCtx([ally], []));
+  const joined = logs.join(" ");
+  check("정확히 기존과 동일한 40% 증가(시전자 healingDealtPct와 무관)", ally.bonusStr === Math.floor(100 * 0.40));
+  check(`로그에 "+40%"로 그대로 표시(스케일 언급 없음)`, joined.includes("STR +40%"));
+}
+
+console.log("\n==================================================");
+console.log("2) FullAssist형 버프, healingDealtPct=0 — 기존과 동일한 40%(변경 없음 재확인)");
+console.log("==================================================");
+SkillRegistry.register({
+  name: "FullAssist형", targetFaction: "ally", targetCount: "all",
+  skillType: "magic", stat: "int", coefficient: 0, costs: [],
+  preDelay: 0, preDelayType: "action", postDelay: 0,
+  effects: [
+    { type: "statUpPercent", stat: "str", value: 40, scaleByPassiveMod: "healingDealtPct", scaleFactor: 1 },
+  ],
+});
+{
+  logs = [];
+  const caster = new BattleCharacter("하이드루이드", "ally", { int: 10 }); // passiveMods.healingDealtPct 미설정 -> 0
+  const ally = new BattleCharacter("전사", "ally", { str: 100 });
+  applyDamageAndEffects(caster, SkillRegistry.get("FullAssist형"), makeCtx([ally], []));
+  const joined = logs.join(" ");
+  check("healingDealtPct=0이면 정확히 기존과 동일한 40% 증가", ally.bonusStr === Math.floor(100 * 0.40));
+  check(`로그도 "+40%"로 표시(스케일 배율 0이라 원래 값 그대로)`, joined.includes("STR +40%"));
+}
+
+console.log("\n==================================================");
+console.log("3) FullAssist형, healingDealtPct=30 — 40×1.3=52%로 정확히 스케일");
+console.log("==================================================");
+{
+  logs = [];
+  const caster = new BattleCharacter("하이드루이드", "ally", { int: 10 });
+  caster.passiveMods.healingDealtPct = 30;
+  const ally = new BattleCharacter("전사", "ally", { str: 100 });
+  applyDamageAndEffects(caster, SkillRegistry.get("FullAssist형"), makeCtx([ally], []));
+  const joined = logs.join(" ");
+  check("bonusStr이 정확히 currentEffective(100)×0.52의 floor값", ally.bonusStr === Math.floor(100 * 0.52));
+  check(`로그에 스케일된 "+52%"가 정확히 표시됨(base 40이 아님): "${joined}"`, joined.includes("STR +52%"));
+  check(`base 값(40%)은 더 이상 안 뜸`, !joined.includes("+40%"));
+}
+
+console.log("\n==================================================");
+console.log("4) 극단적으로 큰 healingDealtPct — bonusStr은 커지지만 effectiveStr은 전역 캡(real×5)을 못 넘음");
+console.log("==================================================");
+{
+  logs = [];
+  const caster = new BattleCharacter("하이드루이드", "ally", { int: 10 });
+  caster.passiveMods.healingDealtPct = 5000; // 극단값 — 새 캡 로직이 없다는 것 자체를 확인하는 용도
+  const ally = new BattleCharacter("전사", "ally", { str: 100 });
+  applyDamageAndEffects(caster, SkillRegistry.get("FullAssist형"), makeCtx([ally], []));
+  check("bonusStr 자체는 매우 크게 누적됨(쓰기 시점엔 캡이 안 걸림)", ally.bonusStr > ally.realStr * 5);
+  check("effectiveStr(읽기 시점)은 real×5(=500) 상한을 절대 못 넘음(새 캡 로직 없이 기존 전역 캡만 적용됨)", ally.effectiveStr <= ally.realStr * 5);
+  check("effectiveStr이 정확히 상한값(500)에 클램프됨", ally.effectiveStr === ally.realStr * 5);
+}
+
+console.log("\n==================================================");
+console.log("5) combatStatUpPercent에도 동일 메커니즘 적용됨(범용성 확인)");
+console.log("==================================================");
+SkillRegistry.register({
+  name: "전투버프형", targetFaction: "ally", targetCount: "single",
+  skillType: "magic", stat: "int", coefficient: 0, costs: [],
+  preDelay: 0, preDelayType: "action", postDelay: 0,
+  effects: [{ type: "combatStatUpPercent", stat: "atk", value: 20, scaleByPassiveMod: "healingDealtPct", scaleFactor: 1 }],
+});
+{
+  logs = [];
+  const caster = new BattleCharacter("시전자", "ally", { int: 10 });
+  caster.passiveMods.healingDealtPct = 50; // 20 × 1.5 = 30
+  const ally = new BattleCharacter("전사", "ally", { str: 10 });
+  ally.realAtk = 100;
+  applyDamageAndEffects(caster, SkillRegistry.get("전투버프형"), makeCtx([ally], []));
+  const joined = logs.join(" ");
+  check("bonusAtk가 정확히 100×0.30의 floor값(20×1.5=30% 스케일)", ally.bonusAtk === Math.floor(100 * 0.30));
+  check(`로그에 "+30%"로 정확히 표시`, joined.includes("공격력 +30%"));
+}
+
+console.log("\n==================================================");
+console.log("6) maxHpUpPercent에도 동일 메커니즘 적용됨(범용성 확인)");
+console.log("==================================================");
+SkillRegistry.register({
+  name: "체력버프형", targetFaction: "ally", targetCount: "single",
+  skillType: "magic", stat: "int", coefficient: 0, costs: [],
+  preDelay: 0, preDelayType: "action", postDelay: 0,
+  effects: [{ type: "maxHpUpPercent", value: 10, scaleByPassiveMod: "healingDealtPct", scaleFactor: 2 }],
+});
+{
+  logs = [];
+  const caster = new BattleCharacter("시전자", "ally", { int: 10 });
+  caster.passiveMods.healingDealtPct = 10; // scaleFactor 2 -> scalePct=20 -> 10×1.2=12%
+  const ally = new BattleCharacter("전사", "ally", { str: 50 }); // maxHp = 200 + 50*20 = 1200
+  const beforeMaxHp = ally.maxHp;
+  applyDamageAndEffects(caster, SkillRegistry.get("체력버프형"), makeCtx([ally], []));
+  const expectedDelta = Math.floor(beforeMaxHp * 0.12);
+  check("scaleFactor(2)까지 반영되어 10×(1+10×2/100)=12%로 정확히 스케일", ally.maxHpBonus === expectedDelta);
+}
+
+console.log("\n==================================================");
+console.log("7) Sheet 표시(web/character-sheet.html의 describeEffect) — scaleByPassiveMod 있으면 '비례' 접미사, 없으면 회귀 없음");
+console.log("==================================================");
+{
+  const vm = require("vm");
+  const fs = require("fs");
+  const path = require("path");
+  const lines = fs.readFileSync(path.join(__dirname, "web/character-sheet.html"), "utf8").split("\n");
+  const startIdx = lines.findIndex((l) => l.startsWith("const TEAM_RESOURCE_TYPES = {"));
+  const fnStartIdx = lines.findIndex((l) => l.startsWith("function describePassiveFields(s) {"));
+  let depth = 0, endIdx = -1;
+  for (let i = fnStartIdx; i < lines.length; i++) {
+    for (const ch of lines[i]) {
+      if (ch === "{") depth++;
+      else if (ch === "}") { depth--; if (depth === 0) { endIdx = i; break; } }
+    }
+    if (endIdx !== -1) break;
+  }
+  const chunk = lines.slice(startIdx, endIdx + 1).join("\n");
+  const sandbox = {};
+  vm.createContext(sandbox);
+  vm.runInContext(chunk, sandbox);
+  const { describeEffect } = sandbox;
+
+  const withScale = describeEffect({ type: "statUpPercent", stat: "str", value: 40, scaleByPassiveMod: "healingDealtPct", scaleFactor: 1 });
+  check(`scaleByPassiveMod 있으면 "비례" 접미사 표시: "${withScale.text}"`, withScale.text.includes("비례"));
+  check(`한글 라벨("가하는 회복량")로 표시(원문 키 그대로 아님): "${withScale.text}"`, withScale.text.includes("가하는 회복량"));
+
+  const withoutScale = describeEffect({ type: "statUpPercent", stat: "str", value: 40 });
+  check(`scaleByPassiveMod 없으면 기존과 동일하게 접미사 없음(회귀 없음): "${withoutScale.text}"`, !withoutScale.text.includes("비례") && withoutScale.text === "STR +40%");
+
+  const maxHpWithScale = describeEffect({ type: "maxHpUpPercent", value: 10, scaleByPassiveMod: "healingDealtPct", scaleFactor: 2 });
+  check(`maxHpUpPercent도 동일하게 접미사 표시: "${maxHpWithScale.text}"`, maxHpWithScale.text.includes("비례"));
+}
+
+console.log(`\n${pass} passed, ${fail} failed`);
+process.exit(fail > 0 ? 1 : 0);
diff --git a/skill-table.json b/skill-table.json
index 1d85952..f423c28 100644
--- a/skill-table.json
+++ b/skill-table.json
@@ -3032,22 +3032,30 @@
           {
             "type": "statUpPercent",
             "stat": "str",
-            "value": 40
+            "value": 40,
+            "scaleByPassiveMod": "healingDealtPct",
+            "scaleFactor": 1
           },
           {
             "type": "statUpPercent",
             "stat": "int",
-            "value": 40
+            "value": 40,
+            "scaleByPassiveMod": "healingDealtPct",
+            "scaleFactor": 1
           },
           {
             "type": "statUpPercent",
             "stat": "dex",
-            "value": 40
+            "value": 40,
+            "scaleByPassiveMod": "healingDealtPct",
+            "scaleFactor": 1
           },
           {
             "type": "statUpPercent",
             "stat": "spd",
-            "value": 40
+            "value": 40,
+            "scaleByPassiveMod": "healingDealtPct",
+            "scaleFactor": 1
           }
         ],
         "requiredSkills": [
@@ -3056,7 +3064,7 @@
           "Speed Assist"
         ],
         "requiredSkillMode": "all",
-        "note": "'치유숙련에 비례하여 효과 증가, 초기 INT와 치유숙련에 비례하여 한계 증가'는 미구현(스탯 기반 버프 배율 스케일링 + 상한 시스템 필요) - 고정 40%만 반영"
+        "note": "'치유숙련에 비례하여 효과 증가'는 healingDealtPct(가하는 회복량%)로 치환해 구현함(2026-08-24) — 최종% = base 40% × (1 + 시전자 healingDealtPct% / 100), 예: healingDealtPct 30%면 40×1.3=52%. '초기 INT와 치유숙련에 비례하여 한계 증가'는 별도 캡을 새로 만들지 않고 기존 전역 캡(calculateEffectiveStat의 real×5=500%)에 그대로 위임함(2026-08-15 확정된 전역 캡 통일 원칙과 일치, 사용자 결정)."
       }
     ],
     "스나이퍼": [
diff --git a/src/skillResolution.js b/src/skillResolution.js
index 057b773..fc71ae7 100644
--- a/src/skillResolution.js
+++ b/src/skillResolution.js
@@ -243,6 +243,45 @@ function describeStatCap(target, capKey, statLabel, isIncrease, normalDesc) {
   return normalDesc;
 }
 
+// ============================================================================
+// %버프 효과(statUpPercent/combatStatUpPercent/maxHpUpPercent)의 base
+// effect.value를, 시전자의 특정 passiveMod 값에 비례해 곱셈으로 증폭하는
+// 범용 메커니즘(2026-08-24, "치유숙련" 미구현 note 해소 — FullAssist가
+// 최초 사용처). effect.scaleByPassiveMod(passiveMod 키 문자열)가 있으면
+// 시전자의 그 값(caster.getPassiveModValue)을 effect.scaleFactor(기본 1)
+// 만큼 곱한 뒤, "base × (1 + scalePct/100)"로 base % 자체를 증폭시킨다.
+// 예: base 40, 시전자 healingDealtPct 30 → 40 × (1+30/100) = 52.
+//
+// grantPassiveMod 케이스의 scaleByStat(문자열)+scaleFactor(숫자) 조합과
+// 정확히 같은 명명 관례를 따름(scaleFactor 필드명도 그대로 재사용) — 다만
+// grantPassiveMod는 "이펙트 스탯"에 비례해 고정값을 만드는 것이고, 이건
+// "시전자 passiveMod"에 비례해 %버프 자체의 배율을 증폭시키는 것이라
+// 별도 필드명(scaleByPassiveMod)으로 구분함.
+//
+// 발동 시점 caster.getPassiveModValue() 1회만 조회하는 스냅샷 방식 —
+// 이 게임의 %버프 자체가 이미 "발동 시점 1회 계산 후 전투 끝까지 고정"
+// 방식이라(각 case의 currentEffective × value/100 계산 참고) 스냅샷이
+// 자연스럽게 일치함. 새 상한(cap) 로직은 두지 않음 — 최종 증가량은
+// 기존과 동일하게 character.js의 calculateEffectiveStat(real×5=500%)
+// 전역 캡에 그대로 걸림(2026-08-15 확정된 "모든 스탯 보너스는 하나의
+// 전역 공식으로 통일" 원칙과 일치, 별도 미검증 캡 공식을 새로 안 만듦).
+//
+// effect.scaleByPassiveMod가 없는 기존 스킬은 이 함수가 effect.value를
+// 그대로 반환하므로 완전히 회귀 없음.
+//
+// ⚠ Math.round로 정수 %로 반올림함 — 이 게임의 모든 %효과 데이터는 항상
+// 정수(스킬 데이터 전수 조사로 확인)인데, 곱셈 부동소수점 연산(예: 40 ×
+// 1.3)은 이진 부동소수점 특성상 52가 아니라 52.00000000000001 같은 값이
+// 나올 수 있다 — 반올림 없이 그대로 로그 문자열에 넣으면
+// "STR +52.00000000000001%." 같은 깨진 표시가 될 위험이 있어서, 최종
+// 사용자 대면 수치는 여기서 한 번에 정수로 정리한다.
+// ============================================================================
+function resolveScaledPercentValue(caster, effect) {
+  if (!effect.scaleByPassiveMod) return effect.value;
+  const scalePct = caster.getPassiveModValue(effect.scaleByPassiveMod) * (effect.scaleFactor ?? 1);
+  return Math.round(effect.value * (1 + scalePct / 100));
+}
+
 function applyEffect(caster, target, effect, ctx) {
   // sideCondition — "same"이면 시전자와 같은 진영일 때만, "different"면 다른
   // 진영일 때만 이 효과가 적용됨(Purify류 "적에게는 피해, 아군에게는 회복"을
@@ -286,7 +325,8 @@ function applyEffect(caster, target, effect, ctx) {
     // maxHpUp(고정치)과 달리, 그 순간 maxHp의 %만큼 증감(OverLimit의
     // "MaxHP-20%"류). value가 음수면 감소.
     case "maxHpUpPercent": {
-      const delta = Math.floor(target.maxHp * (effect.value / 100));
+      const scaledValue = resolveScaledPercentValue(caster, effect);
+      const delta = Math.floor(target.maxHp * (scaledValue / 100));
       target.maxHpBonus = (target.maxHpBonus || 0) + delta;
       target.currentHp = Math.min(target.currentHp, target.maxHp);
       return `${target.name}의 Max HP ${delta >= 0 ? "+" : ""}${delta}.`;
@@ -464,7 +504,11 @@ function applyEffect(caster, target, effect, ctx) {
       const statKey = effect.stat;
       const capKey = statKey.charAt(0).toUpperCase() + statKey.slice(1);
       const currentEffective = target[`effective${capKey}`];
-      const increase = Math.floor(currentEffective * (effect.value / 100));
+      // scaleByPassiveMod(2026-08-24)가 있으면 base %를 시전자의 passiveMod
+      // 값에 비례해 곱셈 증폭 — 없으면 resolveScaledPercentValue가
+      // effect.value를 그대로 반환해 기존과 동일(회귀 없음).
+      const scaledValue = resolveScaledPercentValue(caster, effect);
+      const increase = Math.floor(currentEffective * (scaledValue / 100));
       target[`bonus${capKey}`] += increase;
       const label = { atk: "공격력", matk: "마법공격력", def: "방어력", mdef: "마법방어력" }[statKey] || statKey.toUpperCase();
       // 고정치(atkUp 등)와 달리 "그 순간 값의 %"라 실제 증가량이 매번 다름 —
@@ -475,10 +519,12 @@ function applyEffect(caster, target, effect, ctx) {
       // 부호에 따라 "+" 유무와 캡 판정 방향(증가 상한/감소 하한)을 갈라야
       // 함. 2026-08-21 수정 전에는 항상 "+"를 붙이고 항상 증가 캡으로만
       // 판정해서, 디버프인데 "+-30%"로 표시되고 캡 메시지도 "더 이상
-      // 증가할 수 없다"로 거꾸로 나왔음(실전투 로그로 발견).
-      const sign = effect.value >= 0 ? "+" : "";
-      const normal = `${target.name}의 ${label} ${sign}${effect.value}%.`;
-      return describeStatCap(target, capKey, label, effect.value >= 0, normal);
+      // 증가할 수 없다"로 거꾸로 나왔음(실전투 로그로 발견). 부호/캡 판정도
+      // scaledValue 기준으로 통일(증폭 후 부호가 뒤집힐 극단적 음수
+      // scaleByPassiveMod 케이스까지 대비 — 지금 데이터엔 없음).
+      const sign = scaledValue >= 0 ? "+" : "";
+      const normal = `${target.name}의 ${label} ${sign}${scaledValue}%.`;
+      return describeStatCap(target, capKey, label, scaledValue >= 0, normal);
     }
 
     // STR/INT/DEX/SPD/LUK 중 하나를 그 순간 effective 값의 %만큼 올림 —
@@ -491,14 +537,18 @@ function applyEffect(caster, target, effect, ctx) {
       const statKey = effect.stat;
       const capKey = statKey.charAt(0).toUpperCase() + statKey.slice(1);
       const currentEffective = target[`effective${capKey}`];
-      const increase = Math.floor(currentEffective * (effect.value / 100));
+      // scaleByPassiveMod(2026-08-24, FullAssist 최초 사용) — 시전자의
+      // healingDealtPct 등 passiveMod 값에 비례해 base %를 곱셈 증폭.
+      // 없으면 기존과 동일(resolveScaledPercentValue가 effect.value 그대로 반환).
+      const scaledValue = resolveScaledPercentValue(caster, effect);
+      const increase = Math.floor(currentEffective * (scaledValue / 100));
       target[`bonus${capKey}`] += increase;
       // combatStatUpPercent와 동일한 이유로 부호에 따라 "+"·캡 판정 방향을
       // 가름(음수 = MindBreak/Exorcism 등 디버프 — statDownPercent 타입은
-      // 데이터상 안 쓰임). 2026-08-21 수정.
-      const sign = effect.value >= 0 ? "+" : "";
-      const normal = `${target.name}의 ${statKey.toUpperCase()} ${sign}${effect.value}%.`;
-      return describeStatCap(target, capKey, statKey.toUpperCase(), effect.value >= 0, normal);
+      // 데이터상 안 쓰임). 2026-08-21 수정. 부호/캡 판정도 scaledValue 기준.
+      const sign = scaledValue >= 0 ? "+" : "";
+      const normal = `${target.name}의 ${statKey.toUpperCase()} ${sign}${scaledValue}%.`;
+      return describeStatCap(target, capKey, statKey.toUpperCase(), scaledValue >= 0, normal);
     }
 
     // value(%)만큼 대상의 현재 effective 스탯을 깎음(고정치가 아니라 그 순간의
diff --git a/supabase/migrations/0024_fullassist_heal_mastery_scaling.sql b/supabase/migrations/0024_fullassist_heal_mastery_scaling.sql
new file mode 100644
index 0000000..7777712
--- /dev/null
+++ b/supabase/migrations/0024_fullassist_heal_mastery_scaling.sql
@@ -0,0 +1,67 @@
+-- ============================================================================
+-- game_content(skillTable) 갱신 — FullAssist(하이드루이드)의 "치유숙련에
+-- 비례하여 효과 증가" 미구현 부분을 healingDealtPct(가하는 회복량%)로
+-- 치환해 구현.
+--
+-- 배경: FullAssist의 note에 "'치유숙련에 비례하여 효과 증가, 초기 INT와
+-- 치유숙련에 비례하여 한계 증가'는 미구현(스탯 기반 버프 배율 스케일링 +
+-- 상한 시스템 필요) - 고정 40%만 반영"이라고 적혀 있었음. "치유숙련"은
+-- 이 note 한 곳에만 등장할 뿐 실제 스탯/필드로 존재한 적이 없었음 —
+-- 사용자 결정으로 이미 구현된 healingDealtPct로 치환.
+--
+-- 공식(곱셈, 사용자가 직접 제시한 예시 수치로 확정): 최종% = base 40% ×
+-- (1 + 시전자 healingDealtPct% / 100). 예: healingDealtPct 30% →
+-- 40 × 1.3 = 52%. "초기 INT와 치유숙련에 비례하여 한계 증가"는 별도 캡을
+-- 새로 만들지 않고 기존 전역 캡(src/character.js의
+-- calculateEffectiveStat, real×5=500%)에 그대로 위임함 — 2026-08-15에
+-- 이미 확정된 "모든 스탯 보너스는 하나의 전역 공식으로 통일한다"는 설계
+-- 원칙과 일치시키기 위함, 새 미검증 캡 공식은 만들지 않음.
+--
+-- 엔진 측: src/skillResolution.js에 범용 메커니즘 resolveScaledPercentValue()
+-- 신설 — effect.scaleByPassiveMod(passiveMod 키 문자열) + effect.scaleFactor
+-- (숫자, 기본 1)가 있으면 시전자의 그 값을 곱셈으로 반영해 base %를
+-- 증폭시킴(grantPassiveMod의 scaleByStat+scaleFactor 관례를 그대로 재사용).
+-- FullAssist 하나에 하드코딩하지 않고 statUpPercent/combatStatUpPercent/
+-- maxHpUpPercent 세 이펙트 타입 모두에 적용되는 범용 메커니즘이라, 나중에
+-- 다른 스킬(skill-table.json에 "OO에 비례하여" 미구현 note가 6곳 더 있음)
+-- 구현 시에도 재사용 가능.
+--
+-- 0023_fix_vortex_overload_self_drain.sql과 동일한 방식으로, 전체
+-- skillTable JSON을 통째로 교체하지 않고 jobSkills.하이드루이드 배열에서
+-- 이름이 "FullAssist"인 항목만 찾아 그 effects 중 type이 statUpPercent인
+-- 4개 항목(str/int/dex/spd) 각각에 scaleByPassiveMod/scaleFactor만
+-- 병합(jsonb ||)함 — 이후 있었을 수 있는 다른 라이브 데이터 변경분을
+-- 건드리지 않기 위해 이 경로 하나만 정밀 수정. 이미 필드가 있는 상태에서
+-- 다시 실행해도 같은 값을 덮어쓸 뿐이라 안전하게 재실행 가능(멱등).
+-- ============================================================================
+
+update public.game_content
+set
+  data = jsonb_set(
+    data,
+    '{jobSkills,하이드루이드}',
+    (
+      select coalesce(jsonb_agg(
+        case when skill->>'name' = 'FullAssist'
+          then jsonb_set(
+            skill,
+            '{effects}',
+            (
+              select jsonb_agg(
+                case when eff->>'type' = 'statUpPercent'
+                  then eff || jsonb_build_object('scaleByPassiveMod', 'healingDealtPct', 'scaleFactor', 1)
+                  else eff
+                end
+              )
+              from jsonb_array_elements(skill->'effects') eff
+            )
+          )
+          else skill
+        end
+      ), '[]'::jsonb)
+      from jsonb_array_elements(data->'jobSkills'->'하이드루이드') skill
+    ),
+    false
+  ),
+  version = '2026-08-24a'
+where key = 'skillTable';
diff --git a/web/character-sheet.html b/web/character-sheet.html
index a5e007a..fe298a8 100644
--- a/web/character-sheet.html
+++ b/web/character-sheet.html
@@ -542,11 +542,23 @@ function describeEffect(e) {
     case "combatStatUpPercent":
     case "statUpPercent": {
       const sign = e.value >= 0 ? "+" : "";
-      return { text: `${stat} ${sign}${e.value}%`, polarity: e.value >= 0 ? "buff" : "debuff" };
+      // scaleByPassiveMod(2026-08-24, FullAssist 등) — 시전자의 특정
+      // passiveMod 값(예: healingDealtPct)에 비례해 이 base %가 발동 시점에
+      // 곱셈으로 증폭됨(src/skillResolution.js의 resolveScaledPercentValue
+      // 참고: base×(1+scalePct/100)). 카드는 시전자의 실시간 스탯을 몰라서
+      // 실제 스케일된 값은 계산 안 하고, base %에 "비례 증폭" 주석만 붙임
+      // — grantPassiveMod 케이스의 scaleByStat 표시 방식과 동일한 원칙.
+      const scaleSuffix = e.scaleByPassiveMod
+        ? ` (${PASSIVE_MOD_LABELS[e.scaleByPassiveMod] || e.scaleByPassiveMod} 비례)`
+        : "";
+      return { text: `${stat} ${sign}${e.value}%${scaleSuffix}`, polarity: e.value >= 0 ? "buff" : "debuff" };
     }
     case "maxHpUpPercent": {
       const sign = e.value >= 0 ? "+" : "";
-      return { text: `최대 HP ${sign}${e.value}%`, polarity: e.value >= 0 ? "buff" : "debuff" };
+      const scaleSuffix = e.scaleByPassiveMod
+        ? ` (${PASSIVE_MOD_LABELS[e.scaleByPassiveMod] || e.scaleByPassiveMod} 비례)`
+        : "";
+      return { text: `최대 HP ${sign}${e.value}%${scaleSuffix}`, polarity: e.value >= 0 ? "buff" : "debuff" };
     }
     case "maxSpUp": {
       const sign = e.value >= 0 ? "+" : "";
diff --git a/web/skill-table-editor.html b/web/skill-table-editor.html
index b2287f2..abd2794 100644
--- a/web/skill-table-editor.html
+++ b/web/skill-table-editor.html
@@ -3157,22 +3157,30 @@
           {
             "type": "statUpPercent",
             "stat": "str",
-            "value": 40
+            "value": 40,
+            "scaleByPassiveMod": "healingDealtPct",
+            "scaleFactor": 1
           },
           {
             "type": "statUpPercent",
             "stat": "int",
-            "value": 40
+            "value": 40,
+            "scaleByPassiveMod": "healingDealtPct",
+            "scaleFactor": 1
           },
           {
             "type": "statUpPercent",
             "stat": "dex",
-            "value": 40
+            "value": 40,
+            "scaleByPassiveMod": "healingDealtPct",
+            "scaleFactor": 1
           },
           {
             "type": "statUpPercent",
             "stat": "spd",
-            "value": 40
+            "value": 40,
+            "scaleByPassiveMod": "healingDealtPct",
+            "scaleFactor": 1
           }
         ],
         "requiredSkills": [
@@ -3181,7 +3189,7 @@
           "Speed Assist"
         ],
         "requiredSkillMode": "all",
-        "note": "'치유숙련에 비례하여 효과 증가, 초기 INT와 치유숙련에 비례하여 한계 증가'는 미구현(스탯 기반 버프 배율 스케일링 + 상한 시스템 필요) - 고정 40%만 반영"
+        "note": "'치유숙련에 비례하여 효과 증가'는 healingDealtPct(가하는 회복량%)로 치환해 구현함(2026-08-24) — 최종% = base 40% × (1 + 시전자 healingDealtPct% / 100), 예: healingDealtPct 30%면 40×1.3=52%. '초기 INT와 치유숙련에 비례하여 한계 증가'는 별도 캡을 새로 만들지 않고 기존 전역 캡(calculateEffectiveStat의 real×5=500%)에 그대로 위임함(2026-08-15 확정된 전역 캡 통일 원칙과 일치, 사용자 결정)."
       }
     ],
     "스나이퍼": [
```
