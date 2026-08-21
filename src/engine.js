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

const { FactionResourceManager } = require("./resourceManager");
const { ConditionRegistry, ActionRegistry } = require("./registries");
const { SkillRegistry } = require("./skillRegistry");
const { PrepState, checkAffordability, payCosts } = require("./prepState");
const { applyDamageAndEffects } = require("./skillResolution");
const { TEAM_RESOURCE_TYPES, PERSONAL_RESOURCE_TYPES } = require("./resourceTypes");

// ============================================================================
// 한국어 조사 자동 처리 — 이름의 마지막 글자에 받침이 있는지에 따라 "이"/"가",
// "을"/"를" 중 맞는 쪽을 고름("고블린이"/"섭정이" vs "말이"/"용사가" 등).
// 한글 완성형 범위 밖의 글자(영문 등)로 끝나면 받침 없는 쪽을 기본값으로 씀.
// ============================================================================
function hasBatchim(word) {
  const lastChar = word[word.length - 1];
  const code = lastChar.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}
function josa(word, withBatchim, withoutBatchim) {
  return hasBatchim(word) ? withBatchim : withoutBatchim;
}

// 선딜레이 준비 시작 로그 문구 — preDelayType(character-sheet.html의
// PRE_DELAY_TYPES와 동일한 값)마다 다른 짤막한 연출 문구를 줌. 예전엔
// `[준비 시작] {name}, "{skill}" 시전 시작 (선딜레이 {n}, {type}) -> 발동
// 예정 {n}틱` 한 줄에 다 욱여넣어서 로그가 너무 길었음 — 스킬명/수치는
// 굳이 필요하면 상태창에서 볼 수 있으니 로그에서는 짧은 연출만 남김.
// 새 preDelayType이 추가되면 여기 한 줄만 더하면 됨(없으면 action으로 대체).
const PREP_START_FLAVOR = {
  action: (name) => `${name}${josa(name, "이", "가")} 자세를 잡는다.`,
  casting: (name) => `${name}${josa(name, "이", "가")} 주문을 외운다.`,
};
function prepStartMessage(actorName, preDelayType) {
  const flavor = PREP_START_FLAVOR[preDelayType] || PREP_START_FLAVOR.action;
  return flavor(actorName);
}

// ============================================================================
// 전투 진행 엔진 (정밀 시간 축 + 속도 게이지 + 선딜레이 준비 상태)
//
// 매 루프마다 다음 두 종류의 "다음 이벤트"를 경쟁시켜서 더 이른 쪽을 처리한다:
//   1) 게이지가 꽉 차는 이벤트 — 대기 중인(준비 중이 아닌) 유닛이 다음 행동을 함
//   2) 선딜레이 완료 이벤트 — 준비 중인 유닛의 스킬이 발동 시점(readyAtTick)에 도달
// 선딜레이가 있는 스킬을 쓰면 그 유닛은 (2)가 처리될 때까지 (1)의 후보에서
// 빠진다 — "행동을 스킬 준비에 쏟고 있다"는 개념. 발동 시점엔 코스트를 다시
// 확인해서(PrepState.resolve) 감당 못 하면 발동이 불발되고, 그 실패는 반드시
// 로그로 알려진다. 완전 차단(강제 취소) 개념은 없음 — 오직 이 코스트 재판정만이
// 유일한 발동 실패 경로.
// ============================================================================
class BattleEngine {
  static TURN_TICK_LIMIT = 1000;
  static GAUGE_THRESHOLD = 100000;
  // 몬스터의 "개전 패턴"(EXTEND_BATTLE_LIMIT)이 최대 턴수를 아무리 늘려도
  // 절대 못 넘는 하드 캡. 늘리기 기믹이 있어도 전투가 유한 시간 안에 반드시
  // 끝나는 걸 보장하는 최종 안전장치.
  static ABSOLUTE_MAX_TURNS = 300;

