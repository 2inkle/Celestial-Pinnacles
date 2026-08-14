// ============================================================================
// Mock DB (실제로는 SQL/NoSQL로 대체될 데이터 계층)
//
// 스키마 요약:
//   characters          : character_id, user_id, name, side, real_str/int/dex/spd/luk
//   items               : item_id, name, slot, str_bonus/int_bonus/dex_bonus/spd_bonus/luk_bonus
//   character_equipment : character_id, slot, item_id
//   pattern_presets      : preset_id, character_id, preset_name, is_active
//   pattern_slots        : slot_id, preset_id, slot_order, cond_key, cond_val, act_key
// ============================================================================
function createMockDb() {
  return {
    characters: [],
    items: [],
    character_equipment: [],
    pattern_presets: [],
    pattern_slots: [],

    getCharacter(characterId) {
      return this.characters.find((c) => c.character_id === characterId);
    },

    getEquipment(characterId) {
      return this.character_equipment
        .filter((e) => e.character_id === characterId)
        .map((e) => ({ ...e, item: this.items.find((i) => i.item_id === e.item_id) }));
    },

    getActivePreset(characterId) {
      return this.pattern_presets.find((p) => p.character_id === characterId && p.is_active);
    },

    getPatternSlots(presetId) {
      return this.pattern_slots.filter((s) => s.preset_id === presetId).sort((a, b) => a.slot_order - b.slot_order);
    },
  };
}

// ----------------------------------------------------------------------------
// 데모용 시드 데이터
// ----------------------------------------------------------------------------
function seedDemoData(db) {
  db.characters.push(
    { character_id: 1, user_id: 1001, name: "전략가 메를린", side: "ally", real_str: 10, real_int: 30, real_dex: 10, real_spd: 25, real_luk: 10 },
    { character_id: 2, user_id: 1001, name: "고속 연금술사", side: "ally", real_str: 15, real_int: 20, real_dex: 15, real_spd: 60, real_luk: 15 },
    { character_id: 3, user_id: 1001, name: "강철 오크 보스", side: "enemy", real_str: 100, real_int: 10, real_dex: 10, real_spd: 25, real_luk: 5 }
  );

  db.items.push(
    { item_id: 100, name: "현자의 지팡이", slot: "weapon", int_bonus: 15 },
    { item_id: 101, name: "연금술사의 장갑", slot: "gloves", dex_bonus: 5, spd_bonus: 10 }
  );

  db.character_equipment.push(
    { character_id: 1, slot: "weapon", item_id: 100 },
    { character_id: 2, slot: "gloves", item_id: 101 }
  );

  db.pattern_presets.push(
    { preset_id: 10, character_id: 1, preset_name: "기본형", is_active: true },
    { preset_id: 20, character_id: 2, preset_name: "폭발 콤보", is_active: true },
    { preset_id: 30, character_id: 3, preset_name: "기본 AI", is_active: true }
  );

  db.pattern_slots.push(
    // 메를린 (INT 30 -> maxPatternSlots = 1 + floor(30/10) = 4개, 아래 4줄 전부 활성)
    { slot_id: 1, preset_id: 10, slot_order: 1, cond_key: "MY_HP_LESS_THAN_PCT", cond_val: 30, act_key: "USE_POTION" },
    { slot_id: 2, preset_id: 10, slot_order: 2, cond_key: "FACTION_RESOURCE_GREATER_THAN", cond_val: 3, act_key: "DETONATE_MAGIC_CIRCLE" },
    { slot_id: 3, preset_id: 10, slot_order: 3, cond_key: "ALWAYS", cond_val: 0, act_key: "CREATE_MAGIC_CIRCLE" },
    { slot_id: 4, preset_id: 10, slot_order: 4, cond_key: "ALWAYS", cond_val: 0, act_key: "ATTACK" },

    // 고속 연금술사 (INT 20 -> maxPatternSlots = 3개, 아래 3줄 전부 활성)
    { slot_id: 5, preset_id: 20, slot_order: 1, cond_key: "FACTION_RESOURCE_GREATER_THAN", cond_val: 3, act_key: "DETONATE_MAGIC_CIRCLE" },
    { slot_id: 6, preset_id: 20, slot_order: 2, cond_key: "MY_HP_LESS_THAN_PCT", cond_val: 30, act_key: "USE_POTION" },
    { slot_id: 7, preset_id: 20, slot_order: 3, cond_key: "ALWAYS", cond_val: 0, act_key: "ATTACK" },

    // 강철 오크 보스 (INT 10 -> maxPatternSlots = 2개, 3번째 줄은 초과분으로 절삭됨)
    { slot_id: 8, preset_id: 30, slot_order: 1, cond_key: "ALWAYS", cond_val: 0, act_key: "ATTACK" },
    { slot_id: 9, preset_id: 30, slot_order: 2, cond_key: "MY_HP_LESS_THAN_PCT", cond_val: 50, act_key: "USE_POTION" },
    { slot_id: 10, preset_id: 30, slot_order: 3, cond_key: "ALWAYS", cond_val: 0, act_key: "CREATE_MAGIC_CIRCLE" }
  );

  return db;
}

module.exports = { createMockDb, seedDemoData };
