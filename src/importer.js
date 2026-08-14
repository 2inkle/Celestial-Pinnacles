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

const { BattleCharacter } = require("./character");
const { ConditionRegistry, ActionRegistry } = require("./registries");

// ============================================================================
// 외부 캐릭터/패턴 임포터
// ============================================================================
class CharacterImporter {
  /**
   * 외부 캐릭터 데이터를 BattleCharacter 인스턴스로 변환.
   *
   * 기대 형식:
   * {
   *   name, side: "ally" | "enemy",
   *   stats: { str, int, dex, spd, luk },
   *   job?: { name, baseHp, baseSp, baseSpeed },
   *   bonusStats?: { str, int, dex, spd, luk },   // 장비/버프 합산치
   *   patterns: [{ cond, val, act }, ...]         // 저장된 패턴 전체 (최대 20줄 등)
   * }
   */
  static importCharacter(data) {
    if (!data || typeof data !== "object") {
      throw new Error("❌ [임포트 실패] 캐릭터 데이터가 유효하지 않습니다.");
    }
    if (!data.name || !data.side) {
      throw new Error(`❌ [임포트 실패] "name"과 "side"는 필수입니다. (${JSON.stringify(data)})`);
    }
    if (data.side !== "ally" && data.side !== "enemy") {
      throw new Error(`❌ [임포트 실패] "side"는 "ally" 또는 "enemy"만 가능합니다. (받은 값: ${data.side})`);
    }

    const character = new BattleCharacter(data.name, data.side, data.stats || {});
    if (data.id !== undefined) character.id = data.id;

    // 진형 — 지정 안 하면 BattleCharacter 기본값(front) 유지. "front"/"back" 외의
    // 값은 무시(방어적 처리, 오타로 인한 잘못된 진형 배정 방지).
    if (data.row === "front" || data.row === "back") character.row = data.row;
    if (typeof data.guardAllies === "boolean") character.guardAllies = data.guardAllies;

    if (data.job) {
      if (typeof data.job.baseHp === "number") character.job.baseHp = data.job.baseHp;
      if (typeof data.job.baseSp === "number") character.job.baseSp = data.job.baseSp;
      if (typeof data.job.baseSpeed === "number") character.job.baseSpeed = data.job.baseSpeed;
      if (typeof data.job.name === "string") character.job.name = data.job.name;
    }

    if (data.bonusStats) {
      character.bonusStr = data.bonusStats.str || 0;
      character.bonusInt = data.bonusStats.int || 0;
      character.bonusDex = data.bonusStats.dex || 0;
      character.bonusSpd = data.bonusStats.spd || 0;
      character.bonusLuk = data.bonusStats.luk || 0;
    }

    // HP/SP는 job/bonus 반영이 끝난 뒤 다시 채워준다 (풀피 상태로 시작)
    character.currentHp = character.maxHp;
    character.currentSp = character.maxSp;

    // 💡 realStat 기준 maxPatternSlots만큼만 잘라서 싣는다.
    //    DB에는 20줄이 있어도, 여기서 초과분은 애초에 배제되어
    //    전투 중 "비활성 패턴"이 객체 안에 존재하는 상황 자체를 막는다.
    character.patternSlots = this.importPatterns(data.patterns, data.name, character.maxPatternSlots);

    return character;
  }

