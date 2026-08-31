-- ============================================================================
-- 동굴(1티어 던전) 1~4층 실제 데이터 추가 — 사슬형 몬스터 체인(A~I)
--
-- 배경: CLAUDE.md "동굴(1티어 던전) — 사슬형 몬스터 체인 컨셉 확정"
-- (2026-08-24)에서 러프 스탯표만 확정해뒀던 것을, "동굴 저층 실제 데이터
-- 작성"(2026-08-31)에서 실제 이름·스킬·드랍테이블까지 확정해 이번에 반영함.
--
-- 내구력 설계 방향(사용자 확정): raw 데미지(ATK/계수/히트수)는 이미 승인된
-- 값이라 그대로 두고, HP와 realDef만 상향해서 "가장 약한 공격 한 방에도
-- 죽지 않고 패턴을 보여준다"는 목표를 맞춤. 원래는 realDef+bonusDef 조합
-- (자기강화 슬롯에 한정)만으로 풀려고 했으나, 기준 공격(raw≈15,000, Lv15
-- 1차 전직+상점제+6 스나이퍼의 최하위 스킬 기준)이 bonusDef의 유효 상한
-- (realDef×4, 500% 클램프)보다 훨씬 커서 그 방식만으론 부족함이 드러남
-- (CLAUDE.md "[고려 단계] initBonusDef" 섹션 참고 — bonusDef 상한을
-- realDef에서 분리하는 엔진 개편은 다음 세션 simulate.js 환경에서 검증
-- 예정). 이번엔 그 개편 전 임시 조치로 HP도 함께 상향(기존 대비 4~9배)해
-- 메꿈 — engine 개편이 반영되면 이 마이그레이션의 HP/realDef 값은
-- 재조정 대상.
--
-- 자기강화(combatStatUpPercent, stat:def)는 boss 재설계(2026-08-25,
-- "P0 밸런스 리스크" 섹션)에서 이미 검증한 것과 같은 메커니즘 재사용 —
-- realDef<100 유지 원칙을 그대로 지킴(B/F/H/I 전부 realDef 60~75,
-- 100 미만).
--
-- 신규 스킬은 실제 PC 직업(전사/마법사/...)이 아니라 "동굴 몬스터"라는
-- 몬스터 전용 job 버킷에 넣음 — allSkillsFromTable()이 jobSkills 전체를
-- 평탄화해서 이름으로만 찾으므로 몬스터 패턴에서 참조하는 데는 문제
-- 없고, character-sheet.html의 스킬 목록은 SKILL_TABLE[캐릭터.job]으로
-- "자기 직업"만 보므로 실제 플레이어 직업 스킬트리를 오염시키지 않음
-- (job-table-editor.html의 advancement 트리에 "동굴 몬스터"가 없으니
-- 어떤 PC도 이 job이 될 수 없어 절대 노출 안 됨 — 조사 완료).
--
-- F의 "무너지는 종유석"(다단히트+초저명중)은 스킬 자체가 아니라 F
-- 몬스터의 passiveMods.accuracyBonusPct:-70으로 명중률을 낮춤(스킬별
-- 명중률 필드가 없어서 몬스터 전체 물리 명중에 적용 — 2026-08-24
-- 컨셉 확정 시 이미 검토된 방식, F가 다른 물리 스킬을 안 갖고 있어
-- 부작용 없음).
--
-- 게이팅(2026-08-31 확정): 각 층에서만 등장하는 필러 몬스터(C=동굴박쥐/
-- E=동굴곰/G=동굴트롤/I=수정골렘)가 저확률(0.15)로 "동굴 N층 지도"를
-- 드랍 — 그 지도를 가지면 N+1층에 입장 가능(web/battle-themes.js의
-- hasItem 조건). 처음엔 다른 열쇠 아이템 이름을 임의로 만들었다가
-- "게이팅 아이디어만 있었지 실제 아이템은 없었다"는 사용자 정정으로
-- 되돌리고 이번에 "지도" 컨셉으로 다시 확정함.
-- ============================================================================

