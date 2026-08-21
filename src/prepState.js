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
// 선딜레이 준비 상태(Preparation State) 추적기.
//
// 유닛이 preDelay > 0인 스킬을 쓰기 시작하면 "준비 중" 상태에 들어가고,
// startTick + preDelay 시점에 실제로 발동된다. 그 사이에 조건에 맞는 지연
// 효과(actionDelay/castDelay)를 맞으면 originalPreDelay(처음 필요했던 선딜레이)를
// 기준으로 readyAtTick(발동 예정 시점)이 밀린다.
//
// ⚠ 발동을 완전히 차단하는 개념은 없음. 일단 시작된 스킬은 원칙적으로 반드시
// 발동된다 — 유일한 예외는 발동 시점(readyAtTick)에 다시 코스트를 확인했을 때
// 더 이상 감당할 수 없는 경우뿐(예: SP 100을 요구하는 스킬인데, 선딜레이 도중
// SP 감소 효과를 맞아 100 미만이 됨). 그 경우에만 resolve()가
// { activated:false, reason } 을 돌려주고, 호출부(엔진)는 이 실패를 반드시
// 로그/알림으로 드러내야 함.
//
// 딜레이 저항: 방해 효과(actionDelay/castDelay)로 밀린 결과, 그 스킬의 총
// 발동 지연이 원래 선딜레이(originalPreDelay)의 DELAY_RESISTANCE_CAP_RATIO
// (250%)를 절대 넘지 못함. 즉 선딜 300짜리 스킬은 아무리 방해받아도 총
// 750틱 안에는 반드시 발동함(= 추가로 밀 수 있는 양은 원래 선딜의 1.5배인
// 450틱까지). 이게 없으면 여러 유닛이 한 대상에게 계속 지연 효과를 걸어서
// 죽을 때까지 발동을 못 시키는 상황이 생길 수 있음 — 그걸 막기 위한 안전장치.
// 한도에 걸리면 그만큼만 부분 적용되고(resisted:true), 이미 한도에 도달한
// 상태에서 또 걸면 완전히 무효(applied:false)가 됨.
// ============================================================================
const DELAY_RESISTANCE_CAP_RATIO = 2.5; // 총 지연이 원래 선딜레이의 250%를 넘지 못함

class PrepState {
  constructor() {
    // unitId -> { skill, preDelayType, startTick, originalPreDelay, readyAtTick, addedDelay }
    this.states = new Map();
  }

  /** 유닛이 스킬 사용을 시작함(준비 상태 진입). effectivePreDelay를 넘기면
   *  skill.preDelay 대신 그 값을 씀(스탠스의 preDelayMultiplier가 적용된
   *  값 — 호출부인 engine.js가 미리 계산해서 넘겨줌). */
  begin(unitId, skill, startTick, effectivePreDelay) {
    const preDelay = effectivePreDelay ?? skill.preDelay;
    const record = {
      skill,
      preDelayType: skill.preDelayType,
      startTick,
      originalPreDelay: preDelay,
      readyAtTick: startTick + preDelay,
      addedDelay: 0, // 지금까지 방해 효과로 추가된 딜레이 누적치(저항 판정용)
    };
    this.states.set(unitId, record);
    return record;
  }

  /** 현재 준비 중인 상태 조회(없으면 null). */
  get(unitId) {
    return this.states.get(unitId) || null;
  }

  /** 발동 완료(성공/실패 불문)되어 상태를 정리할 때. */
  clear(unitId) {
    this.states.delete(unitId);
  }

