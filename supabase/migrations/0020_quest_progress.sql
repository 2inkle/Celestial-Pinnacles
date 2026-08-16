-- ============================================================================
-- 0020_quest_progress.sql — 임무 시스템(모험가 길드) 진행 상태
--
-- 임무 정의(카탈로그)는 game_content가 아니라 web/quest-table.js에
-- battle-themes.js와 같은 패턴(정적 JS 파일, 여러 페이지가 공용으로 로드)
-- 으로 둔다 — 지금은 임무 종류가 적고 전용 편집기 UI를 만들 계획이 없어서,
-- skillTable처럼 자주 바뀌는 데이터와 달리 코드로 직접 관리하는 쪽이 가볍다.
--
-- 이 테이블은 "유저가 각 임무를 지금까지 몇 번 완료했는지 / 마지막으로
-- 언제 완료했는지"만 기록한다. 완료 조건 충족 여부 자체(전투를 클리어했는지,
-- 아이템을 충분히 갖고 있는지)는 저장하지 않고 quest-table.js의 정의 +
-- battle_progress/warehouse_items를 매번 즉석에서 대조해서 계산한다 —
-- "반복 가능 임무는 마지막 완료 이후 조건을 다시 충족해야 한다"는 규칙이
-- last_completed_at과 battle_progress.cleared_at 시각 비교만으로 표현되므로,
-- 조건 판정 결과 자체를 캐싱할 필요가 없다.
-- ============================================================================

create table public.quest_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  quest_id text not null, -- web/quest-table.js의 quest.id와 대응(정적 데이터라 FK로 안 묶음, battle_progress.battle_id와 동일한 패턴)
  completed_count integer not null default 0,
  last_completed_at timestamptz,
  primary key (user_id, quest_id)
);

alter table public.quest_progress enable row level security;

create policy "quest_progress: 본인 소유만 CRUD" on public.quest_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
