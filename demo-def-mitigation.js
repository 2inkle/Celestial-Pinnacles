const { BattleCharacter } = require("./src/character");

console.log("==================================================");
console.log("1) 예시 그대로 검증 — realDEF 20 vs 30, 100 데미지");
console.log("==================================================");

const def20 = new BattleCharacter("방어20", "ally", {});
def20.realDef = 20;
const applied20 = def20.takeDamage(100);
console.log(`realDef 20 대상이 100 데미지 받음 -> 실제 적용: ${applied20} (기대 80)`, applied20 === 80 ? "✅" : "❌");

const def30 = new BattleCharacter("방어30", "ally", {});
def30.realDef = 30;
const applied30 = def30.takeDamage(100);
console.log(`realDef 30 대상이 100 데미지 받음 -> 실제 적용: ${applied30} (기대 70)`, applied30 === 70 ? "✅" : "❌");

console.log("\n==================================================");
console.log("2) realDef는 전투 중 절대 안 변함 확인");
console.log("==================================================");

const guy = new BattleCharacter("확인용", "ally", {});
guy.realDef = 25;
console.log("최초 realDef:", guy.realDef);
guy.bonusDef += 999;
guy.takeDamage(50);
guy.takeDamage(9999);
console.log("버프/피격 여러 번 겪은 뒤 realDef:", guy.realDef, guy.realDef === 25 ? "✅ 안 변함" : "❌ 변함");

console.log("\n==================================================");
console.log("3) bonusDef(버프)의 절대값 감소 — realDef가 깎고 남은 데미지에 적용");
console.log("==================================================");

const buffed = new BattleCharacter("버프방어", "ally", {});
buffed.realDef = 20;
buffed.bonusDef += 15;
const appliedBuffed = buffed.takeDamage(100);
console.log(`realDef 20(퍼센트) + bonusDef 15(절대값) 적용 -> ${appliedBuffed} (기대 65 = 80-15)`, appliedBuffed === 65 ? "✅" : "❌");

console.log("\n==================================================");
console.log("4) bonusDef도 상/하한 규칙(real의 50%~5000%) 적용되는지");
console.log("==================================================");

const overBuffed = new BattleCharacter("과버프방어", "ally", { str: 100 }); // HP 충분히(maxHp 2200) 확보 — 데미지 자체를 순수하게 확인하기 위함
overBuffed.realDef = 10;
overBuffed.bonusDef += 100000;
console.log("effectiveDef(클램프 적용됨):", overBuffed.effectiveDef, "(기대 상한 10*50=500)", overBuffed.effectiveDef === 500 ? "✅" : "❌");
const appliedOver = overBuffed.takeDamage(1000);
console.log(`극단적 버프 상황 데미지 적용: ${appliedOver} (기대 410 = 900 - (500-10))`, appliedOver === 410 ? "✅" : "❌");

console.log("\n==================================================");
console.log("5) ATK/MATK도 real/bonus/effective 구조 + 상한 클램프 확인");
console.log("==================================================");

const attacker = new BattleCharacter("공격자", "ally", {});
attacker.realAtk = 10;
console.log("bonusAtk 0일 때 effectiveAtk:", attacker.effectiveAtk, "(기대 10)");
attacker.bonusAtk += 1000;
console.log("bonusAtk +1000 후 effectiveAtk:", attacker.effectiveAtk, "(기대 상한 10*50=500)", attacker.effectiveAtk === 500 ? "✅" : "❌");
