# diff-pvp-auction-raid-design-2026-08-31.md — 경매장 + 협동 레이드 설계/스키마 초안 (2026-08-31)

⚠ 브랜치 고유 파일명 규칙. 병합 검토 끝나면
`git rm diff-pvp-auction-raid-design-2026-08-31.md`로 제거 권장.

- **기준 브랜치**: `main`(커밋 `5fb5d37`, 드리프트 없음)
- **작업 브랜치**: `pvp-auction-raid-design-2026-08-31`
- **변경 파일**: `CLAUDE.md`, `supabase/migrations/0026_auction_house.sql`(신규,
  **미실행**), `supabase/migrations/0027_coop_raid.sql`(신규, **미실행**)
- **코드(웹) 변경 없음** — UI는 이번 범위 밖.

## ⚠ 병합해도 아무 일도 안 일어남 / 실행해야 반영됨

이 브랜치는 **마이그레이션 파일만 추가**한다. git 병합만으로는 DB에 아무 영향이
없다. Supabase 콘솔에서 직접 실행해야 반영되고, **반드시 `0026` → `0027` 순서**로
실행할 것(0027의 보상 지급이 0026의 `_grant_item_snapshot()`을 재사용한다).

## 배경 요약

사용자가 "타 플레이어와의 상호작용"(경매장 + 협동 레이드)을 논의 대상으로 꺼냈고,
조사 결과 **이 게임이 지금까지 완전한 1인용**이라는 게 확인됐다:
0001의 RLS가 전부 `auth.uid() = user_id`이고, 남의 데이터를 읽는 경로는 0021의
`get_shared_battle_log`(좁은 `security definer` RPC) 하나뿐. Realtime 0곳,
Edge Function 없음, pg_cron 없음, 전투는 100% 클라이언트 동기 실행.

그래서 설계의 축을 **"읽기는 넓게, 쓰기는 RPC로만"** 으로 잡았다. 새 테이블에
INSERT/UPDATE/DELETE 정책을 **아예 만들지 않아**(RLS 켜짐 + 정책 없음 = 무조건
거부) 클라이언트 직접 쓰기 표면 자체를 없애고, 모든 mutation을 한 트랜잭션짜리
`security definer` 함수로 묶는다. 행위자는 함수 안에서 `auth.uid()`로 판별하고,
금액도 파라미터로 받지 않는다(`buyout_auction_listing`에는 가격 인자가 없음).

## 사용자가 확정한 사항

| 항목 | 결정 |
|---|---|
| 신뢰 모델 | 경매/레이드 mutation만 RPC로 원자화. 골드 위조 자체는 감수. |
| 거래 범위 | keyItem 제외 전부(강화/개조된 개별 인스턴스 포함) |
| 경매 방식 | 즉시구매 + 입찰 둘 다 |
| 경매 가격 | 자유 입력, 하한만 |
| 레이드 모델 | 비동기 누적 데미지 + 기믹 성공 시 가산점 |
| 레이드 개설 | 양산 가능한 인스턴스제, **전투 밖에서** 아이템 소모 |
| 레이드 공개 | 살아있는 것 전부 공유, 참여 가능한 것만 필터해 출력 |
| 레이드 보상 | 처치 시 기여도(데미지+기믹점수) 비례로 참가자 전원 |

## ⚠ 병합 전 반드시 읽을 것 — 선행 버그와 리스크

1. **정상 플레이어가 당하는 실제 버그(치팅 아님)**: `shop.html`은 페이지 로드
   시점 골드를 JS 변수에 들고 있다가 `{ gold: currentGold - total }` **절대값**을
   쓴다(1161/1247행 근방). `battle-view.html`(596행 근방)도 같다. **상점을
   열어둔 채 내 경매가 낙찰되면 다음 구매가 낙찰 이전 스냅샷으로 골드를 덮어써서
   판매대금이 증발한다.** 경매장을 실제 배포하기 전에 이 세 곳을 상대 갱신으로
   바꿔야 한다. 스키마 문제가 아니라 기존 클라이언트 코드 문제라 이 브랜치에
   포함되어 있지 않음.
2. **골드 위조의 성격 변화**: 지금까지 위조 골드는 고정 카탈로그(NPC 상점)에서만
   쓸 수 있어 피해가 본인에게 갇혀 있었다. 경매장이 생기면 위조 골드가 **다른
   실제 플레이어의 아이템**을 사간다. 사용자가 감수하기로 했지만, 후속으로
   append-only `gold_ledger`를 권장(위조 탐지 + 되돌릴 근거).
3. **레이드 데미지는 끝내 자기신고값**이다. `submit_raid_run`이 데미지 인자를
   받지 않고 `battle_logs`에서 읽게 한 것은 공격 비용을 올리고 증거를 남기려는
   것이지 방어가 아니다. 위조 로그를 만들면 여전히 뚫린다.

## 병합 전 체크리스트

