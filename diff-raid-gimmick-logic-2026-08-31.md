# diff-raid-gimmick-logic-2026-08-31.md — 레이드 기믹 판정 로직 + raidTable 시드 (2026-08-31)

⚠ 브랜치 고유 파일명 규칙. 병합 검토 끝나면
`git rm diff-raid-gimmick-logic-2026-08-31.md`로 제거 권장.

- **기준 브랜치**: `main`(커밋 `d943747`, 드리프트 없음)
- **작업 브랜치**: `raid-gimmick-logic-2026-08-31`(커밋 2개)
- **변경 파일**: `CLAUDE.md`, `supabase/migrations/0028_seed_raid_table.sql`(신규,
  **미실행**), `web/raid-gimmicks.js`(신규), `web/battle-encounters.js`,
  `web/battle-view.html`

## 배경

`0026`/`0027`이 병합·실행 완료돼 경매/레이드 RPC는 라이브에 있지만, 레이드는
**데이터도 판정 로직도 없어 아무것도 돌지 않는 상태**였다. 이번에 "레이드를 실제로
한 판 돌릴 수 있는" 수준까지 채웠다.

## ⚠ 조사 중 발견한 설계 갭 — 이게 없었으면 레이드가 아예 작동 못 함

`0027`의 `submit_raid_run`은 **`battle_log_id`를 필수로 요구**한다(데미지를
파라미터가 아니라 저장된 로그에서 읽는 게 가장 값싼 방어였으므로). 그런데
`battle_logs` 저장이 **수동 "저장" 버튼**이었다(`battle-view.html:522`) —
유저가 안 누르면 기여를 제출할 방법 자체가 없다. `0027` 설계 당시 자동 저장인 줄
알았던 것이 실제로는 아니었음.

→ `insertBattleLog()`를 DOM 버튼에서 분리하고 레이드 런이면 자동 호출하게 고침.

## ★ 엔진 이벤트는 3종뿐 — 기믹 어휘를 여기에 맞춤

`recordEvent` 호출 지점 8곳 전수 조사 결과 `act` / `death` / `hit` 뿐.
**스탠스 진입, 버프 적용, 소환 마릿수, 패턴 슬롯 인덱스는 전부 관측 불가**이고,
`ATTACK` 경로 데미지는 `hit` 이벤트조차 안 낸다. 그래서 "보스가 X 스탠스에
들어가기 전에 처치" 류의 기믹은 **지금 구조로는 만들 수 없다**.

`web/raid-gimmicks.js` 헤더에 *왜* 각각이 불가능한지를 파일·행 근거와 함께
남겼다 — 다음에 누가 같은 조사를 반복하지 않도록.

## 보스는 처치 불가 — 퇴각 + 보물상자 (사용자 확정)

마차/`???`와 같은 방식이고 **엔진 변경이 없다**(`RETREAT`/`REWARD_GRANT`가 이미
구현돼 있음). 런타임에 보스 `maxHp`를 남은 공유 HP로 덮어써서, 풀을 바닥내는
마지막 런에서만 퇴각·상자가 뜬다.

**→ 중간 런은 100턴 상한에 걸려 `outcome`이 `draw`다.** 이건 버그가 아니라 설계.
그래서 기믹은 승패와 무관한 지표 위주로 짰다.

보상 두 겹: 상자 `dropTable`(그 판 즉시, 기존 전리품 경로) + `claim_raid_rewards`
(레이드 종료 시 기여도 비례).

## 병합 전 체크리스트

- [x] `raid-cave-deep-1`이 `BATTLE_MONSTER_POOLS` 키 / raidTable `battleId` /
      URL `?battle=` 세 군데 모두 동일(대조 완료) — 다르면 `submit_raid_run`이
      `v_log.battle_id is distinct from v_r.battle_id`로 거절함
- [x] `gimmickPoints`와 `gimmickRules`의 **키 집합 완전 일치**(5개, diff로 확인)
- [x] `raid-gimmicks.js`가 참조하는 결과 필드가 전부 실측 목록 안에 있음
      (`turnsElapsed`/`damageDealt.ally`/`survivorCounts.ally.{alive,total}`/
      `participants.enemy[].{creatureTier,isAlive}`/`outcome`/`events[].{type,act,turn,result,unit}`)
- [x] 괄호/중괄호 균형: `raid-gimmicks.js` 25/25·115/115,
      `battle-view.html` 인라인 스크립트 128/128·409/409(수정 전 baseline과 동일)
- [x] 레이드 함수 정의/참조 짝 맞음, `RaidGimmicks` 노출 API와 사용처 일치
- [ ] **SQL·JS 실행 검증 안 됨** — 이 샌드박스에 Node/psql이 없다
- [ ] `0028`은 `0027` 다음에 실행. `monsterRoster` append는 배열 연결이라
      **재실행하면 보스가 중복 추가됨** — 한 번만
- [ ] `web/battle-themes.js`에 `raid-cave-deep-1`을 **넣지 말 것**(넣으면 일반
      전투 목록에 노출됨). 의도적으로 `BATTLE_MONSTER_POOLS`에만 있음

## 병합 방법

```bash
git fetch origin
git show origin/raid-gimmick-logic-2026-08-31:CLAUDE.md | head -120
git merge origin/raid-gimmick-logic-2026-08-31
git rm diff-raid-gimmick-logic-2026-08-31.md
git commit
# 병합 후: Supabase 콘솔에서 0028 실행(0027 다음). 실행 전엔 라이브 반영 0.
```

## 실기기 검증 순서(다음 세션)

1. `0028` 실행.
2. 관리자 계정 `warehouse_items`에 `{name:"심층의 부름", category:"consumable",
   quantity:1}` 직접 삽입 — **소환 아이템 획득 경로가 아직 없음**(동굴 5층 보스
   드랍 등에 붙이는 건 다음 작업).
3. 콘솔에서 `sbClient.rpc("open_raid_instance", { p_raid_id: "cave-deep-1" })`
   → 반환된 인스턴스 id 확보.
4. `battle-view.html?battle=raid-cave-deep-1&raid=<id>&party=<charIds>`로 진입.
5. 확인할 것: 보스 HP가 남은 풀로 뜨는지 / 전투 후 로그가 자동 저장되는지 /
   기믹 판정 줄이 뜨는지 / `raid_participants`·`raid_runs`에 값이 맞게 쌓이는지 /
   `boss_hp_remaining`이 줄어드는지.

## 다음 세션 TODO

1. `0028` 실행 + 위 실기기 검증.
2. "심층의 부름" 획득 경로(동굴 5층 보스 드랍 등).
3. `web/raid.html` 목록/개설 UI + `nav.js` 링크.
4. `web/auction.html` 경매장 UI.
5. **선행 버그**: `shop.html`/`battle-view.html` 절대값 골드 쓰기 → 쓰기 직전
   재조회(사용자 확정 방식). 경매장 UI보다 먼저.
6. **보류**: 만료된 레이드의 기여도 정책 — 실제로 돌려보고 결정.
