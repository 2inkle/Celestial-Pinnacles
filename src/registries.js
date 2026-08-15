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

// ============================================================================
// 모듈식 레지스트리 (직업, 조건, 행동)
// ============================================================================

const { TEAM_RESOURCE_TYPES } = require("./resourceTypes");
const { applyDealtPassiveMods, applyLifesteal } = require("./combatFormulas");

// skillResolution.js에도 같은 이름·같은 모양으로 있음(중복 — josa 헬퍼가
// 이 코드베이스에서 이미 그렇게 관리되는 것과 동일한 방식). "{증감량} {유형}
// ▷ {대상} ({전} > {후})" — web/battle-view.html이 " ▷ " 포함 여부로 감지해
// 강조 스타일을 입힘. target(유닛 객체)의 creatureTier가 "boss"면 빈 문자열
// 반환 — HP/SP 변화량을 아예 안 보여줌(2026-08-16, skillResolution.js와
// 동일 규칙).
function statChangeLine(target, amount, label, before, after) {
  if (target?.creatureTier === "boss") return "";
  return `${amount} ${label} ▷ ${target.name} (${before} > ${after})`;
}

class BaseJob {
  constructor() {
    this.name = "용병";
    this.baseHp = 200;
    this.baseSp = 50;
    this.baseSpeed = 50;
  }
}

class JobRegistry {
  static create() {
    return new BaseJob();
  }
}

class ConditionRegistry {
  static conditions = new Map();

  static register(key, evalFn) {
    this.conditions.set(key, evalFn);
  }

  static check(key, actor, context, value, slotIndex) {
    const fn = this.conditions.get(key);
    return fn ? fn(actor, context, value, slotIndex) : false;
  }
}

ConditionRegistry.register("ALWAYS", () => true);

ConditionRegistry.register("MY_HP_LESS_THAN_PCT", (actor, ctx, value) => {
  return (actor.currentHp / actor.maxHp) * 100 <= value;
});

// MY_HP_LESS_THAN_PCT의 SP판. "???"의 SP 자가재생 기믹처럼 "SP가 바닥나면
// 스스로 재생을 건다"는 패턴 조건용(2026-08-16).
ConditionRegistry.register("MY_SP_LESS_THAN_PCT", (actor, ctx, value) => {
  return (actor.currentSp / actor.maxSp) * 100 <= value;
});

// 자신이 현재 Guard 상태(패링 등으로 걸린 1회성 데미지 무효화)가 아닐 때 true.
// "패링" 같은 self-guard 스킬을 "이미 Guard 중이면 또 걸지 않는다"는 패턴에 씀.
ConditionRegistry.register("NOT_GUARDING", (actor) => {
  return !actor.isGuarding;
});

// 스탠스 판정 — value로 지정한 key의 스탠스가 지금 켜져있는지(여러 스탠스가
// 동시에 켜져있을 수 있으므로, 그중 이 key가 있는지만 봄). "주문 집속
// 상태에서만 사용 가능" 같은 스킬 사용 조건을 패턴 쪽에 거는 용도(스킬
// 자체엔 이 제약이 없음 — HP%이하 제한 등과 같은 원칙으로, 사용 가능 여부는
// 패턴 조건이 담당).
ConditionRegistry.register("STANCE_IS", (actor, ctx, value) => {
  return !!actor.stances?.[value];
});

// value: 숫자면 팀 자원이 "마법진"(magicCircle) 하나뿐이던 시절과 호환되도록
// 기본값으로 취급. 여러 팀 자원을 구분해서 검사하려면
// { resource:"magicCircle", amount:3 } 형태로 넘기면 됨(resource는
// TEAM_RESOURCE_TYPES 키).
ConditionRegistry.register("FACTION_RESOURCE_GREATER_THAN", (actor, ctx, value) => {
  const isObjectForm = value && typeof value === "object";
  const resourceKey = isObjectForm ? value.resource : "magicCircle";
  const amount = isObjectForm ? value.amount : value;
  const registeredKey = TEAM_RESOURCE_TYPES[resourceKey]?.key || "MAGIC_CIRCLE";
  return ctx.resourceManager.getResource(actor.side, registeredKey) >= amount;
});

