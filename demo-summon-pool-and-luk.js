const { BattleCharacter } = require("./src/character");
const { ActionRegistry } = require("./src/registries");

console.log("==================================================");
console.log("1) 일대다 풀 — 가중치대로 통계적으로 갈리는지 (300회)");
console.log("==================================================");

const pool = [
  { name: "고블린 척후병", stats: { str: 5, int: 5, dex: 5, spd: 5, luk: 5 }, weight: 80 },
  { name: "고블린 전사", stats: { str: 10, int: 5, dex: 5, spd: 5, luk: 5 }, weight: 20 },
];

const counts = { "고블린 척후병": 0, "고블린 전사": 0 };
for (let i = 0; i < 300; i++) {
  const summoner = new BattleCharacter("소환사", "enemy", { luk: 10 });
  summoner.realSummonEff = 5;
  summoner.summonPool = pool;
  const ctx = { units: [], allies: [], enemies: [], log: () => {} };
  ActionRegistry.execute("SUMMON", summoner, ctx);
  const spawnedName = ctx.enemies[0].name;
  counts[spawnedName] = (counts[spawnedName] || 0) + 1;
}
console.log(`고블린 척후병: ${counts["고블린 척후병"]}회 (기대 약 240 근처, 80%)`);
console.log(`고블린 전사: ${counts["고블린 전사"]}회 (기대 약 60 근처, 20%)`);
console.log("가중치대로 대체로 갈림:", Math.abs(counts["고블린 척후병"] - 240) < 40 ? "✅" : "❌");

console.log("\n==================================================");
console.log("2) SummonEff는 real 고정, LUK 성장 배율만 실시간(버프 이후 즉시 반영)");
console.log("==================================================");

const summoner2 = new BattleCharacter("소환사2", "enemy", { luk: 10 });
summoner2.realSummonEff = 4;
summoner2.summonPool = [{ name: "부하", stats: { str: 10, int: 10, dex: 10, spd: 10, luk: 10 }, weight: 1 }];

const ctxA = { units: [], allies: [], enemies: [], log: () => {} };
ActionRegistry.execute("SUMMON", summoner2, ctxA);
const firstSummonStr = ctxA.enemies[0].realStr;
// 버프 없음 -> effectiveLuk/realLuk = 1 -> 배율 1 -> multiplier = 4×1 = 4 -> str 10×4=40
console.log(`LUK 성장 배율 1배일 때 소환된 부하 STR: ${firstSummonStr} (기대 10 × (4×1=4) = 40)`);

summoner2.bonusLuk += 40; // effectiveLuk: 10 -> 50, 비율 5배 -> 3배로 캡
console.log(`버프 후 effectiveLuk: ${summoner2.effectiveLuk} (10 -> 50), 비율은 5배지만 3배로 캡될 것`);

const ctxB = { units: [], allies: [], enemies: [], log: () => {} };
ActionRegistry.execute("SUMMON", summoner2, ctxB);
const secondSummonStr = ctxB.enemies[0].realStr;
// 배율 3(캡) -> multiplier = 4×3 = 12 -> str 10×12=120
console.log(`캡 적용 후(3배) 소환된 부하 STR: ${secondSummonStr} (기대 10 × (4×3=12) = 120, 5배였다면 200이었을 것)`);

console.log("");
console.log("LUK 버프 이후 소환이 더 강해짐(실시간 반영):", secondSummonStr > firstSummonStr ? "✅" : "❌");
console.log("(정확한 곡선 형태 — 로그 곡선, ratio=50에서 3배 등 — 검증은 demo-luk-log-curve.js 참고)");

console.log("\n==================================================");
console.log("3) SummonEff=0(장비 없음)이어도 소환이 무의미해지진 않음(새 규칙 — 0은 100% 기준선)");
console.log("==================================================");

// realLuk을 200(소프트캡 근처, 배율 약 1.25)으로 두고 SummonEff=0으로 소환해보면,
// 0으로 뭉개지는 게 아니라 LUK 투자 배율만큼은 그대로 나와야 함
const noGearSummoner = new BattleCharacter("맨몸 소환사", "enemy", { luk: 200 });
noGearSummoner.summonPool = [{ name: "부하", stats: { str: 100 }, weight: 1 }];

const ctxC = { units: [], allies: [], enemies: [], log: () => {} };
ActionRegistry.execute("SUMMON", noGearSummoner, ctxC);
console.log(`SummonEff=0, realLuk=200인 소환사가 만든 부하 STR: ${ctxC.enemies[0].realStr} (기대 100×~1.25=125 근처, 0이 아님)`);
console.log("장비 없이도 소환 자체는 정상 작동:", ctxC.enemies[0].realStr > 100 ? "✅" : "❌");

console.log("\n==================================================");
console.log("4) 크리티컬은 realLuk만 관여, 버프로 안 변함");
console.log("==================================================");

const crity = new BattleCharacter("치명타요원", "ally", { luk: 20 });
console.log(`버프 전 critRate: ${crity.critRate} (기대 10 = 20×0.5)`);
crity.bonusLuk += 1000; // 아무리 버프를 줘도
console.log(`버프 후(bonusLuk +1000) critRate: ${crity.critRate} (기대 여전히 10 — 안 변해야 함)`);
console.log("크리티컬이 버프에 영향 안 받음:", crity.critRate === 10 ? "✅" : "❌");
