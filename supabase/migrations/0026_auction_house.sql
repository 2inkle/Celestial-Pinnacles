-- ============================================================================
-- 0026_auction_house.sql — 경매장(플레이어 간 거래) 스키마 + RPC
--
-- ⚠ 이 마이그레이션은 아직 실행되지 않았다. 실행해야 실제 반영됨.
--
-- ── 왜 이 구조인가 ─────────────────────────────────────────────────────────
-- 이 게임은 지금까지 완전한 1인용이었다. 0001의 RLS 정책이 전부
-- `auth.uid() = user_id`라, 남의 데이터를 읽는 경로는 0021의
-- get_shared_battle_log(security definer RPC) 하나뿐이었다. 경매장은 그 전제를
-- 처음으로 깨는 시스템이라, 아래 네 가지를 새로 정한다.
--
-- 1) 읽기는 넓게, 단 로그인 사용자에게만(`auth.role() = 'authenticated'`).
--    0021이 좁은 RPC를 택한 이유는 "전투 기록은 기본이 비공개이고 링크를 아는
--    사람만 예외"였기 때문이다. 경매 매물 목록은 성격이 정반대다 — 열거(검색·
--    정렬·필터·페이지네이션)가 곧 기능이라서, 좁은 RPC로 감싸면 PostgREST가
--    공짜로 주는 걸 전부 버리고 필터 조합마다 RPC를 새로 만들어야 한다.
--    `using (true)`가 아니라 authenticated로 좁힌 것은 0001의 feature_requests
--    선례를 따른 것 — 로그인 게이트가 걸린 게임이라 익명에게 시장을 통째로
--    열어줄 이유가 없다.
--
-- 2) 쓰기는 RPC로만. INSERT/UPDATE/DELETE 정책을 아예 만들지 않는다.
--    RLS가 켜진 테이블은 해당 정책이 없으면 그 동작을 무조건 거부하므로,
--    클라이언트가 PostgREST로 직접 쓰는 경로가 원천 차단된다. 즉 "검사를 넣어서
--    막는" 게 아니라 "쓸 수 있는 표면 자체를 없애서" 막는다.
--    반드시 이래야 하는 이유는 원자성이다. 구매를 클라이언트가 "골드 차감 →
--    아이템 지급 → 매물 마감" 3단계로 하면 3단계만 실행해 공짜로 아이템을
--    받을 수 있다. 아래 RPC들은 그 전부를 한 트랜잭션 안에서 처리한다.
--    행위자는 반드시 함수 안에서 auth.uid()로 판별한다 — 파라미터로 받으면
--    남을 사칭해 남의 물건을 팔거나 남의 골드를 쓸 수 있다.
--    같은 이유로 금액도 파라미터로 받지 않는다. buyout_auction_listing은
--    가격 인자가 없다 — 호출자는 "어느 매물"만 지정하고 "얼마"는 서버가 정한다.
--
-- 3) 매물 아이템은 창고에서 "빼내서" 보관한다(에스크로).
--    warehouse_items 행을 그대로 두고 플래그만 세우면, 매물로 올린 채 장착하거나
--    NPC에 팔거나 개조할 수 있어 복제가 난다. 그래서 등록 시점에 원본 행을
--    삭제하고 내용 전체를 item_snapshot(jsonb)에 담는다.
--    ⚠ 스냅샷 저장/복원에 warehouse_items 컬럼을 절대 나열하지 않는다.
--    to_jsonb()/jsonb_populate_record()를 쓴다 — 0004 헤더가 기록한
--    "컬럼을 재나열하는 코드는 나중에 컬럼이 추가될 때 그 필드를 조용히
--    유실시킨다"는 버그 계열이 그대로 재발하기 때문. 실제로 이 테이블은
--    0004/0022에서 컬럼이 계속 늘어왔다.
--
-- 4) 만료 정산은 지연(lazy) 방식이다.
--    이 프로젝트에는 pg_cron이 없다(0001에서 설치하는 확장은 pgcrypto뿐).
--    그래서 3중으로 처리한다: ① 경매장 화면 진입 시 클라이언트가 스위퍼를
--    호출, ② 입찰/즉구가 만료된 매물을 건드리면 그 자리에서 정산하고 거절,
--    ③ 목록 조회 쿼리가 항상 `expires_at > now()`를 함께 걸어 미정산 매물이
--    화면에 뜨지 않게 함. ③ 덕분에 만료는 의미상 즉시 일어나고 정산은 그저
--    장부가 따라오는 일이 된다 — 스케줄러 부재가 용인 가능해지는 지점.
--    나중에 pg_cron을 쓸 수 있게 되면 스위퍼를 그대로 스케줄에 걸기만 하면 됨
--    (스위퍼가 이미 멱등이고 skip locked라 함수 수정이 필요 없음).
--
-- ── 입찰 골드를 즉시 차감(에스크로)하는 이유 ────────────────────────────────
-- "낙찰될 때만 청구"는 이 프로젝트에서 성립하지 않는다. 스케줄러가 없어서
-- 정산은 "제3자가 경매장을 열었을 때" 일어나는데, 그 시점에 낙찰자는 거의
-- 확실히 접속 중이 아니다. 접속하지 않은 사람에게서 돈을 걷어야 하고, 그 사람이
-- 이미 골드를 다 썼으면 정산이 실패하거나 → 차순위로 내려가는 무한 사다리를
-- 아무 페이지 로드에서나 돌려야 한다. 에스크로면 정산 함수가 실패할 수 없다
-- (이미 걷어둔 돈을 옮기는 장부 작업일 뿐). 부수 효과로 "없는 돈으로 입찰해
-- 매물을 잠그는" 유령 입찰도 불가능해진다.
--
-- ── 한계(반드시 알고 있을 것) ──────────────────────────────────────────────
-- 골드 자체의 위조는 이 마이그레이션으로 막지 못한다. profiles.gold를
-- 클라이언트가 절대값으로 직접 update하는 코드가 9개 페이지에 흩어져 있고
-- (shop.html/dispatch.html/battle-view.html 등) RLS는 "본인 행"이라 이를
-- 허용하기 때문이다. 사용자가 이 위험을 인지하고 "경매/레이드 mutation만 RPC로
-- 원자화하고 골드 위조는 일단 감수"하기로 결정함(2026-08-31).
--
-- ⚠ 다만 경매장이 생기면 이 감수의 성격이 달라진다. 지금까지 위조 골드는
-- 고정 카탈로그인 NPC 상점에서만 쓸 수 있어 피해가 본인 진행에 갇혀 있었는데,
-- 경매장이 생기면 위조 골드가 "다른 실제 플레이어의 아이템"을 사간다. 즉
-- 자기완결적이던 위험이 아니게 된다. 후속 작업 권장: 골드가 움직일 때마다
-- 남기는 append-only gold_ledger — 위조를 막지는 못하지만
-- `sum(delta) + 초기값 <> profiles.gold`가 오탐 없는 위조 탐지기가 되고,
-- 잘못된 거래를 되돌릴 근거가 된다.
--
-- ⚠ 선행 수정이 필요한 실제 버그(치팅 아님, 정상 플레이어가 당함):
-- shop.html은 페이지 로드 시점의 골드를 JS 변수에 들고 있다가
-- `{ gold: currentGold - total }` 절대값으로 쓴다(1161/1247행 근방).
-- battle-view.html(596행 근방)도 같다. 상점을 열어둔 채로 내 경매가 낙찰되면,
-- 다음 구매가 낙찰 이전 스냅샷 기준으로 골드를 덮어써서 판매대금이 증발한다.
-- 이 세 곳을 상대 갱신(또는 구매/판매 전용 RPC)으로 바꾸는 것이 선행 과제.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. profiles에 입찰 잠금 골드 컬럼 추가.
--    gold에서 빠져나온 뒤 여기 잠긴다 — 분리해두지 않으면 플레이어 입장에서
--    골드가 그냥 사라진 것처럼 보이고, 같은 돈을 두 번 쓰는 것도 못 막는다.
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists gold_locked bigint not null default 0 check (gold_locked >= 0);

