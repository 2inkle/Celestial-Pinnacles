// ============================================================================
// 전투 시뮬레이터 — 같은 매치업을 N회 반복해서 "이 조합으로 클리어 가능한가"를
// 통계로 확인하는 도구.
//
// 데모(demo-*.js)와 목적이 다름:
//   데모  — "이 메커니즘이 명세대로 작동하나"(수치 하나하나를 검증, 결정적)
//   시뮬  — "이 파티가 이 적을 이기나"(확률적 요소 포함 반복, 통계)
// 그래서 시뮬이 데모를 대체하지는 않음. 던전/장비 밸런싱용 도구.
//
// 사용법:
//   node simulate.js                     # 내장 샘플 매치업 실행
//   node simulate.js --runs 500          # 반복 횟수 지정
//   node simulate.js --verbose           # 첫 판의 전투 로그도 출력
//
// 프로그램적으로 쓰려면:
//   const { simulate } = require("./simulate");
//   const result = simulate({ buildAllies, buildEnemies, runs: 100 });
// ============================================================================

const { BattleEngine } = require("./src/engine");

/**
 * 같은 매치업을 runs회 반복 실행하고 통계를 반환.
 *
 * buildAllies/buildEnemies는 "매 판마다 새 캐릭터 배열을 만들어 주는 팩토리"여야
 * 함 — 한 번 만든 캐릭터를 재사용하면 이전 판의 HP/버프가 그대로 남아서 통계가
 * 오염됨(resetForBattle이 있긴 하지만, 애초에 매번 새로 만드는 게 확실함).
 *
 * @param {object} opts
 * @param {() => object[]} opts.buildAllies   아군 팩토리
 * @param {() => object[]} opts.buildEnemies  적군 팩토리
 * @param {number} [opts.runs=100]            반복 횟수
 * @param {number} [opts.maxTurns=100]        판당 최대 턴
 * @param {boolean} [opts.verbose=false]      첫 판 로그를 콘솔에 출력할지
 * @returns {object} 통계
 */
function simulate({ buildAllies, buildEnemies, runs = 100, maxTurns = 100, verbose = false, BattleEngine: InjectedEngine }) {
  // ⚠ 엔진 클래스는 반드시 "캐릭터를 만든 세계"의 것을 써야 함.
  // loadAdapterEnv()는 브라우저 스크립트들을 vm 샌드박스에 얹어서 실행하므로,
  // 거기서 만든 캐릭터/스킬은 샌드박스 안의 SkillRegistry에 등록됨. 그런데
  // 이 파일 상단의 require("./src/engine")로 가져온 BattleEngine은 Node의
  // 별개 모듈 인스턴스라 자기만의 빈 SkillRegistry를 봄 — 그 엔진으로 돌리면
  // 모든 스킬이 "등록 안 됨"으로 취급되어 아군이 아무 행동도 못 하고 진다.
  // 그래서 loadAdapterEnv를 쓴 경우엔 env.BattleSim.BattleEngine을 넘겨야 함.
  const Engine = InjectedEngine || BattleEngine;
  const outcomes = { allyWin: 0, enemyWin: 0, draw: 0 };
  const turnCounts = [];
  const allySurvivorCounts = [];
  const allyDamage = [];
  const enemyDamage = [];
  // 캐릭터 이름 -> { deaths, totalDamage } — 누가 자주 죽는지/누가 딜을 내는지
  const perCharacter = new Map();
  let firstLog = null;

  for (let i = 0; i < runs; i++) {
    const allies = buildAllies();
    const enemies = buildEnemies();

    const logs = [];
    const logFn = (i === 0 && verbose) ? (l) => logs.push(l) : () => {};
    const engine = new Engine(allies, enemies, logFn);
    const result = engine.startBattle(maxTurns, "시뮬");

    outcomes[result.outcome] = (outcomes[result.outcome] || 0) + 1;
    turnCounts.push(result.turnsElapsed);
    allySurvivorCounts.push(result.survivorCounts.ally.alive);
    allyDamage.push(result.damageDealt.ally || 0);
    enemyDamage.push(result.damageDealt.enemy || 0);

    allies.forEach((u) => {
      if (!perCharacter.has(u.name)) perCharacter.set(u.name, { deaths: 0, survived: 0 });
      const rec = perCharacter.get(u.name);
      if (u.isAlive) rec.survived++;
      else rec.deaths++;
    });

    if (i === 0 && verbose) firstLog = logs;
  }

  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

  return {
    runs,
    outcomes,
    winRate: outcomes.allyWin / runs,
    avgTurns: avg(turnCounts),
    minTurns: Math.min(...turnCounts),
    maxTurns: Math.max(...turnCounts),
    avgAllySurvivors: avg(allySurvivorCounts),
    avgAllyDamage: avg(allyDamage),
    avgEnemyDamage: avg(enemyDamage),
    perCharacter: [...perCharacter.entries()].map(([name, rec]) => ({
      name,
      deaths: rec.deaths,
      survivalRate: rec.survived / runs,
    })),
    firstLog,
  };
}

