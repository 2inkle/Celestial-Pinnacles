// ============================================================================
// 아이템 시리즈(세트) 테이블 — 공용 모듈.
//
// 같은 setId 장비를 몇 개 장착했는지에 따라 문턱값(thresholds)마다 추가 보너스가
// 붙음. 아이템 하나의 속성이 아니라 "장착 조합"에 대한 규칙이라 개별 아이템
// 데이터(상점/창고)와는 별개로 관리함.
//
// 2026-08-20 공용화 배경: 원래 이 테이블은 character-sheet.html 안에만 있었고,
// 세트 보너스 계산도 그 파일 안에서만 이뤄졌다. 그래서 battle-adapter.js의
// sumEquipmentCombatStats()는 setId를 아예 안 봤고 — **세트 보너스가 캐릭터
// 시트에만 표시되고 실제 전투에는 전혀 반영되지 않았다**(오래 미해결로 남아있던
// 항목이자, 고블린 왕관 세트 설계가 막혀 있던 원인). battle-themes.js /
// battle-log-render.js와 같은 패턴으로 공용 파일로 빼서 양쪽이 같은 정의를
// 쓰도록 함.
//
// ⚠ 이 파일을 새로 로드해야 하는 곳: 세트 보너스를 계산하는 모든 페이지
//   (character-sheet / roster-index / item / battle-view / dispatch)와
//   simulate.js의 loadAdapterEnv() vm 파일 목록. 한 군데라도 빠지면 그 경로만
//   조용히 세트 없이 계산된다(스킬 테이블에서 이미 같은 사고를 겪었음).
//
// 지원 필드(threshold 하나가 가질 수 있는 것):
//   statBonus        {str,int,dex,spd,luk} — bonus형 핵심 스탯
//   statRealBonus    {str,int,dex,spd,luk} — real형 핵심 스탯(잠재치 자체)
//   combatReal       {atk,matk,def,mdef}   — real형 전투 수치
//   maxHpBonus / maxSpBonus                — 최대 HP/SP
//   passiveBonus     PASSIVE_MOD_KEYS 계열 % 보정(battle-adapter.js 참고)
//   spRegenPerTurn   매 턴 SP 회복량(2026-08-20 신설, 아래 참고)
//   patternSlotBonus 패턴 슬롯 수 — 캐릭터 시트 전용(엔진은 임포트 시점에 이미 적용받음)
//   description      화면에 그대로 노출되는 설명 문구
//
// spRegenPerTurn 메모: 엔진에는 "장비발 SP 재생" 패시브 키가 없지만, 매 턴
// HP/SP를 증감시키는 activeTicks/processActiveTicks(src/engine.js)가 이미 있다.
// battle-adapter.js가 이 값을 영구 틱(remainingTicks: Infinity)으로 심어주는
// 방식이라 엔진 수정이 필요 없음.
// ============================================================================
(function () {
  const ITEM_SET_TABLE = {
    sage_series: {
      name: "현자의 시리즈",
      thresholds: [
        { count: 2, statBonus: { int: 5 }, description: "INT +5" },
        { count: 4, combatReal: { matk: 6 }, patternSlotBonus: 1, description: "realMATK +6, 패턴 슬롯 +1" }
      ]
    },
    // 왕관 조각을 소재로 넣어 제작/개조한 장비에 자동으로 붙는 세트.
    // 소재 하나로 세트가 결정되므로, 여러 부위를 왕관 조각으로 맞추면
    // 자연스럽게 세트가 완성됨 — 다만 왕관 조각은 왕/섭정에게서만 나오고
    // 부위마다 무게 +1이 붙어서, 전부 맞추려면 DEX 투자가 필요함.
    goblin_crown_series: {
      name: "고블린 왕관 시리즈",
      thresholds: [
        { count: 2, combatReal: { atk: 4, matk: 4 }, description: "realATK +4, realMATK +4" },
        { count: 3, maxHpBonus: 150, description: "MaxHP +150" },
        // 세트 완성 보상 — 잡졸(normal)과 소환체(creature)에게 받는 피해 15% 감소.
        // 소환된 개체는 creatureTier가 creature로 강제 변환되므로, 둘 다 넣어야
        // "잡졸은 함부로 덤비지 못한다"가 실제로 성립함(마차가 뱉는 물량이
        // 정확히 creature라, normal만 걸면 정작 수송대에서 안 통했음).
        { count: 4, statBonus: { str: 4, int: 4 }, patternSlotBonus: 1,
          passiveBonus: {
            damageTakenFrom_normalPct: 10, damageTakenFrom_creaturePct: 10,
            damageDealtTo_normalPct: 10, damageDealtTo_creaturePct: 10,
          },
          description: "STR +4, INT +4, 패턴 슬롯 +1, 일반·소환체에게 주는 피해 +10% / 받는 피해 -10%" }
      ]
    },

    // ========================================================================
    // 초심자 세트 3종 (2026-08-20 신설) — 튜토리얼을 따라가며 순차적으로 지급됨.
    //
    // 설계 확정 사항:
    //   · 세 세트 모두 **완전히 동일한 세트 효과**를 가짐(무게 등급만 다름).
    //   · 효과 방향: 최대 HP 증가 · 최대 SP 증가 · SP 재생 — 체감될 만큼
    //     직관적이고 강하게. 이것보다 강한 장비를 만들려면 노력이 필요할 정도.
    //   · 강화 불가(enhanceable 미부여) · 개조 불가(modifiable:false).
    //   · 무게 등급: 중갑(armor) / 경갑(cloth) / 천옷(robe) — 각각 탱커·딜러·
    //     힐러가 한 벌씩 입어볼 수 있게 함.
    //
    // ⚠⚠ 아래 수치는 전부 자리표시자입니다. 사용자가 직접 확정할 값 ⚠⚠
    //     세 세트의 thresholds는 반드시 서로 같은 값으로 유지할 것.
    //     참고 기준 — 신규 캐릭터: Max HP 400 / Max SP 150,
    //                생명의 반지(상점 10000G): maxHp +175,
    //                마나의 반지(상점 10000G): maxSp +150,
    //                고블린 왕관 3세트: maxHpBonus 150.
    //     스킬 코스트는 5~90 SP 범위이므로 spRegenPerTurn은 한 자릿수여도
    //     20턴이면 체감이 큼(예: 6이면 20턴에 +120).
    // ========================================================================
    beginner_plate: {
      name: "초심자 중갑",
      thresholds: [
        { count: 2, maxHpBonus: 0, maxSpBonus: 0, description: "TODO — 2세트 효과" },
        { count: 3, maxHpBonus: 0, maxSpBonus: 0, spRegenPerTurn: 0, description: "TODO — 3세트 효과" }
      ]
    },
    beginner_leather: {
      name: "초심자 경갑",
      thresholds: [
        { count: 2, maxHpBonus: 0, maxSpBonus: 0, description: "TODO — 2세트 효과" },
        { count: 3, maxHpBonus: 0, maxSpBonus: 0, spRegenPerTurn: 0, description: "TODO — 3세트 효과" }
      ]
    },
    beginner_robe: {
      name: "초심자 천옷",
      thresholds: [
        { count: 2, maxHpBonus: 0, maxSpBonus: 0, description: "TODO — 2세트 효과" },
        { count: 3, maxHpBonus: 0, maxSpBonus: 0, spRegenPerTurn: 0, description: "TODO — 3세트 효과" }
      ]
    }
    // 새 세트 예시: knight_series: { name:"기사단 시리즈", thresholds:[{count:2, combatReal:{def:5}, description:"realDEF +5"}] }
  };

  // 장착 아이템 배열 → 조건을 만족한 threshold 티어들의 평탄화 배열.
  // 같은 세트의 하위 티어도 함께 포함됨(2세트+3세트 둘 다 적용되는 누적 방식).
  function activeTiersFor(equippedItems) {
    const counts = {};
    (equippedItems || []).forEach((it) => {
      if (!it || !it.setId) return;
      counts[it.setId] = (counts[it.setId] || 0) + 1;
    });

    const active = [];
    Object.entries(counts).forEach(([setId, count]) => {
      const set = ITEM_SET_TABLE[setId];
      if (!set) return;
      set.thresholds.forEach((tier) => {
        if (count >= tier.count) active.push({ setId, setName: set.name, ...tier });
      });
    });
    return active;
  }

  window.ItemSets = { ITEM_SET_TABLE, activeTiersFor };
})();