  /**
   * @param {BattleCharacter[]} allies
   * @param {BattleCharacter[]} enemies
   * @param {(line: string) => void} [logger] 로그 출력 함수. 기본은 console.log.
   *   브라우저 데모처럼 로그를 배열/DOM에 쌓고 싶다면 커스텀 함수를 넘기면 된다.
   */
  // recordEvents(기본 false) — true면 행동/명중판정/사망을 this.events에
  // 구조화해서 쌓는다(전투 로그 저장/공유 기능용, 2026-08-18). 서사 로그
  // 문자열(this.log)과는 완전히 별개 통로 — 로그 포맷/파서에 영향 없음.
  // dispatch.html의 파견 시뮬(2000턴 예산, 500회+ 반복 전투)은 이 옵션을
  // 안 켜서 순수 낭비를 피함 — battle-view.html(직접 도전)만 켠다.
  constructor(allies, enemies, logger = console.log, { recordEvents = false } = {}) {
    this.units = [...allies, ...enemies];
    this.allies = allies;
    this.enemies = enemies;
    this.logger = logger;
    this.recordEvents = recordEvents;
    this.events = [];
    this.totalBattleTick = 0;
    this.prepState = new PrepState();
    this.currentTurn = 0;
    // 경험치/골드/아이템은 캐릭터 개인이 아니라 파티 전체가 공유하는 값이라
    // 여기(전투 단위)에서 누적함 — 한 몬스터가 쓰러졌을 때 파티가 얻는 총량은
    // 등장한 몬스터의 종류·수로 이미 정해지는 값이라, 누가 몇 명 살아남았는지와
    // 무관하게 딱 한 번만 더해짐. 전투 종료 후 이 값들을 실제 캐릭터 경험치/
    // 공용 창고/골드에 반영하는 건 "Result" 단계의 몫 — 여기서는 전투 중
    // 누적만 책임짐.
    this.battleExpGained = 0;
    this.battleGoldGained = 0;
    this.battleLootGained = []; // [{ name, category, quantity }]
    // 진영별로 "그 진영이 상대에게 입힌" 누적 데미지. Result 화면의 "누가 얼마나
    // 때렸는지" 통계용. recordDamageDealt()가 데미지 적용 지점(ATTACK/스킬/마법진
    // 폭발)에서 호출해줘야 채워짐 — 여기서 자동으로 채워지진 않음.
    this.totalDamageDealt = { ally: 0, enemy: 0 };

    // 전투 생성 시 각 유닛의 "이번 전투 전용" 상태를 전부 초기화. 리셋 대상
    // 목록은 여기가 아니라 BattleCharacter.resetForBattle()에 모여있음(왜
    // 거기 두는지는 그 메서드의 주석 참고 — 새 필드 추가 시 놓치기 쉬운 문제의
    // 재발 방지).
    this.units.forEach((u) => u.resetForBattle());

    this.resourceManager = new FactionResourceManager();
    // TEAM_RESOURCE_TYPES에 등록된 모든 팀 자원을 양 진영에 자동 등록.
    // 새 팀 자원이 필요하면 src/resourceTypes.js에 한 줄만 추가하면 여기서
    // 자동으로 두 진영 다 등록됨(하드코딩된 "MAGIC_CIRCLE" 한 종류 제거).
    Object.values(TEAM_RESOURCE_TYPES).forEach((meta) => {
      this.resourceManager.registerResource("ally", meta.key, 0, meta.defaultMax);
      this.resourceManager.registerResource("enemy", meta.key, 0, meta.defaultMax);
    });
  }

  log(line) {
    this.logger(line);
  }

  /** 구조화 이벤트 1건 적립 — recordEvents가 꺼져있으면 아무 일도 안 함(0비용). */
  recordEvent(e) {
    if (this.recordEvents) this.events.push({ tick: this.totalBattleTick, turn: this.currentTurn, ...e });
  }

  getOpponents(actor) {
    return actor.side === "ally" ? this.enemies : this.allies;
  }

  /** attackerSide(공격을 가한 쪽)의 누적 가한 데미지에 amount를 더함. */
  recordDamageDealt(attackerSide, amount) {
    if (amount > 0) this.totalDamageDealt[attackerSide] += amount;
  }

