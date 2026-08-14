const { BattleCharacter } = require("./src/character");
const { BattleEngine } = require("./src/engine");
const { checkAffordability, payCosts } = require("./src/prepState");

// ============================================================================
// 1) BattleEngine이 TEAM_RESOURCE_TYPES 레지스트리 기반으로 팀 자원을 자동
//    등록하고, 진영별로 독립적으로 관리되는지 확인
// ============================================================================
console.log("==================================================");
console.log("1) 팀 자원 자동 등록 및 진영 독립성 검증");
console.log("==================================================");

const ally = new BattleCharacter("아군 A", "ally");
const enemy = new BattleCharacter("적군 B", "enemy");
const engine = new BattleEngine([ally], [enemy], () => {}); // 로그 조용히

console.log("\nBattleEngine이 자동 등록한 ally 진영 팀 자원:");
console.log("  마법진(MAGIC_CIRCLE):", engine.resourceManager.getResource("ally", "MAGIC_CIRCLE"));

engine.resourceManager.addResource("ally", "MAGIC_CIRCLE", 5, () => {});
console.log("  마법진 +5 후:", engine.resourceManager.getResource("ally", "MAGIC_CIRCLE"), "(기대 5)");
console.log("  enemy 진영 마법진(별도 진영이라 영향 없어야 함):", engine.resourceManager.getResource("enemy", "MAGIC_CIRCLE"), "(기대 0)");

// ============================================================================
// 2) 개인 자원(화살) 코스트 확인/소모 검증
// ============================================================================
console.log("\n==================================================");
console.log("2) 개인 자원(화살) 코스트 검증");
console.log("==================================================");

const archer = new BattleCharacter("궁수 C", "ally", { dex: 15 });
archer.personalResources = { arrows: { current: 3, max: 20 } };

const arrowSkill = {
  name: "필살의 화살",
  stat: "dex", coefficient: 2.2,
  costs: [{ type: "sp", amount: 15 }, { type: "personalResource", resource: "arrows", amount: 1 }],
};

console.log(`\n궁수 C, 화살 ${archer.personalResources.arrows.current}/${archer.personalResources.arrows.max} 보유`);

for (let i = 1; i <= 4; i++) {
  const affordability = checkAffordability(archer, arrowSkill.costs, null);
  console.log(`\n${i}번째 "필살의 화살" 시도 -> 감당 가능? ${affordability.ok}${affordability.ok ? "" : ` (${affordability.detail})`}`);
  if (affordability.ok) {
    payCosts(archer, arrowSkill.costs, null);
    console.log(`   소모 후 화살: ${archer.personalResources.arrows.current}/${archer.personalResources.arrows.max}`);
  }
}

console.log(`\n검증: 3발만 있었으니 3번은 성공, 4번째는 실패해야 함 -> ${archer.personalResources.arrows.current === 0 ? "✅ 화살 0으로 정확히 소진" : "❌ 불일치"}`);
