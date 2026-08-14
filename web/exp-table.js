// ============================================================================
// 경험치 테이블 / 레벨업 (공용)
//
// 예전엔 이 공식이 battle-view.html 안에만 있었고, 나머지는 각자 다른 값을
// 하드코딩해서 실제로는 공식이 거의 적용되지 않는 상태였음:
//   - hire.html / village.html이 신규 캐릭터를 expToNext:1000으로 만들어서
//     Lv1→2에 100이 아니라 1000이 필요했음(의도의 10배)
//   - village.html의 예제 Lv30 캐릭터는 expToNext:50000(상한값 아님)
//   - dispatch.html은 exp를 더하기만 하고 레벨업 판정을 아예 안 해서, 파견으로
//     쌓은 경험치가 레벨로 전환되지 않았음
// 그래서 공식을 이 파일 하나로 모으고 전부 여기를 거치도록 바꿈.
//
// 공식(설계 확정값):
//   Lv1        100
//   Lv2        200
//   Lv3 이상   160 + 17 × Lv²
//   Lv30(상한) EXP_HARD_CAP — 사실상 도달 불가능한 값으로 고정해 만렙에서
//              레벨업이 절대 일어나지 않게 하는 안전장치
// ============================================================================
(function () {
  const LEVEL_CAP = 30;
  const EXP_HARD_CAP = 999999;

  function expToNextForLevel(level) {
    if (level === 1) return 100;
    if (level === 2) return 200;
    if (level >= LEVEL_CAP) return EXP_HARD_CAP;
    return 160 + 17 * level * level;
  }

  // expToNext는 level에서 유도되는 값이므로 저장된 값을 믿지 않고 항상 다시
  // 계산한다(이 프로젝트가 unassignedPoints/hp/maxPatternSlots 등을 저장하지
  // 않고 매번 재계산하는 것과 같은 원칙). 예전에 잘못된 값으로 저장된 캐릭터도
  // 이 함수를 거치는 순간 자동으로 정상값으로 교정됨.
  function syncExpFields(character) {
    if (!character) return character;
    character.level = Math.min(Math.max(1, character.level || 1), LEVEL_CAP);
    // Math.max(0, ...)이 꼭 필요함 — `(-5) || 0`은 -5라서(음수는 truthy)
    // 기본값 처리만으로는 음수 exp가 그대로 통과함.
    character.exp = Math.min(Math.max(0, character.exp || 0), EXP_HARD_CAP);
    character.expToNext = expToNextForLevel(character.level);
    return character;
  }

  // 경험치를 주고 필요한 만큼 레벨업시킴.
  // 스탯/스킬 포인트는 character-sheet.html이 (레벨-1)×포인트 식으로 매번 다시
  // 계산하므로(캐릭터 데이터에 저장 안 함), 여기서 level만 정확히 올려주면
  // 나머지는 저절로 따라옴. 레벨업으로 얻는 건 그 두 가지뿐.
  function grantExp(character, amount) {
    syncExpFields(character);

    if (character.level >= LEVEL_CAP) {
      // 만렙이어도 exp 자체는 캡까지 쌓이게 두되 레벨업은 절대 안 일어남.
      character.exp = Math.min(EXP_HARD_CAP, character.exp + (amount || 0));
      return character;
    }

    character.exp += (amount || 0);
    while (character.level < LEVEL_CAP && character.exp >= character.expToNext) {
      character.exp -= character.expToNext;
      character.level += 1;
      character.expToNext = expToNextForLevel(character.level);
    }
    if (character.level >= LEVEL_CAP) {
      character.level = LEVEL_CAP;
      character.expToNext = EXP_HARD_CAP;
    }
    character.exp = Math.min(character.exp, EXP_HARD_CAP);
    return character;
  }

  const api = { LEVEL_CAP, EXP_HARD_CAP, expToNextForLevel, syncExpFields, grantExp };

  // 브라우저(<script>)와 Node(require) 양쪽에서 그대로 쓰기 위함 — src/ 엔진
  // 파일들과 같은 방식(demo-*.js에서 검증할 수 있게).
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.ExpTable = api;
})();