  /**
   * @param {number} maxTurns 기본 최대 턴수(디폴트 100). this.maxTurns로 저장해서
   *   전투 중 개전 패턴(EXTEND_BATTLE_LIMIT)이 늘릴 수 있게 함 — 아래 for문의
   *   turn <= this.maxTurns 비교는 매 반복마다 this.maxTurns를 새로 읽으므로,
   *   루프 도중 값이 늘어나도 즉시 반영됨.
   * @param {string} username 승리 메시지("{유저명}의 파티는 승리했다!")에 씀.
   *   패배/무승부는 유저명을 안 붙이므로 그 경우엔 안 쓰임.
   * @returns {{ outcome: "allyWin"|"enemyWin"|"draw", username: string, turnsElapsed: number }}
   */
  startBattle(maxTurns = 100, username = "플레이어") {
    this.maxTurns = maxTurns;

    this.log(`\n==================================================`);
    this.log(`⚔️ [정밀 시간 축 전투 시작] (최대 ${this.maxTurns}턴, 절대 상한 ${BattleEngine.ABSOLUTE_MAX_TURNS}턴)`);
    this.log(`==================================================`);

    let turn = 1;
    for (; turn <= this.maxTurns; turn++) {
      this.currentTurn = turn;
      if (!this.checkBattleStatus()) break;

      this.renderStatusBoard();

      let currentTurnTick = 0;

      while (currentTurnTick <= BattleEngine.TURN_TICK_LIMIT && this.checkBattleStatus()) {
        const aliveUnits = this.units.filter((u) => u.isAlive);
        const readyUnits = aliveUnits.filter((u) => !u.isPreparing);
        const preparingUnits = aliveUnits.filter((u) => u.isPreparing);

        // 1) 다음 "게이지 완충" 이벤트
        let minTicksToGauge = Infinity;
        let nextActor = null;
        readyUnits.forEach((unit) => {
          const remainingGauge = Math.max(0, BattleEngine.GAUGE_THRESHOLD - unit.actionGauge);
          const ticksNeeded = remainingGauge / unit.effectiveSpeed;
          if (ticksNeeded < minTicksToGauge) {
            minTicksToGauge = ticksNeeded;
            nextActor = unit;
          }
        });

        // 2) 다음 "선딜레이 발동" 이벤트
        let minTicksToPrep = Infinity;
        let prepUnit = null;
        preparingUnits.forEach((unit) => {
          const record = this.prepState.get(unit);
          if (!record) return;
          const ticksNeeded = record.readyAtTick - this.totalBattleTick;
          if (ticksNeeded < minTicksToPrep) {
            minTicksToPrep = ticksNeeded;
            prepUnit = unit;
          }
        });

        const elapsedTicks = Math.min(minTicksToGauge, minTicksToPrep);
        if (elapsedTicks === Infinity) break; // 방어적 처리(더 진행할 이벤트가 없음)

        if (currentTurnTick + elapsedTicks > 1000) {
          const remainingInTurn = 1000 - currentTurnTick;
          readyUnits.forEach((unit) => {
            unit.actionGauge += unit.effectiveSpeed * remainingInTurn;
          });
          currentTurnTick = 1000;
          this.totalBattleTick += remainingInTurn;
          break;
        }

        currentTurnTick += elapsedTicks;
        this.totalBattleTick += elapsedTicks;

        readyUnits.forEach((unit) => {
          unit.actionGauge += unit.effectiveSpeed * elapsedTicks;
        });

        if (minTicksToPrep <= minTicksToGauge) {
          this.processActiveTicks(prepUnit);
          if (prepUnit.isAlive) this.resolvePreparedSkill(prepUnit);
        } else {
          // 지속효과(출혈 등)는 "행동하기 직전"에 틱 — 게이지가 찼다고 바로
          // executeAction으로 넘어가지 않고, 먼저 여기서 처리함. 틱으로 죽었으면
          // (예: 출혈로 사망) 행동 자체가 취소됨(아래 죽음 처리에서 걸러짐).
          this.processActiveTicks(nextActor);
          if (nextActor.isAlive) {
            this.log(`\n"${nextActor.name}" (${nextActor.side.toUpperCase()}) 행동!`);
            this.executeAction(nextActor);
          }
        }

        // 방금 행동/스킬 해결로 누군가 죽었는지 확인. 평타/스킬/마법진 폭발 등
        // 데미지 경로가 여러 개라 각 액션마다 따로 처리하지 않고 여기서 한
        // 번에 감지함 — 어떤 방식으로 죽었든 빠짐없이 잡힘.
        this.checkForDeaths();
      }
    }

    // 종료 사유(전멸 vs 턴 소진)와 무관하게, 끝난 시점의 생존 현황만으로 판정.
    // 양쪽 다 생존해 있으면 = 턴 제한(혹은 절대 상한)까지 승부가 안 났다는 뜻 -> 무승부.
    const allyAlive = this.allies.some((u) => u.isAlive);
    const enemyAlive = this.enemies.some((u) => u.isAlive);
    let outcome;
    if (!allyAlive && !enemyAlive) outcome = "draw"; // 동시 전멸(극히 드묾)도 무승부로 취급
    else if (!enemyAlive) outcome = "allyWin";
    else if (!allyAlive) outcome = "enemyWin";
    else outcome = "draw";

    // Result 화면용 참전 현황 — 진영별로 참여한 모든 캐릭터의 현재/최대 HP.
    // "이 지역에서 계속 안정적으로 싸울 수 있는지"를 가늠하는 지표로 쓰일
    // 데이터라, 죽었어도(HP 0) 빠지지 않고 전부 포함됨.
    // creatureTier도 같이 담음 — web/battle-log-render.js의 결과 화면이 이걸로
    // "이 진영에 보스가 있으면 HP 합계를 안 보여준다"를 판정함(2026-08-21).
    const summarize = (units) => units.map((u) => ({ name: u.name, currentHp: u.currentHp, maxHp: u.maxHp, isAlive: u.isAlive, creatureTier: u.creatureTier }));
    const countSurvivors = (units) => ({ alive: units.filter((u) => u.isAlive).length, total: units.length });
    const survivorCounts = { ally: countSurvivors(this.allies), enemy: countSurvivors(this.enemies) };

    // 승리만 "{유저명}의 파티는"을 붙이고, 패배/무승부는 그냥 짧게 끝냄.
    const resultMessage = {
      allyWin: `${username}의 파티는 승리했다!`,
      enemyWin: `패배했다...`,
      draw: `비겼다.`,
    }[outcome];

    this.log(`\n==================================================`);
    this.log(resultMessage);
    this.log(`진행 턴수: ${this.currentTurn}`);
    // Boss는 renderStatusBoard()와 동일하게 최종 결과 요약에서도 절대 HP를
    // 안 보여줌(2026-08-21) — 전투가 끝났다고 예외를 두면 그 시점의 정확한
    // HP를 알아내는 우회로가 남기 때문.
    const resultLine = (u) => u.creatureTier === "boss" ? `  ${u.name}: HP ???` : `  ${u.name}: HP ${u.currentHp}/${u.maxHp}`;
    this.log(`\n[아군]`);
    this.allies.forEach((u) => this.log(resultLine(u)));
    this.log(`생존 ${survivorCounts.ally.alive} / ${survivorCounts.ally.total}`);
    this.log(`\n[적군]`);
    this.enemies.forEach((u) => this.log(resultLine(u)));
    this.log(`생존 ${survivorCounts.enemy.alive} / ${survivorCounts.enemy.total}`);
    this.log(`\n획득:`);
    this.log(`  경험치 ${this.battleExpGained}`);
    this.log(`  골드 ${this.battleGoldGained}`);
    if (this.battleLootGained.length) {
      this.battleLootGained.forEach((item) => this.log(`  ${item.name} ×${item.quantity}`));
    } else {
      this.log(`  아이템 없음`);
    }
    this.log(`==================================================\n`);

    return {
      outcome,
      username, // 결과 화면의 "{유저명}의 파티는 승리했다!" 배너용 — 예전엔 이 필드가
                // 없어서 화면 쪽이 항상 폴백("플레이어")을 썼음(2026-08-15 발견·수정).
      turnsElapsed: this.currentTurn,
      events: this.events, // recordEvents:false면 항상 빈 배열(전투 로그 저장 기능용)
      goldGained: this.battleGoldGained,
      lootGained: this.battleLootGained,
      expGained: this.battleExpGained, // Result 화면 표시용 — 파티 총량 하나
      // 전투 후 실제로 각 캐릭터에게 경험치를 돌려줄 때 쓰는 목록 — id로 로스터의
      // 정확한 캐릭터를 찾아서 gainExp만큼 더해주면 됨(중간에 죽은 캐릭터는 그
      // 이후 처치분이 안 들어있어서 자연히 더 적게 받음).
      expByCharacter: this.allies.map((u) => ({ id: u.id, name: u.name, gainExp: u.gainExp })),
      participants: {
        ally: summarize(this.allies),
        enemy: summarize(this.enemies),
      },
      survivorCounts: {
        ally: countSurvivors(this.allies),
        enemy: countSurvivors(this.enemies),
      },
      damageDealt: { ...this.totalDamageDealt }, // { ally: N, enemy: M } — 각 진영이 상대에게 입힌 누적 데미지
    };
  }