-- ----------------------------------------------------------------------------
-- 1. auction_listings — 매물 하나. 등록 시점에 창고에서 빠져나온 아이템이
--    item_snapshot 안에 통째로 들어있다.
-- ----------------------------------------------------------------------------
create table public.auction_listings (
  id uuid primary key default gen_random_uuid(),

  seller_user_id uuid not null references auth.users(id) on delete cascade,
  -- ⚠ profiles의 select 정책이 "본인 행만"이라 목록 화면에서 판매자 이름을
  -- 조인할 방법이 아예 없다. battle_logs.saved_by와 완전히 같은 이유·같은
  -- 해법(등록 시점 이름 스냅샷). 개명해도 소급되지 않는다는 점은 감수.
  seller_username text not null,

  -- 에스크로된 아이템 원본(to_jsonb(warehouse_items)에서 소유 정보만 제거).
  item_snapshot jsonb not null,

  -- 목록/검색/정렬용 비정규화 사본 — 진실 공급원은 item_snapshot.
  item_name text not null,
  item_category text not null check (item_category <> 'keyItem'),
  item_quantity integer not null check (item_quantity >= 1),
  item_enhance_level integer,
  item_craft_material text,

  -- 가격은 자유 입력 + 하한만(사용자 확정). 상점의 8단계 고정 라인업은
  -- NPC 거래 전용이고 경매에는 적용하지 않는다.
  min_bid bigint not null check (min_bid >= 1),
  buyout_price bigint check (buyout_price is null or buyout_price >= min_bid),

  -- 현재 최고 입찰 비정규화 — auction_bids는 본인 행만 읽히므로(아래 RLS 참고)
  -- 목록 화면이 최고가를 알 방법이 이것뿐이다.
  current_bid bigint,
  current_bidder_user_id uuid references auth.users(id) on delete set null,
  current_bidder_username text,
  bid_count integer not null default 0,

  status text not null default 'active'
    check (status in ('active', 'sold', 'expired', 'cancelled')),
  buyer_user_id uuid references auth.users(id) on delete set null,
  final_price bigint,
  sale_kind text check (sale_kind is null or sale_kind in ('buyout', 'bid')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  settled_at timestamptz
);

create trigger auction_listings_set_updated_at
  before update on public.auction_listings
  for each row execute function public.set_updated_at();

-- 지연 정산 스위퍼의 유일한 스캔 경로.
create index auction_listings_expiry_idx
  on public.auction_listings(expires_at) where status = 'active';
-- 브라우즈: 카테고리 탭 + 이름 정렬/검색.
create index auction_listings_browse_idx
  on public.auction_listings(item_category, item_name) where status = 'active';
create index auction_listings_seller_idx
  on public.auction_listings(seller_user_id, created_at desc);
create index auction_listings_bidder_idx
  on public.auction_listings(current_bidder_user_id) where status = 'active';

-- ----------------------------------------------------------------------------
-- 2. auction_bids — 입찰 이력(환불이 실제로 일어났는지 확인할 근거).
-- ----------------------------------------------------------------------------
create table public.auction_bids (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.auction_listings(id) on delete cascade,
  bidder_user_id uuid not null references auth.users(id) on delete cascade,
  bidder_username text not null,
  amount bigint not null check (amount >= 1),
  -- active   : 이 금액이 profiles.gold_locked에 잠겨 있음
  -- outbid   : 상위 입찰에 밀려 환불 완료
  -- refunded : 즉시구매로 경매가 끝나 환불 완료
  -- won      : 낙찰 — 잠금이 풀리며 판매자에게 지급됨
  status text not null default 'active'
    check (status in ('active', 'outbid', 'won', 'refunded')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- ★ 이 부분 유니크 인덱스가 에스크로의 안전장치다.
--   "매물당 잠긴 입찰은 최대 1건"을 DB가 강제하므로, 환불을 빠뜨린 채 새 입찰을
--   넣으려 하면 insert가 실패한다. 골드 누수가 조용히 통과할 수 없게 됨.
create unique index auction_bids_one_active_per_listing_idx
  on public.auction_bids(listing_id) where status = 'active';

create index auction_bids_bidder_idx
  on public.auction_bids(bidder_user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 3. RLS — 읽기만, 쓰기 정책은 의도적으로 만들지 않음(위 2번 설명 참고).
--
--    auction_listings는 열거가 곧 기능이라 넓게 연다.
--    auction_bids는 반대다 — 입찰 금액과 입찰자는 경쟁 정보이고, 목록 화면은
--    listings의 비정규화 컬럼(current_bid/current_bidder_username/bid_count)만
--    있으면 충분하다. 그래서 본인 행만 열어 "내 입찰 목록"만 가능하게 한다.
-- ----------------------------------------------------------------------------
alter table public.auction_listings enable row level security;
alter table public.auction_bids enable row level security;

create policy "auction_listings: 로그인 사용자 전체 조회(공개 매물 목록)"
  on public.auction_listings
  for select using (auth.role() = 'authenticated');

create policy "auction_bids: 본인 입찰만 조회"
  on public.auction_bids
  for select using (auth.uid() = bidder_user_id);

-- ----------------------------------------------------------------------------
-- 4. 내부 헬퍼 — 스냅샷을 warehouse_items 행으로 되살림.
--
--    ⚠ 스택 병합 조건은 web/shop.html의 confirmPurchase()가 쓰는 poolRows
--    필터와 반드시 동일해야 한다: name+category 일치 & held_by null &
--    enhance_level null & craft_material null. 이 규칙이 한쪽 경로에만
--    적용돼서 "개조된 모자 101개" 버그가 실제로 났었다(CLAUDE.md 2026-08-22).
--    강화품/개조품은 개별 인스턴스라 절대 병합하지 않는다.
-- ----------------------------------------------------------------------------
create or replace function public._grant_item_snapshot(p_user_id uuid, p_snapshot jsonb)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.warehouse_items;
  v_existing_id uuid;
begin
  -- 컬럼을 나열하지 않는 복원 — 0004의 컬럼 유실 버그 계열 방지.
  v_row := jsonb_populate_record(null::public.warehouse_items, p_snapshot);

  if v_row.enhance_level is null and v_row.craft_material is null then
    select id into v_existing_id
      from public.warehouse_items
     where user_id = p_user_id
       and name = v_row.name
       and category = v_row.category
       and held_by is null
       and enhance_level is null
       and craft_material is null
     limit 1
     for update;
  end if;

  if v_existing_id is not null then
    update public.warehouse_items
       set quantity = quantity + v_row.quantity
     where id = v_existing_id;
    return v_existing_id;
  end if;

  v_row.id := gen_random_uuid();
  v_row.user_id := p_user_id;
  v_row.held_by := null; -- 거래된 아이템은 항상 미장착 상태로 들어감
  v_row.created_at := now();
  insert into public.warehouse_items select (v_row).*;
  return v_row.id;
end;
$$;

-- 현재 최고 입찰자에게 잠긴 골드를 돌려줌.
create or replace function public._refund_active_bid(p_listing_id uuid, p_new_status text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_bid public.auction_bids;
begin
  select * into v_bid
    from public.auction_bids
   where listing_id = p_listing_id and status = 'active'
   for update;
  if not found then
    return;
  end if;

  update public.profiles
     set gold = gold + v_bid.amount,
         gold_locked = gold_locked - v_bid.amount
   where user_id = v_bid.bidder_user_id;

  update public.auction_bids
     set status = p_new_status, resolved_at = now()
   where id = v_bid.id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. _settle_auction_listing — 만료 매물 하나를 정산(멱등, 내부 전용).
--
--    에스크로 덕분에 이 함수는 실패할 수 없다 — 낙찰자에게서 돈을 걷는 단계가
--    없기 때문(입찰 시점에 이미 걷었음). "낙찰자가 돈이 없다" 분기도,
--    차순위로 내려가는 사다리도, 주인 없는 아이템도 생기지 않는다.
-- ----------------------------------------------------------------------------
create or replace function public._settle_auction_listing(p_listing_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_l public.auction_listings;
  v_bid public.auction_bids;
begin
  select * into v_l
    from public.auction_listings
   where id = p_listing_id
   for update;
  if not found or v_l.status <> 'active' or v_l.expires_at > now() then
    return; -- 멱등: 어디서 불러도 안전
  end if;

  select * into v_bid
    from public.auction_bids
   where listing_id = p_listing_id and status = 'active'
   for update;

  if found then
    -- 낙찰 — 잠금만 풀고 판매자에게 지급(구매자 골드는 입찰 때 이미 빠져나감).
    update public.profiles
       set gold_locked = gold_locked - v_bid.amount
     where user_id = v_bid.bidder_user_id;
    update public.profiles
       set gold = gold + v_bid.amount
     where user_id = v_l.seller_user_id;
    update public.auction_bids
       set status = 'won', resolved_at = now()
     where id = v_bid.id;
    perform public._grant_item_snapshot(v_bid.bidder_user_id, v_l.item_snapshot);

    update public.auction_listings
       set status = 'sold', buyer_user_id = v_bid.bidder_user_id,
           final_price = v_bid.amount, sale_kind = 'bid', settled_at = now()
     where id = p_listing_id;
  else
    -- 유찰 — 아이템만 판매자에게 반환.
    perform public._grant_item_snapshot(v_l.seller_user_id, v_l.item_snapshot);
    update public.auction_listings
       set status = 'expired', settled_at = now()
     where id = p_listing_id;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. create_auction_listing — 매물 등록.
--    소유권 판정을 where절에 넣으므로(user_id = auth.uid()) 남의 아이템 id를
--    넣으면 존재 여부조차 새어나가지 않고 not found로 떨어진다.
-- ----------------------------------------------------------------------------
create or replace function public.create_auction_listing(
  p_item_id uuid,
  p_quantity integer,
  p_min_bid bigint,
  p_buyout_price bigint default null,
  p_duration_hours integer default 24
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_item public.warehouse_items;
  v_username text;
  v_snapshot jsonb;
  v_id uuid;
begin
  if v_uid is null then raise exception '로그인이 필요합니다.'; end if;
  if p_quantity is null or p_quantity < 1 then raise exception '수량이 올바르지 않습니다.'; end if;
  if p_min_bid is null or p_min_bid < 1 then raise exception '최소 입찰가는 1 G 이상이어야 합니다.'; end if;
  if p_buyout_price is not null and p_buyout_price < p_min_bid then
    raise exception '즉시구매가는 최소 입찰가보다 낮을 수 없습니다.';
  end if;
  if p_duration_hours not in (6, 12, 24, 48) then
    raise exception '경매 기간은 6/12/24/48시간 중 하나여야 합니다.';
  end if;

  select * into v_item
    from public.warehouse_items
   where id = p_item_id and user_id = v_uid
   for update;
  if not found then raise exception '아이템을 찾을 수 없습니다.'; end if;

  -- 사용자 확정(2026-08-31): "Keyitem을 제외한 전부"가 거래 대상.
  -- 진행에 필요한 열쇠를 팔아 자기 진행을 막는 사고도 같이 방지된다.
  if v_item.category = 'keyItem' then raise exception '열쇠 아이템은 거래할 수 없습니다.'; end if;
  if v_item.held_by is not null then raise exception '장착 중인 장비는 등록할 수 없습니다. 먼저 해제하세요.'; end if;
  if v_item.quantity < p_quantity then raise exception '보유 수량이 부족합니다.'; end if;

  select username into v_username from public.profiles where user_id = v_uid;

  -- 소유 정보만 떼고 통째로 보존. quantity는 이번에 내놓는 만큼으로 덮어씀.
  v_snapshot := (to_jsonb(v_item) - 'id' - 'user_id' - 'held_by' - 'created_at')
                || jsonb_build_object('quantity', p_quantity);

  -- 에스크로 = 창고에서 실제로 제거. 이 한 줄이 "올려둔 채 장착/판매"를 막는다.
  if v_item.quantity = p_quantity then
    delete from public.warehouse_items where id = v_item.id;
  else
    update public.warehouse_items set quantity = quantity - p_quantity where id = v_item.id;
  end if;

  insert into public.auction_listings (
    seller_user_id, seller_username, item_snapshot,
    item_name, item_category, item_quantity, item_enhance_level, item_craft_material,
    min_bid, buyout_price, expires_at
  ) values (
    v_uid, coalesce(v_username, '알 수 없음'), v_snapshot,
    v_item.name, v_item.category, p_quantity, v_item.enhance_level, v_item.craft_material,
    p_min_bid, p_buyout_price, now() + make_interval(hours => p_duration_hours)
  ) returning id into v_id;

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. place_auction_bid — 입찰.
--
--    골드 검사는 반드시 "읽고 나서 쓰기"가 아니라 한 문장으로 한다
--    (`where gold >= amount`). 따로 하면 동시 입찰 둘이 같은 잔액을 보고
--    둘 다 통과할 수 있다.
-- ----------------------------------------------------------------------------
create or replace function public.place_auction_bid(p_listing_id uuid, p_amount bigint)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_l public.auction_listings;
  v_username text;
  v_min bigint;
  v_gold bigint;
  v_locked bigint;
begin
  if v_uid is null then raise exception '로그인이 필요합니다.'; end if;

  -- 매물 행 잠금이 이 매물에 관한 모든 동시성의 유일한 직렬화 지점이다.
  -- 항상 매물 → profiles 순서로 잠근다(교착 방지).
  select * into v_l from public.auction_listings where id = p_listing_id for update;
  if not found then raise exception '매물을 찾을 수 없습니다.'; end if;
  if v_l.status <> 'active' then raise exception '이미 종료된 매물입니다.'; end if;

  -- 만료됐으면 그 자리에서 정산하고 거절(지연 정산 2층).
  if v_l.expires_at <= now() then
    perform public._settle_auction_listing(p_listing_id);
    raise exception '이미 마감된 경매입니다.';
  end if;

  if v_l.seller_user_id = v_uid then raise exception '자기 매물에는 입찰할 수 없습니다.'; end if;

  v_min := coalesce(v_l.current_bid + 1, v_l.min_bid);
  if p_amount < v_min then raise exception '입찰가는 % G 이상이어야 합니다.', v_min; end if;

  -- 즉구가 이상으로는 입찰할 수 없게 막는다 — 이게 입찰과 즉시구매가 서로
  -- 교차하지 않게 하는 규칙이다(입찰자가 즉구가보다 비싸게 낙찰되는 일이 없음).
  if v_l.buyout_price is not null and p_amount >= v_l.buyout_price then
    raise exception '즉시구매가 이상은 입찰할 수 없습니다. 즉시구매를 이용해 주세요.';
  end if;

  select username into v_username from public.profiles where user_id = v_uid;

  -- 이전 최고 입찰자 환불이 먼저 — 부분 유니크 인덱스 때문에 이걸 빼먹으면
  -- 아래 insert가 제약 위반으로 실패한다(누수가 조용히 지나갈 수 없음).
  perform public._refund_active_bid(p_listing_id, 'outbid');

  update public.profiles
     set gold = gold - p_amount, gold_locked = gold_locked + p_amount
   where user_id = v_uid and gold >= p_amount;
  if not found then raise exception '골드가 부족합니다.'; end if;

  insert into public.auction_bids (listing_id, bidder_user_id, bidder_username, amount)
  values (p_listing_id, v_uid, coalesce(v_username, '알 수 없음'), p_amount);

  update public.auction_listings
     set current_bid = p_amount,
         current_bidder_user_id = v_uid,
         current_bidder_username = coalesce(v_username, '알 수 없음'),
         bid_count = bid_count + 1
   where id = p_listing_id;

  select gold, gold_locked into v_gold, v_locked from public.profiles where user_id = v_uid;
  return jsonb_build_object('gold', v_gold, 'goldLocked', v_locked, 'currentBid', p_amount);
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. buyout_auction_listing — 즉시구매. 가격 인자가 없다(서버가 정함).
--    판매자가 등록 시점에 "누구든 이 값이면 즉시 판다"고 선언한 것이므로,
--    입찰이 걸려 있어도 즉구가 이긴다. 밀려난 입찰은 전액 환불된다.
-- ----------------------------------------------------------------------------
create or replace function public.buyout_auction_listing(p_listing_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_l public.auction_listings;
  v_gold bigint;
begin
  if v_uid is null then raise exception '로그인이 필요합니다.'; end if;

  select * into v_l from public.auction_listings where id = p_listing_id for update;
  if not found then raise exception '매물을 찾을 수 없습니다.'; end if;
  if v_l.status <> 'active' then raise exception '이미 종료된 매물입니다.'; end if;
  if v_l.expires_at <= now() then
    perform public._settle_auction_listing(p_listing_id);
    raise exception '이미 마감된 경매입니다.';
  end if;
  if v_l.buyout_price is null then raise exception '즉시구매가가 설정되지 않은 매물입니다.'; end if;
  if v_l.seller_user_id = v_uid then raise exception '자기 매물은 구매할 수 없습니다.'; end if;

  update public.profiles
     set gold = gold - v_l.buyout_price
   where user_id = v_uid and gold >= v_l.buyout_price;
  if not found then raise exception '골드가 부족합니다.'; end if;

  -- 밀려난 입찰자에게 전액 환불 — 아이템이 팔리는 것과 같은 트랜잭션이라
  -- "남의 골드가 잠긴 채로 물건이 팔리는" 구간이 존재하지 않는다.
  perform public._refund_active_bid(p_listing_id, 'refunded');

  update public.profiles set gold = gold + v_l.buyout_price where user_id = v_l.seller_user_id;
  perform public._grant_item_snapshot(v_uid, v_l.item_snapshot);

  update public.auction_listings
     set status = 'sold', buyer_user_id = v_uid,
         final_price = v_l.buyout_price, sale_kind = 'buyout',
         current_bid = null, current_bidder_user_id = null, current_bidder_username = null,
         settled_at = now()
   where id = p_listing_id;

  select gold into v_gold from public.profiles where user_id = v_uid;
  return jsonb_build_object('gold', v_gold, 'paid', v_l.buyout_price);
end;
$$;

-- ----------------------------------------------------------------------------
-- 9. cancel_auction_listing — 등록 취소.
--    입찰이 하나라도 붙었으면 취소 불가. 판매자가 입찰 상황을 지켜보다가
--    마음에 안 들면 내렸다 되올리는 시세 조작을 막는다(설계 판단).
-- ----------------------------------------------------------------------------
create or replace function public.cancel_auction_listing(p_listing_id uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_l public.auction_listings;
  v_new_item_id uuid;
begin
  if v_uid is null then raise exception '로그인이 필요합니다.'; end if;

  select * into v_l from public.auction_listings where id = p_listing_id for update;
  if not found then raise exception '매물을 찾을 수 없습니다.'; end if;
  if v_l.seller_user_id <> v_uid then raise exception '본인 매물만 취소할 수 있습니다.'; end if;
  if v_l.status <> 'active' then raise exception '이미 종료된 매물입니다.'; end if;
  if v_l.bid_count > 0 then raise exception '이미 입찰이 있어 취소할 수 없습니다.'; end if;

  v_new_item_id := public._grant_item_snapshot(v_uid, v_l.item_snapshot);

  update public.auction_listings
     set status = 'cancelled', settled_at = now()
   where id = p_listing_id;

  return v_new_item_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 10. settle_expired_auction_listings — 만료 스위퍼(지연 정산 1층).
--     skip locked라 두 사람이 동시에 경매장을 열면 일을 나눠 가진다
--     (막히지도, 중복 정산되지도 않음).
-- ----------------------------------------------------------------------------
create or replace function public.settle_expired_auction_listings(p_limit integer default 50)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
  v_n integer := 0;
begin
  for v_id in
    select id from public.auction_listings
     where status = 'active' and expires_at <= now()
     order by expires_at
     limit greatest(1, least(p_limit, 500))
     for update skip locked
  loop
    perform public._settle_auction_listing(v_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- ----------------------------------------------------------------------------
-- 11. 실행 권한.
--     내부 헬퍼는 절대 노출하지 않는다 — _grant_item_snapshot을 직접 부를 수
--     있으면 아이템을 무한 복제할 수 있다.
-- ----------------------------------------------------------------------------
revoke all on function public._grant_item_snapshot(uuid, jsonb) from public, anon, authenticated;
revoke all on function public._refund_active_bid(uuid, text) from public, anon, authenticated;
revoke all on function public._settle_auction_listing(uuid) from public, anon, authenticated;

revoke all on function public.create_auction_listing(uuid, integer, bigint, bigint, integer) from public, anon;
revoke all on function public.place_auction_bid(uuid, bigint) from public, anon;
revoke all on function public.buyout_auction_listing(uuid) from public, anon;
revoke all on function public.cancel_auction_listing(uuid) from public, anon;
revoke all on function public.settle_expired_auction_listings(integer) from public, anon;

grant execute on function public.create_auction_listing(uuid, integer, bigint, bigint, integer) to authenticated;
grant execute on function public.place_auction_bid(uuid, bigint) to authenticated;
grant execute on function public.buyout_auction_listing(uuid) to authenticated;
grant execute on function public.cancel_auction_listing(uuid) to authenticated;
grant execute on function public.settle_expired_auction_listings(integer) to authenticated;
