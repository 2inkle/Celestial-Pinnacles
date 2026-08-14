# Battle Sim Core

5대 스탯(힘/지능/민첩/속도/행운) + 패턴 슬롯 시스템 + DB 임포트 파이프라인을 갖춘
턴제 전투 시뮬레이션 코어입니다.

## 실행 방법

```bash
npm start
# 또는
node index.js
```

`node web/index.html` 대신, 브라우저 데모는 `web/index.html`을 더블클릭(또는 브라우저로 열기)해서 바로 확인할 수 있습니다. 별도 빌드나 서버가 필요 없습니다.

## 프로젝트 구조

```
project/
├── index.js              # Node 실행 데모 (DB 시드 -> 임포트 -> 전투 실행)
├── package.json
├── src/
│   ├── registries.js      # JobRegistry / ConditionRegistry / ActionRegistry
│   ├── character.js       # BattleCharacter (5대 스탯, effective/real 스탯 분리)
│   ├── resourceManager.js # FactionResourceManager (진영 공유 자원, 마법진 등)
│   ├── engine.js          # BattleEngine (1,000틱 시간축 + 속도 게이지 전투 진행)
│   ├── importer.js        # CharacterImporter / CharacterDataAdapter
│   └── mockDb.js          # 인메모리 Mock DB + 데모 시드 데이터
└── web/
    ├── index.html               # 브라우저 데모 (정보창 + 전투 로그, 별도 서버 불필요)
    ├── roster-index.html        # [UI 목업] 보유한 용병단을 보여주는 시작 페이지
    ├── character-sheet.html     # [UI 목업] 캐릭터 선택 시 이동하는 정보창(스탯/장비/패턴 빌더)
    ├── village.html             # [UI 목업] 마을 허브 — 상점/조합소(준비중)/고용소 진입점
    └── hire.html                # [UI 목업] 고용소 — 골드로 새 용병을 영입해 로스터에 추가
```

## UI 목업: 용병단 Index / 캐릭터 Sheet / 마을 / 고용소

`web/` 아래 목업 페이지들은 실제 게임 데이터(DB/임포터)에는 아직 연결되지 않은
**정적 UI 목업**이며, 모두 같은 폴더에 있어야 링크가 정상 동작합니다.

- 처음 진입하면 로스터는 **비어 있습니다**. `village.html → hire.html`(마을 → 고용소)에서
  용병을 골드로 고용해야 `roster-index.html`에 카드가 나타납니다.
- 로스터·골드는 브라우저 `localStorage`에 임시 저장되는 **데모용 상태**입니다(서버/DB 연동
  아님). 페이지를 새로고침해도 유지되지만, 다른 브라우저/기기에서는 공유되지 않습니다.
  `village.html` 하단의 "데모 데이터 초기화" 버튼으로 언제든 리셋할 수 있습니다.
- 캐릭터 정보창(`character-sheet.html`)의 스탯 배분·패턴 편집은 여전히 **화면 위에서만
  동작**하고 저장되지 않습니다(새로고침 시 초기화) — 로스터 보유 여부만 영속됩니다.
- 스탯은 **오로지 추가만 가능**(리스펙 없음), 파생 효과 수치는 표시하지 않음
- HP/SP는 최대치만 표기(현재값은 전투 중에만 의미가 있으므로 정보창에서는 생략)
- 패턴 빌더는 `IF <주어> <조건 종류> <비교> <수치> THEN <행동>` 형태로 줄 단위 추가/삭제/순서변경 가능
- 조건 종류는 `CONDITION_TYPES` 객체(`character-sheet.html`의 `<script>` 상단)에 정의되어
  있어, 새 조건을 추가할 때 이 객체에 항목 하나만 더하면 빌더 UI 전체에 자동 반영됩니다

### GitHub Pages로 실제 동작 확인하기

로컬 더블클릭 대신 온라인에서 확인하고 싶다면:

```bash
git init
git add .
git commit -m "feat: 용병단 Index / 캐릭터 Sheet UI 목업 추가"
git remote add origin <레포주소>
git push -u origin main
```

푸시 후 GitHub 저장소의 **Settings → Pages**에서 Source를 `main` 브랜치, 폴더를 `/root`
(또는 `/(root)`)로 지정하고 저장하면, 잠시 후 다음 주소에서 바로 열립니다.

```
https://<github-id>.github.io/<repo-이름>/web/roster-index.html
```

## 스탯 계층 구조 (중요)

`BattleCharacter`의 스탯은 세 계층으로 나뉩니다.

| 계층 | 기준 | 영향받는 것 |
|---|---|---|
| 전투 중 변동 (`effective*`) | realStat + bonusStat (버프/장비), 상하한 클램프 | 스킬 대미지 계수, 치명타율, 행동속도 |
| 전투 시작 시 고정 | realStat만 | `maxHp`, `maxSp` (전투 중 버프로 최대치 자체는 안 변함) |
| 정보창 전용 | realStat만 | `maxPatternSlots`, `weightCapacity` |

## 패턴 슬롯 & 임포트 규칙

- 캐릭터가 실제로 보유할 수 있는 패턴은 DB에 최대 20줄까지 저장 가능 (프리셋별로 분리).
- `CharacterImporter.importCharacter()`는 캐릭터를 만든 직후 `character.maxPatternSlots`
  (INT 스탯 기반)를 계산해서, **그 개수만큼만** 패턴을 잘라 싣습니다.
- 즉 DB에는 초과분이 그대로 남아있고, 나중에 INT가 올라 슬롯이 늘어나면 자동으로
  다음 줄이 활성화됩니다. 전투 엔진(`executeAction`) 안에는 절대 "죽은 패턴"이
  존재하지 않습니다.
- 등록되지 않은 조건(`cond`)/행동(`act`) 키가 섞여 있어도 해당 줄만 건너뛰고,
  전체 임포트가 실패하지 않습니다.

## DB 스키마 (Mock, `src/mockDb.js`)

실제 서비스에서는 SQL/NoSQL로 교체되는 걸 가정하고 인터페이스를 맞춰뒀습니다.

- `characters` — user_id, name, side, real_str/int/dex/spd/luk (진행도 원본)
- `items` — 아이템 마스터 데이터 (밸런스 패치 시 여기 한 줄만 수정하면 전체 반영)
- `character_equipment` — 캐릭터-아이템 참조 (스탯 복제 없이 참조만)
- `pattern_presets` — 캐릭터당 여러 프리셋 ("보스전용", "파밍용" 등)
- `pattern_slots` — 프리셋에 속한 실제 패턴 줄 (slot_order로 우선순위 명시)

## 다음 단계 후보

- 버프/디버프 시스템 (currentHp가 새 maxHp보다 커지는 경우의 클램프 처리 포함)
- 스킬별 계수 스탯 다양화 (물리=STR, 마법=INT, 손기술=DEX 등 태그 방식)
- 실제 DB 연동 (`mockDb.js`의 함수 시그니처를 유지한 채 내부 구현만 교체)
- 리스펙(스탯 재분배) 시 패턴 슬롯 자동 확장 시나리오 테스트
