// ============================================================================
// 레이드 기믹 판정 (공용)
//
// 레이드는 "데미지만 넣으면 되는 딜 경쟁"이 아니라 퍼즐이어야 한다는 설계
// 의도(2026-08-31 사용자 확정)를 실제 보상으로 잇는 장치. 특정 기믹을
// 성공시키면 데미지와 별도로 기여 점수를 받는다.
//
// ── 역할 분담(중요) ────────────────────────────────────────────────────────
// · 배점(gimmickPoints)은 **서버만** 안다 — game_content.raidTable에 있고
//   supabase/migrations/0027_coop_raid.sql의 submit_raid_run이 읽는다.
//   클라이언트에 배점이 있으면 아무나 "999999점 획득했다"고 주장할 수 있다.
// · 이 파일은 **"어떤 id를 달성했는가"만** 판정한다. 서버는 넘어온 id 중
//   자기 배점표(gimmick_points)에 실제로 있는 것만 인정하므로(0027의
//   `v_r.gimmick_points ? g` 필터), 없는 id를 지어내도 무시된다.
// · 유저·레이드당 같은 id는 1회만 인정된다(raid_participants.gimmick_ids).
//
// ⚠ 이것은 방어가 아니다. 전투가 100% 클라이언트에서 끝나므로(engine.js),
// 악의적 클라이언트는 하지 않은 기믹을 주장할 수 있다. 위 두 장치는 무한
// 점수를 유계 점수로 만드는 것이지 위조를 막지 못한다. 0027 헤더 참고.
//
// ── 판정 어휘를 이것만 만든 이유(재조사 방지) ──────────────────────────────
// 엔진이 내보내는 구조화 이벤트는 전수 조사 결과 **딱 3종**뿐이다
// (recordEvent 호출 지점 8곳 전부 확인, 2026-08-31):
//   { tick, turn, type:"act",   actor, side, act, prepared?, activated? }
//   { tick, turn, type:"death", unit, side }
//   { tick, turn, type:"hit",   actor, target, act, result, crit?, damage? }
//       result ∈ miss | guard | shield | completeDefense | hit
//
// 그래서 아래 메트릭에 **없는 것**들은 "빠뜨린" 게 아니라 애초에 관측이
// 불가능한 것들이다. 다음에 다시 조사하지 않도록 근거를 남긴다:
//   · 스탠스 진입/이탈 — enterStance/exitStance(skillResolution.js:663,677)는
//     서사 문자열만 반환하고 이벤트를 안 낸다. "보스가 X 스탠스에 들어가기
//     전에 처치" 같은 기믹은 **지금 구조로는 만들 수 없다**. 굳이 하려면
//     스탠스를 부여하는 스킬 이름을 actNotSeen으로 우회하는 수밖에 없다.
//   · 버프/디버프 적용 여부, 자원 증감, 힐량 — 전부 로그 문자열만.
//   · 소환된 마릿수 — performSummon(registries.js:527-531)이 의도적으로 수를
//     숨긴다. 대신 participants.enemy의 creatureTier==="creature" 항목을 세면
//     "소환체가 몇이나 남았는지"는 알 수 있어 enemyCreaturesAlive로 제공한다.
//   · 패턴 슬롯 인덱스 — engine.js:353-355가 "유저가 결과만 보고 패턴을 직접
//     추론하는 게 이 게임의 핵심 재미"라며 일부러 안 남긴다. 존중한다.
//   · ATTACK / DETONATE_MAGIC_CIRCLE 경로의 데미지는 hit 이벤트를 **안 낸다**
//     (registries.js:301,333이 recordDamageDealt만 부르고 recordEvent는 안 부름).
//     따라서 hitResultCount는 "스킬로 들어온 타격"만 센다. 일반 공격을 세는
//     기믹은 만들 수 없다.
//
// 또한 모든 이벤트는 **표시 이름(name)으로만** 키잉된다(id 없음). 같은 몬스터가
// 여러 마리면 이름이 겹치므로, unitDefeated류는 이름이 고유한 대상(보스,
// 보물상자)에만 쓸 것.
//
// ⚠ events는 recordEvents:true일 때만 채워진다. 이를 넘기는 유일한 호출자가
// web/battle-view.html이다(파견은 안 넘김 → events []). 레이드는 battle-view로만
// 진입하므로 문제없지만, 다른 경로를 추가한다면 반드시 같이 켜야 한다.
//
// ⚠ 레이드 보스는 처치 불가(퇴각 기믹) 설계라, 풀을 바닥내는 마지막 런을 빼면
// 전투가 100턴 상한에 걸려 outcome이 "draw"로 끝난다(engine.js:244-247).
// 그러니 outcome 메트릭에 의존하는 기믹은 사실상 마지막 런 전용이 된다 —
// 대부분의 기믹은 승패와 무관한 지표로 짤 것.
// ============================================================================
(function () {
  // 비교 연산자 — battle-select.html의 REQUIREMENT_TYPES가 label/describe/check
  // 3종 세트로 조건을 표현하는 것과 같은 결의, 아주 작은 어휘만 둔다.
  const COMPARATORS = {
    eq: (a, b) => a === b,
    ne: (a, b) => a !== b,
    lt: (a, b) => a < b,
    lte: (a, b) => a <= b,
    gt: (a, b) => a > b,
    gte: (a, b) => a >= b,
  };

  // 메트릭 레지스트리 — src/registries.js의 ConditionRegistry(정적 Map +
  // register/check)와 같은 패턴. 새 메트릭이 필요하면 여기 한 줄만 추가하면
  // raidTable에서 바로 쓸 수 있다.
  const METRICS = new Map();
  function registerMetric(key, fn) { METRICS.set(key, fn); }

  const events = (result) => (Array.isArray(result?.events) ? result.events : []);
  const enemyUnits = (result) => (result?.participants?.enemy || []);

  // ── 수치형 메트릭(cmp + value로 비교) ──────────────────────────────────
  registerMetric("turnsElapsed", (result) => result?.turnsElapsed ?? 0);
  registerMetric("damageDealt", (result) => result?.damageDealt?.ally ?? 0);
  registerMetric("allySurvivors", (result) => result?.survivorCounts?.ally?.alive ?? 0);
  registerMetric("allyDeaths", (result) => {
    const c = result?.survivorCounts?.ally;
    return c ? (c.total - c.alive) : 0;
  });
  // 소환된 개체 중 아직 살아있는 수 — "소환체 전멸"(eq 0)에 씀.
  // creatureTier "creature"는 performSummon이 붙이는 값(registries.js:507).
  registerMetric("enemyCreaturesAlive", (result) =>
    enemyUnits(result).filter((u) => u.creatureTier === "creature" && u.isAlive).length);
  // 특정 result의 타격 판정 횟수(스킬 경로만 — 위 주석 참고).
  // rule.value에 판정 이름("completeDefense" 등)을 넣고 cmp/threshold로 비교.
  registerMetric("hitResultCount", (result, rule) =>
    events(result).filter((e) => e.type === "hit" && e.result === rule.value).length);

  // ── 불리언형 메트릭(cmp 없이 그 자체로 참/거짓) ────────────────────────
  registerMetric("outcome", (result, rule) => result?.outcome === rule.value);
  // 어떤 행동(act)이 전투 중 한 번이라도 관측됐는가. act는 ActionRegistry 키
  // ("SUMMON","RETREAT","REWARD_GRANT",...) 또는 스킬 이름 그대로.
  registerMetric("actSeen", (result, rule) =>
    events(result).some((e) => e.type === "act" && e.act === rule.value));
  // 끝까지 한 번도 안 나왔는가 — "자폭을 저지했다" 같은 저지형 기믹용.
  registerMetric("actNotSeen", (result, rule) =>
    !events(result).some((e) => e.type === "act" && e.act === rule.value));
  // N턴 이내에 그 행동이 나왔는가.
  registerMetric("actSeenByTurn", (result, rule) =>
    events(result).some((e) => e.type === "act" && e.act === rule.value && e.turn <= rule.turn));
  // 특정 이름의 유닛이 쓰러졌는가(이름이 고유한 대상에만 쓸 것).
  registerMetric("unitDefeated", (result, rule) =>
    events(result).some((e) => e.type === "death" && e.unit === rule.value));

  // 규칙 하나를 판정. 메트릭이 숫자를 돌려주면 cmp+value로 비교하고,
  // 불리언을 돌려주면 그대로 쓴다(불리언 메트릭은 rule.value를 자기가 소비함).
  function checkRule(rule, result) {
    if (!rule || !rule.metric) return false;
    const fn = METRICS.get(rule.metric);
    if (!fn) {
      console.warn(`[raid-gimmicks] 알 수 없는 메트릭: ${rule.metric}`);
      return false;
    }
    const got = fn(result, rule);
    if (typeof got === "boolean") return got;

    const cmp = COMPARATORS[rule.cmp || "gte"];
    if (!cmp) {
      console.warn(`[raid-gimmicks] 알 수 없는 비교 연산자: ${rule.cmp}`);
      return false;
    }
    // hitResultCount처럼 value를 "무엇을 셀지"로 이미 써버린 메트릭은
    // 비교 대상 숫자를 threshold에서 읽는다.
    const target = rule.threshold !== undefined ? rule.threshold : rule.value;
    return cmp(got, target);
  }

  /**
   * 달성한 기믹 id 배열을 돌려줌.
   * @param {Object} gimmickRules raidTable의 gimmickRules — { id: { label, when } }
   * @param {Object} result       BattleEngine.startBattle()의 반환값
   * @returns {string[]}
   */
  function evaluate(gimmickRules, result) {
    if (!gimmickRules || typeof gimmickRules !== "object") return [];
    return Object.keys(gimmickRules).filter((id) => {
      try {
        return checkRule(gimmickRules[id]?.when, result);
      } catch (err) {
        // 규칙 하나가 깨져도 나머지 판정과 전투 결과 저장까지 같이 죽으면 안 됨.
        console.warn(`[raid-gimmicks] "${id}" 판정 실패:`, err);
        return false;
      }
    });
  }

  /** 결과 화면에 "달성/미달성"을 보여주기 위한 표시용 목록. */
  function describe(gimmickRules, achievedIds) {
    if (!gimmickRules || typeof gimmickRules !== "object") return [];
    const achieved = new Set(achievedIds || []);
    return Object.keys(gimmickRules).map((id) => ({
      id,
      label: gimmickRules[id]?.label || id,
      achieved: achieved.has(id),
    }));
  }

  window.RaidGimmicks = { evaluate, describe, registerMetric, METRICS, COMPARATORS };
})();