  /**
   * 조건부 지연 효과 적용(actionDelay / castDelay). 딜레이 저항 한도(원래
   * 선딜레이의 250%) 안에서만 늘어남 — 한도를 넘는 부분은 잘리고(resisted:true),
   * 이미 한도에 도달했으면 아예 적용되지 않음(applied:false).
   * 취소가 아니라 "늦추는" 효과라, 적용되어도 스킬 자체는 계속 준비 상태로 남음.
   * @param {string} targetUnitId
   * @param {{ requiresPreDelayType?: string, value: number }} effect  value는 %
   * @returns {{ applied: boolean, reason?: string, addedDelay?: number, beforeTick?: number,
   *             afterTick?: number, resisted?: boolean, requestedDelay?: number }}
   */
  applyDelayEffect(targetUnitId, effect) {
    const record = this.get(targetUnitId);
    if (!record) {
      return { applied: false, reason: "대상이 현재 준비(선딜레이) 중이 아님" };
    }
    if (effect.requiresPreDelayType && record.preDelayType !== effect.requiresPreDelayType) {
      return {
        applied: false,
        reason: `대상의 선딜레이 유형("${record.preDelayType}")이 효과 조건("${effect.requiresPreDelayType}")과 다름`,
      };
    }

    // 추가 가능한 양 = (총 지연 상한) - (원래 선딜레이). 즉 배율에서 1을 뺀
    // 만큼만 밀 수 있음 — 2.5배 상한이면 원래 선딜의 1.5배까지가 추가 한도.
    const maxAddable = record.originalPreDelay * (DELAY_RESISTANCE_CAP_RATIO - 1);
    const remainingCapacity = maxAddable - record.addedDelay;

    if (remainingCapacity <= 0) {
      return {
        applied: false,
        reason: `딜레이 저항 한도 도달 (총 지연이 원래 선딜레이의 ${DELAY_RESISTANCE_CAP_RATIO * 100}%인 ${record.originalPreDelay * DELAY_RESISTANCE_CAP_RATIO}틱까지만 허용 — 추가분 ${maxAddable}틱을 모두 소진함)`,
      };
    }

    const requestedDelay = record.originalPreDelay * (effect.value / 100);
    const actualAddedDelay = Math.min(requestedDelay, remainingCapacity);
    const resisted = actualAddedDelay < requestedDelay;

    const beforeTick = record.readyAtTick;
    record.readyAtTick += actualAddedDelay;
    record.addedDelay += actualAddedDelay;

    return {
      applied: true,
      addedDelay: actualAddedDelay,
      requestedDelay,
      resisted,
      beforeTick,
      afterTick: record.readyAtTick,
    };
  }

  /**
   * 준비 중인 스킬의 남은 선딜레이를 완전히 지워서 다음 판정 시점에 즉시
   * 발동되게 함("Cast Assist"류 지원 효과용). actionDelay/castDelay와 정확히
   * 반대 방향("당기는" 효과)이라, 딜레이 저항 한도(DELAY_RESISTANCE_CAP_RATIO)와는
   * 무관함 — 저항 한도는 방해받는 쪽을 보호하려는 장치라, 아군을 도와주는
   * 효과에 그 상한을 적용할 이유가 없음.
   * @param {object} unit                준비 중인 유닛(캐릭터 객체, id 아님)
   * @param {number} currentTick         호출 시점의 this.totalBattleTick
   * @param {{ requiresPreDelayType?: string }} [effect]  casting류만 대상으로
   *   하고 싶으면 requiresPreDelayType:"casting" 지정(액션딜레이는 대상 제외됨)
   */
  clearRemainingDelay(unit, currentTick, effect = {}) {
    const record = this.get(unit);
    if (!record) {
      return { applied: false, reason: "대상이 현재 준비(선딜레이) 중이 아님" };
    }
    if (effect.requiresPreDelayType && record.preDelayType !== effect.requiresPreDelayType) {
      return {
        applied: false,
        reason: `대상의 선딜레이 유형("${record.preDelayType}")이 효과 조건("${effect.requiresPreDelayType}")과 다름`,
      };
    }
    const beforeTick = record.readyAtTick;
    record.readyAtTick = currentTick;
    return { applied: true, beforeTick, afterTick: record.readyAtTick };
  }

