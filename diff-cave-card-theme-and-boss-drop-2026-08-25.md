# diff-cave-card-theme-and-boss-drop-2026-08-25.md — 카드 테마(내구력) + Heart of Deepstone (2026-08-25)

⚠ 새 명명 규칙 실천(브랜치 고유 파일명). 병합 검토 끝나면
`git rm diff-cave-card-theme-and-boss-drop-2026-08-25.md`로 제거 권장.

- **기준 브랜치**: `main`(커밋 `678b90c`, 드리프트 없음)
- **작업 브랜치**: `cave-card-theme-and-boss-drop-2026-08-25`(1개 커밋)
- **변경 파일**: `CLAUDE.md` 하나뿐(코드 변경 없음, 순수 설계 문서 —
  `craftCost` 게이트 코드/`craft-materials.js`/`workshop.html`은
  이번 브랜치에서 전혀 안 건드림, 방향만 기록)

## 배경 요약

"[몬스터명]의 카드" 개조 아이템(`card-modification-item-concept-
2026-08-25`에서 순수보너스/범용장비/세트효과 없음까지만 확정, 실제
테마·수치는 보류)의 실제 테마와, 보스 전용 고유 장비 "Heart of
Deepstone"을 확정함.

**테마를 "공격 위주"에서 "내구력 중심"으로 정정**: 공격력은 상점
저가 무기+강화로도 쉽게 확보되지만, MaxHP/방어력 계열은 비용·
트레이드오프가 훨씬 크므로(예: 왕관 조각 세트 3종 MaxHP+150을 위해
무게 3 소비) 희귀한 카드가 채워야 할 공백은 내구력 쪽이라는 논리.

**중요한 조사 정정**: "완전방어율"을 최초엔 미구현이라고 잘못
판단했다가, 사용자가 "인퀴지터/데몬헌터 스킬에 분명 있다"고 재확인을
요청해서 다시 찾아보니 **이미 구현된 기존 메커니즘**임을 확인 —
`passiveMods.completeDefenseChancePct`(`src/skillResolution.js:
897-906`). 회피율은 정말로 미구현 스텁이라 이번 범위엔 포함 안 함.

**확정된 카드 테마 — "내구력" 4대 스탯, 전부 기존 필드 재사용(신규
엔진 코드 불필요)**: RealStr(`statRealBonus.str`), BonusDef/MDEF
(`combatBonus.def/mdef`), RealDef/MDEF 소폭(`combatReal.def/mdef`),
완전방어 확률(`passiveBonus.completeDefenseChancePct`).

**등급별 배분**: Common(필러 A,C,E,G, 개조비용 1,000G)=bonusDef/MDEF
큰 폭+realDef/MDEF 소폭. Rare(기믹몹 B,D,F,H,I, 개조비용 5,000G)=
RealStr 또는 완전방어 확률(B/H=완전방어확률, D/F/I=RealStr, 러프
배분). BOSS(개조비용 100,000G)=네 스탯 전부 조합. 세트 효과는
이번엔 도입 안 함(도입해도 AFTERMATH 특수 몬스터 전용으로 한정할
방향만 기록).

**개조비용 메커니즘**(신규 코드 필요, 이번 브랜치엔 아직 미구현 —
방향만 기록): `CRAFT_MATERIAL_TABLE`에 `craftCost` 필드 신설,
`workshop.html`의 `doCraft` 핸들러에 `appraisalCost`(495-507행)와
같은 패턴으로 골드 차감 로직 추가 필요.

**Heart of Deepstone**(보스 전용 고유 장비, 카드와 별개): 중갑
방어구, weight 4~5, combatBonus.def/mdef 100~150대(기존 상점 최고
63의 약 2배), maxHpBonus 400~600대(기존 상점 최고 200의 2~3배).

전체 배경/근거는 `CLAUDE.md`의 새 섹션 "동굴 카드 테마 확정('내구력'
중심) + 보스 고유드랍 Heart of Deepstone"에 그대로 있음(아래 diff
참고).

## 병합 전 체크리스트

`CLAUDE.md` 순수 텍스트 추가라 코드 실행 검증 대상 아님. `node --check`/
`demo-*.js` 불필요 — 이번 커밋엔 실행 코드 변경이 없음(개조비용 게이트
코드는 방향만 기록, 실제 구현은 다음 단계).

