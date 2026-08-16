// ============================================================================
// 임무(퀘스트) 정의 테이블 — 모험가 길드(guild.html)가 읽어서 렌더링.
//
// battle-themes.js/battle-encounters.js와 같은 이유·같은 패턴으로 별도 파일로
// 분리(지금은 guild.html만 쓰지만, 다른 페이지도 참조할 일이 생길 수 있음).
//
// 진행 방식(2026-08-17 결정): "수락" 단계 없음 — 항상 전체 임무 목록을 보여
// 주고, 조건을 충족한 순간부터 "완료" 버튼이 활성화된다. 수락 상태를 따로
// 추적하지 않으므로 서버에 저장하는 건 "몇 번 완료했는지 / 언제 완료했는지"
// (quest_progress 테이블) 뿐 — 조건 충족 여부는 매번 즉석 계산.
//
// type: "battleClear" | "itemTurnIn"
//   - battleClear: target.battleId를 클리어하면 조건 충족. 반복 가능
//     (repeatable:true) 임무는 "마지막 완료 이후 그 전투를 다시 클리어했는가"
//     로 판정한다(battle_progress.cleared_at이 quest_progress.last_completed_at
//     보다 나중인지 비교) — 클리어 기록 자체는 계속 남아있는 boolean이라,
//     매번 "다시 깼는지"를 구분하려면 시각 비교가 필요함.
//   - itemTurnIn: target.itemName을 target.quantity개 이상 갖고 있으면 조건
//     충족. 완료 시 그만큼 소모함(부족하면 완료 불가).
//
// repeatable: false면 완료 이력(completed_count > 0)이 있으면 그 뒤로는
//   영구히 "완료됨"으로 표시되고 다시 수행할 수 없음.
//
// rewards: [{ type:"gold", amount } | { type:"item", name, category, quantity, ...spec }]
//   item 보상은 warehouse_items에 그대로 들어갈 나머지 필드(예: 장비라면
//   combatReal 등)를 spec에 얹어서 표현한다 — shop.html 구매 로직과 동일한
//   "카탈로그 필드 spread" 방식.
//
// 동굴(1티어) 입장키 임무는 동굴 던전 설계가 끝난 뒤 여기에 추가할 예정
// (CLAUDE.md "Tier 설계" 참고) — 지금은 시스템 자체를 검증하기 위한 예시
// 임무 2개(전투 조건형 1개 + 아이템 납품형 1개)만 들어있다.
// ============================================================================
(function () {
  const QUEST_TABLE = [
    {
      id: "goblin-king-bounty",
      name: "고블린 왕 토벌 현상금",
      icon: "👑",
      description: "고블린 왕국 깊은 곳, 고블린의 왕을 처치했다는 소식이 들리면 길드가 현상금을 지급합니다.",
      type: "battleClear",
      target: { battleId: "goblin-king" },
      repeatable: true,
      rewards: [{ type: "gold", amount: 300 }],
    },
    {
      id: "goblin-fang-delivery",
      name: "고블린 이빨 납품",
      icon: "🦷",
      description: "무두질 재료로 쓸 고블린의 이빨을 모아다 주시면 사례하겠습니다.",
      type: "itemTurnIn",
      target: { itemName: "고블린의 이빨", quantity: 5 },
      repeatable: true,
      rewards: [{ type: "gold", amount: 150 }],
    },
  ];

  window.QuestTable = { QUEST_TABLE };
})();
