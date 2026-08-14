const { BattleCharacter } = require("./src/character");
const { computeSkillPower } = require("./src/combatFormulas");
const { PrepState } = require("./src/prepState");

// ============================================================================
// 1) Physical(STR) / Physical(INT) / Magic(INT) — 공식 하나로 다 처리되는지 확인
//    power = 공격력(Physical=atk, Magic=matk) × 스탯(skill.stat) × 계수
// ============================================================================
console.log("==================================================");
console.log("1) 공격력×스탯×계수 공식 검증 (Physical=atk, Magic=matk)");
console.log("==================================================");

const swordsman = new BattleCharacter("검사 예제", "ally", { str: 15, int: 10 });
swordsman.realAtk = 10; // 장비에서만 오는 공격력(전적으로 장비 의존, 기본 0)

const spellblade = new BattleCharacter("스펠블레이드 예제", "ally", { str: 10, int: 20 });
spellblade.realAtk = 10;

const mage = new BattleCharacter("마도사 예제", "ally", { str: 10, int: 20 });
mage.realMatk = 12; // 마법 공격력도 마찬가지로 장비 전용

const physicalStrSkill = { name: "베기", skillType: "physical", stat: "str", coefficient: 2.0 };
const physicalIntSkill = { name: "마력검", skillType: "physical", stat: "int", coefficient: 2.0 };
const magicIntSkill = { name: "파이어볼", skillType: "magic", stat: "int", coefficient: 1.5 };

const powerA = computeSkillPower(swordsman, physicalStrSkill);
const powerB = computeSkillPower(spellblade, physicalIntSkill);
const powerC = computeSkillPower(mage, magicIntSkill);

console.log(`검사(STR ${swordsman.effectiveStr}, atk ${swordsman.effectiveAtk}) "베기"(Physical, stat:str) 위력`);
console.log(`   = atk(${swordsman.effectiveAtk}) × STR(${swordsman.effectiveStr}) × 2.0 = ${powerA}`);

console.log(`스펠블레이드(INT ${spellblade.effectiveInt}, atk ${spellblade.effectiveAtk}) "마력검"(Physical, stat:int) 위력`);
console.log(`   = atk(${spellblade.effectiveAtk}) × INT(${spellblade.effectiveInt}) × 2.0 = ${powerB}`);

console.log(`마도사(INT ${mage.effectiveInt}, matk ${mage.effectiveMatk}) "파이어볼"(Magic, stat:int) 위력`);
console.log(`   = matk(${mage.effectiveMatk}) × INT(${mage.effectiveInt}) × 1.5 = ${powerC}`);

console.log(`\n같은 computeSkillPower() 함수 하나로 세 경우 다 처리됨 — skillType/stat만 다름. ✅`);

// 맨몸(장비 없음) 확인: atk/matk가 0이면 곱셈이라 위력도 반드시 0
const unequipped = new BattleCharacter("맨몸 예제", "ally", { str: 20 });
const unequippedPower = computeSkillPower(unequipped, physicalStrSkill); // atk 미설정 -> 0
console.log(`\n장비 없는 캐릭터(STR ${unequipped.effectiveStr}, atk 미설정)의 "베기" 위력 = ${unequippedPower} (맨몸이면 항상 0)`);


// ============================================================================
// 2) "목 노리기" 시나리오 재현
//    B: 300틱에 선딜레이 300틱짜리 영창(casting) 스킬 시전 시작 (원래 600틱에 발동)
//    A: 400틱에 "목 노리기" 사용 — targetFaction:enemy, targetCount:single,
//       skillType:physical, effect: 대상이 casting 상태면 Delay +105%
//    기대 결과: B의 발동 예정 시점이 600틱 -> 915틱으로 밀림 (300 × 1.05 = 315틱 추가)
// ============================================================================
console.log("\n==================================================");
console.log('2) "목 노리기" 시나리오 재현');
console.log("==================================================");

const prep = new PrepState();

// B가 300틱에 캐스팅형 스킬 사용 시작
const bCastSkill = { name: "???(영창 스킬)", preDelay: 300, preDelayType: "casting" };
const bRecord = prep.begin("B", bCastSkill, 300);
console.log(`\n[300틱] B, "${bCastSkill.name}" 시전 시작 (선딜레이 ${bCastSkill.preDelay}틱, preDelayType: ${bCastSkill.preDelayType})`);
console.log(`        -> 원래 발동 예정: ${bRecord.readyAtTick}틱`);

// A가 400틱에 "목 노리기" 사용 — 로열가드 직업, target:enemy/single, skillType:physical
const throatStrike = {
  name: "목 노리기",
  job: "로열가드",
  targetFaction: "enemy",
  targetCount: "single",
  skillType: "physical",
  effects: [{ type: "castDelay", requiresPreDelayType: "casting", value: 105 }],
};

console.log(`\n[400틱] A(로열가드), "${throatStrike.name}" 사용 -> 대상: B (targetFaction:${throatStrike.targetFaction}, targetCount:${throatStrike.targetCount})`);
console.log(`        패턴 조건: "영창 중인 상대가 있을 경우 반드시 목 노리기 사용" 충족 -> 발동`);

const effect = throatStrike.effects[0];
const result = prep.applyDelayEffect("B", effect);

if (result.applied) {
  console.log(`\n효과 "${effect.type}" 적용됨 (조건: 대상이 preDelayType="${effect.requiresPreDelayType}" 상태 -> 충족)`);
  console.log(`   추가 지연 = 원래 선딜레이(${bRecord.originalPreDelay}) × ${effect.value}% = ${result.addedDelay}틱`);
  console.log(`   B의 발동 예정 시점: ${result.beforeTick}틱 -> ${result.afterTick}틱`);
} else {
  console.log(`\n효과 적용 안 됨: ${result.reason}`);
}

const expected = 915;
console.log(`\n검증: ${result.afterTick}틱 === ${expected}틱 ? ${result.afterTick === expected ? "✅ 일치" : "❌ 불일치"}`);

// ============================================================================
// 3) 대조군 — 조건이 안 맞으면 효과가 불발하는지 확인 (오탐 방지 검증)
// ============================================================================
console.log("\n==================================================");
console.log("3) 대조군: 조건 불만족 시 효과 불발 확인");
console.log("==================================================");

// 3-1) 대상이 action 상태인데 castDelay(casting 전용)를 시도 -> 불발해야 함
const prep2 = new PrepState();
const cRecord = prep2.begin("C", { name: "찌르기 준비", preDelay: 200, preDelayType: "action" }, 100);
const mismatch = prep2.applyDelayEffect("C", { requiresPreDelayType: "casting", value: 105 });
console.log(`\nC는 action 상태인데 castDelay(casting 전용) 시도 -> applied: ${mismatch.applied} (${mismatch.reason})`);
console.log(`   기대: 불발 -> ${mismatch.applied === false ? "✅ 정상" : "❌ 오작동"}`);

// 3-2) 대상이 아예 준비 중이 아닌데 효과를 걸려는 경우 -> 불발해야 함
const noTarget = prep2.applyDelayEffect("D", { requiresPreDelayType: "casting", value: 105 });
console.log(`\nD는 아무 것도 준비 중이지 않은데 castDelay 시도 -> applied: ${noTarget.applied} (${noTarget.reason})`);
console.log(`   기대: 불발 -> ${noTarget.applied === false ? "✅ 정상" : "❌ 오작동"}`);