// 상대 진영의 자원 보유량 판정 — FACTION_RESOURCE_GREATER_THAN이 "자기 진영"만
// 보는 것과 정확히 대칭. value 형태도 동일(숫자 단독 = magicCircle 기본값,
// 객체 {resource, amount} = 자원 종류 지정). "???"의 Circle Erase처럼 "상대가
// 마법진을 갖고 있을 때만 지운다" — 상대에게 지울 게 없는데 매턴 헛스윙하는
// 낭비를 막는 패턴 조건으로 씀(2026-08-16).
ConditionRegistry.register("OPPONENT_RESOURCE_GREATER_THAN", (actor, ctx, value) => {
  const isObjectForm = value && typeof value === "object";
  const resourceKey = isObjectForm ? value.resource : "magicCircle";
  const amount = isObjectForm ? value.amount : value;
  const registeredKey = TEAM_RESOURCE_TYPES[resourceKey]?.key || "MAGIC_CIRCLE";
  const opponentSide = actor.side === "ally" ? "enemy" : "ally";
  return ctx.resourceManager.getResource(opponentSide, registeredKey) >= amount;
});

// value: "action" | "casting" — 상대 진영 중 그 선딜레이 유형으로 "준비 중"인
// 대상이 하나라도 있으면 true. 목 노리기처럼 "영창 중인 상대가 있으면 반드시
// 사용" 같은 패턴을 만들 때 씀. ctx.prepState는 BattleEngine이 들고 있음.
ConditionRegistry.register("ENEMY_PREPARING_TYPE", (actor, ctx, value) => {
  return ctx.getOpponents(actor).some((e) => {
    if (!e.isAlive) return false;
    const record = ctx.prepState.get(e);
    return record && record.preDelayType === value;
  });
});

// value: 숫자 — 현재 턴이 그 값 이상이면 true. "개전 패턴"(EXTEND_BATTLE_LIMIT)을
// 발동시키는 조건으로 씀(예: "90턴을 넘었는데 아직 안 끝났다 -> 시간을 늘려라").
ConditionRegistry.register("BATTLE_TURN_AT_LEAST", (actor, ctx, value) => {
  return ctx.currentTurn >= value;
});

// value: { stat: "str"|"int"|"dex"|"spd"|"luk"|"atk"|"matk"|"def"|"mdef",
//   comparator: "gte"|"gt"|"lte"|"lt"|"eq", threshold: 숫자 }
// 자기 자신의 effective{Stat}(버프/디버프 실시간 반영값)을 threshold와 비교.
// 항상 actor(자기 자신) 기준으로만 고정 — 상대방 스탯은 절대 참조 못 하게
// 설계함(2026-08-16, 사용자 요청: "적의 스탯은 판정하지 못하도록"). 예:
// "자신의 MATK가 디버프로 일정 선 아래로 떨어지면 스스로 재정비 버프를
// 건다" 같은 패턴에 씀 — { subject:"self", metric:"effectiveStat",
// statKey:"matk", comparator:"lte", value:150, action:"..." }.
//
// threshold 대신 thresholdPctOfReal(숫자, %)을 주면 "자신의 real{Stat} 대비
// 그 %"를 임계값으로 매번 다시 계산함(2026-08-16 확장, "???" 설계용 — "MATK가
// 100이라면 60 아래로 떨어졌을 때"처럼 절대값이 아니라 자기 자신의 원 스탯
// 대비 비율로 판정하고 싶은 경우. 절대 threshold를 미리 못 박지 않아도 되므로
// 스탯이 나중에 재조정돼도 조건 데이터를 안 고쳐도 됨). 둘 다 없으면 false.
ConditionRegistry.register("MY_EFFECTIVE_STAT_COMPARE", (actor, ctx, value) => {
  const capKey = value.stat.charAt(0).toUpperCase() + value.stat.slice(1);
  const effective = actor[`effective${capKey}`];
  if (effective === undefined) return false;
  let threshold = value.threshold;
  if (threshold === undefined && value.thresholdPctOfReal !== undefined) {
    const real = actor[`real${capKey}`];
    if (real === undefined) return false;
    threshold = real * (value.thresholdPctOfReal / 100);
  }
  if (threshold === undefined) return false;
  switch (value.comparator) {
    case "gte": return effective >= threshold;
    case "gt": return effective > threshold;
    case "lte": return effective <= threshold;
    case "lt": return effective < threshold;
    case "eq": return effective === threshold;
    default: return false;
  }
});

// value: 숫자 N — 이 패턴 슬롯이 지금까지 발동한 횟수가 N보다 작을 때만 true.
// "○회까지는 반드시" 규칙의 핵심. slotIndex는 BattleEngine.executeAction이
// 자동으로 넘겨주는 "이 조건이 몇 번째 패턴 슬롯에서 평가되는지"이고, 그 슬롯이
// 실제로 발동한 횟수(actor.slotTriggerCounts[slotIndex])는 엔진이 슬롯 발동 시
// 자동으로 세어줌(조건/행동 쪽에서 따로 관리할 필요 없음).
// N번째까지는 이 조건이 계속 참이라 그 슬롯이 우선 발동하고, N번을 다 쓰고 나면
// 조건이 거짓이 되어 자연스럽게 그 다음(우선순위 낮은) 슬롯으로 넘어감.
ConditionRegistry.register("SLOT_USE_COUNT_LESS_THAN", (actor, ctx, value, slotIndex) => {
  const used = (actor.slotTriggerCounts && actor.slotTriggerCounts[slotIndex]) || 0;
  return used < value;
});

