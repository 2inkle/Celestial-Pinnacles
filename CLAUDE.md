# 이 프로젝트

JS로 만드는 턴제 전투 시뮬레이션 웹게임. 패턴 빌드로 스킬 발동 조건을 짜는
"패턴 퍼즐"과, 레벨·장비·강화로 쌓는 "RPG 성장"을 둘 다 게임의 본분으로
삼는다는 설계 방향. 지금은 테스트 빌드 단계 — 레벨 상한 30, 고블린
테마(마을→왕국→그 뒤) 하나만 구현돼 있고, 이걸로 엔진과 성장곡선이
유효한지 검증하는 게 목표.

## 사용자가 스킬 정보를 넘겨줄 때 쓰는 텍스트 양식 (2026-08-16 확정)

사용자가 원본 설계 참고자료를 스킬 목록 텍스트로 붙여줄 때 쓰는 표기 규칙.
스킬 재배치/데이터 대조 작업을 할 때마다 이 형식을 다시 헷갈리지 않도록 여기
기록해둔다 — 실제로 이 세션에서 두 번(Aiming/Disarm 소속, Benediction 등
소속) 잘못 해석해서 오탐을 만든 적이 있음.

**한 줄의 기본 형태**:
```
스킬명 / pt비용 / 대상(진영-범위) / SP비용 / 위력%x히트수 / 유형(주스탯) / 특수태그들... / (선딜:후딜) / 설명 / 소속직업
```
모든 필드가 항상 다 있는 건 아님 — 패시브/서포트 스킬은 위력·유형이 빠지고,
`Passive`라는 단어 하나로 대체됨. 필드 순서도 스킬마다 살짝 다를 수 있어서
**슬래시로 구분된 조각들의 "종류"를 보고 파싱해야지, 고정 위치로 파싱하면
안 됨**(예: 델레이 `(N:M)` 괄호, 위력 `NNN%xN` 패턴, `Limit:xxx`, 진영-범위
조합 등 각 조각의 모양으로 필드 종류를 식별).

**대상(진영-범위) 표기 → 실제 스키마 매핑**:
- 진영: `enemy`→`targetFaction:"enemy"`, `friend`→`targetFaction:"ally"`,
  `self`→`targetFaction:"self"`, `all`→`targetFaction:"everyone"`(양 진영
  구분 없이 전부, 단 **부활 스킬만 예외**로 `targetFaction:"deadAlly"`를 씀
  — 원문이 "all"이라고 적혀 있어도 부활류면 deadAlly가 맞음, 기계적으로
  매핑하면 오탐 남).
- 범위: `individual`(항상 대상 1명, 여러 히트여도 같은 대상 — **주의: 지금
  엔진 스키마엔 이걸 "multi"와 구분해서 표현할 방법이 없다**, 아래 참고)
  vs `multi`(히트마다 무작위로 다시 뽑음, 전열 보호 규칙 적용) vs
  `all`(대상 전원에게 무조건 히트수만큼 명중, 보호 규칙 무시).
  `individual`/`multi` 둘 다 스키마상 `targetCount:"single"`로만 표현
  가능함(엔진이 "매 히트 같은 대상 고정"이라는 세 번째 모드를 아직 지원
  안 함) — 그래서 `individual`로 적힌 스킬이 `targetCount:"single"`인 건
  정상이고, **`targetCount:"all"`로 돼 있으면(즉 `individual`이든 `multi`든
  둘 다) 그건 틀린 것**. `all`(범위)로 적힌 스킬만 `targetCount:"all"`이
  맞음.

**들여쓰기 = 선행 스킬(requiredSkills) 트리**: 자식 스킬은 부모 스킬보다
한 단 들여써서 표기함(예: `Quick Slash` 아래 들여쓴 `Double Quick Slash`는
`requiredSkills:["Quick Slash"]`). 여러 단 내려가면 체인으로 이어짐.

**`[A + B]` 줄 (바로 다음 스킬 위)**: 다음 스킬은 A와 B **둘 다** 배웠어야
함 — `requiredSkills:[A,B], requiredSkillMode:"all"`.

**`[A or B]` 줄**: 다음 스킬은 A 또는 B **중 하나만** 배웠으면 됨 —
`requiredSkills:[A,B]`, `requiredSkillMode` 생략(기본값 "any").

**`※A와 B는 둘 중 하나만 습득 가능`**: 상호배타 — A/B 서로에게
`excludesSkills`를 건다.

**줄 끝의 `/직업명`**: 그 직업에서 "새로" 배우는(그 직업 그룹에 소속된)
스킬이라는 뜻. **직업 태그가 없는 스킬은 그 섹션의 최상위(1차) 직업 소속
— 절대 "이 섹션 제목의 직업" 소속이라고 넘겨짚으면 안 됨.** 예:
"드루이드 계열의 스킬목록" 섹션 안에 있어도 `Benediction`/`QuickHeal`은
태그가 없으니 **사제**(드루이드의 상위 1차 직업) 소속이고, 실제로 `/드루이드`
태그가 붙은 `HolyShield`/`Quick`/`CastAsist` 등만 드루이드 소속이다. 같은
이유로 "인퀴지터/데몬헌터 계열" 섹션의 `Quick Slash`/`Double Attack`처럼
태그 없는 기초 스킬은 사실 **전사** 공용 스킬을 재직업 계승으로 물려받은
것뿐이라(위치헌터→전사 상속), 섹션이 다르다고 새 스킬로 착각하면 안 됨
— 실제로 스탯이 "전사-가드 계열" 섹션에 나온 것과 완전히 같은지부터
대조해서 "같은 스킬 재언급"인지 "새 스킬"인지 판별할 것.

**기타 태그**: `★` = 궁극기 표시(데이터 필드 아님, 무시). `invalid` =
`skill.invalid:true`(전열 보호 무시). `BackAttack`/`BossAttack` =
`targetPriority`. `Passive` = `passive:true`. `Passive & Use` = 액티브+
패시브 겸용(발동 시 `grantPassiveMod`로 영구 패시브 수치를 부여하는 패턴,
2026-08-16 Eagle Eye 통합 때 확립). `Limit:Bow`/`Limit:Arrow` = 특정 장비
제한(주석용, 실제 구현 여부는 스킬별로 별도 확인).

## 패턴 슬롯 선택은 "조건"만 보지 "코스트 감당 가능 여부"는 안 봄 (2026-08-16)

`src/engine.js`의 `executeAction()`은 패턴 슬롯을 위에서부터 순서대로
`ConditionRegistry.check()`(조건)만 확인해서 **처음 조건이 참인 슬롯을
그 자리에서 확정**하고 다음 슬롯 평가를 멈춘다. 코스트(SP/HP/개인자원/팀자원)
감당 가능 여부는 슬롯이 이미 선택된 **다음에야** `checkAffordability()`로
확인하는데, 여기서 부족하면 그냥 "발동 실패" 로그만 남기고 그 턴을
날릴 뿐 — **다음 슬롯으로 자동으로 안 넘어간다.** 다음 턴에도 다시 슬롯
0번부터 평가하므로, 조건이 계속 참이면(`"always"` 등) 똑같은 실패가
무한 반복된다.

**실전 함정**: `always → Shoot(화살 소비)`, 그 아래 `always → 공격`처럼
"모자라면 평타로 떨어지겠지"라는 의도로 짠 패턴은 **작동하지 않는다** —
화살이 떨어져도 슬롯 1이 여전히 "조건 없음(항상)"이라 항상 다시 선택되고,
계속 발동 실패만 반복되지 슬롯 2(공격)로 절대 안 넘어간다(직접 검증:
화살 4개 소진 후 39턴 연속 발동 실패, 평타 전환 0회). 자원 소비형 스킬
뒤에 진짜로 안전한 폴백을 두려면, "always" 대신 **자원량 자체를 조건으로
명시**해야 한다 — 예: `자신, 개인자원(arrow) 이상 2개 → Shoot` /
`자신, 조건 없음(항상) → 공격`(이 형태로는 실측 확인: 화살 소진 후 정확히
공격으로 전환, 발동 실패 0회). 엔진 버그가 아니라 조건 기반 슬롯 선택의
당연한 귀결이지만, 패턴을 직접 짜는 사람(플레이어·개발자 둘 다) 입장에서는
전혀 직관적이지 않아서 여기 남겨둠 — 나중에 패턴 편집기 UI에 이런 함정을
경고하는 힌트를 넣을 가치가 있음(아직 미착수).

