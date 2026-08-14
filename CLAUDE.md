# 이 프로젝트

JS로 만드는 턴제 전투 시뮬레이션 웹게임. 패턴 빌드로 스킬 발동 조건을 짜는
"패턴 퍼즐"과, 레벨·장비·강화로 쌓는 "RPG 성장"을 둘 다 게임의 본분으로
삼는다는 설계 방향. 지금은 테스트 빌드 단계 — 레벨 상한 30, 고블린
테마(마을→왕국→그 뒤) 하나만 구현돼 있고, 이걸로 엔진과 성장곡선이
유효한지 검증하는 게 목표.

## 절대 잊지 말 것 — 데이터가 두 군데 있다

**`skill-table.json` / `job-table.json`은 게임이 안 읽는다.** 이 파일들은
`web/*-editor.html`의 "다운로드" 버튼이 내보내는 산출물일 뿐이다.

게임이 실제로 읽는 건 **localStorage**:
- `battleSim_skillTable` ← `web/skill-table-editor.html`의 `LEGACY_SKILL_SEED`가 심음
- `battleSim_jobTable` ← `web/job-table-editor.html`의 `LEGACY_JOB_SEED`가 심음
- `battleSim_monsterRoster` ← `web/monster-roster.html`의 `LEGACY_MONSTER_SEED`가 심음
- `battleSim_shopTable` ← `web/shop.html`의 `LEGACY_SHOP_SEED`가 심음

**스킬/직업/몬스터/상점 데이터를 고칠 때는 반드시 두 곳에 다 반영한다**:
1. 위 4개 HTML 파일 안의 `LEGACY_*_SEED` (게임이 실제로 쓰는 원본)
2. 프로젝트 루트의 `skill-table.json` / `job-table.json` (참고용 사본,
   `python3 -c "..."`로 정규식 파싱해서 시드 블록과 동기화해왔음 — 이 방식이
   번거로우면 아예 JSON을 단일 진실 공급원으로 만들고 에디터가 fetch해서
   읽도록 바꾸는 것도 검토해볼 만함)

시드를 갱신하면 **`*_SEED_VERSION` 문자열을 반드시 올릴 것**(각 파일에
`SEED_VERSION = "2026-08-09a"` 형태로 있음). 버전을 안 올리면 이미
localStorage에 데이터가 있는 브라우저에는 새 시드가 절대 반영되지 않는다
(예전엔 `*Migrated === "1"` 플래그 방식이라 이 문제로 한 번 크게 고생함 —
스킬을 182개로 늘려도 오래된 24개짜리 시드가 계속 쓰였던 사고가 있었음).
갱신 직전 값은 자동으로 `*SeedVersionBackup` 키에 백업됨.

## 아키텍처

```
src/            엔진 코어. Node(require)와 브라우저(<script>) 양쪽에서 그대로 돎
  character.js       BattleCharacter — 스탯/전투수치, real/bonus/effective 3단 구조
  engine.js           BattleEngine — 틱 기반 시간축, 행동 게이지, 전투 루프
  skillResolution.js  스킬 효과 전체(약 40종 effect type), 타겟팅, 크리티컬
  combatFormulas.js   데미지 계산, 스탯 감쇠(STAT_DAMPING_*)
  prepState.js        선딜레이 준비 상태, 코스트 확인/차감, 딜레이 저항
  registries.js       SkillRegistry/ActionRegistry/ConditionRegistry, 몬스터 전용 액션
  resourceManager.js  진영 공유 자원(마법진 등)
  resourceTypes.js    개인/팀 자원 카탈로그
  importer.js         레벨업 스탯 배분 등 저장 데이터 → 캐릭터 변환

web/            브라우저 UI. 순수 HTML+vanilla JS, 빌드 스텝 없음
  battle-adapter.js     로스터/몬스터 데이터 → src/ 엔진 객체로 변환하는 유일한 다리
  battle-encounters.js  전투별 몬스터 편성(BATTLE_MONSTER_POOLS), 가중치 추첨,
                        getMonsterTable()(로스터 배열 → id 키 객체 변환 공용 헬퍼)
  battle-themes.js      던전/전투 정의(BATTLE_THEMES) + findBattleById/battleNameById.
                        battle-select.html과 dispatch.html이 공유
  nav.js                전 페이지 공용 상단 네비게이션(각 페이지는 <body> 직후
                        <script src="nav.js">만 두면 됨 — 하드코딩 <nav> 금지)
  village.html / roster-index.html / hire.html    캐릭터 관리
  character-sheet.html  스탯/장비/스킬/패턴 편집(가장 큰 파일)
  battle-select.html    던전 선택. 파견의뢰/특수의뢰 탭, 해금조건 판정
  roster-select.html    파티 편성 → 전투 진입(연습모드 분기 포함)
  battle-view.html      실제 전투 실행, 결과 화면, 보상 지급
  dispatch.html         파견 실행(수주권 소모, 반복 시뮬레이션, 축약 정산)
  guild.html            파견 수주권 발급/수령
  workshop.html          장비 개조/소재 감정
  refinery.html          장비 강화
  monster-roster.html / monster-sheet.html   몬스터 정의/편집(=시드 소스)
  *-table-editor.html    스킬/직업/상점 편집기(=시드 소스)

simulate.js      밸런스 시뮬레이터. loadAdapterEnv()로 vm 샌드박스에 web/ 스크립트를
                 얹어서 실제 게임과 동일 경로로 캐릭터를 만들고 N회 반복 시뮬
demo-*.js        개별 메커니즘 검증용 데모(25개). "이 기능이 명세대로 도는가"를
                 결정적으로 확인 — simulate.js(확률적 통계)와 목적이 다름, 서로
                 대체 불가
index.js         엔진 기본 동작 스모크 테스트
```

### 몬스터 로스터는 "배열"로 저장된다 (조회 시 반드시 변환)

`battleSim_monsterRoster`는 **배열**로 저장되는데 `battle-adapter`는
`monsterTable[monsterId]`로 조회한다. 그래서 항상
`window.BattleEncounters.getMonsterTable()`을 거쳐야 한다(배열 → id 키 객체).

예전엔 이 변환이 `battle-view.html`에만 있었고 `dispatch.html`과
`battle-encounters.js`는 배열을 그대로 넘겨서, **파견은 모든 몬스터 조회가
undefined → 적이 하나도 안 생성 → 매 전투 1턴 부전승 → 2000턴 파견이 경험치 0 ·
골드 0 · 전리품 0으로 끝났다**(승률만 100%로 표시돼서 정상처럼 보였음). 기능
자체가 동작한 적이 없었던 셈. 2026-08-13에 공용 헬퍼로 일원화해 수정함.

## 핵심 설계 결정 (수치를 왜 이렇게 잡았는지)

- **틱 시간축**: `GAUGE_THRESHOLD=100000`, `effectiveSpeed = 10×√(baseSpeed+SPD×2)`.
  SPD는 제곱근 감쇠라 투자 효율이 완만함(의도됨 — 극단 스탯 20배 버프 환경에서
  SPD만 그대로 두면 행동 수가 폭증하기 때문).
- **데미지 스탯 감쇠**(`src/combatFormulas.js`의 `STAT_DAMPING_*`): 위력공식이
  `ATK × STAT × 계수`라 성장 요소가 곱연산으로 겹쳐 폭발함(Lv1→30에 81배).
  `contribution = 10 × (stat/10)^0.6`으로 스탯 기여만 완만하게 누름. ATK(장비)는
  안 건드림 — "장비를 통한 성장" 축을 살리기 위해. **아직 테스트 단계 잠정값**,
  `STAT_DAMPING_EXPONENT`를 1.0으로 두면 감쇠 해제.
- **무게(handle) 시스템**: `weightCapacity = 5 + DEX/5`. 예전엔 기본치 10이라
  DEX 투자 없이도 상점 풀세트가 다 들어가서 무게 제한이 무의미했음. 장비의
  `weight` 필드는 순수 코스트(예전엔 `handleReduction`이 반대로 용량을
  늘려주는 필드였는데 삭제하고 통일함).
- **크리티컬**: 확률은 `min(100, realLUK×0.5 + 장비/패시브 합산)`, 배율은
  `max(1.5, 장비/패시브 중 최댓값)` — 확률은 더하고 배율은 최댓값만(중첩 시
  폭발 방지). 히트마다 독립 판정.
- **스탠스 시스템**(`character.stances`, 맵 구조): 여러 스탠스 동시 보유 가능.
  `exclusiveGroup` 지정 시에만 그 그룹 안에서 상호배타. 배율형 필드는 스탠스
  여러 개에 걸쳐 곱연산, %형은 합산.
- **등급별 데미지 증감**: `damageDealtTo_{tier}Pct` / `damageTakenFrom_{tier}Pct`
  (tier: normal/elite/boss/creature/user). 소환된 개체는 `creatureTier`가
  강제로 `"creature"`가 됨(원본 몬스터가 normal이어도).
- **딜레이 저항 캡**: 방해효과로 밀리는 선딜레이는 원래 값의 250%가 상한
  (추가 가능분은 150%). 무한 방해로 봉쇄 불가.
- **파견/직접도전 이원화**: 직접 전투는 온전한 보상, 파견(수주권 소모,
  2000턴 예산 반복시뮬)은 경험치/골드 1/8, 아이템 1/100로 축약 정산 — 희귀
  아이템은 직접 도전이 유리하도록 의도적으로 배율을 분리함. 연습 모드는
  보상/기록 없음, Aftermath 구획에는 연습 모드 자체가 없음(한 번의 시도가
  신중해야 한다는 설계).
