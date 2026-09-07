# diff-goblin-cart-fragment-easter-egg-2026-09-07.md

## 배경

사용자가 실전 공략 중 "고블린 마차가 퇴각이 아니라 몇 차례 직접 처치됐다"고
신고 → 원인을 조사(별도 SQL 변경 없이 순수 코드 리딩) → 그 결과를 정식
게임 디자인으로 채택.

**원인**: 고블린 마차(`goblin_cart`)는 HP 50% 이하에서 대사→보물상자 생성→
자폭이 체인(`chains:true`)으로 발동하는 "직접 처치 불가" 컨셉인데, 이 체인은
**마차 자신의 턴에만** 평가된다(`src/engine.js`의 `executeAction()`). 반면
사망 판정(`isAlive` = `currentHp>0`)은 아군이 때린 즉시 `checkForDeaths()`로
확정된다 — 그래서 아군의 한 타격(또는 한 턴 다단히트 합산)이 그 순간 마차의
잔여 HP를 한 번에 0 이하로 만들면, 마차는 다음 자기 턴을 못 받아 체인이
발동할 기회 자체가 없이 그냥 죽는다. 조건은 고정 데미지 값이 아니라
"타격 시점 잔여 HP 대비 상대적"(HP 몇 %든 그 순간 잔여 HP 이상의 화력이면
발생). 부수 확인: 직접 처치되면 마차 자신의 `expReward:15`만 나오고
골드·드랍은 0(전부 보물상자 쪽에 있었으므로) — 원래는 오히려 손해였음.

## 디자인 결정

이 "우연한 처치 가능성"을 버그로 막는 대신 **정식 이스터에그로 승격**:
AFTERMATH("???"전) 입장권 "불길한 마력 파편"을 보물상자의 30% 확률 드랍에서
빼고, **마차 본체를 직접 처치했을 때만 100% 확정 드랍**하도록 이전. 정상
공략(퇴각을 지켜보고 보물상자만 부숨)으로는 이제 이 아이템을 절대 못 얻는다
— "마차는 원래 처치 불가"라는 설정을 그대로 믿은 플레이어는 평생 못 얻고,
화력으로 그 불가능을 직접 시험해본 플레이어만 우연히 얻게 되는 구조. 앞으로
레벨 상한 해방에 "???"전 승리가 조건으로 걸릴 예정이라, 그 시작점 자체가
게임 안 어디에도 안내되지 않는 하나의 비밀로 남는다.

## 변경 요약

- **`0031_cart_direct_kill_easter_egg.sql`**(신규): `game_content.monsterRoster`의
  `goblin_cart` 원소 하나에 두 가지를 함께 적용(0028~0030과 동일한 정밀
  병합 패턴, jsonb_set 교체라 append와 달리 재실행해도 안전):
  1. `rewardObjectSpec.dropTable`에서 "불길한 마력 파편" 항목 제거.
  2. 마차 본체(top-level)의 `dropTable`을 `[{name:"불길한 마력 파편",
     category:"keyItem", chance:1.0, quantity:[1,1]}]`로 설정.
- **`web/battle-themes.js`**: "불길한 마력 파편은 보물상자 30% 드랍"이라는
  낡은 주석을 새 경로(마차 직접 처치 확정 드랍)로 정정.

`goblin_cart`의 퇴각/보물상자 메커니즘 자체(`RETREAT`/`REWARD_GRANT` 액션,
체인 구조, 소환 패턴 등)는 전혀 안 건드림 — 오직 "불길한 마력 파편"이
어디서 나오는지만 이전.

## 검증

- SQL 본문(주석 제외) 괄호 균형 확인(13/13).
- `jsonb_set` 중첩 구조를 손으로 추적: 안쪽 `jsonb_set`이 `rewardObjectSpec.dropTable`을
  필터링된 배열로 교체 → 바깥쪽 `jsonb_set`이 그 결과에 top-level `dropTable`을
  추가/교체 → `goblin_cart`가 아닌 원소는 `case ... else elem`으로 그대로 통과.
