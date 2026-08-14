const { BattleCharacter } = require("./src/character");
const { SkillRegistry } = require("./src/skillRegistry");
const { applyDamageAndEffects } = require("./src/skillResolution");

// ============================================================================
// "enemy-multi" 스킬 등록
//   - Physical(dex), invalid(차단 불가 — 보호/taunt 무시), 5연타
//   - 히트마다 성공 시 대상의 SPD -5%(그 순간의 effective 값 기준)
// ============================================================================
SkillRegistry.register({
  name: "enemy-multi",
  targetFaction: "enemy",
  targetCount: "single",
  skillType: "physical",
  stat: "dex",
  coefficient: 1.0,
  costs: [],
  invalid: true,
  hits: 5,
  preDelay: 0,
  preDelayType: "action",
  postDelay: 20,
  effects: [{ type: "statDownPercent", stat: "spd", value: 5 }],
});

function buildScenario() {
  const frontGuardian = new BattleCharacter("전열 수호자", "ally", { str: 10, int: 10, dex: 10, spd: 100, luk: 10 });
  frontGuardian.row = "front";
  frontGuardian.guardAllies = true;
  frontGuardian.isGuarding = true;

  const backCharacter = new BattleCharacter("후열 캐릭터", "ally", { str: 10, int: 10, dex: 10, spd: 100, luk: 10 });
  backCharacter.row = "back";

  const enemyCaster = new BattleCharacter("고블린 습격자", "enemy", { str: 10, int: 10, dex: 30, spd: 20, luk: 10 });
  enemyCaster.realAtk = 20; // 물리 위력 = atk × effectiveDex × coefficient — 안 정해주면 항상 0데미지가 되어버림

  const ctx = {
    allies: [frontGuardian, backCharacter],
    enemies: [enemyCaster],
    getOpponents(actor) {
      return actor.side === "ally" ? this.enemies : this.allies;
    },
    log: console.log,
  };

  return { frontGuardian, backCharacter, enemyCaster, ctx };
}

console.log("==================================================");
console.log("enemy-multi 스킬 1회 실행 — Guard + 보호(taunt) 동시 검증");
console.log("==================================================");

const { frontGuardian, backCharacter, enemyCaster, ctx } = buildScenario();
console.log(`전열 수호자: row=${frontGuardian.row}, guardAllies=${frontGuardian.guardAllies}, isGuarding(시작 전)=${frontGuardian.isGuarding}`);
console.log(`후열 캐릭터: row=${backCharacter.row}, guardAllies=${backCharacter.guardAllies}, isGuarding=${backCharacter.isGuarding}`);
console.log("");

applyDamageAndEffects(enemyCaster, SkillRegistry.get("enemy-multi"), ctx);

console.log("\n==================================================");
console.log("사후 검증");
console.log("==================================================");
console.log(`전열 수호자 최종 HP: ${frontGuardian.currentHp}/${frontGuardian.maxHp} (한 번이라도 맞았다면 Guard로 막혀서 그대로 max여야 함 — Guard는 "이 스킬 전체"를 막는 개념)`);
console.log(`전열 수호자 isGuarding(종료 후): ${frontGuardian.isGuarding} (한 번이라도 맞았으면 소모되어 false)`);
console.log(`후열 캐릭터 최종 HP: ${backCharacter.currentHp}/${backCharacter.maxHp}`);
console.log(`후열 캐릭터 SPD 감소 적용 여부(bonusSpd): ${backCharacter.bonusSpd}`);

console.log("\n==================================================");
console.log("20회 반복 통계 검증 — Guard는 '스킬 전체'를 막는다는 것 확인(Shield와는 다른 개념)");
console.log("==================================================");

let frontEverDamaged = false;
let backEverDamaged = false;

for (let i = 0; i < 20; i++) {
  const s = buildScenario();
  const silentCtx = { ...s.ctx, log: () => {} };
  applyDamageAndEffects(s.enemyCaster, SkillRegistry.get("enemy-multi"), silentCtx);

  if (s.frontGuardian.currentHp < s.frontGuardian.maxHp) frontEverDamaged = true;
  if (s.backCharacter.currentHp < s.backCharacter.maxHp) backEverDamaged = true;
}

console.log("전열 수호자가 20회 중 단 한 번도 데미지를 입지 않음(Guard가 스킬 전체를 항상 막음):", !frontEverDamaged ? "✅" : "❌");
console.log("후열 캐릭터가 20회 중 최소 한 번은 데미지를 입음(Invalid가 taunt를 무시하고 실제로 노림):", backEverDamaged ? "✅" : "❌");
