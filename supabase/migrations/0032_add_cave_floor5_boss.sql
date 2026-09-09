-- ============================================================================
-- 0032_add_cave_floor5_boss.sql — 동굴 5층 보스 "심층 수호자" 데이터 반영
--
-- 배경: CLAUDE.md "동굴 5층 보스 재설계 확정 — '단순하지만 강력한 단일강타'
-- + H 소환 안전장치"(2026-08-25)에서 메커니즘·엔진 인프라(SUMMON 재사용,
-- guardAllies 몬스터 경로 배선, MY_SIDE_ALIVE_COUNT_LTE/RANDOM_CHANCE_PCT
-- 신규 조건)까지는 이미 병합·검증돼 있었고, 실제 몬스터 데이터(스탯/스킬/
-- 패턴)만 비어 있던 상태였다. 이번에 그 데이터를 채운다.
--
-- ── 스탯 근거 ────────────────────────────────────────────────────────────
-- "[P0 밸런스 리스크] 동굴 보스 DEF/HP가 무버프 평범한 캐릭터 기준으로도
-- 너무 낮음"(2026-08-25)에서 러프 스탯(HP52,000/DEF·MDEF35%)이 무버프
-- Lv20 스나이퍼의 Hurricane Shot 단발로 보스 HP의 24.2%가 빠지는 걸
-- 확인했고, "실전 상한버프(500%) 상황"까지 감안하면 이보다 훨씬 심각할
-- 수 있다고 결론 내렸었다. 이번 세션은 Node/simulate.js가 있는 주
-- 워크스페이스지만, Hurricane Shot 연타점감 공식 자체를 손보는 건 이
-- 마이그레이션의 범위 밖(게임 전체 스킬표에 영향을 주는 별도 작업, 여전히
-- 미착수) — 그래서 이번엔 **HP/DEF만 큰 폭으로 상향**해서 P0가 지적한
-- "무버프 저투자 캐릭터의 단발 행동만으로도 위협받는" 상태를 완화한다.
--   · maxHp: 52,000 → 200,000(약 3.8배). 골키퍼(고블린의 왕) EHP 약
--     51,100 대비, 새 보스 EHP(200,000/(1-0.45)≈363,600)는 약 7.1배 —
--     "1티어 졸업 시험"이 0티어 보스보다 확실히 무겁다는 기존 설계 의도
--     (52,000/0.65≈80,000=1.56배)보다 한층 더 강화된 형태.
--   · realDef/realMdef: 35 → 45. realDef<100 유지 원칙(자기강화 슬롯의
--     전제조건, "동굴 저층 실제 데이터 작성" 섹션 참고)은 그대로 지킴 —
--     자기강화(아래 "돌기갑 강화")가 걸릴 때 2단계 고정경감이 여전히
--     체감되게 하기 위함.
-- ⚠ 이 수치도 여전히 "구조가 서 있는가" 수준의 추정치다 — 정밀한 하한선
-- 보장이 목표가 아니라는 1티어 스코프 원칙(CLAUDE.md "동굴 저층 러프
-- 스탯표 재검토" 섹션) 그대로. 연타점감 공식 개편이 나중에 들어가면 이
-- 수치도 함께 재검증할 것.
--
-- ── 패턴 설계(2026-08-25 확정안 그대로 구현) ────────────────────────────
-- "좁고 깊게"(H의 "전체+잦은 자강화"와 겹치지 않는 역할 분리) 원칙대로,
-- 단일 대상 강타 하나만 반복하고 preDelay(전조)·postDelay(회복 지연)를
-- 크게 줌. raw 목표(800~1100)는 2026-08-25에 이미 승인된 범위 그대로
-- 유지(str24/atk38/coefficient1.6 — 동굴 4층 필러 수정골렘(str22/atk35/
-- coefficient1.5, raw≈839)에서 소폭만 올린 값).
--
-- H 소환 안전장치는 이미 구현된 MY_SIDE_ALIVE_COUNT_LTE(자신 포함 1명
-- 이하="혼자")+RANDOM_CHANCE_PCT(33%)를 andNext로 체이닝해 그대로 재사용
-- (web/battle-adapter.js:160-169가 이미 이 두 metric을 번역함, 엔진 변경
-- 없음). guardAllies:true로 자신을 전열+아군 보호로 세워 H가 소환 직후
-- 저격당하지 않게 함(전체타겟 공격에는 이 보호가 안 먹히는 건 기존 설계
-- 그대로 — 협공 자체를 막는 게 아니라 완충만 준다는 의도).
--
-- 자기강화("돌기갑 강화")는 H(대지의 축복, 2턴마다·def+35%)보다 훨씬
-- 뜸하게(3턴마다)·횟수 제한(maxUses:3)을 둬서 "H처럼 잦지 않고 약하게만"
-- 원칙을 지킴 — 최대 +90%까지만 쌓여 realDef×5(500%) 캡에 전혀 안 닿음.
--
-- ── 보스는 처치 가능(사용자 확정, retreat 없음) ─────────────────────────
-- goblin_cart/unknown_entity/raid_deep_dweller와 달리 이 보스는 "졸업
-- 시험"이라 RETREAT/REWARD_GRANT 패턴을 안 둔다 — 그냥 죽는 보스.
-- tier:"boss"라 결과 화면 HP는 여전히 은폐됨(2026-08-21 정책).
--
-- ── 보류(다음 세션) ─────────────────────────────────────────────────────
-- "[몬스터명]의 카드"(심층 수호자의 카드, BOSS 등급 개조비용 100,000G)와
-- "Heart of Deepstone"(보스 전용 고유 드랍) — 둘 다 카드 테마 확정
-- 섹션(2026-08-25)에서 "보스 실제 데이터가 확정되면 함께 작성"으로 이미
-- 예정돼 있던 후속 작업. 이번엔 보스 자체의 존재·전투 성립을 우선
-- 마무리하고, 두 아이템은 다음 세션에서 정확한 수치(카드 4대 스탯 조합,
-- Heart of Deepstone의 weight/combatBonus/maxHpBonus)와 함께 별도로
-- 추가한다. dropTable은 이번엔 기존 동굴 재료(철광석/정동석/돌)만 담음.
-- ============================================================================

-- 1) skillTable.jobSkills."동굴 몬스터"에 보스 전용 스킬 2종을 추가로
--    이어붙임(기존 12종은 안 건드림 — 배열 자체를 다시 쓰지 않고
--    jsonb_set의 대상 경로를 "그 배열의 현재 값"으로 잡아 || 로 append).
update public.game_content
set
  data = jsonb_set(
    data,
    '{jobSkills,"동굴 몬스터"}',
    (data #> '{jobSkills,"동굴 몬스터"}') || $skills$[
      {"name":"돌기갑 강화","requiredLevel":1,"skillPointCost":0,"stat":"str","coefficient":0,"costs":[{"type":"sp","amount":20}],"skillType":"support","targetFaction":"self","targetCount":"single","preDelay":15,"preDelayType":"action","postDelay":15,"effects":[{"type":"combatStatUpPercent","stat":"def","value":30}]},
      {"name":"붕괴의 일격","requiredLevel":1,"skillPointCost":0,"stat":"str","coefficient":1.6,"costs":[{"type":"sp","amount":35}],"skillType":"physical","targetFaction":"enemy","targetCount":"single","hits":1,"preDelay":45,"preDelayType":"casting","postDelay":60,"effects":[]}
    ]$skills$::jsonb,
    true
  ),
  version = '2026-09-09a'
