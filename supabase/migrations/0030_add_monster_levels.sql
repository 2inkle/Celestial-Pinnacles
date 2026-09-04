-- ============================================================================
-- 0030_add_monster_levels.sql — 몬스터 로스터에 표시용 "레벨" 필드 추가
--
-- 배경: 몬스터에는 원래 레벨 개념이 없었다(플레이어 캐릭터만 레벨이 있고,
-- 몬스터는 tier:normal/elite/boss와 순수 스탯만 있었음). 세계관 논의 중
-- "몬스터가 얼마나 강한지 단편적으로 보여주는 표시가 있으면 좋겠다"는 결정에
-- 따라 도입 — 전투 수치에는 전혀 영향을 주지 않는 순수 표시(UI) 전용 필드.
--
-- "???" (unknown_entity)와 "심층에서 올라온 것" (raid_deep_dweller)은 의도적으로
-- 이 필드를 안 넣음 — 처치 불가/정체불명 존재는 레벨 자체가 없다는 뜻으로,
-- 화면에서는 web/roster-select.html·web/monster-roster.html의
-- `monster.level ?? "??"` 폴백으로 "Lv.??"가 뜬다. 별도 null 마킹이 아니라
-- 필드 부재 자체로 표현함.
--
-- 값은 밸런스 수치가 아니라 1차 제안(원래 web/monster-roster.html의 죽은
-- LEGACY_MONSTER_SEED 주석 — "고블린 마을 (Lv1~5 구간)" — 을 근거로 확정),
-- 언제든 재조정 가능. 0028/0029와 같은 정밀 병합 패턴 — monsterRoster 배열
-- 전체를 다시 쓰지 않고 각 id별로 jsonb_set만 적용. 재실행해도 매번 같은
-- 값으로 덮어쓰므로 멱등(0029와 달리 배열에 append하지 않고 set이라 안전).
-- ============================================================================

update public.game_content
set
  data = (
    select coalesce(jsonb_agg(
      case elem->>'id'
        when 'goblin_scout' then jsonb_set(elem, '{level}', '2')
        when 'goblin_warrior' then jsonb_set(elem, '{level}', '4')
        when 'goblin_shaman' then jsonb_set(elem, '{level}', '6')
        when 'goblin_noble' then jsonb_set(elem, '{level}', '8')
        when 'goblin_elite_guard' then jsonb_set(elem, '{level}', '9')
        when 'goblin_cart' then jsonb_set(elem, '{level}', '10')
        when 'goblin_regent' then jsonb_set(elem, '{level}', '11')
        when 'goblin_king' then jsonb_set(elem, '{level}', '13')
        when 'cave_bat' then jsonb_set(elem, '{level}', '14')
        when 'cave_boulder_beetle' then jsonb_set(elem, '{level}', '15')
        when 'cave_rockfall_wraith' then jsonb_set(elem, '{level}', '16')
        when 'cave_spiked_crab' then jsonb_set(elem, '{level}', '16')
        when 'cave_bear' then jsonb_set(elem, '{level}', '17')
        when 'cave_stalactite_crusher' then jsonb_set(elem, '{level}', '18')
        when 'cave_crystal_golem' then jsonb_set(elem, '{level}', '19')
        when 'cave_troll' then jsonb_set(elem, '{level}', '19')
        when 'cave_earth_spirit' then jsonb_set(elem, '{level}', '20')
        -- unknown_entity, raid_deep_dweller: 의도적으로 분기 없음 → level 필드 없음 → Lv.??
        else elem
      end
    ), '[]'::jsonb)
    from jsonb_array_elements(data) elem
  ),
  version = '2026-09-04a'
where key = 'monsterRoster';
