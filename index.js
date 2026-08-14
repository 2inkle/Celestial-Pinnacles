const { createMockDb, seedDemoData } = require("./src/mockDb");
const { CharacterDataAdapter, CharacterImporter } = require("./src/importer");
const { BattleEngine } = require("./src/engine");

const db = seedDemoData(createMockDb());

// DB -> 임포터 어댑터 -> BattleCharacter 조립
const merlinData = CharacterDataAdapter.buildImportDataFromDb(1, db);
const alchemistData = CharacterDataAdapter.buildImportDataFromDb(2, db);
const bossData = CharacterDataAdapter.buildImportDataFromDb(3, db);

const merlin = CharacterImporter.importCharacter(merlinData);
const alchemist = CharacterImporter.importCharacter(alchemistData);
const boss = CharacterImporter.importCharacter(bossData);

console.log("\n📋 [전투 투입 전 정보창 확인]");
[merlin, alchemist, boss].forEach((c) => {
  console.log(
    `- ${c.name} (${c.side}) | HP ${c.maxHp} | SP ${c.maxSp} | 치명타율 ${c.critRate}% | 패턴 슬롯 ${c.patternSlots.length}/${c.maxPatternSlots} | 무게제한 ${c.weightCapacity}`
  );
});

const engine = new BattleEngine([merlin, alchemist], [boss]);
engine.startBattle(2);
