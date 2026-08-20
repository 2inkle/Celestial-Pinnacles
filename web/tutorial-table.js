// ============================================================================
// 튜토리얼(길잡이) 단계 정의 — 홈 화면(roster-index.html) 패널이 읽어서 렌더링.
//
// battle-themes.js / quest-table.js와 같은 정적 테이블 패턴.
// 임무 시스템(quest-table.js)과는 **별개**다 — 임무는 길드에서 반복 수행하는
// 콘텐츠이고, 이건 "계정을 막 만든 사람이 처음 5분에 뭘 해야 하는지"를
// 홈 화면에서 바로 보여주는 온보딩 전용이다(신규 유저는 길드까지 찾아가지 못함).
//
// ── 조건 판정 ────────────────────────────────────────────────────────────────
// 조건은 별도 추적 테이블 없이 기존 데이터에서 매번 즉석 계산한다
// (quest_progress와 같은 방침). 프레임워크가 지원하는 condition.type 4종:
//
//   hasCharacter      보유 캐릭터가 count명 이상        ← characters
//   hasEquippedItem   장착(held_by) 중인 장비가 count개 이상 ← warehouse_items
//   hasPatternRows    어느 캐릭터든 전투 프리셋 행이 count줄 이상 ← characters.presets
//   hasClearedBattle  클리어한 전투가 count개 이상       ← battle_progress
//
// 새 조건 종류가 필요하면 여기 주석에 한 줄 추가하고 roster-index.html의
// evaluateStep()에 분기를 더하면 된다.
//
// ── 보상 ─────────────────────────────────────────────────────────────────────
// rewards는 quest-table.js와 **완전히 같은 형식**이다(카탈로그 필드 spread):
//   { type: "gold", amount: 500 }
//   { type: "item", name, category, quantity, ...나머지 장비 스펙 }
// 수령은 버튼 클릭 방식이고, 수령 여부만 profiles.tutorial_state에 기록된다
// (0022 마이그레이션). 조건을 다시 만족해도 한 번만 받을 수 있다.
//
// ── 초심자 세트 지급에 대하여 ────────────────────────────────────────────────
// 초심자 세트 3종(중갑/경갑/천옷)은 자동 지급이 아니라 이 튜토리얼을 따라가며
// 순차적으로 얻는다. 세트 효과는 web/item-sets.js의 beginner_* 항목이 정의하고,
// 여기서는 "그 setId를 가진 장비 아이템"을 보상으로 지급하기만 하면 된다.
//
// 세트 ↔ 장비 타입 매핑(확정):
//   · 중갑 세트 = setId "beginner_plate"   / armor 슬롯 equipmentType "armor"
//     → 전사 계열만 착용 가능(실 DB의 allowedEquipmentTypes 기준)
//   · 경갑 세트 = setId "beginner_leather" / armor 슬롯 equipmentType "cloth"
//     → 전 직업 착용 가능
//   · 천옷 세트 = setId "beginner_robe"    / armor 슬롯 equipmentType "robe"
//     → 전 직업 착용 가능
//   머리는 중갑만 helm, 나머지는 cap. 신발은 셋 다 shoes(타입이 하나뿐).
//
// 무게는 가볍게 잡을 것 — DEX 10 신규 캐릭터의 무게 상한이 7이라, 세트 3부위
// 합계가 3~4를 넘으면 무기를 못 들어서 "왜 장착이 안 되지?"로 또 막힌다.
//
// 강화·개조 불가:
//   · enhanceable을 아예 안 붙이면 강화 불가(refinery.html이 opt-in 방식).
//   · modifiable: false면 조합공방 개조 목록에서 제외(0022에서 추가한 컬럼).
//
// ⚠⚠ 아래 단계 구성·문구·보상 수치는 전부 자리표시자입니다 ⚠⚠
//     사용자가 직접 채울 내용이며, 이 배열만 고치면 화면에 그대로 반영됩니다.
// ============================================================================
(function () {
  // 초심자 세트 장비 한 부위를 만드는 헬퍼 — 세 세트가 부위 구성은 같고
  // setId/equipmentType/이름만 다르므로 중복을 줄임.
  // ⚠ combatReal / weight는 자리표시자(0). 사용자가 확정할 값.
  function beginnerPiece({ name, setId, slot, equipmentType, combatReal, weight }) {
    return {
      type: "item",
      name,
      category: "equipment",
      quantity: 1,
      slot,
      equipmentType,
      setId,
      combatReal: combatReal || {},   // TODO: 사용자가 확정
      weight: weight ?? 0,            // TODO: 사용자가 확정 (세트 합계 3~4 권장)
      modifiable: false,              // 개조 불가
      // enhanceable을 일부러 넣지 않음 → 강화 불가
    };
  }

  // 세트 한 벌(갑옷·머리·신발 3부위)을 한 번에 만드는 헬퍼.
  function beginnerSet({ setId, label, armorType, headType }) {
    return [
      beginnerPiece({ name: `초심자 ${label} 갑옷`, setId, slot: "armor", equipmentType: armorType }),
      beginnerPiece({ name: `초심자 ${label} 투구`, setId, slot: "head",  equipmentType: headType }),
      beginnerPiece({ name: `초심자 ${label} 신발`, setId, slot: "shoes", equipmentType: "shoes" }),
    ];
  }

  const TUTORIAL_STEPS = [
    {
      id: "hire-first",
      icon: "🧑‍🌾",
      title: "TODO — 첫 용병 고용하기",
      description: "TODO — 왜 이걸 해야 하는지, 어디로 가면 되는지 한두 줄로.",
      linkHref: "village.html",
      linkLabel: "마을로 이동 →",
      condition: { type: "hasCharacter", count: 1 },
      rewards: beginnerSet({ setId: "beginner_leather", label: "경갑", armorType: "cloth", headType: "cap" }),
    },
    {
      id: "equip-first",
      icon: "🛡️",
      title: "TODO — 장비 장착하기",
      description: "TODO",
      linkHref: "roster-index.html",
      linkLabel: "용병단 보기 →",
      condition: { type: "hasEquippedItem", count: 1 },
      rewards: beginnerSet({ setId: "beginner_robe", label: "천옷", armorType: "robe", headType: "cap" }),
    },
    {
      id: "make-pattern",
      icon: "🧩",
      title: "TODO — 전투 패턴 짜기",
      description: "TODO",
      linkHref: "roster-index.html",
      linkLabel: "용병단 보기 →",
      condition: { type: "hasPatternRows", count: 2 },
      rewards: beginnerSet({ setId: "beginner_plate", label: "중갑", armorType: "armor", headType: "helm" }),
    },
    {
      id: "first-victory",
      icon: "⚔️",
      title: "TODO — 첫 전투에서 승리하기",
      description: "TODO",
      linkHref: "battle-select.html",
      linkLabel: "전투 선택 →",
      condition: { type: "hasClearedBattle", count: 1 },
      rewards: [{ type: "gold", amount: 0 }], // TODO: 사용자가 확정
    },
  ];

  window.TutorialTable = { TUTORIAL_STEPS };
})();