-- 1) skillTable.jobSkills."동굴 몬스터" 신설 — 기존 jobSkills의 다른 job은
--    전혀 안 건드림(jsonb_set으로 새 키 하나만 추가).
update public.game_content
set
  data = jsonb_set(
    data,
    '{jobSkills,"동굴 몬스터"}',
    $skills$[
      {"name":"무거운 강타","requiredLevel":1,"skillPointCost":0,"stat":"str","coefficient":1.2,"costs":[{"type":"sp","amount":10}],"skillType":"physical","targetFaction":"enemy","targetCount":"single","hits":1,"preDelay":20,"preDelayType":"action","postDelay":20,"effects":[]},
      {"name":"가시 강화","requiredLevel":1,"skillPointCost":0,"stat":"str","coefficient":0,"costs":[{"type":"sp","amount":15}],"skillType":"support","targetFaction":"self","targetCount":"single","preDelay":10,"preDelayType":"action","postDelay":10,"effects":[{"type":"combatStatUpPercent","stat":"def","value":40}]},
      {"name":"가시 찌르기","requiredLevel":1,"skillPointCost":0,"stat":"str","coefficient":1.1,"costs":[{"type":"sp","amount":10}],"skillType":"physical","targetFaction":"enemy","targetCount":"single","hits":1,"preDelay":15,"preDelayType":"action","postDelay":15,"effects":[]},
      {"name":"할퀴기","requiredLevel":1,"skillPointCost":0,"stat":"str","coefficient":1.0,"costs":[{"type":"sp","amount":8}],"skillType":"physical","targetFaction":"enemy","targetCount":"single","hits":1,"preDelay":10,"preDelayType":"action","postDelay":10,"effects":[]},
      {"name":"돌팔매","requiredLevel":1,"skillPointCost":0,"stat":"str","coefficient":1.0,"costs":[{"type":"sp","amount":12}],"skillType":"physical","targetFaction":"enemy","targetCount":"single","invalid":true,"hits":1,"preDelay":15,"preDelayType":"action","postDelay":15,"effects":[]},
      {"name":"몸통 박치기","requiredLevel":1,"skillPointCost":0,"stat":"str","coefficient":1.3,"costs":[{"type":"sp","amount":14}],"skillType":"physical","targetFaction":"enemy","targetCount":"single","hits":1,"preDelay":20,"preDelayType":"action","postDelay":20,"effects":[]},
      {"name":"무너지는 종유석","requiredLevel":1,"skillPointCost":0,"stat":"str","coefficient":0.5,"costs":[{"type":"sp","amount":30}],"skillType":"physical","targetFaction":"enemy","targetCount":"single","invalid":true,"hits":6,"preDelay":30,"preDelayType":"action","postDelay":30,"effects":[]},
      {"name":"굳은 돌가죽","requiredLevel":1,"skillPointCost":0,"stat":"str","coefficient":0,"costs":[{"type":"sp","amount":15}],"skillType":"support","targetFaction":"self","targetCount":"single","preDelay":10,"preDelayType":"action","postDelay":10,"effects":[{"type":"combatStatUpPercent","stat":"def","value":50}]},
      {"name":"짓밟기","requiredLevel":1,"skillPointCost":0,"stat":"str","coefficient":1.4,"costs":[{"type":"sp","amount":16}],"skillType":"physical","targetFaction":"enemy","targetCount":"single","hits":1,"preDelay":20,"preDelayType":"action","postDelay":20,"effects":[]},
      {"name":"지진","requiredLevel":1,"skillPointCost":0,"stat":"str","coefficient":0.7,"costs":[{"type":"sp","amount":25}],"skillType":"physical","targetFaction":"enemy","targetCount":"all","hits":1,"preDelay":40,"preDelayType":"casting","postDelay":30,"effects":[]},
      {"name":"대지의 축복","requiredLevel":1,"skillPointCost":0,"stat":"str","coefficient":0,"costs":[{"type":"sp","amount":15}],"skillType":"support","targetFaction":"self","targetCount":"single","preDelay":10,"preDelayType":"action","postDelay":10,"effects":[{"type":"combatStatUpPercent","stat":"def","value":35}]},
      {"name":"수정 낙하","requiredLevel":1,"skillPointCost":0,"stat":"str","coefficient":1.5,"costs":[{"type":"sp","amount":25}],"skillType":"physical","targetFaction":"enemy","targetCount":"single","invalid":true,"hits":1,"preDelay":20,"preDelayType":"action","postDelay":60,"effects":[]},
      {"name":"결정화","requiredLevel":1,"skillPointCost":0,"stat":"str","coefficient":0,"costs":[{"type":"sp","amount":20}],"skillType":"support","targetFaction":"self","targetCount":"single","preDelay":10,"preDelayType":"action","postDelay":10,"effects":[{"type":"combatStatUpPercent","stat":"def","value":60}]}
    ]$skills$::jsonb,
    true
  ),
  version = '2026-08-31a'
where key = 'skillTable';

