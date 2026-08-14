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

const { computeSkillPower, applyDealtPassiveMods, applyLifesteal } = require("./combatFormulas");
const { TEAM_RESOURCE_TYPES } = require("./resourceTypes");

// 한국어 조사(받침 유무에 따른 이/가) 자동 처리 — engine.js/registries.js에도
// 같은 헬퍼가 있음(중복 관리 지점).
function hasBatchim(word) {
  const lastChar = word[word.length - 1];
  const code = lastChar.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}
function josa(word, withBatchim, withoutBatchim) {
  return hasBatchim(word) ? withBatchim : withoutBatchim;
}

// 수치 증감(데미지/SP피해 등) 로그 공통 포맷 — "{증감량} {유형} ▷ {대상}
// ({전} > {후})". web/battle-view.html이 " ▷ " 포함 여부로 이 줄을 감지해
// 강조 스타일을 입힌다(그 파일의 classifyLine 참조) — 이 함수가 만드는
// 문자열 모양을 바꾸면 그쪽도 같이 맞춰야 함.
function statChangeLine(name, amount, label, before, after) {
  return `${amount} ${label} ▷ ${name} (${before} > ${after})`;
}

// ============================================================================
// 대상 결정 — targetFaction/targetCount(캐릭터 시트의 TARGET_FACTION_TYPES/
// TARGET_COUNT_TYPES와 동일한 키)를 실제 유닛 배열로 변환.
// targetCount: "all"(전체) | "single"(1명) | 숫자 N(N명, 중복 허용 — 같은
// 대상이 여러 번 뽑혀서 효과가 중첩 적용될 수 있음, 특별한 규칙이 없으면
// 무작위. targetPriority가 있으면 그 우선순위로 좁혀진 후보군 안에서 뽑음).
//
// 아군 보호(진형) 규칙: targetCount가 "single"이나 숫자인 공격은, 대상 풀 안에
// row==="front" && guardAllies===true인 유닛이 하나라도 있으면 그 유닛(들)이
// 최우선 타겟이 됨. 그런 보호 유닛이 둘 이상이면(예: 전열에 보호 켠 탱커가 여럿)
// 그중 무작위로 하나가 선택됨 — 매번 같은 탱커만 맞는 걸 방지. targetCount가
// "all"이면 이 규칙과 무관하게 원래 풀 전체를 그대로 타격함.
//
// skill.invalid === true("차단 불가") — 이 보호 규칙 자체를 건너뛰고 원래 대상
// 풀에서 그대로 선택함(보호캐가 있어도 무시). 모든 공격이 막힐 수 있다면
// 결국 내구력 높은 진영이 항상 이기게 되는 걸 막기 위한 장치 — 힐이 탱커한테만
// 집중되는 걸 뚫거나, 요주의 대상·선딜레이 준비 중인 캐릭터를 직접 노릴 수
// 있는 단일/다수기에 붙이는 용도.
//
// skill.ignoreEvade === true("회피 무시") — 예약된 필드. 회피(evade) 판정
// 자체가 아직 엔진에 없어서(직업 특성 구조로 나중에 별도 설계 예정) 지금은
// 아무 동작도 하지 않는 순수 스텁임. 데이터 쪽(DeathStrike 등)엔 미리
// 붙여둬도 안전 — 회피 시스템이 생기면 그때 이 필드를 실제로 읽는 코드만
// 추가하면 됨.
// ============================================================================
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ============================================================================
// 타겟 우선순위 — CONDITION_TYPES/EFFECT_TYPES와 같은 레지스트리 패턴. 각
// 함수는 후보 목록을 받아 "그 조건에 가장 부합하는 후보들"(동률이면 여럿)을
// 반환함. 반환된 목록이 비어있으면(아무도 조건에 안 맞으면) resolveTargets가
// 자동으로 원래 후보 전체로 폴백함 — "우선순위"이지 "필수 조건"이 아니라서,
// 조건에 맞는 대상이 하나도 없어도 스킬 자체는 정상적으로(무작위 대상으로)
// 발동해야 함. 새 우선순위가 필요하면 이 객체에 함수 하나만 추가하면 됨.
// ============================================================================
const TARGET_PRIORITY_RESOLVERS = {
  lowestHpPct: (candidates) => {
    let min = Infinity, picked = [];
    candidates.forEach((u) => {
      const pct = u.currentHp / u.maxHp;
      if (pct < min) { min = pct; picked = [u]; }
      else if (pct === min) picked.push(u);
    });
    return picked;
  },
  highestHpPct: (candidates) => {
    let max = -Infinity, picked = [];
    candidates.forEach((u) => {
      const pct = u.currentHp / u.maxHp;
      if (pct > max) { max = pct; picked = [u]; }
      else if (pct === max) picked.push(u);
    });
    return picked;
  },
  // 선딜레이 중(시전/준비 중)인 유닛만 — 방해(castDelay 등)를 노리는 스킬용.
  // 아무도 준비 중이 아니면 빈 배열 반환 -> 원래 후보 전체로 폴백(그냥 무작위
  // 대상에게 발동됨, 방해 효과 자체는 castDelay가 알아서 "대상이 casting 중일
  // 때만" 걸리게 이미 처리하므로 헛스윙만 나는 정도).
  preparing: (candidates) => candidates.filter((u) => u.isPreparing),
  // BackAttack류 — 후열만. skill.invalid까지 같이 걸어야 진짜 의미가 있음
  // (invalid 없이 이것만 쓰면 guard 규칙이 먼저 후보를 전열 보호캐로 좁혀버려서
  // "후열 우선"이 무력화될 수 있음).
  backRow: (candidates) => candidates.filter((u) => u.row === "back"),
  // Hunting Sign류 — "표식이 찍힌" 대상만. 화살 소비 스킬 전용으로 쓰임(아래
  // resolveTargets의 자동 우선순위 로직 참고).
  huntingSignMarked: (candidates) => candidates.filter((u) => u.huntingSignMarked),
  // BossAttack류 — 보스 등급(creatureTier)인 대상 우선. 없으면 원래 후보
  // 전체로 폴백(일반 몹만 있는 전투에서도 그냥 정상 발동함).
  bossTier: (candidates) => candidates.filter((u) => u.creatureTier === "boss"),
};

// 화살을 소비하는 스킬인지 — costs 배열에 personalResource(resource:"arrow")
// 코스트가 있으면 true. Hunting Sign의 "화살 소비 스킬 전부 그 목표로 고정"
// 규칙을 자동으로 적용하기 위한 판별.
function usesArrowResource(skill) {
  return (skill.costs || []).some((c) => c.type === "personalResource" && c.resource === "arrow");
}

// 후보 목록에서 "우선순위를 반영한" 부분집합을 돌려줌 — 화살 소비 스킬이면
// 사냥의 징표 마킹을 최우선으로(스킬 자체의 targetPriority보다 위), 그다음
// skill.targetPriority. 둘 다 없거나 아무도 해당 안 되면 원래 후보 전체를
// 그대로 반환(폴백). targetCount가 "all"이든 "single"/숫자든 이 함수 하나로
// 통일해서 씀 — 예전엔 "all" 분기가 이 로직을 아예 안 타서 BackAttack류가
// "다수 대상" 스킬에서는 작동을 안 하는 버그가 있었음(우선순위 없이 무조건
// 전체 반환했었음).
function resolvePriorityPool(skill, candidates) {
  if (usesArrowResource(skill)) {
    const marked = TARGET_PRIORITY_RESOLVERS.huntingSignMarked(candidates);
    if (marked.length > 0) return marked;
  }
  const resolver = skill.targetPriority && TARGET_PRIORITY_RESOLVERS[skill.targetPriority];
  if (resolver) {
    const prioritized = resolver(candidates);
    if (prioritized.length > 0) return prioritized;
  }
  return candidates;
}

