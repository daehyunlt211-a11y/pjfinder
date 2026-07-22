# 기업마당 + KOSMO 공고 수집 후 GitHub에 반영하는 스크립트 (한국 PC에서 실행)
# API 키는 scripts\apikey.txt 파일(한 줄) 또는 BIZINFO_API_KEY 환경변수로 전달
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# 로그: 매 실행마다 새로 작성 (scripts\update_log.txt)
$logPath = Join-Path $PSScriptRoot "update_log.txt"
try { Start-Transcript -Path $logPath -Force | Out-Null } catch {}

$env:PYTHONIOENCODING = "utf-8"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

function Fail($msg) {
    Write-Host "실패: $msg" -ForegroundColor Red
    try { Stop-Transcript | Out-Null } catch {}
    exit 1
}

if (-not $env:BIZINFO_API_KEY) {
    $keyFile = Join-Path $PSScriptRoot "apikey.txt"
    if (Test-Path $keyFile) {
        $env:BIZINFO_API_KEY = (Get-Content $keyFile -Raw).Trim()
    }
}
if (-not $env:BIZINFO_API_KEY) { Fail "API 키가 없습니다. scripts\apikey.txt 파일에 인증키를 저장해주세요." }

Write-Host "[1/4] 원격 변경사항 동기화..."
git pull --rebase --autostash origin main 2>&1 | ForEach-Object { "$_" } | Write-Host
if ($LASTEXITCODE -ne 0) { Fail "git pull 오류" }

Write-Host "[2/4] 기업마당 API에서 공고 수집 중..."
python scripts/fetch_bizinfo.py 2>&1 | ForEach-Object { "$_" } | Write-Host
if ($LASTEXITCODE -ne 0) { Fail "기업마당 수집 오류" }

Write-Host "[3/5] KOSMO(스마트공장) 공고 수집 중..."
if (Test-Path (Join-Path $PSScriptRoot "fetch_kosmo.py")) {
    python scripts/fetch_kosmo.py 2>&1 | ForEach-Object { "$_" } | Write-Host
    if ($LASTEXITCODE -ne 0) {
        # 크롤링 소스는 사이트 개편 시 깨질 수 있음 — 실패해도 나머지 데이터는 반영
        Write-Host "경고: KOSMO 수집 실패 (다른 소스 데이터만 반영합니다)" -ForegroundColor Yellow
    }
} else {
    Write-Host "fetch_kosmo.py 없음 — 건너뜀"
}

Write-Host "[4/5] IRIS(R&D) 공고 수집 중..."
if (Test-Path (Join-Path $PSScriptRoot "fetch_iris.py")) {
    python scripts/fetch_iris.py 2>&1 | ForEach-Object { "$_" } | Write-Host
    if ($LASTEXITCODE -ne 0) {
        Write-Host "경고: IRIS 수집 실패 (다른 소스 데이터만 반영합니다)" -ForegroundColor Yellow
    }
} else {
    Write-Host "fetch_iris.py 없음 — 건너뜀"
}

Write-Host "[5/6] 기관 게시판(에너지공단/K-Startup/KEITI) 수집 중..."
if (Test-Path (Join-Path $PSScriptRoot "fetch_boards.py")) {
    python scripts/fetch_boards.py 2>&1 | ForEach-Object { "$_" } | Write-Host
    if ($LASTEXITCODE -ne 0) {
        Write-Host "경고: 게시판 수집 실패 (다른 소스 데이터만 반영합니다)" -ForegroundColor Yellow
    }
} else {
    Write-Host "fetch_boards.py 없음 — 건너뜀"
}

Write-Host "[6/6] 변경사항 업로드..."
git add data/announcements.json
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
    git commit -m "데이터 갱신: $(Get-Date -Format 'yyyy-MM-dd HH:mm')" 2>&1 | ForEach-Object { "$_" } | Write-Host
    git push origin main 2>&1 | ForEach-Object { "$_" } | Write-Host
    if ($LASTEXITCODE -ne 0) { Fail "git push 오류" }
    Write-Host "완료: 사이트에 1~2분 내 반영됩니다." -ForegroundColor Green
} else {
    Write-Host "완료: 변경된 공고가 없습니다." -ForegroundColor Green
}
try { Stop-Transcript | Out-Null } catch {}
exit 0
