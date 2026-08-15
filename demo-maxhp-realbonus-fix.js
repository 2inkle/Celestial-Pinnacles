// "생명의 반지"/"마나의 반지"류 장비의 maxHpBonus/maxSpBonus가 resetForBattle()에
// 지워지던 버그 수정 검증. 레벨30 벤치마크 파티를 만들다가 실측으로 발견함 —
// 엔진 생성(new BattleEngine) 전에는 정상 반영됐다가, 생성 직후 0으로
// 되돌아가는 것을 직접 확인했었음.
const { BattleCharacter } = require("./src/character");
const { BattleEngine } = require("./src/engine");

console.log("==================================================");
console.log("maxHpRealBonus/maxSpRealBonus — 장비발 Max HP/SP 보너스가");
console.log("resetForBattle() 이후에도 살아남는지");
console.log("==================================================");

const ally = new BattleCharacter("테스트캐릭터", "ally", { str: 10, int: 10, dex: 10, spd: 10, luk: 10 });
ally.maxHpRealBonus = 200; // "생명의 반지" 장착 시뮬레이션(어댑터가 하는 것과 동일)
ally.maxSpRealBonus = 150; // "마나의 반지"

console.log(`\n[1] BattleEngine 생성 전 — maxHp: ${ally.maxHp} (기대값 600 = 200+10*20+200)`, ally.maxHp === 600 ? "✅" : "❌");
console.log(`  maxSp: ${ally.maxSp} (기대값 300 = 50+10*10+150)`, ally.maxSp === 300 ? "✅" : "❌");

const enemy = new BattleCharacter("더미", "enemy", { str: 10, int: 10, dex: 10, spd: 10, luk: 10 });
const engine = new BattleEngine([ally], [enemy], () => {});

console.log(`\n[2] BattleEngine 생성(resetForBattle 실행) 후`);
console.log(`  maxHp: ${ally.maxHp} (기대값 600, 장비발 보너스가 살아남아야 함)`, ally.maxHp === 600 ? "✅" : "❌");
console.log(`  maxSp: ${ally.maxSp} (기대값 300)`, ally.maxSp === 300 ? "✅" : "❌");
console.log(`  currentHp가 maxHp로 초기화됨: ${ally.currentHp} (기대값 600)`, ally.currentHp === 600 ? "✅" : "❌");

console.log(`\n[3] 전투 중 버프(maxHpUp 등)는 여전히 매 전투 시작 시 0으로 리셋되는지(transient 필드 회귀 확인)`);
ally.maxHpBonus = 999; // 전투 중 걸렸던 버프를 흉내
const engine2 = new BattleEngine([ally], [enemy], () => {});
console.log(`  reset 후 maxHpBonus(transient): ${ally.maxHpBonus} (기대값 0)`, ally.maxHpBonus === 0 ? "✅" : "❌");
console.log(`  reset 후에도 maxHpRealBonus(장비발)는 그대로: ${ally.maxHpRealBonus} (기대값 200)`, ally.maxHpRealBonus === 200 ? "✅" : "❌");
console.log(`  최종 maxHp: ${ally.maxHp} (기대값 600, 999는 사라지고 200은 남음)`, ally.maxHp === 600 ? "✅" : "❌");