// count만큼 반복 추첨(중복 허용) — 같은 대상이 여러 번 뽑혀서 효과가 중첩
// 적용돼도 됨(예: 3 타겟 스킬인데 같은 대상이 2번 걸리면 그 대상만 2번 맞음).
function pickTargets(skill, candidates, count) {
  const pickPool = resolvePriorityPool(skill, candidates);
  if (pickPool.length === 0) return [];
  const picks = [];
  for (let i = 0; i < count; i++) picks.push(pickRandom(pickPool));
  return picks;
}

function resolveTargets(actor, skill, ctx) {
  let pool;
  if (skill.targetFaction === "self") {
    pool = [actor].filter((u) => u.isAlive); // 죽은 채로 행동할 일은 없지만 방어적으로
  } else if (skill.targetFaction === "everyone") {
    // 진영 구분 자체를 무시 — 아군/적군 풀을 하나로 합쳐버림(Explosion류
    // "all - all" 스킬 전용). "ally"/"enemy"처럼 actor.side 기준으로 어느
    // 쪽이 내 편인지 가리는 대신, ctx.allies+ctx.enemies를 있는 그대로
    // 합쳐서 "이 전투에 참여 중인 모든 생존 유닛"을 반환함.
    pool = [...ctx.allies, ...ctx.enemies].filter((u) => u.isAlive);
  } else if (skill.targetFaction === "deadAlly") {
    // 부활류 스킬 전용 — 일반 ally/enemy 타겟팅은 죽은 유닛을 전부 걸러내므로
    // (사망 상태에선 버프/디버프도 못 받아야 하니까) 부활만은 반대로 "죽은
    // 아군만" 찾아야 함. targetCount는 "all"/"single"/숫자 그대로 다 지원됨.
    pool = (actor.side === "ally" ? ctx.allies : ctx.enemies).filter((u) => !u.isAlive);
  } else if (skill.targetFaction === "ally") {
    pool = (actor.side === "ally" ? ctx.allies : ctx.enemies).filter((u) => u.isAlive);
  } else {
    // "enemy" 및 그 외 값은 전부 상대 진영으로 취급
    pool = ctx.getOpponents(actor).filter((u) => u.isAlive);
  }

  if (skill.targetCount === "all") {
    // "전체 타겟은 보호 규칙과 무관"이라는 원칙은 그대로(guard 보호캐로
    // 좁히지 않음) — 다만 우선순위(화살+징표, targetPriority)가 있으면
    // "그 조건에 맞는 대상 전체"로 좁혀짐(BackAttack류 — 후열 전체를 노림).
    return resolvePriorityPool(skill, pool);
  }

  if (skill.invalid) {
    // 차단 불가 — 보호 규칙을 건너뛰고 원래 대상 풀에서 그대로 선택(우선순위는 적용)
    if (skill.targetCount === "single") return pickTargets(skill, pool, 1);
    if (typeof skill.targetCount === "number") return pickTargets(skill, pool, skill.targetCount);
    return pool;
  }

  const guards = pool.filter((u) => u.row === "front" && u.guardAllies);
  const candidates = guards.length ? guards : pool;

  if (skill.targetCount === "single") return pickTargets(skill, candidates, 1);
  if (typeof skill.targetCount === "number") return pickTargets(skill, candidates, skill.targetCount);
  return candidates; // 레거시 문자열 "multiple" — 아직 쓰는 스킬 있으면 이전처럼 전체 반환
}

// ============================================================================
// 효과 하나 적용. castDelay/actionDelay는 PrepState로, 나머지는 캐릭터 필드를
// 직접 수정(버프/디버프는 전투 세션 내내 영구 적용 — Sheet의 EFFECT_TYPES 설계와
// 동일한 정책).
// ⚠ 여기서 직접 로그를 찍지 않고 "설명 문자열"을 반환함 — 호출부(주로
// applyDamageAndEffects)가 같은 히트의 데미지 줄 뒤에 이어붙여서 한 줄로 보여줌
// ("{대상}에게 {데미지}의 데미지. {효과 설명}." 형태). 효과가 실제로 아무 일도
// 안 했으면(예: 이미 Guard라 무시됨) null을 반환해서 아무것도 안 붙게 함.
// ============================================================================
// 한글 음절이면 받침(종성) 유무로 "이"/"가"를 자동 선택. 영문 약어(STR 등)는
// 관례상 "가"로 고정(한글처럼 발음 기준 종성 판정이 애매해서).
function subjectParticle(label) {
  const last = label.charCodeAt(label.length - 1);
  if (last >= 0xAC00 && last <= 0xD7A3) {
    return (last - 0xAC00) % 28 !== 0 ? "이" : "가";
  }
  return "가";
}

// 능력치 증감 효과가 상한(real의 2000%) 또는 하한(real의 50%)에 걸렸는지
// 확인해서, 걸렸으면 일반 설명 대신 "더 이상 증가/감소할 수 없다"로 교체함.
// capKey는 "Atk"/"Str"처럼 real{capKey}/effective{capKey} 필드 접미사,
// statLabel은 로그용 한글 이름, isIncrease는 이번 효과가 증가 방향인지(감소면
// false) — 방향에 따라 어느 쪽 캡에 걸렸는지만 확인함(반대쪽엔 안 걸림).
// realVal이 0이면 상/하한이 둘 다 0이라(맨몸 캐릭터 등) 항상 캡 상태로 취급됨
// — 이미 calculateEffectiveStat()이 그렇게 클램프하고 있어서 자연스러운 결과.
function describeStatCap(target, capKey, statLabel, isIncrease, normalDesc) {
  const effectiveVal = target[`effective${capKey}`];
  const realVal = target[`real${capKey}`];
  const particle = subjectParticle(statLabel);
  if (isIncrease && effectiveVal >= realVal * 20) return `${target.name}의 ${statLabel}${particle} 더 이상 증가할 수 없다.`;
  if (!isIncrease && effectiveVal <= realVal * 0.5) return `${target.name}의 ${statLabel}${particle} 더 이상 감소할 수 없다.`;
  return normalDesc;
}