  // 지속 효과(출혈/재생/탈진 등) 처리 — 이 유닛이 행동하기 직전에 호출됨.
  // activeTicks에 쌓여있는 각 항목의 HP/SP를 증감시키고 remainingTicks를
  // 깎아서, 0이 되면 목록에서 제거함(효과 종료). HP 틱으로 currentHp가
  // 0 이하가 되면 그 자리에서 사망 처리 — 아래 executeAction/resolvePreparedSkill
  // 호출부가 actor.isAlive를 다시 확인해서 죽었으면 행동 자체를 건너뜀.
  processActiveTicks(actor) {
    if (!actor.activeTicks || actor.activeTicks.length === 0) return;
    const remaining = [];
    actor.activeTicks.forEach((tick) => {
      if (tick.kind === "hp") {
        const before = actor.currentHp;
        actor.currentHp = Math.max(0, Math.min(actor.maxHp, actor.currentHp + tick.amountPerTick));
        const sign = tick.amountPerTick >= 0 ? "+" : "";
        this.log(`   [${tick.name}] ${actor.name} HP ${sign}${tick.amountPerTick} (${before} → ${actor.currentHp})`);
      } else if (tick.kind === "sp") {
        const before = actor.currentSp;
        actor.currentSp = Math.max(0, Math.min(actor.maxSp, actor.currentSp + tick.amountPerTick));
        const sign = tick.amountPerTick >= 0 ? "+" : "";
        this.log(`   [${tick.name}] ${actor.name} SP ${sign}${tick.amountPerTick} (${before} → ${actor.currentSp})`);
      }
      tick.remainingTicks -= 1;
      if (tick.remainingTicks > 0) remaining.push(tick);
      else this.log(`   [${tick.name}] 효과 종료 (${actor.name})`);
    });
    actor.activeTicks = remaining;
  }

