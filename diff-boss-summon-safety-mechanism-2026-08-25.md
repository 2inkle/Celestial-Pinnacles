# diff-boss-summon-safety-mechanism-2026-08-25.md — 동굴 5층 보스 재설계 (2026-08-25)

⚠ 새 명명 규칙 실천(브랜치 고유 파일명). 병합 검토 끝나면
`git rm diff-boss-summon-safety-mechanism-2026-08-25.md`로 제거 권장.

- **기준 브랜치**: `main`(커밋 `678b90c`, 드리프트 없음)
- **작업 브랜치**: `boss-summon-safety-mechanism-2026-08-25`(1개 커밋)
- **변경 파일**: `CLAUDE.md`(설계 기록), `src/registries.js`(실제 코드
  — 신규 조건 2개), `web/battle-adapter.js`(실제 코드 — 조건 번역 분기
  2개 + `guardAllies` 몬스터 와이어링 누락분 보완)

## 배경 요약

동굴 5층 보스 컨셉을 재검토 — 애초 "H(전체공격+잦은 자기강화)의
증폭판"으로 설계했었는데, 같은 유형의 위협이 두 번 겹쳐 곱연산으로
어려워진다는 문제가 지적됨. 보스를 "단순하지만 강력한 단일강타" 정체성
으로 재정의하고, 부가로 "H가 죽어서 보스 혼자 남으면 33% 확률로 H를
재소환"하는 안전장치를 추가하기로 함 — 보스의 큰 한 방을 유예시켜주는
완충 장치이자, H만 집중 공략해서 전체공격 위협을 영구히 없애버리는
퇴화 전략을 막는 역할.

**코드 조사 결과, 필요한 대부분이 이미 있었음**:
- 소환(`SUMMON` 액션, `performSummon`)은 고블린 마차가 이미 씀 — 코드
  변경 없이 보스의 `summonAbility`에 H 하나만 넣으면 그대로 재사용됨.
- 전열 보호(`guardAllies`) 타겟팅 로직 자체도 진영 무관하게 이미 구현돼
  있음. 다만 몬스터 빌드 경로가 이 필드를 옮겨 심지 않던 **진짜 갭**을
  발견해서 보완함(아래 diff의 `battle-adapter.js` 512행대).
- "혼자뿐" 헤드카운트 판정과 "N% 확률" 판정만 기존 `ConditionRegistry`에
  전혀 없어서(15종 전수 확인 — 전부 결정론적) 신규 등록. 둘 다 범용
  leaf 조건이고, 결합은 이미 있는 `AND`/`andNext` 체이닝을 그대로 재사용
  (새 조합 로직 없음).

전체 배경/근거는 `CLAUDE.md`의 새 섹션 "동굴 5층 보스 재설계 확정 —
'단순하지만 강력한 단일강타' + H 소환 안전장치"에 그대로 있음(아래 diff
참고).

## 병합 전 체크리스트

**이번엔 실제 `.js` 코드 변경이 있음** — 이 샌드박스엔 Node가 없어
직접 실행 검증을 못 했음. 병합 전 반드시:
1. `node --check src/registries.js`
2. `node --check web/battle-adapter.js`
3. (가능하면) 임시 몬스터 정의로 `patterns: [{subject:"self",
   metric:"teamAlone", andNext:true}, {subject:"self",
   metric:"randomChancePct", value:33, action:"SUMMON"}]`를 만들어
   `translatePatternSlots`가 예상대로 `AND(TEAMMATES_ALIVE_LTE=0,
   RANDOM_CHANCE_PCT=33) -> SUMMON`으로 번역되는지, 그리고
   `ConditionRegistry.check`가 정상 동작하는지 간단히 확인.

실제 보스 데이터(`web/monster-roster.html`)는 이번 브랜치에 없음 —
다음 세션(동굴 몬스터 전체 수치 확정)에서 이 신규 조건들을 실제로 쓰는
보스 항목을 작성할 때 함께 실전 검증하면 됨.

## 병합 방법

