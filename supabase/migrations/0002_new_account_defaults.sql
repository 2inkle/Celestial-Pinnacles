-- ============================================================================
-- 신규 계정 기본값 (2026-08-14, 사용자 결정)
--
-- 0001이 이미 실제 프로젝트에 적용된 뒤에 나온 결정이라 별도 마이그레이션으로
-- 분리함(0001을 수정해서 재실행하지 않음 — 이미 적용된 마이그레이션은
-- 불변으로 취급). SQL Editor에서 이 파일 내용만 추가로 실행하면 됨.
--
-- 결정된 기본값:
--   - 용병(캐릭터): 보유하지 않음 — characters에 아무 것도 INSERT하지 않는
--     것 자체가 이미 이 요구사항(0001부터 자연스럽게 그랬음, 변경 없음).
--   - 골드: 3000G (기존 0001의 500 → 3000으로 변경)
--   - 파견 의뢰권: 10장 (warehouse_items에 신규 지급, 0001엔 없었음)
-- ============================================================================

alter table public.profiles alter column gold set default 3000;

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

  -- 신규 계정 파견 의뢰권 10장 지급(web/guild.html의 TICKET_NAME="파견 의뢰권",
  -- category="consumable"과 동일한 이름/분류로 지급해야 게임 쪽 로직이 그대로
  -- 인식함).
  insert into public.warehouse_items (user_id, name, category, quantity)
  values (new.id, '파견 의뢰권', 'consumable', 10);

  return new;
end;
$$;

-- ============================================================================
-- 참고: 이 변경 전에 이미 만들어진 계정(트리거가 아직 신규 지급 로직을 몰랐던
-- 시점에 가입한 유저)에는 소급 적용되지 않는다. 필요하면 아래처럼 개별
-- 백필 가능(반복 실행해도 안전하도록 이미 지급된 유저는 건너뛰게 짜야 함 —
-- 지금은 profiles 자체가 비어있는 테스트 단계라 백필 스크립트는 필요해지면
-- 그때 작성).
-- ============================================================================
