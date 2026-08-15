// "???"의 집속 마력 임계값 발동(Vortex Overload/Thunder Storm)에 쓰이는
// MY_PERSONAL_RESOURCE_COMPARE 조건과 drainPersonalResource 효과 검증.
const { BattleCharacter } = require("./src/character");
const { ConditionRegistry } = require("./src/registries");
const { applyEffect } = require("./src/skillResolution");

console.log("==================================================");
console.log("MY_PERSONAL_RESOURCE_COMPARE / drainPersonalResource");
console.log("==================================================");

const boss = new BattleCharacter("???", "enemy", { str: 10, int: 10, dex: 10, spd: 10, luk: 10 });
boss.personalResources.focusMana = { current: 0, max: 1000 };

console.log("\n[1] 집속 마력 0일 때 500/1000 임계값 — 둘 다 false");
{
  const at500 = ConditionRegistry.check("MY_PERSONAL_RESOURCE_COMPARE", boss, {}, { resource: "focusMana", comparator: "gte", threshold: 500 });
  const at1000 = ConditionRegistry.check("MY_PERSONAL_RESOURCE_COMPARE", boss, {}, { resource: "focusMana", comparator: "gte", threshold: 1000 });
  console.log(`  >=500? ${at500} (기대값 false)`, at500 === false ? "✅" : "❌");
  console.log(`  >=1000? ${at1000} (기대값 false)`, at1000 === false ? "✅" : "❌");
}

console.log("\n[2] 집속 마력 500일 때 — 500 임계값만 true, 1000은 false");
{
  boss.personalResources.focusMana.current = 500;
  const at500 = ConditionRegistry.check("MY_PERSONAL_RESOURCE_COMPARE", boss, {}, { resource: "focusMana", comparator: "gte", threshold: 500 });
  const at1000 = ConditionRegistry.check("MY_PERSONAL_RESOURCE_COMPARE", boss, {}, { resource: "focusMana", comparator: "gte", threshold: 1000 });
  console.log(`  >=500? ${at500} (기대값 true)`, at500 === true ? "✅" : "❌");
  console.log(`  >=1000? ${at1000} (기대값 false)`, at1000 === false ? "✅" : "❌");
}

console.log("\n[3] 집속 마력 1000일 때 — 둘 다 true");
{
  boss.personalResources.focusMana.current = 1000;
  const at500 = ConditionRegistry.check("MY_PERSONAL_RESOURCE_COMPARE", boss, {}, { resource: "focusMana", comparator: "gte", threshold: 500 });
  const at1000 = ConditionRegistry.check("MY_PERSONAL_RESOURCE_COMPARE", boss, {}, { resource: "focusMana", comparator: "gte", threshold: 1000 });
  console.log(`  >=500? ${at500} (기대값 true)`, at500 === true ? "✅" : "❌");
  console.log(`  >=1000? ${at1000} (기대값 true)`, at1000 === true ? "✅" : "❌");
}

console.log("\n[4] 자원 자체가 없는 유닛 — false로 안전하게 처리");
{
  const bare = new BattleCharacter("맨몸", "enemy", { str: 10, int: 10, dex: 10, spd: 10, luk: 10 });
  const r = ConditionRegistry.check("MY_PERSONAL_RESOURCE_COMPARE", bare, {}, { resource: "focusMana", comparator: "gte", threshold: 0 });
  console.log(`  ${r} (기대값 false)`, r === false ? "✅" : "❌");
}

console.log("\n[5] drainPersonalResource — Vortex Overload가 costs로 25를 쓴 뒤 나머지를 전부 비우는지");
{
  boss.personalResources.focusMana.current = 1000;
  // costs 파이프라인은 별도(payCosts)이므로 여기선 effects만 검증 — costs에서
  // 25가 빠진 975 상태라고 가정하고 drainPersonalResource가 그걸 0으로 만드는지 확인.
  boss.personalResources.focusMana.current = 975;
  const line = applyEffect(boss, boss, { type: "drainPersonalResource", resource: "focusMana" }, { log: () => {} });
  console.log(`  effect 반환 로그: "${line}"`);
  console.log(`  소진 후 집속 마력: ${boss.personalResources.focusMana.current} (기대값 0)`, boss.personalResources.focusMana.current === 0 ? "✅" : "❌");
}

console.log("\n[6] 몬스터 정의의 personalResources가 battle-adapter를 통해 실제로 심어지는지");
{
  const path = require("path");
  const { loadAdapterEnv } = require("./simulate.js");
  const env = loadAdapterEnv({ baseDir: __dirname });
  const monsterTable = {
    test_boss: {
      id: "test_boss", name: "테스트보스", realStats: { str: 10, int: 10, dex: 10, spd: 10, luk: 10 },
      combatReal: { atk: 10 }, personalResources: { focusMana: { current: 0, max: 1000 } }, patterns: [],
    },
  };
  const enemy = env.BattleAdapter.buildEnemyFromMonsterKey(monsterTable, "test_boss", 0);
  const pool = enemy.personalResources.focusMana;
  console.log(`  pool: ${JSON.stringify(pool)} (기대값 {current:0,max:1000})`, pool && pool.current === 0 && pool.max === 1000 ? "✅" : "❌");
}