  executeAction(actor) {
    // 임포트 단계에서 이미 maxPatternSlots만큼 잘려 들어오므로 slice는 방어 코드
    const activeSlots = actor.patternSlots.slice(0, actor.maxPatternSlots);
    if (!actor.slotTriggerCounts) actor.slotTriggerCounts = [];
    let executed = false;

    for (let i = 0; i < activeSlots.length; i++) {
      const slot = activeSlots[i];
      // slotIndex(i)를 넘겨서 "SLOT_USE_COUNT_LESS_THAN" 같은 조건이 "이 슬롯"의
      // 발동 횟수를 조회할 수 있게 함(아래 발동 시 자동 카운트와 짝을 이룸).
      const conditionMet = ConditionRegistry.check(slot.cond, actor, this, slot.val, i);

      if (conditionMet) {
        // 어떤 슬롯/조건이 발동했는지는 일부러 로그에 안 남김 — 유저가 결과만
        // 보고 상대의 패턴을 직접 관찰·추론하는 게 이 게임의 핵심 재미 포인트.
        // 이 슬롯이 실제로 발동한 횟수를 자동으로 셈 — "○회까지는 반드시" 규칙은
        // 조건 쪽(SLOT_USE_COUNT_LESS_THAN)에서 이 값을 읽어서 스스로 판단함.
        actor.slotTriggerCounts[i] = (actor.slotTriggerCounts[i] || 0) + 1;
        this.recordEvent({ type: "act", actor: actor.name, side: actor.side, act: slot.act });

        if (SkillRegistry.has(slot.act)) {
          this.beginOrResolveSkill(actor, SkillRegistry.get(slot.act));
        } else {
          const delayTick = ActionRegistry.execute(slot.act, actor, this);
          // chains:true 액션(대사 등)은 게이지를 안 건드리고 바로 다음 슬롯
          // 평가로 넘어감 — "이번 턴 소모" 없이 같은 호출 안에서 연계 실행.
          if (ActionRegistry.chains(slot.act)) continue;
          actor.actionGauge -= BattleEngine.GAUGE_THRESHOLD + delayTick * actor.effectiveSpeed;
        }

        executed = true;
        break;
      }
    }

    if (!executed) {
      this.log(`   ⚠️ 조건 미충족 (0-딜레이 PASS)`);
      actor.actionGauge -= BattleEngine.GAUGE_THRESHOLD;
    }
  }