// value: [{cond, val}, ...] — 배열 안의 조건을 전부 만족해야 true("○이면서 ○").
// 단순히 여러 조건의 동시 충족 판정을 위한 조합기. 예: "HP 50% 미만이면서 아직
// 이 슬롯을 1번도 안 썼을 때"만 발동하고 싶으면:
//   { cond:"AND", val:[{cond:"MY_HP_LESS_THAN_PCT", val:50}, {cond:"SLOT_USE_COUNT_LESS_THAN", val:1}], act:"..." }
ConditionRegistry.register("AND", (actor, ctx, value, slotIndex) => {
  return value.every((sub) => ConditionRegistry.check(sub.cond, actor, ctx, sub.val, slotIndex));
});

class ActionRegistry {
  static actions = new Map();
  // chains:true인 액션은 실행 후 이번 턴의 게이지를 전혀 소모하지 않고, 같은
  // executeAction() 호출 안에서 곧바로 다음 패턴 슬롯을 평가함(engine.js
  // executeAction 참고) — "대사 한 줄 찍고 후속딜레이 없이 바로 다음 행동으로
  // 이어지는" 연출용(DIALOGUE_OPENING -> SUMMON_OPENING, DIALOGUE_DEFEAT ->
  // REWARD_GRANT -> SELF_DETONATION 같은 한 묶음 연계).
  static chainingActions = new Set();

  static register(key, executeFn, { chains = false } = {}) {
    this.actions.set(key, executeFn);
    if (chains) this.chainingActions.add(key);
  }

  static execute(key, actor, context) {
    const fn = this.actions.get(key);
    return fn ? fn(actor, context) : 0;
  }

  static chains(key) {
    return this.chainingActions.has(key);
  }
}

ActionRegistry.register("ATTACK", (actor, ctx) => {
  const target = ctx.getOpponents(actor).find((e) => e.isAlive);
  if (!target) return 0;

  // "{이름}, {행동명}" — src/engine.js의 resolvePreparedSkill(캐릭터 스킬
  // 발동)과 같은 모양. web/battle-view.html이 이 모양을 캐릭터/몬스터
  // 구분 없이 같은 템플릿(볼드+밑줄 헤더)으로 렌더링함.
  ctx.log(`${actor.name}, 공격`);

  if (target.checkAndConsumeGuard("physical")) {
    ctx.log(`   ${target.name}의 공격이 Guard로 완전히 무효화됨.`);
    return 0;
  }

  const damage = Math.floor(actor.effectiveStr * 2);
  const isCrit = Math.random() * 100 <= actor.critRate;
  const finalDamage = applyDealtPassiveMods(actor, isCrit ? Math.floor(damage * actor.critMultiplier) : damage, "physical", null, target.creatureTier);

  const before = target.currentHp;
  const applied = target.takeDamage(finalDamage, "physical", { attackerTier: actor.creatureTier });
  ctx.recordDamageDealt?.(actor.side, applied);
  const hitLine = statChangeLine(target, applied, "데미지", before, target.currentHp);
  if (hitLine) ctx.log(`   ${isCrit ? "치명타! " : ""}${hitLine}`);
  applyLifesteal(actor, applied, ctx);
  return 0;
});

ActionRegistry.register("USE_POTION", (actor, ctx) => {
  const heal = 100;
  actor.currentHp = Math.min(actor.maxHp, actor.currentHp + heal);
  ctx.log(`   🧪 [아이템] ${actor.name}이(가) 포션을 사용! HP +${heal} 회복 (현재 HP: ${actor.currentHp}/${actor.maxHp})`);
  return 0;
});

ActionRegistry.register("CREATE_MAGIC_CIRCLE", (actor, ctx) => {
  ctx.log(`   🪄 [스킬] ${actor.name}이(가) 진영 마법진 생성 주문을 외웁니다.`);
  ctx.resourceManager.addResource(actor.side, "MAGIC_CIRCLE", 2, (line) => ctx.log(line));
  return 0;
});

