# diff-monster-level-display-2026-09-04.md

## 배경

다른 채팅과 나눈 세계관 브레인스토밍(패턴=이 세계의 각본, 레벨 상한 30=투영
해상도의 한계, "???"=이 세계가 표기할 수 없는 존재 등)을 이 코드베이스와
대조해본 결과, 대부분은 이미 있는 구조에 이름만 붙이면 되는 것들이었다. 그중
"몬스터가 얼마나 강한지 단편적으로 보여주는 표시가 있으면 좋겠다, 연출적으로도
써먹을 수 있지 않나"는 사용자 판단에 따라 **몬스터 레벨 표시**만 이번 세션에서
바로 구현했다(용어 교체·파견 보고서·dialogue·게임 제목은 각각 다른 이유로
이번엔 보류 — CLAUDE.md "몬스터 레벨 표시 도입" 섹션 참고).

몬스터에는 원래 레벨 개념이 없었다(플레이어 캐릭터만 레벨 보유, 몬스터는
`tier:normal/elite/boss`와 순수 스탯만 있었음). `web/monster-roster.html`의
죽은 코드(`LEGACY_MONSTER_SEED`, 런타임 미참조)에 원 설계자가 이미 "고블린
마을 (Lv1~5 구간)"이라 적어둔 걸 발견 — 새로 지어낸 게 아니라 있던 의도를
수치로 확정한 것에 가깝다.

## 변경 요약

- **`0030_add_monster_levels.sql`**(신규): `game_content.monsterRoster`의 17개
  몬스터(0-tier 고블린 8종 + 동굴 9종)에 `jsonb_set`으로 `level` 필드 추가
  (`0028`/`0029`와 동일한 정밀 병합 패턴). `unknown_entity`("???")와
  `raid_deep_dweller`("심층에서 올라온 것")는 의도적으로 이 분기에서 제외 —
  필드 자체가 안 생겨서 `?? "??"` 폴백으로 자연히 `Lv.??`가 뜬다.
- **`web/roster-select.html`**: `renderMonsterPreview()`의 몬스터 칩에
  `Lv.${monster.level ?? "??"}` 배지 추가. 전투 진입 전 몬스터 이름이 노출되는
  유일한 지점(2026-08-20에 진형 프리뷰가 제거된 이후).
- **`web/monster-roster.html`**: 관리자용 로스터 카드 목록에도 레벨 행 추가
  (향후 몬스터 추가/편집 시 바로 확인 가능하도록).

레벨 값은 전투 수치에 전혀 영향을 주지 않는 순수 표시(UI) 필드 — 밸런스
결정이 아니라 1차 제안이며 언제든 재조정 가능.

| id | name | level |
|---|---|---|
| goblin_scout | 고블린 척후병 | 2 |
| goblin_warrior | 고블린 전사 | 4 |
| goblin_shaman | 고블린 주술사 | 6 |
| goblin_noble | 고귀한 고블린 | 8 |
| goblin_elite_guard | 성채 수문장 | 9 |
| goblin_cart | 고블린 마차 | 10 |
| goblin_regent | 섭정 | 11 |
| goblin_king | 고블린의 왕 | 13 |
| unknown_entity | ??? | 없음 → Lv.?? |
| cave_bat | 동굴박쥐 | 14 |
| cave_boulder_beetle | 바위딱정벌레 | 15 |
| cave_rockfall_wraith | 낙석귀 | 16 |
| cave_spiked_crab | 가시바위게 | 16 |
| cave_bear | 동굴곰 | 17 |
| cave_stalactite_crusher | 종유석파괴자 | 18 |
| cave_crystal_golem | 수정골렘 | 19 |
| cave_troll | 동굴트롤 | 19 |
| cave_earth_spirit | 대지정령 | 20 |
| raid_deep_dweller | 심층에서 올라온 것 | 없음 → Lv.?? |

## 검증

- `0030`의 `case ... when` 분기 17개 id를 grep으로 추출해 현재 monsterRoster의
  실제 8(고블린)+9(동굴) id 목록과 diff — 완전 일치 확인(중복/오탈자 없음).