코스트 소모 메커니즘 자체(`payCosts`/`checkAffordability`, `personalResource`
타입 포함)는 실전투로 직접 검증함 — 화살통의 `grantsResource.key:"arrow"`와
스킬 `costs[].resource:"arrow"` 이름이 정확히 일치하고, 실제로 Shoot 캐스트당
정확히 코스트만큼(2개) 감소하는 것 확인. 자원 부족 시 스킬이 "일부만
적용되고 넘어가는" 일은 없음 — 전부 아니면 전무.

## 레벨 30 기준 스킬 포인트 총량이 3차 전직 궁극기 트리를 감당 못 함 (2026-08-16, 의도된 설계로 유지하기로 결정)

화이트아크의 Concentration(10pt, 선행 없음)과 Vulcan Arrow(선행 체인 포함
누적 55pt: Power Shoot 6→Charge Shot 6/Pierce Shot 8→Arrow Shower 4(독립)
→Hurricane Shot 16→Vulcan Arrow 15)를 **레벨 30에서 동시에 배우는 게
수학적으로 불가능**함을 발견(사용자 신고로 확인) — 합계 65pt 필요한데
레벨 30 캐릭터가 평생 벌 수 있는 스킬 포인트는 `(30-1)×2=58pt`가 상한
(다른 스킬에 단 1포인트도 안 써도 부족). Vulcan Arrow 체인 하나만으로도
58점 중 55점을 써버려서, Eagle Eye(6pt) 하나조차 같이 못 배움.

**사용자 결정**: 이건 버그가 아니라 "스킬이 순차적으로 해금되는 느낌"을
의도한 설계로 그대로 둔다 — 나중에 스킬 포인트를 추가로 얻을 수 있는
아이템을 만들 계획. **그래서 이번 세션에서 검증했던 "???" 전투의 화이트아크
파티(승률 66.7%/72%)는 레벨 30에서 실제로는 만들 수 없는 조합을 썼던
것이 확인됨** — 그 검증 자체가 무효이므로, 실제로 조합 가능한 스킬셋
(+위 패턴 폴백 함정까지 반영)으로 다음에 재검증이 필요함(아직 미착수).

## 2026-08-16 — "???"(레벨40 확장 마일스톤 보스) 궁극기/밸런싱 완성

고블린 마차(`goblin_cart`) 이후 이어지는 AFTERMATH 미스터리 전투
"unknown_entity"("???")의 실제 스킬셋·패턴·코어스탯을 이번 세션에서
전부 확정함. 오늘 목표였던 "실제로 승리 가능한 전투"를 레벨30·+6강화
(최소 기준) 파티 기준 **승률 66.7%**로 달성·검증 완료. 아래는 오늘 안에
끝낸 것과 내일로 미룬 것.

### 완성된 "???"의 전체 스킬/패턴
- **OMEN**(궁극기): 마법진 5개 도달 시 최상위 우선순위로 무조건 발동.
  Enemy-ALL·INT×200%×3·castDelay 55·전 스탯(ATK/MATK/DEF/MDEF) -30%·
  SPD -20%. `preDelayType:"casting"`이라 인퀴지터의 Magic Jammer로
  실제로 캐스팅을 늘릴 수 있고, costs로 마법진 5개를 요구하므로
  `PrepState.resolve()`가 발동 시점에 코스트를 재확인 — 시전 중에
  마법진을 5개 미만으로 깎으면 "발동 실패"로 불발됨(**이론상 파훼법이
  실제로 성립함을 엔진 레벨에서 end-to-end 검증**, `demo-omen-counterplay.js`).