ActionRegistry.register("DETONATE_MAGIC_CIRCLE", (actor, ctx) => {
  const success = ctx.resourceManager.consumeResource(actor.side, "MAGIC_CIRCLE", 3, (line) => ctx.log(line));
  if (success) {
    ctx.log(`   연계 필살기 (마법진 3개 소모)`);
    ctx.getOpponents(actor).filter((e) => e.isAlive).forEach((e) => {
      if (e.checkAndConsumeGuard("magic")) {
        ctx.log(`   ${e.name}의 공격이 Guard로 완전히 무효화됨.`);
        return;
      }
      const dmg = applyDealtPassiveMods(actor, Math.floor(actor.effectiveInt * 3.5), "magic", null, e.creatureTier);
      const before = e.currentHp;
      const applied = e.takeDamage(dmg, "magic", { attackerTier: actor.creatureTier });
      ctx.recordDamageDealt?.(actor.side, applied);
      const hitLine = statChangeLine(e, applied, "데미지", before, e.currentHp);
      if (hitLine) ctx.log(`   ${hitLine}`);
      applyLifesteal(actor, applied, ctx);
    });
  }
  return 0;
});

// "개전 패턴" — 전투가 길어질 조짐이 보이면(예: BATTLE_TURN_AT_LEAST 조건) 최대
// "개전 패턴" — 최대 턴수를 늘리는 순수 액션. 몇 번까지 발동 가능한지는 이
// 액션이 아니라 그걸 부르는 패턴 쪽(SLOT_USE_COUNT_LESS_THAN)이 결정함 — 예:
//   { cond:"AND", val:[{cond:"BATTLE_TURN_AT_LEAST", val:90}, {cond:"SLOT_USE_COUNT_LESS_THAN", val:1}], act:"EXTEND_BATTLE_LIMIT" }
// 이렇게 하면 "90턴을 넘겼고 아직 한 번도 안 늘렸을 때만" 발동하고, 그 이후엔
// 조건이 저절로 거짓이 되어 다음 슬롯(평타 등)으로 자연스럽게 넘어감.
// BattleEngine.ABSOLUTE_MAX_TURNS라는 절대 상한은 그래도 별도로 유지(이중 안전장치).
ActionRegistry.register("EXTEND_BATTLE_LIMIT", (actor, ctx) => {
  const ADD_TURNS = 50; // 필요하면 몬스터별로 다른 값을 쓰고 싶을 때 이 상수를 조정

  const before = ctx.maxTurns;
  const BattleEngineRef = ctx.constructor; // static 상수(ABSOLUTE_MAX_TURNS) 참조용
  ctx.maxTurns = Math.min(before + ADD_TURNS, BattleEngineRef.ABSOLUTE_MAX_TURNS);

  ctx.log(`   ⏳ [개전 패턴] ${actor.name}이(가) 전투 시간을 늘립니다! 최대 턴수 ${before} -> ${ctx.maxTurns}`);
  return 0;
});

// 소환 — actor.summonSpec에 정의된 사양대로 새 유닛을 만들어 actor와 같은
// 진영에 즉시 추가함. 별도 처리 없이도 즉시 전투에 반영되는 이유: 엔진의 틱
// 루프가 매 반복마다 this.units를 새로 훑어서 살아있는 유닛을 다시 고르므로,
// 여기서 units 배열에 push하는 순간 바로 다음 행동 후보에 포함됨.
// summonSpec 형식: { name, stats:{str,int,dex,spd,luk}, patternSlots, expReward,
//   goldReward, dropTable } — actor에게 없으면 기본 잡몹 하나를 소환함.
// ⚠ BattleCharacter를 여기서 직접 import하지 않음(character.js가 이미 이
// 파일을 참조해서 순환 의존성이 생김) — 대신 actor.constructor를 씀(actor는
// 이미 BattleCharacter의 인스턴스이므로 그 생성자를 그대로 재사용 가능).
// 가중치 기반 무작위 선택. 항목이 하나뿐이면 그게 100% 뽑힘(1:1 소환도 이
// 함수로 자연스럽게 처리됨 — 풀 크기가 1인 특수 케이스일 뿐).
function weightedPick(candidates) {
  const totalWeight = candidates.reduce((sum, c) => sum + (c.weight || 1), 0);
  let roll = Math.random() * totalWeight;
  for (const c of candidates) {
    roll -= c.weight || 1;
    if (roll <= 0) return c;
  }
  return candidates[candidates.length - 1]; // 부동소수점 오차 방어용 폴백
}

// stats의 각 값에 multiplier를 곱함(최소 1로 클램프 — 0이나 음수 스탯 방지).
function scaleStatsByMultiplier(stats, multiplier) {
  const scaled = {};
  Object.entries(stats || {}).forEach(([key, val]) => {
    scaled[key] = Math.max(1, Math.round(val * multiplier));
  });
  return scaled;
}

