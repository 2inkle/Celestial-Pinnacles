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
        <span id="devToolsNavSlot"></span>
      </div>
    </nav>
  `;

  document.write(navHTML);

  document.addEventListener("DOMContentLoaded", () => {
    const devSlot = document.getElementById("devToolsNavSlot");
    const isDev = (localStorage.getItem("battleSim_username") || "2inkle") === "2inkle";

    if (devSlot && isDev) {
      devSlot.innerHTML = `<a href="dev-tools.html" class="gnav-item ${isActive('dev-tools')}">🛠 개발자도구</a>`;
    }
  });
})();
