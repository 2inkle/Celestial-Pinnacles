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
    // 미스터리 전투(2026-08-16) — 테마명/전투명/등장 몬스터 전부 "???"로 남겨
    // 아무것도 미리 알려주지 않음. roster-select.html의 몬스터 미리보기가
    // 몬스터 데이터의 name/portrait를 그대로 보여주는 구조라, 이 필드
    // 자체를 "???"/"❓"로 두는 것만으로 별도 은폐 코드 없이 안 새어나감
    // (조사 완료 — 확정). "불길한 마력 파편"(고블린 수송대 보물상자의
    // 30% 드랍) 소지가 입장 조건. 몬스터 쪽(BATTLE_MONSTER_POOLS의
    // "unknown-battle", web/monster-roster.html의 "unknown_entity")은
    // 골격만 잡아둔 상태 — 실제 스탯/패턴은 다음에 채울 것.
    {
      id: "unknownEncounter",
      name: "???",
      icon: "❓",
      section: "aftermath",
      battles: [
        { id: "unknown-battle", name: "???", requirements: [
          { type: "consumesItem", value: "불길한 마력 파편" },
        ] },
      ],
    },
    // 동굴(1티어 던전) 1~4층 — 사슬형 몬스터 체인 컨셉(2026-08-24 확정,
    // CLAUDE.md 참고). 5층(보스/AFTERMATH)은 다음 단계에서 별도 추가 예정,
    // 이번엔 1~4층만. 각 층은 "이전 층 이월 축이 드랍한 열쇠"로 게이팅함
    // (goblin-fortress의 hasItem+clearedBattle 조합 패턴 재사용).
    {
      id: "caveTier1",
      name: "축축한 동굴",
      icon: "🕳️",
      section: "dispatch",
      battles: [
        { id: "cave-floor-1", name: "동굴 입구", requirements: [] },
        { id: "cave-floor-2", name: "무너진 통로", requirements: [
          { type: "clearedBattle", value: "cave-floor-1" },
          { type: "hasItem", value: "무너진 통로의 흔적" },
        ] },
        { id: "cave-floor-3", name: "갈라진 균열", requirements: [
          { type: "clearedBattle", value: "cave-floor-2" },
          { type: "hasItem", value: "갈라진 균열의 표식" },
        ] },
        { id: "cave-floor-4", name: "무너지는 천장", requirements: [
          { type: "clearedBattle", value: "cave-floor-3" },
          { type: "hasItem", value: "무너지는 천장의 파편" },
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

  // 이 전투가 속한 테마 객체(section 등 테마 단위 메타데이터를 알아야 할 때).
  function themeOfBattle(battleId) {
    return BATTLE_THEMES.find((t) => (t.battles || []).some((b) => b.id === battleId)) || null;
  }

  // 특수의뢰(AFTERMATH) 구획인지 — section 하나를 단일 진실 공급원으로 삼음.
  // 2026-08-20 신설: 예전엔 roster-select.html이 `AFTERMATH_THEMES =
  // ["goblinAftermath"]`라는 하드코딩 사본을 들고 있었는데, 나중에 추가된
  // unknownEncounter("???")가 그 목록에 빠지면서 "AFTERMATH엔 연습 모드가
  // 없다"는 설계가 조용히 깨져 있었음(???에 연습하기 버튼이 노출됐음).
  // 여기서 파생시키면 새 AFTERMATH 테마를 추가해도 목록 갱신이 필요 없음.
  function isAftermathBattle(battleId) {
    const theme = themeOfBattle(battleId);
    return !!theme && theme.section === "aftermath";
  }

  window.BattleThemes = {
    BATTLE_THEMES,
    findBattleById,
    battleNameById,
    themeOfBattle,
    isAftermathBattle,
  };
})();
