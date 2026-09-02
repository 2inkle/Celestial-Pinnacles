-- ============================================================================
-- 0028_seed_raid_table.sql — 레이드 정의(raidTable) 시드 + 레이드 보스/소환서
--
-- ⚠ 이 마이그레이션은 아직 실행되지 않았다. 실행해야 실제 반영됨.
-- ⚠ 0027_coop_raid.sql이 먼저 실행돼 있어야 한다(game_content의 key CHECK에
--    'raidTable'을 추가하는 게 0027이다).
--
-- ── 이 파일이 채우는 것 ────────────────────────────────────────────────────
-- 0027로 레이드 스키마와 RPC는 라이브에 올라갔지만 데이터가 하나도 없어서
-- 실제로는 아무것도 돌지 않는 상태였다. 이 마이그레이션이 채우는 것:
--   1) game_content.raidTable — 레이드 정의 1종(규칙 수치 + 기믹 배점/판정규칙)
--   2) monsterRoster에 레이드 보스 1종 + 소환서로 열리는 전투용 잡몹 없음(단독)
--   3) 소환 아이템 "심층의 부름"은 별도 테이블이 없다 — 이름만 쓰이고
--      open_raid_instance가 warehouse_items에서 이름으로 찾아 차감한다.
--      (드랍/제작 경로는 아직 없음 — 다음 단계에서 동굴 5층 보스 등에 붙일 것.
--       지금은 관리자가 warehouse_items에 직접 넣어 테스트한다.)
--
-- ── 보스는 처치 불가 — 퇴각 + 보물상자 모델(2026-08-31 사용자 확정) ─────────
-- 마차(goblin_cart) / "???"(unknown_entity)와 같은 방식이다. 필요한 액션이
-- 이미 전부 구현돼 있어 엔진 변경이 없다:
--   · RETREAT(registries.js:575) — currentHp를 0으로 만들어 전장에서 제거.
--     "물러났다" 서사. 직접 죽일 수 없는 개체용으로 SELF_DETONATION과 분리된 것.
--   · REWARD_GRANT(registries.js:600, chains:true) — rewardObjectSpec 그대로
--     보물상자를 적 진영에 추가. 상자는 patternSlots가 비어 아무 행동도 안 하고,
--     부수면 적이 전멸해 allyWin이 뜬다.
--
-- 보스 HP는 런타임에 **남은 공유 풀 HP로 덮어쓴다**(web/battle-view.html의
-- 레이드 모드). 그래서 아래 maxHp는 자리표시자이고, 퇴각 임계(hp<=2%)는
-- "풀을 바닥내는 마지막 런에서만" 걸리게 된다. 그 앞의 런들은 보스가 살아남은
-- 채 100턴 상한에 걸려 끝나므로 outcome이 draw다 — 기믹을 outcome에 걸면
-- 마지막 런 전용이 되어버리니 주의(web/raid-gimmicks.js 헤더 참고).
--
-- ── 보상은 두 겹(사용자 확정) ──────────────────────────────────────────────
--   · 보물상자 dropTable → 기존 grantKillReward 경로로 그 판에서 즉시 지급.
--     마지막 런 참가자만 받는다(엔진 기본 동작, 추가 코드 없음).
--   · rewardPool → 레이드 종료 시 claim_raid_rewards로 기여도 비례 차등지급.
--
-- ── gimmickPoints와 gimmickRules를 나눠 넣는 이유 ──────────────────────────
-- 0027의 submit_raid_run이 gimmick_points를 **평탄한 {id: 정수} 맵**으로 읽는다
-- (`v_r.gimmick_points ? g`, `(... ->> g)::integer`). 이미 배포된 함수라 이
-- 형태를 깨면 안 된다. 그래서 배점은 gimmickPoints에 그대로 두고, 판정 규칙과
-- 표시명만 같은 id로 gimmickRules에 병기한다.
-- ⚠ 두 맵의 **키 집합이 정확히 일치해야 한다** — gimmickRules에만 있는 id는
-- 서버가 조용히 무시하고(배점표에 없으므로), gimmickPoints에만 있는 id는
-- 클라이언트가 영원히 달성 못 한다(판정 규칙이 없으므로).
--
-- ── maxDamagePerRun을 bossMaxHp의 1/3로 잡은 이유 ──────────────────────────
-- 서버는 least(reported, max_damage_per_run, boss_hp_remaining)로 자른다.
-- 한 런의 데미지가 상한을 넘으면 "화면에선 보스가 퇴각했는데 서버 풀은 안 비는"
-- 불일치가 가능하다(데미지 >= 남은풀 > 상한인 경우에만 성립). 상한을 넉넉히
-- 잡아 정상 플레이에선 거의 안 닿게 하고, 닿으면 UI가 "최대 N까지만 반영됨"을
-- 명시한다 — 화면이 아니라 서버 응답이 진실이라는 원칙.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. raidTable 시드.
--    battleId "raid-cave-deep-1"은 web/battle-encounters.js의
--    BATTLE_MONSTER_POOLS 키와 **정확히 같은 문자열**이어야 한다 —
--    submit_raid_run이 `v_log.battle_id is distinct from v_r.battle_id`로
--    거절하기 때문(battle_logs.battle_id는 URL의 ?battle= 값 그대로 저장됨).
--    ⚠ battle-themes.js에는 일부러 안 넣는다. battle-select.html이
--    BATTLE_THEMES만 렌더하므로, 넣지 않으면 일반 전투 목록에 안 새어나간다.
-- ----------------------------------------------------------------------------
insert into public.game_content (key, data, version)
values ('raidTable', $json${
  "cave-deep-1": {
    "name": "심층에서 올라온 것",
    "battleId": "raid-cave-deep-1",
    "summonItem": "심층의 부름",
    "bossMonsterId": "raid_deep_dweller",
    "bossMaxHp": 3000000,
    "durationHours": 72,
    "maxParticipants": 20,
    "maxAttemptsPerUser": 5,
    "maxDamagePerRun": 1000000,
    "runCooldownSeconds": 30,
    "gimmickPoints": {
      "swift-40": 300000,
      "no-loss": 250000,
      "adds-clear": 200000,
      "deny-recovery": 400000,
      "witness-retreat": 150000
    },
    "gimmickRules": {
      "swift-40": {
        "label": "40턴 이내에 전투 종료",
        "when": { "metric": "turnsElapsed", "cmp": "lte", "value": 40 }
      },
      "no-loss": {
        "label": "아무도 쓰러지지 않음",
        "when": { "metric": "allyDeaths", "cmp": "eq", "value": 0 }
      },
      "adds-clear": {
        "label": "소환된 개체를 모두 정리",
        "when": { "metric": "enemyCreaturesAlive", "cmp": "eq", "value": 0 }
      },
      "deny-recovery": {
        "label": "완전 회복을 끝까지 저지",
        "when": { "metric": "actNotSeen", "value": "PANIC_FULL_RECOVERY" }
      },
      "witness-retreat": {
        "label": "퇴각하는 순간을 목격",
        "when": { "metric": "actSeen", "value": "RETREAT" }
      }
    },
    "rewardPool": {
      "gold": 600000,
      "items": [
        { "name": "정동석", "category": "material", "quantity": 5 }
      ]
    }
  }
}$json$::jsonb, '2026-08-31a')
on conflict (key) do update set data = excluded.data, version = excluded.version, updated_at = now();