function applyEffect(caster, target, effect, ctx) {
  // sideCondition — "same"이면 시전자와 같은 진영일 때만, "different"면 다른
  // 진영일 때만 이 효과가 적용됨(Purify류 "적에게는 피해, 아군에게는 회복"을
  // 표현하는 용도 — damageSideCondition이 데미지 판정을 가르는 것과 짝을
  // 이룸, 이건 effects 배열의 개별 효과 하나하나에 거는 버전). effect.target
  // === "self"로 대상이 이미 시전자로 바뀐 경우엔 그 시전자 기준으로 판단
  // (그 시점엔 target이 이미 actor와 같은 참조라 자연히 caster.side와
  // 같아지므로 "same"이 항상 통과함 — 자기 자신에게 거는 효과에 sideCondition을
  // 같이 쓸 이유는 딱히 없지만, 굳이 써도 사고가 안 나게).
  if (effect.sideCondition === "same" && target.side !== caster.side) return null;
  if (effect.sideCondition === "different" && target.side === caster.side) return null;

  switch (effect.type) {
    case "atkUp":
    case "atkDown": {
      target.bonusAtk += effect.value;
      const normal = `${target.name}의 공격력 ${effect.value >= 0 ? "+" : ""}${effect.value}.`;
      return describeStatCap(target, "Atk", "공격력", effect.value >= 0, normal);
    }

    case "defUp":
    case "defDown": {
      target.bonusDef += effect.value;
      const normal = `${target.name}의 방어력 ${effect.value >= 0 ? "+" : ""}${effect.value}.`;
      return describeStatCap(target, "Def", "방어력", effect.value >= 0, normal);
    }

    case "mdefUp":
    case "mdefDown": {
      target.bonusMdef += effect.value;
      const normal = `${target.name}의 마법방어력 ${effect.value >= 0 ? "+" : ""}${effect.value}.`;
      return describeStatCap(target, "Mdef", "마법방어력", effect.value >= 0, normal);
    }

    case "maxHpUp":
    case "maxHpDown":
      target.maxHpBonus = (target.maxHpBonus || 0) + effect.value;
      target.currentHp = Math.min(target.currentHp, target.maxHp);
      return `${target.name}의 Max HP ${effect.value >= 0 ? "+" : ""}${effect.value}.`;

    // maxHpUp(고정치)과 달리, 그 순간 maxHp의 %만큼 증감(OverLimit의
    // "MaxHP-20%"류). value가 음수면 감소.
    case "maxHpUpPercent": {
      const delta = Math.floor(target.maxHp * (effect.value / 100));
      target.maxHpBonus = (target.maxHpBonus || 0) + delta;
      target.currentHp = Math.min(target.currentHp, target.maxHp);
      return `${target.name}의 Max HP ${delta >= 0 ? "+" : ""}${delta}.`;
    }

    case "maxSpUp":
    case "maxSpDown":
      target.maxSpBonus = (target.maxSpBonus || 0) + effect.value;
      target.currentSp = Math.min(target.currentSp, target.maxSp);
      return `${target.name}의 Max SP ${effect.value >= 0 ? "+" : ""}${effect.value}.`;

    case "heal": {
      // 회복량 증가% — 회복을 "가하는" caster 쪽 패시브(장비/패시브 스킬)를 적용.
      // healingDealtFlat(고정치)은 %보다 먼저 더해져서 그 위에 %가 곱해짐 —
      // "회복스킬 자체"에만 적용되고 재생(applyTick)에는 안 걸림(별개 계산식).
      const healPct = caster.getPassiveModValue("healingDealtPct");
      const healFlat = caster.getPassiveModValue("healingDealtFlat");
      const healAmount = Math.max(0, Math.round((effect.value + healFlat) * (1 + healPct / 100)));
      const before = target.currentHp;
      target.currentHp = Math.min(target.maxHp, target.currentHp + healAmount);
      return statChangeLine(target.name, healAmount, "회복", before, target.currentHp);
    }

    // heal(고정치)과 달리, 회복량 자체가 caster의 스탯에서 매번 계산되는 버전.
    // 공식: realMatk × (effectiveInt × intFactor) × multiplier, 그 결과에
    // healingDealtFlat(고정치, %보다 먼저 더함) + healingDealtPct(%, 마지막에
    // 곱함)를 heal과 동일하게 적용. intFactor/multiplier 생략 시 기본값 각각
    // 0.01 / 1 — 다른 스킬도 자기만의 계수로 같은 방식의 스탯 스케일링 회복을
    // 쓸 수 있게 일반화함.
    // ⚠ 지금은 선형(realMatk×INT에 그대로 비례)이라, 나중에 MATK/INT가 훨씬
    // 커지면(특히 INT가 네 자릿수대) 회복량이 감당 안 되게 커질 수 있음 —
    // 그때는 intFactor 자체나 이 계산 안에 로그형 감쇠를 넣는 걸 고려하기로 함
    // (지금 당장은 "일단 체감되는 효과"가 우선이라 선형으로 둠).
    case "scaledHeal": {
      const intFactor = effect.intFactor ?? 0.01;
      const multiplier = effect.multiplier ?? 1;
      const base = caster.realMatk * (caster.effectiveInt * intFactor) * multiplier;
      const healPct = caster.getPassiveModValue("healingDealtPct");
      const healFlat = caster.getPassiveModValue("healingDealtFlat");
      const healAmount = Math.max(0, Math.floor((base + healFlat) * (1 + healPct / 100)));
      const before = target.currentHp;
      target.currentHp = Math.min(target.maxHp, target.currentHp + healAmount);
      return statChangeLine(target.name, healAmount, "회복", before, target.currentHp);
    }

    // 결손분(잃은 HP, maxHp-currentHp) 기준 회복 — percentOfMax(applyTick)나
    // scaledHeal(caster 스탯 기준)과는 기준 자체가 다름. 이미 거의 다 찬
    // 대상에겐 회복량이 자연히 작아지고, 많이 다친 대상일수록 크게 들어가는
    // "체력 비례" 방식(Hyper Recovery류). healingDealtFlat/healingDealtPct는
    // heal/scaledHeal과 동일하게 caster 쪽 걸 적용함.
    case "healMissingPercent": {
      const missingHp = target.maxHp - target.currentHp;
      const base = missingHp * (effect.value / 100);
      const healPct = caster.getPassiveModValue("healingDealtPct");
      const healFlat = caster.getPassiveModValue("healingDealtFlat");
      // +1e-9 — 부동소수점 오차 보정(예: 180×1.4가 JS에서 정확히 252가 아니라
      // 251.999999999997로 계산돼서 floor에 한 칸 잘려나가는 걸 방지).
      const healAmount = Math.max(0, Math.floor((base + healFlat) * (1 + healPct / 100) + 1e-9));
      const before = target.currentHp;
      target.currentHp = Math.min(target.maxHp, target.currentHp + healAmount);
      return `${statChangeLine(target.name, healAmount, "회복", before, target.currentHp)} (결손분의 ${effect.value}%)`;
    }

    // SP를 직접 깎는 데미지 — HP 데미지와는 완전히 별개 파이프라인(방어력/
    // Guard/Shield 등 HP 데미지 경감 체계를 전혀 안 거침, 이 효과가 걸린다는
    // 것 자체가 이미 그 히트의 HP 데미지 판정이 끝난 뒤라서). 기준은 항상
    // 대상의 "최대" SP(현재 SP 아님) — effect.value%.
    // SP를 직접 깎는 데미지 — HP 데미지와는 완전히 별개 파이프라인(방어력/
    // Guard/Shield 등 HP 데미지 경감 체계를 전혀 안 거침, 이 효과가 걸린다는
    // 것 자체가 이미 그 히트의 HP 데미지 판정이 끝난 뒤라서). 기준은 항상
    // 대상의 "최대" SP(현재 SP 아님) — effect.value%.
    // casterSpRestorePct(선택) — 실제로 깎인 SP의 이 %만큼을 시전자에게
    // 돌려줌(EnergyRob/EnergyCollect류 "SP 흡수"). 100이면 깎인 만큼 그대로
    // 흡수.
    case "spDamage": {
      const dmg = Math.floor(target.maxSp * (effect.value / 100));
      const before = target.currentSp;
      target.currentSp = Math.max(0, target.currentSp - dmg);
      const actualDrained = before - target.currentSp;
      let restoreNote = "";
      if (effect.casterSpRestorePct) {
        const restore = Math.floor(actualDrained * (effect.casterSpRestorePct / 100));
        caster.currentSp = Math.min(caster.maxSp, caster.currentSp + restore);
        restoreNote = ` (${caster.name} SP +${restore} 흡수)`;
      }
      return `${statChangeLine(target.name, actualDrained, "SP피해", before, target.currentSp)}${restoreNote}`;
    }

    case "spUp":
      target.currentSp = Math.min(target.maxSp, target.currentSp + effect.value);
      return `${target.name} SP +${effect.value}.`;

    case "spDown":
      target.currentSp = Math.max(0, target.currentSp - Math.abs(effect.value));
      return `${target.name} SP -${Math.abs(effect.value)}.`;

    // 지속 효과(출혈/재생/탈진 등) 부여 — 실제 HP/SP 증감은 여기서 바로 안
    // 일어나고, target.activeTicks에 등록만 해둠. 실제 틱 처리는 그 유닛이
    // 다음에 행동하기 직전에 BattleEngine.processActiveTicks()가 담당함.
    //   effect.kind: "hp" | "sp"
    //   effect.amountPerTick: 틱마다 증감량(회복이면 양수, 피해면 음수)
    //   effect.duration: 몇 턴(정확히는 몇 번의 행동 시점) 동안 지속되는지
    //   effect.name: 로그/표시용 이름(예: "출혈", "재생", "탈진")
    // amountPerTick(고정치) 또는 percentOfMax(그 시점 maxHp/maxSp의 %) 둘 중
    // 하나로 지정 — percentOfMax는 "리젠%"류(Regene Heal 등)를 위한 것으로,
    // 적용되는 이 순간에 실제 수치로 딱 한 번 환산해서 activeTicks에 고정값
    // 으로 박아둠(매 틱마다 다시 계산하지 않음 — 그 사이 maxHp가 바뀌어도
    // 이미 걸린 지속효과의 틱당 회복량 자체는 안 바뀜, 매 틱 새로 % 계산하는
    // 건 오히려 다른 의도라 굳이 안 만듦).
    // duration을 안 주면 영구지속 — 이 게임의 버프/디버프는 특별한 명시가
    // 없는 한 무조건 영구지속이라는 원칙을 tick류 효과에도 그대로 적용함.
    // Infinity로 두면 processActiveTicks()의 remainingTicks -= 1이 계속
    // Infinity로 남아서(Infinity - 1 === Infinity) 별도 분기 없이 자연히
    // "절대 안 끝남"이 됨. 임시 효과가 필요할 때만 duration을 명시하면 됨.
    case "applyTick": {
      target.activeTicks = target.activeTicks || [];
      const kind = effect.kind || "hp";
      const amountPerTick = effect.percentOfMax != null
        ? Math.floor((kind === "sp" ? target.maxSp : target.maxHp) * (effect.percentOfMax / 100))
        : (effect.amountPerTick || 0);
      const remainingTicks = effect.duration ?? Infinity;
      target.activeTicks.push({
        name: effect.name || "지속효과",
        kind,
        amountPerTick,
        remainingTicks,
      });
      const durationLabel = remainingTicks === Infinity ? "영구" : `${remainingTicks}회`;
      return `${target.name}에게 "${effect.name || "지속효과"}" 부여(${durationLabel}).`;
    }

    // 전후열(row) 변경 — row는 resolveTargets()의 보호(Guard) 로직이 그때그때
    // 읽는 값이라(어딘가에 별도로 캐시해두지 않음), 여기서 바꿔주기만 하면
    // 다음 판정부터 즉시 반영됨. effect.value: "front" | "back".
    case "setRow":
      target.row = effect.value === "back" ? "back" : "front";
      return `${target.name}의 진형이 ${target.row === "front" ? "전열" : "후열"}로 바뀜.`;

    // 대상에게 걸려있는 지속효과(재생/출혈 등 activeTicks)를 전부 지움 —
    // DeathStrike의 "HP&SP Regen=0"류를 표현하기 위한 근사(정확히는 "이후
    // 재생이 안 걸림"이지만, 지금은 "이미 걸려있는 재생을 지운다"는 근사로만
    // 처리함. 지운 뒤 다시 재생을 걸면 그건 새로 적용됨 — "봉인" 개념까지는
    // 아직 없음).
    case "clearTicks": {
      const hadTicks = (target.activeTicks || []).length > 0;
      target.activeTicks = [];
      return hadTicks ? `${target.name}의 지속효과가 전부 사라짐.` : null;
    }

    // value(고정치)만큼 대상의 bonus{Str|Int|Dex|Spd|Luk}를 올림 — statDownPercent와
    // 짝을 이루는 증가판이지만, 저쪽은 "그 순간 effective의 %"라 매번 다른 절대치가
    // 깎이는 반면 이쪽은 순수 고정치라 매 발동마다 그대로 누적됨(20을 세 번 걸면
    // bonus가 60이 됨). stat: "str"|"int"|"dex"|"spd"|"luk" 중 하나.
    case "statUp": {
      const statKey = effect.stat;
      const capKey = statKey.charAt(0).toUpperCase() + statKey.slice(1);
      target[`bonus${capKey}`] += effect.value;
      const normal = `${target.name}의 ${statKey.toUpperCase()} +${effect.value}.`;
      return describeStatCap(target, capKey, statKey.toUpperCase(), true, normal);
    }

    // ATK/DEF/MDEF 중 하나를 그 순간 effective 값의 %만큼 올림 — statDownPercent와
    // 같은 "그 순간 값 기준 %" 방식이지만 combat 스탯(ATK/DEF/MDEF)용이고 증가
    // 방향. atkUp/defUp/mdefUp(고정치, statUp과 같은 성격)과는 별개 효과.
    // effect.stat: "atk"|"def"|"mdef".
    case "combatStatUpPercent": {
      const statKey = effect.stat;
      const capKey = statKey.charAt(0).toUpperCase() + statKey.slice(1);
      const currentEffective = target[`effective${capKey}`];
      const increase = Math.floor(currentEffective * (effect.value / 100));
      target[`bonus${capKey}`] += increase;
      const label = { atk: "공격력", matk: "마법공격력", def: "방어력", mdef: "마법방어력" }[statKey] || statKey.toUpperCase();
      // 고정치(atkUp 등)와 달리 "그 순간 값의 %"라 실제 증가량이 매번 다름 —
      // 정확한 수치 대신 적용된 %만 알려줌(퍼센티지 효과는 전부 이 원칙).
      const normal = `${target.name}의 ${label} +${effect.value}%.`;
      return describeStatCap(target, capKey, label, true, normal);
    }

    // STR/INT/DEX/SPD/LUK 중 하나를 그 순간 effective 값의 %만큼 올림 —
    // combatStatUpPercent(ATK/DEF/MDEF용)와 완전히 같은 방식이지만 핵심
    // 스탯용. statUp(고정치)과 짝을 이루되, 저건 매 발동마다 그대로 누적되는
    // 반면 이건 statDownPercent처럼 "그 순간 값 기준 %"라 매번 실제로 늘어나는
    // 절대치가 달라짐. 중장기전 버프에 자주 쓰이게 될 효과라 별도 case로 둠.
    // effect.stat: "str"|"int"|"dex"|"spd"|"luk".
    case "statUpPercent": {
      const statKey = effect.stat;
      const capKey = statKey.charAt(0).toUpperCase() + statKey.slice(1);
      const currentEffective = target[`effective${capKey}`];
      const increase = Math.floor(currentEffective * (effect.value / 100));
      target[`bonus${capKey}`] += increase;
      const normal = `${target.name}의 ${statKey.toUpperCase()} +${effect.value}%.`;
      return describeStatCap(target, capKey, statKey.toUpperCase(), true, normal);
    }

    // value(%)만큼 대상의 현재 effective 스탯을 깎음(고정치가 아니라 그 순간의
    // 실제 값 기준 퍼센트라, 같은 5%라도 대상마다 실제로 깎이는 양은 다를 수
    // 있음). stat: "str"|"int"|"dex"|"spd"|"luk" 중 하나.
    case "statDownPercent": {
      const statKey = effect.stat;
      const capKey = statKey.charAt(0).toUpperCase() + statKey.slice(1);
      const currentEffective = target[`effective${capKey}`];
      const reduction = Math.floor(currentEffective * (effect.value / 100));
      target[`bonus${capKey}`] -= reduction;
      const normal = `${target.name}의 ${statKey.toUpperCase()} -${effect.value}%.`;
      return describeStatCap(target, capKey, statKey.toUpperCase(), false, normal);
    }

    case "actionDelay":
    case "castDelay": {
      const requiresPreDelayType = effect.type === "actionDelay" ? "action" : "casting";
      const result = ctx.prepState.applyDelayEffect(target, { requiresPreDelayType, value: effect.value });
      if (!result.applied) return null; // 효과 불발 — 조용히 생략
      // 정확한 수치(추가/저항된 틱 수)는 로그에 안 남기고 유형만 전달함.
      // addedDelay가 음수면 감속이 아니라 가속(effect.value를 음수로 주는
      // 경우) — applyDelayEffect 자체는 부호를 안 가리므로 이미 지원됨.
      // 다만 지금 시드 데이터엔 음수 value를 쓰는 스킬이 없어서 실전 경로는
      // 아직 없음(CLAUDE.md 참고 — 딜레이 저항 캡 수학이 반복 가속까지
      // 고려된 건 아니라서, 실제로 이 경로를 쓰게 되면 그 부분도 검토 필요).
      if (result.addedDelay < 0) return `${target.name}의 행동이 빨라졌다.`;
      if (effect.type === "actionDelay") return `${target.name}의 자세가 무너졌다.`;
      return `${target.name}${josa(target.name, "이", "가")} 방해를 받았다.`;
    }

    // 준비 중(기본은 casting류만)인 아군의 남은 선딜레이를 완전히 지워서 즉시
    // 발동시킴 — "Cast Assist"류 지원 효과. 대상이 애초에 준비 중이 아니거나
    // 요구하는 선딜레이 유형이 아니면 조용히 불발(효과 없음, 에러 아님).
    case "clearCastDelay": {
      const requiresPreDelayType = effect.requiresPreDelayType ?? "casting";
      const result = ctx.prepState.clearRemainingDelay(target, ctx.totalBattleTick, { requiresPreDelayType });
      if (result.applied) return `${target.name}의 영창이 즉시 완성됨.`;
      return null;
    }

    case "guard":
      if (!target.isGuarding) {
        target.isGuarding = true;
        target.guardType = effect.guardType || "all"; // "physical"|"magic"|"all"(기본)
        // 차단 범위(물리/마법/전체)는 일부러 로그에 안 남김 — 상대가 정확한
        // 효과를 보고 대응 수를 짜지 못하게, 결과로만 체감하게 하려는 의도.
        return `${target.name}${josa(target.name, "이", "가")} 방어를 굳혔다.`;
      }
      return null; // 이미 Guard 상태면 추가 레이어도, 설명도 없음

    // Guard와 다른 개념 — "이 공격 전체"가 아니라 "받는 피해 판정 N회"를
    // 정확히 무효화함(다단히트면 처음 N히트만 막히고 나머지는 통과). Guard와
    // 마찬가지로 이미 활성 상태(charges>0)면 재적용해도 중첩(추가) 안 됨.
    case "shield":
      if (target.shieldCharges <= 0) {
        target.shieldCharges = effect.charges || 1;
        target.shieldType = effect.shieldType || "all";
        // guard와 같은 이유로 차단 범위·횟수를 로그에 안 남김.
        return `${target.name}${josa(target.name, "이", "가")} 보호막을 둘렀다.`;
      }
      return null; // 이미 Shield 상태면 추가 레이어도, 설명도 없음

    // Hunting Sign — 대상에게 표식을 찍음. 화살을 소비하는 스킬은
    // resolveTargets 쪽에서 이 표식이 찍힌 대상을 자동으로 최우선 타겟팅함.
    case "huntingSign":
      target.huntingSignMarked = true;
      return `${target.name}에게 사냥의 징표가 찍혔다.`;

    // 비전 방어막류 — barrierHp(수치형 임시체력)를 부여. Shield("N회 차단")와
    // 달리 이건 "얼마나"로 소모되는 방식이라 반드시 캐릭터의 별도 필드
    // (barrierHp)로 관리됨. cap이 있으면 그 이상은 안 쌓임(누적 상한).
    case "barrierUp": {
      const gain = Math.max(0, Math.floor(effect.value || 0));
      const cap = effect.cap ?? Infinity;
      const before = target.barrierHp;
      target.barrierHp = Math.min(cap, target.barrierHp + gain);
      const actualGain = target.barrierHp - before;
      return `${target.name}의 비전 방어막 +${actualGain}. (현재 ${target.barrierHp})`;
    }

    // passiveMods에 값을 영구로 더함(스킬 습득 시가 아니라 "발동 시" 적용되는
    // 상시 패시브 부여 — Eagle Eye의 "매의 눈 상태" 같은, 액티브로 켜지만
    // 이후로는 상시 배율처럼 작동하는 효과용). effect.scaleByStat이 있으면
    // 고정치(effect.value) 대신 그 순간 대상의 effective{Stat}에 비례해서
    // 계산함(effect.scaleFactor, 기본 1) — "ATK의 50%만큼"류를 그 발동
    // 시점의 스탯으로 스냅샷 떠서 고정시키는 방식(그 이후 ATK가 변해도 이미
    // 부여된 값 자체는 재계산되지 않음).
    case "grantPassiveMod": {
      const key = effect.key;
      let value = effect.value ?? 0;
      if (effect.scaleByStat) {
        const capKey = effect.scaleByStat.charAt(0).toUpperCase() + effect.scaleByStat.slice(1);
        const statVal = target[`effective${capKey}`] || 0;
        value = Math.floor(statVal * (effect.scaleFactor ?? 1));
      }
      target.passiveMods[key] = (target.passiveMods[key] || 0) + value;
      return `${target.name}의 ${key} ${value >= 0 ? "+" : ""}${value} 부여.`;
    }

    // 스탠스 진입 — effect.key(문자열)와 effect.mods(배율/설정 객체)를 통째로
    // target에 심음. 이미 다른 스탠스여도(심지어 같은 스탠스여도) 그냥
    // 덮어씀 — character.stance가 값 하나짜리 필드라 "새로 들어가면 이전 게
    // 자동으로 풀리는" 게 원래 이렇게 자연히 성립함(음유시인의 "노래는 한
    // 번에 하나만" 같은 상호배타 규칙이 별도 로직 없이 저절로 됨).
    // 스탠스 진입 — target.stances[effect.key]에 effect.mods를 심음. 이미
    // 같은 key로 켜져있으면 그냥 덮어씀(재시전 시 갱신). effect.exclusiveGroup이
    // 있으면, 같은 그룹인 다른 스탠스들을 먼저 전부 지움(그 그룹 안에서만
    // 상호배타 — 음유시인의 "노래는 한 번에 하나만"류). 그룹 지정이 없으면
    // 아무것도 안 건드리고 그냥 추가하므로, 서로 다른 스탠스는 기본적으로
    // 자유롭게 동시에 켜져있을 수 있음(주문 집속 + 마나 실드 동시 적용 등).
    case "enterStance": {
      if (effect.exclusiveGroup) {
        Object.keys(target.stances).forEach((key) => {
          if (target.stances[key]?.exclusiveGroup === effect.exclusiveGroup) {
            delete target.stances[key];
          }
        });
      }
      target.stances[effect.key] = { ...(effect.mods || {}), exclusiveGroup: effect.exclusiveGroup };
      return `${target.name}${josa(target.name, "이", "가")} "${effect.label || effect.key}" 상태에 들어갔다.`;
    }

    // 스탠스 해제 — effect.key로 지정된 스탠스만 정확히 지움(다른 스탠스는
    // 그대로 유지). key가 없으면 켜져있는 스탠스를 전부 지움.
    case "exitStance": {
      if (effect.key) {
        if (!target.stances[effect.key]) return null;
        delete target.stances[effect.key];
        return `${target.name}의 "${effect.key}" 상태가 해제됨.`;
      }
      const keys = Object.keys(target.stances);
      if (keys.length === 0) return null;
      target.stances = {};
      return `${target.name}의 모든 상태가 해제됨. (${keys.join(", ")})`;
    }

    // 개인 자원(화살 등)을 최대치로 재충전 — Arrow Charge/Arcane Spear의

    // "화살을 가득 채운다"류. 해당 자원 자체가 없는 대상(화살통 없이 장착)
    // 이면 조용히 불발(에러 아님).
    case "refillPersonalResource": {
      const pool = target.personalResources?.[effect.resource];
      if (!pool) return null;
      pool.current = pool.max;
      return `${target.name}의 ${effect.resource} 재충전. (${pool.current}/${pool.max})`;
    }

    // 진영 공유 자원(마법진 등) 증가 — FactionResourceManager는 이미
    // addResource/consumeResource를 다 갖고 있었고, 소모(costs의 teamResource)만
    // 연결돼 있었을 뿐이라 "증가시키는" 통로만 여기서 새로 뚫음.
    // 자원은 항상 "시전자의 진영"에 적립됨(대상이 누구든 무관 — 적을 때리면서
    // 내 진영 마법진을 쌓는 스킬도 자연스럽게 표현됨).
    case "teamResourceGain": {
      const rm = ctx?.resourceManager;
      if (!rm) return null;
      const meta = TEAM_RESOURCE_TYPES[effect.resource];
      const key = meta ? meta.key : effect.resource;
      const gained = rm.addResource(caster.side, key, effect.value ?? 1);
      if (gained <= 0) return null; // 이미 최대치라 못 쌓았으면 로그도 안 남김
      const label = meta?.label || effect.resource;
      return `${caster.name}${josa(caster.name, "이", "가")} ${label}${josa(label, "을", "를")} ${gained}개 그렸다.`;
    }

    // 자원 변환 — 한쪽(from)을 깎아서 다른쪽(to)을 채움. Life Convert
    // ("HP 10% 소모, SP 80% 회복")나 Energy Exchange("HP/SP 교환") 같은
    // "한쪽을 대가로 다른쪽을 얻는" 스킬용.
    //   from/to: "hp" | "sp"
    //   fromPct: from의 "최대치" 대비 몇 %를 소모할지
    //   toPct:   to의 "최대치" 대비 몇 %를 회복할지
    // 소모는 남은 양만큼만 이뤄지고(0 밑으로 안 내려감), 회복도 최대치에서
    // 클램프됨. from을 실제로 소모한 만큼에 비례해서 to를 주는 게 아니라
    // 각각 독립적인 %라, "적은 대가로 큰 이득"(Life Convert) 같은 비대칭
    // 교환이 자연스럽게 표현됨.
    case "convertResource": {
      const maxOf = (kind) => (kind === "hp" ? target.maxHp : target.maxSp);
      const curOf = (kind) => (kind === "hp" ? target.currentHp : target.currentSp);
      const setOf = (kind, v) => { if (kind === "hp") target.currentHp = v; else target.currentSp = v; };

      const from = effect.from, to = effect.to;
      const cost = Math.floor(maxOf(from) * ((effect.fromPct ?? 0) / 100));
      const actualCost = Math.min(cost, curOf(from));
      setOf(from, curOf(from) - actualCost);

      const gainRaw = Math.floor(maxOf(to) * ((effect.toPct ?? 0) / 100));
      const beforeTo = curOf(to);
      setOf(to, Math.min(maxOf(to), beforeTo + gainRaw));
      const actualGain = curOf(to) - beforeTo;

      const label = (k) => (k === "hp" ? "HP" : "SP");
      return `${target.name}의 ${label(from)} -${actualCost}, ${label(to)} +${actualGain}.`;
    }

    // 부활 — 대상은 반드시 targetFaction:"deadAlly"로 지정된 죽은 아군이어야
    // 실제로 후보에 잡힘(일반 ally/enemy 타겟팅은 죽은 유닛을 걸러내므로).
    // TP effect.tpCost(기본 20)를 못 내면 그냥 실패(다른 부작용 없음). 성공하면
    // 현재 maxHp의 50%로 부활 — maxHp가 0이면 결과 currentHp도 0이라 isAlive가
    // (currentHp>0 계산이라) 자동으로 계속 false로 남음, 별도 분기 불필요.
    // 버프/디버프(bonus류)는 의도적으로 안 건드림(사망 중에도 유지되는 게
    // 이 게임의 규칙) — 단, activeTicks(재생/출혈 등)만 예외로 초기화함.
    case "resurrect": {
      if (target.isAlive) return null; // 이미 살아있으면 조용히 무시
      if (target.maxHp <= 0) return `${target.name}${josa(target.name, "은", "는")} 최대 HP가 0이라 부활할 수 없다.`;
      const tpCost = effect.tpCost ?? 20;
      const tpPool = target.personalResources?.tp;
      if (!tpPool || tpPool.current < tpCost) {
        return `${target.name}${josa(target.name, "은", "는")} TP가 부족해 부활할 수 없다. (TP ${tpPool ? tpPool.current : 0}/${tpCost})`;
      }
      tpPool.current -= tpCost;
      target.currentHp = Math.floor(target.maxHp * 0.5);
      target.activeTicks = []; // 재생/출혈 등 지속효과만 예외적으로 초기화
      target._deathProcessed = false; // 다시 죽을 수 있도록 사망 처리 플래그 리셋
      return `${target.name}${josa(target.name, "이", "가")} 부활했다! (HP ${target.currentHp}/${target.maxHp}, 남은 TP ${tpPool.current})`;
    }

    default:
      return `⚠ 알 수 없는 효과 타입: "${effect.type}"`;
  }
}