  /**
   * 발동 시점(readyAtTick)에 실제로 스킬을 해결(resolve)한다.
   * 코스트를 다시 확인해서, 그사이 감당 못 하게 됐으면 발동이 불발되고 실패
   * 사유가 반환된다. 감당 가능하면 코스트를 소모하고 성공을 반환한다.
   *
   * @param {string} unitId
   * @param {object} actor          currentSp/currentHp를 가진 캐릭터 객체
   * @param {object} [resourceManager]  팀 자원 코스트가 있을 때만 필요(FactionResourceManager)
   * @returns {{ activated: boolean, reason?: string }}
   */
  resolve(unitId, actor, resourceManager) {
    const record = this.get(unitId);
    if (!record) {
      return { activated: false, reason: "준비 중인 스킬이 없음" };
    }

    const affordability = checkAffordability(actor, record.skill.costs || [], resourceManager);
    this.clear(unitId); // 성공하든 실패하든 준비 상태는 여기서 종료

    if (!affordability.ok) {
      return { activated: false, reason: `코스트 부족으로 발동 실패 (${affordability.detail})`, skill: record.skill };
    }

    const resourceLogs = payCosts(actor, record.skill.costs || [], resourceManager);
    return { activated: true, skill: record.skill, resourceLogs };
  }
}

const { TEAM_RESOURCE_TYPES, PERSONAL_RESOURCE_TYPES } = require("./resourceTypes");

/** cost.resource(TEAM_RESOURCE_TYPES 키)를 FactionResourceManager에 실제 등록된 이름으로 변환 */
function resolveTeamResourceKey(resource) {
  const meta = TEAM_RESOURCE_TYPES[resource];
  return meta ? meta.key : resource; // 등록 안 된 이름이면 그대로 시도(방어적)
}

/** 코스트를 지금 감당할 수 있는지 확인만 하고, 실제로 깎지는 않음. */
function checkAffordability(actor, costs, resourceManager) {
  for (const c of costs) {
    if (c.type === "sp") {
      const reductionPct = actor.getPassiveModValue("spCostReductionPct");
      let need = c.amount * (1 - reductionPct / 100) * actor.getStanceMultiplier("spCostMultiplier");
      need = Math.max(0, Math.round(need));
      const have = actor.currentSp ?? 0;
      if (have < need) return { ok: false, detail: `SP ${have}/${need}` };
    } else if (c.type === "hp") {
      const reductionPct = actor.getPassiveModValue("hpCostReductionPct");
      let need = c.amount * (1 - reductionPct / 100) * actor.getStanceMultiplier("hpCostMultiplier");
      need = Math.max(0, Math.round(need));
      const have = actor.currentHp ?? 0;
      if (have < need) return { ok: false, detail: `HP ${have}/${need}` };
    } else if (c.type === "teamResource" && resourceManager) {
      const key = resolveTeamResourceKey(c.resource);
      const have = resourceManager.getResource(actor.side, key);
      const label = TEAM_RESOURCE_TYPES[c.resource]?.label || c.resource;
      if (have < c.amount) return { ok: false, detail: `${label} ${have}/${c.amount}` };
    } else if (c.type === "personalResource") {
      const pool = actor.personalResources?.[c.resource];
      const have = pool ? pool.current : 0;
      if (have < c.amount) return { ok: false, detail: `개인 자원(${c.resource}) ${have}/${c.amount}` };
    }
  }
  return { ok: true };
}

/**
 * 코스트를 실제로 소모함(감당 가능하다고 이미 확인된 다음에만 호출).
 * @returns {string[]} 자원 변화 중 로그로 남길 만한 문구 목록(대부분 빈 배열 —
 *   스탠스로 개인 자원이 실제로 적립됐을 때만 채워짐, 2026-08-22 신설). 호출부가
 *   반드시 이 배열을 순회해서 로그에 남겨야 "집속 마력이 쌓이는데 전투 로그에는
 *   아무것도 안 보인다"는 문제(사용자 신고)가 재발하지 않음.
 */
