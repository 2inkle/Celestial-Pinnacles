// ============================================================================
// 브라우저에서도 그대로 로드해 쓸 수 있게 하는 최소 CommonJS 래퍼. module/require를
// "매개변수"로 명시적으로 넘기는 게 핵심 — 만약 이 안에서 var module = ...처럼
// 새로 선언해버리면(매개변수가 아니라 var로), var 호이스팅 때문에 Node가 진짜로
// 제공하는 module 매개변수를 가려버리는 문제가 생김(실제로 한 번 겪었음). 그래서
// 아래처럼 즉시실행함수의 매개변수 자리에서 처리함 — 이러면 Node에서는 진짜
// module/require가 그대로 전달되고, 브라우저(둘 다 없음)에서는 그 자리에서 새로
// 만들어서 쓰되 여러 <script> 태그가 이 함수 스코프 안에 격리되어 서로의 최상위
// const/let 선언과 충돌하지 않음.
// ============================================================================
(function (module, require) {
  if (!module) {
    module = { exports: {} };
    require = function () { return (typeof window !== "undefined" && window.BattleSim) || {}; };
  }

const { JobRegistry } = require("./registries");

// ============================================================================
// 전투 캐릭터 클래스
//
// ============================================================================
// 조건부 패시브의 "조건" 판정 레지스트리 — CONDITION_TYPES(패턴빌더)와 같은
// 정신의 확장 가능한 룩업. 새 조건이 필요하면 함수 하나만 추가하면 됨.
// 각 함수는 (character, condition) -> boolean.
// ============================================================================
const PASSIVE_CONDITION_CHECKERS = {
  isGuarding: (character) => character.isGuarding === true,
  isShielded: (character) => character.shieldCharges > 0,
  hasBarrier: (character) => character.barrierHp > 0,
  guardAlliesIs: (character, condition) => character.guardAllies === (condition.value ?? true),
  rowIs: (character, condition) => character.row === condition.value,
  hpPctBelow: (character, condition) => (character.currentHp / character.maxHp) * 100 < condition.value,
  hpPctAbove: (character, condition) => (character.currentHp / character.maxHp) * 100 > condition.value,
};

// 스탯 계층 구조:
//  1) effective* (realStat + bonusStat, 상하한 클램프) : 전투 중 버프/디버프로
//     변동 가능. 스킬 대미지 계수, 치명타율, 행동속도에만 영향을 준다.
//  2) real* 기준 고정값 : maxHp / maxSp. 전투 시작 시점 스탯으로 고정되며
//     전투 중 버프로 최대치 자체가 흔들리지 않는다.
//  3) real* 기준 정보창 전용값 : maxPatternSlots / weightCapacity.
//     스탯 재분배(리스펙) 전에는 전투 중 버프에 영향받지 않는다.
// ============================================================================
class BattleCharacter {
  constructor(name, side, realStats = {}) {
    this.name = name;
    // 로스터 캐릭터와 매칭할 고유 식별자(예: "2inkle_1"). 이름은 중복될 수
    // 있어서 전투 후 경험치를 정확한 캐릭터에게 돌려주려면 이게 필요함.
    // CharacterImporter가 로스터 데이터의 id를 그대로 넣어줌(없으면 null).
    this.id = null;
    this.side = side;
    // 진형 — "front"(전열) | "back"(후열). 지금은 존재만 함(파생 매커니즘 미연결).
    this.row = "front";
    // 아군 보호 — row가 "front"일 때만 의미 있음. true면 단일/다수 타겟 공격의
    // 최우선 타겟이 됨(전체 타겟 공격은 이 규칙과 무관). 후열이면 값이 true여도
    // 무시됨(전열로 돌아오면 다시 적용).
    this.guardAllies = false;
    this.job = JobRegistry.create();

    this.realStr = realStats.str ?? 10;
    this.realInt = realStats.int ?? 10;
    this.realDex = realStats.dex ?? 10;
    this.realSpd = realStats.spd ?? 10;
    this.realLuk = realStats.luk ?? 10;

    this.bonusStr = 0;
    this.bonusInt = 0;
    this.bonusDex = 0;
    this.bonusSpd = 0;
    this.bonusLuk = 0;

    this.actionGauge = 0;
    // 개전 선공용 — 전투 시작(resetForBattle) 시 게이지를 이 값으로 되돌림.
    // 0이면 기존대로 빈 게이지로 시작. 어댑터가 몬스터 설정을 보고 채워줌.
    this.initialActionGauge = 0;
    this.patternSlots = [];

    // --- 전투 스탯: 전적으로 장비 의존, 기본 0 (스탯 포인트로 투자 불가) ---
    // STR/INT 등과 동일하게 real/bonus/effective 구조. real은 장비 장착 시점에
    // 고정되고 전투 중 절대 안 바뀜(realDef의 퍼센트 감소 규칙이 성립하려면
    // 이 값이 안정적이어야 함) — bonus만 버프/디버프(atkUp/defDown 등)로 변동.
    this.realAtk = 0;
    this.bonusAtk = 0;
    this.realMatk = 0;
    this.bonusMatk = 0;
    this.realDef = 0;
    this.bonusDef = 0;
    // MDEF(마법방어력) — DEF와 완전히 같은 규칙(real 고정 + bonus 변동, 퍼센트+절대값
    // 2단 감소)을 그대로 따르되, 물리 데미지가 아니라 마법 데미지에 적용됨
    // (takeDamage()의 damageType 인자로 물리/마법 어느 쪽을 쓸지 결정).
    this.realMdef = 0;
    this.bonusMdef = 0;
    // 소환 효율 — 다른 전투 스탯(ATK/DEF 등)과 달리 real 값만 존재함. 전투 중
    // 버프/디버프로는 절대 안 변함(소환물의 성능이 실시간으로 바뀌는 유일한
    // 경로는 LUK의 증감뿐). ⚠ ATK/DEF와 달리 "0이면 위력 0"이 아니라 "0이
    // 100% 효율(기준선)"임 — 장비/스킬이 하나도 없어도 소환 자체는 정상
    // 동작하고, 장비의 "SummonEff +N%" 옵션이 그대로 이 값에 더해짐(예:
    // +30%짜리를 착용하면 realSummonEff=30, 즉 130% 효율). 실제 배율 환산은
    // SUMMON 액션(registries.js)에서 (1 + realSummonEff/100)으로 처리함.
    this.realSummonEff = 0;

    // 패시브 보정 — 장비(combatBonus와 별개인 passiveBonus)와 학습한 패시브
    // 스킬(learnedSkillNames 중 passive:true인 것)에서 모아 어댑터가 전투 시작
    // 전에 한 번 채워 넣는 상시 배율 모음. real류(realAtk 등)와 같은 성격이라
    // resetForBattle()이 건드리지 않음(장비/패시브는 전투 중에 안 바뀌므로).
    // 키: physicalDamageDealtPct/physicalDamageTakenPct/magicDamageDealtPct/
    //     magicDamageTakenPct/hpCostReductionPct/spCostReductionPct/
    //     healingDealtPct/lifestealPct — 전부 % 단위, 없으면 0 취급.
    this.passiveMods = {};

    // 크리티컬 배율 — passiveMods(합산)와 달리 "여러 출처 중 가장 높은 것
    // 하나만" 적용되는 값이라 별도 필드로 분리함. 어댑터가 장비/패시브
    // 스킬들의 critMultiplier 중 최댓값을 여기 넣어줌(없으면 0 → 아래
    // critMultiplier 게터가 기본값 1.5를 씀). 확률(critChancePct)은 정상적으로
    // 합산되는 값이라 그냥 passiveMods에 들어감.
    this.critMultiplierBonus = 0;

    // 조건부 패시브 — passiveMods와 키는 완전히 같지만(physicalDamageDealtPct
    // 등), "항상"이 아니라 "이 유닛이 지금 특정 상태일 때만" 더해지는 목록.
    // 예: 패링(Guard) 중이면 가하는 물리피해+100%, 호위 세팅을 켜두면 받는
    // 물리피해-15%. 배열이라 여러 조건부 패시브가 동시에 있어도 됨(각자
    // 독립적으로 판정해서 전부 더함). getPassiveModValue()가 이 목록과
    // passiveMods를 합쳐서 실제 적용값을 계산함 — 엔진의 다른 곳(데미지 계산,
    // 비용 계산 등)은 항상 this.passiveMods를 직접 읽는 대신 이 메서드를 씀.
    // 어댑터가 passiveMods와 같은 시점에 한 번만 채워 넣음(real류와 같은
    // 성격이라 resetForBattle() 대상 아님).
    //   { key: "physicalDamageDealtPct", value: 100, condition: { type:"isGuarding" } }
    this.conditionalPassiveMods = [];

    // 지속 효과(출혈/재생/탈진 등) — 이 유닛이 행동하기 직전에 틱(BattleEngine.
    // processActiveTicks)이 자동으로 HP/SP를 증감시키고 remainingTicks를
    // 깎음. 버프/디버프처럼 전투 세션에만 의미 있는 상태라 resetForBattle()
    // 대상. { name, kind:"hp"|"sp", amountPerTick, remainingTicks } 배열.
    this.activeTicks = [];

    // 버프/디버프(maxHpUp/maxHpDown 등) 및 장비/패시브스킬의 고정치 보너스로
    // 전투 세션 동안 누적되는 보정치. real/bonus 스탯 시스템과 별개로, "이번
    // 전투에서 걸린 효과 + 장착/학습 중인 것들의 합"만 담는 자리.
    this.maxHpBonus = 0;
    this.maxSpBonus = 0; // maxHpBonus와 짝(예전엔 SP쪽엔 이 필드 자체가 없었음)

    // 몬스터 전용 — 스탯 공식(200+STR×20)을 무시하고 최대 HP/SP를 직접 지정.
    // null이면 기존 공식대로. 어댑터가 몬스터 정의의 maxHp/maxSp를 여기 넣어줌.
    this.maxHpOverride = null;
    this.maxSpOverride = null;

    // 개인 자원(화살/탄환/열정 등) — 진영 공유 자원(FactionResourceManager)과
    // 별개로 유닛 개인이 들고 있음. { key: { current, max } } 형태. 화살 같은
    // 건 임포터/캐릭터 데이터가 있어야만 생기는 opt-in 자원이지만, TP는
    // HP/SP처럼 모든 유닛이 기본으로 갖고 시작함(100/100) — 부활 제한용
    // 자원이라 그 외 사용처는 거의 없음. resetForBattle()에서도 100으로 리셋.
    this.personalResources = { tp: { current: 100, max: 100 } };

    // 선딜레이 스킬을 준비 중인 동안 true — BattleEngine이 이 유닛을 다음 행동
    // 후보에서 제외하는 데 씀(스킬이 발동/실패로 해결될 때까지).
    this.isPreparing = false;

    // 이 유닛이 쓰러졌을 때 상대 진영에 지급되는 경험치. 몬스터 쪽에만 의미
    // 있는 값이라 기본 0(캐릭터끼리 싸울 때 서로 경험치를 주지 않게).
    // 파티 전체 총량(BattleEngine.battleExpGained, Result 화면 표시용)과는
    // 별개로, 몬스터가 쓰러진 "그 순간 생존해있던" 아군 각자에게도 동일한
    // 값을 gainExp에 누적함 — 전투 종료 후 이 캐릭터의 id로 정확히 경험치를
    // 돌려주기 위한 개인별 기록(중간에 죽은 캐릭터는 그 이후 처치분을 못 받음).
    this.expReward = 0;
    this.gainExp = 0;

    // 이 유닛의 등급 태그 — "user"(플레이어 캐릭터) | "creature"(소환수 등
    // 몬스터도 유저 캐릭터도 아닌 존재) | "normal"|"elite"|"boss"(몬스터
    // 등급). 특정 등급을 제외/감소 대상으로 삼는 효과(예: "보스 제외",
    // "보스타입에게 효과 감소")가 이 값을 읽음. 기본값 "user" — 어댑터가
    // 몬스터/소환수를 만들 때 그에 맞는 값으로 덮어씀.
    this.creatureTier = "user";

    // Hunting Sign류 — 이 유닛이 "표식" 찍힌 상태인지. 찍혀있으면 화살을
    // 소비하는 스킬들이 자동으로 이 유닛을 최우선 타겟으로 삼음(resolveTargets
    // 참고). 여러 유닛이 동시에 찍혀있을 수도 있음(재사용 시 이전 표식을
    // 자동으로 지우지는 않음 — 지우는 효과가 따로 필요하면 그때 만들기로 함).
    this.huntingSignMarked = false;

    // 비전 방어막류 — Guard/Shield("N회 차단")와는 완전히 다른 개념. 이건
    // "수치형" 임시 체력이라, 걸려있는 동안 들어오는 피해를 HP보다 먼저
    // 이 값에서 깎고, 다 떨어지면 그제서야 HP가 깎이기 시작함(피해 총량을
    // 흡수하는 방식 — 몇 번 맞았는지가 아니라 얼마나 맞았는지로 소모됨).
    // 버프처럼 전투 세션 동안 유지되는 값이라 resetForBattle 대상.
    this.barrierHp = 0;

    // ========================================================================
    // 스탠스(범용) — "주문 집속", "마나 실드", 음유시인의 "연주 상태" 같은
    // "진입하면 이후 스킬들의 코스트/딜레이/위력 계산식 자체가 바뀌는" 상태를
    // 전부 이 하나의 메커니즘으로 표현함. 별도 레지스트리에 스탠스를 미리
    // 등록해두는 방식이 아니라, "스탠스 진입" 효과(enterStance)가 mods 객체를
    // 통째로 만들어서 여기 심어주는 방식 — 그래서 새 스탠스를 만들 때 엔진
    // 코드를 안 건드리고 스킬 데이터만 추가하면 됨(최대 확장성).
    //
    // { key: modsObject } 형태의 맵이라 여러 스탠스가 동시에 켜져있을 수
    // 있음(주문 집속 + 마나 실드처럼, 명시적으로 배타 관계가 아닌 이상
    // 자유롭게 중첩됨) — enterStance에 exclusiveGroup을 지정한 경우에만
    // "같은 그룹끼리" 상호배타가 적용됨(음유시인의 "노래는 한 번에 하나만"
    // 처럼). 그룹 지정이 없으면 아무것도 안 건드리고 그냥 추가/갱신만 함.
    //
    // 각 스탠스의 mods가 지원하는 필드(전부 선택, 여러 스탠스에 동시에
    // 있으면 배율형은 곱연산으로, %형은 합산으로 전부 반영됨):
    //   spCostMultiplier / hpCostMultiplier   — 코스트 배율(payCosts에서 적용)
    //   preDelayMultiplier / postDelayMultiplier — 딜레이 배율(engine.js에서 적용)
    //   powerMultiplier                        — 스킬 위력 배율(computeSkillPower에서 적용)
    //   resourceOnCost: {resource, costType, ratio} — 코스트 지불량에 비례해서
    //     특정 personalResource를 적립(예: SP 소모량×2를 집속 마력에 적립)
    //   damageToSpRatio                        — 받는 피해의 일부를 SP로 대신
    //     받음(takeDamage에서 적용, 마나실드류)
    //   그 외 숫자 필드(예: magicDamageDealtPct)는 getPassiveModValue()가
    //     passiveMods/conditionalPassiveMods와 함께 자동으로 합산해줌 — 스탠스
    //     중엔 상시 배율처럼 그냥 얹히는 값들은 이 방식으로 별도 훅 없이 커버됨.
    // ========================================================================
    this.stances = {};

    // 이 유닛이 쓰러졌을 때 지급되는 골드/드랍 테이블. 골드/아이템은 개인이
    // 아니라 용병단 전체가 공유하는 자원이라 캐릭터별로 누적하지 않고
    // BattleEngine이 전투 단위로 모음(battleGoldGained/battleLootGained 참고).
    this.goldReward = 0;
    // [{ name, category, chance(0~1), quantity:[min,max] }, ...]
    this.dropTable = [];

    // Guard(1회성 상태) — true인 동안 자신에게 들어오는 스킬(행동) 하나 전체의
    // 데미지를 전부 무효화하고 즉시 소모됨(다단히트여도 그 스킬의 히트 전부가
    // 막힘 — "패링"류). guardType으로 어떤 유형의 데미지만 막을지 지정 가능
    // ("physical"|"magic"|"all", 기본 "all"). 판정/소모는 반드시
    // checkAndConsumeGuard()로, 데미지 자체는 takeDamage()로 분리해둠.
    this.isGuarding = false;
    this.guardType = "all";
    // Shield(횟수제 상태) — Guard와는 다른 개념. "받는 피해 판정"을 정확히
    // shieldCharges회만 무효화하고, 히트 하나마다 독립적으로 1씩 깎임(다단히트
    // 스킬이면 처음 N히트만 막히고 나머지는 그대로 들어감 — Holy Shield류
    // "N회 무효화"). Guard보다 나중에 판정됨(Guard가 막으면 Shield는 안 깎임,
    // 즉 Shield가 "보험"으로 남음). Guard와 마찬가지로 이미 활성 상태(charges>0)면
    // 재적용해도 중첩(추가)되지 않음 — 세팅만 하지 누적하지 않음.
    this.shieldCharges = 0;
    this.shieldType = "all";
    // 이 유닛의 처치 보상을 이미 지급했는지(중복 지급 방지) — BattleEngine이 씀
    this._deathProcessed = false;

    this.currentHp = this.maxHp;
    this.currentSp = this.maxSp;
  }

  /**
   * 새 전투가 시작될 때 "이번 전투에서만 의미 있는" 상태를 전부 초기화.
   * BattleEngine 생성자가 각 유닛마다 이 메서드 하나만 호출하면 됨 —
   * 리셋 대상을 엔진 쪽에 따로 나열하지 않고 여기 클래스 안, 필드 선언
   * 바로 옆에 모아둔 이유: 나중에 새 전투 스탯/상태 필드를 추가할 때
   * "이것도 리셋해야 하나?"를 그 필드를 선언하는 바로 이 자리에서 같이
   * 판단하게 되므로, 엔진 쪽 별도 목록에 추가하는 걸 깜빡할 위험이 줄어듦
   * (실제로 bonusAtk/bonusMatk/bonusDef/bonusMdef/bonusStr 등을 엔진 쪽
   * 리셋 목록에 추가하는 걸 빠뜨렸던 적이 있음 — 그 재발 방지용 구조).
   *
   * 리셋하지 않는 것(전투 간 영구적이거나, 자동으로 안 채워져야 하는 것):
   *   real* 스탯/장비 파생값(realStr, realAtk, realDef 등 — 영구),
   *   passiveMods(장비/패시브 스킬에서 온 상시 배율 — real류와 같은 성격),
   *   patternSlots(플레이어가 짠 패턴), personalResources(화살 등 전투 간
   *   소모되는 자원 — 자동 보충 안 됨), guardAllies(보호할지는 상시 설정),
   *   expReward/goldReward/dropTable(몬스터 고유 속성), row.
   */
  resetForBattle() {
    this.bonusStr = 0;
    this.bonusInt = 0;
    this.bonusDex = 0;
    this.bonusSpd = 0;
    this.bonusLuk = 0;

    this.bonusAtk = 0;
    this.bonusMatk = 0;
    this.bonusDef = 0;
    this.bonusMdef = 0;

    this.maxHpBonus = 0; // currentHp를 maxHp로 되돌리기 전에 먼저 0으로 — maxHp가 이 값에 의존함
    this.maxSpBonus = 0;

    // 개전 선공 — initialActionGauge가 설정돼 있으면 0이 아니라 그 값으로
    // 시작함(어댑터가 몬스터의 openingAction을 보고 채워줌). 이게 없으면
    // 어댑터가 게이지를 채워놔도 여기서 0으로 밀려버려서 선공이 무효가 됨.
    this.actionGauge = this.initialActionGauge || 0;
    this.isPreparing = false;

    this.isGuarding = false;
    this.guardType = "all";
    this.shieldCharges = 0;
    this.shieldType = "all";
    this.huntingSignMarked = false;
    this.barrierHp = 0;
    this.stances = {};
    this.gainExp = 0;
    this._deathProcessed = false;
    this.activeTicks = [];

    this.currentHp = this.maxHp;
    this.currentSp = this.maxSp;

    // TP는 화살 등 다른 개인 자원과 달리 "전투당" 자원이라 매 전투 시작 시
    // 100으로 리셋됨(그 외 personalResources는 의도적으로 안 건드림 — 전투
    // 간 이어지는 진짜 소모성 자원이라).
    this.personalResources.tp = { current: 100, max: 100 };
  }

  get isAlive() {
    return this.currentHp > 0;
  }

  /**
   * 이 유닛이 지금 "이 유형(incomingDamageType)의 데미지"를 막는 Guard 상태인지
   * 확인하고, 그렇다면 즉시 소모(다음 호출부턴 false)함. Guard의 guardType이
   * "all"이 아니고 incomingDamageType과 다르면 막지 않고 Guard도 그대로 유지됨
   * (예: 물리 전용 Guard는 마법 공격엔 반응 안 하고 다음 물리 공격을 계속 기다림).
   * ⚠ 반드시 "행동/스킬 하나"당 정확히 한 번만 호출해야 함 — 그 행동이 몇
   * 번을 때리든(다단히트) 이 한 번의 판정 결과를 그 행동의 모든 히트에 그대로
   * 재사용해야, "하나의 스킬이 자신에게 주는 데미지를 전부 차단"이 다단히트
   * 에서도 정확히 성립함(히트마다 다시 부르면 첫 히트에서만 막히고 두 번째
   * 히트부터는 이미 소모된 상태라 그냥 맞아버림 — 잘못된 동작).
   * @param {"physical"|"magic"} incomingDamageType 기본값 "physical"
   * @returns {boolean} 막아야 하면 true(그리고 이미 소모 처리됨)
   */
  checkAndConsumeGuard(incomingDamageType = "physical") {
    if (!this.isGuarding) return false;
    if (this.guardType !== "all" && this.guardType !== incomingDamageType) return false;
    this.isGuarding = false;
    return true;
  }

  /**
   * Guard와 짝을 이루는 판정 — 다른 점은 "몇 회까지"를 세는 카운터라는 것.
   * 히트 하나마다 독립적으로 호출돼야 하고(Guard처럼 스킬 전체에 한 번만
   * 판정하는 캐시를 씌우면 안 됨), 성공할 때마다 shieldCharges가 1씩 깎여서
   * 0이 되면 더 이상 안 막힘. 호출부(applyDamageAndEffects)가 Guard를 먼저
   * 판정하고, Guard가 못 막았을 때만 이걸 호출하는 순서를 지켜야 "Guard 우선,
   * Shield는 보험" 규칙이 성립함.
   * @param {"physical"|"magic"} incomingDamageType 기본값 "physical"
   * @returns {boolean} 막아야 하면 true(그리고 이미 1회 소모 처리됨)
   */
  checkAndConsumeShield(incomingDamageType = "physical") {
    if (this.shieldCharges <= 0) return false;
    if (this.shieldType !== "all" && this.shieldType !== incomingDamageType) return false;
    this.shieldCharges -= 1;
    return true;
  }

  /**
   * passiveMods(항상 적용)와 conditionalPassiveMods(조건이 지금 참일 때만
   * 적용) 두 출처를 합쳐서 실제 적용값을 계산. 엔진의 데미지/비용/회복 계산
   * 코드는 이제 this.passiveMods[key]를 직접 읽지 말고 반드시 이 메서드를
   * 통해서 값을 얻어야 함 — 그래야 "패링 중이면 공격력+100%" 같은 상태부적
   * 패시브가 자동으로 같이 반영됨.
   * @param {string} key passiveMods와 동일한 키(예: "physicalDamageDealtPct")
   * @returns {number} 두 출처를 합친 최종 %값
   */
  getPassiveModValue(key) {
    let total = this.passiveMods[key] || 0;
    // 스탠스 중이면 각 스탠스의 같은 키를 전부 합산 — "%" 계열
    // (magicDamageDealtPct 등)처럼 단순 숫자값인 스탠스 효과는 이 방식으로
    // 별도 훅 없이 자동으로 반영됨(마나실드의 "사용 중 마법공격 150%데미지"
    // 등). 여러 스탠스가 동시에 같은 키를 갖고 있으면 전부 더해짐.
    total += this.getStanceModSum(key);
    (this.conditionalPassiveMods || []).forEach((entry) => {
      if (entry.key !== key) return;
      if (PASSIVE_CONDITION_CHECKERS[entry.condition?.type]?.(this, entry.condition)) {
        total += entry.value;
      }
    });
    return total;
  }

  /** 현재 켜져있는 모든 스탠스에 걸쳐, key에 해당하는 숫자값을 전부 더함
   *  ("%" 계열처럼 여러 개 겹치면 그냥 합산되는 게 자연스러운 필드용). */
  getStanceModSum(key) {
    let total = 0;
    Object.values(this.stances || {}).forEach((mods) => {
      if (typeof mods[key] === "number") total += mods[key];
    });
    return total;
  }

  /** 현재 켜져있는 모든 스탠스에 걸쳐, key에 해당하는 배율을 전부 곱함
   *  (spCostMultiplier/powerMultiplier처럼 여러 개 겹치면 복리로 겹쳐지는
   *  게 자연스러운 필드용). 아무 스탠스에도 없으면 1(변화 없음)을 반환. */
  getStanceMultiplier(key) {
    let mult = 1;
    Object.values(this.stances || {}).forEach((mods) => {
      if (typeof mods[key] === "number") mult *= mods[key];
    });
    return mult;
  }

  /**
   * 데미지를 실제로 HP에 반영. 방어력 처리 2단계(DEF/MDEF 공통 규칙):
   *   1) real(DEF|MDEF) — 퍼센트 감소, 전투 중 절대 안 변하는 고정값(장비로만
   *      결정). 20이면 데미지의 80%만 통과, 30이면 70%만 통과.
   *   2) bonus(DEF|MDEF) — 절대값 감소, 버프/디버프로 오르내림. 1번을 통과하고
   *      남은 데미지에서 그 값만큼 그대로 뺌. 상/하한 규칙(다른 스탯과 동일한
   *      real의 50%~500% 클램프)이 적용된 뒤의 "순수 버프분"만 사용함
   *      (= effective(Def|Mdef) - real(Def|Mdef), calculateEffectiveStat이 이미 클램프한 값).
   * damageType이 "magic"이면 MDEF를, 그 외(기본값 "physical")엔 DEF를 씀 —
   * 어느 쪽을 쓸지는 호출부가 skill.skillType 등을 보고 결정해서 넘겨줘야 함.
   * Guard 판정은 여기서 하지 않음(checkAndConsumeGuard()를 행동 시작 시 미리
   * 호출해서 걸러야 함) — 이 메서드는 순수하게 방어력 적용 + HP 반영만 책임짐.
   * @param {{ ignoreBonusDefPct?: number, minimumDamageBasis?: number }} [options] 2단계(bonus
   *   플랫 차감)를 몇 %만큼 무시할지, 0~100 사이로 알아서 클램프됨(여러 출처가
   *   합산되어 100을 넘게 들어와도 100%로 막힘 — "무시"가 오히려 방어력을
   *   늘려주는 역효과로 뒤집히면 안 되므로). 0(기본값)이면 기존과 동일하게
   *   bonus 전액이 그대로 차감됨. 1단계(real 퍼센트 경감)는 이 옵션과 무관하게
   *   항상 그대로 적용됨("방어력 무시"는 전부가 아니라 버프성 방어력만
   *   무시하고 싶다는 설계). minimumDamageBasis 생략 시 amount를 그대로 씀.
   * @returns {number} 실제로 깎인 데미지(현재 HP보다 큰 값이 들어와도 클램프됨)
   */
  takeDamage(amount, damageType = "physical", options = {}) {
    const isMagic = damageType === "magic";
    const realMitigation = isMagic ? this.realMdef : this.realDef;
    const effectiveMitigation = isMagic ? this.effectiveMdef : this.effectiveDef;

    const percentMultiplier = Math.max(0, 1 - realMitigation / 100);
    const afterPercent = amount * percentMultiplier;

    const clampedBonusMitigation = effectiveMitigation - realMitigation; // 상/하한 규칙 적용된 순수 버프분
    const ignorePct = Math.min(100, Math.max(0, options.ignoreBonusDefPct || 0));
    const effectiveBonusMitigation = clampedBonusMitigation * (1 - ignorePct / 100);
    const afterFlat = Math.max(0, afterPercent - effectiveBonusMitigation);

    // 패시브(장비/패시브 스킬)의 "받는 피해 감소%" — DEF/MDEF 경감이 전부
    // 끝난 마지막 단계에 곱함. 음수(받는 피해 증가) 값도 허용하되 0 밑으로는
    // 안 내려가게 막음.
    const takenPct = this.getPassiveModValue(isMagic ? "magicDamageTakenPct" : "physicalDamageTakenPct");

    // 공격자 등급(creatureTier)별 받는 피해 감소 — options.attackerTier가 넘어오면
    // "damageTakenFrom_{tier}Pct" 키를 추가로 찾아서 합산함. "잡졸에게는 강하지만
    // 보스에겐 그대로"처럼 상대에 따라 갈리는 방어 효과를 표현하기 위함
    // (tierMultiplier가 "가하는 피해"를 등급별로 가르는 것의 반대 방향).
    // takeDamage 자체는 공격자를 모르므로 호출부(applyDamageAndEffects 등)가
    // 넘겨줘야 함 — 안 넘기면 그냥 무시되고 기존 동작 그대로.
    const tierTakenPct = options.attackerTier
      ? this.getPassiveModValue(`damageTakenFrom_${options.attackerTier}Pct`)
      : 0;
    const afterPassive = Math.max(0, afterFlat * (1 - (takenPct + tierTakenPct) / 100));

    // 절대 규칙 — 완전방어(Guard 등)가 막지 않고 타격이 발생한 경우, 방어력이
    // 아무리 높아도(퍼센트 감소+절대값 감소+패시브 감소를 다 거치고도) 최소
    // 10%는 반드시 통과함. 이 함수는 Guard에 막힌 공격에서는 애초에 호출되지
    // 않으므로("Guard 판정은 여기서 하지 않음" 문단 참고, 호출부가 Guard 성공
    // 시 이 메서드를 아예 안 부름) "완전방어가 발동하지 않고 타격이 발생하는
    // 경우"는 이 메서드가 호출되는 모든 경우와 정확히 일치함.
    // 기준값은 기본적으로 amount(이 호출에 실제로 들어온 피해량)지만,
    // options.minimumDamageBasis가 있으면 그걸 대신 씀 — 연타점감처럼 "공격
    // 측에서 의도적으로 위력을 깎는" 요소 때문에 최소피해 보장선 자체가 같이
    // 줄어드는 걸 막기 위함(예: 다단히트가 연타점감으로 반토막나도, 최소
    // 보장선은 "점감 적용 전" 원래 위력 기준 10%를 유지). 방어력 관련 감소는
    // 이 구분과 무관하게 항상 amount에 반영된 뒤 여기까지 옴 — 최소피해
    // 규칙은 "방어로 인한 감소"만 상쇄하기 위한 장치지, 공격 측의 의도된
    // 위력 조정(연타점감 등)까지 무력화하려는 게 아님.
    const minimumBasis = options.minimumDamageBasis ?? amount;
    const minimumDamage = Math.floor(minimumBasis * 0.1);
    const finalAmount = Math.max(minimumDamage, Math.floor(afterPassive));

    // 스탠스(마나실드류) — 최종 피해량의 일정 비율만큼 SP도 추가로 깎임.
    // 감소율 자체는 stanceMods.physicalDamageTakenPct/magicDamageTakenPct로
    // 지정하면 위 takenPct 계산에 자동 합산되므로(getPassiveModValue 참고)
    // 이미 finalAmount에 반영되어 있음 — 여기선 그 결과값 기준으로 SP
    // 코스트만 추가로 뗌(HP 피해 자체를 더 줄이진 않음). 여러 스탠스가
    // 동시에 damageToSpRatio를 갖고 있으면 전부 합산됨.
    const damageToSpRatio = this.getStanceModSum("damageToSpRatio");
    if (damageToSpRatio > 0) {
      const spCost = Math.ceil(finalAmount * damageToSpRatio);
      this.currentSp = Math.max(0, this.currentSp - spCost);
    }

    // 비전 방어막(barrierHp) — HP보다 먼저 이 수치에서 깎임. Guard/Shield처럼
    // "몇 회"가 아니라 "얼마나"로 소모되는 수치형 방어막이라, 데미지가 아무리
    // 커도 barrierHp가 남아있는 한 그만큼은 HP 대신 여기서 흡수됨.
    const barrierAbsorbed = Math.min(this.barrierHp, finalAmount);
    this.barrierHp -= barrierAbsorbed;
    const remainingForHp = finalAmount - barrierAbsorbed;

    const before = this.currentHp;
    this.currentHp = Math.max(0, this.currentHp - remainingForHp);
    const hpLost = before - this.currentHp;
    return barrierAbsorbed + hpLost; // 방어막이 흡수한 분까지 포함한 "실제로 막아낸/받은 피해 총량"
  }

  calculateEffectiveStat(realVal, bonusVal) {
    // 2026-08-15: 상한을 2000%(realVal*20)에서 500%(realVal*5)로 축소 —
    // 버프/디버프가 복리로 무한히 중첩되더라도 실전투 체감상 과도하게
    // 벌어지지 않도록 하한(50%)은 그대로 두고 상한만 좁힘. 의존 상수:
    // src/registries.js의 LUK_GROWTH_MAX_RATIO, src/skillResolution.js의
    // describeStatCap() — 이 값을 또 바꾸면 그 두 곳도 같이 맞춰야 함.
    const maxCap = realVal * 5;
    const minFloor = realVal * 0.5;
    return Math.max(minFloor, Math.min(maxCap, realVal + bonusVal));
  }

  // --- 전투 중 변동 가능 (스킬 계수 / 행동속도 전용) ---
  get effectiveStr() { return this.calculateEffectiveStat(this.realStr, this.bonusStr); }
  get effectiveInt() { return this.calculateEffectiveStat(this.realInt, this.bonusInt); }
  get effectiveDex() { return this.calculateEffectiveStat(this.realDex, this.bonusDex); }
  get effectiveSpd() { return this.calculateEffectiveStat(this.realSpd, this.bonusSpd); }
  get effectiveLuk() { return this.calculateEffectiveStat(this.realLuk, this.bonusLuk); }

  // --- 전투 스탯(ATK/MATK/DEF)도 STR/INT와 완전히 같은 클램프 공식을 그대로 씀 ---
  get effectiveAtk() { return this.calculateEffectiveStat(this.realAtk, this.bonusAtk); }
  get effectiveMatk() { return this.calculateEffectiveStat(this.realMatk, this.bonusMatk); }
  get effectiveDef() { return this.calculateEffectiveStat(this.realDef, this.bonusDef); }
  get effectiveMdef() { return this.calculateEffectiveStat(this.realMdef, this.bonusMdef); }

  get rawSpeed() { return this.job.baseSpeed + this.effectiveSpd * 2; }
  get effectiveSpeed() { return 10 * Math.sqrt(this.rawSpeed); }

  // 버프/디버프 관여 없이 real 값만 씀 — 크리티컬은 장비 투자로 꾸준히 오르는
  // 값이어야지, 순간 버프로 띄우거나 다른 데미지 스탯을 희생해서 만드는 값이
  // 아니어야 한다는 설계 의도. 상위 장비를 맞추다 보면 자연스럽게 충분히
  // 올라가는 정도가 적절함.
  //
  // 최종 확률 = LUK 기반 기본치(realLuk × 0.5) + 장비/패시브의 critChancePct
  // 합산, 100%에서 클램프. 확률은 여러 출처가 전부 더해짐 — 소소한 크리 옵션이
  // 붙은 방패/장갑도 헛되지 않게 하기 위함.
  get critRate() {
    return Math.min(100, this.realLuk * 0.5 + this.getPassiveModValue("critChancePct"));
  }

  // 최종 배율 = 기본 1.5배와 장비/패시브가 주는 배율 중 "가장 높은 것 하나".
  // 확률과 달리 배율은 합산하지 않음(2배 + 1.5배 = 3.5배가 되면 크리 장비를
  // 겹칠수록 배율이 폭발하므로). "확률은 더하고, 배율은 제일 높은 것 하나"가
  // 최종 규칙.
  static get BASE_CRIT_MULTIPLIER() { return 1.5; }
  get critMultiplier() {
    return Math.max(BattleCharacter.BASE_CRIT_MULTIPLIER, this.critMultiplierBonus || 0);
  }

  // --- 전투 시작 시점 realStat 기준 고정 (버프/디버프 영향 없음), 단 maxHpBonus만
  //     전투 세션 중 걸린 효과로 예외적으로 변동됨 ---
  // maxHpOverride/maxSpOverride가 지정돼 있으면 공식 대신 그 값을 기준으로 씀.
  // 유저 캐릭터는 "HP는 STR에서 나온다"는 규칙을 따르지만, 몬스터는 내구도와
  // 화력을 따로 잡아야 하기 때문(예: HP 100만짜리 벽 몬스터를 만들려고 STR을
  // 5만까지 올리면 그 STR로 때리는 평타가 감당 불가능해짐 — 내구도와 공격력이
  // 한 스탯에 묶이면 보스/오브젝트 설계가 아예 불가능해서 분리함).
  // maxHpBonus(버프/장비발 증감)는 override 여부와 무관하게 항상 더해짐.
  get maxHp() {
    const base = this.maxHpOverride != null
      ? this.maxHpOverride
      : this.job.baseHp + Math.floor(this.realStr * 20);
    return base + this.maxHpBonus;
  }
  get maxSp() {
    const base = this.maxSpOverride != null
      ? this.maxSpOverride
      : (this.job.baseSp || 50) + Math.floor(this.realInt * 10);
    return base + this.maxSpBonus;
  }

  // --- 정보창 전용 (realStat 기준 고정) ---
  // patternSlotsOverride가 있으면 그 값을 씀. 몬스터는 슬롯 제한을 받지 않게
  // 하기 위한 것(어댑터가 몬스터를 만들 때 Infinity를 넣어줌) — 유저 캐릭터는
  // INT로 슬롯이 늘어나는 성장 요소지만, 몬스터는 설계자가 의도한 패턴을
  // 그대로 다 쓸 수 있어야 하므로.
  get maxPatternSlots() {
    if (this.patternSlotsOverride != null) return this.patternSlotsOverride;
    return 1 + Math.floor(this.realInt / 10);
  }
  // 무게 용량 — 기본치 5 + DEX/5. 예전엔 기본치가 10이었는데, 그러면 DEX를
  // 하나도 안 찍어도 용량 12라서 상점 풀세트(무게 합계 10~12)가 전부 들어가
  // 무게가 아무 제약이 안 됐음("탱커가 중갑에 대검까지 들 여유가 있는가"라는
  // 선택 자체가 성립하지 않았음). 기본치를 5로 낮춰서 중갑/양손무기를 들려면
  // DEX를 실제로 투자하게 만듦 — STR/SPD/DEX 삼중 배분이 생기고, "가벼운
  // 하위 티어로 버티느냐, DEX를 찍고 무거운 상위 티어를 드느냐"라는 장비
  // 티어 설계의 축도 이때 비로소 작동함.
  get weightCapacity() { return 5 + Math.floor(this.realDex / 5); }
}

module.exports = { BattleCharacter };


  // 브라우저 환경이면 이 모듈의 exports를 공용 네임스페이스에 얹음(Node에서는
  // window가 없으니 아무 일도 안 함. 어차피 Node의 진짜 module.exports는 위에서
  // 그대로 전달받은 그 객체라 이 시점에 이미 다 채워져 있음).
  if (typeof window !== "undefined") {
    window.BattleSim = window.BattleSim || {};
    Object.assign(window.BattleSim, module.exports);
  }
})(typeof module !== "undefined" ? module : undefined, typeof require !== "undefined" ? require : undefined);