// LUK 성장 배율 — 선형이 아니라 로그 곡선. 게임 내 다른 스탯 변동이 대부분
// 곱셈(복리)로 일어나기 때문에, 여기만 "비율을 그대로 캡"하는 선형 방식으로
// 두면 상대적으로 밋밋하게 느껴진다는 판단 — 초반엔 가파르게 오르고, LUK이
// 500% 캡(=effectiveLuk이 realLuk의 5배)에 가까워질수록 완만하게 수렴함.
//   ratio = effectiveLuk / realLuk — 기존 스탯 클램프 덕에 자연히 0.5~5 사이
//   growth = 1 + LOG_SCALE × ln(ratio)
// ratio=1(버프 전혀 없음)일 때 정확히 1배(보너스 없음), ratio=5(LUK이 500%
// 캡에 도달)일 때 정확히 3배가 되도록 LOG_SCALE을 역산해서 고정해둠 — "캡까지
// 갔을 때 2.5~3배 정도"라는 원래 설계 의도를 그대로 유지하되, 상한 자체가
// 좁아졌으니 같은 배율 목표(3배)에 더 빨리 도달함(2026-08-15, calculateEffectiveStat
// 캡 축소에 맞춰 20→5로 조정 — CLAUDE.md "알려진 미구현 항목"에서 예고했던
// 그 변경. "2.5~3배 정도"라는 의도 자체는 유지하고, 도달 지점만 좁아진 캡에
// 맞춰 당겨진 것이 이번 결정).
const LUK_GROWTH_AT_MAX_RATIO = 3; // ratio가 이론상 최대(5)일 때 도달하는 배율
const LUK_GROWTH_MAX_RATIO = 5; // effectiveLuk/realLuk의 이론상 최대치(500% 캡과 동일한 수치)
const LUK_LOG_SCALE = (LUK_GROWTH_AT_MAX_RATIO - 1) / Math.log(LUK_GROWTH_MAX_RATIO);

function lukGrowthMultiplier(actor) {
  if (!actor.realLuk) return 1; // realLuk이 0인 예외 상황 방어(0으로 나누기 방지)
  const ratio = actor.effectiveLuk / actor.realLuk; // 기존 스탯 클램프 덕에 이미 0.5~20 사이로 보장됨
  const growth = 1 + LUK_LOG_SCALE * Math.log(ratio);
  return Math.max(0.1, growth); // 극단적 예외 상황에서도 배율이 0 이하로 안 내려가게 하는 최소 안전장치일 뿐, 정상 범위에선 절대 안 걸림
}

// LUK "투자" 배율 — 소환수를 쓰려면 다른 스탯에 갈 수 있었던 포인트를 LUK에
// 투자하는 셈이니, 그 기회비용에 대한 보상. realLuk(버프 무관, 순수 스탯
// 투자량) 100까지는 선형으로 늘어 1(=원본 몬스터 스펙 그대로)에 도달함.
// SummonEff(장비)와는 곱셈으로 결합되므로, LUK을 100까지 못 채워도 SummonEff가
// 충분히 높으면 그 부족분을 메꿔서 원본 성능(또는 그 이상)에 도달할 수 있음 —
// "LUK 투자" 또는 "장비 투자" 어느 한쪽만으로도, 또는 둘을 섞어서도 도달 가능.
//
// 100을 넘는 구간엔 하드캡을 안 씀 — 대신 10포인트짜리 구간을 계속 이어가되,
// 매 구간이 직전 구간의 60%(0.6배) 효율로 줄어드는 소프트캡(등비수열).
// 캐릭터 레벨 상한(60)을 감안하면 realLuk 500~700 같은 수치는 애초에 도달
// 불가능한 값이라, 소프트캡이 훨씬 이른 구간에서, 훨씬 가파르게 걸려야 함 —
// 100에서 소프트캡 시작, 150쯤엔 "더 투자할 가치가 있나?" 싶을 만큼 눈에
// 띄게 둔화, 200쯤엔 추가 투자가 사실상 무의미해지는 걸 목표로 계수를 잡음.
const SUMMON_FULL_LUK_INVESTMENT = 100; // 이 지점까지는 선형, 여기서 정확히 1배
const SUMMON_LUK_BRACKET_WIDTH = 10;
const SUMMON_LUK_BRACKET_DECAY = 0.6;