-- 2) monsterRoster에 A~I 9종을 배열 뒤에 이어붙임(기존 몬스터는 전혀 안
--    건드림 — jsonb `||` 배열 연결이라 안전, 재실행하면 중복 추가되므로
--    한 번만 실행할 것).
update public.game_content
set
  data = data || $monsters$[
    {"id":"cave_boulder_beetle","name":"바위딱정벌레","portrait":"🪨","realStats":{"str":15,"int":8,"dex":8,"spd":10,"luk":8},"combatReal":{"atk":20,"def":70,"mdef":70},"maxHp":18000,"tier":"normal","patterns":[{"subject":"self","metric":"always","action":"무거운 강타"}],"expReward":25,"goldReward":10,"dropTable":[{"name":"돌","category":"material","chance":0.6,"quantity":[1,2]},{"name":"광석","category":"material","chance":0.3,"quantity":[1,1]}]},
    {"id":"cave_spiked_crab","name":"가시바위게","portrait":"🦀","realStats":{"str":15,"int":8,"dex":8,"spd":10,"luk":8},"combatReal":{"atk":18,"def":60,"mdef":60},"maxHp":24000,"tier":"elite","patterns":[{"subject":"self","metric":"battleTurn","comparator":"gte","value":1,"action":"가시 강화","maxUses":2},{"subject":"self","metric":"always","action":"가시 찌르기"}],"expReward":32,"goldReward":14,"dropTable":[{"name":"돌","category":"material","chance":0.5,"quantity":[1,2]},{"name":"철광석","category":"material","chance":0.35,"quantity":[1,2]}]},
    {"id":"cave_bat","name":"동굴박쥐","portrait":"🦇","realStats":{"str":12,"int":8,"dex":8,"spd":11,"luk":8},"combatReal":{"atk":15,"def":50,"mdef":50},"maxHp":22000,"tier":"normal","patterns":[{"subject":"self","metric":"always","action":"할퀴기"}],"expReward":18,"goldReward":8,"dropTable":[{"name":"돌","category":"material","chance":0.7,"quantity":[1,3]},{"name":"동굴 1층 지도","category":"keyItem","chance":0.15,"quantity":[1,1]}]},
    {"id":"cave_rockfall_wraith","name":"낙석귀","portrait":"👻","realStats":{"str":16,"int":8,"dex":8,"spd":9,"luk":8},"combatReal":{"atk":16,"def":65,"mdef":65},"maxHp":21000,"tier":"elite","patterns":[{"subject":"self","metric":"always","action":"돌팔매"}],"expReward":30,"goldReward":13,"dropTable":[{"name":"광석","category":"material","chance":0.4,"quantity":[1,2]},{"name":"철광석","category":"material","chance":0.3,"quantity":[1,1]}]},
    {"id":"cave_bear","name":"동굴곰","portrait":"🐻","realStats":{"str":18,"int":8,"dex":8,"spd":11,"luk":8},"combatReal":{"atk":24,"def":72,"mdef":72},"maxHp":17000,"tier":"normal","patterns":[{"subject":"self","metric":"always","action":"몸통 박치기"}],"expReward":38,"goldReward":16,"dropTable":[{"name":"돌","category":"material","chance":0.5,"quantity":[1,2]},{"name":"철광석","category":"material","chance":0.3,"quantity":[1,2]},{"name":"동굴 2층 지도","category":"keyItem","chance":0.15,"quantity":[1,1]}]},
    {"id":"cave_stalactite_crusher","name":"종유석파괴자","portrait":"🗿","realStats":{"str":18,"int":8,"dex":8,"spd":9,"luk":8},"combatReal":{"atk":20,"def":65,"mdef":65},"maxHp":26000,"tier":"elite","passiveMods":{"accuracyBonusPct":-70},"patterns":[{"subject":"self","metric":"battleTurn","comparator":"gte","value":1,"action":"굳은 돌가죽","maxUses":2},{"subject":"self","metric":"always","action":"무너지는 종유석"}],"expReward":45,"goldReward":19,"dropTable":[{"name":"철광석","category":"material","chance":0.4,"quantity":[1,2]},{"name":"정동석","category":"material","chance":0.15,"quantity":[1,1]}]},
    {"id":"cave_troll","name":"동굴트롤","portrait":"🧌","realStats":{"str":20,"int":8,"dex":8,"spd":12,"luk":8},"combatReal":{"atk":30,"def":78,"mdef":78},"maxHp":16500,"tier":"normal","patterns":[{"subject":"self","metric":"always","action":"짓밟기"}],"expReward":50,"goldReward":21,"dropTable":[{"name":"철광석","category":"material","chance":0.45,"quantity":[1,2]},{"name":"정동석","category":"material","chance":0.12,"quantity":[1,1]},{"name":"동굴 3층 지도","category":"keyItem","chance":0.15,"quantity":[1,1]}]},
    {"id":"cave_earth_spirit","name":"대지정령","portrait":"🌋","realStats":{"str":22,"int":8,"dex":8,"spd":10,"luk":8},"combatReal":{"atk":18,"def":68,"mdef":68},"maxHp":19000,"tier":"elite","patterns":[{"subject":"self","metric":"battleTurnMultiple","value":2,"action":"대지의 축복"},{"subject":"self","metric":"always","action":"지진"}],"expReward":55,"goldReward":24,"dropTable":[{"name":"철광석","category":"material","chance":0.5,"quantity":[2,3]},{"name":"정동석","category":"material","chance":0.2,"quantity":[1,2]}]},
    {"id":"cave_crystal_golem","name":"수정골렘","portrait":"💎","realStats":{"str":22,"int":8,"dex":8,"spd":13,"luk":8},"combatReal":{"atk":35,"def":75,"mdef":75},"maxHp":19000,"tier":"elite","patterns":[{"subject":"self","metric":"hp","comparator":"lte","value":60,"action":"결정화","maxUses":1},{"subject":"self","metric":"always","action":"수정 낙하"}],"expReward":48,"goldReward":20,"dropTable":[{"name":"철광석","category":"material","chance":0.45,"quantity":[1,3]},{"name":"정동석","category":"material","chance":0.25,"quantity":[1,2]},{"name":"동굴 4층 지도","category":"keyItem","chance":0.15,"quantity":[1,1]}]}
  ]$monsters$::jsonb,
  version = '2026-08-31a'
where key = 'monsterRoster';