-- ----------------------------------------------------------------------------
-- 2. 레이드 보스를 monsterRoster에 append.
--    ⚠ 배열 연결이라 재실행하면 중복 추가된다 — 한 번만 실행할 것(0025와 동일).
--
--    패턴 설계:
--      · hp<=2% → REWARD_GRANT(maxUses:1) → RETREAT(maxUses:1)
--        REWARD_GRANT가 chains:true라 같은 턴에 RETREAT까지 이어진다
--        (registries.js:263 주석의 "REWARD_GRANT -> SELF_DETONATION 같은 한 묶음
--        연계"와 정확히 같은 구조).
--      · hp<=50% → PANIC_FULL_RECOVERY(maxUses:1)
--        "deny-recovery" 기믹의 대상 — 이걸 쓰기 전에 50% 밑으로 몰아붙이지
--        않고 넘기거나, 다른 방법으로 저지하면 가산점.
--        ⚠ 이 액션은 자체 횟수 제한이 없어서 반드시 maxUses로 묶어야 한다
--        (registries.js:585-588 주석).
--      · battleTurn>=1 → SUMMON_OPENING(maxUses:1) — "adds-clear"의 대상.
--      · always → 강타
--    maxHp는 자리표시자(런타임에 남은 풀 HP로 덮어씀). tier:"boss"라 결과
--    화면에서 HP 절대수치가 가려진다(2026-08-21 은폐 정책).
-- ----------------------------------------------------------------------------
update public.game_content
set
  data = data || $monsters$[
    {"id":"raid_deep_dweller","name":"심층에서 올라온 것","portrait":"🕳️","realStats":{"str":30,"int":20,"dex":15,"spd":14,"luk":20},"maxHp":3000000,"maxSp":2000,"combatReal":{"atk":40,"matk":30,"def":60,"mdef":60,"summonEff":80},"tier":"boss","rewardObjectSpec":{"name":"심층의 보물상자","maxHp":50000,"goldReward":2000,"expReward":500,"dropTable":[{"name":"정동석","category":"material","chance":1,"quantity":[3,6]},{"name":"철광석","category":"material","chance":1,"quantity":[5,10]},{"name":"심층의 부름","category":"consumable","chance":0.5,"quantity":[1,1]}]},"summonAbility":{"candidates":[{"monsterId":"cave_stalactite_crusher","weight":50},{"monsterId":"cave_crystal_golem","weight":50}]},"patterns":[{"subject":"self","metric":"battleTurn","comparator":"gte","value":1,"action":"SUMMON_OPENING","maxUses":1},{"subject":"self","metric":"hp","comparator":"lte","value":50,"action":"PANIC_FULL_RECOVERY","maxUses":1},{"subject":"self","metric":"hp","comparator":"lte","value":2,"action":"REWARD_GRANT","maxUses":1},{"subject":"self","metric":"hp","comparator":"lte","value":2,"action":"RETREAT","maxUses":1},{"subject":"self","metric":"always","action":"짓밟기"}],"expReward":300,"goldReward":150,"dropTable":[]}
  ]$monsters$::jsonb,
  version = '2026-08-31b'
where key = 'monsterRoster';