  /**
   * 패턴 배열 검증 + 절삭.
   * - 등록 안 된 조건/행동 키는 경고 후 제외 (인덱스는 유지하지 않고 건너뜀)
   * - maxSlots를 넘는 초과분은 경고 후 절삭 (원본 배열은 호출부에서 그대로 보존됨)
   */
  static importPatterns(patterns, ownerName = "알 수 없음", maxSlots = Infinity) {
    if (!Array.isArray(patterns)) {
      console.warn(`   ⚠️ [패턴 임포트] "${ownerName}"의 패턴이 배열이 아닙니다. 빈 패턴으로 처리.`);
      return [];
    }

    const validated = [];

    for (let idx = 0; idx < patterns.length; idx++) {
      if (validated.length >= maxSlots) {
        console.warn(
          `   ✂️ [패턴 임포트] "${ownerName}": 최대 슬롯(${maxSlots}) 초과분 절삭 (원본 ${patterns.length}줄 중 ${idx}번째부터 미사용)`
        );
        break;
      }

      const p = patterns[idx];
      if (!p || typeof p !== "object") {
        console.warn(`   ⚠️ [패턴 임포트] "${ownerName}" 패턴[${idx}] 형식 오류. 건너뜀.`);
        continue;
      }

      const { cond, act, val = 0 } = p;

      if (!ConditionRegistry.conditions.has(cond)) {
        console.warn(`   ⚠️ [패턴 임포트] "${ownerName}" 패턴[${idx}]: 등록 안 된 조건 "${cond}". 건너뜀.`);
        continue;
      }
      if (!ActionRegistry.actions.has(act)) {
        console.warn(`   ⚠️ [패턴 임포트] "${ownerName}" 패턴[${idx}]: 등록 안 된 행동 "${act}". 건너뜀.`);
        continue;
      }

      validated.push({ cond, val, act });
    }

    return validated;
  }

  /**
   * 여러 캐릭터를 한 번에 임포트, side 기준으로 ally/enemy 분리.
   */
  static importSquad(dataArray) {
    if (!Array.isArray(dataArray)) {
      throw new Error("❌ [임포트 실패] 캐릭터 목록은 배열이어야 합니다.");
    }

    const allies = [];
    const enemies = [];

    dataArray.forEach((data) => {
      const character = this.importCharacter(data);
      if (character.side === "ally") allies.push(character);
      else enemies.push(character);
    });

    return { allies, enemies };
  }
}

// ============================================================================
// DB Row -> Importer 입력 포맷 변환 어댑터
// ============================================================================
class CharacterDataAdapter {
  /**
   * @param {number} characterId
   * @param {import('./mockDb').MockDBType} db
   */
  static buildImportDataFromDb(characterId, db) {
    const row = db.getCharacter(characterId);
    if (!row) throw new Error(`❌ [DB 조회 실패] character_id=${characterId} 없음`);

    const equipment = db.getEquipment(characterId);
    const bonusStats = equipment.reduce(
      (acc, eq) => {
        if (!eq.item) return acc;
        acc.str += eq.item.str_bonus || 0;
        acc.int += eq.item.int_bonus || 0;
        acc.dex += eq.item.dex_bonus || 0;
        acc.spd += eq.item.spd_bonus || 0;
        acc.luk += eq.item.luk_bonus || 0;
        return acc;
      },
      { str: 0, int: 0, dex: 0, spd: 0, luk: 0 }
    );

    const activePreset = db.getActivePreset(characterId);
    const patternRows = activePreset ? db.getPatternSlots(activePreset.preset_id) : [];

    return {
      name: row.name,
      side: row.side || "ally",
      stats: {
        str: row.real_str,
        int: row.real_int,
        dex: row.real_dex,
        spd: row.real_spd,
        luk: row.real_luk,
      },
      bonusStats,
      patterns: patternRows.map((p) => ({ cond: p.cond_key, val: p.cond_val, act: p.act_key })),
    };
  }
}

module.exports = { CharacterImporter, CharacterDataAdapter };


  // 브라우저 환경이면 이 모듈의 exports를 공용 네임스페이스에 얹음(Node에서는
  // window가 없으니 아무 일도 안 함. 어차피 Node의 진짜 module.exports는 위에서
  // 그대로 전달받은 그 객체라 이 시점에 이미 다 채워져 있음).
  if (typeof window !== "undefined") {
    window.BattleSim = window.BattleSim || {};
    Object.assign(window.BattleSim, module.exports);
  }
})(typeof module !== "undefined" ? module : undefined, typeof require !== "undefined" ? require : undefined);
