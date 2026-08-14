-- ============================================================================
-- Celestial Pinnacle(s) — 초기 스키마
--
-- localStorage(battleSim_*) 를 Postgres로 옮기기 위한 첫 스키마. 실제 데이터
-- 형태는 web/*.html 코드를 직접 읽어서 확인한 것을 그대로 반영함(CLAUDE.md의
-- "로그인/서버 DB 전환 시 API 설계 논의" 섹션 참조). 아직 어떤 페이지도 이
-- 스키마를 실제로 읽고 쓰지 않는다 — 게임은 여전히 localStorage 단일
-- 저장소로 동작 중(전환 작업은 별도).
--
-- 적용 방법: Supabase Dashboard → SQL Editor에 이 파일 내용을 그대로
-- 붙여넣고 실행(또는 `supabase db push`, CLI가 설치돼 있다면).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. 공용 헬퍼
-- ----------------------------------------------------------------------------

create extension if not exists "pgcrypto"; -- gen_random_uuid()

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 1. profiles — 유저당 1행. auth.users를 확장하는 테이블(Supabase 관용 패턴)
--
-- battleSim_username의 "2inkle 문자열 비교 = 개발자"라는 임시 장치를
-- is_admin 플래그로 정식 대체한다. username은 최초 Discord 로그인 시
-- raw_user_meta_data에서 채워짐(아래 handle_new_user 트리거).
-- ----------------------------------------------------------------------------

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  gold integer not null default 500, -- 기존 코드가 500/0으로 갈렸던 기본값을 500으로 통일(hire.html 기준)
  is_admin boolean not null default false,
  last_ticket_claim_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id, username)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'preferred_username',
      'user_' || substr(new.id::text, 1, 8)
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- admin 여부를 다른 테이블 RLS 정책에서 재사용하기 위한 헬퍼(security definer로
-- profiles 직접 select 없이도 판정 가능하게 함 — RLS 재귀 방지).
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce((select p.is_admin from public.profiles p where p.user_id = uid), false);
$$;

-- ----------------------------------------------------------------------------
-- 2. characters — battleSim_roster(캐릭터 배열)
--
-- equipment 컬럼을 두지 않는다 — warehouse_items.held_by를 장비 장착 여부의
-- 유일한 진실 공급원으로 삼기로 결정함(2026-08-14, 사용자 결정). 이유:
-- 1) "아이템을 표기하는 모든 화면"(창고, 캐릭터 시트, 강화소, 공방 등)이
--    결국 다 warehouse_items를 조회해야 하는데, equipment를 캐릭터 쪽에
--    따로 두면 그 화면들이 두 테이블을 항상 맞춰봐야 해서 동기화 버그
--    여지가 생긴다. 2) "창고 화면에는 장착 중인 아이템을 보여줄 생각이
--    없다"는 요구사항 자체가 이미 "필터링은 조회 시점의 문제"임을 말해준다
--    — held_by IS NULL로 걸러내면 되는 것이지 테이블을 분리할 이유가 아님.
-- 캐릭터가 장착 중인 장비 목록이 필요한 화면(character-sheet.html 등)은
-- `select * from warehouse_items where held_by = <character_id>`로 조회.
-- 창고(미보유) 목록이 필요한 화면은 `where held_by is null and user_id = ...`.
-- ----------------------------------------------------------------------------

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  job text not null,
  level integer not null default 1,
  exp integer not null default 0,
  exp_to_next integer not null default 100,
  portrait text,
  real_stats jsonb not null default '{}'::jsonb,       -- {str,int,dex,spd,luk}
  learned_skill_names text[] not null default '{}',
  personal_resources jsonb not null default '{}'::jsonb, -- { arrows: {current,max}, ... }
  row_position text not null default 'front' check (row_position in ('front', 'back')),
  guard_allies boolean not null default false,
  presets jsonb not null default '[]'::jsonb,            -- [{name, rows:[{subject,metric,action,...}]}]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index characters_user_id_idx on public.characters(user_id);

create trigger characters_set_updated_at
  before update on public.characters
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. warehouse_items — 유저가 보유한 모든 아이템의 유일한 테이블
--    (battleSim_warehouse + 캐릭터별 장착 장비를 통합함, 2026-08-14 결정)
--
-- 장착 여부는 held_by 하나로 표현(null=미장착/창고, 캐릭터 id=그 캐릭터가
-- 장착 중 — 장착 중엔 quantity가 항상 1). "창고에는 장착 중인 장비를 보여줄
-- 생각이 없다" 같은 화면별 요구사항은 테이블을 나누는 이유가 아니라 조회
-- 시점의 WHERE 절 문제로 취급함:
--   - 창고 화면(미보유만):        where held_by is null and user_id = ...
--   - 캐릭터 장착 장비 조회:      where held_by = <character_id>
--   - 강화소/공방 등 "아이템을 표기하는 모든 화면"도 전부 이 한 테이블만
--     보되, 필요한 필터만 각 페이지에서 걸면 됨 — 진실 공급원이 하나라
--     캐릭터 쪽 정보와 어긋날 일이 없음.
-- 스택 병합(name+category+held_by 없음+enhanceLevel 없음+craftMaterial 일치)
-- 로직은 애플리케이션 레벨에서 유지.
-- ----------------------------------------------------------------------------

create table public.warehouse_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null check (category in ('equipment', 'material', 'keyItem', 'stash', 'consumable')),
  quantity integer not null default 1,
  description text,
  -- 장비 전용 필드(비장비 아이템은 전부 null)
  slot text,
  held_by uuid references public.characters(id) on delete set null,
  enhance_level integer,
  craft_material text,
  appraised boolean,
  combat_real jsonb,
  combat_bonus jsonb,
  stat_bonus jsonb,
  passive_bonus jsonb,
  max_hp_bonus integer,
  max_sp_bonus integer,
  weight numeric,
  two_handed boolean,
  set_id text,
  required_job text,
  created_at timestamptz not null default now()
);

create index warehouse_items_user_id_idx on public.warehouse_items(user_id);
create index warehouse_items_held_by_idx on public.warehouse_items(held_by);

-- ----------------------------------------------------------------------------
-- 4. battle_progress — clearedBattles/battleClearTimes/battleAttemptTimes 통합
--
-- CLAUDE.md에서 이미 "세 개를 battle_progress(user_id, battle_id, ...) 한
-- 테이블로 합치는 게 자연스럽다"고 결론 낸 대로 구현.
-- ----------------------------------------------------------------------------

create table public.battle_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  battle_id text not null, -- web/battle-themes.js의 battle.id와 대응(전역 콘텐츠라 FK로 안 묶음 — 정적 JS 데이터)
  cleared boolean not null default false,
  cleared_at timestamptz,
  attempted_at timestamptz,
  primary key (user_id, battle_id)
);

-- ----------------------------------------------------------------------------
-- 5. shop_purchased — battleSim_shopPurchased(아이템별 누적 구매 수량, stock 검사용)
-- ----------------------------------------------------------------------------

create table public.shop_purchased (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_name text not null,
  quantity integer not null default 0,
  primary key (user_id, item_name)
);

-- ----------------------------------------------------------------------------
-- 6. feature_requests — battleSim_featureRequests(건의 게시판)
--
-- 실측 결과 지금은 admin(username==="2inkle")만 접근 가능한 페이지였음. 다만
-- "전체 유저가 같은 목록을 보는 공용 게시판"이라는 원래 설계 의도(CLAUDE.md)에
-- 맞춰 select는 모든 로그인 유저에게 열어두고, 작성은 본인 글만, done 토글 등
-- 관리는 admin만 가능하게 함 — 이후 이 페이지를 일반 유저에게도 열 경우
-- 애플리케이션 쪽 접근 제어만 풀면 되고 스키마/RLS는 그대로 재사용 가능.
-- ----------------------------------------------------------------------------

create table public.feature_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 7. game_content — 전역 콘텐츠(관리자 전용 편집, 전 유저 공용 읽기)
--
-- skillTable/jobTable/monsterRoster/shopTable 네 개를 각각 정규화 테이블로
-- 쪼개지 않고 원본 그대로 JSONB 통짜 저장 — 지금 4개 에디터(web/*-editor.html,
-- monster-roster.html, shop.html)가 전부 "블롭 전체를 읽고 통째로 저장"하는
-- 방식으로 동작하기 때문에, 이 형태가 프론트 변경을 최소화한다. version은
-- 기존 `*_SEED_VERSION` 문자열 규칙을 그대로 재사용(로컬 재시딩 로직은 이제
-- 불필요해지지만, "언제 마지막으로 콘텐츠가 갱신됐는지" 표시 용도로 유지).
-- BATTLE_THEMES는 DB로 옮기지 않음 — web/battle-themes.js에 정적 JS로 남는
-- 코드-배포 콘텐츠(런타임에 편집되지 않음, 실측 확인함).
-- ----------------------------------------------------------------------------

create table public.game_content (
  key text primary key check (key in ('skillTable', 'jobTable', 'monsterRoster', 'shopTable')),
  data jsonb not null,
  version text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create trigger game_content_set_updated_at
  before update on public.game_content
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.characters enable row level security;
alter table public.warehouse_items enable row level security;
alter table public.battle_progress enable row level security;
alter table public.shop_purchased enable row level security;
alter table public.feature_requests enable row level security;
alter table public.game_content enable row level security;

-- profiles: 본인 행만 보고 고칠 수 있음(gold/last_ticket_claim_at 같은 값은
-- 지금은 클라이언트가 직접 계산해서 씀 — CLAUDE.md "API 단계에서 검증/방어가
-- 필요한 지점"에 이미 남겨둔 대로, 서버 검증 없이 클라이언트가 쓴 값을 그대로
-- 믿는 구조라는 한계가 이 RLS로는 안 없어짐. 추후 함수/트리거로 보강 필요).
create policy "profiles: 본인만 조회" on public.profiles
  for select using (auth.uid() = user_id);
create policy "profiles: 본인만 수정" on public.profiles
  for update using (auth.uid() = user_id);

-- characters / warehouse_items / battle_progress / shop_purchased:
-- 전형적인 "본인 소유 행만 CRUD" 패턴.
create policy "characters: 본인 소유만 CRUD" on public.characters
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "warehouse_items: 본인 소유만 CRUD" on public.warehouse_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "battle_progress: 본인 소유만 CRUD" on public.battle_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "shop_purchased: 본인 소유만 CRUD" on public.shop_purchased
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- feature_requests: 로그인 유저 전체가 조회 가능(공용 게시판), 본인 글만 작성,
-- 수정/삭제(특히 done 토글)는 admin만.
create policy "feature_requests: 로그인 유저 전체 조회" on public.feature_requests
  for select using (auth.role() = 'authenticated');
create policy "feature_requests: 본인 글만 작성" on public.feature_requests
  for insert with check (auth.uid() = user_id);
create policy "feature_requests: admin만 수정" on public.feature_requests
  for update using (public.is_admin());
create policy "feature_requests: admin만 삭제" on public.feature_requests
  for delete using (public.is_admin());

-- game_content: 누구나(비로그인 포함) 읽을 수 있어야 게임이 콘텐츠를 로드할
-- 수 있음 — anon 롤도 select 허용. 쓰기는 admin만.
create policy "game_content: 전체 공개 조회" on public.game_content
  for select using (true);
create policy "game_content: admin만 쓰기" on public.game_content
  for insert with check (public.is_admin());
create policy "game_content: admin만 수정" on public.game_content
  for update using (public.is_admin());

-- ============================================================================
-- 마이그레이션 대상에서 제외한 키 (근거는 CLAUDE.md "로그인/서버 DB 전환 시
-- API 설계 논의" 섹션 및 이번 스키마 설계 실측 조사 참고)
--
-- - battleSim_hiredPoolIds : 실측 결과 setItem/getItem 호출이 코드 어디에도
--   없음(village.html의 초기화 시 removeItem만 존재) — 죽은 키, 스키마 불필요.
-- - battleSim_lastResult   : sessionStorage, 배틀→결과 페이지 전달용 1회성
--   값. 실측 결과 실제로 setItem하는 코드가 없어 사실상 미사용(battle-result.html
--   자체 주석에 "연결 아직 안 됨"이라고 적혀 있음) — DB 대상 아님.
-- - BATTLE_THEMES          : 정적 JS 배포 콘텐츠, 런타임 편집 없음 — DB 대상 아님.
-- ============================================================================
