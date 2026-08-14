const { BattleCharacter } = require("./src/character");
const { BattleEngine } = require("./src/engine");
const { SkillRegistry } = require("./src/skillRegistry");

// ============================================================================
// SkillRegistry에 이번 시나리오용 스킬 등록
// ============================================================================
SkillRegistry.register({
  name: "목 노리기",
  job: "로열가드",
  targetFaction: "enemy",
  targetCount: "single",
  skillType: "physical",
  stat: "str",
  coefficient: 0, // 순수 컨트롤기 — 데미지 없음, 효과만 적용
  costs: [],
  invalid: true, // 차단 불가 — 보호 규칙 무시하고 실제 영창 중인 대상을 노릴 수 있어야 함
  preDelay: 0,
  preDelayType: "action",
  postDelay: 15,
  effects: [{ type: "castDelay", requiresPreDelayType: "casting", value: 105 }],
});

SkillRegistry.register({
  name: "메테오 낙하",
  job: "마도사",
  targetFaction: "enemy",
  targetCount: "single",
  skillType: "magic",
  stat: "int",
  coefficient: 2.0,
  costs: [{ type: "sp", amount: 30 }],
  preDelay: 300,
  preDelayType: "casting",
  postDelay: 10,
  effects: [],
});

// ============================================================================
// 캐릭터 준비 — A(로열가드): 영창 중인 적을 보면 반드시 목 노리기, 아니면 평타
//              B(마도사, 적): 항상 메테오 낙하 시전
// ============================================================================
const royalGuard = new BattleCharacter("로열가드 A", "ally", { str: 20, spd: 250 });
royalGuard.realAtk = 15;
royalGuard.patternSlots = [
  { cond: "ENEMY_PREPARING_TYPE", val: "casting", act: "목 노리기" },
  { cond: "ALWAYS", val: 0, act: "ATTACK" },
];

const mage = new BattleCharacter("마도사 B", "enemy", { int: 25, spd: 15 });
mage.realMatk = 10;
mage.patternSlots = [{ cond: "ALWAYS", val: 0, act: "메테오 낙하" }];

const engine = new BattleEngine([royalGuard], [mage]);

console.log("==================================================");
console.log("실제 BattleEngine을 통한 통합 검증");
console.log("A: 영창 중인 적이 있으면 반드시 \"목 노리기\", 없으면 평타");
console.log("B: 항상 \"메테오 낙하\"(선딜레이 300틱짜리 영창 스킬) 시전");
console.log("==================================================");

engine.startBattle(3);

// ============================================================================
// 사후 검증 — 로그를 다시 스캔해서 핵심 동작이 실제로 일어났는지 확인
// ============================================================================
// (참고용 재실행: 로그를 배열로 받아서 텍스트 검증)
const capturedLog = [];
const royalGuard2 = new BattleCharacter("로열가드 A", "ally", { str: 20, spd: 250 });
royalGuard2.realAtk = 15;
royalGuard2.patternSlots = [
  { cond: "ENEMY_PREPARING_TYPE", val: "casting", act: "목 노리기" },
  { cond: "ALWAYS", val: 0, act: "ATTACK" },
];
const mage2 = new BattleCharacter("마도사 B", "enemy", { int: 25, spd: 15 });
mage2.realMatk = 10;
mage2.patternSlots = [{ cond: "ALWAYS", val: 0, act: "메테오 낙하" }];

const silentEngine = new BattleEngine([royalGuard2], [mage2], (line) => capturedLog.push(line));
silentEngine.startBattle(3);

const fullLog = capturedLog.join("\n");
const usedThroatStrike = fullLog.includes("목 노리기");
const delayedCast = fullLog.includes("의 선딜레이 +");
const resolved = fullLog.includes('"메테오 낙하" 완성');
const failed = fullLog.includes('"메테오 낙하" 발동 실패');

console.log("\n==================================================");
console.log("사후 검증 (로그 스캔)");
console.log("==================================================");
console.log(`목 노리기가 실제로 발동됨: ${usedThroatStrike ? "✅" : "❌"}`);
console.log(`메테오 낙하의 선딜레이가 실제로 연장됨: ${delayedCast ? "✅" : "❌"}`);
if (resolved) console.log(`메테오 낙하 결과: ✅ 결국 발동 성공(캐스팅 완료)`);
else if (failed) console.log(`메테오 낙하 결과: ❌ 발동 실패로 종결`);
else console.log(`메테오 낙하 결과: ⏳ 시뮬레이션 종료 시점까지도 계속 지연당하는 중 (A가 계속 방해에 성공 — 이 역시 설계상 유효한 결과)`);
