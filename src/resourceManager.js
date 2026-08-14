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
// 진영 공유 자원 관리자 (Faction Resource Manager)
// ============================================================================

class FactionResourceManager {
  constructor() {
    this.resources = { ally: new Map(), enemy: new Map() };
  }

  registerResource(faction, key, initial = 0, max = 99) {
    this.resources[faction].set(key, { current: initial, max });
  }

  addResource(faction, key, amount, log = () => {}) {
    const res = this.resources[faction]?.get(key);
    if (!res) return 0;
    const prev = res.current;
    res.current = Math.min(res.max, res.current + amount);
    log(`      ✨ [진영 자원] ${faction.toUpperCase()} 진영: "${key}" +${res.current - prev} (현재: ${res.current}/${res.max})`);
    return res.current - prev;
  }

  consumeResource(faction, key, amount, log = () => {}) {
    const res = this.resources[faction]?.get(key);
    if (!res || res.current < amount) return false;
    res.current -= amount;
    log(`      🔥 [진영 자원] ${faction.toUpperCase()} 진영: "${key}" -${amount} 소모 (남은 자원: ${res.current}/${res.max})`);
    return true;
  }

  getResource(faction, key) {
    return this.resources[faction]?.get(key)?.current || 0;
  }
}

module.exports = { FactionResourceManager };


  // 브라우저 환경이면 이 모듈의 exports를 공용 네임스페이스에 얹음(Node에서는
  // window가 없으니 아무 일도 안 함. 어차피 Node의 진짜 module.exports는 위에서
  // 그대로 전달받은 그 객체라 이 시점에 이미 다 채워져 있음).
  if (typeof window !== "undefined") {
    window.BattleSim = window.BattleSim || {};
    Object.assign(window.BattleSim, module.exports);
  }
})(typeof module !== "undefined" ? module : undefined, typeof require !== "undefined" ? require : undefined);