  /**
   * SkillRegistry에 등록된 "완전한 스킬" 실행 진입점.
   * 선딜레이가 있으면 준비 상태로 들어가고(발동은 나중에 resolvePreparedSkill에서
   * 처리), 없으면 그 자리에서 코스트 확인 -> 소모 -> 데미지/효과 적용까지 즉시 끝냄.
   */
  beginOrResolveSkill(actor, skill) {
    actor.actionGauge -= BattleEngine.GAUGE_THRESHOLD; // 이번 턴 기회는 여기서 소모

    // 스탠스(주문 집속류)의 딜레이 배율 — 없으면 1(원래 값 그대로).
    const preDelayMul = actor.getStanceMultiplier("preDelayMultiplier");
    const postDelayMul = actor.getStanceMultiplier("postDelayMultiplier");

    // 딜레이 단위 메모 — preDelay/postDelay는 둘 다 "순수 틱"으로 같은 단위임.
    // postDelay는 게이지에서 (postDelay × effectiveSpeed)를 깎는데, 그 게이지를
    // 다시 채우는 시간이 정확히 postDelay 틱이라 속도가 상쇄됨(빠르든 느리든
    // 똑같이 postDelay 틱만큼 다음 행동이 밀림). preDelay도 시간 축에 그대로
    // 더해지므로 역시 순수 틱. 여기에 effectiveSpeed를 곱하면 preDelay만
    // 속도 의존이 되고 심지어 "빠를수록 시전이 길어지는" 역효과가 나므로
    // 절대 곱하지 말 것.
    const effectivePreDelay = (skill.preDelay || 0) * preDelayMul;

    if (effectivePreDelay > 0) {
      this.prepState.begin(actor, skill, this.totalBattleTick, effectivePreDelay);
      actor.isPreparing = true;
      this.log(`   🕐 ${prepStartMessage(actor.name, skill.preDelayType)}`);
      return;
    }

    // 선딜레이 없는 즉발 스킬 — 시작과 발동이 동시라 코스트도 지금 바로 확정
    const affordability = checkAffordability(actor, skill.costs || [], this.resourceManager);
    if (!affordability.ok) {
      this.log(`   ❌ [발동 실패] ${actor.name}의 "${skill.name}" 발동 실패! (코스트 부족: ${affordability.detail})`);
      return;
    }
    const resourceLogs = payCosts(actor, skill.costs || [], this.resourceManager);
    resourceLogs.forEach((msg) => this.log(`   ${msg}`));
    this.log(`   ${skill.name}`);
    applyDamageAndEffects(actor, skill, this);
    actor.actionGauge -= (skill.postDelay || 0) * postDelayMul * actor.effectiveSpeed;
  }

  /** 선딜레이가 끝난 유닛의 스킬을 실제로 해결(발동 성공/실패 판정)한다. */
  resolvePreparedSkill(unit) {
    const result = this.prepState.resolve(unit, unit, this.resourceManager);
    unit.isPreparing = false;
    this.recordEvent({ type: "act", actor: unit.name, side: unit.side, act: result.skill?.name, prepared: true, activated: result.activated });

    if (!result.activated) {
      this.log(`\n❌ [발동 실패] ${unit.name}의 "${result.skill?.name}" 발동 실패! (${result.reason})`);
    } else {
      // "{이름}, {스킬명}" 형태 — web/battle-view.html이 이 모양을 감지해서
      // 굵게+밑줄로 강조하고, 새 로그 블록의 시작으로도 인식함(이 줄 앞에는
      // "행동!" 마커가 안 붙는 경로라 — 선딜레이 스킬의 발동은 게이지 루프가
      // 아니라 readyAtTick 도래 시점에 별도로 처리되기 때문 — 여기서 블록을
      // 새로 열어주지 않으면 직전에 "행동!"을 낸 다른 유닛 블록 밑에 잘못
      // 묶여버림).
      this.log(`\n${unit.name}, ${result.skill.name}`);
      (result.resourceLogs || []).forEach((msg) => this.log(`   ${msg}`));
      applyDamageAndEffects(unit, result.skill, this);
    }

    const postDelayMul = unit.getStanceMultiplier("postDelayMultiplier");
    const postDelay = (result.skill && result.skill.postDelay) || 0;
    unit.actionGauge -= postDelay * postDelayMul * unit.effectiveSpeed;
  }