```bash
git fetch origin
git show origin/boss-summon-safety-mechanism-2026-08-25:CLAUDE.md | head -100   # 새 섹션 확인
node --check src/registries.js   # 병합 전에도, 브랜치 체크아웃해서 먼저 확인 가능
node --check web/battle-adapter.js
git merge origin/boss-summon-safety-mechanism-2026-08-25
git rm diff-boss-summon-safety-mechanism-2026-08-25.md
git commit
```

## 전체 diff

```diff
diff --git a/CLAUDE.md b/CLAUDE.md
index 915e80a..603f704 100644
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -6,6 +6,78 @@ JS로 만드는 턴제 전투 시뮬레이션 웹게임. 패턴 빌드로 스킬
 테마(마을→왕국→그 뒤) 하나만 구현돼 있고, 이걸로 엔진과 성장곡선이
 유효한지 검증하는 게 목표.
 
+## 동굴 5층 보스 재설계 확정 — "단순하지만 강력한 단일강타" + H 소환 안전장치 (2026-08-25)
+
+동굴 몬스터 재설계 중, 애초 5층 보스 컨셉("H의 시그니처인 Enemy-All+
+잦은 자기강화를 물려받아 증폭")을 재검토함. 사용자가 지적한 문제: 5층
+풀이 "H(이월, 전체공격+잦은 자기강화) + 보스(H 증폭판, 역시 전체공격+
+잦은 자기강화)"라서 **같은 유형의 압박이 두 번 겹쳐 곱연산으로
+어려워짐** — 승률 급락 우려.
+
+**확정된 재설계 방향**:
+1. 보스는 H를 증폭한 게 아니라, 동굴의 원래 아키타입("고내구/저속강타")을
+   순수하게 극한까지 민 최종형 — **단일 대상 강타 하나만** 반복. H는
+   그대로 "전체+자강화" 유지, 보스는 "좁고 깊게"로 역할을 분리해서
+   같은 유형이 안 겹치게 함.
+2. 이 강타는 `preDelay`/`postDelay`(`src/engine.js:390-419`, 이미 있는
+   필드) 둘 다 크게 줘서 "느리지만 무거운" 패턴으로 — preDelay는 맞기
+   전 대비할 시간(전조), postDelay는 맞은 뒤 반격할 틈(회복 지연)을
+   준다. 자기강화도 남기되 H처럼 잦지 않고 약하게만.
+3. raw 데미지는 처음 구상(2.5~3.5배, raw 1100~1600)보다 낮춘다 — 보스
+   혼자 있다는 가정이 아니라 **H의 지속 압박과 겹치는 라운드까지 감안한
+   누적 데미지 기준**으로 역산해야 함(사용자 지적: "보스만 공격한다면
+   문제없지만, 옆에서도 가만히 있지 않다"). 목표 raw는 800~1100대로
+   하향(정확한 계수는 `simulate.js` 검증 몫, 이번엔 방향만 확정).
+4. 5층 풀을 "H + 보스" 단 둘로 제한(`maxCount:2`, 필러 없음), 보스는
+   `maxAppearances:1`로 캡(이미 `goblin_king` 전투에서 검증된 패턴 —
+   `web/battle-encounters.js`의 `BATTLE_MONSTER_POOLS`, 새 엔진 코드
+   불필요).
+5. **H 소환 안전장치**(이번 세션 핵심 신규 아이디어): 보스가 자기 턴에
+   "혼자뿐"(H가 죽어서)이면 33% 확률로 새 H를 소환. 효과: (a) 보스의
+   큰 한 방을 유예시켜주는 완충 장치, (b) 동시에 전체공격 위협을
+   되살려서 "H만 집중 공략해서 무한 소환 유발 후 보스만 상대"하는
+   퇴화 전략을 막음, (c) 두 위협(전체공격형/단일강타형)이 전투 내내
+   공존하게 강제. 소환된 H를 즉시 저격당하지 않게, 보스를 전열+
+   "아군 보호"로 둬서 단일/다수타겟 공격의 우선 타겟이 되게 한다
+   (전체타겟 공격에는 이 보호가 안 먹힘 — 협공 자체를 막는 건 아닌
+   의도된 우회로).
+
+**코드 변경 — 대부분 이미 있는 메커니즘 재사용, 신규는 작은 것 3곳뿐**:
+- 소환 자체는 `src/registries.js`의 `performSummon`+`SUMMON` 액션(고블린
+  마차가 이미 씀)을 그대로 재사용 — 보스의 `monsterDef.summonAbility`에
+  H 하나만 든 `candidates`를 주면 끝, 코드 변경 없음.
+- 전열 보호(`guardAllies`)의 타겟팅 로직 자체(`src/skillResolution.js:
+  202-207`)도 이미 진영 무관하게 구현돼 있어 코드 변경 없음. 다만
+  **`web/battle-adapter.js`의 몬스터 빌드 경로가 `guardAllies`를 전혀
+  안 옮겨 심던 진짜 갭**을 발견해서, 플레이어 경로(367-370행)와
+  대응하는 한 줄(`character.guardAllies = !!monsterDef.guardAllies;`)을
+  몬스터 경로에도 추가함.
+- "혼자뿐" 헤드카운트 조건과 "N% 확률" 조건은 기존 `ConditionRegistry`
+  (`src/registries.js`)에 전혀 없어서(기존 15종 전수 확인 — 전부
+  결정론적, 확률 게이트 없음) 신규 등록: `TEAMMATES_ALIVE_LTE`,
+  `RANDOM_CHANCE_PCT`. 둘 다 범용 leaf 조건이라 이번 용도 외에도 재사용
+  가능. 두 조건의 결합은 이미 있는 `AND` 콤비네이터 + `web/battle-
+  adapter.js`의 `andNext` 체이닝(기존 `maxUses`가 쓰던 것과 동일 패턴)이
+  그대로 처리 — `translateCondition()`에 `metric:"teamAlone"`/
+  `metric:"randomChancePct"` 번역 분기 2개만 추가함.
+
+**이번 세션엔 여전히 실제 보스 데이터(`web/monster-roster.html`의
+정확한 스탯/스킬/patterns 항목)는 안 씀** — 동굴 몬스터 전체 수치가
+확정될 때(다음 세션) 함께 작성 예정. `"[몬스터명]의 카드"` 개조 아이템
+컨셉(`card-modification-item-concept-2026-08-25` 브랜치)과 같은
+원칙("메커니즘/코드 인프라는 먼저 확정, 실 데이터는 나중") 유지.
+
+### 다음 세션에서 이어갈 것
+동굴 몬스터(A~I+보스) 전체 최종 스탯 확정 시, 위 신규 조건 2개를 실제로
+쓰는 보스의 `patterns` 배열(`{metric:"teamAlone", andNext:true}` →
+`{metric:"randomChancePct", value:33, action:"SUMMON"}`)과
+`summonAbility`/`guardAllies:true`를 `monster-roster.html`에 작성.
+이번 브랜치의 `src/registries.js`/`web/battle-adapter.js` 변경은 이
+샌드박스에 Node가 없어 직접 실행 검증을 못 했으므로, 주 워크스페이스에서
+`node --check` 및 실제 시나리오(H 사망 시에만 소환 조건 평가되는지,
+발동률이 33%에 수렴하는지, 단일타겟은 보스를 우선 맞고 전체타겟은
+소환된 H도 직접 맞는지) 확인 필요.
+
 ## Sheet 스킬 카드 효과 표시 — "27종 전수 등록"(2026-08-22) 이후에도 남아있던 누락 2건 수정 (2026-08-24)
 
 바로 아래(2026-08-22) "실전투 신고 4건 일괄 수정"의 4번 항목("Sheet 화면
diff --git a/src/registries.js b/src/registries.js
index 926348a..735a047 100644
--- a/src/registries.js
+++ b/src/registries.js
@@ -228,6 +228,22 @@ ConditionRegistry.register("SLOT_USE_COUNT_LESS_THAN", (actor, ctx, value, slotI
   return used < value;
 });
 
+// 자기 진영에서 자신을 제외한 생존 팀원 수가 value 이하면 true. "동료가
+// 전멸해서 혼자 남았을 때"류 패턴 조건(2026-08-25, 동굴 보스의 "H 소환
+// 안전장치" 설계용 — value:0으로 "완전히 혼자"를 표현).
+ConditionRegistry.register("TEAMMATES_ALIVE_LTE", (actor, ctx, value) => {
+  const sideUnits = actor.side === "ally" ? ctx.allies : ctx.enemies;
+  const aliveTeammates = sideUnits.filter((u) => u !== actor && u.isAlive).length;
+  return aliveTeammates <= value;
+});
+
+// value(%) 확률로 true — 평가할 때마다 새로 굴림. "N% 확률로만 발동" 패턴
+// 조건(2026-08-25 신설 — 확률 게이트가 이전엔 전혀 없어서, 결정론적
+// 조건뿐이던 패턴 시스템에 처음 추가되는 축).
+ConditionRegistry.register("RANDOM_CHANCE_PCT", (actor, ctx, value) => {
+  return Math.random() * 100 < value;
+});
+
 // value: [{cond, val}, ...] — 배열 안의 조건을 전부 만족해야 true("○이면서 ○").
 // 단순히 여러 조건의 동시 충족 판정을 위한 조합기. 예: "HP 50% 미만이면서 아직
 // 이 슬롯을 1번도 안 썼을 때"만 발동하고 싶으면:
diff --git a/web/battle-adapter.js b/web/battle-adapter.js
index 77f5150..9c96621 100644
--- a/web/battle-adapter.js
+++ b/web/battle-adapter.js
@@ -157,6 +157,16 @@
     if (row.metric === "preparingType") {
       return { cond: "ENEMY_PREPARING_TYPE", val: row.value };
     }
+    // 자기 진영에 자신을 제외한 생존 팀원이 없을 때만 true("혼자 남았을
+    // 때"). 2026-08-25, 동굴 보스의 "H 소환 안전장치" 설계용.
+    if (row.metric === "teamAlone") {
+      return { cond: "TEAMMATES_ALIVE_LTE", val: 0 };
+    }
+    // row.value(%) 확률로 true — "N% 확률로만 발동"류 조건. andNext로 다른
+    // 조건과 체이닝하면 "○일 때 N% 확률로"를 표현할 수 있음(2026-08-25).
+    if (row.metric === "randomChancePct") {
+      return { cond: "RANDOM_CHANCE_PCT", val: row.value };
+    }
     console.warn(`[battle-adapter] 아직 번역 못 하는 패턴 조건 — ALWAYS로 대체함:`, row);
     return { cond: "ALWAYS", val: 0 };
   }
@@ -501,6 +511,12 @@
     character.realMatk = monsterDef.combatReal?.matk || 0;
     character.realMdef = monsterDef.combatReal?.mdef || 0;
     character.realSummonEff = monsterDef.combatReal?.summonEff || 0; // 소환 능력이 있는 몬스터는 여기 값을 채워둬야 실제로 유의미한 소환이 됨
+    // 아군(플레이어) 빌드 경로(위쪽 buildAllyFromRoster)는 이미
+    // guardAllies를 옮겨 심는데 몬스터 경로엔 대응하는 줄이 없었음
+    // (2026-08-25 발견 — 동굴 보스가 소환한 아군을 "전열에서 지키는"
+    // 패턴을 만들려면 몬스터도 guardAllies를 켤 수 있어야 함). row는
+    // BattleCharacter 생성자 기본값이 이미 "front"라 별도 지정 불필요.
+    character.guardAllies = !!monsterDef.guardAllies;
     character.expReward = monsterDef.expReward || 0;
     character.goldReward = monsterDef.goldReward || 0;
     character.dropTable = monsterDef.dropTable || [];
```

## 다음 세션에서 이어갈 것 (구현 미착수)

동굴 몬스터(A~I+보스) 전체 최종 스탯 확정 시, 이 브랜치의 신규 조건
2개(`teamAlone`, `randomChancePct`)를 실제로 쓰는 보스 항목을
`web/monster-roster.html`에 작성 — `summonAbility`(H 하나만 든
`candidates`), `guardAllies:true`, `patterns`에
`{metric:"teamAlone", andNext:true}` → `{metric:"randomChancePct",
value:33, action:"SUMMON"}` 순서로. 그 뒤 실제 배틀 로그로 발동
시나리오 검증.