// ============================================================================
// 스킬의 데미지(있다면)와 효과 전부를 대상들에게 적용.
//   hits(기본 1) — 데미지 판정 횟수. 2 이상이면 매 히트마다 대상을 새로
//   뽑음(resolveTargets를 히트마다 다시 호출) — "매 판정 랜덤 타겟"인 스킬은
//   여기서 자연스럽게 구현됨(resolveTargets가 invalid+single일 때 이미
//   무작위 선택을 하므로 별도 랜덤 로직이 필요 없음).
//
//   방어 판정은 두 단계, 반드시 이 순서로: ① Guard 먼저 — "이 스킬 전체"에서
//   대상별로 딱 한 번만 판정해서 캐시함(guardDecisionCache). 막히면 그 스킬의
//   나머지 히트도 전부 막힘("패링"류 — 콤보 전체 무효화). ② Guard가 없거나 이미
//   이 스킬에서 소모됐으면 Shield 확인 — 이건 히트마다 매번 새로 판정(캐싱 안 함),
//   성공할 때마다 shieldCharges가 1씩 깎여서 "N회까지"만 막고 그 이후엔 통과됨
//   (Holy Shield류). 이 순서 덕분에 Guard가 막아준 히트는 Shield를 안 깎아먹어서,
//   Shield가 "보험"으로 온전히 남음.
//
// 로그 양식: 첫 줄에 "{caster}의 {skill.name}.", 그 아래 히트마다
// "{대상}에게 {데미지}의 데미지. {효과 설명}." 한 줄씩.
// ============================================================================
// 물리 명중률 — 특별한 보정이 없으면 90%로 고정. 나중에 realDex가 높을수록
// 100%에 근접하게 만들 예정이지만 지금은 이 상수 하나로 전부 통일함(회피
// 판정 자체가 아직 없어서, 이건 "물리 공격이 아예 안 닿을 확률"만 담당).
const BASE_PHYSICAL_HIT_CHANCE_PCT = 90;