- SQL 괄호 균형 확인(28/28).
- `roster-select.html`/`monster-roster.html`은 `?? "??"` 폴백이라 필드가 없는
  두 몬스터(`unknown_entity`, `raid_deep_dweller`)에서 예외 없이 `Lv.??`를
  렌더링함 — 로직 검토로 확인(Node.js 없어 실제 실행은 못 함).

## ⚠ 병합 전 체크리스트

- [ ] `raid_deep_dweller`를 "레벨 없음" 쪽에 넣은 건 사용자가 명시적으로 확인한
      사항이 아니라 "???"와 같은 처치 불가/방문자 계열이라는 유추 판단임 —
      병합 전 재확인 필요(레벨을 주고 싶다면 `0030`에 한 줄만 추가하면 됨).
- [ ] 마이그레이션 번호 `0030` — `0029_king_drops_raid_summon.sql`이 아직
      `add-raid-summon-item-drop-2026-08-31` 브랜치에만 있고 main에 병합 안 됨.
      두 브랜치가 각각 병합될 때 번호 순서/충돌은 병합 담당(주 워크스테이션)이
      조정.
- [ ] 레벨 수치 자체(위 표)는 1차 제안 — 실측/밸런스 검토 없이 서사적 배치
      감각으로만 정함. 원하면 값만 바꾸는 후속 마이그레이션으로 쉽게 수정 가능.

## 병합 방법

`monster-level-display-2026-09-04` 브랜치를 주 워크스테이션에서 pull 후
그대로 병합. Node.js 환경에서 `game_content.monsterRoster`를 실제로 조회해
17개 id 모두 `level` 필드가 기대값대로 들어갔는지, `unknown_entity`/
`raid_deep_dweller`에는 필드가 없는지 확인하는 것을 권장.

## 전체 diff

### `supabase/migrations/0030_add_monster_levels.sql` (신규)

```sql
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
```

### `web/monster-roster.html`

```diff
@@ -453,6 +453,7 @@
             <div class="card-id">${m.id}</div>
           </div>
         </div>
+        <div class="card-row"><span>레벨</span><span class="v">Lv.${m.level ?? "??"}</span></div>
         <div class="card-row"><span>경험치/골드</span><span class="v">${m.expReward ?? 0} / ${m.goldReward ?? 0}</span></div>
         <div class="card-row"><span>패턴</span><span class="v">${(m.patterns || []).length}줄</span></div>
         <div class="card-row"><span></span><span class="open-hint">편집 →</span></div>
```

### `web/roster-select.html`

```diff
@@ -53,6 +53,7 @@
   .monster-chip .m-name { font-family:'Cinzel',serif; font-size:12.5px; color:#f2efe8; }
   .monster-chip .m-rare-tag { color:var(--gold); font-family:'JetBrains Mono',monospace; font-size:10px; }
   .monster-chip .m-prob { font-family:'JetBrains Mono',monospace; font-size:10px; color:var(--mist-dim); }
+  .monster-chip .m-level { font-family:'JetBrains Mono',monospace; font-size:10px; color:var(--cyan); }
 
   .grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(180px, 1fr)); gap:14px; }
 
@@ -286,6 +287,7 @@
               <div class="monster-chip ${e.isRare ? "rare" : ""}">
                 <span class="m-icon">${monster.portrait}</span>
                 <span class="m-name">${e.isRare ? `<span class="m-rare-tag">[Rare]</span> ` : ""}${monster.name}</span>
+                <span class="m-level">Lv.${monster.level ?? "??"}</span>
                 <span class="m-prob">${probLabel}</span>
               </div>
             `;
```

## 다음 세션 TODO

- `raid_deep_dweller`를 "레벨 없음" 쪽에 넣은 판단을 사용자에게 확인.
- CLAUDE.md에 이미 기록된 다른 세계관 논의 후속 항목들(용어 교체, dialogue
  필드 확장, 게임 제목 결정, 아이템 플레이버 텍스트)은 각각 별도 세션에서.