- **파견 전리품은 확률적 반올림**(2026-08-13): `floor(raw/100)`만 주면, 파견
  1회의 원본 누적량이 100을 못 넘는 아이템은 **영구히 0개**가 됨(왕관 조각·
  섭정의 인장·바퀴 자국 등이 파견으로는 아예 안 나왔음 — 확률이 낮은 게 아니라
  구조적으로 불가능). 그래서 몫을 주고 **나머지는 그 비율만큼의 확률로 1개 더**
  주는 방식으로 바꿈. 파견은 게임에 시간을 많이 쓰기 어려운 사람도 한 번 성취한
  구간에서는 주기적으로 보상을 얻어 액티브 유저와의 격차가 지나치게 벌어지지
  않게 하려는 구획이므로, 희귀 아이템도 "희귀할 뿐 불가능하지는 않게" 두는 게
  맞다는 판단. 20만 회 몬테카를로 실측: 흔한 재료 평균 1.75→2.10개(내림으로
  버려지던 손실이 사라짐)이면서 0개가 나오는 경우는 없고(±1개로 분산 유지),
  왕관 조각은 0%→18.1%로 획득 가능해짐. **드랍율 자체를 1/100로 줄이는 대안은
  기각** — 기댓값은 같지만 분산이 폭증해 흔한 재료조차 절반은 0개가 되어
  "주기적 보상"이라는 목적을 해침.

## 작업 흐름

1. **스킬/밸런스 수치를 바꿀 때**: 먼저 `simulate.js`로 실제 파티 시뮬을
   돌려서 승률/턴수를 확인하고 나서 확정한다. "이론상 이래야 한다"만으로
   끝내지 말 것 — 이번 프로젝트에서 여러 번 이론값과 실측이 어긋났음
   (예: 왕관 세트 초기 설계가 무게 페널티 때문에 오히려 손해였던 사례).
2. **엔진 로직을 바꿀 때**: 관련 `demo-*.js`를 반드시 돌리고, 없으면 새로
   만든다. 최소한 전체 `demo-*.js` + `index.js`가 다 통과하는지 확인 후 커밋.
3. **HTML 편집기의 `<script>` 블록을 고칠 때**: 브라우저 없이도
   `node --check`로 구문만은 미리 잡을 수 있다(정규식으로 `<script>` 내용을
   추출해서 임시 .js로 저장 후 확인하는 방식을 계속 써왔음).
4. **새 스킬 effect type을 추가할 때**: `src/skillResolution.js`의 `applyEffect`
   switch문에 추가하고, 대응하는 `demo-*.js`를 하나 만들어 검증한다.

## 알려진 버그 — 스킬에 stat/coefficient가 없으면 정보창이 크래시 (2026-08-14, 수정됨)

`character-sheet.html`의 `renderSkillCard()`가 `s.stat.toUpperCase()`를 무조건
호출해서, `stat`(=`coefficient`도 항상 같이 없음 — 183개 스킬 중 47개, 약 26%가
해당) 필드가 없는 힐/버프 계열 스킬을 보유한 캐릭터는 정보창 전체(스탯/패턴
섹션)가 렌더링되다 만 채로 크래시했음. 특히 방금 위에서 사제의 시작 스킬로
지정한 `Healing`이 바로 이 케이스라, 사제를 고용하면 곧바로 재현됐음.

`(s.stat || "").toUpperCase()`로만 고치면 크래시는 멈추지만 `" ×undefined"`가
그대로 화면에 노출됨(실측 확인함) — `coefficient`도 같이 없기 때문. 최종
수정은 `s.stat !== undefined`일 때만 스탯 줄 자체를 그리고, 아니면 그 줄을
생략(지연시간 정보만 있으면 그것만 표시)하는 방식으로 함 — 이 함수가 이미
쓰던 "값 없으면 줄 자체를 안 그린다"는 패턴(`target ? ... : ""`)과 통일.

## 알려진 버그 — [발동 실패] 로그의 블록 오귀속 (2026-08-14, 미수정)

`src/engine.js`의 `resolvePreparedSkill`에서 스킬 발동 성공 분기는 이번에
`{이름}, {스킬명}` 형태로 고치면서 `web/battle-view.html`의 블록 분리 로직도
이 줄을 새 블록 시작으로 인식하도록 같이 고쳤다(아래 "전투 로그 포맷" 항목
참조). 그런데 **바로 옆의 실패 분기(`if (!result.activated)`)는 그대로 뒀다**
— `❌ [발동 실패] {이름}의 "{스킬}" 발동 실패! (...)` 형태라 `"행동!"` 마커도
없고, 새로 추가한 `{이름}, ...` 콤마 패턴도 아니라서 여전히 직전에 "행동!"을
낸 다른 유닛의 블록 밑에 잘못 묶인다. 수치 변화가 없는 케이스라 이번 스타일
변경 대상은 아니었지만(사용자 요청이 "수치 증감이 일어나는 행동"에 한정),
구조적으로는 같은 버그다. 체감되는 문제가 생기면 성공 분기와 같은 방식(새
블록 시작으로 인식되는 안정적인 패턴 사용)으로 고칠 것.

## 알려진 버그 — battle-log-view.html의 로그 파서가 낡음 (2026-08-14, 미수정)

