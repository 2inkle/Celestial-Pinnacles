# diff-add-raid-summon-item-drop-2026-08-31.md — 심층의 부름 드랍 경로 (2026-08-31)

⚠ 브랜치 고유 파일명 규칙. 병합 검토 끝나면
`git rm diff-add-raid-summon-item-drop-2026-08-31.md`로 제거 권장.

- **기준 브랜치**: `main`(커밋 `a32520a`, 드리프트 없음 — 앞선
  `raid-gimmick-logic-2026-08-31`이 이미 병합된 상태에서 새로 분기)
- **작업 브랜치**: `add-raid-summon-item-drop-2026-08-31`(커밋 1개)
- **변경 파일**: `CLAUDE.md`,
  `supabase/migrations/0029_king_drops_raid_summon.sql`(신규, **미실행**)

## 배경

레이드 소환 아이템 "심층의 부름"이 `raidTable`(0028)엔 지정돼 있었지만 획득
경로가 없었다(다음 세션 TODO 2번 항목). 사용자가 "보스 드랍 아이템 중에서도
아주 낮은 확률로 드랍되도록 하겠다"고 확정. 실제 `dropTable`을 가진 보스가
지금은 고블린의 왕(0-tier)뿐이라 거기 붙였다 — 동굴 5층 보스가 생기면
그쪽에도 추가할 수 있다.

## 이번에 한 것

`0029_king_drops_raid_summon.sql`(미실행):
- 확률 0.02(2%) — 이 보스의 기존 최저 확률(오래된 바퀴 자국 0.12)보다 뚜렷하게
  낮음. `category:"consumable"`(경매 거래 가능해야 소환서 시장이 형성됨).
- `0023`/`0024`와 같은 정밀 병합(`jsonb_agg` + `case when id=...`) —
  `monsterRoster` 배열 전체를 다시 쓰지 않고 `goblin_king` 원소 하나만 건드림.

## ⚠ 병합 전 반드시 읽을 것

**멱등이 아니다.** 재실행하면 `dropTable`에 "심층의 부름" 항목이 매번 추가돼
확률이 중복 누적된다(0.02가 아니라 사실상 더 높아짐). **한 번만 실행할 것.**

**파견 loot 구조 결함이 이 아이템에도 그대로 적용된다.** 고블린의 왕은 파견
2000턴 예산 안에서 300회 이상 반복 조우된다(이전 세션의 "[P0] 파견 전리품
정산" 조사). 0.02 확률이라도 그만큼 반복되면 원본 누적량이 `LOOT_DIVISOR=100`을
넘어 사실상 확정 획득이 될 수 있다. **이 구조 자체는 이번 브랜치에서 안 고침**
(범위 밖) — CLAUDE.md에 재차 기록만 해뒀다. 실제로 문제가 되는지는 파견으로
실측해봐야 안다.

## 병합 전 체크리스트

- [x] `jsonb_agg`/`case when`이 `0023`/`0024`와 같은 형태인지 대조
- [x] 확률 0.02가 기존 최저(0.12)보다 명확히 낮은지 확인
- [ ] **실행 검증 안 됨**(Node/psql 없음)
- [ ] 실행은 **한 번만**(비멱등)
- [ ] 실행 후 실제로 파견에서 반복 파밍했을 때 원본 누적량이 100을 넘는지
      실측 — 넘으면 파견 loot 구조 개편(기존 미해결 P0)이 이 아이템 때문에도
      더 시급해짐

## 병합 방법

```bash
git fetch origin
git show origin/add-raid-summon-item-drop-2026-08-31:CLAUDE.md | head -40
git merge origin/add-raid-summon-item-drop-2026-08-31
git rm diff-add-raid-summon-item-drop-2026-08-31.md
git commit
# 병합 후: 0029를 Supabase에서 한 번만 실행.
```

## 다음 세션 TODO

1. `0029` 실행(한 번만).
2. `web/raid.html` UI, `web/auction.html` UI, 골드 쓰기 선행 버그 수정 —
   기존 TODO 그대로.
3. 파견으로 이 아이템을 반복 파밍했을 때 실제 누적 확률 실측.