function lukInvestmentFactor(actor) {
  const realLuk = Math.max(0, actor.realLuk || 0);
  if (realLuk <= SUMMON_FULL_LUK_INVESTMENT) return realLuk / SUMMON_FULL_LUK_INVESTMENT;

  const excess = realLuk - SUMMON_FULL_LUK_INVESTMENT;
  const n = Math.floor(excess / SUMMON_LUK_BRACKET_WIDTH); // 완전히 채운 구간 수
  const remainder = excess - n * SUMMON_LUK_BRACKET_WIDTH; // 다음(미완성) 구간에 걸친 부분

  const baseBracketValue = SUMMON_LUK_BRACKET_WIDTH / SUMMON_FULL_LUK_INVESTMENT; // 선형 시절 10점당 증가치(=0.05)와 동일하게 시작
  // 등비수열 부분합: baseBracketValue × (1 + decay + decay² + ... + decay^(n-1))
  const fullBracketsSum = baseBracketValue * (1 - Math.pow(SUMMON_LUK_BRACKET_DECAY, n)) / (1 - SUMMON_LUK_BRACKET_DECAY);
  const partialBracketSum = (remainder / SUMMON_LUK_BRACKET_WIDTH) * baseBracketValue * Math.pow(SUMMON_LUK_BRACKET_DECAY, n);

  return 1 + fullBracketsSum + partialBracketSum;
}

// 소환 — actor.summonPool(가공 전 원본 스펙 후보들의 가중치 목록)에서 하나를
// 무작위로 골라, "지금 이 순간의" 배율 3종을 곱해 실제 스펙을 만든 뒤 즉시
// 전투에 투입함.
//   소환된 몬스터 스펙 = SummonEff 배율(장비 없으면 100%=1배가 기준선. 장비의
//   "SummonEff +30%" 같은 옵션은 realSummonEff=30으로 그대로 들어와서
//   1+30/100=1.3배가 됨 — 이 옵션이 하나도 없어도 소환 자체는 정상적으로
//   쓸 수 있고, 장비는 그 위에 얹는 보너스일 뿐임. "장비가 있어야만 소환이
//   의미 있다"는 예전 원칙(ATK/DEF와 동일한 규칙)은 SummonEff엔 더 이상
//   적용하지 않기로 함) × LUK 투자 배율(realLuk 100에서 1, 그 아래는 비례,
//   100 초과는 소프트캡) × LUK 성장 배율(로그 곡선, ratio=1일 때 1배 ~
//   ratio=50일 때 3배) × 소환할 몬스터의 기본(미가공) 스펙
// SummonEff/LUK 투자 배율은 real 기반이라 전투 중 고정이지만, LUK 성장 배율은
// 버프/디버프로 실시간 변하는 값이라 여기(엔진, 소환이 실제로 일어나는 순간)
// 에서 매번 새로 계산함 — 그래서 같은 캐릭터가 소환을 여러 번 해도 매번
// 배율이 다를 수 있음(LUK 버프를 받은 이후엔 더 강하게 나옴, 다만 최대 3배까지만).
// actor.summonPool 형식: [{ name, stats(원본, 미가공), patternSlots, expReward,
//   goldReward, dropTable, weight }, ...] — 어댑터가 몬스터 테이블에서 조회한
// "가공 전" 데이터를 그대로 넣어줌(계수는 절대 미리 곱해두지 않음).
// 소환 실행 본체 — count만 다르게 해서 여러 액션이 공유함.
//   SUMMON          평상시 소환. actor.summonCount(기본 1)체.
//   SUMMON_OPENING  개전 소환. actor.openingSummonCount(기본 3)체.
// 두 패턴이 한 몬스터 안에 공존해야 하므로(마차는 개전에 3체, 이후 매턴 1체)
// 소환 수를 캐릭터 단위 필드 하나로 두지 않고 액션별로 나눔.
function performSummon(actor, ctx, count) {
  const pool = actor.summonPool && actor.summonPool.length
    ? actor.summonPool
    : [{ name: "소환된 잡몹", stats: { str: 5, int: 5, dex: 8, spd: 10, luk: 5 }, patternSlots: [{ cond: "ALWAYS", val: 0, act: "ATTACK" }] }];

  // 한 번에 몇 체를 소환할지 — actor.summonCount(기본 1). 개전 시 한꺼번에
  // 여러 체를 쏟아내는 패턴(고블린 마차의 개전 소환 등)을 위해 지원함.
  // 소환체마다 대상을 따로 뽑으므로 서로 다른 종류가 섞여 나올 수 있음.
  const summonedNames = [];

  for (let i = 0; i < count; i++) {
    const picked = weightedPick(pool);
    const summonEffMultiplier = 1 + actor.realSummonEff / 100; // 0 -> 1배(100%, 기준선), 30 -> 1.3배(130%)
    const investment = lukInvestmentFactor(actor);
    const growth = lukGrowthMultiplier(actor);
    const multiplier = summonEffMultiplier * investment * growth;

    const Ctor = actor.constructor;
    // SummonEff/LUK 배율은 "원본 스탯"(STR/INT/DEX/SPD/LUK)에만 적용함
    // (2026-08-16, 사용자 지적으로 발견한 버그 수정). combatReal(ATK/DEF/
    // MATK/MDEF)과 maxHp는 소환 원본 스펙 그대로 물려주고 배율을 안 곱함 —
    // ATK/MATK는 애초에 스탯 감쇠(dampDamageStat) 대상에서 제외돼 있어서,
    // 여기에 배율을 직접 곱하면 감쇠 없이 그대로 데미지에 반영돼버려 위력이
    // 배율만큼 고스란히 새어나갔다(예: 고블린 마차 LUK100/summonEff100=
    // 정확히 2.0배 → 소환된 고블린 주술사의 realMatk가 4→8로 그대로 2배,
    // 감쇠되는 INT 증가분까지 곱해져 실제 히트당 데미지는 약 3배가 됨 —
    // 이미 한 번 손봤던 "주술사 MATK 16→4" 안전장치가 이 경로로 무력화되고
    // 있었음). 원본 스탯만 배율을 받으면, 그 스탯이 실제 위력에 반영될 때도
    // 다른 모든 스탯 성장과 똑같이 dampDamageStat을 그대로 통과하게 되어
    // 일관된 감쇠가 적용됨.
    const summoned = new Ctor(picked.name, actor.side, scaleStatsByMultiplier(picked.stats, multiplier));
    summoned.patternSlots = picked.patternSlots || [];
    summoned.creatureTier = "creature"; // 몬스터도 유저 캐릭터도 아닌 소환된 존재
    summoned.expReward = Math.max(0, Math.round((picked.expReward || 0) * multiplier));
    summoned.goldReward = Math.max(0, Math.round((picked.goldReward || 0) * multiplier));
    summoned.dropTable = picked.dropTable || [];
    // 소환 원본이 combatReal/maxHp를 갖고 있으면 배율 없이 그대로 물려줌 —
    // 안 물려주면 소환된 전사가 공격력 0이라 아무것도 못 하는 허수아비가 됨.
    if (picked.combatReal) {
      summoned.realAtk = picked.combatReal.atk || 0;
      summoned.realDef = picked.combatReal.def || 0;
      summoned.realMatk = picked.combatReal.matk || 0;
      summoned.realMdef = picked.combatReal.mdef || 0;
    }
    if (picked.maxHp != null) {
      summoned.maxHpOverride = picked.maxHp;
      summoned.currentHp = summoned.maxHp;
    }

    ctx.units.push(summoned);
    (actor.side === "ally" ? ctx.allies : ctx.enemies).push(summoned);
    summonedNames.push(summoned.name);
  }

  // 소환 계수/마릿수는 로그에 안 남김(2026-08-16) — "정확한 효과·수치를
  // 알려줄 생각은 없다"는 버프/디버프 로그 원칙(CLAUDE.md 참고)과 같은
  // 이유로, 소환됐다는 사실만 알림. 모든 소환 스킬(SUMMON_OPENING 포함)에
  // 공통 적용.
  ctx.log(`   ${actor.name}이(가) ${summonedNames.join(", ")}을(를) 소환했다!`);
  return 0;
}

