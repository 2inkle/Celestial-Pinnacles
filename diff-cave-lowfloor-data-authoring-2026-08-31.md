# diff-cave-lowfloor-data-authoring-2026-08-31.md — 동굴 1~4층(A~I) 실제 데이터 작성 (2026-08-31)

⚠ 새 명명 규칙 실천(브랜치 고유 파일명). 병합 검토 끝나면
`git rm diff-cave-lowfloor-data-authoring-2026-08-31.md`로 제거 권장.

- **기준 브랜치**: `main`(커밋 `5fb5d37`, 드리프트 없음)
- **작업 브랜치**: `cave-lowfloor-data-authoring-2026-08-31`(7개 커밋:
  `0f0a739` initBonusDef 엔진 개편 아이디어 기록, `1bccdce` 동굴 1~4층
  실제 데이터 작성 본체, `00fe39b` 본 companion 문서, `d4d14fa` 게이팅
  되돌림, `4b093de` companion 갱신, `64b22bf` 게이팅 최종 확정("동굴
  N층 지도"), `2bae660` 상점 판매 기능 신설 — 아래 "게이팅 최종 확정"/
  "상점 판매 기능" 항목 참고)
- **변경 파일**: `CLAUDE.md`, `supabase/migrations/0025_add_cave_floor_
  monsters.sql`(신규, **아직 미실행**), `web/battle-themes.js`,
  `web/battle-encounters.js`, `web/material-table.js`, `web/shop.html`

## 배경 요약

동굴(1티어 던전) 1~4층 사슬형 몬스터 체인(러프 스탯표는 2026-08-24에
이미 확정)의 실제 이름·스킬·드랍테이블·게이팅을 작성하는 작업.
진행 중 두 가지 중요한 설계 논의가 있었음:

1. **"가장 약한 공격" 기준 확정 및 재계산**: 러프 스탯표의 HP(1,800~
   5,000)/realDef(10~25)를 그대로 쓰면, "1차 전직·상점제+6 장비·전직
   직후 배우는 최하위 스킬"(사용자 확정 기준)만으로도 raw≈15,000의
   공격이 나와 저층 몬스터가 전부 한 방에 죽는 문제가 발견됨(계산
   근거는 CLAUDE.md 본문 참고 — `computeSkillPower`/`dampDamageStat`/
   +6 강화 `statMultiplier` 등 실제 공식으로 검증).
2. **`initBonusDef` 엔진 개편 아이디어**: "HP보다 방어력/bonusDef를
   올려 디버프의 가치를 체감시키자"는 사용자 제안을 따라가다가,
   `bonusDef` 상한이 `realDef×4`(500% 클램프)로 realDef에 종속돼
   있어서 raw 15,000 규모에는 구조적으로 무력하다는 한계를 발견함.
   `initBonusDef`(bonusDef 변동 범위를 realDef가 아닌 자기 자신의
   별도 기준치로 클램프)라는 엔진 개편 아이디어를 사용자가 제시했으나,
   `calculateEffectiveStat`은 게임 전체가 공유하는 핵심 공식이라
   `simulate.js` 검증 없이는 위험 — **이번 세션엔 기록만, 미적용**.
   (CLAUDE.md "[고려 단계] `initBonusDef`" 섹션 참고)

**당장의 진행 방식(사용자 확정)**: 엔진 개편을 기다리지 않고, 이름/
패턴/드랍테이블/게이팅처럼 개편과 무관한 부분은 이번에 확정하고,
HP/realDef만 임시로 기존 공식(HP 4~9배, realDef 3~4배 상향)을 써서
채워둠 — `initBonusDef`가 실제 반영되면 재조정 대상.

## 이번에 실제로 만든 것

- **몬스터 9종**(A~I, 전부 새 id `cave_*`) — 이름/포트레이트/스탯/
  패턴/드랍테이블까지 전부 확정. HP/realDef 상세 표는 CLAUDE.md 참고.
- **신규 스킬 12종** — 새 job 버킷 `jobSkills."동굴 몬스터"`에 추가
  (실제 PC 직업이 아니라서 어떤 플레이어 스킬 목록에도 안 뜸 — 조사
  완료). 자기강화 4종은 boss 재설계와 같은 메커니즘
  (`combatStatUpPercent`, stat `def`) 재사용.
- **게이팅**: `caveTier1` 테마 + `cave-floor-1`~`cave-floor-4` 전투,
  `clearedBattle`(이전 층 클리어)로만 순서 진행. **아이템 게이팅은
  차후로 미룸**(아래 "게이팅 되돌림" 참고 — 처음엔 `hasItem` 조합과
  열쇠 아이템 4종까지 만들었다가 사용자 정정으로 되돌림).
- **신규 재료**: "철광석"/"정동석" (`web/material-table.js`).

## 게이팅 되돌림 (4번째 커밋, `d4d14fa`)

3번째 커밋(companion 문서 최초 작성)까지는 `cave-floor-2`~`4`에
`hasItem`(열쇠 아이템 소지) 요구조건을 걸고, B/D/F/H 몬스터
드랍테이블에 "무너진 통로의 흔적"/"갈라진 균열의 표식"/"무너지는
천장의 파편"/"지진의 전조" 4종을 임의로 만들어 넣었었음. 사용자가
정정: **"게이팅은 차후 실행한다. 어차피 1층부터 5층까지 랜덤하게
드랍되는 아이템을 통해 다음 계층으로 진입한다는 아이디어만 있고,
거기까지 가는 데에 필요한 아이템은 만들지 않았으니."** — 즉 최초
컨셉(2026-08-17, "동굴 — 다단계 + 저확률 열쇠 게이팅")에 아이디어만
있었을 뿐 실제 아이템은 확정된 적이 없었는데, 이번에 그 확정 안 된
부분을 임의로 채워 넣은 것이었음. 전부 되돌림:
- `web/battle-themes.js`: `hasItem` 요구조건 제거, `clearedBattle`만
  남김.
- `supabase/migrations/0025_...sql`: 드랍테이블에서 열쇠 아이템 4종
  전부 제거.
- `CLAUDE.md`: "게이팅은 이번 범위 밖 — 열쇠 아이템은 아직 '만들지
  않음'" 섹션으로 경위를 기록, 다음 세션 TODO에 "열쇠 게이팅 실제
  설계"를 별도 항목으로 추가.

## 게이팅 최종 확정 (6번째 커밋, `64b22bf`)

되돌린 직후 사용자가 실제 설계를 확정함: **"각 층에서만 등장하는
몬스터에게 동굴 (n)층 지도 아이템을 만들고, cave-floor 2~5에 has item
조건만 남겨둘 것."**
- "층 전용 몬스터" = 이월 안 되는 필러 슬롯(C/E/G/I — 컨셉표의 "N층
  필러" 라벨과 정확히 일치). C(동굴박쥐)→"동굴 1층 지도", E(동굴곰)→
  "동굴 2층 지도", G(동굴트롤)→"동굴 3층 지도", I(수정골렘)→"동굴 4층
  지도"(전부 드랍확률 0.15).
- `web/battle-themes.js`: `cave-floor-2`~`5` 요구조건을 `hasItem`
  하나로 단순화(`clearedBattle` 제거). `cave-floor-5`는 몬스터 데이터가
  아직 없어 이름을 "동굴 심층(미정)"으로 두고 요구조건만 미리 걸어둠.
- `supabase/migrations/0025_...sql`: C/E/G/I 드랍테이블에 각자의 지도
  추가.

## 상점 "판매" 기능 신설 (7번째 커밋, `2bae660`)

별개 요청(사용자): "나중을 위해 상점에 아이템 판매 기능을 넣어두고
싶다. 판매금액을 세세히 정해둘 생각은 없고, 온전히 희귀도에 따라
판매가를 정할 생각이다." `web/shop.html`(구매 로직이 이미 실제
`warehouse_items`/`profiles.gold`를 직접 갱신하는 살아있는 코드)에
직접 구현:
- 희귀도 5단계(common/uncommon/rare/epic/legendary, 각 10/40/150/
  500/1500G — 러프한 초기값).
- `inferRarity(item)`: `material`은 `MATERIAL_TABLE[name].rarity`
  참고(이번에 돌/광석/나무=common, 철광석=uncommon, 정동석=rare로
  태깅), `equipment`는 `weight`를 대리 지표로 사용(0→common,
  4 이상→legendary), `keyItem`/`stash`는 판매 대상에서 제외.
- UI: "🛒 구매"/"💴 판매" 모드 탭 신설, 판매 화면은 `warehouse_items`를
  직접 나열(행마다 수량+판매 버튼, 장바구니 없음).
- `sellItem()`: `warehouse_items.quantity` 차감(0이면 행 삭제)+
  `profiles.gold` 증가 — `confirmPurchase`의 반대 패턴 재사용.
- ⚠ Node.js 없어 `<script>` 블록 중괄호/소괄호 개수 대조(269/269,
  390/390)로만 확인 — **실제 브라우저 왕복 테스트는 다음 세션 과제**.

## ⚠ 중요 — 마이그레이션 파일은 아직 실행 안 됨

`web/monster-roster.html`의 `LEGACY_MONSTER_SEED`와 `skill-table.json`은
**둘 다 런타임에서 전혀 참조되지 않는 죽은 데이터**임을 조사로 확인함
(`monster-roster.html`은 Supabase `game_content`를 직접 읽는 읽기 전용
관리자 뷰어로 바뀐 지 오래고, 파일 자체에 "라이브 보스 스탯 누락
사고" 이후 "SQL 마이그레이션으로만 반영"하기로 했다는 주석이 남아
있음). 그래서 이번 몬스터/스킬 데이터는 **로컬 파일을 고치지 않고**
`supabase/migrations/0025_add_cave_floor_monsters.sql`만 새로 작성함 —
**주 워크스테이션 또는 Supabase 콘솔에서 이 마이그레이션을 직접
실행해야 실제 게임에 반영됨**(0024 때와 동일한 패턴). 반면
`web/battle-themes.js`/`web/battle-encounters.js`/`web/material-table.js`/
`web/shop.html`은 DB가 아니라 저장소의 정적 JS/HTML 파일 자체가
런타임 소스라 이번에 직접 커밋함 — 이 파일들은 병합만 되면 바로
반영됨(상점 판매 기능도 포함).

## 병합 전 체크리스트

- [ ] `supabase/migrations/0025_add_cave_floor_monsters.sql`의 JSON
      블록이 유효한지(이 세션엔 Node.js가 없어 `JSON.parse`로 직접
      검증 못 함 — 육안 확인만 함) 한 번 더 확인
- [ ] `jsonb_set` 경로 `'{jobSkills,"동굴 몬스터"}'` — 공백 포함
      키라 큰따옴표로 감싼 것 확인(감싸지 않으면 Postgres 배열 리터럴
      파싱 오류)
- [ ] 마이그레이션을 실행하기 전, `game_content` 테이블에 `key='
      skillTable'`/`key='monsterRoster'` 행이 실제로 존재하는지 확인
      (`jsonb_set`/`||`는 기존 행이 없으면 아무 것도 안 함 — insert가
      아니라 update라서)
- [ ] 실행은 **한 번만** — `monsterRoster` 쪽은 배열 연결(`||`)이라
      재실행하면 9종이 중복으로 또 추가됨
- [ ] `web/battle-themes.js`/`web/battle-encounters.js`가 참조하는
      `monsterId`(`cave_boulder_beetle` 등)가 마이그레이션 실행 후
      실제로 `monsterRoster`에 존재하는지 확인(마이그레이션 미실행
      상태에서 이 두 파일만 먼저 병합되면, 존재하지 않는 몬스터를
      참조하는 전투가 됨 — `buildEnemyFromMonsterKey`가 콘솔 에러만
      내고 조용히 건너뛰므로 크래시는 안 나지만 전투에 몬스터가 덜 나옴)
- [ ] `web/battle-themes.js`의 `cave-floor-2`~`5`가 `hasItem`(동굴 N층
      지도)만 요구하는지, `clearedBattle`이 안 남아있는지 확인
- [ ] `web/shop.html`의 "판매" 탭을 실제 브라우저에서 열어 창고 아이템이
      뜨는지, 판매 후 골드/창고 수량이 정확히 갱신되는지, 열쇠
      아이템(동굴 N층 지도 등)이 목록에서 빠지는지 확인(이 세션은
      Node.js가 없어 브레이스/괄호 개수 대조만 했음 — 실제 실행 검증
      안 됨)

## 병합 방법

```bash
git fetch origin
git show origin/cave-lowfloor-data-authoring-2026-08-31:CLAUDE.md | head -200   # 새 섹션 확인
git merge origin/cave-lowfloor-data-authoring-2026-08-31
git rm diff-cave-lowfloor-data-authoring-2026-08-31.md
git commit
# 병합 후: supabase/migrations/0025_add_cave_floor_monsters.sql을
# Supabase에 직접 실행해야 실제 반영됨(마이그레이션 파일 자체는
# git 병합만으로는 DB에 아무 영향 없음).
```

## 전체 diff

⚠ 아래 diff는 3번째 커밋(`00fe39b`) 시점 기준이라, 4번째 커밋
(`d4d14fa`, "게이팅 되돌림")의 `hasItem`/열쇠 아이템 4종 제거분은
반영돼 있지 않음 — 병합 전에 반드시 저장소의 `web/battle-themes.js`
`cave-floor-2`~`4`와 `supabase/migrations/0025_...sql`의 B/D/F/H
드랍테이블을 직접 열어 최신 상태(열쇠 아이템 없음)를 확인할 것.

```diff
diff --git a/CLAUDE.md b/CLAUDE.md
index f78be45..f796977 100644
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -72,6 +72,66 @@ MDEF=200)에게는 방어관통을 가진 스킬/장비가 문자 그대로 아
 - 방어관통이 real만 깎는지, 혹시 필요하면 %기반 관통(예: "방어력
   30% 무시")도 별도로 둘지.
 
+## [고려 단계] `initBonusDef` — bonusDef 상한을 realDef에서 분리하는 엔진 개편 (2026-08-31)
+
+**배경**: 동굴 1~4층(A~I) 몬스터의 "내구력"을 설계하다가(아래 동굴
+저층 실제 데이터 작성 섹션 참고), "체력을 무식하게 올리기보단 방어력
+(realDef)과 bonusDef를 올려서 '방어력 높은 적' 자체를 체감시키고,
+디버프로 그 방어력을 깎아내는 재미를 주는 게 낫지 않냐"는 사용자
+제안이 나옴 — 동굴 보스 재설계(위 "P0 밸런스 리스크" 섹션)에서 이미
+써먹은 "자기강화로 bonusDef가 치솟는 걸 보고 디버프 필요성을 깨닫는다"
+교훈을 저층 몬스터에도 확장하려는 의도.
+
+**코드로 확인한 한계**: 지금 구조에서 `bonusDef`의 유효 상한은
+`realDef×4`(500% 클램프, `calculateEffectiveStat`)로 **realDef에
+종속**돼 있다. 이번 기준 공격(가장 약한 공격, 아래 섹션 참고)의 raw가
+이미 15,000 수준이라 재계산해보면:
+- `realDef`를 낮게(30~50) 두면 1단계(퍼센트 경감) 통과 후 남는 양이
+  7,500~10,500인데, `bonusDef` 상한은 겨우 120~200 — 전체의 2~3%만
+  깎아서 디버프로 벗겨낼 만한 "체감되는 방어력"이 사실상 안 생김.
+- `realDef`를 90 근처까지 올리면 1단계에서 이미 **무조건 10% 관통
+  하한**(raw×0.1)에 근접/도달해버리는데, 이 하한은 무조건 적용이라
+  그 이후 `bonusDef`를 아무리 쌓아도 최종 데미지가 더 안 줄어듦 —
+  bonusDef가 커질 체급(realDef×4)을 가지려면 realDef를 높여야 하는데,
+  그 지점에 도달하면 이미 하한선 때문에 bonusDef의 효과가 화면상
+  안 보이게(무의미하게) 됨.
+
+**결론(사용자 지적)**: "realDef 기반 퍼센트 공식에 bonusDef 상한을
+묶어두는 구조 자체가 문제다. raw 데미지가 지금은 만 단위지만 나중엔
+수십만 단위로 뛸 수 있는데, 그걸 0~100 사이에 갇힌 낮은 방어력
+수치로 잡아내려 한 게 애초에 잘못된 접근이었다."
+
+**제안된 개편 방향**: 몬스터(또는 캐릭터)에 `initBonusDef`라는 별도
+필드를 신설 — bonusDef의 변동 범위를 `realDef×[0.5, 5]`가 아니라
+**`initBonusDef×[0.5, 5]`처럼 그 자신만의 독립된 기준치**로 클램프.
+이러면 bonusDef의 "체급"이 realDef(0~100 사이에 사실상 갇혀 있는
+퍼센트 경감용 수치)와 완전히 분리되어, raw 데미지가 앞으로 아무리
+커져도 `initBonusDef`만 그에 맞게 올려주면 되고, 디버프(50%까지
+축소)/자기강화(500%까지 확대) 둘 다 raw 규모와 무관하게 항상 유의미한
+폭을 가짐.
+
+**적용 범위(미정, 다음 세션 확인 필요)**: 이 개편이 DEF/MDEF에만
+적용되는지, 아니면 ATK/MATK/STR 등 나머지 real/bonus 쌍에도 같은
+철학(예: `initBonusAtk`)을 확장할지는 아직 정해지지 않음 — 이번엔
+"DEF 쪽 문제를 풀다가 나온 아이디어"로만 기록.
+
+**미적용 이유·다음 단계**: `calculateEffectiveStat`은
+`src/character.js`의 모든 real/bonus 스탯 쌍(STR/INT/DEX/SPD/LUK/
+ATK/MATK/DEF/MDEF)이 공유하는 핵심 공식이라, 잘못 건드리면 동굴뿐
+아니라 게임 전체 밸런스가 조용히 깨질 수 있음 — 위 "방어력 공식
+개편(`100/(100+D)`)"과 정확히 같은 성격의 위험이라 **같은 이유로
+이번 세션엔 미적용**. `simulate.js`가 있는 환경(주 워크스테이션)에서
+두 개편(방어관통 D값 차감 + `initBonusDef`)을 함께 설계·검증하는 걸
+권장 — 서로 같은 방어력 파이프라인을 건드리는 변경이라 따로 하면
+두 번 손댈 여지가 큼.
+
+**당장의 진행 방식(사용자 확정)**: 동굴 1~4층(A~I) 실제 데이터 작성은
+멈추지 않고, 이름/패턴/드랍테이블 등 이 엔진 개편과 무관한 부분부터
+먼저 확정 — HP/realDef 수치만 **임시로 기존 공식(realDef 상향 + 모대
+HP 증량)**을 써서 채워두고, `initBonusDef` 엔진 변경이 실제로
+반영되면 그때 수치만 재조정하기로 함(아래 "동굴 저층 실제 데이터
+작성" 섹션 참고).
+
 ## 몬스터 드랍 개조 아이템 "[몬스터명]의 카드" 컨셉 확정 — 순수보너스, 범용장비, 세트효과 없음 (2026-08-25)
 
 방어력 공식 개편(별도 브랜치 `defense-formula-consideration-2026-08-25`,
@@ -1209,6 +1269,143 @@ Node.js가 없어 실제 실행은 못 함** — 주 워크스페이스에서
 `web/material-table.js` 실제 데이터 작성. 방어력 공식 재검토
 아이디어도 `simulate.js` 있는 환경에서 검토 대상.
 
+## 동굴 1~4층(A~I) 실제 데이터 작성 — 내구력은 HP+realDef 임시 상향, initBonusDef 개편 후 재조정 예정 (2026-08-31)
+
+### 배경 — "가장 약한 공격" 기준 확정과 내구력 재계산
+위 "러프 스탯표"의 HP(1,800~5,000)/realDef(10~25)를 그대로 실제
+데이터로 옮기기 전에, 사용자가 "raw 데미지(몬스터가 내는 공격력)는
+이미 승인됐지만, 반대로 플레이어가 이 몬스터들에게 가하는 '가장 약한
+공격'한 방에 몬스터가 즉사하는 문제"를 지적함 — 층을 거치며 패턴을
+학습시키고 다음 층으로 넘어간다는 설계 의도 자체가 무너진다는 것.
+
+**"가장 약한 공격" 기준(사용자 확정)**: "1차 전직, 상점제 장비 +6,
+전직을 진행하자마자 배울 수 있는 낮은 수준의 스킬" — +6 강화는
+`successRate(6)=1.0`(`web/refinery.html`)이라 100% 안전하게 도달할 수
+있는 "초저자본 빌드의 기본"이라는 근거.
+
+**실제 계산**(스나이퍼, Lv15, "Power Shoot" — `requiredLevel:15`,
+`requiredSkills` 없어서 전직 즉시 배움, `coefficient:8.5`):
+- 장비: 합성궁(`combatReal.atk:48`)+화살통(`combatReal.atk:15`), +6
+  강화 시 `statMultiplier(6)=1.144`(레벨 8 미만이라 `statBonusPerStat`
+  추가분 없음) → realAtk = round(48×1.144)+round(15×1.144) =
+  55+17 = **72**(`web/battle-adapter.js`의 `sumEquipmentCombatStats`
+  확인 — `combatReal.atk`는 real.atk로 들어가고, `hasHandGear`면
+  맨주먹 보정 없이 그대로 realAtk가 됨).
+- DEX: Lv15까지 쌓은 스탯포인트 `(15-1)×5=70`(`character-sheet.html`
+  `STAT_POINTS_PER_LEVEL`) 중 절반(이전 세션 둠로드 예시와 같은 투자
+  비율)을 투자 → realDex=45.
+- `computeSkillPower`(`src/combatFormulas.js`) = effectiveAtk(72) ×
+  `dampDamageStat`(effectiveDex=45)(≈24.66) × coefficient(8.5) ≈
+  **raw 15,000**.
+
+### 방어력만으로 버티려던 첫 시도 — bonusDef 상한의 한계 발견
+사용자가 "HP를 무식하게 올리기보단 realDef/bonusDef를 올려서 '방어력
+높은 적' 자체와 디버프의 가치를 체감시키는 게 낫다"고 제안 → 재계산
+결과 이번 raw(15,000) 규모에서는 `bonusDef` 상한(`realDef×4`, 500%
+클램프)이 구조적으로 너무 작아(realDef 30~50에서 상한 120~200 —
+전체의 2~3%) 디버프로 벗겨낼 만한 "체감되는 방어력"이 안 생기고,
+realDef를 90 근처까지 올리면 이미 무조건 10% 관통 하한에 도달해
+`bonusDef`가 완전히 무의미해짐(자세한 계산은 위 "[고려 단계]
+`initBonusDef`" 섹션 참고). 사용자가 이 한계 자체를 "realDef에
+bonusDef 상한을 묶어두는 구조가 문제"로 재정의하고 `initBonusDef`
+엔진 개편 아이디어를 제안 → 그 섹션에 별도 기록, 이번 세션엔 엔진
+변경 미적용.
+
+### 이번 데이터 작성의 임시 조치(사용자 확정) — 이름/패턴/드랍은 확정, HP/realDef만 나중에 재조정
+"`initBonusDef` 반영을 기다리지 않고, 이름·패턴·드랍테이블 등 엔진
+개편과 무관한 부분부터 먼저 확정하고, HP/realDef 수치만 임시로 기존
+공식(realDef 상향 + 모대 HP 증량)을 써서 채워둔다"로 진행. 즉 raw
+데미지(ATK/계수/히트수)는 러프 스탯표의 승인된 값을 그대로 두고,
+HP는 기존 대비 약 4~9배, realDef는 약 3~4배 상향:
+
+| 슬롯 | 이름 | HP(기존→적용) | realDef(기존→적용) | ATK/계수/히트(불변) | 자강화 |
+|---|---|---|---|---|---|
+| A 바위딱정벌레 | 베이스라인 | 3000→18,000 | 15→70 | 20 / 1.2×1 | ✗ |
+| B 가시바위게 | 약한 자강화(DEF) | 3200→24,000 | 18→60 | 18 / 1.1×1 | ✓(2회, def+40%) |
+| C 동굴박쥐 | 필러(저HP) | 1800→22,000 | 10→50 | 15 / 1.0×1 | ✗ |
+| D 낙석귀 | Invalid 단일(약함) | 3400→21,000 | 18→65 | 16 / 1.0×1 | ✗ |
+| E 동굴곰 | 필러(2층) | 3600→17,000 | 20→72 | 24 / 1.3×1 | ✗ |
+| F 종유석파괴자 | 다단히트+자강화 | 4000→26,000 | 20→65 | 20 / 0.5×6, 명중≈20% | ✓(2회, def+50%) |
+| G 동굴트롤 | 필러(저층 최강) | 4200→16,500 | 22→78 | 30 / 1.4×1 | ✗ |
+| H 대지정령 | Enemy-All+잦은 자강화 | 5000→19,000 | 25→68 | 18 / 0.7×1(전체) | ✓(2턴마다, def+35%) |
+| I 수정골렘 | Invalid+가끔 자강화 | 4800→19,000 | 24→75 | 35 / 1.5×1, postDelay 60(2~3배) | ✓(HP≤60%, def+60%) |
+
+**이 표의 HP/realDef는 확정치가 아님** — `initBonusDef` 엔진 개편이
+반영되면 재조정 대상(위 "[고려 단계] `initBonusDef`" 섹션과 연동해
+다시 볼 것). 이름·패턴·드랍테이블·게이팅 구조는 이번에 확정.
+
+### 실제 반영 방법 — `web/monster-roster.html`/`skill-table.json`은 죽은 데이터, DB 마이그레이션으로만 반영
+조사 결과 두 파일 모두 **런타임에 전혀 참조되지 않는 읽기 전용
+뷰어/죽은 데이터**임이 확인됨:
+- `web/monster-roster.html`의 `LEGACY_MONSTER_SEED`: "더 이상 아무
+  코드에서도 참조하지 않음(런타임 죽은 데이터) — 새 몬스터/패턴을
+  설계할 때 참고용 초안으로만 남겨둠"이라고 파일 자체에 명시돼 있음.
+  실제로는 `sbClient.from("game_content").select(...).eq("key",
+  "monsterRoster")`로 Supabase에서 직접 읽어옴(관리자 전용 읽기 전용
+  뷰어). 사용자가 "라이브 보스 스탯 누락 사고"를 직접 겪은 뒤 "실
+  데이터 반영은 SQL 마이그레이션으로만 하는 게 안전"이라고 결정해둔
+  상태(주석에 남아있음).
+- `skill-table.json`도 이전 세션에 이미 "라이브는 Supabase
+  `game_content.skillTable` DB에만 있고 이 파일은 죽은 참고용 사본"
+  으로 확인된 바 있음(같은 결론 재확인).
+
+그래서 이번 데이터는 **`supabase/migrations/0025_add_cave_floor_
+monsters.sql`** 신규 마이그레이션으로 작성함(아직 미실행 — 다음에
+Supabase에 직접 적용해야 실제 게임에 반영됨, "0024" 때와 같은
+패턴). 기존 데이터를 안 건드리기 위해 전체 교체가 아니라:
+- `skillTable`: `jsonb_set(data, '{jobSkills,"동굴 몬스터"}', ..., true)`
+  로 **새 job 버킷 하나만 추가**(기존 job은 전혀 안 건드림). "동굴
+  몬스터"는 실제 PC 직업이 아니라서(`job-table-editor.html`의
+  advancement 트리에 없음) 어떤 플레이어의 스킬 목록에도 노출되지
+  않음(`character-sheet.html`이 `SKILL_TABLE[캐릭터.job]`으로 자기
+  직업만 봄) — 그런데도 `allSkillsFromTable()`(jobSkills 전체 평탄화)
+  이 이름으로 찾아주므로 몬스터 패턴 액션으로는 정상 작동.
+- `monsterRoster`: `data || '[...]'::jsonb` 배열 연결로 **9종을 뒤에
+  이어붙임**(기존 몬스터는 전혀 안 건드림). 재실행하면 중복 추가되니
+  한 번만 실행할 것.
+
+새로 추가한 스킬 12종(무거운 강타/가시 강화/가시 찌르기/할퀴기/
+돌팔매/몸통 박치기/무너지는 종유석/굳은 돌가죽/짓밟기/지진/대지의
+축복/수정 낙하/결정화 — 자강화는 전부 `combatStatUpPercent` stat
+"def"로 boss 재설계와 같은 메커니즘), F의 "무너지는 종유석"(다단히트
++초저명중)은 스킬이 아니라 F 몬스터의
+`passiveMods.accuracyBonusPct:-70`으로 구현(2026-08-24 컨셉 확정 시
+검토된 방식 그대로).
+
+### 게이팅 + 신규 재료 — `web/battle-themes.js`/`web/battle-encounters.js`/`web/material-table.js`(실제 코드, 직접 반영됨)
+이 세 파일은 (skillTable/monsterRoster와 달리) **DB가 아니라 저장소의
+정적 JS 파일 자체가 런타임 소스**라서 이번에 직접 수정·커밋함(마이그레이션
+아님):
+- `web/battle-themes.js`: 새 테마 `caveTier1`("축축한 동굴") + 전투
+  4개(`cave-floor-1`~`cave-floor-4`) 추가. 2~4층은 `goblin-fortress`의
+  `clearedBattle`+`hasItem` 조합 패턴을 그대로 재사용해 게이팅
+  (이월 축 몬스터가 드랍하는 열쇠 아이템 필요) — 5층(보스/AFTERMATH)은
+  이번 범위 밖, 다음 단계에서 추가.
+- `web/battle-encounters.js`: `BATTLE_MONSTER_POOLS`에 4개 층 몬스터
+  풀 추가(매 층 3종, 이전 층 이월 축 재사용 — 컨셉 표 그대로).
+- `web/material-table.js`: `MATERIAL_TABLE`에 "철광석"/"정동석" 플레이버
+  등록(제작 레시피(`RECIPE_TABLE`)는 "다음 파밍 단계로 이어지는
+  떡밥"이라 이번엔 등록 안 함 — 컨셉 확정 때부터 다음 단계로 남겨둔
+  항목).
+
+열쇠 아이템(전부 `category:"keyItem"`): "무너진 통로의 흔적"(B 드랍,
+1→2층), "갈라진 균열의 표식"(D 드랍, 2→3층), "무너지는 천장의
+파편"(F 드랍, 3→4층), "지진의 전조"(H 드랍, 4→5층 — 5층 자체는 아직
+없어서 당장은 못 씀, 다음 단계 대비 미리 심어둠).
+
+### 다음 세션에서 이어갈 것
+1. **`supabase/migrations/0025_add_cave_floor_monsters.sql` 실제 실행**
+   (주 워크스테이션 또는 Supabase 콘솔에서) — 실행 전까지는 라이브
+   게임에 전혀 반영 안 된 상태.
+2. `simulate.js`로 이번 HP/realDef 수치의 실제 승률/체감 검증.
+3. `initBonusDef` 엔진 개편(위 섹션)이 반영되면 이 9종의 HP/realDef를
+   그에 맞춰 재조정 — bonusDef 기반으로 옮겨가면 HP는 오히려 지금보다
+   낮춰도 될 가능성이 큼.
+4. 5층(보스/AFTERMATH) `battle-themes.js`/`battle-encounters.js` 항목
+   추가 — 보스 자체 스탯(HP52,000/DEF35)은 이미 확정돼 있으니
+   (`cave-boss-balance-risk-p0-2026-08-25`) 몬스터 데이터 마이그레이션과
+   게이팅 연결만 남음.
+
 ## 개조된 장비가 상점 구매/전리품과 잘못 합쳐지던 버그 — 3곳에 동일 패턴 (2026-08-22)
 
 **증상(사용자 신고)**: "왕관 조각 개조가 된 모자를 하나 가지고 있었다.
diff --git a/supabase/migrations/0025_add_cave_floor_monsters.sql b/supabase/migrations/0025_add_cave_floor_monsters.sql
new file mode 100644
index 0000000..0f5b1cc
--- /dev/null
+++ b/supabase/migrations/0025_add_cave_floor_monsters.sql
@@ -0,0 +1,84 @@
+-- ============================================================================
+-- 동굴(1티어 던전) 1~4층 실제 데이터 추가 — 사슬형 몬스터 체인(A~I)
+--
+-- 배경: CLAUDE.md "동굴(1티어 던전) — 사슬형 몬스터 체인 컨셉 확정"
+-- (2026-08-24)에서 러프 스탯표만 확정해뒀던 것을, "동굴 저층 실제 데이터
+-- 작성"(2026-08-31)에서 실제 이름·스킬·드랍테이블까지 확정해 이번에 반영함.
+--
+-- 내구력 설계 방향(사용자 확정): raw 데미지(ATK/계수/히트수)는 이미 승인된
+-- 값이라 그대로 두고, HP와 realDef만 상향해서 "가장 약한 공격 한 방에도
+-- 죽지 않고 패턴을 보여준다"는 목표를 맞춤. 원래는 realDef+bonusDef 조합
+-- (자기강화 슬롯에 한정)만으로 풀려고 했으나, 기준 공격(raw≈15,000, Lv15
+-- 1차 전직+상점제+6 스나이퍼의 최하위 스킬 기준)이 bonusDef의 유효 상한
+-- (realDef×4, 500% 클램프)보다 훨씬 커서 그 방식만으론 부족함이 드러남
+-- (CLAUDE.md "[고려 단계] initBonusDef" 섹션 참고 — bonusDef 상한을
+-- realDef에서 분리하는 엔진 개편은 다음 세션 simulate.js 환경에서 검증
+-- 예정). 이번엔 그 개편 전 임시 조치로 HP도 함께 상향(기존 대비 4~9배)해
+-- 메꿈 — engine 개편이 반영되면 이 마이그레이션의 HP/realDef 값은
+-- 재조정 대상.
+--
+-- 자기강화(combatStatUpPercent, stat:def)는 boss 재설계(2026-08-25,
+-- "P0 밸런스 리스크" 섹션)에서 이미 검증한 것과 같은 메커니즘 재사용 —
+-- realDef<100 유지 원칙을 그대로 지킴(B/F/H/I 전부 realDef 60~75,
+-- 100 미만).
+--
+-- 신규 스킬은 실제 PC 직업(전사/마법사/...)이 아니라 "동굴 몬스터"라는
+-- 몬스터 전용 job 버킷에 넣음 — allSkillsFromTable()이 jobSkills 전체를
+-- 평탄화해서 이름으로만 찾으므로 몬스터 패턴에서 참조하는 데는 문제
+-- 없고, character-sheet.html의 스킬 목록은 SKILL_TABLE[캐릭터.job]으로
+-- "자기 직업"만 보므로 실제 플레이어 직업 스킬트리를 오염시키지 않음
+-- (job-table-editor.html의 advancement 트리에 "동굴 몬스터"가 없으니
+-- 어떤 PC도 이 job이 될 수 없어 절대 노출 안 됨 — 조사 완료).
+--
+-- F의 "무너지는 종유석"(다단히트+초저명중)은 스킬 자체가 아니라 F
+-- 몬스터의 passiveMods.accuracyBonusPct:-70으로 명중률을 낮춤(스킬별
+-- 명중률 필드가 없어서 몬스터 전체 물리 명중에 적용 — 2026-08-24
+-- 컨셉 확정 시 이미 검토된 방식, F가 다른 물리 스킬을 안 갖고 있어
+-- 부작용 없음).
+-- ============================================================================
+(전문은 supabase/migrations/0025_add_cave_floor_monsters.sql 참고 —
+ 병합 시 이 파일이 그대로 함께 들어오므로 여기서는 헤더 주석만 발췌함)
diff --git a/web/battle-encounters.js b/web/battle-encounters.js
index 371b10b..a7f7044 100644
--- a/web/battle-encounters.js
+++ b/web/battle-encounters.js
@@ -102,6 +102,41 @@
         { monsterId: "unknown_entity", row: "front", weight: 0, maxAppearances: 1, guaranteed: true },
       ],
     },
+    // 동굴 1~4층 — 사슬형 몬스터 체인(2026-08-24 컨셉, 2026-08-31 데이터
+    // 작성). 매 층 3종 등장, 이전 층의 "축"이 되는 1종이 이월되고 신규
+    // 2종이 합류(CLAUDE.md "동굴 저층 실제 데이터 작성" 참고).
+    "cave-floor-1": {
+      maxCount: 3,
+      pool: [
+        { monsterId: "cave_boulder_beetle", row: "front", weight: 45, maxAppearances: 2 },
+        { monsterId: "cave_spiked_crab", row: "front", weight: 30, maxAppearances: 1 },
+        { monsterId: "cave_bat", row: "back", weight: 25, maxAppearances: 2 },
+      ],
+    },
+    "cave-floor-2": {
+      maxCount: 3,
+      pool: [
+        { monsterId: "cave_spiked_crab", row: "front", weight: 35, maxAppearances: 1 },
+        { monsterId: "cave_rockfall_wraith", row: "back", weight: 30, maxAppearances: 1 },
+        { monsterId: "cave_bear", row: "front", weight: 35, maxAppearances: 2 },
+      ],
+    },
+    "cave-floor-3": {
+      maxCount: 3,
+      pool: [
+        { monsterId: "cave_rockfall_wraith", row: "back", weight: 30, maxAppearances: 1 },
+        { monsterId: "cave_stalactite_crusher", row: "front", weight: 35, maxAppearances: 1 },
+        { monsterId: "cave_troll", row: "front", weight: 35, maxAppearances: 2 },
+      ],
+    },
+    "cave-floor-4": {
+      maxCount: 3,
+      pool: [
+        { monsterId: "cave_stalactite_crusher", row: "front", weight: 30, maxAppearances: 1 },
+        { monsterId: "cave_earth_spirit", row: "front", weight: 30, maxAppearances: 1 },
+        { monsterId: "cave_crystal_golem", row: "front", weight: 40, maxAppearances: 1 },
+      ],
+    },
     // 새 전투 예시: "forest-1": { maxCount:2, pool:[{monsterId:"forest_wolf", row:"front", weight:100, maxAppearances:2}] }
   };
 
diff --git a/web/battle-themes.js b/web/battle-themes.js
index eb9ed5e..3852300 100644
--- a/web/battle-themes.js
+++ b/web/battle-themes.js
@@ -72,6 +72,31 @@
         ] },
       ],
     },
+    // 동굴(1티어 던전) 1~4층 — 사슬형 몬스터 체인 컨셉(2026-08-24 확정,
+    // CLAUDE.md 참고). 5층(보스/AFTERMATH)은 다음 단계에서 별도 추가 예정,
+    // 이번엔 1~4층만. 각 층은 "이전 층 이월 축이 드랍한 열쇠"로 게이팅함
+    // (goblin-fortress의 hasItem+clearedBattle 조합 패턴 재사용).
+    {
+      id: "caveTier1",
+      name: "축축한 동굴",
+      icon: "🕳️",
+      section: "dispatch",
+      battles: [
+        { id: "cave-floor-1", name: "동굴 입구", requirements: [] },
+        { id: "cave-floor-2", name: "무너진 통로", requirements: [
+          { type: "clearedBattle", value: "cave-floor-1" },
+          { type: "hasItem", value: "무너진 통로의 흔적" },
+        ] },
+        { id: "cave-floor-3", name: "갈라진 균열", requirements: [
+          { type: "clearedBattle", value: "cave-floor-2" },
+          { type: "hasItem", value: "갈라진 균열의 표식" },
+        ] },
+        { id: "cave-floor-4", name: "무너지는 천장", requirements: [
+          { type: "clearedBattle", value: "cave-floor-3" },
+          { type: "hasItem", value: "무너지는 천장의 파편" },
+        ] },
+      ],
+    },
     // 새 테마 예시: { id:"forest", name:"저주받은 숲", icon:"🌲", battles:[{id:"forest-1", name:"길 잃은 늑대", requirements:[]}] }
   ];
 
diff --git a/web/material-table.js b/web/material-table.js
index fbd8335..184b540 100644
--- a/web/material-table.js
+++ b/web/material-table.js
@@ -22,6 +22,11 @@ const MATERIAL_TABLE = {
   "나무": { label: "나무", flavor: "고블린 마을 주변 숲에서 흔히 구할 수 있는 재목." },
   "돌": { label: "돌", flavor: "성채 주변에 굴러다니는 잡석. 가공하면 제법 단단하다." },
   "광석": { label: "광석", flavor: "고블린들이 캐낸 금속 원석. 무기와 갑옷의 뼈대가 된다." },
+  // 동굴(1티어) 상위 재료 — "돌"/"광석"보다 한 단계 위, 다음 파밍 단계
+  // ("철 기반 아이템 — 무겁지만 성능 우수")로 이어지는 떡밥(2026-08-31,
+  // CLAUDE.md "동굴 저층 실제 데이터 작성" 참고).
+  "철광석": { label: "철광석", flavor: "동굴 깊은 곳에서만 나는 무거운 원석. 일반 광석보다 훨씬 단단하다." },
+  "정동석": { label: "정동석", flavor: "속이 결정으로 가득 찬 희귀한 돌. 무게가 상당해 다루기 까다롭다." },
 };
 
 // result는 해당 몬스터 dropTable에 실제로 등록된 장비 스펙과 완전히 동일하게
```

(마이그레이션 SQL 파일의 본문 JSON 블록은 위 diff에서 헤더 주석만
발췌했음 — 전체 내용은 병합 후 저장소의
`supabase/migrations/0025_add_cave_floor_monsters.sql`을 직접 확인할 것.)

## 다음 세션 TODO

1. `supabase/migrations/0025_add_cave_floor_monsters.sql` 실제 실행(Supabase).
2. `simulate.js`로 HP/realDef 수치 재검증.
3. `initBonusDef` 엔진 개편 반영 후 이 9종 수치 재조정.
4. 5층(보스/AFTERMATH) 몬스터 데이터·`BATTLE_MONSTER_POOLS` 추가(게이팅
   `hasItem` 조건은 이미 걸려 있음, "동굴 4층 지도").
5. 상점 "판매" 기능 실제 브라우저 왕복 테스트, 희귀도별 가격(10/40/
   150/500/1500) 실제 경제 밸런스에 맞춰 조정.