**병합 시 주의**: 같은 세션에서 나온 다른 두 브랜치(`defense-formula-
consideration-2026-08-25`, `card-modification-item-concept-2026-08-25`
등)와 같은 삽입 지점(`CLAUDE.md` 맨 위, intro 바로 아래)에 각자 새
섹션을 추가했으므로, 여러 브랜치를 함께 병합할 경우 그 지점에서 위치
충돌이 날 수 있음(내용 자체는 안 겹침 — 전부 유지하는 방향으로 수동
해결, 순서는 날짜 최신순 권장).

## 병합 방법

```bash
git fetch origin
git show origin/cave-card-theme-and-boss-drop-2026-08-25:CLAUDE.md | head -100   # 새 섹션 확인
git merge origin/cave-card-theme-and-boss-drop-2026-08-25
git rm diff-cave-card-theme-and-boss-drop-2026-08-25.md
git commit
```

## 전체 diff

```diff
diff --git a/CLAUDE.md b/CLAUDE.md
index 915e80a..7fef031 100644
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -6,6 +6,84 @@ JS로 만드는 턴제 전투 시뮬레이션 웹게임. 패턴 빌드로 스킬
 테마(마을→왕국→그 뒤) 하나만 구현돼 있고, 이걸로 엔진과 성장곡선이
 유효한지 검증하는 게 목표.
 
+## 동굴 카드 테마 확정("내구력" 중심) + 보스 고유드랍 Heart of Deepstone (2026-08-25)
+
+"[몬스터명]의 카드" 개조 아이템(`card-modification-item-concept-
+2026-08-25`에서 순수보너스/범용장비/세트효과 없음까지만 확정, 실제
+테마·수치는 보류)의 실제 테마와, 보스 전용 고유 장비 "Heart of
+Deepstone"을 확정함.
+
+**테마 방향 전환**: 처음엔 "몬스터 개성별 공격 테마"로 제안했으나,
+논의 중 "내구력 중심"으로 정정함 — 공격력은 상점 저가 무기+강화로도
+쉽게 확보되지만, MaxHP/방어력 계열은 비용·트레이드오프가 훨씬 크고
+(예: 왕관 조각 세트 3종 MaxHP+150을 위해 무게 3 소비) 앞으로도 그럴
+것이므로, 희귀한 카드가 채워줘야 할 공백은 "내구력" 쪽이라는 논리.
+공격 테마는 다른 계열 아이템의 몫으로 남김.
+
+**중요한 조사 정정**: "완전방어율"을 처음엔 미구현이라고 잘못 판단
+했었는데, 사용자가 "인퀴지터/데몬헌터 스킬에 분명 있다"고 재확인을
+요청해서 다시 찾아보니 **이미 구현된 기존 메커니즘**이었음:
+`passiveMods.completeDefenseChancePct`(`src/skillResolution.js:
+897-906`) — 히트마다 확률로 데미지 판정 자체를 무효화, `character-
+sheet.html`에 "완전방어 확률" 라벨도 이미 있음. 반면 회피율은 정말로
+미구현 스텁(`skill.ignoreEvade`, 판정 자체가 없음) — 이번 범위엔
+포함 안 함.
+
+**확정된 카드 테마 — "내구력" 4대 스탯, 전부 기존 필드 재사용(신규
+엔진 코드 불필요)**:
+- **RealStr**(`statRealBonus.str`) — MaxHP(`baseHp+floor(realStr×20)`)와
+  STR 기반 공격력에 동시 기여.
+- **BonusDef/MDEF**(`combatBonus.def/mdef`) — realDef를 안 건드려도
+  초반 전투 안정성을 크게 올려줌(사용자 설명).
+- **RealDef/MDEF**(`combatReal.def/mdef`) — bonusDef 카드에도 소폭
+  동반 상승 — "그만큼 실제 방어율도 조금씩은 오른다"는 요구 반영.
+- **완전방어 확률**(`passiveBonus.completeDefenseChancePct`) — 확률형
+  데미지 무효화라 초반엔 미미하지만 후반으로 갈수록 값어치가 커지는
+  스탯(사용자 설명 — 회피/완전방어 무시 속성 공격으로 대응 가능하지만
+  이번 범위에선 그런 상황은 상정하지 않음).
+
+**등급별 배분**:
+- **Common**(필러 A,C,E,G, 개조비용 1,000G): bonusDef/MDEF 큰 폭 +
+  realDef/MDEF 소폭 동반 상승. "낮은 티어치고 모난 데 없는 옵션이라
+  탱커에게 쥐여주기 좋다"는 포지션(사용자 표현).
+- **Rare**(기믹몹 B,D,F,H,I, 개조비용 5,000G): RealStr **또는**
+  완전방어 확률 중 하나 — 자기강화 스페셜리스트인 B/H는 완전방어
+  확률, 나머지 D/F/I는 RealStr로 배정(러프 배분, 확정 아님).
+- **BOSS**(개조비용 100,000G): 위 네 스탯을 전부 조합한 "다양한
+  효과" — Common/Rare보다 확실히 큰 폭.
+- **세트 효과는 도입하지 않음** — 나중에 도입하더라도 일반 동굴
+  구획이 아니라 향후 AFTERMATH 특수 몬스터(보스 등) 전용으로 한정할
+  방향성만 기록, 이번 범위엔 없음.
+
+정확한 수치는 여전히 러프 — "과하지도 짜지도 않게"라는 정성적 기준만
+확정됐고, `simulate.js` 검증 전까지는 방향성 수준으로 남김.
+
+**개조비용 메커니즘(신규 코드 필요, 아직 미구현)**: `CRAFT_MATERIAL_
+TABLE`(`web/craft-materials.js`)의 각 카드 항목에 `craftCost` 필드
+신설(기존 재료엔 없음 — 카드 전용 규칙). `web/workshop.html`의
+`doCraft` 핸들러(지금은 골드를 전혀 안 뗌, 재료 소모만 함)에
+`appraisalCost` 차감 로직(495-507행)과 같은 패턴으로 개조 실행 전
+`currentGold < (matDef.craftCost || 0)`면 거부, 통과하면 `profiles.
+gold` 차감 후 진행하는 코드를 추가해야 함. 기존 재료는 `craftCost`가
+없으니 `|| 0`으로 자동 무료 유지(하위 호환).
+
+**Heart of Deepstone — 보스 전용 고유 장비(카드와 별개)**: 중갑
+방어구(몸통 계열 슬롯), `weight` 4~5(기존 최고가 2였던 것보다 확실히
+무거움 — "동굴=무겁지만 강하다" 테마의 정점). `combatBonus.def`/
+`combatBonus.mdef` 100~150대(기존 상점 최고 63의 약 2배), `maxHpBonus`
+400~600대(기존 상점 최고 200의 2~3배) — "기존 드랍템과는 비교할 수
+없는" 수준을 수치로 표현. 보스의 `dropTable`에 낮은 확률로 등록 예정
+(카드와는 별도 슬롯 — 카드가 "개조 소재"라면 이건 "완성된 장비" 그
+자체). 정확한 숫자는 `simulate.js`(웨이트 상한/DEX 트레이드오프 실측)
+검증 대상.
+
+### 다음 세션에서 이어갈 것
+A~I+보스 실제 몬스터 데이터(이름/스탯/스킬)를 작성할 때 함께: 각
+몬스터의 카드를 `CRAFT_MATERIAL_TABLE`에 실제 수치로 추가하고 해당
+몬스터 `dropTable`에 1% 드랍 등록, `craftCost` 게이트 코드를
+`workshop.html`에 구현, Heart of Deepstone을 보스 `dropTable`에 실제
+수치로 추가. 전부 `simulate.js` 있는 주 워크스페이스에서 정밀 조정.
+
 ## Sheet 스킬 카드 효과 표시 — "27종 전수 등록"(2026-08-22) 이후에도 남아있던 누락 2건 수정 (2026-08-24)
 
 바로 아래(2026-08-22) "실전투 신고 4건 일괄 수정"의 4번 항목("Sheet 화면
```

## 다음 세션에서 이어갈 것 (구현 미착수)

A~I+보스 실제 몬스터 데이터 작성 시 함께: 각 몬스터의 카드를
`CRAFT_MATERIAL_TABLE`(`web/craft-materials.js`)에 실제 수치로
추가하고 해당 몬스터 `dropTable`에 1% 드랍 등록, `craftCost` 게이트
코드를 `web/workshop.html`의 `doCraft` 핸들러에 구현(`appraisalCost`
차감 로직과 동일 패턴), Heart of Deepstone을 보스 `dropTable`에 실제
수치로 추가. 전부 `simulate.js` 있는 주 워크스페이스에서 정밀 조정.