ActionRegistry.register("SUMMON", (actor, ctx) =>
  performSummon(actor, ctx, Math.max(1, actor.summonCount || 1)));

ActionRegistry.register("SUMMON_OPENING", (actor, ctx) =>
  performSummon(actor, ctx, Math.max(1, actor.openingSummonCount || 3)));

// ============================================================================
// 대사 전용 액션 — 전투 효과 없이 텍스트만 출력(고블린 마차의 "대화하는 듯한
// 연출"용). chains:true라 게이지를 안 쓰고 바로 다음 패턴 슬롯으로 넘어감 —
// 대사 자체가 "이번 턴"을 차지하지 않고, 뒤이은 진짜 행동(소환/자폭 등)과
// 한 묶음으로 즉시 이어짐. actor.dialogueLines(문자열 배열)를 심어두면
// 그 대사를, 없으면 기본 문구를 씀 — 몬스터마다 다른 대사를 쓰고 싶을 때
// 재사용 가능하게 하기 위함.
function speakLines(actor, ctx, lines) {
  lines.forEach((line) => ctx.log(`   ${actor.name}: "${line}"`));
}

ActionRegistry.register("DIALOGUE_OPENING", (actor, ctx) => {
  speakLines(actor, ctx, actor.dialogueOpeningLines || ["..."]);
  return 0;
}, { chains: true });

ActionRegistry.register("DIALOGUE_DEFEAT", (actor, ctx) => {
  speakLines(actor, ctx, actor.dialogueDefeatLines || ["..."]);
  return 0;
}, { chains: true });

