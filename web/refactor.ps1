# refactor.ps1 (수정본)

# 1. 스크립트가 'web' 폴더 안에 있는지, 상위 폴더에 있는지 자동 판별
if ($PSScriptRoot.EndsWith("web") -or $PSScriptRoot.EndsWith("web\")) {
    $WebDir = $PSScriptRoot
} else {
    $WebDir = Join-Path $PSScriptRoot "web"
}

# 경로 확인용 로그 출력 (한글 깨짐 방지용 영문 표기)
Write-Host "Target Directory: $WebDir" -ForegroundColor Cyan

if (-not (Test-Path $WebDir)) {
    Write-Host "❌ Error: Cannot find 'web' directory. Please check your path." -ForegroundColor Red
    exit
}

$HtmlFiles = Get-ChildItem -Path $WebDir -Filter *.html
$UpdatedCount = 0

foreach ($File in $HtmlFiles) {
    $FilePath = $File.FullName
    $Content = Get-Content -Path $FilePath -Raw -Encoding utf8
    $IsModified = $false

    # 1. 기존 <nav class="global-nav"> ... </nav> 블록을 <script src="nav.js"></script>로 교체
    $NavRegex = "(?s)<nav\s+class=`"global-nav[^`"]*``>.*?<\/nav>"
    if ($Content -match $NavRegex) {
        $Content = $Content -replace $NavRegex, '<script src="nav.js"></script>'
        $IsModified = $true
    } elseif ($Content -notlike "*nav.js*") {
        # nav 태그가 없으면 body 시작 부분에 추가
        $Content = $Content -replace "<body[^>]*>", "$`n  <script src=`"nav.js`"></script>"
        $IsModified = $true
    }

    # 2. <head> 태그 닫기 전에 common.css 주입
    if ($Content -notlike "*common.css*") {
        $Content = $Content -replace "<\/head>", "  <link rel=`"stylesheet`" href=`"common.css`">`n</head>"
        $IsModified = $true
    }

    # 3. 중복되는 구형 :root 스타일 블록 제거
    if ($Content -like "*:root*") {
        $Content = $Content -replace "(?s):root\s*\{.*?\}", "/* common.css로 이관된 root 변수 제거됨 */"
        $Content = $Content -replace "(?s)@import\s+url\([^)]+\);?", ""
        $IsModified = $true
    }

    # 변경사항이 있는 경우에만 안전하게 덮어쓰기
    if ($IsModified) {
        [System.IO.File]::WriteAllText($FilePath, $Content, [System.Text.Encoding]::UTF8)
        Write-Host "✅ Updated: $($File.Name)" -ForegroundColor Green
        $UpdatedCount++
    }
}

Write-Host "`n🎉 Success! $UpdatedCount HTML files have been refactored." -ForegroundColor Gold
