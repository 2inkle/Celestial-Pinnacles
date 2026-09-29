// ============================================================================
// 브라우저에서도 그대로 로드해 쓸 수 있게 하는 최소 CommonJS 래퍼 — 다른
// src/*.js와 같은 형태(자세한 이유는 src/resourceTypes.js 상단 주석 참고).
// ============================================================================
(function (module, require) {
  if (!module) {
    module = { exports: {} };
    require = function () { return (typeof window !== "undefined" && window.BattleSim) || {}; };
  }

// ============================================================================
// 엔진 난수 공급원(2026-09-29 신설). 엔진 안의 모든 난수(명중/치명타/완전방어/
// 무작위 대상/확률 조건/소환 추첨/드랍)는 Math.random()을 직접 부르지 않고
// 반드시 Rng.random()을 거친다.
//
// 왜 필요한가:
//   1) 밸런스 개편 전/후를 "같은 난수 흐름"으로 비교해야 공정한 비교가 됨
//      (simulate.js).
//   2) Unity(C#) 이식 시 같은 시드·같은 입력으로 JS와 C#이 한 줄도 다르지 않은
//      로그를 내는지 대조하는 골든 로그 테스트의 전제.
//
// 기본값은 시드 없음 = 매번 Math.random()을 "호출 시점에" 부름 — 게임 동작은
// 이전과 완전히 같고, 기존 demo-*.js가 Math.random을 몽키패치해 결정적으로
// 만드는 방식도 그대로 통한다(참조를 미리 붙잡아두지 않으므로).
//
// 시드 모드의 알고리즘은 mulberry32 — 32비트 정수 연산만 써서 C#에서도
// uint 연산으로 비트 단위까지 똑같이 재현 가능하다(이식 시 이 함수를 그대로
// 옮길 것: Math.imul = 32비트 곱의 하위 32비트, >>> 0 = uint 변환).
// ============================================================================
function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let seededSource = null;

const Rng = {
  // [0, 1) 범위 난수 — Math.random()과 같은 계약.
  random() {
    return seededSource ? seededSource() : Math.random();
  },
  // 이후 모든 엔진 난수를 이 시드의 결정적 수열로 고정.
  seed(seedValue) {
    seededSource = mulberry32(seedValue);
  },
  // 시드 해제 — 다시 Math.random()을 씀(게임 기본 상태).
  reset() {
    seededSource = null;
  },
  isSeeded() {
    return seededSource !== null;
  },
  // fn 실행 동안만 시드를 걸고, 끝나면(예외여도) 원래 상태로 되돌림
  // (이전이 시드 모드였다면 그 수열의 진행 위치 그대로 이어짐).
  withSeed(seedValue, fn) {
    const prev = seededSource;
    seededSource = mulberry32(seedValue);
    try { return fn(); } finally { seededSource = prev; }
  },
};

module.exports = { Rng, mulberry32 };


  // 브라우저 환경이면 이 모듈의 exports를 공용 네임스페이스에 얹음(Node에서는
  // window가 없으니 아무 일도 안 함. 어차피 Node의 진짜 module.exports는 위에서
  // 그대로 전달받은 그 객체라 이 시점에 이미 다 채워져 있음).
  if (typeof window !== "undefined") {
    window.BattleSim = window.BattleSim || {};
    Object.assign(window.BattleSim, module.exports);
  }
})(typeof module !== "undefined" ? module : undefined, typeof require !== "undefined" ? require : undefined);