  checkBattleStatus() {
    return this.allies.some((u) => u.isAlive) && this.enemies.some((u) => u.isAlive);
  }

  /**
   * 매 턴 시작 시 호출되는 현황판. "턴 N 시작" 같은 안내 문구 없이, 이 현황판
   * 출력 자체가 새 턴의 시작을 대신함(턴 종료 안내도 마찬가지로 없음 — 다음
   * 턴은 그냥 이 현황판부터 다시 보여줌). 생존/전투불능 여부와 HP/SP(현재치/
   * 최대치, 퍼센티지 없이)를 진영별로 보여줌.
   *
   * ⚠ Boss(creatureTier:"boss")는 생존 중이면 HP/SP를 아예 안 찍고 "???"만
   * 남김(2026-08-21, 사용자 요청) — statChangeLine()의 데미지 줄 마스킹과
   * 같은 목적(패턴 발동 기준선이 되는 절대 HP/SP 수치를 역산 못 하게)이지만
   * 별개 코드 경로라 여기서도 따로 처리해야 함. web/battle-log-render.js의
   * parseBattleLog()가 "HP x/y SP a/b" 형태만 퍼센티지 게이지로 그리므로,
   * 이 형태 자체를 안 찍으면 게이지도 자동으로 안 그려짐. 보스는 "???" 한
   * 줄로 이미 전부(HP/SP뿐 아니라 아래 개인 자원까지) 가려지므로 별도
   * 처리가 필요 없음 — 자원 표시는 비보스 분기에서만 이어붙임.
   *
   * ⚠ 개인 자원(집속 마력 등) 표시 — 2026-08-22 신설. 예전엔 HP/SP만
   * 찍고 personalResources는 전혀 안 보여줘서, 전투 중 그 자원이 어떻게
   * 변하는지 알 방법이 없다는 신고가 있었음(사용자). PERSONAL_RESOURCE_TYPES
   * 카탈로그에 등록된 자원 중 그 유닛이 실제로 갖고 있고 max>0인 것만
   * 이어붙임 — tp(모든 유닛이 갖는 시스템 자원, 카탈로그에 없음)는 자동으로
   * 제외돼서 노이즈가 안 됨.
   */
  renderStatusBoard() {
    const personalResourceSuffix = (u) => {
      const parts = [];
      Object.keys(PERSONAL_RESOURCE_TYPES).forEach((key) => {
        const pool = u.personalResources?.[key];
        if (!pool || pool.max <= 0) return;
        const meta = PERSONAL_RESOURCE_TYPES[key];
        parts.push(`${meta.label} ${pool.current}/${pool.max}`);
      });
      return parts.length ? `   ${parts.join("   ")}` : "";
    };
    const line = (u) => {
      if (!u.isAlive) return `  ${u.name}   💀 전투불능`;
      if (u.creatureTier === "boss") return `  ${u.name}   ???`;
      return `  ${u.name}   HP ${u.currentHp}/${u.maxHp}   SP ${u.currentSp}/${u.maxSp}${personalResourceSuffix(u)}`;
    };
    this.log(`\n==================================================`);
    this.log(`[ TURN ${this.currentTurn} ]`);
    this.log(`[ 아군 ]`);
    this.allies.forEach((u) => this.log(line(u)));
    this.log(`[ 적군 ]`);
    this.enemies.forEach((u) => this.log(line(u)));
    this.log(`==================================================`);
  }

  /**
   * 방금 새로 쓰러진(HP 0 도달, 아직 보상 미지급) 유닛을 전부 찾아서 처치
   * 보상을 지급함. 평타/스킬/마법진 폭발 등 데미지 경로가 뭐든 상관없이,
   * "현재 죽어있는데 아직 처리 안 된" 상태만 보고 판단하므로 빠짐없이 잡힘.
   */
  checkForDeaths() {
    this.units.forEach((u) => {
      if (!u.isAlive && !u._deathProcessed) {
        u._deathProcessed = true;
        this.recordEvent({ type: "death", unit: u.name, side: u.side });
        this.grantKillReward(u);
      }
    });
  }

