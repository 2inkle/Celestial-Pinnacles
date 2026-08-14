# fix_jobs.ps1
$WebDir = Join-Path $PSScriptRoot "web"

if (-not (Test-Path $WebDir)) {
    Write-Host "❌ 'web' 폴더를 찾을 수 없습니다." -ForegroundColor Red
    exit
}

# 1. hire.html 의 JOB_META 교체 (중첩 중괄호를 고려한 정규식)
$HirePath = Join-Path $WebDir "hire.html"
$HireContent = Get-Content -Path $HirePath -Raw -Encoding utf8
$HireRegex = '(?s)const JOB_META = \{.*?\};'
$NewHireMeta = @"
const JOB_META = {
  "사제": { portrait:"✨", startSkill:{name:"치유", tag:"MAGIC INT"}, cost:200 },
  "전사": { portrait:"🪓", startSkill:{name:"강타", tag:"PHYS STR"}, cost:150 },
  "마법사": { portrait:"🔮", startSkill:{name:"파이어볼", tag:"MAGIC INT"}, cost:220 },
  "헌터": { portrait:"🏹", startSkill:{name:"조준 사격", tag:"PHYS DEX"}, cost:150 }
};
"@
if ($HireContent -match $HireRegex) {
    $HireContent = $HireContent -replace $HireRegex, $NewHireMeta
    [System.IO.File]::WriteAllText($HirePath, $HireContent, [System.Text.Encoding]::UTF8)
    Write-Host "✅ hire.html 직업 목록 업데이트 완료" -ForegroundColor Green
}

# 2. village.html 의 RANDOM_JOB_META 교체
$VillagePath = Join-Path $WebDir "village.html"
$VillageContent = Get-Content -Path $VillagePath -Raw -Encoding utf8
$VillageRegex = '(?s)const RANDOM_JOB_META = \{.*?\};'
$NewVillageMeta = @"
const RANDOM_JOB_META = {
  "사제": { portrait:"✨", startSkill:"치유" },
  "전사": { portrait:"🪓", startSkill:"강타" },
  "마법사": { portrait:"🔮", startSkill:"파이어볼" },
  "헌터": { portrait:"🏹", startSkill:"조준 사격" }
};
"@
if ($VillageContent -match $VillageRegex) {
    $VillageContent = $VillageContent -replace $VillageRegex, $NewVillageMeta
    [System.IO.File]::WriteAllText($VillagePath, $VillageContent, [System.Text.Encoding]::UTF8)
    Write-Host "✅ village.html 무작위 용병 직업 목록 업데이트 완료" -ForegroundColor Green
}
