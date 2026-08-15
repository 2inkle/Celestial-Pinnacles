// ============================================================================
// 전투 편성 테이블 (공용)
//
// battle-view.html(직접 전투)와 dispatch.html(파견)이 같은 편성을 써야 하므로
// 별도 파일로 분리함. 예전엔 battle-view.html 안에만 있어서 파견 쪽에서
// 재사용할 수 없었음.
// ============================================================================
(function () {
  // 몬스터 로스터는 "배열"로 관리됨(game_content.monsterRoster). 반면
  // battle-adapter는 monsterTable[monsterId]로 조회하므로 id를 키로 갖는 객체가
  // 필요함 — 그 변환을 여기서 한 번만 하고 공용으로 씀.
  //
  // 예전엔 이 변환이 battle-view.html에만 있었고 dispatch.html과 이 파일은
  // 배열을 그대로 넘겨서, 파견에서는 모든 몬스터 조회가 undefined가 됐음
  // (적이 하나도 안 만들어져 매 전투가 1턴 부전승 → 2000턴 파견이 경험치 0 ·
  // 골드 0 · 전리품 0으로 끝남. 파견 기능 자체가 동작한 적이 없었음).
  //
  // ⚠ 이 파일은 저장소(DB)를 직접 모른다 — 로스터는 각 페이지(battle-view/
  // dispatch)가 자기 부트스트랩에서 한 번 받아와 setMonsterRoster()로 주입함.
  // getMonsterTable()이 동기여야 하는 이유: dispatch의 보상 시뮬레이션이
  // spawnEnemies()를 2000턴 예산이 바닥날 때까지 수백 번 반복 호출하는데,
  // 여기서 매번 네트워크를 타면 그 루프가 성립하지 않음.
  let cachedMonsterRoster = [];
  function setMonsterRoster(roster) {
    cachedMonsterRoster = Array.isArray(roster) ? roster : [];
  }
  function getMonsterTable() {
    const table = {};
    cachedMonsterRoster.forEach((m) => { if (m && m.id) table[m.id] = m; });
    return table;
  }

  const BATTLE_MONSTER_POOLS = {
    "goblin-play": {
      maxCount: 2,
      pool: [
        { monsterId: "goblin_scout", row: "front", weight: 80, maxAppearances: 2 },
        { monsterId: "goblin_warrior", row: "front", weight: 20, maxAppearances: 1 },
      ],
    },
    "slightly-strong-goblin": {
      maxCount: 2,
      pool: [
        { monsterId: "goblin_scout", row: "front", weight: 40, maxAppearances: 1 },
        { monsterId: "goblin_warrior", row: "front", weight: 60, maxAppearances: 2 },
      ],
    },
    "goblin-warriors": {
      maxCount: 3,
      pool: [
        { monsterId: "goblin_warrior", row: "front", weight: 60, maxAppearances: 3 },
        { monsterId: "goblin_shaman", row: "back", weight: 40, maxAppearances: 1 },
      ],
    },
    "noble-goblins": {
      maxCount: 3,
      pool: [
        { monsterId: "goblin_noble", row: "front", weight: 60, maxAppearances: 2 },
        { monsterId: "goblin_shaman", row: "back", weight: 40, maxAppearances: 1 },
      ],
    },
    "goblin-fortress": {
      maxCount: 3,
      pool: [
        { monsterId: "goblin_elite_guard", row: "front", weight: 65, maxAppearances: 2 },
        { monsterId: "goblin_shaman", row: "back", weight: 35, maxAppearances: 1 },
      ],
    },
    // 고블린의 왕 — 왕이 항상 나오지는 않음(weight 10). "겨우 만난 왕"이라는
    // 감각을 만들고, 파밍 효율도 여기서 한 번 걸러짐. 왕이 안 나온 판은
    // 섭정/수문장/주술사와 싸우는 평범한 전투가 됨.
    "goblin-king": {
      maxCount: 4,
      pool: [
        { monsterId: "goblin_king", row: "front", weight: 10, maxAppearances: 1 },
        // 섭정 — 1체는 반드시 왕과 함께 등장하고(guaranteed), 남은 자리 추첨에서
        // 가중치 40으로 한 번 더 뽑힐 수 있어 최종 1~2체가 됨(maxAppearances 2).
        { monsterId: "goblin_regent", row: "front", weight: 40, maxAppearances: 2, guaranteed: true },
        { monsterId: "goblin_elite_guard", row: "front", weight: 30, maxAppearances: 1 },
        { monsterId: "goblin_shaman", row: "back", weight: 30, maxAppearances: 1 },
      ],
    },
    // 고블린 수송대 — "오래된 바퀴 자국"을 소모해서 여는 파밍 전투.
    // 마차(goblin_cart)가 확정 등장해서 파괴될 때까지 고블린을 무한 소환하므로,
    // "잡몹부터 치다간 끝이 없다 → 마차를 먼저 부숴야 한다"는 처치 우선순위
    // 판단을 가르치는 자리. 호위는 소수만 붙여서 마차 자체에 집중하게 함.
    "goblin-cart-raid": {
      maxCount: 3,
      pool: [
        { monsterId: "goblin_cart", row: "back", weight: 0, maxAppearances: 1, guaranteed: true },
        { monsterId: "goblin_warrior", row: "front", weight: 60, maxAppearances: 2 },
        { monsterId: "goblin_noble", row: "front", weight: 40, maxAppearances: 1 },
      ],
    },
    // 미스터리 전투 — maxCount:1 + guaranteed:true인 후보 딱 하나뿐이라
    // 항상 "unknown_entity" 한 체만 등장함(weight는 guaranteed면 안 쓰이므로
    // 0). 몬스터 자체는 web/monster-roster.html에 골격만 잡혀있음 — 실제
    // 스탯/패턴 설계는 다음 단계.
    "unknown-battle": {
      maxCount: 1,
      pool: [
        { monsterId: "unknown_entity", row: "front", weight: 0, maxAppearances: 1, guaranteed: true },
      ],
    },
    // 새 전투 예시: "forest-1": { maxCount:2, pool:[{monsterId:"forest_wolf", row:"front", weight:100, maxAppearances:2}] }
  };

  const RARE_THRESHOLD = 0.10;

  function spawnEnemies(battleId) {
    const config = BATTLE_MONSTER_POOLS[battleId] || BATTLE_MONSTER_POOLS["goblin-play"];
    const spawnCounts = {};
    const spawned = [];

    config.pool.filter((p) => p.guaranteed).forEach((p) => {
      if (spawned.length >= config.maxCount) return;
      spawned.push(p);
      spawnCounts[p.monsterId] = (spawnCounts[p.monsterId] || 0) + 1;
    });

    while (spawned.length < config.maxCount) {
      const candidates = config.pool.filter((p) => (spawnCounts[p.monsterId] || 0) < (p.maxAppearances ?? Infinity));
      if (!candidates.length) break; // 더 뽑을 후보 자체가 없음(전부 상한 도달)
      const chosen = weightedPick(candidates);
      spawned.push(chosen);
      spawnCounts[chosen.monsterId] = (spawnCounts[chosen.monsterId] || 0) + 1;
    }

    const probByMonster = {};
    computePoolProbabilities(config).forEach((p) => { probByMonster[p.monsterId] = p.isRare; });

    return spawned.map((c) => {
      const monster = getMonsterTable()[c.monsterId] || { name: c.monsterId, portrait: "❓" };
      const tag = probByMonster[c.monsterId] ? "[Rare] " : "";
      return { monsterId: c.monsterId, name: `${tag}${monster.name}`, portrait: monster.portrait, row: c.row };
    });
  }

  function computePoolProbabilities(config) {
    if (!config) return [];
    const rollable = config.pool.filter((p) => !p.guaranteed);
    const totalWeight = rollable.reduce((sum, p) => sum + p.weight, 0);
    return config.pool.map((p) => {
      const probability = p.guaranteed ? 1 : (totalWeight ? p.weight / totalWeight : 0);
      return { ...p, probability, isRare: !p.guaranteed && probability < RARE_THRESHOLD };
    });
  }

  function weightedPick(candidates) {
    const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const c of candidates) {
      if (roll < c.weight) return c;
      roll -= c.weight;
    }
    return candidates[candidates.length - 1]; // 부동소수 오차 방어
  }

  window.BattleEncounters = {
    BATTLE_MONSTER_POOLS,
    RARE_THRESHOLD,
    spawnEnemies,
    computePoolProbabilities,
    getMonsterTable,
    setMonsterRoster,
  };
})();