  /**
   * 쓰러진 유닛(defeatedUnit)의 보상(경험치/골드/드랍)을 지급.
   *  - 경험치/골드/아이템 전부 캐릭터 개인이 아니라 파티 전체가 공유하는 값이라
   *    this.battleExpGained/battleGoldGained/battleLootGained에 딱 한 번만
   *    누적함(생존자가 몇 명이든 상관없이 — "이 몬스터를 잡으면 얼마"가
   *    이미 고정된 총량이라는 설계). 드랍은 dropTable의 chance를 굴려서
   *    확률적으로 결정, 맞으면 quantity[min,max] 사이에서 무작위 개수.
   * 지급 내역은 눈으로 바로 확인할 수 있게 간결한 서술형 로그로 남김(효율
   * 가늠용) — 어차피 Result 화면에도 표시되겠지만, 로그에서도 바로 보이길 원해서.
   */
  grantKillReward(defeatedUnit) {
    const expReward = defeatedUnit.expReward || 0;
    const goldReward = defeatedUnit.goldReward || 0;
    const dropTable = defeatedUnit.dropTable || [];

    if (!expReward && !goldReward && !dropTable.length) return; // 보상 없는 유닛(아군 등)은 조용히 넘어감

    const beneficiaries = this.getOpponents(defeatedUnit).filter((u) => u.isAlive);
    const name = defeatedUnit.name;
    const lines = [`${name}${josa(name, "이", "가")} 쓰러졌다...`];

    if (expReward && beneficiaries.length) {
      this.battleExpGained += expReward; // Result 화면 표시용 파티 총량
      beneficiaries.forEach((u) => { u.gainExp += expReward; }); // 캐릭터별 실제 분배용(각자 동일값)
      lines.push(`생존자가 ${expReward}의 경험치를 획득.`);
    }

    if (goldReward) {
      this.battleGoldGained += goldReward;
      lines.push(`${name}${josa(name, "이", "가")} ${goldReward}골드를 떨어뜨렸다.`);
    }

    dropTable.forEach((drop) => {
      if (Math.random() > drop.chance) return; // 확률 미충족 — 드랍 안 됨
      const [min, max] = drop.quantity;
      const qty = min + Math.floor(Math.random() * (max - min + 1));
      // name/category/chance/quantity 외의 나머지 필드(combatReal, weight,
      // twoHanded, passiveBonus, price, enhanceable 등)를 그대로 스펙으로
      // 넘김 — 상점 구매가 "스탯 전체를 창고에 실어서 저장"하는 것과 같은
      // 방식. 아이템 마스터 테이블 없이도 드랍 장비가 제 성능을 갖게 하기
      // 위함(예전엔 이름과 카테고리만 넘겨서 드랍 장비를 장착해도 스탯이
      // 전부 0이었음). name은 예전엔 itemName이었는데 상점/창고 테이블의
      // name과 스키마를 통일함(2026-08-14 — refinery.html이 상점/드랍
      // 테이블을 같은 방식으로 조회할 수 있게 하려고 맞춤).
      const { name: dropName, category, chance, quantity, ...spec } = drop;
      this.addLoot(dropName, category, qty, spec);
      lines.push(`${name}${josa(name, "이", "가")} ${dropName}${josa(dropName, "을", "를")} ${qty}개 떨어뜨렸다.`);
    });

    lines.forEach((line) => this.log(line));
  }

  /** battleLootGained에 아이템을 이름 기준으로 합산해서 누적.
   *  spec은 장비의 실제 성능(combatReal/weight 등) — 재료/열쇠 아이템이면 빈 객체. */
  addLoot(name, category, quantity, spec = {}) {
    const existing = this.battleLootGained.find((it) => it.name === name);
    if (existing) existing.quantity += quantity;
    else this.battleLootGained.push({ name, category, quantity, ...spec });
  }
}

module.exports = { BattleEngine };


  // 브라우저 환경이면 이 모듈의 exports를 공용 네임스페이스에 얹음(Node에서는
  // window가 없으니 아무 일도 안 함. 어차피 Node의 진짜 module.exports는 위에서
  // 그대로 전달받은 그 객체라 이 시점에 이미 다 채워져 있음).
  if (typeof window !== "undefined") {
    window.BattleSim = window.BattleSim || {};
    Object.assign(window.BattleSim, module.exports);
  }
})(typeof module !== "undefined" ? module : undefined, typeof require !== "undefined" ? require : undefined);
