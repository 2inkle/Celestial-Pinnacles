(function() {
  const currentPath = location.pathname.split('/').pop() || 'roster-index.html';
  const isActive = (path) => currentPath.includes(path) ? 'active' : '';

  const navHTML = `
    <nav class="global-nav">
      <div class="global-nav-inner">
        <a href="roster-index.html" class="gnav-item ${isActive('roster')}">🏠 Home</a>
        <a href="village.html" class="gnav-item ${isActive('village')}">🏘️ Village</a>
        <a href="guild.html" class="gnav-item ${isActive('guild')}">📜 Guild</a>
        <a href="battle-select.html" class="gnav-item ${isActive('battle')}">⚔️ Battle</a>
        <a href="item.html" class="gnav-item ${isActive('item')}">🎒 Item</a>
        <a href="workshop.html" class="gnav-item ${isActive('workshop')}">🔨 Workshop</a>
        <a href="guide.html" class="gnav-item ${isActive('guide')}">📖 길라잡이</a>
        <span id="myBattleLogsNavSlot"></span>
        <span id="devToolsNavSlot"></span>
      </div>
    </nav>
  `;

  document.write(navHTML);

  // 개발자도구 링크는 profiles.is_admin 기준으로만 노출한다. 예전엔
  // localStorage.getItem("battleSim_username")==="2inkle" 방식이었는데,
  // Discord OAuth 로그인 흐름이 이 키를 어디서도 set한 적이 없어서 항상
  // 빈 값 → "2inkle" 폴백이 100% 발동 → 로그인한 사람 전원이 관리자로
  // 보이던 실제 노출 문제가 있었다(2026-08-14 character-sheet.html 전환
  // 작업 중 발견, CLAUDE.md 참조).
  //
  // window.sbClient/window.AuthGuard가 없는(=아직 Supabase로 전환 안 된)
  // 페이지에서는 조용히 스킵한다 — "링크가 안 보임"이 "전원에게 보임"보다
  // 안전한 방향이라 페일클로즈를 택함. 그런 페이지에서 실제 관리자가
  // 개발자도구에 가려면 이미 전환된 페이지(예: roster-index.html)를 거치면
  // 됨 — 나머지 페이지가 전환되면 이 제약도 자연히 사라짐.
  document.addEventListener("DOMContentLoaded", async () => {
    if (!window.sbClient || !window.AuthGuard) return;
    const devSlot = document.getElementById("devToolsNavSlot");
    const logsSlot = document.getElementById("myBattleLogsNavSlot");
    if (!devSlot && !logsSlot) return;

    const { data } = await window.sbClient.auth.getSession();
    if (!data.session) return;

    // 전투 기록 링크는 관리자 여부와 무관하게, 로그인만 했으면 누구나 보임
    // (devToolsNavSlot과 달리 isAdmin 검사 없음 — 2026-08-18 전투 로그
    // 저장/공유 기능과 함께 추가).
    if (logsSlot) {
      logsSlot.innerHTML = `<a href="battle-log-view.html" class="gnav-item ${isActive('battle-log-view')}">📜 전투 기록</a>`;
    }

    const isDev = await window.AuthGuard.isAdmin(data.session);
    if (isDev && devSlot) {
      devSlot.innerHTML = `<a href="dev-tools.html" class="gnav-item ${isActive('dev-tools')}">🛠 개발자도구</a>`;
    }
  });
})();
