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
// 자원 종류 레지스트리 (엔진용) — web/character-sheet.html의 TEAM_RESOURCE_TYPES/
// PERSONAL_RESOURCE_TYPES와 같은 목록을 유지해야 함(현재는 두 곳에 따로 관리되는
// 중복 지점 — 나중에 공용 모듈로 합칠 수 있으면 합치는 게 좋음).
//
// TEAM_RESOURCE_TYPES의 key는 FactionResourceManager.registerResource()에 실제로
// 등록되는 이름(각 항목의 `key`)과 일치해야 함. BattleEngine 생성 시 이 레지스트리를
// 순회하며 두 진영 모두에 자동 등록함(src/engine.js 참고).
// ============================================================================
const TEAM_RESOURCE_TYPES = {
  magicCircle: { label: "마법진", key: "MAGIC_CIRCLE", defaultMax: 10 },
  // 새 팀 자원 예시: warBanner: { label:"전쟁 깃발", key:"WAR_BANNER", defaultMax:5 }
};

// 개인 자원은 진영이 아니라 유닛 개인이 들고 있음(actor.personalResources[key]).
// 이 레지스트리는 "어떤 종류가 존재하는지"의 카탈로그.
//
// jobGrant가 있는 자원은 "그 직업이면 전투 시작 시 자동으로 갖고 시작하는"
// 직업 고유 자원 — 어댑터(buildAllyFromRoster)가 캐릭터의 직업을 보고 자동
// 등록함. 화살처럼 장비(화살통)로 얻는 자원은 jobGrant 없이 장비 쪽
// grantsResource로 부여됨.
const PERSONAL_RESOURCE_TYPES = {
  arrow: { label: "화살" }, // 화살통(grantsResource)으로 부여됨
  bullets: { label: "탄환" },
  passion: { label: "열정" },
  // 집속 마력 — 둠로드/스펠마의 직업 고유 자원. SpellFocus 스탠스 중에
  // SP를 쓸 때마다 소모량에 비례해 쌓이고(stanceMods.resourceOnCost),
  // 상위 스킬들이 이걸 코스트로 소모함. 초기값 0에서 시작해 최대 1000까지.
  focusMana: { label: "집속 마력", jobGrant: { jobs: ["둠로드", "스펠마"], initial: 0, max: 1000 } },
};

module.exports = { TEAM_RESOURCE_TYPES, PERSONAL_RESOURCE_TYPES };


  // 브라우저 환경이면 이 모듈의 exports를 공용 네임스페이스에 얹음(Node에서는
  // window가 없으니 아무 일도 안 함. 어차피 Node의 진짜 module.exports는 위에서
  // 그대로 전달받은 그 객체라 이 시점에 이미 다 채워져 있음).
  if (typeof window !== "undefined") {
    window.BattleSim = window.BattleSim || {};
    Object.assign(window.BattleSim, module.exports);
  }
})(typeof module !== "undefined" ? module : undefined, typeof require !== "undefined" ? require : undefined);
