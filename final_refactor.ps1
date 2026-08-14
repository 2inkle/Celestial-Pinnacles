# final_refactor.ps1

# --- 설정 ---
# web 폴더의 정확한 전체 경로를 지정합니다.
# 예: $WebDir = "C:\Users\user\Downloads\CP\web"
$WebDir = Join-Path $PSScriptRoot "web"
# --- 설정 끝 ---

# 1. 경로 유효성 검사
Write-Host "Target Directory: $WebDir" -ForegroundColor Cyan
if (-not (Test-Path $WebDir)) {
    Write-Host "❌ Error: Cannot find 'web' directory. Please check the path in the script." -ForegroundColor Red
    exit
}

# 2. 올바른 내용의 nav.js 파일 강제 생성 (기존 손상된 파일 덮어쓰기)
$NavJsContent = @"
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
"@
[System.IO.File]::WriteAllText((Join-Path $WebDir "nav.js"), $NavJsContent, [System.Text.Encoding]::UTF8)
Write-Host "✅ nav.js has been recreated correctly." -ForegroundColor Green

# 3. 모든 HTML 파일 순회하며 리팩토링
$HtmlFiles = Get-ChildItem -Path $WebDir -Filter *.html
foreach ($File in $HtmlFiles) {
    $FilePath = $File.FullName
    $Content = Get-Content -Path $FilePath -Raw -Encoding utf8

    # a. 모든 종류의 <nav> 태그와 <script src="nav.js"> 태그를 일단 모두 제거
    $Content = $Content -replace '(?s)<nav class="global-nav.*?>.*?</nav>', ''
    $Content = $Content -replace '<script src="nav.js"></script>', ''

    # b. <body> 태그 바로 아래에 깨끗한 <script> 태그 딱 한 번만 삽입
    $Content = $Content -replace '(<body[^>]*>)', "`$1`n  <script src=`"nav.js`"></script>"

    # c. 변경된 내용 파일에 덮어쓰기
    [System.IO.File]::WriteAllText($FilePath, $Content, [System.Text.Encoding]::UTF8)
    Write-Host "✅ Refactored: $($File.Name)" -ForegroundColor Green
}

Write-Host "`n🎉 Success! All files have been correctly refactored." -ForegroundColor Yellow
