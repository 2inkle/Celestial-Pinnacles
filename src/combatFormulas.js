// ============================================================================
// 브라우저에서도 그대로 로드해 쓸 수 있게 하는 최소 CommonJS 래퍼. module/require를
// "매개변수"로 명시적으로 넘기는 게 핵심 — 만약 이 안에서 var module = ...처럼
// 새로 선언해버리면(매개변수가 아니라 var로), var 호이스팅 때문에 Node가 진짜로
// 제공하는 module 매개변수를 가려버리는 문제가 생김(실제로 한 번 겪었음). 그래서
// 아래처럼 즉시실행함수의 매개변수 자리에서 처리함 — 이러면 Node에서는 진짜
// module/require가 그대로 전달되고, 브라우저(둘 다 없음)에서는 그 자리에서 새로
// 만들어서 쓰되 여러 <script> 태그가 이 함수 스코프 안에 격리되어 서로의 최상위
// const/let 선언과 충돌하지 않음.
// ============================================================================
(function (module, require) {
  if (!module) {
    module = { exports: {} };
    require = function () { return (typeof window !== "undefined" && window.BattleSim) || {}; };
  }

// ============================================================================
// 스킬 위력 계산 공식
//
// power = 공격력 × 스탯 × 계수
//   - Physical 타입: 공격력 자리에 atk(물리 공격력, 장비 전용 파생 스탯)
//   - Magic    타입: 공격력 자리에 matk(마법 공격력, 장비 전용 파생 스탯)
//   - 어떤 스탯이 곱해지는지는 skill.stat이 결정(STR이든 INT든 자유) — 그래서
//     "Physical(STR)"과 "Physical(INT)"이 같은 이 함수 하나로 다 처리됨.
// atk/matk는 전적으로 장비에서만 나오는 값이라 기본값이 0임 — 그래서 맨몸이면
// (곱셈이라) 위력도 반드시 0이 됨. 이건 의도된 설계임: 장비 없이는 스킬이
// 전혀 위력을 못 낸다는 뜻.
//
// support 타입은 공격력 배수가 없어서 스탯 × 계수만 그대로 씀(버프/회복류라
// 애초에 "때리는 위력" 개념이 없기 때문).
// ============================================================================

function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * 캐릭터에서 특정 스탯의 "전투 중 유효값"을 읽어온다.
 * BattleCharacter 인스턴스면 effectiveStr/effectiveInt 같은 getter를 그대로 쓰고,
 * 그런 getter가 없는 단순 객체(mock/테스트용)라면 realXxx 값으로 폴백한다.
 */
function getEffectiveStatValue(actor, statKey) {
  const effectiveKey = `effective${capitalize(statKey)}`;
  if (typeof actor[effectiveKey] === "number") return actor[effectiveKey];

  const realKey = `real${capitalize(statKey)}`;
  if (typeof actor[realKey] === "number") return actor[realKey];

  return 0;
}

// ============================================================================
// 데미지 기여 스탯 감쇠 — STR/INT/DEX 같은 "데미지에 곱해지는 스탯"은 날것
// 그대로 쓰지 않고 완만한 감쇠 곡선을 거침.
//
// 이유: 위력 공식이 ATK × STAT × 계수라 성장 요소가 두 개(장비, 스탯) 곱해져서
// 실질 제곱으로 폭발함. Lv1→30에 공격력은 81배 오르는데 HP는 8.25배라
// 방어가 공격을 절대 못 따라가고, 스탯 20배 버프가 그대로 데미지 20배가 되어
// 중반 이후 버프/디버프 싸움이 감당 불가능해짐. 방어력으로도 못 막음 —
// 최소피해 10% 규칙이 하한이라 realDef를 아무리 올려도 원본의 10%는 통과함.
//
// 곡선: contribution = K × (stat / K)^p
//   K(기준점)를 초기 스탯값 10으로 잡아서 저레벨 구간은 원본과 동일하게 두고
//   (Lv1 데미지가 정확히 그대로라 이미 잡아둔 초반 밸런스를 다시 안 잡아도 됨),
//   스탯이 커질수록만 눌리게 함.
//   p=0.6 기준: Lv30 성장 81배→27배, 20배 버프 시 데미지 20배→6배.
//
// ⚠ 아직 테스트 단계의 잠정값 — 되돌리려면 STAT_DAMPING_EXPONENT를 1.0으로
// 두면 감쇠가 완전히 사라져 원래 공식이 됨.
// ATK/MATK(장비발)에는 적용하지 않음 — "장비를 통한 성장"이라는 축은 그대로
// 살려야 하므로.
// ============================================================================
const STAT_DAMPING_BASE = 10;      // 이 값 이하에서는 감쇠 없음(초기 스탯값)
const STAT_DAMPING_EXPONENT = 0.6; // 1.0이면 감쇠 없음(원래 공식)

function dampDamageStat(statValue) {
  if (statValue <= STAT_DAMPING_BASE) return statValue;
  return STAT_DAMPING_BASE * Math.pow(statValue / STAT_DAMPING_BASE, STAT_DAMPING_EXPONENT);
}

/**
 * 스킬 위력 계산. atk/matk도 이제 STR/INT처럼 real/bonus/effective 구조라,
 * 전투 중 걸린 버프(bonusAtk 등)까지 반영된 effective 값을 씀. mock 객체 등
 * effectiveAtk/effectiveMatk 게터가 없는 경우엔 realAtk/realMatk로 폴백.
 */
function computeSkillPower(actor, skill) {
  const statValue = dampDamageStat(getEffectiveStatValue(actor, skill.stat));
  let power;

  switch (skill.skillType) {
    case "physical":
      power = getEffectiveStatValue(actor, "atk") * statValue * skill.coefficient;
      break;
    case "magic":
      power = getEffectiveStatValue(actor, "matk") * statValue * skill.coefficient;
      break;
    case "support":
    default:
      power = statValue * skill.coefficient;
  }

  // 스탠스(주문 집속류)의 위력 배율 — 여러 스탠스에 동시에 있으면 전부
  // 곱연산으로 겹침(getStanceMultiplier가 없으면 1을 반환하므로 스탠스가
  // 아예 없거나 이 필드가 없으면 원래 값 그대로).
  power *= actor.getStanceMultiplier("powerMultiplier");
  return power;
}

module.exports = { computeSkillPower, getEffectiveStatValue };

// 패시브(장비/패시브 스킬)의 "가하는 피해 증가%" — takeDamage()가 처리하는
// "받는 피해 감소%"와 반대쪽. 공격자 쪽 값이라 target.takeDamage()에 넘기기
// 전, 데미지 발생 지점(ATTACK/DETONATE_MAGIC_CIRCLE/applyDamageAndEffects)
// 각각에서 호출해야 함 — takeDamage() 안에는 공격자 정보가 없어서 거기서는
// 처리 못 함.
// statKey(선택) — skill.stat을 넘기면 물리/마법 구분과 별개로
// "{stat}DamageDealtPct"(예: dexDamageDealtPct)도 추가로 합산함. Job Master:
// Arcane Archer의 "DEX 기반 스킬 위력 증가+6%"류 — 스탯 기준으로 위력이
// 갈리는 패시브를 표현하기 위함(damageType은 물리/마법만 구분하지 어떤
// 스탯을 썼는지는 모르므로 별도 인자로 받음).
//
// 세 "출처"(물리/마법 기본, 스탯별, 대상 등급별)는 서로 복리로 곱해짐
// (2026-08-16, 사용자 지적으로 변경 — 예전엔 셋을 그냥 더한 뒤 한 번에
// 곱해서, "???"의 damageDealtTo_userPct:-90%가 자기 자신의 Mana Guard
// 스탠스(magicDamageDealtPct:+25%)와 그냥 상쇄되어 순 -65%로 줄어드는
// 문제가 있었음 — 서로 무관한 두 효과가 우연히 같은 덧셈식에 들어있다는
// 이유만으로 서로를 깎아먹는 건 직관과 어긋남). 각 출처 "안"에서는 여전히
// 여러 소스가 합산됨(getPassiveModValue 자체가 이미 그렇게 함 — 예:
// magicDamageDealtPct가 장비+패시브+스탠스에서 동시에 오면 그 안에서는
// 더해짐), 다만 이 세 출처"사이"는 (1+a)×(1+b)×(1+c) 방식으로 곱해져서
// 서로 독립적으로 작동함 — 어느 한쪽을 극단적으로 낮춰도 다른 한쪽의
// 자기 버프에 거의 흔들리지 않게 되어 미세조정 여지가 넓어짐.
function applyDealtPassiveMods(actor, rawDamage, damageType, statKey, targetTier) {
  const isMagic = damageType === "magic";
  // 각 출처의 배율을 0 미만으로는 안 내려가게 개별 클램프 — 안 그러면
  // -150% 같은 극단값이 배율을 음수로 만들고, 음수끼리 곱해지면 부호가
  // 다시 뒤집혀 데미지가 커지는 사고가 날 수 있음(복리 구조에서는 특히
  // 위험 — 예전 덧셈식은 최종 pct 하나만 클램프하면 됐지만, 지금은 곱해지는
  // 항이 여럿이라 각자 따로 막아야 함).
  let multiplier = Math.max(0, 1 + actor.getPassiveModValue(isMagic ? "magicDamageDealtPct" : "physicalDamageDealtPct") / 100);
  if (statKey) multiplier *= Math.max(0, 1 + actor.getPassiveModValue(`${statKey}DamageDealtPct`) / 100);
  // 대상 등급(creatureTier)별 추가 피해 — "damageDealtTo_{tier}Pct".
  // damageTakenFrom_{tier}Pct(받는 쪽)와 짝을 이루는 반대 방향.
  // 받는 피해 감소만으로는 상대 화력이 이미 방어력에 막혀 있으면 체감이
  // 안 나오는데, 가하는 피해는 방어 계산 전에 곱해지므로 확실히 체감됨.
  if (targetTier) multiplier *= Math.max(0, 1 + actor.getPassiveModValue(`damageDealtTo_${targetTier}Pct`) / 100);
  return Math.max(0, rawDamage * multiplier);
}

// 흡혈 — 데미지가 실제로 적용된(target.takeDamage()가 반환한 applied) 직후
// 호출. appliedDamage 기준이라 Guard로 막혔거나 DEF로 0이 된 경우엔 자동으로
// 발동 안 함(0 × 비율 = 0이라 별도 분기 불필요).
function applyLifesteal(actor, appliedDamage, ctx) {
  const pct = actor.getPassiveModValue("lifestealPct");
  if (pct <= 0 || appliedDamage <= 0) return;
  const healAmount = Math.floor((appliedDamage * pct) / 100);
  if (healAmount <= 0) return;
  const before = actor.currentHp;
  actor.currentHp = Math.min(actor.maxHp, actor.currentHp + healAmount);
  if (actor.currentHp > before) ctx.log(`   [흡혈] ${actor.name} HP +${actor.currentHp - before} (${before} → ${actor.currentHp})`);
}

module.exports.applyDealtPassiveMods = applyDealtPassiveMods;
module.exports.applyLifesteal = applyLifesteal;


  // 브라우저 환경이면 이 모듈의 exports를 공용 네임스페이스에 얹음(Node에서는
  // window가 없으니 아무 일도 안 함. 어차피 Node의 진짜 module.exports는 위에서
  // 그대로 전달받은 그 객체라 이 시점에 이미 다 채워져 있음).
  if (typeof window !== "undefined") {
    window.BattleSim = window.BattleSim || {};
    Object.assign(window.BattleSim, module.exports);
  }
})(typeof module !== "undefined" ? module : undefined, typeof require !== "undefined" ? require : undefined);
