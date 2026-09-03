# diff-dispatch-loot-kill-compression-fix-2026-08-31.md — 파견 전리품 정산 재설계 (2026-08-31)

⚠ 브랜치 고유 파일명 규칙. 병합 검토 끝나면
`git rm diff-dispatch-loot-kill-compression-fix-2026-08-31.md`로 제거 권장.

- **기준 브랜치**: `main`(커밋 `a32520a`, 드리프트 없음)
- **작업 브랜치**: `dispatch-loot-kill-compression-fix-2026-08-31`(커밋 2개)
- **변경 파일**: `CLAUDE.md`, `web/dispatch.html`(실제 런타임 코드,
  마이그레이션 아님 — 바로 반영됨)

## 배경

2026-08-25에 발견하고 그동안 "다음에 정말 고쳐야 할 선행 과제"로만 계속
기록해뒀던 파견 전리품 정산 구조 결함을 이번에 실제로 고쳤다. 사용자가
"골드 쓰기 선행 버그(3번)는 없는 셈 치고, 파견 loot 구조 개편(4번)으로
가자"고 우선순위를 명확히 했다.

**문제**: 예전 방식(`floor(누적수량/100) + 확률적 나머지`)은 파견 안에서
같은 몬스터가 몇 번이든 잡힐 수 있다는 전제가 없었다. raw 누적량이 100 미만인
아이템(희귀 아이템 전부)은 몬스터를 몇 번 잡든 최종 결과가 항상 "0개 또는
1개"였고, 반대로 몬스터가 300번 넘게 잡히면(고블린 왕 실측 340회) 15% 드랍인
"왕의 대검"도 raw≈51이 되어 파견 한 번에 획득 확률이 51%까지 치솟았다.

## 고친 방식

"몬스터를 죽인 킬 카운트" 자체를 먼저 `LOOT_DIVISOR`로 압축(확률적 반올림)한
뒤, **압축된 횟수만큼만** `engine.js`의 `grantKillReward`와 동일한 개별 확률
판정으로 드랍을 다시 굴린다. 예: 340킬 → 압축 3~4회 → 그 3~4회에 대해서만
각 드랍 아이템을 독립 재판정.

- 몬스터가 아무리 자주 잡혀도 아이템 하나하나는 직접 도전과 같은 확률 유지.
- 기댓값은 선형성으로 예전과 정확히 동일하게 보존.
- `r.lootGained`(엔진이 전투 안에서 자체적으로 굴린 드랍)는 더 이상 안 씀 —
  대신 dispatch가 `killCounts`(몬스터별 실제 격파 횟수)만 집계하고, 드랍
  판정 자체를 dispatch 쪽에서 직접 재계산한다. `allyWin`이면 그 판의
  `enemyKeys` 전원이 격파된 것이 보장되므로(전멸승 조건), 킬 카운트 집계는
  기존 승리 판정 로직에 그대로 얹었다 — **엔진(`src/engine.js`) 변경 없음.**

## 병합 전 체크리스트

- [x] 압축 공식(`floor(exact) + 확률적 나머지`)이 킬 카운트에 적용되는지,
      과거 세션에 제안해둔 방향과 일치하는지 대조
- [x] `engine.js`의 드랍 성공 조건(`Math.random() > drop.chance`면 실패)과
      새 코드(`Math.random() <= drop.chance`면 성공)가 논리적으로 동치인지 확인
- [x] `finalLoot` 각 항목이 여전히 `buildWarehouseInsertFromLoot`이 읽는
      전체 필드(`name`/`category`/`combatReal`/`weight`/...)를 갖는지 —
      `{...drop, quantity, attempts}` 스프레드로 보존됨을 확인
- [x] `<script>` 블록 괄호 균형: 수정 전 118/118·263/263 →
      수정 후 120/120·287/287(델타가 추가 코드량과 일치)
