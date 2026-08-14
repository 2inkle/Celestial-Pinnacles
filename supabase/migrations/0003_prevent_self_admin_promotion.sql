-- ============================================================================
-- is_admin 자기 승격 차단 (2026-08-14)
--
-- 발견 경위: 0002 적용 후 실제 계정을 관리자로 부트스트랩하는 과정에서,
-- profiles의 UPDATE RLS 정책("본인 행이면 수정 가능")이 "어떤 컬럼을
-- 바꾸는지"는 전혀 가리지 않는다는 걸 실측으로 확인함 — 로그인한 클라이언트가
-- `update profiles set is_admin = true where user_id = auth.uid()`를 그대로
-- 호출하면 성공한다(실제로 이 방식으로 부트스트랩했음). 즉 지금 상태로는
-- 아무 로그인 유저나 자기 자신을 관리자로 승격시킬 수 있다.
--
-- 해결: "이미 관리자인 사람만 is_admin 값을 바꿀 수 있다"는 BEFORE UPDATE
-- 트리거. 단, 이 트리거는 트리거 함수 안에서 auth.uid()가 NULL인 경우(=
-- Supabase Dashboard SQL Editor처럼 로그인 JWT 세션 없이 직접 실행하는 경로)는
-- 예외로 통과시킨다.
--
-- **처음에 이 예외를 안 두고 작성했다가 자체 검토로 잡은 결함**: SQL Editor는
-- JWT 세션이 없어서 auth.uid()가 항상 NULL이고, is_admin(NULL)은 항상 false를
-- 반환한다. 예외 없이 "not is_admin(auth.uid())"만으로 막으면, 트리거 적용
-- 이후로는 SQL Editor로 실행하는 UPDATE조차 전부 거부돼서 — 지금 이 프로젝트에
-- 아직 관리자 UI가 없는 상태라 SQL Editor가 사실상 유일한 관리자 관리 통로인데
-- 그 통로 자체가 영구히 막혀버리는 자기모순이 생긴다. 진짜 막아야 하는 건
-- "로그인한 일반 클라이언트가 자기 자신을 승격시키는 것"이지, Supabase
-- Dashboard 접근 권한을 가진 사람(이미 프로젝트 소유자 수준 신뢰)이 아니다.
-- 일반 클라이언트(anon/authenticated 롤로 브라우저에서 호출)는 항상 유효한
-- auth.uid()를 갖고 있으므로, 이 예외가 있어도 자기 승격 공격 경로는 그대로
-- 막힌다 — 방금 실측으로 재현했던 공격(로그인 세션에서
-- `update profiles set is_admin = true where user_id = auth.uid()` 직접 호출)은
-- auth.uid()가 non-null이라 이 예외를 안 타고 그대로 차단됨.
-- ============================================================================

create or replace function public.prevent_self_admin_promotion()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.is_admin is distinct from old.is_admin
     and auth.uid() is not null
     and not public.is_admin(auth.uid()) then
    raise exception 'is_admin 값은 이미 관리자인 계정만 바꿀 수 있음';
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_self_admin_promotion
  before update on public.profiles
  for each row execute function public.prevent_self_admin_promotion();