- [x] 새 RPC 전부 `security definer` + `set search_path = public` (스크립트 대조 완료)
- [x] 새 테이블에 INSERT/UPDATE/DELETE 정책이 **하나도 없음** (대조 완료)
- [x] 행위자를 파라미터가 아닌 `auth.uid()`로 판별 (caller-id 파라미터 0건)
- [x] `create_auction_listing`이 `category <> 'keyItem'` + `held_by is null` +
      `user_id = auth.uid()` 세 가지를 모두 검사
- [x] 내부 헬퍼(`_grant_item_snapshot`/`_refund_active_bid`/
      `_settle_auction_listing`/`_settle_raid_rewards`)는 grant 없이 revoke만
      — 직접 호출 가능하면 아이템 무한 복제가 됨
- [ ] **SQL 실행 검증 안 됨** — 이 샌드박스에 psql/Node가 없다. 문법 오류는
      실행 시점에야 드러남. 특히 `jsonb_populate_record` +
      `insert ... select (v_row).*` 조합과 `raid_participants`의
      `contribution = damage_total + v_applied + gimmick_points + v_award`
      (UPDATE 안에서 좌변 컬럼들이 갱신 전 값으로 읽히는지)를 실행 시 확인할 것
- [ ] `0026` → `0027` 순서로 실행
- [ ] `0027`은 `game_content`의 key CHECK 제약을 drop 후 재생성한다 —
      기존 제약명이 `game_content_key_check`가 맞는지 실행 전 확인
      (`\d public.game_content`)

## 병합 방법

```bash
git fetch origin
git show origin/pvp-auction-raid-design-2026-08-31:CLAUDE.md | head -200
git merge origin/pvp-auction-raid-design-2026-08-31
git rm diff-pvp-auction-raid-design-2026-08-31.md
git commit
# 병합 후: Supabase 콘솔에서 0026 → 0027 순서로 직접 실행해야 반영됨.
```

## 설계 요지(전문은 CLAUDE.md 새 섹션 참고)

**경매장** — `auction_listings` / `auction_bids` + RPC 5개.
- 등록 시 원본 `warehouse_items` 행을 **삭제**하고 `item_snapshot jsonb`로
  에스크로. 행을 남기고 플래그만 세우면 올려둔 채 장착·NPC판매·개조가 가능해
  복제가 난다.
- 스냅샷 저장/복원에 컬럼을 **절대 나열하지 않음**(`to_jsonb` /
  `jsonb_populate_record`). 0004 헤더가 기록한 컬럼 유실 버그 계열 방지.
- 입찰 골드 즉시 차감(에스크로) + `profiles.gold_locked` 신설. 스케줄러가 없어
  정산이 제3자의 페이지 로드에 얹히는 구조라, "낙찰 시 청구"로는 오프라인
  낙찰자에게서 돈을 걷어야 하고 실패 시 차순위 사다리를 돌려야 한다. 에스크로면
  정산 함수가 실패할 수 없다.
- `auction_bids(listing_id) where status='active'` 부분 유니크 인덱스로
  "매물당 잠긴 입찰 1건"을 DB가 강제 → 환불 누락이 조용히 통과 못 함.
- `seller_username` 비정규화 필수 — `profiles`가 본인 행만 읽혀서 판매자 이름을
  조인할 방법이 아예 없음(`battle_logs.saved_by`와 같은 해법).

**레이드** — `raid_instances` / `raid_participants` / `raid_runs` + RPC 4개.
- 엔진 무변경. "전투 중 아이템 사용"은 포기 — 엔진에 아이템 사용 액션이 아예
  없다(`consumable`/`uses_per_battle`은 `src/` 참조 0곳인 죽은 필드).
- `submit_raid_run`에 **데미지 인자가 없다**. `battle_logs`의
  `result->'damageDealt'->>'ally'`에서 읽고, 로그 1건은 런 1회에만 쓸 수 있다.
- 레이드 정의는 `game_content.raidTable` — 기믹 배점을 서버가 쥐어야 해서
  정적 JS 관례에서 의도적으로 벗어남. 기믹은 id만 받고 유저·레이드당 1회만 인정.
- 규칙 수치는 개설 시점에 인스턴스로 스냅샷(진행 중 레이드가 안 흔들리게).
- 참가 자격 필터링은 RLS가 아니라 클라이언트에서
  (`battle-select.html`의 `REQUIREMENT_TYPES` 재사용). 강제는 RPC가 따로 함.

## 다음 세션 TODO

1. **선행**: `shop.html`/`battle-view.html` 절대값 골드 쓰기 → 상대 갱신.
2. `0026` → `0027` 실행.
3. `game_content.raidTable` 시드 + 기믹 판정을 전투 결과에서 추출하는 로직
   (엔진 이벤트 → 기믹 id) — **아직 설계 안 됨**.
4. `web/auction.html` / `web/raid.html` UI + `nav.js` 링크.
5. **미해결 정책(사용자 확인 필요)**: 만료된(실패한) 레이드의 기여도 처리.
   지금은 보상 없음 + 소환템도 반환 없음.