where key = 'skillTable';

-- 2) monsterRoster에 보스 1종을 append(배열 연결 — 재실행하면 중복
--    추가되므로 한 번만 실행할 것, 0025/0028과 동일한 패턴).
--    패턴 순서: ①혼자 남았을 때 33% 확률로 H 소환(안전장치, 최상위 우선순위)
--               ②3턴마다 최대 3회 자기강화 ③항상 붕괴의 일격.
update public.game_content
set
  data = data || $monsters$[
    {"id":"cave_depth_guardian","name":"심층 수호자","portrait":"🗻","realStats":{"str":24,"int":8,"dex":10,"spd":11,"luk":8},"combatReal":{"atk":38,"def":45,"mdef":45},"maxHp":200000,"tier":"boss","guardAllies":true,"summonAbility":{"candidates":[{"monsterId":"cave_earth_spirit","weight":100}]},"patterns":[{"subject":"self","metric":"teamAlone","andNext":true},{"subject":"self","metric":"randomChancePct","value":33,"action":"SUMMON"},{"subject":"self","metric":"battleTurnMultiple","value":3,"action":"돌기갑 강화","maxUses":3},{"subject":"self","metric":"always","action":"붕괴의 일격"}],"expReward":400,"goldReward":200,"dropTable":[{"name":"철광석","category":"material","chance":0.6,"quantity":[3,5]},{"name":"정동석","category":"material","chance":0.35,"quantity":[2,4]},{"name":"돌","category":"material","chance":0.5,"quantity":[2,4]}]}
  ]$monsters$::jsonb,
  version = '2026-09-09a'
where key = 'monsterRoster';