function payCosts(actor, costs, resourceManager) {
  const resourceLogs = [];
  costs.forEach((c) => {
    if (c.type === "sp") {
      const reductionPct = actor.getPassiveModValue("spCostReductionPct");
      let amount = c.amount * (1 - reductionPct / 100) * actor.getStanceMultiplier("spCostMultiplier");
      const finalAmount = Math.max(0, Math.round(amount));
      actor.currentSp -= finalAmount;
      const msg = applyResourceOnCost(actor, "sp", finalAmount);
      if (msg) resourceLogs.push(...msg);
    } else if (c.type === "hp") {
      const reductionPct = actor.getPassiveModValue("hpCostReductionPct");
      let amount = c.amount * (1 - reductionPct / 100) * actor.getStanceMultiplier("hpCostMultiplier");
      const finalAmount = Math.max(0, Math.round(amount));
      actor.currentHp -= finalAmount;
      const msg = applyResourceOnCost(actor, "hp", finalAmount);
      if (msg) resourceLogs.push(...msg);
    } else if (c.type === "teamResource" && resourceManager) {
      resourceManager.consumeResource(actor.side, resolveTeamResourceKey(c.resource), c.amount);
    } else if (c.type === "personalResource") {
      const pool = actor.personalResources?.[c.resource];
      if (pool) pool.current -= c.amount;
    }
  });
  return resourceLogs;
}

// 스탠스의 resourceOnCost 훅 — {resource, costType, ratio} 형태. 현재 켜져있는
// "모든" 스탠스를 순회해서, 방금 지불한 costType(sp/hp)과 일치하는 resourceOnCost가
// 있는 스탠스마다 각각 적립함(스탠스 여러 개가 동시에 이 규칙을 가질 수도
// 있으므로 전부 개별 적용). 지급량 × ratio(기본 1)만큼을 지정된
// personalResource에 적립함(상한은 그 자원의 max로 자동 클램프).
// 2026-08-22: 예전엔 pool.current만 조용히 올리고 아무것도 반환 안 해서, 둠로드의
// Corrupted Focus처럼 SP를 쓸 때마다 집속 마력이 쌓이는데 전투 로그에는 그
// 변화가 전혀 안 보였음(사용자 신고) — 실제로 자원이 늘었을 때만(gain>0) 로그
// 문구 배열을 반환하도록 수정.
function applyResourceOnCost(actor, paidCostType, paidAmount) {
  if (paidAmount <= 0) return [];
  const logs = [];
  Object.values(actor.stances || {}).forEach((mods) => {
    const rule = mods.resourceOnCost;
    if (!rule || rule.costType !== paidCostType) return;
    const pool = actor.personalResources?.[rule.resource];
    if (!pool) return;
    const gain = Math.floor(paidAmount * (rule.ratio ?? 1));
    if (gain <= 0) return;
    const before = pool.current;
    pool.current = Math.min(pool.max, pool.current + gain);
    const actualGain = pool.current - before;
    if (actualGain <= 0) return; // 이미 최대치라 안 쌓였으면 로그도 안 남김(teamResourceGain과 동일 관례)
    const label = PERSONAL_RESOURCE_TYPES[rule.resource]?.label || rule.resource;
    logs.push(`${actor.name}의 ${label} +${actualGain}. (${pool.current}/${pool.max})`);
  });
  return logs;
}

module.exports = { PrepState, checkAffordability, payCosts, resolveTeamResourceKey, DELAY_RESISTANCE_CAP_RATIO };


  // 브라우저 환경이면 이 모듈의 exports를 공용 네임스페이스에 얹음(Node에서는
  // window가 없으니 아무 일도 안 함. 어차피 Node의 진짜 module.exports는 위에서
  // 그대로 전달받은 그 객체라 이 시점에 이미 다 채워져 있음).
  if (typeof window !== "undefined") {
    window.BattleSim = window.BattleSim || {};
    Object.assign(window.BattleSim, module.exports);
  }
})(typeof module !== "undefined" ? module : undefined, typeof require !== "undefined" ? require : undefined);
