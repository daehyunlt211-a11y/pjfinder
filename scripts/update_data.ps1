# 기업마당 공고 수집 후 GitHub에 반영하는 스크립트 (한국 PC에서 실행)
# API 키는 scripts\apikey.txt 파일(한 줄) 또는 BIZINFO_API_KEY 환경변수로 전달
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not $env:BIZINFO_API_KEY) {
    $keyFile = Join-Path $PSScriptRoot "apikey.txt"
    if (Test-Path $keyFile) {
        $env:BIZINFO_API_KEY = (Get-Content $keyFile -Raw).Trim()
    }
}
if (-not $env:BIZINFO_API_KEY) {
    Write-Host "API 키가 없습니다. scripts\apikey.txt 파일에 인증키를 저장해주세요." -ForegroundColor Red
    exit 1
}

Write-Host "[1/3] 기업마당 API에서 공고 수집 중..."
python scripts/fetch_bizinfo.py
if ($LASTEXITCODE -ne 0) { Write-Host "수집 실패" -ForegroundColor Red; exit 1 }

Write-Host "[2/3] 원격 변경사항 동기화..."
git pull --rebase origin main

Write-Host "[3/3] 변경사항 업로드..."
git add data/announcements.json
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
    git commit -m "데이터 갱신: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    git push origin main
    Write-Host "완료: 사이트에 1~2분 내 반영됩니다." -ForegroundColor Green
} else {
    Write-Host "완료: 변경된 공고가 없습니다." -ForegroundColor Green
}
