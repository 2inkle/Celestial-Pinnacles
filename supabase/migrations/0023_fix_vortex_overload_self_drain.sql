-- ============================================================================
-- game_content(skillTable) 갱신 — Vortex Overload의 drainPersonalResource가
-- 시전자가 아니라 피격 대상의 집속 마력을 지우던 버그 수정.
--
-- 실전투("???"전) 신고: Vortex Overload는 "자신의" 집속 마력을 전부 소모하는
-- 궁극기여야 하는데, 실제로는 맞은 대상(플레이어)의 집속 마력을 지워버려서
-- 둠로드 잡을 쓰는 플레이어의 자원 관리 자체가 불가능해지는 문제였음.
--
-- 원인: effects 배열의 drainPersonalResource 항목에 "target":"self"가 빠져
-- 있었음 — src/skillResolution.js의 resolveOneHit()은 이 필드가 없으면
-- 무조건 피격 대상에게 효과를 적용하는데(Charge Attack의 "자신 전열화"와
-- 같은 매커니즘), 딱 이 한 항목만 그 지정이 누락돼 있었음. 바로 앞의 STR/
-- INT/DEX -5% 디버프 3개는 "피격 대상이 약해진다"는 의도된 동작이라 그대로
-- 둠(사용자 확인, 2026-08-22).
--
-- 전체 skillTable JSON을 통째로 교체하지 않고, jobSkills["???"] 배열에서
-- 이름이 "Vortex Overload"인 항목만 찾아 그 effects 중 type이
-- drainPersonalResource인 항목에만 target:"self"를 병합함(jsonb ||) —
-- 이후(0016 등) 있었을 수 있는 다른 라이브 데이터 변경분을 건드리지 않기
-- 위해 전체 블롭 재삽입 대신 이 경로 하나만 정밀 수정하는 방식을 택함.
-- 이미 target:"self"가 있는 상태에서 다시 실행해도 같은 값을 덮어쓸 뿐이라
-- 안전하게 재실행 가능(멱등).
-- ============================================================================

update public.game_content
set
  data = jsonb_set(
    data,
    '{jobSkills,???}',
    (
      select coalesce(jsonb_agg(
        case when skill->>'name' = 'Vortex Overload'
          then jsonb_set(
            skill,
            '{effects}',
            (
              select jsonb_agg(
                case when eff->>'type' = 'drainPersonalResource'
                  then eff || jsonb_build_object('target', 'self')
                  else eff
                end
              )
              from jsonb_array_elements(skill->'effects') eff
            )
          )
          else skill
        end
      ), '[]'::jsonb)
      from jsonb_array_elements(data->'jobSkills'->'???') skill
    ),
    false
  ),
  version = '2026-08-22a'
where key = 'skillTable';
