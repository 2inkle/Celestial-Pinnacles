// ============================================================================
// battle-adapter.js — 웹(로스터/Sheet 데이터)과 엔진(src/*.js, window.BattleSim)을
// 잇는 얇은 어댑터. 이 파일이 하는 일은 딱 두 가지뿐:
//   1) Sheet 형식 데이터(로스터 캐릭터, 몬스터, 패턴)를 엔진이 이해하는
//      BattleCharacter/patternSlots 형식으로 "변환"
//   2) 그 결과로 BattleEngine을 만들어 실제로 돌리고, 결과를 그대로 반환
// 게임 로직(전투 계산, 데미지, 조건 판정 등)은 여기서 절대 다시 구현하지 않음 —
// 전부 엔진(BattleEngine/ConditionRegistry/SkillRegistry)에 위임함. 새 규칙이나
// 새 효과 타입이 엔진에 추가돼도 이 파일은 안 건드려도 됨(단, 새 "패턴 조건
// 종류"나 "스킬"을 Sheet에 추가했다면, 아래 번역표에 그만큼만 추가하면 됨).
//
// 로드 순서(battle-view.html 등에서 <script> 태그로):
//   resourceTypes → resourceManager → skillRegistry → combatFormulas →
//   registries → character → prepState → skillResolution → importer → engine
//   → battle-adapter(이 파일)
// ============================================================================
(function () {
  const BS = window.BattleSim;
  if (!BS) {
    console.error("[battle-adapter] window.BattleSim이 없음 — 엔진 스크립트들을 먼저 로드했는지 확인하세요.");
    return;
  }

  // 패턴의 action 이름 중 엔진 쪽 이름이 다른 것만 여기서 매핑(대부분은 스킬
  // 이름 그대로 SkillRegistry에 등록해뒀으니 이 매핑이 필요 없음).
  const SKILL_NAME_TO_ENGINE_ACT = {
    "마법진 생성": "CREATE_MAGIC_CIRCLE",
    "마법진 폭발": "DETONATE_MAGIC_CIRCLE",
    "아이템 사용": "USE_POTION",
    "소환": "SUMMON",
  };

  // ==========================================================================
  // 1) 스킬 등록 — character-sheet.html/monster-sheet.html과 완전히 같은
  //    공용 소스(game_content.skillTable, dev-tools의 skill-table-editor.html에서
  //    관리)를 씀. 예전엔 여기도 별도의 하드코딩 사본이 있어서 "메테오
  //    낙하"(여기) vs "메테오"(스킬 테이블)처럼 이름이 어긋나는 문제가 실제로
  //    있었음. 엔진이 실전투에 쓰려면 필요한 필드(targetFaction/targetCount/
  //    skillType/preDelay/preDelayType/postDelay)가 전부 채워진 스킬만
  //    등록함 — 나머지(스탯/코스트만 있는 대다수)는 skill-table-editor에서
  //    마저 채워야 실전투에서 쓸 수 있음. 그런 스킬을 패턴에서 참조하면
  //    엔진이 조용히 무시함(크래시 안 남).
  //
  // 2026-08-15: localStorage(battleSim_skillTable) 동기 읽기를 없앰 — DB
  // 전환 후 그 키를 채워주는 페이지가 하나도 안 남아서(character-sheet.html도
  // 이제 game_content를 직접 조회함) 이 함수가 항상 빈 테이블을 돌려주고
  // 있었다(모든 전투가 스킬 하나도 없이 맨주먹 ATTACK만 쓰는 상태였음 —
  // dispatch.html/battle-view.html 전환 중 발견). battle-encounters.js의
  // setMonsterRoster와 동일한 패턴으로, 페이지가 game_content를 직접 조회해서
  // 이 캐시에 넣어주는 방식으로 바꿈(runBattle이 호출될 때마다 DB를 새로
  // 묻지 않도록 — registerKnownSkills는 매 전투 시작마다 호출됨).
  // ==========================================================================
  const BATTLE_READY_SKILL_FIELDS = ["targetFaction", "targetCount", "skillType", "preDelay", "preDelayType", "postDelay"];
  let cachedSkillTable = { commonSkills: [], jobSkills: {} };
  function setSkillTable(table) {
    cachedSkillTable = table && typeof table === "object" ? table : { commonSkills: [], jobSkills: {} };
  }
  function getSkillTable() {
    return cachedSkillTable;
  }
  function allSkillsFromTable() {
    const t = getSkillTable();
    return [...t.commonSkills, ...Object.values(t.jobSkills).flat()];
  }
  function isBattleReady(skill) {
    // 필드가 다 채워져있어도, costs/effects가 아직 자연어(문자열)로 남아있으면
    // 실전투에 못 씀 — skill-table-editor.html은 JSON 파싱에 실패한 costs/effects를
    // 막지 않고 그 원문을 그대로 저장해두는데(구현 요청 메모 용도), 그 문자열이
    // 그대로 엔진에 들어가면 .map() 등에서 크래시 남. 배열이 아니면 등록 자체를
    // 건너뜀(스킬 테이블 파일 자체는 안 건드리고 조용히 무시).
    const costsOk = skill.costs === undefined || Array.isArray(skill.costs);
    const effectsOk = skill.effects === undefined || Array.isArray(skill.effects);
    return costsOk && effectsOk && BATTLE_READY_SKILL_FIELDS.every((f) => skill[f] !== undefined);
  }

  function registerKnownSkills() {
    allSkillsFromTable().forEach((skill) => {
      if (isBattleReady(skill)) BS.SkillRegistry.register(skill);
    });
  }

  // 학습한 스킬 중 passive:true인 것만 골라냄 — 패턴 액션으로는 절대 안 쓰이고,
  // learnedSkillNames에 있기만 하면 상시 적용됨.
  function learnedPassiveSkills(learnedSkillNames) {
    const all = allSkillsFromTable();
    return (learnedSkillNames || [])
      .map((name) => all.find((s) => s.name === name))
      .filter((s) => s && s.passive);
  }

  // ==========================================================================
  // 2) 패턴 행 번역 — Sheet의 {subject, metric, comparator, value, unit, action}을
  //    엔진의 {cond, val, act}로 바꿈. 지금 번역 가능한 조합만 처리하고, 그 외는
  //    "ALWAYS"로 안전하게 폴백(+ 콘솔에 어떤 행을 못 옮겼는지 남김) — 나머지
  //    조합(예: HP 이상/초과, 특정 아군 대상 등)은 엔진에 대응 조건이 아직 없어서
  //    다음 확장 때 여기 번역표만 늘리면 됨.
  // ==========================================================================
  // row의 조건 부분만 번역(act는 별도로 붙임) — maxUses로 감쌀 때 조건과 행동을
  // 분리해서 다뤄야 하기 때문에 함수를 나눔.
  function translateCondition(row) {
    if (row.metric === "always") return { cond: "ALWAYS", val: 0 };
    if (row.metric === "notGuarding") return { cond: "NOT_GUARDING", val: null };
    if (row.metric === "hp" && row.subject === "self" && (row.comparator === "lte" || row.comparator === "lt")) {
      return { cond: "MY_HP_LESS_THAN_PCT", val: row.value };
    }
    if (row.metric === "battleTurn" && (row.comparator === "gte" || row.comparator === "gt")) {
      return { cond: "BATTLE_TURN_AT_LEAST", val: row.value };
    }
    // 자기 자신의 effective 스탯 비교 — subject가 "self"일 때만 번역함(상대방
    // 스탯은 이 경로로 절대 참조 못 하게 하는 설계 의도, row.statKey로 어떤
    // 스탯인지 지정: str/int/dex/spd/luk/atk/matk/def/mdef).
    if (row.metric === "effectiveStat" && row.subject === "self" && row.statKey) {
      return { cond: "MY_EFFECTIVE_STAT_COMPARE", val: { stat: row.statKey, comparator: row.comparator, threshold: row.value } };
    }
    // 상대 진영의 팀 자원 보유량 — subject가 "opponent"일 때만 번역함(자기 진영
    // 자원 판정은 기존 관례상 별도 metric으로 추가하면 됨, 아직 그 경로는 없음).
    // row.resource가 없으면 magicCircle 기본값.
    if (row.metric === "opponentResource" && row.subject === "opponent" && (row.comparator === "gte" || row.comparator === "gt")) {
      return { cond: "OPPONENT_RESOURCE_GREATER_THAN", val: { resource: row.resource || "magicCircle", amount: row.value } };
    }
    console.warn(`[battle-adapter] 아직 번역 못 하는 패턴 조건 — ALWAYS로 대체함:`, row);
    return { cond: "ALWAYS", val: 0 };
  }

  function translatePatternRow(row) {
    const act = SKILL_NAME_TO_ENGINE_ACT[row.action] || row.action;
    const baseCondition = translateCondition(row);

    // "이 슬롯은 전투 중 최대 N번만 발동" — 원래 조건에 SLOT_USE_COUNT_LESS_THAN을
    // AND로 겹쳐서, N번 발동한 뒤로는 이 슬롯이 자동으로 무효화되게 함(다음
    // 슬롯으로 자연스럽게 넘어감).
    if (row.maxUses != null) {
      return {
        cond: "AND",
        val: [baseCondition, { cond: "SLOT_USE_COUNT_LESS_THAN", val: row.maxUses }],
        act,
      };
    }
    return { ...baseCondition, act };
  }

  // andNext가 켜진 행들은 자기 자신의 액션을 안 쓰고 조건만 다음 행에 이어붙임
  // — 그 체인이 andNext가 꺼진 "실행 행"에 도달할 때까지 계속됨(길이 제한 없이
  // 몇 개든 이어질 수 있음). 실행 행 자체는 translatePatternRow로 그대로
  // 번역하고(maxUses 로직도 그대로 유지됨), 앞서 모아둔 체인 조건들과 함께
  // 바깥쪽 AND로 한 번 더 감쌈 — AND의 val 배열 원소가 또 AND일 수도 있는데,
  // ConditionRegistry.check가 재귀적으로 처리하므로 중첩에 문제없음.
  function translatePatternSlots(preset) {
    if (!preset || !Array.isArray(preset.rows)) return [];
    const rows = preset.rows;
    const result = [];
    let i = 0;
    while (i < rows.length) {
      const chainConditions = [];
      while (i < rows.length && rows[i].andNext) {
        chainConditions.push(translateCondition(rows[i]));
        i++;
      }
      if (i >= rows.length) break; // andNext만 있고 실행 행 없이 목록이 끝남 — 무시
      const executed = translatePatternRow(rows[i]);
      if (chainConditions.length > 0) {
        result.push({ cond: "AND", val: [...chainConditions, { cond: executed.cond, val: executed.val }], act: executed.act });
      } else {
        result.push(executed);
      }
      i++;
    }
    return result;
  }

  // ==========================================================================
  // 3-1) 소환 사양 사전 계산 — "몬스터가 소환 능력을 갖고 있다"는 정보(어떤
  //    monsterId를, 몇 배 계수로)를 여기서 딱 한 번 실제 스탯으로 풀어서
  //    summonPool을 만들어둠(테이블 조회는 여기서 딱 한 번). ⚠ 계수는 여기서
  //    곱하지 않음 — LUK/SummonEff는 전투 중 버프로 실시간 변할 수 있는 값이라,
  //    "소환이 실제로 일어나는 순간"의 값을 반영해야 함(엔진의 SUMMON 액션 참고).
  //    그래서 여기서는 몬스터 테이블의 "가공 전 원본 스탯"만 옮겨줌.
  //    monsterId나 테이블 자체를 엔진에 넘기지 않는다는 원칙은 그대로 유지 —
  //    조회는 여기서 끝내고, 엔진에는 순수 값(이름/스탯/패턴/가중치)만 넘어감.
  // ==========================================================================
  function resolveSummonPool(monsterTable, summonAbility) {
    if (!summonAbility || !Array.isArray(summonAbility.candidates)) return null;
    const pool = summonAbility.candidates
      .map(({ monsterId, weight }) => {
        const targetDef = monsterTable[monsterId];
        if (!targetDef) {
          console.error(`[battle-adapter] 소환 후보 "${monsterId}"이(가) MONSTER_TABLE에 없음`);
          return null;
        }
        return {
          name: targetDef.name,
          stats: targetDef.realStats || {}, // 가공 전 원본 그대로 — 배율은 엔진이 소환 시점에 곱함
          patternSlots: translatePatternSlots({ rows: targetDef.patterns || [] }),
          expReward: targetDef.expReward || 0,
          goldReward: targetDef.goldReward || 0,
          dropTable: targetDef.dropTable || [],
          // 전투 스탯과 내구도도 넘겨줘야 함 — 안 넘기면 소환된 개체가 ATK 0인
          // 허수아비가 되어 아무 데미지도 못 줌(원본 몬스터는 combatReal로
          // 공격력을 갖는 구조라 realStats만으로는 화력이 0).
          combatReal: targetDef.combatReal || null,
          maxHp: targetDef.maxHp,
          weight: weight || 1,
        };
      })
      .filter(Boolean);
    return pool.length ? pool : null;
  }

  // ==========================================================================
  // 3) 로스터 캐릭터(Sheet 형식) -> BattleCharacter. 장비의 combatReal(atk/def/matk)
  //    합산은 character-sheet.html의 computeRealCombatStats()와 동일한 계산을
  //    최소한으로 복제함(세트 보너스의 combatReal까지는 아직 반영 안 함 — 필요해
  //    지면 이 함수만 보강하면 됨).
  // ==========================================================================
  // real(고정)뿐 아니라 bonus(버프 취급되는 수치)도 합산함 — 장비가 이제
  // combatReal(진짜 능력치)과 별개로 combatBonus(버프성 능력치)도 줄 수 있음.
  // SummonEff는 여전히 real 전용(장비/버프 무관 원칙 그대로 유지)이라 bonus
  // 쪽엔 없음.
  // 패시브(장비/패시브 스킬)가 공통으로 쓰는 % 키 목록 — shop-table-editor.html/
  // skill-table-editor.html의 passiveBonus/passiveMods와 정확히 같은 키.
  const PASSIVE_MOD_KEYS = [
    "physicalDamageDealtPct", "physicalDamageTakenPct",
    "magicDamageDealtPct", "magicDamageTakenPct",
    "hpCostReductionPct", "spCostReductionPct",
    "healingDealtPct", "healingDealtFlat", "lifestealPct", "accuracyBonusPct", "completeDefenseChancePct", "critChancePct",
    // 공격자 등급(creatureTier)별 받는 피해 감소 — 잡졸에겐 강하고 보스엔 그대로 같은 효과용
    "damageTakenFrom_normalPct", "damageTakenFrom_elitePct", "damageTakenFrom_bossPct", "damageTakenFrom_creaturePct", "damageTakenFrom_userPct",
    "damageDealtTo_normalPct", "damageDealtTo_elitePct", "damageDealtTo_bossPct", "damageDealtTo_creaturePct", "damageDealtTo_userPct",
    "physicalIgnoreBonusDefPct", "magicIgnoreBonusDefPct",
  ];
  // 여러 출처(장비 각각 + 학습한 패시브 스킬 각각)의 % 값을 전부 더함 —
  // 어느 하나라도 없는 키는 0 취급.
  function sumPassiveMods(sources) {
    const result = {};
    PASSIVE_MOD_KEYS.forEach((k) => { result[k] = 0; });
    sources.forEach((src) => {
      if (!src) return;
      PASSIVE_MOD_KEYS.forEach((k) => { result[k] += src[k] || 0; });
    });
    return result;
  }

  function sumEquipmentCombatStats(rosterChar) {
    const real = { atk: 0, def: 0, matk: 0, mdef: 0, summonEff: 0 };
    const bonus = { atk: 0, def: 0, matk: 0, mdef: 0 };
    const statBonus = { str: 0, int: 0, dex: 0, spd: 0, luk: 0 }; // bonus형 핵심스탯(전투 중 성능)
    const statRealBonus = { str: 0, int: 0, dex: 0, spd: 0, luk: 0 }; // real형 핵심스탯(잠재치 자체)
    let maxHpBonus = 0;
    let maxSpBonus = 0;
    const passiveSources = [];
    const conditionalPassiveSources = [];
    // 화살통 등 "개인 자원의 최대치를 고정해주는" 장비 — 여러 개가 같은
    // resource 키를 지정하면 마지막 것이 이김(보통 슬롯 하나에 한정될
    // 장비지만, 여러 개 겹쳐도 죽지 않게).
    const grantedResources = {};
    let critMultiplierBonus = 0;
    Object.values(rosterChar.equipment || {}).forEach((item) => {
      if (!item) return;
      if (item.combatReal) {
        real.atk += item.combatReal.atk || 0;
        real.def += item.combatReal.def || 0;
        real.matk += item.combatReal.matk || 0;
        real.mdef += item.combatReal.mdef || 0;
        real.summonEff += item.combatReal.summonEff || 0;
      }
      if (item.combatBonus) {
        bonus.atk += item.combatBonus.atk || 0;
        bonus.def += item.combatBonus.def || 0;
        bonus.matk += item.combatBonus.matk || 0;
        bonus.mdef += item.combatBonus.mdef || 0;
      }
      if (item.statBonus) STAT_KEYS.forEach((k) => { statBonus[k] += item.statBonus[k] || 0; });
      if (item.statRealBonus) STAT_KEYS.forEach((k) => { statRealBonus[k] += item.statRealBonus[k] || 0; });
      maxHpBonus += item.maxHpBonus || 0;
      maxSpBonus += item.maxSpBonus || 0;
      if (item.passiveBonus) passiveSources.push(item.passiveBonus);
      if (Array.isArray(item.conditionalPassiveMods)) conditionalPassiveSources.push(...item.conditionalPassiveMods);
      if (item.grantsResource) grantedResources[item.grantsResource.key] = item.grantsResource.max;
      // 크리티컬 배율은 합산이 아니라 "가장 높은 것 하나"만 적용됨
      if (item.critMultiplier) critMultiplierBonus = Math.max(critMultiplierBonus, item.critMultiplier);
    });
    return { real, bonus, statBonus, statRealBonus, maxHpBonus, maxSpBonus, passiveSources, conditionalPassiveSources, grantedResources, critMultiplierBonus };
  }

  const STAT_KEYS = ["str", "int", "dex", "spd", "luk"];

  function buildAllyFromRoster(rosterChar, activePresetIdx) {
    const stats = rosterChar.realStats || {};
    const character = new BS.BattleCharacter(rosterChar.name, "ally", stats);
    character.id = rosterChar.id;
    character.row = rosterChar.row === "back" ? "back" : "front";
    character.guardAllies = !!rosterChar.guardAllies;

    const { real, bonus, statBonus, statRealBonus, maxHpBonus, maxSpBonus, passiveSources, conditionalPassiveSources, grantedResources, critMultiplierBonus } = sumEquipmentCombatStats(rosterChar);
    // 맨주먹 보정 — 양손(mainhand/subhand)에 아무것도 안 낀 경우에만 ATK 5를
    // 줌. 초기 자본을 전부 고용에 써서 무기를 못 산 경우에도 최소한의 공격은
    // 가능하게 하기 위한 안전장치(무기 없이 ATK 0이면 데미지 자체가 0이라
    // 전투가 아예 성립하지 않음). 어느 손이든 장비를 끼면 이 보너스는 사라짐.
    const hasHandGear = !!(rosterChar.equipment?.mainhand || rosterChar.equipment?.subhand);
    character.realAtk = hasHandGear ? real.atk : real.atk + 5;
    character.realDef = real.def;
    character.realMatk = real.matk;
    character.realMdef = real.mdef;
    character.realSummonEff = real.summonEff;

    // 학습한 패시브 스킬도 장비와 완전히 같은 필드(statBonus/statRealBonus/
    // combatBonus/maxHpBonus/maxSpBonus)를 쓸 수 있게 함 — "습득 시 즉시 지급"
    // 대신 장비와 동일하게 "전투 시작마다 현재 상태(장착 중인 장비 + 학습한
    // 패시브)에서 다시 계산"하는 방식으로 통일함. 이래야 나중에 패시브를
    // 재습득/변경하거나 밸런스 수치를 바꿔도 로스터에 저장된 값을 따로
    // 마이그레이션할 필요가 없음(장비 해제하면 바로 사라지는 것과 같은 원리).
    // ⚠ 이 합산은 반드시 아래 character.bonusAtk 등에 대입하기 "전에" 끝나야
    // 함 — bonus 객체에 패시브 몫까지 다 더한 뒤에 한 번만 대입하는 순서.
    const passiveSkills = learnedPassiveSkills(rosterChar.learnedSkillNames);
    passiveSkills.forEach((skill) => {
      if (skill.statBonus) STAT_KEYS.forEach((k) => { statBonus[k] += skill.statBonus[k] || 0; });
      if (skill.statRealBonus) STAT_KEYS.forEach((k) => { statRealBonus[k] += skill.statRealBonus[k] || 0; });
      if (skill.combatBonus) {
        bonus.atk += skill.combatBonus.atk || 0;
        bonus.def += skill.combatBonus.def || 0;
        bonus.matk += skill.combatBonus.matk || 0;
        bonus.mdef += skill.combatBonus.mdef || 0;
      }
    });
    const passiveMaxHpBonus = passiveSkills.reduce((sum, s) => sum + (s.maxHpBonus || 0), 0);
    const passiveMaxSpBonus = passiveSkills.reduce((sum, s) => sum + (s.maxSpBonus || 0), 0);

    // 장비발 + 패시브발 bonus를 합친 최종값을 전투 시작 시점의 "기본값"으로
    // 심어둠 — 전투 중 버프 효과가 여기에 추가로 더해지거나 빠지는 건 기존
    // 버프 로직 그대로(resetForBattle이 bonusAtk 등을 0으로 되돌리는 건
    // "다음 전투 시작 시 다시 이 값부터 시작"하기 위함이라, 매 전투마다 이
    // 초기화가 다시 적용되어야 함 — 이미 그렇게 되어 있음, 캐릭터를 매번
    // 새로 만드니까).
    character.bonusAtk = bonus.atk;
    character.bonusDef = bonus.def;
    character.bonusMatk = bonus.matk;
    character.bonusMdef = bonus.mdef;

    // real형(잠재치 자체)은 캐릭터 생성 시 이미 심어진 realStats에 "더하는"
    // 방식 — 이미 realStr 등이 설정된 뒤라 여기서 가산만 하면 됨.
    STAT_KEYS.forEach((k) => {
      const capKey = k.charAt(0).toUpperCase() + k.slice(1);
      character[`real${capKey}`] += statRealBonus[k];
      character[`bonus${capKey}`] += statBonus[k];
    });
    character.maxHpBonus += maxHpBonus + passiveMaxHpBonus;
    character.maxSpBonus += maxSpBonus + passiveMaxSpBonus;
    character.currentHp = character.maxHp; // maxHp가 위 보너스들로 바뀌었을 수 있으니 다시 풀피로
    character.currentSp = character.maxSp;

    // 화살통 등 "개인 자원의 최대치를 고정해주는" 장비 — 화살 같은 자원은
    // TP처럼 "전투당" 자원으로 취급해서 매 전투 시작 시 화살통이 지정한
    // max로 가득 채운 채로 시작함(장비 해제하면 이 자원 자체가 사라짐 —
    // 다른 장비발 보너스들과 같은 원리, 로스터에 남은 화살 수를 따로
    // 마이그레이션할 필요 없음).
    Object.entries(grantedResources).forEach(([key, max]) => {
      character.personalResources[key] = { current: max, max };
    });

    // 직업 고유 자원(PERSONAL_RESOURCE_TYPES의 jobGrant) — 특정 직업이면
    // 장비와 무관하게 자동으로 갖고 시작하는 자원(둠로드/스펠마의 집속 마력
    // 등). 화살처럼 장비로 얻는 자원과 달리 직업 자체에 딸린 것이라
    // 여기서 직업명을 보고 바로 등록함. 장비가 같은 키를 이미 부여했다면
    // 장비 쪽을 우선(덮어쓰지 않음).
    const personalTypes = (BS.PERSONAL_RESOURCE_TYPES || {});
    Object.entries(personalTypes).forEach(([key, meta]) => {
      const grant = meta.jobGrant;
      if (!grant || character.personalResources[key]) return;
      if (!grant.jobs.includes(rosterChar.job)) return;
      character.personalResources[key] = { current: grant.initial ?? 0, max: grant.max ?? 100 };
    });

    // passiveMods는 real류와 같은 성격(resetForBattle이 안 건드림)이라, bonusAtk
    // 처럼 "엔진 생성 이후 재적용" 할 필요 없이 여기서 한 번만 세팅하면 됨.
    // 장비의 passiveBonus + 학습한 패시브 스킬(passive:true)의 passiveMods를
    // 전부 합산.
    const passiveSkillMods = passiveSkills.map((s) => s.passiveMods);
    character.passiveMods = sumPassiveMods([...passiveSources, ...passiveSkillMods]);

    // 크리티컬 배율 — 장비와 패시브 스킬을 통틀어 "가장 높은 것 하나"만.
    // (확률 critChancePct는 passiveMods에 들어가 정상적으로 합산됨)
    character.critMultiplierBonus = passiveSkills.reduce(
      (max, s) => Math.max(max, s.critMultiplier || 0),
      critMultiplierBonus
    );

    // conditionalPassiveMods도 같은 방식(장비 + 학습한 패시브 스킬)으로 합쳐서
    // 세팅 — "조건이 지금 참일 때만 더해지는" 목록이라 sumPassiveMods처럼
    // 미리 더할 게 아니라, 배열 자체를 그대로 이어붙이기만 하면 됨(실제 판정은
    // Character.getPassiveModValue()가 매번 함).
    const passiveSkillConditionalMods = passiveSkills.flatMap((s) => Array.isArray(s.conditionalPassiveMods) ? s.conditionalPassiveMods : []);
    character.conditionalPassiveMods = [...conditionalPassiveSources, ...passiveSkillConditionalMods];

    const preset = (rosterChar.presets || [])[activePresetIdx ?? 0] || rosterChar.presets?.[0];
    character.patternSlots = translatePatternSlots(preset);

    return character;
  }

  // ==========================================================================
  // 4) 몬스터를 "id(MONSTER_TABLE의 키)"로 직접 조회해서 -> BattleCharacter.
  //    캐릭터 쪽과 달리 몬스터는 전투 후에 값을 돌려보낼 대상이 없어서(경험치를
  //    "그 몬스터에게" 돌려줄 일이 없음), 로스터처럼 미리 조회해둔 데이터를 받는
  //    대신 여기서 id로 직접 조회함 — 대신 같은 종류가 여러 마리 나올 수 있는
  //    문제는 "몬스터키#순번"으로 개체를 구분해서 해결함.
  //    monsterTable: battle-view.html의 MONSTER_TABLE 그대로 넘기면 됨.
  // ==========================================================================
  function buildEnemyFromMonsterKey(monsterTable, monsterKey, instanceIndex) {
    const monsterDef = monsterTable[monsterKey];
    if (!monsterDef) {
      console.error(`[battle-adapter] MONSTER_TABLE에 "${monsterKey}" 항목이 없음`);
      return null;
    }
    const character = new BS.BattleCharacter(monsterDef.name, "enemy", monsterDef.realStats || {});
    character.id = `${monsterKey}#${instanceIndex}`; // 전투 내에서만 유효한 개체 식별자(영구 DB id 아님)
    character.monsterKey = monsterKey; // MONSTER_TABLE 원본 키 — 어느 "종류"인지
    character.realAtk = monsterDef.combatReal?.atk || 0;
    character.realDef = monsterDef.combatReal?.def || 0;
    character.realMatk = monsterDef.combatReal?.matk || 0;
    character.realMdef = monsterDef.combatReal?.mdef || 0;
    character.realSummonEff = monsterDef.combatReal?.summonEff || 0; // 소환 능력이 있는 몬스터는 여기 값을 채워둬야 실제로 유의미한 소환이 됨
    character.expReward = monsterDef.expReward || 0;
    character.goldReward = monsterDef.goldReward || 0;
    character.dropTable = monsterDef.dropTable || [];
    // 몬스터 등급 — MONSTER_TABLE에 tier가 없으면 "normal"이 기본(대부분의
    // 잡몹은 굳이 등급을 안 적어도 되게).
    character.creatureTier = monsterDef.tier || "normal";
    // 개전 선공(openingAction) — 게이지를 가득 채운 채로 전투를 시작해서
    // 첫 틱에 곧바로 행동함. 개전 소환/개전 버프처럼 "전투가 시작되자마자
    // 한 방 먼저 두는" 패턴을 조건 트릭 없이 표현하기 위한 장치.
    // 숫자를 주면 그 비율(0~1)만큼만 채운 채 시작할 수도 있음(0.5 = 절반).
    if (monsterDef.openingAction) {
      const ratio = typeof monsterDef.openingAction === "number" ? monsterDef.openingAction : 1;
      character.initialActionGauge = BS.BattleEngine.GAUGE_THRESHOLD * ratio;
      character.actionGauge = character.initialActionGauge;
    }
    // 최대 HP/SP 직접 지정(선택) — 있으면 스탯 공식 대신 이 값을 씀.
    // 내구도와 화력을 분리해서 잡아야 하는 보스/오브젝트형 몬스터용.
    if (monsterDef.maxHp != null) character.maxHpOverride = monsterDef.maxHp;
    if (monsterDef.maxSp != null) character.maxSpOverride = monsterDef.maxSp;
    character.currentHp = character.maxHp;
    character.currentSp = character.maxSp;
    character.patternSlots = translatePatternSlots({ rows: monsterDef.patterns || [] });
    // 몬스터는 패턴 슬롯 제한을 받지 않음 — 유저 캐릭터는 INT로 슬롯이 늘어나는
    // 성장 요소지만, 몬스터는 설계자가 짜둔 패턴이 전부 그대로 작동해야 함.
    character.patternSlotsOverride = Infinity;
    // 소환 능력이 있는 몬스터(예: 고블린 마차)면, 후보 풀(가공 전 원본)을 여기서
    // 미리 조회해서 심어둠 — 실제 배율(SummonEff×LUK) 계산은 엔진이 소환이
    // 일어나는 그 순간에 함(LUK가 전투 중 실시간으로 변할 수 있어서).
    const summonPool = resolveSummonPool(monsterTable, monsterDef.summonAbility);
    if (summonPool) character.summonPool = summonPool;
    // DIALOGUE_OPENING/DIALOGUE_DEFEAT/REWARD_GRANT 액션(src/registries.js)이
    // 읽는 몬스터별 커스텀 데이터 — 없으면 각 액션의 기본값을 씀.
    if (monsterDef.dialogueOpeningLines) character.dialogueOpeningLines = monsterDef.dialogueOpeningLines;
    if (monsterDef.dialogueDefeatLines) character.dialogueDefeatLines = monsterDef.dialogueDefeatLines;
    if (monsterDef.rewardObjectSpec) character.rewardObjectSpec = monsterDef.rewardObjectSpec;
    return character;
  }

  // ==========================================================================
  // 5) 실제 전투 실행 진입점.
  //   allyRosterChars: 로스터 캐릭터 배열(Sheet 형식 그대로)
  //   monsterTable: MONSTER_TABLE 그 자체(id로 조회하는 용도)
  //   enemySpawnKeys: 스폰된 몬스터들의 키 배열(예: ["goblin_scout","goblin_scout","goblin_warrior"])
  //     — 같은 키가 여러 번 있으면 자동으로 서로 다른 id(#0, #1, ...)를 붙여 구분함.
  // 어댑터는 이걸 "id로 직접 조회"함 — localStorage 조회나 스폰 확률 굴리기 자체는
  // 여전히 호출부(battle-view.html)의 몫이고, 여기선 "이미 정해진 스폰 결과(키
  // 목록)"를 받아 조회~변환~실행만 함.
  // ==========================================================================
  function runBattle({ allyRosterChars, monsterTable, enemySpawnKeys, maxTurns, username, logger }) {
    registerKnownSkills();

    const monsterKeyCounts = {};
    const enemies = enemySpawnKeys
      .map((key) => {
        const idx = monsterKeyCounts[key] || 0;
        monsterKeyCounts[key] = idx + 1;
        return buildEnemyFromMonsterKey(monsterTable, key, idx);
      })
      .filter(Boolean); // 테이블에 없는 키는 조용히 제외(에러는 이미 콘솔에 남김)

    const allies = allyRosterChars.map((c) => buildAllyFromRoster(c, c.activePresetIdx));

    const engine = new BS.BattleEngine(allies, enemies, logger || console.log);
    // ⚠ BattleEngine 생성자가 여기서 resetForBattle()을 돌리는데, 이게
    // bonusAtk/bonusDef/bonusMatk/bonusMdef를 전부 0으로 되돌려버림(원래는
    // "전투 시작 시 버프 초기화" 용도로 만든 동작). buildAllyFromRoster가 방금
    // 심어둔 장비발 bonus도 같이 지워지므로, 엔진 생성 "이후"에 다시 한번
    // 적용해줘야 함 — 이 순서를 지키지 않으면 장비의 combatBonus가 조용히
    // 반영 안 되는 버그가 생김(실제로 한 번 겪었음).
    allies.forEach((character, i) => {
      const { bonus } = sumEquipmentCombatStats(allyRosterChars[i]);
      character.bonusAtk = bonus.atk;
      character.bonusDef = bonus.def;
      character.bonusMatk = bonus.matk;
      character.bonusMdef = bonus.mdef;
    });

    return engine.startBattle(maxTurns, username);
  }

  window.BattleAdapter = {
    runBattle,
    buildAllyFromRoster,
    buildEnemyFromMonsterKey,
    translatePatternRow,
    translatePatternSlots,
    registerKnownSkills,
    setSkillTable,
  };
})();