/** 시뮬 결과를 사람이 읽기 좋은 형태로 콘솔에 출력. */
function printReport(result, title = "시뮬레이션 결과") {
  const pct = (n) => (n * 100).toFixed(1) + "%";
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}  (${result.runs}회)`);
  console.log("=".repeat(60));
  console.log(`  승률          ${pct(result.winRate)}   (승 ${result.outcomes.allyWin} / 패 ${result.outcomes.enemyWin} / 무 ${result.outcomes.draw})`);
  console.log(`  평균 턴수     ${result.avgTurns.toFixed(1)}턴  (최소 ${result.minTurns} / 최대 ${result.maxTurns})`);
  console.log(`  평균 생존자   ${result.avgAllySurvivors.toFixed(2)}명`);
  console.log(`  평균 누적딜   아군 ${Math.round(result.avgAllyDamage)}  /  적군 ${Math.round(result.avgEnemyDamage)}`);
  console.log(`  ${"-".repeat(56)}`);
  console.log(`  캐릭터별 생존율`);
  result.perCharacter.forEach((c) => {
    const bar = "█".repeat(Math.round(c.survivalRate * 20)).padEnd(20, "·");
    console.log(`    ${c.name.padEnd(12)} ${bar} ${pct(c.survivalRate)}  (사망 ${c.deaths}회)`);
  });
  console.log("=".repeat(60));

  // 클리어 가능성에 대한 한 줄 판정 — 밸런싱할 때 눈으로 빠르게 훑기 위함
  const wr = result.winRate;
  let verdict;
  if (wr >= 0.95) verdict = "너무 쉬움 — 난이도를 올릴 여지가 있음";
  else if (wr >= 0.7) verdict = "적당함 — 클리어 가능하되 안정적이진 않음";
  else if (wr >= 0.3) verdict = "빡빡함 — 운/조작에 따라 갈림";
  else if (wr > 0) verdict = "매우 어려움 — 현재 구성으론 사실상 클리어 곤란";
  else verdict = "클리어 불가 — 구성이나 난이도 조정 필요";
  console.log(`  판정: ${verdict}\n`);
}

module.exports = { simulate, printReport, loadAdapterEnv };

// ============================================================================
// 실전용 헬퍼 — web/battle-adapter.js와 실제 skill-table.json을 그대로 로드해서,
// 게임과 완전히 같은 경로로 캐릭터를 만들어 시뮬을 돌릴 수 있게 함.
// 브라우저용 스크립트들을 Node의 vm으로 얹어서 window.BattleAdapter를 꺼내옴.
//
//   const env = loadAdapterEnv({ skillTablePath: "./skill-table.json" });
//   const { BattleAdapter, BattleSim } = env;
//   simulate({
//     buildAllies: () => [BattleAdapter.buildAllyFromRoster(myCharData, 0)],
//     buildEnemies: () => [BattleAdapter.buildEnemyFromMonsterKey(table, "goblin", 0)],
//     runs: 200,
//   });
//
// @param {object} [opts]
// @param {string} [opts.skillTablePath]  실제 스킬 테이블 JSON 경로(있으면 로드)
// @param {string} [opts.baseDir]         프로젝트 루트(기본: 이 파일 위치)
// ============================================================================
function loadAdapterEnv({ skillTablePath, baseDir = __dirname, quiet = true } = {}) {
  const vm = require("vm");
  const fs = require("fs");
  const path = require("path");

  // quiet(기본값 true) — 어댑터가 패턴 번역 실패 등으로 console.warn을 쏟는데,
  // 시뮬은 같은 캐릭터를 수백 번 만들기 때문에 같은 경고가 수백 번 찍혀서
  // 정작 봐야 할 통계 출력을 덮어버림. 그래서 기본적으로 억제하되, 어떤
  // 경고가 몇 번 났는지는 collectedWarnings에 모아서 나중에 확인할 수 있게 함.
  const collectedWarnings = new Map();
  const quietConsole = quiet
    ? {
        ...console,
        warn: (...args) => {
          const key = String(args[0]);
          collectedWarnings.set(key, (collectedWarnings.get(key) || 0) + 1);
        },
      }
    : console;

  const sandbox = { window: {}, console: quietConsole };
  sandbox.window.window = sandbox.window;
  // 브라우저 스크립트들이 localStorage를 읽으므로 최소 구현을 끼워넣음
  sandbox.localStorage = {
    _s: {},
    getItem(k) { return k in this._s ? this._s[k] : null; },
    setItem(k, v) { this._s[k] = v; },
    removeItem(k) { delete this._s[k]; },
  };
  vm.createContext(sandbox);

  const files = [
    "src/resourceTypes.js", "src/resourceManager.js", "src/skillRegistry.js",
    "src/combatFormulas.js", "src/registries.js", "src/character.js",
    "src/prepState.js", "src/skillResolution.js", "src/importer.js",
    "src/engine.js", "web/battle-adapter.js",
  ];
  files.forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(baseDir, f), "utf8"), sandbox, { filename: f });
  });

  if (skillTablePath) {
    // 2026-08-15: battle-adapter.js가 localStorage(battleSim_skillTable) 읽기를
    // 없애고 setSkillTable() 주입 캐시 방식으로 바뀌면서, 여기서 예전처럼
    // localStorage에만 써두면 조용히 무시되고 스킬이 하나도 등록되지 않았다
    // (모든 시뮬레이션이 맨주먹 ATTACK만으로 도는 상태 — 성장곡선 검증 도중
    // 발견함). setSkillTable()을 직접 호출하도록 수정.
    const table = JSON.parse(fs.readFileSync(path.resolve(baseDir, skillTablePath), "utf8"));
    vm.runInContext("window.BattleAdapter", sandbox).setSkillTable(table);
    vm.runInContext("window.BattleAdapter.registerKnownSkills();", sandbox);
  }

  return {
    BattleAdapter: sandbox.window.BattleAdapter,
    BattleSim: sandbox.window.BattleSim,
    localStorage: sandbox.localStorage,
    // 이 환경의 엔진으로 미리 묶어둔 simulate — 샌드박스 밖의 BattleEngine을
    // 실수로 쓰는 걸(스킬이 하나도 등록 안 된 엔진으로 돌아가는 사고) 원천
    // 차단하기 위해 함께 제공함. env.simulate({...})처럼 쓰면 항상 안전.
    simulate: (opts) => simulate({ ...opts, BattleEngine: sandbox.window.BattleSim.BattleEngine }),
    // 억제된 경고들 — [{ message, count }]. 패턴 번역 실패 같은 설정 실수를
    // 조용히 삼키지 않고 나중에 확인할 수 있게 모아둠.
    getWarnings: () => [...collectedWarnings.entries()].map(([message, count]) => ({ message, count })),
    sandbox,
  };
}

// ============================================================================
// CLI로 직접 실행했을 때 — 내장 샘플 매치업
// ============================================================================
if (require.main === module) {
  const args = process.argv.slice(2);
  const getArg = (name, def) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] ? args[i + 1] : def;
  };
  const runs = Number(getArg("--runs", 100));
  const verbose = args.includes("--verbose");

  const { BattleCharacter } = require("./src/character");
  const { SkillRegistry } = require("./src/skillRegistry");

  // 샘플용 스킬 — 실제 스킬 테이블 없이도 시뮬레이터 자체가 도는지 확인용
  SkillRegistry.register({
    name: "샘플공격", targetFaction: "enemy", targetCount: "single",
    stat: "str", coefficient: 2.0, costs: [], skillType: "physical",
    preDelay: 0, preDelayType: "action", postDelay: 20, effects: [],
  });

  const makeUnit = (name, side, stats, atk) => {
    const u = new BattleCharacter(name, side, stats);
    u.realAtk = atk;
    u.patternSlots = [{ cond: "ALWAYS", val: 0, act: "샘플공격" }];
    return u;
  };

  const result = simulate({
    buildAllies: () => [
      makeUnit("아군전사", "ally", { str: 20, int: 10, dex: 10, spd: 12, luk: 10 }, 25),
      makeUnit("아군궁수", "ally", { str: 15, int: 10, dex: 20, spd: 15, luk: 10 }, 20),
    ],
    buildEnemies: () => [
      makeUnit("고블린A", "enemy", { str: 12, int: 5, dex: 8, spd: 10, luk: 5 }, 15),
      makeUnit("고블린B", "enemy", { str: 12, int: 5, dex: 8, spd: 10, luk: 5 }, 15),
    ],
    runs, verbose,
  });

  printReport(result, "샘플 매치업 (아군 2 vs 고블린 2)");

  if (verbose && result.firstLog) {
    console.log("\n--- 첫 판 전투 로그 ---");
    console.log(result.firstLog.join("\n"));
  }
}