function applyDamageAndEffects(actor, skill, ctx) {
  const hitCount = skill.hits || 1;
  const damageType = skill.skillType === "magic" ? "magic" : "physical"; // Guard/Shield 판정, DEF·MDEF 선택 전부 이 값 하나로 일관되게 씀
  const guardDecisionCache = new Map(); // target -> 이 스킬에서 Guard로 이미 막혔는지(true/false)
  const hitTracker = new Map(); // target -> 이 스킬 캐스트에서 이미 한 번이라도 맞은 적 있는지(연타점감용)

  // 대상 하나에 히트 한 번을 적용 — 명중 판정(물리+적 대상일 때만) -> Guard
  // (스킬 전체, 캐시) -> Shield(히트별, 매번 새로) 순서로 방어 판정, 그다음
  // 데미지·부가 효과까지 한 줄로 모아서 로그. "all"이든 "single/숫자(무작위)"든
  // 실제 적용 로직은 완전히 같고, 바깥에서 어떤 순서로 이 함수를 호출하느냐만
  // 다름.
  function resolveOneHit(t, hitIndex) {
    // 명중 판정 — 물리 공격이 "적"을 대상으로 할 때만 빗나갈 수 있음(자기
    // 강화/아군 지원용 물리 스킬은 애초에 안 맞을 이유가 없음). Guard/Shield
    // 판정보다 먼저 함 — 빗나간 공격은 방어 자원(Guard/Shield 등)을 전혀
    // 소모시키지 않음(애초에 안 닿았으니까).
    if (skill.skillType === "physical" && skill.targetFaction === "enemy") {
      const hitChancePct = BASE_PHYSICAL_HIT_CHANCE_PCT + actor.getPassiveModValue("accuracyBonusPct");
      if (Math.random() * 100 >= hitChancePct) {
        ctx.log(`   ${t.name}에게 빗나갔다.`);
        return;
      }
    }

    if (!guardDecisionCache.has(t)) {
      guardDecisionCache.set(t, t.checkAndConsumeGuard(damageType));
    }
    if (guardDecisionCache.get(t)) {
      ctx.log(`   ${t.name}의 공격이 Guard로 완전히 무효화됨.`);
      return;
    }
    if (t.checkAndConsumeShield(damageType)) {
      ctx.log(`   ${t.name}의 공격이 Shield로 무효화됨.`);
      return;
    }

    // 완전방어(확률형) — Guard/Shield(결정적, "항상" 막힘)와 달리 이건 매
    // 히트마다 % 확률로만 발동함. 발동하면 이번 히트(데미지 판정 자체)를
    // 통째로 무효화하지만, 소모되는 자원이 없어서 다음 히트에서도 똑같은
    // 확률로 다시 시도됨(Guard/Shield처럼 "쓰면 없어지는" 자원이 아니라
    // 그냥 상시 확률 판정).
    const completeDefenseChancePct = t.getPassiveModValue("completeDefenseChancePct");
    if (completeDefenseChancePct > 0 && Math.random() * 100 < completeDefenseChancePct) {
      ctx.log(`   ${t.name}의 완전방어 발동! 데미지 무효화.`);
      return;
    }

    let damageLine = "";
    // damageSideCondition — "same"이면 시전자와 같은 진영일 때만, "different"면
    // 다른 진영일 때만 이 히트의 데미지 판정 자체가 발생함(Purify류 "적에게는
    // 피해, 아군에게는 회복"을 표현하는 용도). 지정 안 하면 기존처럼 대상이
    // 누구든 무조건 데미지 판정.
    const damageSideOk =
      !skill.damageSideCondition ||
      (skill.damageSideCondition === "same" ? t.side === actor.side : t.side !== actor.side);

    if (damageSideOk && skill.stat && skill.coefficient) {
      let power = Math.floor(computeSkillPower(actor, skill));

      // 진형 배율 판정 — skill.rowMultiplier = { who:"self"|"target", row:"front"|"back",
      // multiplier:N } 하나면 모든 히트에 동일 적용. 히트마다 다른 조건이
      // 필요한 스킬(Ultimate Strike류 — 1타는 자신 row, 2타는 대상 row)은
      // 배열로 주면 됨: rowMultiplier[히트인덱스]가 그 히트에만 적용되고,
      // 배열 길이가 hits보다 짧으면 그 이후 히트엔 그냥 배율이 안 걸림(에러 아님).
      if (skill.rowMultiplier) {
        const config = Array.isArray(skill.rowMultiplier) ? skill.rowMultiplier[hitIndex] : skill.rowMultiplier;
        if (config) {
          const subject = config.who === "target" ? t : actor;
          if (subject.row === config.row) {
            power = Math.floor(power * config.multiplier);
          }
        }
      }

      // 연타점감 — 이 스킬에 이미 한 번이라도 맞은 적 있는 대상이면 위력을
      // diminishPerHit%만큼 "딱 한 번" 깎고, 그 이후 히트들은 전부 그 깎인
      // 값을 그대로 유지함(계속 곱연산으로 더 깎이지 않음 — 매번 hitTracker가
      // true인 채로 유지되니 %가 아니라 %p처럼 "1회 계단식"으로만 작동).
      // powerBeforeDiminish는 점감 적용 "전" 값을 보존해뒀다가 최소피해 기준
      // (minimumDamageBasis)으로 씀 — 연타점감은 공격 측이 의도적으로 위력을
      // 깎는 밸런스 장치라, 방어력에 대한 최후 보루인 최소피해 보장선까지
      // 같이 줄어드는 건 의도가 아님(요청에 따라 분리함).
      // 대상 등급(creatureTier)별 위력 배율 — skill.tierMultiplier =
      // { user:0.5, boss:0, elite:1.2, ... } 형태로, 이번 히트 대상의
      // creatureTier에 해당하는 배율만 곱함(없는 등급은 배율 없음=1).
      // "유저 타입에게 50% 데미지"(ReverseGravity/Cataclysm)나 "보스 타입
      // 면역"(Excorsism) 같은 걸 표현. 0을 지정하면 그 등급엔 아예 데미지가
      // 안 들어감(아래 power > 0 검사에서 자연히 걸러짐).
      if (skill.tierMultiplier) {
        const tierMul = skill.tierMultiplier[t.creatureTier];
        if (tierMul != null) power = Math.floor(power * tierMul);
      }

      const powerBeforeDiminish = power;
      if (skill.diminishPerHit && hitTracker.get(t)) {
        power = Math.floor(power * (1 - skill.diminishPerHit / 100));
      }

      if (power > 0) {
        // 크리티컬 — 히트마다 독립 판정. 다단히트 스킬은 각 히트가 따로
        // 굴려지므로 "스킬 한 번에 한 방만 크리" 같은 손해 없이, 히트 수가
        // 많을수록 기대값이 자연스럽게 안정됨.
        const isCrit = Math.random() * 100 <= actor.critRate;
        const critMul = isCrit ? actor.critMultiplier : 1;
        const finalPower = applyDealtPassiveMods(actor, Math.floor(power * critMul), damageType, skill.stat, t.creatureTier);
        const minimumBasis = applyDealtPassiveMods(actor, Math.floor(powerBeforeDiminish * critMul), damageType, skill.stat, t.creatureTier);
        const before = t.currentHp;
        // 스킬 자체의 방어력 무시%(스킬 필드)와 시전자의 패시브(장비/패시브
        // 스킬)가 주는 방어력 무시%를 합산해서 넘김 — 여러 출처가 겹쳐서
        // 100을 넘어도 takeDamage()가 알아서 100으로 클램프함.
        const passiveIgnorePct = actor.getPassiveModValue(damageType === "magic" ? "magicIgnoreBonusDefPct" : "physicalIgnoreBonusDefPct");
        const totalIgnorePct = (skill.ignoreBonusDefPct || 0) + passiveIgnorePct;
        const applied = t.takeDamage(finalPower, damageType, { ignoreBonusDefPct: totalIgnorePct, minimumDamageBasis: minimumBasis, attackerTier: actor.creatureTier });
        ctx.recordDamageDealt?.(actor.side, applied);
        damageLine = `${isCrit ? "치명타! " : ""}${statChangeLine(t.name, applied, "데미지", before, t.currentHp)}`;
        applyLifesteal(actor, applied, ctx);
      }
      hitTracker.set(t, true);
    }

    // effect.target === "self"면 이번 히트의 피격 대상(t)이 아니라 시전자
    // 자신(actor)에게 적용됨 — "적 대상 스킬인데 부가 효과 하나는 자기 자신한테
    // 걸리는" 경우(Charge Attack의 "자신 전열화" 등)를 표현하기 위함. 필드가
    // 없으면 기존처럼 무조건 t(피격 대상)에게 적용됨(회귀 없음).
    const effectDescs = (skill.effects || [])
      .map((effect) => applyEffect(actor, effect.target === "self" ? actor : t, effect, ctx))
      .filter(Boolean);

    const line = [damageLine, ...effectDescs].filter(Boolean).join(" ");
    if (line) ctx.log(`   ${line}`);
  }

  // 전후열 교차(Voltex Sphere류) — skill.bounceRows === true면 히트가 앞뒤
  // 열을 번갈아 튕겨다님. 첫 히트는 아무 생존 대상(우선순위 반영)에게
  // 들어가고, 그 다음부터는 "직전에 맞은 대상의 반대 열"에 있는 생존자 중
  // 하나에게 무작위로 튕김. 반대 열에 아무도 없으면 그 자리에서 중단(남은
  // 히트는 버려짐) — "튕길 데가 없으면 break" 규칙 그대로.
  if (skill.bounceRows) {
    const pool = resolveTargets(actor, skill, ctx);
    if (pool.length === 0) {
      ctx.log(`   (대상 없음 — 효과 불발)`);
      return;
    }
    let current = pickRandom(pool);
    for (let hit = 0; hit < hitCount; hit++) {
      resolveOneHit(current, hit);
      if (hit === hitCount - 1) break; // 마지막 히트면 더 튕길 필요 없음

      // 다음 튕길 곳 — "직전 대상의 반대 열"에 있는 생존자만. 매 히트마다
      // 새로 뽑으므로 도중에 누가 죽으면 자동으로 후보에서 빠짐.
      const wantRow = current.row === "front" ? "back" : "front";
      const nextCandidates = resolveTargets(actor, skill, ctx).filter((u) => u.row === wantRow);
      if (nextCandidates.length === 0) {
        ctx.log(`   (${wantRow === "front" ? "전열" : "후열"}에 튕길 대상이 없어 연쇄 중단)`);
        break;
      }
      current = pickRandom(nextCandidates);
    }
    return;
  }

  if (skill.targetCount === "all") {
    // "all"은 언제 resolveTargets를 불러도 항상 같은 전체 집합이라, 한 번만
    // 구해서 "대상 하나당 hitCount번을 전부 마친 뒤 다음 대상으로" 순서로
    // 진행함(예: 1은 데미지를 입었다×4, 2는 데미지를 입었다×4 — 히트 축이 아니라
    // 대상 축이 바깥). 히트마다 다시 뽑아도 결과가 같으니 이렇게 순서만
    // 바꿔도 안전함.
    const targets = resolveTargets(actor, skill, ctx);
    if (targets.length === 0) {
      ctx.log(`   (대상 없음 — 효과 불발)`);
      return;
    }
    targets.forEach((t) => {
      for (let hit = 0; hit < hitCount; hit++) resolveOneHit(t, hit);
    });
  } else {
    // "single"/숫자(무작위) — 히트마다 다시 추첨함(매번 다른 대상이 걸릴 수
    // 있는 게 의도된 동작이라 순서를 안 바꿈).
    for (let hit = 0; hit < hitCount; hit++) {
      const targets = resolveTargets(actor, skill, ctx);
      if (targets.length === 0) {
        ctx.log(`   (대상 없음 — 효과 불발)`);
        continue;
      }
      targets.forEach((t) => resolveOneHit(t, hit));
    }
  }
}

module.exports = { resolveTargets, applyEffect, applyDamageAndEffects };


  // 브라우저 환경이면 이 모듈의 exports를 공용 네임스페이스에 얹음(Node에서는
  // window가 없으니 아무 일도 안 함. 어차피 Node의 진짜 module.exports는 위에서
  // 그대로 전달받은 그 객체라 이 시점에 이미 다 채워져 있음).
  if (typeof window !== "undefined") {
    window.BattleSim = window.BattleSim || {};
    Object.assign(window.BattleSim, module.exports);
  }
})(typeof module !== "undefined" ? module : undefined, typeof require !== "undefined" ? require : undefined);