- **Circle Drain**("???" 전용, erase+gain)/**CircleErase**(위치헌터→인퀴지터
  계보 실제 스킬, 순수 삭제만 함— 처음에 이 둘을 헷갈려서 같은 이름으로
  합쳤다가 사용자 지적으로 분리함. 파훼법의 핵심은 플레이어가 원래
  갖고 있던 **순수 삭제형** CircleErase 쪽 — 판 전체 마법진 총량을 실제로
  줄이므로 "무조건 지운다"만으로도 100턴 무승부까지 갈 수 있음이 확인됨).
- **Arcane Pulse**(10턴마다 확정 발동, 가벼운 단일 공격+마법진 순증가 —
  Circle Drain의 뺏고뺏기기 제로섬만으로는 궁극기 도달 속도가 우연에
  너무 좌우돼서 추가).
- **Arcane Surge**(자기 effectiveMatk가 realMatk의 60% 미만이면 MATK
  +150% 자가보정 — 발동 즉시 조건이 꺼져서 무한루프 없음).
- **Mana Tide**(SP 20% 이하 시 최대 3회, 발동 후 영구 SP 재생 tick —
  "SP 낮추기 공략은 몇 번은 유효, 이후엔 자연재생으로 무효화").
- **둠로드 스킬 이식**: 개전에 Mana Guard→Corrupted Focus(스탠스는
  둠로드의 SpellFocus와 동일하지만 집속 마력 축적 배율만 1:10로 완화 —
  원판 그대로 썼더니 궁극기 Vortex Overload까지 4~5턴 만에 도달해서
  파티가 준비할 시간이 없었음) 순서로 진입 → 이후 기본 폴백이
  Lightning Ball(마법사인데 물리공격 ATTACK을 반복하던 걸 사용자가
  지적해서 교체) → 집속 마력 500 이상 Thunder Storm → 1000 이상
  **Vortex Overload**("???" 전용, 둠로드의 Lightning Vortex와 스펙
  동일하되 발동 후 집속 마력을 전부 소진시키는 사양만 다름 — 마법방어력을
  미리 준비 못 하면 전멸 위기인 타임어택 궁극기).
- HP 30% 이하 → 보물상자를 남기고 퇴각(goblin_cart와 동일하게 "직접
  처치 불가"), HP 50% 이하 → 1회 완전회복(HP/SP) — 이 기믹 때문에
  공략을 잘못하면 100턴을 다 쓰고도 못 끝낼 수 있음(의도된 설계).

### 튜닝 과정에서 발견·수정한 엔진 버그 (전부 "???" 개발 중 실측으로 발견)
1. **소환 배율 누수**: `performSummon()`의 SummonEff×LUK 배율이 원본
   스탯뿐 아니라 combatReal(ATK/DEF/MATK/MDEF)·maxHp에도 그대로 곱해져서,
   ATK/MATK처럼 감쇠 대상이 아닌 스탯은 배율이 그대로 새어나갔음(고블린
   마차가 소환하는 주술사가 예전에 손봤던 MATK 너프를 우회해서 다시
   위험해지던 문제) — 배율을 원본 스탯에만 적용하도록 수정.
2. **장비발 Max HP/SP 보너스가 전투 시작과 동시에 사라짐**: "생명의
   반지"/"마나의 반지" 등이 `resetForBattle()`에 매 전투 초기화되는
   필드에 잘못 합산되고 있었음 — real/bonus 2단 구조로 분리해서 해결
   (사실상 이 필드를 쓰는 아이템이 한 번도 작동한 적이 없었던 것으로 보임).
3. **Arcane Pulse가 파티원 수만큼 마법진을 곱배로 줌**: `targetCount:"all"`
   스킬의 `effects`가 대상 하나당 한 번씩 재적용되는 구조라, 5인 파티를
   때리면 teamResourceGain도 5번 적용됨 — targetCount를 "single"로 수정.
4. **마법사 계열 다수 스킬이 "multi"인데 "all"로 구현돼 있었음**(전역 시스템
   버그, "???" 국한 아님): 사용자가 원본 설계 참고자료를 대조해서 발견 —
   Fire Ball/Fire Storm/Lightning Ball/Thunder Storm/Lightning Vortex 등
   16개가 "무작위 다수 타격(전열 보호캐 우선)"이어야 하는데 "전체 무조건
   타격"으로 잘못 들어가 있었음. 엔진은 이미 이 구분을 정확히 지원하고
   있어서(`targetCount:"single"`+`hits>1`이면 히트마다 재추첨하는 게
   정확히 "multi" 거동) 데이터만 고치면 됐음. Voltex Sphere는 예외
   (`bounceRows` 전용 메커니즘이 `targetCount:"all"`을 요구).
5. **applyDealtPassiveMods가 덧셈이라 서로 무관한 효과끼리 상쇄됨**:
   "???"의 damageDealtTo_userPct(대인 데미지 일괄 축소)와 그녀 자신의
   Mana Guard 자기 버프가 같은 덧셈식에 있다는 이유만으로 상쇄되던 문제
   — (1+a)×(1+b)×(1+c) 복리 구조로 변경(사용자 지시), 각 출처는 개별
   0-클램프.
6. **리젠류 tick 6곳이 `duration:1`이라 한 번 틱하고 소멸**(ManaRegen/Self
   Regeneration/Regene Heal×2/Regeneration/Spirit of Mana) — "버프·디버프는
   리젠·틱데미지 포함 전부 영구지속"이라는 확립된 규칙과 어긋나 있었음,
   전수 조사해서 6곳 다 고침.

### 새로 만든 범용 엔진 기능
- `MY_EFFECTIVE_STAT_COMPARE`(자기 effective 스탯 비교, `thresholdPctOfReal`
  옵션으로 절대값 대신 real 대비 %로도 판정 가능 — 상대 스탯은 절대 참조
  불가하게 설계), `MY_PERSONAL_RESOURCE_COMPARE`(집속 마력 등 개인 자원
  임계치), `ANY_ALLY_HP_LESS_THAN_PCT`(파티 중 누구라도 위험하면 반응),
  `BATTLE_TURN_MULTIPLE_OF`(N턴마다 확정 발동), `OPPONENT_RESOURCE_GREATER_THAN`
  / `FACTION_RESOURCE_GREATER_THAN`(상대/자기 진영 팀 자원 임계치).
- `stealTeamResource`(상대 자원 삭제 성공 시 자기 진영 적립, gainAmount:0이면
  순수 삭제)/`drainPersonalResource`(개인 자원 완전 소진) 이펙트.
- `RETREAT`/`PANIC_FULL_RECOVERY` 액션(goblin_cart의 SELF_DETONATION류
  패턴을 다른 몬스터에도 재사용 가능하게 일반화).
- `buildEnemyFromMonsterKey`에 `monsterDef.personalResources`/`passiveMods`
  지원 추가 — 몬스터는 "job" 개념이 없어서 플레이어 캐릭터가 자동으로
  받는 이 두 필드를 못 받고 있었음, 직접 지정하는 통로를 뚫음.

### 밸런싱 방법론과 최종 수치
- 벤치마크 파티(인퀴지터/카디널/하이드루이드/화이트아크×2, 레벨30)로
  goblin_king/goblin_cart 승률 100%/98.7%를 먼저 확인한 뒤, 그 파티로
  "???"를 튜닝(goblin_king 때 확립한 방법론 그대로).
- **몬스터 스탯을 극단적으로 낮추는 대신, `damageDealtTo_userPct`(대인
  데미지 일괄 배율)로 최종 데미지만 축소하는 방식을 채택**(사용자 제안).
  이유: 유저는 HP가 1000~2000대인데 보스는 수십만이라 "비슷한 스펙"으로
  맞춰버리면 스탯을 1까지 깎아야 하고, 그러면 감쇠 곡선 바닥에 붙어서
  퍼센트 디버프가 전부 무의미해짐. 스탯은 정상 범위(INT30/MATK25)로
  두고 데미지에만 -95%(5%) 배율.
- 최종 확정 스탯: **HP 60만**(1.2×HP=72만이 실제 처치에 필요한 누적딜
  — 패닉힐로 50%에서 1회 리셋되므로 "50%까지+다시 100%에서 30%까지"
  이중으로 깎아야 함), INT 30/MATK 25/MDEF 200/SPD 200/damageDealtTo_userPct -95.
- 카디널 Inner Fire·하이드루이드 FullAssist를 500% 캡까지 반복 캐스팅
  (사용자 지정), 화이트아크 2체는 **+6(최소 기준) 강화**로 **승률 66.7%,
  사망으로 인한 패배 0%**(나머지는 100턴 무승부) 달성 — 처음 목표하신
  "+6은 빠듯하지만 가능"과 정확히 일치. 인퀴지터가 MindBreak×2 후 공격
  대신 ForceShield(파티 MDEF+20%)를 반복하면 사망률이 사실상 0%로
  떨어짐(승률 자체는 안 바뀌고 패배가 전부 무승부로 바뀜)도 확인함.
- 실측 로그(`omen-fight-win-log-fixed.txt`, 5/5 생존 승리, 39턴)를 사용자에게
  전달해 직접 검토받음 — 검토 중 "???"가 데미지를 전혀 못 넣는 것처럼
  보인 사례가 있었는데, 원인은 게임 코드가 아니라 스크래치 테스트
  스크립트의 인자 파싱 버그(`--verbose`가 `Number()`로 들어가 NaN이 됨)
  였음, 게임 코드는 `git diff` 결과 무관(수정 없음) 확인.

### 남은 것 (내일 이어서)
- **레벨 상한 30→40 확장**: 전투 승리/보상으로 트리거되는 메커니즘 자체는
  아직 미착수. 하드코딩된 레벨 상한 위치를 찾아서 풀어야 함.
- **보상 내역**: `rewardObjectSpec`이 아직 REWARD_GRANT의 기본값(이름
  없는 상자, 2000 HP)에 폴백 중 — 실제 골드/드랍 아이템/아크메이지 3차
  전직 요구 아이템 이름 등을 확정 안 함.
- 개전 대사(DIALOGUE_OPENING) 여부 — 사용자가 "생각해보겠다"고 보류.
- 이 전투는 "한 번 클리어하면 재입장 자체가 영구히 막혀야 한다"는 예외
  규칙이 필요(다른 전투들과 달리) — `battle-select.html`의 해금 로직에
  아직 미반영.
- **`game_content` DB(Supabase)에는 이번 세션 내용이 전혀 반영 안 됨** —
  "일단 로컬에서 진행"이라는 지침에 따라 SQL 마이그레이션을 만들지
  않았음. GitHub에는 푸시했지만(`web/*.html`은 정적 코드라 푸시 즉시
  반영), `game_content`가 DB 기반인 스킬/몬스터 데이터(OMEN 등 "???"의
  전체 스킬셋, unknown_entity 몬스터 정의)는 실제 서비스에 반영하려면
  다음에 반드시 SQL 마이그레이션을 새로 만들어서 실행해야 함.

## 2026-08-16 — 스킬 테이블 직업 등급 재배치 작업 (진행 중)

`skill-table.json`/`skill-table-editor.html`의 `LEGACY_SKILL_SEED`에서, 여러
직업 라인이 "상위 전직(2차/3차) 스킬이 실제로는 1차 잡의 레벨1 목록에 통째로
섞여 들어가 있는" 같은 패턴의 버그를 갖고 있었다(사용자가 과거 설계
참고자료 스크린샷을 스킬별로 짚어가며 대조 요청 → 재배치). 확립된 작업
방식: **이미지는 "어느 스킬이 몇 차 전직인가"(색상) 판별에만 쓰고, 선행
스킬 트리(들여쓰기)는 사용자가 텍스트로 직접 불러주는 방식이 훨씬 정확함**
— 색상 인식을 이번 세션에서 여러 번 오독했음(전사 계열의 "로열가드/
소셜나이트"는 과거 잔재 명칭이라 무시, 사제 계열의 Regeneration/Rabbit
소속을 두 번 틀림). 텍스트 들여쓰기로 받은 뒤부터는 정확도가 확 올라감.

**완료**:
- 워록(2차)→둠로드(3차): Explosion/Hell Fire/Meteor Storm/Ice Prison/
  Tidal Wave/Blizzard/Flash/Paralysis/Thunder Storm/Earthquake/Subsidence/
  SandStorm 12개 이동(requiredLevel 15→30). 나머지 화염/빙결/전격/무속성
  postDelay 수치는 처음엔 이미지와 달라 보였지만, 실제로는 `note` 필드에
  "'딜레이 감소 N%'는 postDelay(X→Y)에 미리 반영"이라고 이미 정확히
  계산해서 기록해둔 값이었음(버그 아님) — 지금은 "딜레이감소"가
  `actionDelay` 이펙트와 동일한 개념이라는 것도 확인됨.
- 전사(1차)/가드(2차) 13개 스킬에 통째로 비어있던 `requiredSkills`를
  들여쓰기 트리대로 삽입(Break Down은 Weapon Break+Armor Break 둘 다
  필요/all, Hyper Recovery·Self Regeneration은 둘 다 Self Recovery
  하나만 선행/형제 관계 등).
- 사제(1차)→비숍(2차)/카디널(3차): SmartHeal/Party Heal/MagicCircle/
  Force Shield/Regeneration→비숍, Healing Shower/Sanctuary/Grand
  Cross→카디널로 이동. Rabbit은 처음에 비숍으로 잘못 옮겼다가 사제로
  되돌림(Holy→Rabbit까지 1차, Advent Angel부터 2차). Holy 직계 자식
  6개(Rabbit/Encourage/Charm/ProtectionField/Force Shield/Holy Burst)
  전부 선행조건 삽입, Holy Burst→{Grand Cross, Divine Burst}(형제
  관계, 둘 다 Holy Burst 하나로 동시 해금)도 반영. 카디널 Job Master
  패시브에 `passiveMods:{healingDealtFlat:200, healingDealtPct:10}`
  추가(사용자가 알려준 수치).
- 드루이드(2차)→하이드루이드(3차): Nature Defence/MasterHeal/
  FullAssist 이동 + HolyShield/Quick(Druid)/CastAsist/Nature
  Defence/ProgressiveHeal/MasterHeal 선행조건 삽입.
- **스킬명 충돌 회피 + 표시명 숨김 기능 신규 추가**: 비숍과 드루이드가
  각각 독립적으로 "MagicCircle"을 갖고 있었음(스킬은 이름으로 전역
  등록되는 구조라 이름이 겹치면 하나가 다른 하나를 덮어씀). 드루이드
  쪽을 `"MagicCircle (Druid)"`로 개명해서 데이터상 충돌은 피하되,
  `web/character-sheet.html`에 `displaySkillName(name)` 헬퍼를 새로
  추가해서 **화면에는 "(직업명)" 접미사가 안 보이게** 함(스킬 카드
  이름 표시, 패턴 편집기의 행동 선택 드롭다운 라벨 둘 다 적용 —
  드롭다운의 실제 값/저장 데이터는 원래 이름 그대로라 회귀 없음).
  단, `"Job Master: X"`는 예외로 그대로 노출(어떤 직업의 마스터 효과인지
  자체가 정보이므로). 기존에 이미 있던 "Quick (Druid)"/"Attack (Priest)"
  같은 스킬명도 이 헬퍼를 거치면 자동으로 괄호가 잘림(일관된 동작).
- 전사(1차)→위치헌터(2차)→{인퀴지터, 데몬헌터}(3차): DeathStrike/
  FullBreak→데몬헌터, Soul Storm/Mana Burn/Magic Jammer→인퀴지터로 이동.
  선행조건 대량 삽입(Quick Slash (WH)→Double Quick Slash (WH)→DeathStrike,
  Double Attack (WH)→{Weapon Break (WH)→FullBreak, Mana Break→Soul
  Break→{Soul Storm, SoulShout}}, EnergyRob→{EnergyCollect→CircleErase,
  ChargeDisturb, ChargeDisturb(all)}, ForceShield[self]→{MindBreak→Mana
  Burn→Magic Jammer, ResistDown, ForceShield}, Pray→Purify,
  DemonHunter→{HolyEnchant, ExorcismGospel, Avenger} 등). **전사 공용
  스킬 "Raging Blow"에도 이번에 처음으로 `Double Attack` 선행조건이
  확인돼서 추가함**(가드 라인 조사 때는 안 나왔던 정보 — 위치헌터 라인
  이미지에서 같은 스킬이 다시 나오면서 발견됨, 공용 스킬이라 가드
  라인에도 동일하게 적용됨).
- **신규 스킬 4개 추가**(위치헌터/인퀴지터/데몬헌터 트리에 있었지만
  기존 데이터에 아예 없던 것): `SoulShout`(데몬헌터, Soul Break 후행),
  `CircleErase`(위치헌터, EnergyCollect 후행 — "상대 마법진-1"은
  teamResourceConsume류 이펙트가 없어서 미구현, 스킬 틀만 존재),
  `Purify`(데몬헌터, Pray 후행 — `damageSideCondition:"different"`로
  "적에게만 피해" 부분은 구현함. 이 필드는 `src/skillResolution.js`에
  예전부터 "Purify류 — 적에게는 피해, 아군에게는 회복"이라고 주석으로만
  남아있던 걸 실제로 채운 첫 사례. "아군 회복" 쪽은 정확한 공식/수치가
  아직 없어서 effects 비워둠), `Punishment`(인퀴지터, 독립 — "HP%비례
  추가데미지/SP%반비례 추가데미지" 계산식 미정으로 기본 데미지만 반영).
- 전체 회귀(`index.js`+`demo-*.js` 27/27) 매 단계마다 통과 확인,
  `skill-table.json`/`LEGACY_SKILL_SEED` 항상 동시 갱신, `SEED_VERSION`
  `2026-08-09a`→`2026-08-16g`까지 단계별로 올림.
- **확립된 작업 흐름**: 이미지는 "어느 스킬이 몇 차 전직인가"(색상)
  판별에만 쓰고, 선행 스킬 트리(들여쓰기)는 사용자가 텍스트로 직접
  불러주는 방식으로 최종 정착함 — 색상 오독이 반복돼서 전환함(위 항목
  참고). 앞으로도 이 형식으로 받을 것.

- 헌터(1차)→스나이퍼(2차)→{화이트아크, 아케인아처}(3차) — **이걸로 전
  직업 라인(마법사/전사/사제/헌터 4갈래 전부) 스킬 등급 재배치를 마침**.
  Concentration/Eagle Eye(Passive+Active)/Hunting Sign/Vulcan Arrow/
  Quick Shot을 스나이퍼→화이트아크로 이동. Power Shoot postDelay(0→15)/
  Concentration postDelay(0→10)/Job Master: Arcane Archer의
  `dexDamageDealtPct`(6→8) 수치 정정. 선행조건: Power Shoot→{Charge
  Shot, Pierce Shot→{Aiming, Disarm}}, Palsy Shot→Poison Shot,
  Concentration→{Eagle Eye 양쪽, Hunting Sign}, Hurricane Shot→Vulcan
  Arrow→[Vulcan Arrow+Quick Shot+Concentration]→Star Bow Brake→Fury,
  [Arcane Intuition or Arcane Curtain]→Arcane Bolt→Arcane Spear.
  `Excorsism`(오타)→`Exorcism`으로 이름 수정도 이 세션에 반영함.
- **`displaySkillName()` 헬퍼를 화이트리스트 방식으로 교체**: 처음엔
  "끝에 오는 괄호는 전부 지운다"는 정규식이었는데, 이 라인에서
  `Eagle Eye (Passive)`/`Eagle Eye (Active)`처럼 **괄호가 직업명이
  아니라 서로 다른 두 스킬을 구분하는 실제 의미**인 경우를 발견함(같은
  이유로 `Elemental Shield(Red/Blue/Green)`, `ChargeDisturb(all)`도
  지우면 안 됨). `JOB_DISAMBIGUATION_SUFFIXES = [" (Priest)", " (Druid)",
  " (WH)"]` 화이트리스트로 교체 — 이 셋만 정확히 매칭해서 지움, 그 외
  괄호는 전부 그대로 노출.

- **Eagle Eye (Passive)+Eagle Eye (Active) — 스킬 2개를 1개로 재통합**
  (2026-08-16, 사용자 지적으로 발견): "패시브+액티브 겸용 스킬 하나였는데
  스킬 스키마가 패시브/액티브 동시 보유를 지원 안 해서 둘로 쪼갰다"는
  예전 note를 다시 보니, 이미 `grantPassiveMod` 이펙트(액티브 스킬
  발동 시 `target.passiveMods[key]`에 영구 가산 — "매의 눈" 상태의
  방어무시 부여에 이미 쓰이고 있었음)로 "발동 시 패시브 수치를 영구
  부여"가 가능했다는 걸 확인 — 즉 애초에 스킬을 쪼갤 필요 자체가
  없었음(스키마 제약이 아니라 이 이펙트를 놓쳤던 것). 명중률+10%도
  `grantPassiveMod`로 옮겨서 하나의 액티브 스킬 `Eagle Eye`로 합침
  (pt6, `Concentration` 선행). 총 잡스킬 수 187→186(2개→1개).
- **고블린 주술사 MATK 16→4로 하향** — "고블린 주술사가 실제로 Fire
  Ball을 한 번이라도 완성시키면 얼마나 위협적인가" 조사(위 "레벨 10
  4인 파티" 섹션)에서 나온 후속 조치. `goblin_shaman`이 플레이어
  마법사와 완전히 같은 "Fire Ball"(targetCount:"all", hits:4)을
  그대로 씀 — 스킬 자체를 고치면 유저 마법사까지 같이 약해지므로,
  몬스터 쪽 MATK만 낮춤. 히트당 위력이 MATK×dampedINT×계수라 MATK
  16이면 4히트 합계 ≈816(400 HP 캐릭터 한 캐스트로 즉사 가능) —
  4로 낮추면 합계 ≈200 안팎(위협적이지만 즉사는 아님, 실측
  `shaman-alpha-strike.js` 스크래치 스크립트로 강제 선공시켜 확인:
  헌터 400→196/마법사 400→240/사제 400→265, 전원 생존). `web/monster-roster.html`의
  `LEGACY_MONSTER_SEED`만 수정(몬스터는 skill-table과 달리 별도 JSON
  미러 파일이 없음), `MONSTER_SEED_VERSION` `2026-08-14a`→`2026-08-16a`.
- **고블린의 왕 승률을 의도적으로 60%로 튜닝** — 사용자 요청: "레벨15,
  최대효율 스탯, 상점 무기만(방어구 몇 가지는 아직 못 갖춘 수준)"인
  파티가 고블린의 왕 전투(`goblin-king`, 고블린의 왕은 weight10로 낮은
  확률로만 등장 — 나머지는 섭정/수문장/주술사)를 승률 60% 정도로 이길
  수 있게 조정. **레벨10 4인 파티 실측 때 의심했던 섭정의 Fire Ball이
  아니라, 진짜 원인은 왕 자신의 "Break Down"이었음** — 원래 STR26/ATK22
  조합에서 raw 데미지가 ≈2200까지 나와서, 방어구 없는 400 HP 캐릭터를
  Break Down 한 방(개전 직후 3연타 패턴)이 그냥 죽였음(왕이 낀 조우는
  실측 승률 0%에 가까움 — 강제 선공 디버그로 확인: 4명 중 2명이 3턴 안에
  전투불능, 6턴째 전멸). Bash/Break Down 둘 다 전사의 공용 스킬이라
  스킬 자체는 못 건드림 — 몬스터 쪽 스탯만 조정.
  - **ATK만 낮춰본 1차 시도**(STR26 고정): ATK2~4는 승률 100%(트리비얼),
    ATK6은 82%, ATK8부터 60%대로 급격히 꺾임 — "낮췄지만 여전히
    위협적인" 중간 지점을 못 찾음(스텝이 너무 거칢).
  - **STR도 같이 낮추는 2차 시도**: `dampDamageStat`이 완만한 곡선이라
    ATK 하나만 움직이는 것보다 STR·ATK 두 축을 같이 움직이면 조정
    폭이 넓어짐 — STR22/ATK9~13, STR18/ATK11~13 구간에서 승률이
    58~61%로 여러 인접값에 걸쳐 안정적으로 재현되는 평탄구간을 찾음
    (우연한 노이즈 아님). **STR22/ATK11**로 확정(원래 STR26/ATK22).
    실제 파일 반영 후 재검증: 승률 61.5%(200회).
  - 사용자 의도: "장비가 갖춰지고 레벨이 오르고 스킬을 더 배우면 자연히
    100%로 수렴하게" — 지금 60%는 이 파티 스펙 기준에서의 의도된
    난이도점이지 최종 밸런스가 아님. STR도 같이 낮춘 부수 효과로,
    왕의 기준 스탯 자체가 낮아져서 플레이어 디버프(Weapon Break류
    Atk%감소 등)가 상대적으로 더 크게 체감돼 디버프 전략을 유도하는
    효과도 노림(사용자가 명시적으로 의도한 부분).
  - `web/monster-roster.html`만 수정, `MONSTER_SEED_VERSION`
    `2026-08-16a`→`2026-08-16b`.

**남은 것**: 사제 계열 나머지 스킬들(Party Heal/Refresh/Job Master 등
선행조건 없이 독립으로 둔 것들)이 정말 독립인지 재확인 필요할 수 있음.
새로 추가한 4개 스킬(SoulShout/CircleErase/Purify/Punishment)의 정확한
수치·공식이 아직 미정 — 다음에 확정되면 채워야 함. 전 직업 라인의
등급/선행조건 재배치 자체는 이걸로 일단 끝났지만, 실제 UI(패턴 편집기
드롭다운·습득 화면)에서 눈으로 재검증하는 건 아직 안 함 — 다음 세션에서
브라우저로 한 번 훑어볼 가치가 있음. 다른 패시브+액티브 겸용 스킬도
비슷하게 잘못 쪼개져 있을 가능성 있음 — Eagle Eye 사례를 계기로 전체
스킬 목록에서 note에 "패시브+Use 겸용"/"둘로 분리" 같은 문구가 있는
다른 항목이 더 있는지 훑어볼 가치가 있음(아직 안 함).

## 현재 진행 상황 요약 (2026-08-15 기준 — 다음 세션은 여기부터 읽을 것)

### 끝난 것

- **로그인**: Discord OAuth 단독, Supabase Auth 위임. 실제 계정으로
  로그인→세션→리다이렉트까지 end-to-end 검증 완료(상세: "로그인" 섹션).
- **DB 스키마**: `supabase/migrations/0001~0006` 전부 실제 프로젝트에
  적용 완료. RLS(본인 소유 행만 CRUD)를 anon 키·실제 세션 양쪽으로
  실측 검증함(타 유저 사칭 쓰기 차단 확인). `profiles.is_admin`으로
  관리자 판별 전환, 자기 자신을 관리자로 승격시킬 수 있던 구멍도 막음
  (상세: "로그인/서버 DB 전환 시 API 설계 논의" 섹션).
- **게임 페이지 전체(12개) Supabase 전환 + 실측 검증 완료**:
  `roster-index.html`/`hire.html`/`village.html`/`character-sheet.html`/
  `guild.html`/`shop.html`/`refinery.html`/`workshop.html`/
  `battle-select.html`/`dispatch.html`/`battle-view.html`/
  `roster-select.html`/`item.html`(+공유 스크립트 `battle-encounters.js`/
  `battle-adapter.js`). `localStorage`(`battleSim_*`)는 이제 게임 어디에서도
  안 쓰임 — DB가 유일한 진실 공급원. 각 페이지 전환 세부 내용과 실측
  결과는 "게임 페이지의 Supabase 전환" 섹션에 페이지별로 기록돼 있음.
  **`roster-select.html`/`item.html`은 처음 10개 전환 작업에서 통째로
  빠뜨렸다가 다음 날 플레이 테스트("용병이 있는데 안 보인다" 신고)로
  발견해서 추가 전환함** — 비슷한 누락이 또 있을까 걱정되면 `grep -rl
  "battleSim_" web/*.html web/*.js`로 재점검할 것(방법은 "게임 페이지의
  Supabase 전환" 섹션 맨 아래에 기록해둠).
- **전환 중 발견해서 고친 심각한 버그 3건**:
  1) `battle-adapter.js`가 스킬 테이블을 여전히 `localStorage`에서
     읽고 있었는데 그 키를 채워주는 곳이 하나도 안 남아서 **모든 전투가
     스킬 없이 맨주먹으로만 돌고 있었음**(크래시가 없어서 티가 안 났음).
  2) 전투 결과 배너가 항상 "플레이어"로 뜨던 기존 버그(`src/engine.js`의
     `startBattle`이 `username`을 반환 객체에 안 담고 있었음, DB 전환과
     무관한 첫 커밋부터의 버그).
  3) 전직하면 하위 직업 스킬을 영영 못 배우던 버그(`jobSkillTable()`이
     지금 직업 스킬만 봤음, 플레이 테스트로 발견) — 전부 수정 완료,
     회귀 테스트 통과·실제 UI로 재검증함.
- **밸런싱 — 버프/디버프 상한 축소(2000%→500%) 완료**: `src/character.js`의
  `calculateEffectiveStat()`(`realVal * 20` → `realVal * 5`), `src/registries.js`의
  `LUK_GROWTH_MAX_RATIO`(20→5, 캡=5 지점에서 여전히 3배 도달하도록 자동
  재계산됨), `src/skillResolution.js`의 `describeStatCap()`("더 이상
  증가할 수 없다" 판정 임계값), `web/character-sheet.html`의 `calcEffective()`
  (UI 표시용 사본)까지 전부 동기화. 전체 회귀(`index.js`+`demo-*.js` 27/27)
  통과, `simulate.js`/성장곡선 프로브로 재확인함. 상세: "알려진 미구현 /
  보류 항목" 섹션.

### 남은 것 (우선순위 순)

1. **관리자 전용 페이지들은 아직 `localStorage`/`battleSim_username`
   기반**: `skill-table-editor.html`/`job-table-editor.html`/
   `shop-table-editor.html`/`monster-roster.html`/`monster-sheet.html`/
   `dev-tools.html`/`feature-requests.html`. `nav.js`는 이미
   `profiles.is_admin`으로 옮겼지만 이 페이지들 자체의 내부 로직(콘텐츠
   편집 → `game_content` 반영)은 손 안 댐. 게임 플레이와 무관해서 우선순위
   낮게 잡아둠 — 편집기에서 스킬/직업/상점/몬스터를 고쳐도 지금은
   `game_content`에 반영 안 됨(SQL로 직접 갱신하거나, 이 페이지들도
   전환해야 함).
2. **서버 측 보상 검증 미착수**: `dispatch.html`/`battle-view.html`이
   클라이언트가 계산한 exp/gold/loot를 그대로 커밋하는 구조(기존과 동일한
   신뢰 모델 유지, 이번 전환에서 의도적으로 손 안 댐). 상세: "API 단계에서
   검증/방어가 필요한 지점" 섹션.
3. **초반 무기 ATK가 초반 던전 난이도 대비 과도한 문제** (2026-08-15 성장곡선
   조사로 발견, 상세는 아래 "레벨 1~30 성장곡선 조사" 항목): 레벨업(스탯
   투자) 자체는 감쇠가 잘 작동하는데, 상점 시작 무기만 사도 레벨 1부터 이미
   고블린 왕국 최초 전투를 100% 승률로 찍어눌러서 레벨 30까지 수치가 안
   움직임. 던전별 실제 몬스터 구성 대비 레벨 진행 검증 필요, 마법 클래스의
   "맨주먹이면 MATK 0이라 아예 딜이 안 나오는" 구조적 비대칭도 같이 있음
   (물리 클래스만 맨주먹 ATK+5 안전장치가 있음).
4. 그 외 소소하게 남은 것들은 "알려진 버그"/"알려진 기능 공백" 섹션들에
   개별로 정리돼 있음(전직 로그 오귀속, `battle-log-view.html` 낡은 파서,
   `teamResourceConsume` 이펙트 없음 등) — 전부 우선순위 낮음으로 보류 중.

### 2026-08-15 플레이 테스트 중 추가로 발견·수정한 것

- **전직하면 하위 직업 스킬을 영영 못 배우던 버그(+ 이미 배운 스킬이
  화면에서 사라지는 부작용) — 수정 완료**. 상세: "알려진 버그 — 전직하면
  하위 직업 스킬을 영영 못 배우던 문제" 섹션.

### 2026-08-15 — `simulate.js`가 이번 세션의 DB 전환 이후로 깨져 있었음 (수정 완료)

레벨 1~30 성장곡선에서 "지나치게 강한 구간"을 찾으려고 `simulate.js`의
`loadAdapterEnv()`로 스크래치 벤치마크를 돌렸는데, 모든 직업·모든 레벨이
승률 0%로 나왔다. 원인: `loadAdapterEnv()`가 여전히
`localStorage.setItem("battleSim_skillTable", ...)`로 스킬 테이블을
넣고 있었는데, `battle-adapter.js`는 오늘 있었던 injectable-cache 리팩터
(`dispatch.html`/`battle-view.html` 전환 중 발견한 "모든 전투가 스킬 없이
맨주먹으로 돌던" 버그를 고치면서) 이후로 그 키를 아예 안 읽는다 — 오직
`setSkillTable()` 주입만 받음. 즉 **`simulate.js`가 그날 이후로 스킬을 단
하나도 등록 못 하는 채로 조용히 돌고 있었다**(에러 없이 승률만 이상하게
나와서 티가 안 남 — CLAUDE.md의 "밸런스 조정 시 기본 도구"라고 적어둔
바로 그 도구가 깨져 있었던 것). `simulate.js`의 `loadAdapterEnv()`에서
`JSON.parse` 후 `BattleAdapter.setSkillTable(table)`을 직접 호출하도록
수정 → `node simulate.js --runs 50`으로 정상 동작 확인(전체 `demo-*.js`
+ `index.js` 27/27 회귀 통과, 이 경로들은 `loadAdapterEnv`를 안 써서
애초에 이 버그의 영향을 안 받았음).

### 2026-08-15 — 레벨 1~30 성장곡선 조사: "지나치게 강한 구간"의 정체는 무기, 스탯이 아님

`simulate.js` 수정 후 고블린 왕국 최초 전투(고블린 척후병 x2)를 벤치마크로
전사/헌터/마법사/사제 각각 레벨 1~30 전 구간(60회씩)을 돌린 결과:

- **상점 시작 무기(1000~1000원대)만 쥐어주면 전사/헌터/마법사는 레벨 1부터
  이미 100% 승률·3~4턴 클리어로 시작해서 레벨 30까지 수치가 전혀 안
  움직인다**(예: 전사 Lv1 100%/4.2턴 → Lv30 100%/4.2턴, 완전히 평평함).
  레벨 성장(스탯 배분)이 이 벤치마크에 사실상 아무 영향도 못 준다는 뜻 —
  스탯 투자를 안 해도 이미 이겨버리는 구간이라 성장이 "느껴질" 수가 없음.
- **무기 없이(맨주먹) 돌리면 반대로 마법사/헌터는 레벨 30까지도 승률이
  0~7%에 머무름** — `battle-adapter.js`가 ATK/MATK를 오직 장비의
  `combatReal`에서만 주고(맨주먹이면 ATK만 +5, MATK는 절대 안 붙음),
  화살 같은 개인 자원도 오직 장비(`grantsResource`)로만 채워서(로스터의
  `personalResources` 필드 자체를 어댑터가 안 읽음) — 마법사는 MATK=0이라
  Fire Ball 데미지가 항상 0, 헌터는 화살이 0이라 Shoot을 아예 못 씀. 즉
  **INT/DEX에 아무리 투자해도 무기가 없으면 그 투자가 데미지에 전혀
  반영되지 않는다**(스탯 자체는 투자한 대로 오르지만, 데미지 공식이
  `MATK × dampedINT × coefficient`라 MATK가 0이면 전부 0). 이건 밸런스
  수치 문제가 아니라 "물리 클래스는 맨주먹 안전장치가 있는데 마법 클래스는
  그게 없다"는 구조적 비대칭 — 다음 밸런싱 세션에서 참고할 것(맨주먹 ATK+5
  안전장치처럼 최소 MATK 안전장치를 줄지, 아니면 "마법 클래스는 반드시
  초반에 완드를 사야 한다"는 설계를 의도된 것으로 그대로 둘지는 아직
  미결정 — 사용자와 상의 필요).
- **`simulate.js` 자체의 기본 샘플 매치업**(아군 전사+궁수 2인 vs 고블린
  2, 이미 무기 낀 상태로 설계된 고정 픽스처)도 동일하게 승률 100%/평균
  3.2턴로 나오고, **`printReport()`가 자체적으로 "판정: 너무 쉬움 — 난이도를
  올릴 여지가 있음"이라고 이미 판정하고 있었다** — `simulate.js`가 깨져
  있어서 이 판정 자체가 그동안 한 번도 정상적으로 안 보였던 것으로 보임
  (전 항목의 버그와 연결됨).
- **결론**: 사용자가 플레이 테스트로 느낀 "지나칠 정도로 강한 구간"은 레벨업에
  따른 스탯 성장 자체보다는 **"장비만 갖추면 초반 던전이 레벨 1부터 이미
  거의 즉시 트리비얼해진다"** 쪽에 더 가까울 가능성이 높다 — 스탯 감쇠
  (`STAT_DAMPING_*`)가 의도대로 작동해서 레벨업으로 인한 극적인 변화는
  이미 억제돼 있는데, 반대로 시작 무기 자체의 ATK 절댓값(장비는 감쇠 대상이
  아님, CLAUDE.md의 기존 설계 결정 그대로)이 초반 콘텐츠 난이도 대비 너무
  높게 잡혀 있어서 "성장을 느낄 새도 없이 이미 이겨버리는" 구간이 레벨 1
  직후부터 시작되는 것으로 보임. 이번 조사는 고블린 왕국 최초 전투 하나만
  고정 벤치마크로 썼으므로(버프/디버프 캡 축소는 같은 날 별도로 완료함,
  "알려진 미구현 / 보류 항목" 섹션 참조), 다음 세션에서 **던전별 실제
  몬스터 구성(battle-select.html/battle-themes.js의 BATTLE_THEMES) 대비
  레벨 진행이 맞물리는지 점검할 가치가 있음** — 아직 미착수.

### 2026-08-15 — 레벨 10 4인 파티로 전 전투(고블린의 왕 제외) 실측: "고블린 수송대"가 사실상 클리어 불가능

버프/디버프 캡 축소 직후, 사용자 요청으로 레벨 10짜리 실전형 4인 파티(전사
전열+아군보호 / 헌터·마법사·사제 후열, 스탯은 주력 70%+SPD 30%로 분배, 상점
시작 무기+방어구 1세트 장착)를 만들어 고블린 왕국 왕 전투(`goblin-king`)를
제외한 나머지 6개 전투를 실제 `spawnEnemies()` 확률 그대로 150회씩 돌림
(`web/battle-adapter.js`의 `runBattle()`을 그대로 사용 — 실제 게임과 완전히
같은 경로).

- **고블린과 놀기/조금 강한 고블린/고블린 전사들/고귀한 고블린들/고블린
  성채 — 전부 승률 100%, 3턴 클리어.** 레벨 10짜리 4인 정예 파티라 이
  구간들은 이미 압도적으로 쉬움(예상된 결과 — 이 던전들은 훨씬 낮은 레벨대를
  위한 콘텐츠).
- **고블린 수송대(`goblin-cart-raid`, aftermath 전용) — 승률 0%, 150회 전부
  100턴 타임아웃.** 원인은 명확함: `goblin_cart`(마차)의 `maxHp`가
  **300,000**인데, 레벨 10 파티가 100턴 동안 낼 수 있는 누적 피해량은
  약 130,000(전투 로그 실측 — 마차를 제외한 호위 고블린들은 파티의 광역기에
  둘째 턴에 전멸해서 이후론 마차 하나만 남아 온전히 화력을 다 받는데도
  이 정도). **300,000 / 100턴 ≈ 턴당 3,000 데미지가 필요한데, 레벨 10
  파티의 실측 지속 화력은 턴당 1,300 안팍** — 산술적으로 이 레벨대에서는
  절대 못 깨는 구조. 입장 조건은 `clearedBattle: noble-goblins`(왕국 3번째
  던전 전, 비교적 초반에 열림)뿐이라, 열리는 시점과 실제로 깰 수 있는
  전력 수준 사이에 큰 격차가 있어 보임 — 다음 밸런싱 세션에서 마차 HP를
  낮추거나, 입장 조건에 권장 레벨/전력 기준을 추가하는 것을 검토할 가치가
  있음(아직 미착수, 사용자 확인 필요).
- **부수적으로 발견한 별개 버그(수정 안 함, 다음 세션용)**: `BATTLE_MONSTER_POOLS`의
  각 몬스터 항목에 있는 `row`("front"/"back") 필드가 **실제 전투에는 전혀
  반영되지 않는다.** `dispatch.html`/`battle-view.html` 둘 다 `spawnEnemies(battleId)`
  결과에서 `monsterId`만 뽑아 `enemySpawnKeys`로 넘기고(`row`는 그 시점에
  버려짐), `battle-adapter.js`의 `buildEnemyFromMonsterKey()`도 `character.row`를
  전혀 설정하지 않는다 — `BattleCharacter` 생성자 기본값(`this.row = "front"`)이
  그대로 남아서 **적은 항상 전원 "front"로 취급된다.** 예를 들어 고블린
  수송대의 마차(`row:"back"`, 호위 뒤에 숨어야 정상)와 고블린 주술사
  (`row:"back"`)도 실제 전투에선 다른 전열 몬스터와 똑같이 정면에 노출됨
  — `targetPriority:"backRow"` 스킬(헌터의 Shoot 등)이 노리는 "후열 우선"
  자체가 지금은 사실상 무의미함(적 쪽엔 후열이 존재한 적이 없으므로). 이번
  조사에서 우연히 로그로 확인함(디버그 스크립트) — 아군 쪽 row는
  `battle-adapter.js:279`에서 정상적으로 설정되므로 아군 진형 시스템 자체는
  멀쩡함, 적 쪽만 빠짐. 고치려면 `buildEnemyFromMonsterKey(monsterTable,
  monsterKey, instanceIndex, row)`에 `row` 매개변수를 추가하고, `runBattle()`의
  `enemySpawnKeys`를 `{monsterId, row}` 객체 배열로 바꿔서 호출부(`dispatch.html`/
  `battle-view.html`)까지 같이 고쳐야 함.

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

## 알려진 버그 — 전직하면 하위 직업 스킬을 영영 못 배우던 문제 (2026-08-15, 수정됨)

플레이 테스트 중 발견: `character-sheet.html`의 `jobSkillTable()`이
`SKILL_TABLE[data.job]`(딱 지금 직업)만 봤다. 전직 즉시 `data.job`이
바뀌므로, 전직 전 단계에서 아직 안 배운 스킬은 그 순간 전부 습득
불가능해졌다. 실측: 사제(기본 직업) 스킬 20개인데 비숍(전직 후) 자체
스킬은 3개뿐 — 전직 직전에 사제 스킬을 다 못 배웠다면 나머지는 영영
못 배우게 됨. `learnedSkillObjs()`도 같은 함수를 써서, **이미 배운
사제 스킬이 전직 후 목록에서 아예 사라지는(사용 자체가 막히는 건
아니고 Sheet 화면에서 안 보이게 되는) 부작용**도 같이 있었음 — 신고된
증상보다 실제 영향 범위가 더 컸음.

`jobAncestryChain(job)`을 추가해서 `JOB_ADVANCEMENT_TABLE`을 거꾸로
훑어 지금 직업에 도달하기까지 거친 모든 하위 직업을 찾고,
`jobSkillTable()`이 그 경로 전체의 스킬을 합쳐서 반환하도록 고침(같은
이름 스킬이 여러 단계에 겹치면 한 번만 포함). `isJobOrDescendantOf`
(J.Item 착용 판정에 이미 있던 함수)와 탐색 방향이 반대라 재사용은 못
했음 — 그건 "하위인가"만 boolean으로 답하지 실제 경로 목록을 안 만들어줌.

실측 검증: Lv.30 사제 생성 → 전직 전 사제 스킬 20개 노출 확인 → 비숍
전직 → 비숍 자체 스킬 3개(Advent Angel 등) + 사제 스킬 전부가 동시에
노출되는 것 확인, 다음 전직(카디널)도 정상 노출 → 콘솔 에러 0건 →
테스트 캐릭터 정리.

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
- **(완료, 2026-08-15)** 전투 중 버프/디버프가 아무리 복리로 무한히
  중첩돼도 최종 `effective` 값이 넘지 못하는 상/하한을 50~2000%에서
  50~500%로 축소함. 사용자가 말한 "50~2000%"는 스킬 `effect.value`(그건
  -70~+100% 범위뿐임, 20만 스킬 순회 실측 완료)가 아니라
  `src/character.js`의 `calculateEffectiveStat(realVal, bonusVal)`이었음 —
  STR/INT/DEX/SPD/LUK/ATK/MATK/DEF/MDEF 전부 이 공식을 그대로 씀:
  ```js
  calculateEffectiveStat(realVal, bonusVal) {
    const maxCap = realVal * 5;     // 500% (2026-08-15에 2000%에서 축소)
    const minFloor = realVal * 0.5; // 50%
    return Math.max(minFloor, Math.min(maxCap, realVal + bonusVal));
  }
  ```
  이 캡을 전제로 역산돼 있던 의존 공식도 같이 맞춤: `src/registries.js`의
  `LUK_GROWTH_MAX_RATIO`(20→5, LUK 크리티컬 성장 로그 곡선 — "캡 도달 시
  정확히 3배"라는 설계 의도가 `LUK_LOG_SCALE` 재계산으로 그대로 유지됨),
  `src/skillResolution.js`의 `describeStatCap()`("더 이상 증가/감소할 수
  없다" 판정 임계값), `web/character-sheet.html`의 `calcEffective()`(같은
  공식의 UI 표시용 사본, `real * 20` → `real * 5`)까지. `grep -rn "\* 20\b"
  src/*.js web/*.js web/*.html`로 재확인한 결과 남은 `* 20`은 전부
  `baseHp + str*20`(Max HP 공식, 캡과 무관한 별개 상수) 뿐이라 안 건드림.
  전체 회귀(`index.js`+`demo-*.js` 27/27) 통과, `simulate.js`로 재확인함.

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

**`dispatch.html`/`battle-view.html`/`battle-encounters.js`/`battle-adapter.js`
전환 완료**(2026-08-15) — **이걸로 모든 페이지의 localStorage → Supabase
전환이 끝났다.** 서버 측 보상 검증(클라이언트가 계산한 exp/gold/loot를
그대로 믿고 커밋하는 구조)은 명시적으로 이번 범위 밖으로 남김 — 기존과
동일한 클라이언트-신뢰 모델을 그대로 포팅했고, 이 잔여 위험은 이 문서
아래 "API 단계에서 검증/방어가 필요한 지점"에 계속 남아있음.

- 캐릭터 장착 장비: `characters` 테이블에 `equipment` 컬럼이 없으므로
  `warehouse_items`를 `held_by`로 조회해서 슬롯별로 조립한 뒤
  `battle-adapter.js`에 넘김(`sumEquipmentCombatStats`/맨주먹 판정이
  `rosterChar.equipment`를 직접 읽는 걸 확인하고 반영 — 안 하면 전원
  맨주먹(ATK 5)으로 계산됨).
- **`battle-encounters.js`/`battle-adapter.js`는 DB 쿼리 대신 "주입 캐시"
  패턴으로 바꿈** — `setMonsterRoster()`/`setSkillTable()`을 각 페이지가
  부트스트랩에서 한 번만 호출해 값을 넣어두고, `getMonsterTable()`/
  `registerKnownSkills()`는 그 캐시를 동기로 읽기만 함. 이유: 파견
  시뮬레이션이 `while (spent < TURN_BUDGET)` 루프 안에서 전투마다
  `spawnEnemies()`(⊃`getMonsterTable()`)와 `registerKnownSkills()`를
  호출하는데(2000턴 예산이면 실측 500회 이상), 매번 비동기 DB 쿼리를
  걸면 수백 번의 왕복이 생겨 감당이 안 됨.
- **이번에 새로 발견해서 같이 고친 심각한 버그**: `battle-adapter.js`의
  `getSkillTable()`이 여전히 `localStorage.getItem("battleSim_skillTable")`을
  동기로 읽고 있었는데, DB 전환이 진행되면서 그 키를 채워주는 페이지가
  하나도 안 남았다(`character-sheet.html`도 이미 `game_content`를 직접
  조회하도록 바뀌어서 더 이상 그 키에 쓰지 않음). 즉 **모든 전투가
  스킬을 하나도 등록하지 못한 채 돌고 있었다**(맨주먹 `ATTACK`만 동작,
  나머지 스킬은 패턴에서 참조해도 조용히 무시됨 — 크래시가 안 나서
  겉으로 티가 안 남). `setSkillTable()` 주입으로 고침.
- **실측 검증**(둘 다 실제 UI로): 직접 전투 — 스킬 레지스트리에
  165개 스킬이 정상 등록됨을 확인(수정 전이었다면 1개도 안 등록됐을
  것), 패배 시 보상 없음 확인, 스탯을 임시로 올려 승리 유도 후
  exp 100→116/골드 3000→3006/`battle_progress` cleared:true 정확히
  반영 확인. 파견 — 티켓 10→9, 506회 전투 100% 승률, 화면 표시 결과
  (경험치 1,154/골드 427/전리품 11개)가 DB에 저장된 값과 정확히 일치
  확인. 전부 테스트 후 정리함.
- **오늘 범위 밖에서 발견한 별개 버그(수정 안 함, 다음 세션용)**:
  `battle-view.html`의 결과 배너("OOO의 파티는 승리했다!")가 항상
  "플레이어"로 뜬다 — `src/engine.js`의 `startBattle(maxTurns, username)`이
  `username` 인자를 내부 로그 문구에만 쓰고 반환 객체(`result`)에는 안
  담아서, `result.username`이 항상 `undefined`라 폴백 문구가 항상 뜸.
  **이번 세션 이전부터 있던 버그**(첫 커밋부터 동일 코드, `git show`로
  확인함) — 오늘 DB 전환과 무관. 고치려면 `startBattle`의 반환 객체에
  `username`을 포함시키면 됨.

**정리 — Supabase 전환 완료된 전체 페이지(10개, 2026-08-15에 2개 추가 발견돼 12개로 정정)**:
`roster-index.html`/`hire.html`/`village.html`/`character-sheet.html`/
`guild.html`/`shop.html`/`refinery.html`/`workshop.html`/
`battle-select.html`/`dispatch.html`/`battle-view.html`/`roster-select.html`/
`item.html`(+ 공유 스크립트 `battle-encounters.js`/`battle-adapter.js`).

**2026-08-15 발견 — 전환 목록에서 완전히 빠뜨렸던 페이지 2개**: 플레이
테스트 중 "용병이 있는데 로스터 선택 화면에서 하나도 안 보인다"는 신고로
발견함. `roster-select.html`(전투 시작 전 파티 선택 화면)과 `item.html`
(인벤토리 조회 화면) 둘 다 nav.js에 실제로 연결돼 있는 라이브 페이지인데
전날 "게임 페이지 10개 전환" 작업 목록에서 통째로 빠졌었음 — 여전히
`localStorage.getItem("battleSim_roster"/"battleSim_warehouse")`를 읽고
있어서 매번 빈 배열만 나왔음. 이 사고를 계기로 `grep -rl "battleSim_"
web/*.html web/*.js`로 전체 재점검함 — 나온 결과 중 실제 라이브 코드가
남아있던 건 이 둘뿐이었고, 나머지는 전부 이미 알려진 관리자 편집기
페이지들(아래) 아니면 이미 전환된 파일들의 과거 설명 주석뿐이었음.
`roster-select.html`은 겸사겸사 자체적으로 갖고 있던 낡은
`BATTLE_NAMES`/`BATTLE_MONSTER_POOLS` 사본(2026-08-14에 다른 3곳에서
고쳤던 것과 동일한 종류의 버그가 이 파일에만 남아있었음 — "gate-ambush"
존재+"goblin-cart-raid" 누락)도 같이 공용 소스로 정리함. 둘 다 실제 UI로
검증 완료(로스터 선택→전투 진입, 인벤토리 장착/창고 아이템 정확히 분류
표시).

**앞으로 이런 종류의 누락을 다시 만들면**: `grep -rl "battleSim_" web/*.html
web/*.js`로 전체를 훑어서 관리자 편집기(아래) 목록에 없는 파일이 나오면
그게 놓친 페이지임 — 이번에 발견한 방법 그대로 재사용 가능.

**아직 안 옮긴 것**: 관리자 전용 편집기 4개(`skill-table-editor.html`/
`job-table-editor.html`/`shop-table-editor.html`/`monster-roster.html`/
`monster-sheet.html`)와 `dev-tools.html`/`feature-requests.html` — 전부
`battleSim_username==="2inkle"` 기반 접근 제어를 그대로 쓰고 있어서
`profiles.is_admin`으로 옮기는 작업과 함께 별도로 처리해야 함(nav.js는
이미 옮겼지만 이 페이지들 자체의 내부 로직은 아직 손 안 댐). 게임 플레이
경험과는 무관한 관리자 도구라 우선순위가 낮음. `battle-result.html`도
`battleSim_`을 안 쓰지만 이건 원래도 실제 데이터에 연결 안 된 초안
페이지(`EXAMPLE_RESULT` 하드코딩)라 전환 대상이 아님 — 헷갈리지 말 것.

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