- Node.js가 이 세션에 없어 실제 DB 반영 후 드랍 확률 실행 검증은 못 함.

## ⚠ 병합 전 체크리스트

- [ ] `game_content.monsterRoster`에 실제로 반영한 뒤, 마차를 일부러 한
      방에 처치(고화력 파티로 HP 50% 위에서 오버킬)했을 때 "불길한 마력
      파편"이 정말 100%로 나오고, 반대로 정상적으로 퇴각→보물상자를 끝까지
      깼을 때는 더 이상 안 나오는지 실측 확인 필요.
- [ ] `unknownEncounter`(AFTERMATH="???"전)의 `consumesItem` 요구사항은
      아이템 이름("불길한 마력 파편")만 보므로 이번 변경과 자동으로 호환됨
      — 별도 수정 불필요, 확인만.

## 병합 방법

`goblin-cart-fragment-easter-egg-2026-09-07` 브랜치를 주 워크스테이션에서
pull 후 그대로 병합, `0031`을 Supabase에 실행.

## 전체 diff

```diff
diff --git a/supabase/migrations/0031_cart_direct_kill_easter_egg.sql b/supabase/migrations/0031_cart_direct_kill_easter_egg.sql
new file mode 100644
index 0000000..bef571c
--- /dev/null
+++ b/supabase/migrations/0031_cart_direct_kill_easter_egg.sql
@@ -0,0 +1,66 @@
+-- ============================================================================
+-- 0031_cart_direct_kill_easter_egg.sql — "불길한 마력 파편"을 보물상자가
+-- 아니라 "고블린 마차를 직접 처치했을 때"만 확정 드랍하도록 이전
+--
+-- 배경: 고블린 마차(goblin_cart)는 원래 "직접 처치 불가" 컨셉이다 —
+-- HP 50% 이하가 되면 대사→보물상자 생성→자폭(RETREAT류 연출)이 체인으로
+-- 발동해서, 정상적인 공략으로는 마차 본체를 죽일 수 없고 항상 이 스크립트로
+-- 마무리된다(src/engine.js:340-373 executeAction, 패턴은 마차 "자기 턴"에만
+-- 평가됨). 그런데 엔진 구조상 아군의 한 타격(또는 한 턴 다단히트 합산)이
+-- 그 순간 마차의 잔여 HP를 한 번에 0 이하로 만들면, 마차는 다음 자기 턴을
+-- 받지 못해 저 체인이 아예 발동하지 못하고 "그냥" 죽는다(isAlive은
+-- currentHp>0 하나로 즉시 판정되고, checkForDeaths()가 매 유닛 행동 직후
+-- 곧바로 도는 구조라 죽음 처리가 마차의 다음 턴보다 먼저 확정됨). 사용자가
+-- 실전 공략 중 이 현상을 몇 차례 관측해서 원인을 물어봤고(정확한 조건: 그
+-- 타격 시점의 마차 잔여 HP 이상의 화력이 한 번에 들어갈 때, HP 몇 %인지와
+-- 무관하게 발생), 조사 결과를 들은 뒤 이 "우연한 처치 가능성"을 정식
+-- 이스터에그로 승격시키기로 결정함.
+--
+-- 새 설계: "불길한 마력 파편"(AFTERMATH="???"전 입장권)을 보물상자의 30%
+-- 확률 드랍에서 빼고, 대신 **마차 본체를 직접 처치했을 때만 확정(100%)
+-- 드랍**하도록 옮김. 정상적인 공략(퇴각→보물상자를 부숴 마무리)으로는 이제
+-- 이 아이템을 얻을 수 없다 — "마차는 원래 처치 불가"라는 세계관을 곧이곧대로
+-- 믿은 플레이어는 절대 못 얻고, "정말 안 죽는지" 화력으로 직접 시험해본
+-- 플레이어만 우연히 얻게 되는 구조. 이후 레벨 상한 해방에 "???"전 승리가
+-- 필요해질 예정이므로, 그 시작점 자체가 하나의 비밀로 남는다(사용자 의도).
+--
+-- 0028/0029/0030과 동일한 정밀 병합 패턴 — monsterRoster 배열 전체를 다시
+-- 쓰지 않고 id가 goblin_cart인 원소 하나만 찾아 두 가지를 함께 적용:
+--   1) rewardObjectSpec.dropTable에서 "불길한 마력 파편" 항목 제거
+--   2) 마차 본체(top-level)의 dropTable을 확정 100% 드랍 1건으로 설정
+-- 둘 다 jsonb_set(교체)이지 append가 아니므로 재실행해도 안전(멱등) —
+-- 0029(append라 재실행 시 중복 위험)와는 다른 패턴임에 유의.
+-- ============================================================================
+
+update public.game_content
+set
+  data = (
+    select coalesce(jsonb_agg(
+      case when elem->>'id' = 'goblin_cart'
+        then jsonb_set(
+          jsonb_set(
+            elem,
+            '{rewardObjectSpec,dropTable}',
+            coalesce((
+              select jsonb_agg(d)
+              from jsonb_array_elements(elem->'rewardObjectSpec'->'dropTable') d
+              where d->>'name' <> '불길한 마력 파편'
+            ), '[]'::jsonb)
+          ),
+          '{dropTable}',
+          jsonb_build_array(
+            jsonb_build_object(
+              'name', '불길한 마력 파편',
+              'category', 'keyItem',
+              'chance', 1.0,
+              'quantity', jsonb_build_array(1, 1)
+            )
+          )
+        )
+        else elem
+      end
+    ), '[]'::jsonb)
+    from jsonb_array_elements(data) elem
+  ),
+  version = '2026-09-07a'
+where key = 'monsterRoster';
diff --git a/web/battle-themes.js b/web/battle-themes.js
index d5819bd..9898136 100644
--- a/web/battle-themes.js
+++ b/web/battle-themes.js
@@ -57,8 +57,11 @@
     // 아무것도 미리 알려주지 않음. roster-select.html의 몬스터 미리보기가
     // 몬스터 데이터의 name/portrait를 그대로 보여주는 구조라, 이 필드
     // 자체를 "???"/"❓"로 두는 것만으로 별도 은폐 코드 없이 안 새어나감
-    // (조사 완료 — 확정). "불길한 마력 파편"(고블린 수송대 보물상자의
-    // 30% 드랍) 소지가 입장 조건. 몬스터 쪽(BATTLE_MONSTER_POOLS의
+    // (조사 완료 — 확정). "불길한 마력 파편" 소지가 입장 조건 — 2026-09-07부터
+    // 보물상자가 아니라 "고블린 마차(goblin_cart) 본체를 직접 처치"했을 때만
+    // 확정 드랍(이스터에그, 0031 마이그레이션 참고. 마차는 원래 "직접 처치
+    // 불가" 컨셉이라 정상 공략으로는 절대 안 나옴 — 화력으로 그 불가능을
+    // 실제로 깬 플레이어만 우연히 얻게 되는 구조). 몬스터 쪽(BATTLE_MONSTER_POOLS의
     // "unknown-battle", web/monster-roster.html의 "unknown_entity")은
     // 골격만 잡아둔 상태 — 실제 스탯/패턴은 다음에 채울 것.
     {
```

## 다음 세션 TODO

- 실제 DB 반영 후 드랍 확률 실측(위 체크리스트).
- 레벨 상한 해방 조건("???"전 승리)의 구체적 구현은 별도 트랙 — 아직
  미착수(레벨 상한 확장 메커니즘 자체가 CLAUDE.md에 "미착수"로 기록돼
  있음, 이번 변경은 그 진입 경로만 비밀스럽게 만든 것).