`battle-log-view.html`은 `battle-view.html`에서 로그 파서(`classifyLine`/
`splitNarrativeIntoBlocks`/`renderBlock`)를 그대로 복사해온 독립 프리뷰
페이지다(주석에도 명시돼 있음). 지금은 실제 게임 데이터가 아니라 파일 안에
하드코딩된 `FORCED_LOG_LINES` 픽스처 하나만 그리므로 당장 문제는 없다.
다만 그 사본은 옛날 버전이라 이번에 엔진 로그 포맷이 바뀐 것(스킬 발동 줄이
`{이름}, {스킬명}`, 수치 증감 줄이 `{값} {유형} ▷ {대상} (전 > 후)`)이 전혀
반영돼 있지 않다 — `FORCED_LOG_LINES` 픽스처 자체도 예전 포맷("...에게 N의
데미지. (전 > 후)")으로 박혀 있음. 나중에 이 페이지에 실제 전투 로그를
연결하거나 픽스처를 갱신할 일이 생기면, `battle-view.html`의 최신 파서로
다시 동기화해야 한다.

## 전투 로그 포맷 — 스킬 발동 줄 / 수치 증감 줄 (2026-08-14)

두 가지 로그 문구가 명시적인 표시 규칙을 갖는다 — 새 효과/스킬을 추가할 때
이 모양을 벗어나면 `web/battle-view.html`의 강조 렌더링이 안 먹는다.

- **행동 발동**(캐릭터/몬스터 공용, `{이름}, {행동명}` 형태 — 화면에서는
  `{행동명}` 부분에만 볼드+밑줄, `{이름}, ` 부분은 일반 텍스트):
  - 캐릭터 스킬: `src/engine.js`의 `resolvePreparedSkill`. 선딜레이 스킬의
    발동은 게이지 루프의 `"행동!"` 마커가 안 붙는 별도 경로(readyAtTick
    도래 시점)라, 이 줄 자체가 `battle-view.html`에서 새 로그 블록의 시작
    역할을 겸한다 — 안 그러면 직전에 "행동!"을 낸 다른 유닛 블록에 잘못
    섞임(실제로 그랬던 버그를 고치면서 같이 잡음).
  - 몬스터 기본 공격(및 `SkillRegistry`에 등록 안 된 모든 즉발 액션 공용):
    `src/registries.js`의 `ActionRegistry.register("ATTACK", ...)`. 이
    경로는 정상 게이지 루프를 타서 `"행동!"` 마커가 먼저 나오므로, 예전엔
    `${actor.name}의 공격.`을 따로 로그해서 이름이 "행동!" 헤더와 본문에
    두 번 나오는 2줄 구조였음(2026-08-14에 발견·수정) — 지금은 캐릭터와
    똑같이 `${actor.name}, 공격`으로 로그하고, `battle-view.html`의
    `splitNarrativeIntoBlocks`가 `"행동!"` 마커 바로 다음 줄이 같은
    유닛의 `{이름}, {행동명}` 줄이면 하나의 블록으로 합쳐서 캐릭터와
    동일한 한 줄짜리 헤더를 만든다(다음 줄이 이 형태가 아니면 예전처럼
    "행동!" 단독 plain 헤더로 폴백 — `USE_POTION`/`CREATE_MAGIC_CIRCLE`/
    `DETONATE_MAGIC_CIRCLE`/`SUMMON` 등 아직 이 컨벤션으로 안 옮긴
    액션들은 이 폴백으로 동작함, 회귀 없음).
  - `{이름}`과 `{행동명}`을 가르는 구분자가 콤마 하나뿐이므로, 캐릭터/몬스터
    이름이나 스킬·행동명에 콤마가 들어가면 파싱이 깨진다(현재 시드 데이터엔
    없음, 앞으로도 피할 것). `ActionRegistry`는 "몬스터 전용"이 아니라
    `SkillRegistry.has(slot.act)`가 거짓인 모든 액션이 타는 공용 경로라
    (`engine.js`의 `executeAction`), 캐릭터 패턴이 `act`로 액션 키를 직접
    가리켜도 같은 템플릿을 자동으로 씀.
- **수치 증감**(데미지/SP피해/회복 — `src/skillResolution.js`·`src/registries.js`의
  `statChangeLine(name, amount, label, before, after)` 헬퍼): `{증감량} {유형}
  ▷ {대상} (전 > 후)` 형태. 예: `16 데미지 ▷ 아렌 (304 > 288)`,
  `30 SP피해 ▷ 아렌 (150 > 120)`, `40 회복 ▷ 아렌 (250 > 290)`. 치명타는
  `치명타! ` 접두사를 statChangeLine 앞에 붙임(맨 앞에 오도록 — "N 데미지
  치명타!"가 아니라 "치명타! N 데미지"). `battle-view.html`의
  `classifyLine()`이 `" ▷ "` 포함 여부로 이 줄을 감지해 강조색을 입힌다.
  적용 범위: HP 데미지(스킬 메인 히트 + 몬스터 기본 공격/연계 필살기),
  SP피해(`spDamage`), 회복(`heal`/`scaledHeal`/`healMissingPercent`) —
  `spUp`/`spDown`·DOT 틱(출혈/재생 등)·흡혈은 의도적으로 미적용(아래 참조).
  필요해지면 `statChangeLine`을 그대로 재사용하면 됨(각 파일에 로컬
  중복돼 있음 — `josa` 헬퍼와 같은 관리 방식).
- **버프/디버프/자원**(2026-08-14 확정 — "정확한 효과·수치를 알려줄 생각은
  없다"는 원칙으로 통일함, 스크린샷 리뷰 세션 참고):
  - 고정치 스탯 변화(`atkUp`/`defUp`/`mdefUp`/`maxHpUp`/`maxSpUp`/`statUp`
    등): `{대상}의 {스탯} {+/-}{값}.` 그대로 유지(고정치라 값을 감춰도
    체감상 의미가 없어서 유지).
  - **비율(%) 기반** 스탯 변화(`combatStatUpPercent`/`statUpPercent`/
    `statDownPercent`): 계산된 실증가량(`increase`/`reduction`) 대신
    **`effect.value`(적용 %)를 그대로 표시** — `{대상}의 {스탯} {+/-}{value}%.`
    실제 증감량은 대상의 그 순간 effective 스탯에 따라 매번 달라지므로
    노출 안 함.
  - `guard`/`shield`: 차단 범위(물리/마법/전체)·횟수를 로그에서 제거 —
    `{대상}이(가) 방어를 굳혔다.` / `{대상}이(가) 보호막을 둘렀다.`만
    남김(상대가 로그만 보고 정확한 대응 수를 짜지 못하게 하려는 의도).
  - `actionDelay`/`castDelay`: 추가/저항된 정확한 틱 수 대신 세 갈래
    문구로만 알림 — `addedDelay < 0`(가속)이면 `{대상}의 행동이 빨라졌다.`,
    `actionDelay`형 방해면 `{대상}의 자세가 무너졌다.`, `castDelay`형
    방해면 `{대상}이(가) 방해를 받았다.`(저항으로 일부만 적용됐어도 같은
    문구 — 그 구분도 안 알려줌). **발견**: `applyDelayEffect`(`src/prepState.js`)는
    원래 방해(양수 값) 전용으로 보였지만 실제로는 부호를 안 가리는
    구조라 `effect.value`를 음수로 주면 이미 가속으로 동작한다 — 다만
    **지금 시드 데이터엔 음수 value를 쓰는 스킬이 하나도 없어서 실전
    경로가 없고, 딜레이 저항 캡(`DELAY_RESISTANCE_CAP_RATIO`) 수학도
    반복 가속까지 고려해서 설계된 게 아니므로**, 실제로 가속형 스킬을
    추가하게 되면 `remainingCapacity` 계산이 의도대로 동작하는지 별도
    검토 필요.
  - `refillPersonalResource`/`teamResourceGain`은 그대로 유지
    (`{대상}의 {자원} 재충전. (현재/최대)` / `{대상}이(가) {자원}을(를)
    {개수}개 그렸다.`).
  - 리뷰용 스크립트: 회복/버프/디버프/자원 계열 effect를 한 번씩 직접
    호출해서 지금 문구를 한눈에 모아 보는 스크립트를 세션 중 스크래치패드에
    만들어 씀(`BattleCharacter`를 실제로 생성해 `applyEffect`를 직접
    호출) — 새 effect type을 추가하거나 문구를 또 바꿀 때 같은 방식으로
    빠르게 훑어볼 수 있음. 파일 자체는 임시 산출물이라 리포에는 없음.

## 알려진 기능 공백 — teamResourceConsume 이펙트가 없음 (2026-08-14)

`teamResourceGain`(스킬 `effects` 배열에서 아무 스킬이나 팀 자원을 채울 수
있게 하는 범용 이펙트)의 반대인 **"팀 자원을 소모하는" 범용 이펙트가
없다.** 지금 팀 자원 소모는 `src/registries.js`의 `DETONATE_MAGIC_CIRCLE`
(`ActionRegistry`에 하드코딩된 액션, 마법진 3개 고정 소모)에서만
`ctx.resourceManager.consumeResource()`를 직접 호출하는 식으로 존재함 —
스킬 테이블 쪽 `effects` 배열에는 이 기능이 아예 노출돼 있지 않아서, 새
스킬을 만들 때 "이 스킬을 쓰려면 팀 자원 N개가 필요하다"를 표현할 방법이
`costs`의 `teamResource` 타입(소모, 이미 있음)뿐이고 "발동 결과로 팀
자원을 소모시키는" 효과는 못 만든다. 필요해지면 `teamResourceGain`
바로 옆에 대칭으로 추가하면 됨 — 의도된 로그 포맷도 이미 정해둠:
`{대상}은(는) {자원}을(를) {개수}개 사용했다.`(teamResourceGain의
`{대상}이(가) ... 그렸다.`와 대구를 이루는 형태).

## 알려진 버그 — 전직 UI가 있었지만 안 보이던 문제 (2026-08-14, 수정됨)

`character-sheet.html`에 전직(승급) 기능 자체는 이미 구현돼 있었다
(`getAvailableAdvancements`가 조건을 만족한 전직만 골라내고, "전직하기"
버튼도 정상 동작함 — 로직 자체엔 버그가 없었음, Lv15로 강제 설정해 실측
확인함). 문제는 **위치**였다 — `profileSection`(왼쪽 280px 칼럼) 안에 작은
항목 하나로 끼어 있어서, 조건을 만족해도 눈에 잘 안 띄어서 "전직할 방법이
없다"고 느껴졌음.

`<main>`은 `profileSection`(280px) / `statSection`(1fr) / `patternSection`
(420px) 3칼럼 그리드다(`main { grid-template-columns:280px 1fr 420px; }`).
새로 `advancementSection`을 4번째 요소로 추가하고 `grid-column:1/-1`로
3칼럼 전체 폭을 차지하게 해서 Sheet 최하단에 눈에 띄게 배치함 — 렌더링
함수(`renderAdvancementSection`)와 클릭 핸들러도 `renderProfile()`에서
분리해서 옮김(전직 시 `renderProfile`/`renderStatSection`/
`renderPatternSection`과 함께 자기 자신도 다시 그려서, 다음 전직 조건이
새로 열렸는지 바로 반영됨 — 대부분은 방금 전직한 직업의 다음 단계 레벨
조건이 더 높아서 곧바로 비워짐, 정상 동작).

**부수적으로 발견한 더 큰 버그**: `<main>`이 `display:grid`라 직계 자식은
전부 grid item이 된다 — `profileSection` 앞에 있는 `<div id="spectateBanner">`
(관전 모드 아니면 항상 빈 채로 있음)도 예외가 아니라서, 비어있어도 grid
auto-placement 1번 칸(280px)을 차지해버렸음. 그 결과 **1200px보다 넓은
화면에서 profileSection/statSection/patternSection이 전부 한 칸씩 밀려서
엉뚱한 폭으로 렌더링되고 있었다**(profileSection이 statSection 자리에
1183px로, statSection이 patternSection 자리에 420px로, patternSection은
4번째 아이템이라 다음 줄로 밀려나 1번 칸만 차지). 좁은 화면(<1200px, 반응형
1열 전환)에서는 애초에 grid-template-columns가 1fr 하나뿐이라 이 버그 자체가
안 드러나서, 넓은 화면에서만 재현되는 바람에 오래 발견되지 않은 것으로 보임.
`#spectateBanner:empty { display:none; }` + `#spectateBanner { grid-column:1/-1; }`
로 수정 — 비어있으면 grid 흐름에서 아예 빠지고, 내용이 있을 때(관전 모드)는
칼럼 하나가 아니라 전체 폭 배너로 나오게 함.

## 습득 가능 스킬 표시 규칙 — 조건 미충족은 아예 숨김 (2026-08-14)

`learnableSkillObjs()`(레벨 조건만 거름)로 뽑은 목록을 `renderStatSection()`
쪽에서 한 번 더 `meetsSkillPrereq(s) && !violatesExclusion(s)`로 필터링함.
예전엔 선행 스킬 미충족(`🔒`)·상호배타 위반(`🚫`)인 스킬도 카드는 그대로
보여주고 "배우기" 버튼만 비활성화했는데, 이제 그 두 조건을 못 채우면 카드
자체가 안 뜬다. **스킬 포인트 부족은 이 필터에 안 넣음** — 카드는 보이고
버튼만 비활성화되는 예전 방식 유지(포인트는 나중에 모으면 되는 값이라 "뭘
위해 모으는지" 미리 보여주는 게 나음 — 레벨/선행/배타처럼 구조적으로 막힌
것과는 성격이 다르다고 판단함).

## 알려진 버그 — hire.html/village.html의 직업 목록이 더미데이터 (2026-08-14)

`hire.html`의 `JOB_META`와 `village.html`의 `RANDOM_JOB_META`가 똑같이
검사·궁수·사제·도적·마도사·연금술사·전사 7개 직업을 하드코딩하고 있는데,
**실제 `job-table`(`job-table-editor.html`의 `LEGACY_JOB_SEED`)에 존재하는
최하위(1차) 직업은 사제·전사·마법사·헌터 4개뿐**이다. 검사·궁수·도적·마도사·
연금술사는 job-table/skill-table 어디에도 없는 완전한 더미 — 초기 예제
데이터를 만들 때 넣은 값이 그대로 남은 것으로 보인다. 판별 방법: job-table의
`advancement` 키(전직 가능한 직업) 중에서 **다른 항목의 `toJob`으로 한 번도
등장하지 않는 이름**이 최하위 직업이다(전직 결과물이 아니라 시작 직업이므로).

부수 피해: `hire.html`의 시작 스킬 이름도 실제 스킬 테이블과 어긋난다
(`사제`→"치유"라고 돼 있지만 실제 스킬 테이블엔 "Attack (Priest)". `전사`도
"강타"가 아니라 "Bash"). 시작 스킬은 `skill-table-editor.html`의
`LEGACY_SKILL_SEED.jobSkills[직업명]`에서 `requiredLevel===1 &&
skillPointCost===0`인 항목을 찾아서 가져와야 정확하다.

**해결 방향**: `JOB_META`/`RANDOM_JOB_META`를 job-table의 진짜 최하위 4개
직업(사제·전사·마법사·헌터)으로 교체하고, 시작 스킬 이름도 skill-table의
실제 값으로 맞춘다. 초상화(portrait)는 job-table에 필드 자체가 없으므로
(전직 후 직업에만 `portrait`가 붙음) 직업 역할에 맞게 새로 고른다.

## 아이템 스키마 통일 + 강화 가능 여부 필드 (2026-08-14)

**문제**: `refinery.html`이 강화 가능 여부를 `findShopPrice(name)`(상점
테이블에서 name으로 찾아 price 존재 여부)로 판정했다. 드랍 전용 장비는
상점 테이블에 대응 항목이 아예 없어서 무조건 "상점가 정보 없음 — 강화
불가"였음 — 강화 가능 여부가 "상점에서 파는가"에 우연히 종속돼 있었던
구조적 문제.

**해결**:
1. **드랍 테이블의 아이템명 필드를 `itemName`→`name`으로 통일**(상점/창고
   테이블과 동일 스키마). 영향받은 곳: `monster-roster.html`(시드 24곳),
   `monster-sheet.html`(에디터 폼 + 저장 로직), `src/engine.js`(`grantKillReward`/
   `addLoot`/`battleLootGained`), `src/character.js`(주석),
   `battle-view.html`/`dispatch.html`(전리품 집계·창고 병합·표시),
   `battle-result.html`/`battle-log-view.html`(표시 — 둘 다 예시/미연결
   데이터라 영향 적음), `demo-kill-rewards.js`/`demo-reset-and-result.js`
   (픽스처). `MONSTER_SEED_VERSION`을 `2026-08-14a`로 올림.
2. **`enhanceable` 필드 도입**: 상점 테이블의 기존 equipment 항목 32개
   전부에 명시적으로 `"enhanceable": true` 추가(`SHOP_SEED_VERSION`을
   `2026-08-14a`로 올림). 드랍 테이블의 equipment 항목 9개에도 동일하게
   추가. 앞으로 새 아이템을 만들 때 강화 가능하게 하려면 이 필드를 직접
   켜야 함(암묵적 기본값 없음 — 사용자가 명시적으로 결정하겠다고 함).
3. **`refinery.html`의 판정 로직 교체**: `findShopPrice()` →
   `findItemDef(name)`(상점 테이블 우선, 없으면 모든 몬스터의 드랍
   테이블을 훑어서 찾음) + `refineCostBasis(name)`(`enhanceable !== true`면
   null=강화 불가, `price`가 있으면 그 값, 없으면 `FALLBACK_REFINE_PRICE`
   = 100골드). 실측 확인: 상점 아이템("아밍 소드", price 3000)은 시행비용
   300G, 드랍 전용 아이템("이 빠진 도끼", price 없음)은 fallback 100 →
   시행비용 10G로 정상 표시되고 실제 강화(+3, 30G 지출)까지 성공함.

**부수 발견(수정함)**: `monster-sheet.html`의 드랍 테이블 저장 함수
(`readDropRows`)가 폼이 관리하는 4개 필드(name/category/chance/quantity)만
으로 객체를 새로 만들어서, 저장할 때마다 `combatReal`/`weight`/
`equipmentType`/`enhanceable`/`price` 같은 폼에 없는 필드가 전부 날아가는
문제가 있었음 — 오늘 추가한 `enhanceable`이 바로 이 경로로 삭제될 뻔함.
기존 항목(`data.dropTable[i]`)에 spread로 얹어서 폼이 관리하는 필드만
덮어쓰는 방식으로 고침.

## 재강화(이미 강화된 아이템의 추가 강화) 허용 (2026-08-14)

"이미 강화한 아이템도 강화가 안 된다"는 증상은 위 스키마 문제와는 **다른
원인**이었다 — `refinery.html`의 `poolEquipmentBase()`가 `!w.enhanceLevel`로
걸러서, 한 번이라도 강화된 장비는 재강화 후보 풀에 영구히 안 들어갔다
(상점가/enhanceable과는 무관한 별개 필터). 원래 의도가 "재강화도 가능해야
한다"는 것으로 확인돼서 허용하도록 고쳤다.

**핵심 결정**: 재강화 중 실패하면 지금까지 쌓아둔 등급까지 포함해서 **전체
파괴**(기존 "+0 아이템 강화 실패 시 완전 파괴" 원칙을 그대로 확장 — 안전하게
등급을 유지하는 옵션은 기각함).

**구현**:
- `poolEquipmentBase()`: `!w.enhanceLevel` 필터 제거, 대신 `enhanceLevel < MAX_ENHANCE_LEVEL(20)`로 교체(이미 최고 등급이면 더 올릴 데가 없으니 제외).
- `attemptOne(fromLevel, targetLevel)`: 예전엔 항상 레벨 1부터 시작했는데 시작점을 매개변수화. `fromLevel+1`부터 성공률 판정 시작, 중간 실패 시 `survived:false`(= 목표 미도달 = 완전 파괴, 기존 로직 그대로 재사용).
- `pristineSpecFor(name)`: **강화 배율은 항상 원본(+0) 수치 기준의 절대값**이라(`statMultiplier(level)`이 절대 배율, 이전 등급의 스탯에 또 곱하는 게 아님), 재강화 시에도 매번 상점/드랍 테이블의 원본 정의에서 순수 +0 스탯을 새로 가져와야 함 — 이미 강화된 인스턴스 자신의 `combatReal`을 base로 쓰면 중첩 배율이 걸려버림(예: +3 스펙 위에 +5 배율을 곱하는 실수). `findItemDef()`를 재사용해서 항상 원본에서 계산하도록 함. 실측: +0(atk22) 아이템을 +3으로 강화(atk23) 후 다시 +5까지 재강화했을 때 atk24(원본 기준 재계산)가 나옴을 확인 — 만약 +3 스펙 위에 또 곱했다면 25가 나왔을 것.
- 같은 이름이라도 등급이 다르면 완전히 다른 스택(+0 재고와 +3 재고가 동시에 있을 수 있음)이라, 카드/조회 전부 `name` + `enhanceLevel` 조합으로 식별하도록 바꿈(`data-level` 속성 추가, `updatePreview`/`openConfirm`/`runEnhancement` 전부 `fromLevel` 매개변수 추가).
- UI: 목표 강화수치 드롭다운이 `현재등급+1`부터 시작(전엔 항상 1부터). 이미 강화된 아이템은 이름 옆에 `+N` 배지 표시. 확인 모달에 "(현재 +N)"과 "완전 파괴(현재 +N 포함)" 경고 추가.

실측 검증: +3 상태 "이 빠진 도끼"를 +5로 재강화 성공(20G, 2회 시행), 창고에
`enhanceLevel:5`로 정확히 반영, 콘솔 에러 없음, 전체 회귀 27/27 통과.

## 알려진 미구현 / 보류 항목

- 스킬 데이터 안 `note` 필드에 미구현 사유가 개별로 적혀 있음(약 76건, 대부분
  근사 구현되어 있고 크래시는 없음) — 속성 태그, 몬스터 종족 태그, 상태이상,
  일부 이벤트 트리거 패시브 등.
- 제작공방(`workshop.html`)은 "개조"(드랍 장비 + 소재 1개)와 "감정"만 구현.
  "신규 제작"(기본 소재로 처음부터 장비 제작)은 레시피 테이블 미정으로 보류.
- 직업별 착용 가능 장비(`allowedEquipmentTypes`)는 HOF 원본 기준으로 19개
  직업 전부 채워져 있음(job-table.json).
- 로그 접기/요약 UI는 아직 없음(우선순위 낮음으로 보류 중).
- 티어(장비 등급) 개념은 데이터 필드로 존재하지 않음 — "같은 handle 대비
  성능"이라는 설계자 머릿속 개념일 뿐, 코드가 참조하는 값이 아님.
- **(요청됨, 미착수, 2026-08-14)** 전투 중 버프/디버프로 오르내릴 수 있는
  스탯 변동폭(`statUpPercent`/`statDownPercent`/`combatStatUpPercent`)을
  현재 범위에서 50~500%로 축소하고 싶다는 요청. 실측 확인 결과: 지금 183개
  스킬의 실제 데이터 상 이 세 effect type의 `value`는 **-70~+100% 범위**뿐이라
  (`Disarm`의 -70%가 최소, `Justice Craft`의 +100%가 최대 — 20만 스킬 순회
  실측), 사용자가 언급한 "50~2000%"에 해당하는 하드코딩된 값이나 UI 제한을
  코드에서 찾지 못함. CLAUDE.md의 "SPD는... 극단 스탯 20배 버프 환경에서"
  문구(STAT_DAMPING 설계 근거 섹션)에 나오는 "20배"가 실제 게임 밸런스 수치가
  아니라 감쇠 공식을 스트레스 테스트하기 위한 가상의 극단 시나리오였을
  가능성이 있음 — 사용자가 말한 2000%가 정확히 어떤 필드/메커니즘을 가리키는
  것인지(스킬 effect.value인지, 장비 statBonus/statUpPercent인지, 다른
  계산인지) 다음 작업 시작 전에 먼저 확인 필요.

## 로그인 (2026-08-14, Discord OAuth 실제 동작 확인함)

Supabase Auth에 인증을 전부 위임하고, 로그인 수단은 **Discord OAuth
단독**(이메일/비밀번호 등 다른 수단 없음)으로 결정함 — 직접 구현 대신 외부
API 위임을 선택했고, 디스코드 커뮤니티 계획이 있어 Discord로 좁혔다. 계정당
디스코드 계정 하나만 있으면 되고, 다중 계정 자체는 문제삼지 않되 스팸은
Supabase 기본 보호기능(이메일 인증/CAPTCHA/rate limit)에 맡김. 디스코드
커뮤니티 서버 가입은 로그인과 완전히 별개로, 선택 사항으로 둠.

- `web/supabase-client.js` — 클라이언트 초기화 공용 파일(프로젝트 URL +
  anon key, 노출돼도 되는 값). 로그인 관련 페이지는 전부 이 파일을 통해
  같은 클라이언트 인스턴스를 씀.
- `web/login.html` — `signInWithOAuth({provider:"discord"})` 트리거.
- `web/auth-callback.html` — `onAuthStateChange`/`getSession`으로 세션
  감지 후 `roster-index.html`로 리다이렉트.
- 배포처: GitHub Pages(`https://2inkle.github.io/Celestial-Pinnacles/`).
  Supabase 프로젝트 ref: `pauhrbebgmukknbrofon`.
- **겪은 함정**: `signInWithOAuth`의 `redirectTo`는 Supabase 대시보드의
  Authentication → URL Configuration → Redirect URLs에 **정확히 등록된
  주소만** 실제로 적용된다. 등록 안 하면 조용히 프로젝트 기본 Site URL(기본값
  `http://localhost:3000`)로 폴백해서, 세션 토큰이 그대로 붙은 채 연결 불가
  로컬 주소로 새 나간다(실제로 재현해서 확인함). 콜백 주소를 바꾸거나 새
  배포처를 추가할 때마다 이 허용 목록부터 갱신할 것.
- 2026-08-14에 실제 Discord 계정으로 로그인 → 세션 생성 → 콜백 리다이렉트까지
  브라우저에서 end-to-end 검증 완료.

**아직 안 된 것**: 로그인/스키마는 됐지만, 게임 페이지 대부분은 아직
`localStorage`로만 동작한다 — 아래 "게임 페이지의 Supabase 전환" 섹션 참조.

## 게임 페이지의 Supabase 전환 (진행 중 — `roster-index.html` 1차 완료, 2026-08-14)

로그인과 DB 스키마가 준비된 뒤에도, 실제로 `web/*.html`이 그 스키마를 읽고
쓰게 만드는 건 완전히 별도 작업이다. "복잡한 페이지부터 손대면 중간에 연결
문제가 생겼을 때 바꿀 게 많아진다"는 사용자 판단에 따라, 쓰기 동작이 없는
가장 단순한 페이지(`roster-index.html` — 로스터/골드를 읽어서 카드로
보여주기만 함)부터 전환해서 패턴을 확립하기로 함.

**확립된 패턴** (앞으로 다른 페이지 전환 시 그대로 재사용):
- **인증 가드**: `web/auth-guard.js`(신규, `exp-table.js`와 동일한 로드/노출
  컨벤션 — IIFE + `window.AuthGuard`). `window.AuthGuard.requireSession()`을
  데이터 조회 전에 호출 — 세션 없으면 `login.html`로 리다이렉트하고 이후
  코드가 실행되지 않도록 영구 pending Promise 반환. 지금까지 **어떤 페이지에도
  인증 가드가 없었다**(`battleSim_username`은 전부 관리자 판별용이었지 로그인
  여부 체크가 아니었음, 조사로 확인함) — 이 페이지가 최초 적용 사례.
- **DB row → 렌더링 코드 매핑**: DB 컬럼은 snake_case(`real_stats`/
  `exp_to_next`/`learned_skill_names` 등)인데 기존 렌더링 코드는 camelCase
  로컬스토리지 형태를 기대하므로, `mapCharacterRow()` 같은 작은 어댑터 함수로
  변환만 하고 렌더링/추정 로직 자체는 최대한 안 건드림(변경 범위를 좁게
  유지하는 게 목적).
- **장비 데이터 조회**: `characters.equipment` 컬럼이 없으므로(2026-08-14
  결정, 위 스키마 섹션 참조), 캐릭터 목록을 가져온 뒤 그 id들로
  `warehouse_items`를 `held_by in (...)`로 한 번 더 조회해서 `held_by`
  기준으로 그룹핑 — `Object.values(character.equipment)`가 하던 일을 이
  배열이 그대로 대신함(오히려 코드가 단순해짐).
- **관리자 네비 중복 제거**: `roster-index.html`이 갖고 있던 `devToolsNavSlot`
  인라인 체크는 `nav.js`가 이미 하는 일과 완전히 중복이라(조사로 확인 —
  `nav.js`가 `DOMContentLoaded`에서 같은 슬롯을 이미 채움) 삭제함. `nav.js`
  자체의 `battleSim_username` 기반 관리자 판정은 이번 스코프 밖 — 여러
  관리자 전용 페이지(`dev-tools.html`/`feature-requests.html`/각 에디터)를
  `profiles.is_admin` 기반으로 옮기는 건 훨씬 큰 별도 작업으로 남겨둠.

**전환 중 발견한 스키마 누락**: 카드의 Max HP/SP·패턴 슬롯 수 추정에 쓰이는
장비 필드(`patternSlotBonus`/`statRealBonus`/`critMultiplier`/
`conditionalPassiveMods`/`grantsResource`/`equipmentType`/`avatarPortrait`/
`grantsSkill`/`consumable`/`usesPerBattle`/`enhanceable`)가 0001의
`warehouse_items` 컬럼 목록에 빠져 있었다. `battle-adapter.js`(실전투 계산의
유일한 다리)를 다시 확인해서 `statRealBonus`/`critMultiplier`/
`conditionalPassiveMods`/`grantsResource`가 실제 전투 수치에 쓰이는 걸
확인함 — `shop.html`의 구매 확정 로직이 아이템 정의 **전체**를 스프레드로
저장하는 방식(`const { name, category, price, ...spec } = it;
warehouse.push({ ..., ...spec })`)이라 컬럼 하나만 빠져도 그 필드가 조용히
유실되는 구조였다. 이건 CLAUDE.md에 이미 기록된 과거 버그("예전엔 name/
category/quantity만 저장돼서 장착해도 스탯이 0이 되는 문제")와 정확히 같은
패턴이 스키마 레벨에서 재발할 뻔한 것 — `supabase/migrations/
0004_warehouse_item_fields.sql`로 nullable 컬럼을 추가해서 막음(저장 방식은
JSONB 통합 대신 타입 컬럼 전부 추가 쪽으로 사용자와 상의해서 결정 — Postgres
컬럼이 기본 NULL 허용이라 "필드가 있어도 안 채워도 됨"이 이미 컬럼 방식으로도
만족되기 때문). **앞으로 다른 페이지를 전환하다 또 빠진 필드가 나오면 같은
방식(작은 nullable-column 추가 마이그레이션)으로 잡으면 됨.**

**실측 검증**(2026-08-14): 인증된 세션으로 테스트 캐릭터(STR 20) +
`pattern_slot_bonus:2`/`stat_real_bonus:{str:15}`를 가진 장착 장비를 임시로
insert → 카드에 Max HP 900(=200+35×20, 장비 보너스 포함)/Max SP 150/패턴
슬롯 0/4(=기본 2+장비 보너스 2)로 정확히 계산돼서 렌더링되는 것 확인 → 정리
삭제함. 세션 없는 상태로 접속 시 `login.html`로 정상 리다이렉트되는 것도
확인함.

**`hire.html` 2차 전환 완료** (2026-08-14): 첫 쓰기 경로 전환 사례.
`getRoster/saveRoster/getGold/setGold/getUsername/nextCharacterId` 전부
제거하고 `characters` insert + `profiles.gold` update로 교체. `characters.id`가
DB에서 `gen_random_uuid()`로 자동 생성되므로 예전의 "유저이름_순번" 수동 id
계산 로직 자체가 통째로 불필요해짐(스키마 전환이 코드를 오히려 단순하게 만든
두 번째 사례 — 첫 번째는 `roster-index.html`의 `Object.values(equipment)`→배열).
`buildCharacter()`에서 `equipment`/`inventory` 필드도 제거(테이블에 컬럼 자체가
없음, 새 캐릭터는 장착 장비가 없으니 애초에 넣을 게 없음). 골드 차감은 클라이언트가
들고 있는 값 기준 read-modify-write(원자적 아님) — 예전 localStorage 방식과
동일한 수준의 위험만 있고 새로 생긴 문제는 아님, 원자적 처리는 "API 단계에서
검증/방어가 필요한 지점"의 더 큰 과제와 함께 나중에.

**실측 검증**: 실제 UI로 이름 입력 → 고용 버튼 클릭 → `characters`에
정확한 필드(job/learned_skill_names/real_stats/presets 등)로 행 생성,
`profiles.gold`가 3000→2800(사제 고용비 200)으로 정확히 차감, 토스트 메시지
정상 표시, 콘솔 에러 0건 확인 → 테스트 캐릭터 삭제 + 골드 3000으로 복구.

**GitHub Pages 배포 관련 메모**: 캐시 관련 브라우저 문제로 배포 직후
쿼리스트링 없는 URL은 낡은 캐시를 서빙하는 경우가 있었음(`fetch()`로 직접
확인하면 새 콘텐츠가 맞는데, 브라우저 탐색으로 로드하면 예전 버전이 뜨는
현상) — 새 탭에서도 재현됨. `?v=숫자` 같은 캐시 무효화 쿼리를 붙이면
즉시 새 버전이 로드됨. 이후 페이지 전환을 배포 직후 검증할 때 재현되면
같은 방법을 쓸 것.

**`village.html` 3차 전환 완료**(2026-08-14): 골드 표시/리셋/예제 캐릭터
생성/무작위 용병 10명 생성을 characters/profiles 기준으로 교체. 예제
캐릭터 생성은 insert 후 반환된 DB 생성 uuid로 바로 Sheet 이동.

**`character-sheet.html` 전환 완료**(2026-08-14) — 프로젝트에서 가장 크고
복잡한 페이지(1820→1923줄). `localStorage` 5개 키(username/skillTable/
jobTable/roster/warehouse) 전부 제거:
- 스킬/직업 테이블은 `game_content`에서 병렬 조회, 최상단 `const`를 `let`으로
  바꿔 async 부트스트랩에서 할당(`COMMON_SKILLS`/`SKILL_TABLE`/
  `JOB_ADVANCEMENT_TABLE`/`JOB_ALLOWED_EQUIPMENT_TYPES`).
- 캐릭터는 로스터 전체가 아니라 `characters` 행 하나만 조회, 섹션별 저장은
  `SAVE_SECTIONS`를 "메모리 필드→DB 컬럼" 매핑으로 바꿔 개별 UPDATE.
- **장비 장착/해제를 `warehouse_items.held_by` 직접 조작으로 완전히
  재설계**: 장착은 풀 행 quantity가 1이면 `held_by`만 갱신, 2 이상이면
  감소+새 행 insert. 해제는 매칭되는 풀 행(이름+분류+강화등급+제작재료
  일치)이 있으면 병합 후 보유 행 삭제, 없으면 `held_by`만 null로 되돌림.
  `characters.equipment` 컬럼이 없어져서 예전에 "장비는 즉시 별도 저장"
  하던 이유 자체가 사라짐 — DB 갱신이 곧 확정.
- 관리자 판별은 `AuthGuard.isAdmin()`으로 교체("🧪 개발자 도구" 블록만
  게이팅 — 화살 지급 등 나머지 🧪 버튼은 원래도 admin 게이팅이 없었음,
  원본 코드 확인해서 회귀 아님을 검증함).
- 관전(스펙테이트) 경로는 자연 소멸 — RLS가 남의 캐릭터 행 자체를 안
  내려주므로 "없음"과 "내 것 아님"이 클라이언트에서 구분 불가능해져서 둘 다
  동일한 not-found 화면으로 처리.
- `characters.key_items`(전직 조건용 개인 플래그) 컬럼이 없던 것을
  `0006_characters_key_items.sql`로 추가.
- **실측 검증**(실제 UI 클릭 기준): 스탯 STR +3 저장 → DB에 13 반영 확인,
  Healing 스킬 습득 저장 → DB에 반영 확인, quantity:2 테스트 장비 실제
  장착(풀 1로 감소+보유 행 신규 생성, 스탯 화면에 INT +5·Max SP 200 즉시
  반영) → 해제(풀로 quantity 2 병합, 보유 행 삭제) 전 과정 정확히 동작
  확인. 존재하지 않는 id 접근 시 not-found 화면 정상. 콘솔 에러 0건.
  테스트 데이터 전부 정리함.

**`guild.html` 전환 완료**(2026-08-14) — 사용자 판단으로 "연결점이 적은
페이지부터" 순서를 정함(`dispatch.html`/`battle-view.html`처럼 여러
시스템이 얽힌 페이지는 뒤로 미룸). 파견 의뢰권 발행/수주를
`warehouse_items`("파견 의뢰권" 행) + `profiles.last_ticket_claim_at`
기준으로 교체. `last_ticket_claim_at`은 계정 생성 트리거가 이미 `now()`로
채워두므로(0002) 예전의 "기록 없으면 지금으로 초기화" 로직이 불필요해짐.
30초 주기 렌더는 DB 재조회 없이 로컬 변수로 시간 계산만 반복(값 변경은
"수주하기" 클릭 시에만 DB 반영). **실측 검증**: `last_ticket_claim_at`을
DB에서 65분 전으로 임시 조정 → 페이지가 정확히 "2장 대기"로 계산 →
수주하기 클릭 → 창고 수량 10→12, `last_ticket_claim_at`이 정확히 60분
(2×30분)만 이동하고 남은 5분은 이월되는 것까지 확인(즉시 `now()`로
리셋되지 않음 = 절삭 로직이 정확히 포팅됨) → 테스트 후 원상 복구.

**`shop.html` 전환 완료**(2026-08-14): 상점 카탈로그는 이제
`game_content.shopTable`에서 조회(`SHOP_SEED_VERSION` 재시딩 로직은
클라이언트 단일 저장소 시절 전용 개념이라 완전히 제거 — DB가 유일한
진실 공급원이므로 재시딩 자체가 개념적으로 무의미해짐, `character-sheet.html`이
`getSkillTable`/`getJobTable`을 없앤 것과 같은 패턴). 골드/창고/
구매이력(`shop_purchased`)을 `profiles`/`warehouse_items`/`shop_purchased`
기준으로 교체. 상점 아이템(camelCase)을 창고 insert(snake_case)로 변환할
때 **카탈로그 전용 필드(price/stock/saleStart/saleEnd/saleDays)는 의도적으로
제외**하고 실제 `warehouse_items` 컬럼만 매핑(예전 스프레드 방식은 이
필드들도 같이 넘어갔는데 그건 의도가 아니라 부수 효과였음 — 이번에 바로잡음).
**실측 검증**: 실제 UI로 "모자" 2개 구매 → 골드 3000→2400, 창고에 정확한
필드(`combat_bonus.mdef:5`/`equipment_type:cap`/`enhanceable:true` 등,
카탈로그 전용 필드는 확인 결과 안 새어 들어감)로 아이템 생성, `shop_purchased`
기록까지 확인 → 정리.

**`refinery.html` 전환 완료**(2026-08-14): 강화 가능 여부/기준가 조회는
`game_content`(shopTable/monsterRoster)를 캐시해서 동기 조회, 창고 풀은
`warehouse_items`(category='equipment', held_by IS NULL)을 캐시. 실행
시점엔 DB에서 base 행을 다시 조회해 수량 확인 후 차감/삭제, 성공분은
목표 등급 행에 병합하거나 새로 insert — fromLevel/targetLevel이 0이면
`enhance_level IS NULL`로 조건 분기(0이 아니라 NULL로 저장됨에 유의).
원본(+0) 정의 기준 재계산·재강화 시 완전 파괴 등 기존 밸런스 로직은 전혀
안 건드림. **실측 검증**: 실제 UI로 "모자"(+0) → +1 강화 실행 → 골드
3000→2970(30G), 창고 행이 `enhance_level:1`인 새 행으로 정확히 교체,
카드가 "모자 +1"로 재렌더링되고 다음 목표 옵션이 2부터 시작하는 것까지
확인(재강화 연쇄 시작점 정상) → 정리.

**`workshop.html` 전환 완료**(2026-08-14): 개조/감정을 `warehouse_items`
기준으로 교체. 선택 상태를 배열 인덱스(`_idx`) 대신 DB 행 `id`로 관리하도록
바꿔서, 예전에 "삭제 시 인덱스가 밀리지 않도록 큰 쪽부터 지운다"는 방어
코드가 필요했던 문제 자체가 사라짐(DB 행은 고유 id를 이미 갖고 있음 —
`refinery.html`의 재강화 포팅과 함께, 스키마 전환이 코드를 단순화하는
반복되는 패턴). `craft-materials.js`의 `applyCraftMaterial()`은 camelCase
아이템 객체에 대한 순수 함수라 전혀 안 건드림. **실측 검증**: 실제 UI로
"테스트단검"(ATK 10) + "고블린의 이빨" 개조 → 미리보기 ATK 13 정확히 표시
→ 확정 → 원본 소모, 소재 소모, 결과물에 `combat_real.atk:13`/
`passive_bonus.accuracyBonusPct:-3`/`craft_material` 정확히 반영 확인.
감정도 별도로 검증: 골드 3000→2950(50G), `appraised:true` 반영 확인 →
정리.

**`battle-select.html` 전환 완료**(2026-08-15) — 이걸로 "연결점 적은
페이지부터" 순서로 잡았던 독립 페이지 전환이 전부 끝남. `clearedBattles`/
`battleClearTimes`/`battleAttemptTimes` 세 localStorage 키를 `battle_progress`
테이블 하나로 통합(CLAUDE.md에 애초에 "한 테이블로 합치는 게 자연스럽다"고
적어뒀던 설계가 그대로 실현됨). `rosterHasItem()`은 캐릭터의 inventory/
equipment 필드가 이제 없어져서(equipment는 `warehouse_items.held_by`로
이관, inventory는 원래 죽은 필드) 창고 하나만 보면 되도록 단순화됨.
**실측 검증**: dev 버튼으로 "고블린과 놀기" 클리어 처리 → DB에 `cleared:true`
+ `cleared_at` 기록, 다음 전투("조금 강한 고블린")와 파견 버튼까지 정상
해금 확인 → "고블린 왕국 통행증" 지급 → 창고에 정확한 필드로 생성 확인 →
"승리 기록 초기화" → `cleared`만 false로 돌아가고 `cleared_at`은 그대로
유지되는 것까지 확인(예전 동작과 정확히 동일한 범위) → 전부 정리.

**여기까지 전환 완료 페이지(8개)**: `roster-index.html`/`hire.html`/
`village.html`/`character-sheet.html`/`guild.html`/`shop.html`/
`refinery.html`/`workshop.html`/`battle-select.html`. 확립된 공용 패턴:
`auth-guard.js`(세션 가드+관리자 판별), DB row(snake_case) ↔ camelCase
어댑터, `warehouse_items.held_by` 직접 조작, 렌더 루프에서 반복 조회되는
데이터는 부트스트랩에서 캐시 후 동기로 읽기, DB 재조회 기반 트랜잭션
(캐시가 낡았을 가능성을 항상 실행 직전 재확인).

**남은 것**: `dispatch.html`/`battle-view.html` — 보상 지급이 서버 검증
이슈(CLAUDE.md의 "API 단계에서 검증/방어가 필요한 지점")와 얽혀 있어서
단순 데이터 계층 교체를 넘어서는 설계가 필요함. 남은 페이지 중 유일하게
연결점이 많은 것들이라 가장 마지막으로 남겨둠.

## 로그인/서버 DB 전환 시 API 설계 논의 (2026-08-14, 스키마 실제 프로젝트에 적용됨)

**`supabase/migrations/0001_init_schema.sql`이 실제 Supabase 프로젝트(`pauhrbebgmukknbrofon`)에
적용 완료됨** — Dashboard SQL Editor에서 실행, "Success. No rows returned"로
성공 확인. 다만 **게임 자체는 아직 이 테이블들을 전혀 읽고 쓰지 않는다** —
`web/*.html`은 여전히 `localStorage` 단일 저장소로만 동작하는 상태(연결은
별도 작업). 아래 문단들은 그 스키마를 설계하며 실제 코드(`web/*.html`)를
다시 훑어 확인한 최신 결론이고, 스키마 파일 자체에도 같은 근거가 주석으로
남아있다. **README.md는 낡은 내용이라 참고하지 말 것.**

**RLS 격리를 실제 데이터로 검증함**(2026-08-14): anon 키로 `characters`/
`game_content`에 쓰기 시도 → 둘 다 `new row violates row-level security
policy`로 정확히 거부됨. 실제 로그인 세션(Discord OAuth)으로 본인 `user_id`
넣어 쓰기 → 성공, 조회에도 반영됨. 같은 세션으로 **남의 `user_id`를 사칭**해서
쓰기 시도 → 정확히 RLS 위반으로 거부됨(가장 중요한 증거 — 로그인만 했다고
아무 행이나 못 씀). 테스트로 만든 캐릭터 행은 확인 후 삭제해서 정리함.
검증 중 발견: 이 스키마 적용 **이전에** 이미 존재하던 계정(트리거가 아직
없던 시점에 가입)은 `on_auth_user_created` 트리거가 소급 적용되지 않아
`profiles` 행이 비어있었다 — 버그 아니고 트리거의 정상 동작 범위 밖. 실제
테스트 계정(`2inkle`)에 대해 `auth.users` 기준 백필 INSERT를 1회 실행해서
해결함(gold=3000/파견 의뢰권 10장으로, 아래 0002 적용 후 값과 동일하게 맞춤).

**`supabase/migrations/0002_new_account_defaults.sql`도 작성·적용함**(신규
계정 기본값, 2026-08-14 사용자 결정): 용병(캐릭터)은 보유하지 않음(자연스러운
기본값, 변경 없음), 골드 3000G(0001의 500에서 변경), 파견 의뢰권 10장(신규
지급 로직 추가 — `web/guild.html`의 `TICKET_NAME="파견 의뢰권"`/
`category:"consumable"`과 동일한 이름·분류로 지급해야 게임 로직이 인식함).
0001이 이미 적용된 뒤 나온 결정이라, 이미 적용된 마이그레이션 파일을
고치는 대신 0002로 분리함(마이그레이션 불변성 원칙) — `profiles.gold`
컬럼 기본값을 `alter column ... set default 3000`으로 바꾸고,
`handle_new_user()` 트리거 함수를 `create or replace`로 갱신해서 파견
의뢰권 지급 INSERT를 추가함. 실제 테스트 계정으로 백필 후 브라우저 세션에서
`gold:3000`/`파견 의뢰권 quantity:10`이 정확히 조회되는 것까지 확인함.

**보안 구멍 발견 및 수정 — `is_admin` 자기 승격 가능했음** (2026-08-14):
`2inkle` 계정을 관리자로 부트스트랩하는 과정(`update profiles set
is_admin = true where user_id = auth.uid()`를 로그인된 클라이언트에서 직접
호출)이 그대로 성공하는 걸 실측으로 확인함 — `profiles`의 UPDATE RLS
정책이 "본인 행인지"만 검사하고 "어떤 컬럼을 바꾸는지"는 안 가려서,
**로그인한 아무 유저나 자기 자신을 관리자로 승격시킬 수 있는 상태였다**.
`supabase/migrations/0003_prevent_self_admin_promotion.sql`로 막음 — "이미
관리자인 계정만 `is_admin` 값을 바꿀 수 있다"는 BEFORE UPDATE 트리거 추가.
**트리거 설계 중 자체 검토로 결함 하나를 더 잡음**: 처음엔 `auth.uid()`
값과 무관하게 무조건 `is_admin(auth.uid())` 판정만 걸었는데, Dashboard SQL
Editor는 JWT 세션이 없어 `auth.uid()`가 항상 NULL이고 `is_admin(NULL)`은
항상 false라서, 이 상태로 적용하면 **SQL Editor로도 이후 영원히 `is_admin`을
못 바꾸게 막혀버리는 자기모순**이 생긴다(아직 관리자 UI가 없어서 SQL Editor가
사실상 유일한 관리 통로인데 그 통로 자체가 잠김). 최종 조건은
`auth.uid() is not null and not is_admin(auth.uid())`일 때만 차단 —
SQL Editor(Dashboard 접근 권한 = 이미 프로젝트 소유자 수준 신뢰) 경로는
예외로 통과시키고, 로그인한 일반 클라이언트가 자기 자신을 승격시키는 실제
공격 경로(항상 유효한 `auth.uid()`를 가짐)만 정확히 막음. 최초 관리자
부트스트랩(`2inkle` 계정)은 이 마이그레이션 적용 **전에** 이미 완료함.

작성한 테이블: `profiles`(유저 프로필+골드+관리자 플래그, `battleSim_username`의
`"2inkle"` 문자열 비교를 `is_admin` boolean으로 정식 대체), `characters`,
`warehouse_items`, `battle_progress`(clearedBattles/battleClearTimes/
battleAttemptTimes 통합), `shop_purchased`, `feature_requests`, `game_content`
(skillTable/jobTable/monsterRoster/shopTable을 JSONB 통짜로 — 4개 에디터가
전부 "블롭 전체 읽고 통째로 저장" 방식이라 정규화보다 이 형태가 프론트 변경을
최소화함). RLS는 본인 소유 행만 CRUD가 기본, `game_content`는 전체 공개
읽기+admin만 쓰기, `feature_requests`는 로그인 유저 전체 읽기+본인 글 작성+
admin만 수정/삭제.

**스키마 설계 중 실측으로 새로 확인한 것들**(예전 버전 이 섹션에는 없었던
내용):
- `battleSim_hiredPoolIds`는 코드 전체에서 `removeItem` 호출(village.html
  리셋 시)만 있고 `getItem`/`setItem`이 어디에도 없다 — 죽은 키. DB 스키마
  대상에서 뺐다.
- `battleSim_lastResult`(sessionStorage)도 실측 결과 `setItem` 호출이 코드
  어디에도 없다 — `battle-view.html`/`battle-select.html`이 골드/창고/로스터/
  클리어기록을 직접 갱신하고, `battle-result.html`은 자체 주석에 "연결 아직
  안 됨"이라 적어두고 하드코딩된 `EXAMPLE_RESULT`로 대체 중. DB 대상 아님(예전
  결론과 동일).
- `battleSim_shopPurchased`(아이템별 누적 구매수량, stock 검사용)가 기존 이
  섹션 목록에 빠져있었음 — `shop_purchased` 테이블로 추가함.
- `battleSim_gold`의 기본값이 파일마다 500/0으로 갈려 있었음(hire.html·
  battle-view.html은 500, workshop.html·shop.html은 0) — 스키마의
  `profiles.gold` 기본값은 500으로 통일.
- **(2026-08-14 결정, 반영됨)** 캐릭터의 `equipment`(12슬롯)와
  `warehouse_items.held_by`가 "이 캐릭터가 이 장비를 장착 중"이라는 같은
  사실을 서로 다른 두 곳에 표현하던 문제(로컬스토리지 원본부터 이런
  구조)는 `warehouse_items.held_by`를 유일한 진실 공급원으로 삼는 것으로
  해결함 — `characters` 테이블에는 애초에 `equipment` 컬럼을 두지 않는다.
  "창고 화면에는 장착 중인 아이템을 보여줄 생각이 없다" 같은 화면별
  요구사항은 테이블 분리 이유가 아니라 조회 시점 필터(`held_by is null`
  vs `held_by = <character_id>`)로 처리한다는 게 사용자 판단 — 아이템을
  표기하는 모든 화면(창고/캐릭터 시트/강화소/공방 등)이 결국 같은
  테이블을 봐야 하므로, 두 곳에 진실을 나누면 동기화 버그 여지만 남는다는
  근거. `character-sheet.html` 등 프론트가 지금 `character.equipment`를
  직접 읽는 코드는 실제 마이그레이션(애플리케이션 레벨) 시 전부
  `warehouse_items` 조회로 바꿔야 함 — 아직 스키마만 반영된 상태.
- `feature_requests.html`이 지금은 admin 전용 페이지지만, 원래 설계 의도(전체
  유저가 보는 공용 게시판)에 맞춰 RLS는 "로그인 유저 전체 읽기"로 열어뒀다 —
  나중에 이 페이지를 일반 유저에게 공개하려면 애플리케이션 쪽 접근 제어만
  풀면 되고 스키마/RLS 변경은 불필요.

아래는 이 스키마를 만들기 전, DB 전환 자체를 검토하며 정리했던 원래 분류다
(위 실측 내용과 함께 참고할 것):

- **유저별 DB가 필요한 데이터**: `battleSim_roster`(캐릭터), `battleSim_gold`,
  `battleSim_warehouse`(미장착 장비/소재/파견 티켓 — 파견 티켓도 그냥 warehouse
  안의 아이템 하나로 취급됨, 별도 테이블 아님), `battleSim_hiredPoolIds`(고용
  중복방지), `battleSim_clearedBattles`/`battleSim_battleClearTimes`/
  `battleSim_battleAttemptTimes`(던전별 클리어여부·클리어시각·도전시각 — 세
  개를 `battle_progress(user_id, battle_id, ...)` 한 테이블로 합치는 게 자연스러움),
  `battleSim_lastTicketClaimAt`.
- **전역 콘텐츠 테이블(사용자별 아님, 관리자 권한)**: `battleSim_skillTable`/
  `jobTable`/`monsterRoster`/`shopTable`(기존 4개 에디터 산출물)에 더해
  **`battle-select.html`의 `BATTLE_THEMES`도 같은 그룹**(던전/전투 정의 —
  `web/battle-themes.js`로 분리함, 아래 참조). `requirements` 필드는 타입마다
  모양이 달라서(`clearedBattle`/`consumesItem`/`cooldownHours`/
  `attemptCooldownHours` 등) 정규화 컬럼보다 JSONB 한 덩어리가 실용적.
- **DB로 옮길 필요 없는 것**: `battleSim_lastResult`(sessionStorage, 전투→결과
  페이지 전달용 1회성 값), `battleSim_featureRequests`(전체 유저가 같은 목록을
  보는 공용 게시판 — user_id는 작성자 표시 정도로만 필요, 유저별로 나누는
  대상이 아님).
- **비동기 전환 필요**: 지금 `getX()/saveX()` 패턴은 전부 동기(`localStorage`는
  즉시 반환)고, 스크립트 최상단에서 `const jobData = getJobTable();` 식으로
  파싱 시점에 바로 읽는 코드가 많음. `fetch` 기반 API로 바꾸면 이 호출부들을
  전부 `await`/콜백 흐름으로 재구성해야 함 — 단순히 저장 함수 내부만 바꿔서
  끝나지 않음.
- **시딩 로직 이전**: `*_SEED_VERSION` 재시딩(페이지 로드마다 버전 비교 후
  재삽입)은 클라이언트 단일 저장소 전제 설계라, 서버 DB로 가면 "신규 계정
  생성 시 서버가 초기 데이터를 심는" 방식으로 완전히 옮겨야 함(그대로 재사용 불가).
- **해금 판정 위치 미정**: `isBattleUnlocked`가 전역 `requirements` 정의와
  유저별 `battle_progress`를 같이 봐야 계산됨. 클라이언트가 두 데이터를 받아
  직접 계산할지, 서버가 계산해서 "지금 열린 전투 목록"만 내려줄지는 API
  설계 시점에 정할 것 — 아직 미결정.

## API 단계에서 검증/방어가 필요한 지점 (아직 구현 안 함, 계속 추가할 것)

- **파견(`dispatch.html`) 보상 지급이 전부 클라이언트 계산 → 클라이언트가 그대로
  DB에 씀**: `applyRewards()`(dispatch.html:231)가 2000턴 예산 반복 시뮬레이션
  (`window.BattleAdapter.runBattle`을 클라이언트에서 직접 반복 호출)의 결과를
  그대로 exp/gold/warehouse에 반영함. 서버 DB로 가면 "클라이언트가 계산한 숫자를
  그대로 믿고 커밋"하는 구조가 되면 안 됨 — 시뮬레이션 자체를 서버에서 돌리거나,
  최소한 서버가 결과값의 상한(턴 예산·파티 구성 기준 최대 가능치)을 검증해야 함.
  `consumeTicket()`(티켓 차감)도 같은 요청 안에서 원자적으로 처리돼야 이중 사용을
  막을 수 있음.
- **파견 보상 나눗값의 근거 불균질**: `EXP_DIVISOR = 8`(경험치·골드 공용)은
  `dispatch.html:106~108` 주석에 실측 기반 역산 근거가 있음("2000턴 현지
  경험치 약 76,000 ÷ 8 ≈ 9,500 ≈ Lv10→15 필요량 13,210의 1.4장 분"). 하지만
  **골드는 경험치와 같은 변수를 재사용할 뿐 독립적인 근거가 없고**,
  `LOOT_DIVISOR = 100`은 "희귀 아이템은 직접 도전이 유리해야 한다"는 의도만
  적혀 있을 뿐 경험치처럼 "현지 수급량 ÷ 100 ≈ 목표치" 식의 역산이 없는 감으로
  정한 값. 서버가 보상의 타당성을 검증하려면(위 항목과 연결) 골드·전리품도
  경험치처럼 명시적인 목표치 기반 공식이 먼저 있어야 "이 결과가 정상 범위인지"
  판정할 수 있음 — 지금은 그 공식 자체가 없음.
  (참고: 나눗값 100은 그대로지만 **정산 방식은 2026-08-13에 확률적 반올림으로
  바뀜** — 아래 항목 참조. 서버 검증 로직을 짤 때 "결과가 정수 몫으로 딱
  떨어져야 한다"고 가정하면 안 됨.)
- **파견 전리품은 확률적 반올림이라 결과가 매번 다름**: `floor(raw/100)` 후
  나머지를 확률로 굴려 1개를 더 줄지 정함(`dispatch.html`의 `finalLoot`).
  같은 입력이라도 결과가 달라지므로, 서버가 "클라이언트가 보낸 전리품 수량"을
  재계산으로 1:1 대조하는 방식의 검증은 불가능함 — 기댓값 대비 상한/분포로
  판정해야 함.

## 검증 도구

```bash
node index.js                    # 엔진 스모크 테스트
node demo-<이름>.js               # 개별 메커니즘 결정적 검증
node simulate.js --runs 200      # 내장 샘플 매치업 확률적 시뮬
```

`simulate.js`의 `loadAdapterEnv({ skillTablePath })`는 실제 `web/battle-adapter.js`와
스킬 테이블을 vm 샌드박스에 얹어서, 브라우저 없이도 게임과 완전히 같은 경로로
캐릭터를 만들어 반복 시뮬을 돌릴 수 있게 해준다. 밸런스 조정 시 기본 도구.