- [ ] **실제 실행/확률 분포 검증 안 됨** — 이 세션엔 Node.js가 없음
- [ ] `simulate.js`로 실제 파견을 돌려 압축된 시행 횟수·최종 드랍 분포가
      의도대로(고빈도 아이템은 안정적으로, 희귀 아이템은 파밍량 비례로) 나오는지
      실측 필요

## 병합 방법

```bash
git fetch origin
git show origin/dispatch-loot-kill-compression-fix-2026-08-31:CLAUDE.md | head -60
git merge origin/dispatch-loot-kill-compression-fix-2026-08-31
git rm diff-dispatch-loot-kill-compression-fix-2026-08-31.md
git commit
# web/dispatch.html은 정적 코드 — 병합만 되면 바로 반영됨(마이그레이션 없음).
```

## 전체 diff — web/dispatch.html

```diff
diff --git a/web/dispatch.html b/web/dispatch.html
index 08f399b..b7e105f 100644
--- a/web/dispatch.html
+++ b/web/dispatch.html
@@ -129,8 +129,23 @@
 //
 // 다만 "유리하다"이지 "독점한다"가 아님 — 파견은 게임에 시간을 많이 쓰기
 // 어려운 사람도 한 번 성취한 구간에서는 주기적으로 보상을 얻어, 액티브 유저와의
-// 격차가 지나치게 벌어지지 않게 하려고 만든 구획이다. 그래서 전리품 정산은
-// 단순 내림이 아니라 확률적 반올림을 쓴다(아래 finalLoot 참조).
+// 격차가 지나치게 벌어지지 않게 하려고 만든 구획이다.
+//
+// ⚠ 전리품 정산 방식(2026-08-31 재설계, "[P0] 파견 전리품 정산" CLAUDE.md 참고):
+// 예전엔 "누적 드랍 수량을 LOOT_DIVISOR로 나눠 반올림"했는데, 이러면 몬스터가
+// 파견 안에서 몇 번이든 잡힐 수 있다는 전제가 깨져서 — 직접 도전에선 "만나기도
+// 어렵고 나오기도 어려운" 희귀 아이템이, 파견에서 그 몬스터가 300번 넘게
+// 반복 조우되면 원본 누적량이 100을 훌쩍 넘어 사실상 확정 획득이 됐다(고블린의
+// 왕 실측: 340회 조우 → "왕의 대검" 15% 드랍의 파견 1회당 획득 확률 ≈51%).
+// 그렇다고 raw가 낮은 아이템도 결국 "0 또는 1개"로 상한이 걸려, 51개어치
+// 파밍한 성과와 1개어치 파밍한 성과가 똑같이 동전 던지기 하나로 뭉개지는
+// 역전 구조였음.
+//
+// 지금은 "킬 횟수 자체를 먼저 압축하고, 그 압축된 횟수만큼만 독립적으로
+// 드랍을 재판정"하는 방식(아래 finalLoot 계산 참조) — 몬스터가 파견에서
+// 아무리 자주 잡혀도 각 드랍 판정은 "직접 도전과 완전히 같은 확률"을 유지한다.
+// 기댓값(장기 평균 획득량)은 예전과 동일하게 보존됨(선형성 — 압축된 시행
+// 횟수의 기댓값이 raw/LOOT_DIVISOR이므로).
 //
 // 8이라는 값의 근거: 파견 1장으로 "Lv10 → Lv15"가 대략 1.4장에 도달하도록
 // 역산한 값(실측 기준 2000턴 파견의 현지 경험치 약 76,000 ÷ 8 ≈ 9,500,
@@ -146,6 +161,9 @@
   // 1장에 60개씩 쏟아지고(4세트가 20개), 아이템에 맞추면 레벨이 안 오름.
   // 참고: LOOT 쪽 100은 EXP의 8과 달리 실측 역산이 아니라 위 역할 분담 의도만
   // 보고 정한 값임(근거 강도가 다름 — CLAUDE.md의 API 검증 항목에도 적어둠).
+  // ⚠ 2026-08-31부터 이 값의 역할이 바뀜 — 더 이상 "드랍 수량을 나누는" 값이
+  // 아니라 "몬스터를 잡은 횟수를 압축하는" 값. 100번 잡을 때마다 압축된
+  // 시행 1회로 취급한다(아래 finalLoot 계산 참조).
   const EXP_DIVISOR = 8;
   const LOOT_DIVISOR = 100;
   const TICKET_NAME = "파견 의뢰권";
@@ -330,7 +348,12 @@
       const party = roster.filter((c) => selected.has(c.id));
       let spent = 0, runs = 0, wins = 0;
       let exp = 0, gold = 0;
-      const loot = new Map();
+      // 몬스터별 실제 조우(=격파) 횟수 — engine.js의 드랍 롤(r.lootGained)은
+      // 이제 안 씀. 대신 이 킬 카운트를 압축해서 우리가 직접 재판정한다
+      // (아래 finalLoot 계산). allyWin이면 그 판의 enemyKeys 전원이
+      // 격파된 것이 보장됨(전멸승 조건과 동일 — 소환된 잡몹은 enemyKeys에
+      // 안 잡히므로 이 카운트에서 자연히 제외됨, 원래도 그랬음).
+      const killCounts = new Map();
 
       while (spent < TURN_BUDGET) {
         const enemyKeys = window.BattleEncounters.spawnEnemies(battleId).map((e) => e.monsterId);
@@ -343,12 +366,7 @@
           wins += 1;
           exp += r.expGained || 0;
           gold += r.goldGained || 0;
-          (r.lootGained || []).forEach((l) => {
-            const key = l.name;
-            const cur = loot.get(key) || { ...l, quantity: 0 };
-            cur.quantity += l.quantity;
-            loot.set(key, cur);
-          });
+          enemyKeys.forEach((id) => { killCounts.set(id, (killCounts.get(id) || 0) + 1); });
         }
       }
 
@@ -356,25 +374,44 @@
       // 그냥 버림.
       const finalExp = Math.floor(exp / EXP_DIVISOR);
       const finalGold = Math.floor(gold / EXP_DIVISOR);
-      // 전리품은 확률적 반올림 — 몫만 주고 나머지는 그 비율만큼의 확률로 1개 더.
-      // 예전엔 그냥 내림이라, 파견 한 번의 원본 누적량이 100을 못 넘는 아이템은
-      // 영구히 0개가 됐음(왕관 조각·섭정의 인장·바퀴 자국 등이 파견으로는 아예
-      // 안 나왔음 — 확률이 낮은 게 아니라 구조적으로 불가능했음). 파견은 시간을
-      // 많이 못 쓰는 사람도 주기적으로 성취를 얻으라고 만든 구획이므로 "희귀할
-      // 뿐 불가능하지는 않게" 바꿈. 기댓값은 정확히 1/LOOT_DIVISOR로 보존되고
-      // (내림으로 버려지던 최대 99개분 손실도 사라짐 — 흔한 재료 실측 1.75→2.10),
-      // 흔한 재료의 분산은 그대로 낮게 유지됨(±1개).
-      const finalLoot = [...loot.values()]
-        .map((l) => {
-          const exact = l.quantity / LOOT_DIVISOR;
-          let quantity = Math.floor(exact);
-          if (Math.random() < exact - quantity) quantity += 1;
-          return { ...l, rawQuantity: l.quantity, quantity };
-        })
-        .filter((l) => l.quantity > 0);
+
+      // 전리품 — "킬 카운트 압축 후 독립 재판정" (2026-08-31 재설계).
+      // 몬스터별 raw 킬 횟수를 LOOT_DIVISOR로 확률적 반올림해 "압축된 시행
+      // 횟수"를 구하고(예: 340킬 → 압축 3~4회), 그 횟수만큼만 실제
+      // monsterTable의 dropTable을 engine.js의 grantKillReward와 동일한
+      // 방식(개별 확률 판정 + [min,max] 수량 굴림)으로 다시 돌린다.
+      // → 몬스터가 파견에서 아무리 자주 잡혀도 아이템 하나하나는 "직접
+      // 도전과 완전히 같은 확률"을 유지함(자주 마주친다고 희귀도가
+      // 무력화되지 않음). 기댓값은 예전과 동일(선형성 — 압축 시행 횟수의
+      // 기댓값이 정확히 raw/LOOT_DIVISOR).
+      // attempts는 화면 표시용 — 이 아이템이 몇 번의 압축 시행 중 나왔는지
+      // (여러 몬스터가 같은 이름을 드랍하면 합산됨, 진짜 판정 근거는 이미
+      // 위에서 다 끝났고 이건 참고용 숫자일 뿐).
+      const loot = new Map();
+      killCounts.forEach((rawKills, monsterId) => {
+        const dropTable = monsterTable[monsterId]?.dropTable;
+        if (!dropTable || !dropTable.length) return;
+
+        const exactKills = rawKills / LOOT_DIVISOR;
+        let compressedKills = Math.floor(exactKills);
+        if (Math.random() < exactKills - compressedKills) compressedKills += 1;
+
+        for (let i = 0; i < compressedKills; i++) {
+          dropTable.forEach((drop) => {
+            const cur = loot.get(drop.name) || { ...drop, quantity: 0, attempts: 0 };
+            cur.attempts += 1;
+            if (Math.random() <= drop.chance) {
+              const [min, max] = drop.quantity;
+              cur.quantity += min + Math.floor(Math.random() * (max - min + 1));
+            }
+            loot.set(drop.name, cur);
+          });
+        }
+      });
+      const finalLoot = [...loot.values()].filter((l) => l.quantity > 0);
 
       await applyRewards(party, finalExp, finalGold, finalLoot);
-      renderResult({ runs, wins, spent, exp, gold, loot: [...loot.values()], finalExp, finalGold, finalLoot });
+      renderResult({ runs, wins, spent, exp, gold, finalExp, finalGold, finalLoot, killCounts: [...killCounts.entries()] });
 
       btn.textContent = "파견 보내기";
       renderPre(); renderMembers();
@@ -448,11 +485,11 @@
         </div>
       </div>
       <div class="block">
-        <h2 class="section-title">전리품 <span class="hint">현지 수급량을 ${LOOT_DIVISOR}로 나눠 정산했어요</span></h2>
+        <h2 class="section-title">전리품 <span class="hint">몬스터 조우 ${LOOT_DIVISOR}회당 압축 시행 1회로 재판정했어요</span></h2>
         ${r.finalLoot.length ? r.finalLoot.map((l) => `
           <div class="loot">
             <span class="loot-name">${l.name}</span>
-            <span><span class="raw">현지 ${l.rawQuantity} → </span><span class="loot-qty">×${l.quantity}</span></span>
+            <span><span class="raw">압축 시행 ${l.attempts}회 → </span><span class="loot-qty">×${l.quantity}</span></span>
           </div>`).join("")
         : `<div class="empty">이번엔 가져온 전리품이 없어요.<br />
              희귀한 물건은 직접 다녀오시는 편이 확실합니다.</div>`}
```

(CLAUDE.md diff는 이 커밋 목록 그대로 저장소에서 직접 확인 — 새 "[P0 해결]"
섹션 + 원본 "[P0]" 섹션 제목에 해결 표시 링크 추가, 총 2군데.)

## 다음 세션 TODO

1. `simulate.js`로 실제 파견 돌려 압축·재판정 분포 실측.
2. 골드 쓰기 선행 버그(3번)는 이번 사용자 지시로 보류 — 나중에 다시 우선순위
   판단 필요.
3. `web/raid.html`/`web/auction.html` UI는 여전히 미착수.
