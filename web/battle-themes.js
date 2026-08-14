// ============================================================================
// 던전/전투 정의 테이블 (공용)
//
// battle-select.html(던전 선택 UI)과 dispatch.html(파견 실행, 제목에 전투
// 이름 표시)이 같은 정의를 써야 하므로 별도 파일로 분리함. battle-encounters.js
// (몬스터 편성)와 같은 이유·같은 패턴.
// ============================================================================
(function () {
  // section — 이 테마가 어느 구획에 속하는지.
  //   "dispatch"  파견의뢰(일반). 파견 수주권의 턴 예산으로 반복 파밍하는 곳.
  //               짧고 안정적인 전투 위주라 턴 효율이 곧 보상이 됨.
  //   "aftermath" 특수의뢰. 파견 대상이 아니고 직접 도전해야 함. 입장 조건
  //               (흔적 보유 / 증표 소모 / 요일 / 쿨다운)이 붙고, 대신
  //               여기서만 나오는 특별 보상(유니크·최고 레어도)을 줌.
  //               길고 퍼즐 중심으로 설계해도 턴 예산에 영향을 주지 않음.
  // 생략하면 "dispatch"로 취급.
  const BATTLE_THEMES = [
    {
      id: "goblinVillage",
      name: "고블린 마을",
      icon: "🏚️",
      section: "dispatch",
      battles: [
        { id: "goblin-play", name: "고블린과 놀기", requirements: [] },
        { id: "slightly-strong-goblin", name: "조금 강한 고블린", requirements: [{ type: "clearedBattle", value: "goblin-play" }] },
        { id: "goblin-warriors", name: "고블린 전사들", requirements: [{ type: "clearedBattle", value: "slightly-strong-goblin" }] },
      ],
    },
    {
      id: "goblinKingdom",
      name: "고블린 왕국",
      icon: "🏰",
      section: "dispatch",
      battles: [
        { id: "noble-goblins", name: "고귀한 고블린들", requirements: [{ type: "clearedBattle", value: "goblin-warriors" }] },
        { id: "goblin-fortress", name: "고블린 성채", requirements: [
          { type: "clearedBattle", value: "noble-goblins" },
          { type: "hasItem", value: "고블린 왕국 통행증" },
        ] },
        { id: "goblin-king", name: "고블린의 왕", requirements: [{ type: "clearedBattle", value: "goblin-fortress" }] },
      ],
    },
    {
      id: "goblinAftermath",
      name: "고블린 왕국 · 그 뒤",
      icon: "🕯️",
      section: "aftermath",
      battles: [
        { id: "goblin-cart-raid", name: "고블린 수송대", requirements: [
          { type: "clearedBattle", value: "noble-goblins" },
          { type: "consumesItem", value: "오래된 바퀴 자국" },
          { type: "attemptCooldownHours", value: 0.5 },
        ] },
      ],
    },
    // 새 테마 예시: { id:"forest", name:"저주받은 숲", icon:"🌲", battles:[{id:"forest-1", name:"길 잃은 늑대", requirements:[]}] }
  ];

  function findBattleById(battleId) {
    for (const theme of BATTLE_THEMES) {
      const found = theme.battles.find((b) => b.id === battleId);
      if (found) return found;
    }
    return null;
  }

  function battleNameById(battleId) {
    const found = findBattleById(battleId);
    return found ? found.name : battleId;
  }

  window.BattleThemes = {
    BATTLE_THEMES,
    findBattleById,
    battleNameById,
  };
})();
