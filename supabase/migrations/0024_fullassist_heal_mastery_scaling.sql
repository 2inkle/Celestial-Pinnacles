-- ============================================================================
-- game_content(skillTable) 갱신 — FullAssist(하이드루이드)의 "치유숙련에
-- 비례하여 효과 증가" 미구현 부분을 healingDealtPct(가하는 회복량%)로
-- 치환해 구현.
--
-- 배경: FullAssist의 note에 "'치유숙련에 비례하여 효과 증가, 초기 INT와
-- 치유숙련에 비례하여 한계 증가'는 미구현(스탯 기반 버프 배율 스케일링 +
-- 상한 시스템 필요) - 고정 40%만 반영"이라고 적혀 있었음. "치유숙련"은
-- 이 note 한 곳에만 등장할 뿐 실제 스탯/필드로 존재한 적이 없었음 —
-- 사용자 결정으로 이미 구현된 healingDealtPct로 치환.
--
-- 공식(곱셈, 사용자가 직접 제시한 예시 수치로 확정): 최종% = base 40% ×
-- (1 + 시전자 healingDealtPct% / 100). 예: healingDealtPct 30% →
-- 40 × 1.3 = 52%. "초기 INT와 치유숙련에 비례하여 한계 증가"는 별도 캡을
-- 새로 만들지 않고 기존 전역 캡(src/character.js의
-- calculateEffectiveStat, real×5=500%)에 그대로 위임함 — 2026-08-15에
-- 이미 확정된 "모든 스탯 보너스는 하나의 전역 공식으로 통일한다"는 설계
-- 원칙과 일치시키기 위함, 새 미검증 캡 공식은 만들지 않음.
--
-- 엔진 측: src/skillResolution.js에 범용 메커니즘 resolveScaledPercentValue()
-- 신설 — effect.scaleByPassiveMod(passiveMod 키 문자열) + effect.scaleFactor
-- (숫자, 기본 1)가 있으면 시전자의 그 값을 곱셈으로 반영해 base %를
-- 증폭시킴(grantPassiveMod의 scaleByStat+scaleFactor 관례를 그대로 재사용).
-- FullAssist 하나에 하드코딩하지 않고 statUpPercent/combatStatUpPercent/
-- maxHpUpPercent 세 이펙트 타입 모두에 적용되는 범용 메커니즘이라, 나중에
-- 다른 스킬(skill-table.json에 "OO에 비례하여" 미구현 note가 6곳 더 있음)
-- 구현 시에도 재사용 가능.
--
-- 0023_fix_vortex_overload_self_drain.sql과 동일한 방식으로, 전체
-- skillTable JSON을 통째로 교체하지 않고 jobSkills.하이드루이드 배열에서
-- 이름이 "FullAssist"인 항목만 찾아 그 effects 중 type이 statUpPercent인
-- 4개 항목(str/int/dex/spd) 각각에 scaleByPassiveMod/scaleFactor만
-- 병합(jsonb ||)함 — 이후 있었을 수 있는 다른 라이브 데이터 변경분을
-- 건드리지 않기 위해 이 경로 하나만 정밀 수정. 이미 필드가 있는 상태에서
-- 다시 실행해도 같은 값을 덮어쓸 뿐이라 안전하게 재실행 가능(멱등).
-- ============================================================================

update public.game_content
set
  data = jsonb_set(
    data,
    '{jobSkills,하이드루이드}',
    (
      select coalesce(jsonb_agg(
        case when skill->>'name' = 'FullAssist'
          then jsonb_set(
            skill,
            '{effects}',
            (
              select jsonb_agg(
                case when eff->>'type' = 'statUpPercent'
                  then eff || jsonb_build_object('scaleByPassiveMod', 'healingDealtPct', 'scaleFactor', 1)
                  else eff
                end
              )
              from jsonb_array_elements(skill->'effects') eff
            )
          )
          else skill
        end
      ), '[]'::jsonb)
      from jsonb_array_elements(data->'jobSkills'->'하이드루이드') skill
    ),
    false
  ),
  version = '2026-08-24a'
where key = 'skillTable';