// 자폭 — 방어력/Guard 등 어떤 경감도 거치지 않고 즉시 HP를 0으로 만듦
// ("자신의 체력이 50% 미만이 될 경우 최대체력의 100%만큼 자해"라는 설계
// 의도 자체가 "무조건 죽는다"이므로, takeDamage()의 방어 파이프라인을
// 거치면 오히려 의도가 흐려짐 — 직접 0으로 설정). HP/SP 변화 표기는
// creatureTier가 "boss"면 이미 로그에서 빠지므로(statChangeLine 규칙)
// 여기서는 그냥 서술형 한 줄만 남김.
ActionRegistry.register("SELF_DETONATION", (actor, ctx) => {
  actor.currentHp = 0;
  ctx.log(`   ${actor.name}이(가) 스스로 자폭했다!`);
  return 0;
});

// 퇴각 — SELF_DETONATION과 메커니즘은 완전히 동일(방어 파이프라인을 거치지
// 않고 즉시 HP를 0으로 만들어 전투에서 제거)하지만, "자폭"이 아니라 "물러남"
// 이라는 서사가 다른 개체용으로 이름만 분리함("???"의 HP 30% 미만 퇴각처럼
// 직접 죽일 수 없는 개체가 스스로 전장을 떠나는 연출).
ActionRegistry.register("RETREAT", (actor, ctx) => {
  actor.currentHp = 0;
  ctx.log(`   ${actor.name}이(가) 전장에서 물러났다.`);
  return 0;
});

// 패닉 회복 — HP/SP를 즉시 최대치로 완전 회복(방어 파이프라인 무관, 상태이상/
// 스탠스는 안 건드림). USE_POTION(고정 100 회복)과 달리 "상태를 완전히
// 회복"하는 대형 자기 구제기용 — 낮은 HP를 노린 파티 전략을 한 번 무효화하는
// 위협적인 행동이라, 패턴 쪽에서 maxUses:1 등으로 반드시 횟수를 제한해서 써야
// 함(이 액션 자체엔 횟수 제한이 없음).
ActionRegistry.register("PANIC_FULL_RECOVERY", (actor, ctx) => {
  actor.currentHp = actor.maxHp;
  actor.currentSp = actor.maxSp;
  ctx.log(`   🧪 [U.Item] ${actor.name}이(가) 비장의 아이템을 사용해 모든 상태를 완전히 회복했다!`);
  return 0;
});

// 보상 오브젝트 소환 — performSummon()의 SummonEff/LUK 배율 시스템을 안 씀
// (그 시스템은 "소환자가 강할수록 소환물도 강해진다"는 몬스터 물량전용
// 설계라, 고정된 보상 상자에는 안 맞음). actor.rewardObjectSpec으로
// {name, maxHp, dropTable} 등을 심어두면 그 스펙 그대로, 없으면 기본값
// (2000 HP짜리 이름 없는 상자)을 씀 — 몬스터마다 다른 보상 오브젝트를
// 쓰고 싶을 때 재사용 가능하게 하기 위함. 패턴 슬롯을 아예 안 줘서
// 스스로는 아무 행동도 안 함.
ActionRegistry.register("REWARD_GRANT", (actor, ctx) => {
  const spec = actor.rewardObjectSpec || { name: "보물상자", maxHp: 2000, dropTable: [] };
  const Ctor = actor.constructor;
  const chest = new Ctor(spec.name, actor.side, { str: 0, int: 0, dex: 0, spd: 0, luk: 0 });
  chest.patternSlots = []; // 아무 행동도 하지 않음
  chest.creatureTier = "normal"; // 마차와 달리 이쪽은 받는 피해를 그대로 표기
  chest.maxHpOverride = spec.maxHp;
  chest.currentHp = chest.maxHp;
  chest.expReward = spec.expReward || 0;
  chest.goldReward = spec.goldReward || 0;
  chest.dropTable = spec.dropTable || [];
  ctx.units.push(chest);
  (actor.side === "ally" ? ctx.allies : ctx.enemies).push(chest);
  ctx.log(`   ${actor.name}이(가) ${chest.name}을(를) 남겼다!`);
  return 0;
}, { chains: true });

module.exports = { JobRegistry, ConditionRegistry, ActionRegistry, BaseJob };


  // 브라우저 환경이면 이 모듈의 exports를 공용 네임스페이스에 얹음(Node에서는
  // window가 없으니 아무 일도 안 함. 어차피 Node의 진짜 module.exports는 위에서
  // 그대로 전달받은 그 객체라 이 시점에 이미 다 채워져 있음).
  if (typeof window !== "undefined") {
    window.BattleSim = window.BattleSim || {};
    Object.assign(window.BattleSim, module.exports);
  }
})(typeof module !== "undefined" ? module : undefined, typeof require !== "undefined" ? require : undefined);
