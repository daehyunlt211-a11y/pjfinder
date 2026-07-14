# 🔍 PjFinder — 정부지원과제 파인더

정부지원사업 공고를 한곳에서 **검색·요약 확인·첨부파일 다운로드**하고, 과거 공고일 패턴으로 **다음 공고 시기를 예측**하는 웹 서비스입니다.

## 주요 기능

| 화면 | 기능 |
|---|---|
| 📋 공고 목록 | 전체 공고 조회, 키워드 검색, 상태(접수중/예정/마감/상시)·분야 필터, 정렬 |
| 📄 공고 상세 | 지원분야·기관·신청기간(D-day)·지원대상·신청방법·문의처를 정리한 요약본, 첨부파일 다운로드, 원문 링크 |
| 📎 첨부파일 검색 | 파일명/공고명으로 첨부파일을 바로 검색해 다운로드 |
| 🔮 공고 시기 예측 | 같은 사업의 과거 공고일을 분석해 다음 공고 예상 시기 표시 (데이터가 누적될수록 정확해짐) |

## 구조

```
PjFinder/
├── index.html / style.css / app.js   # 웹앱 (정적 사이트, 서버 불필요)
├── data/announcements.json           # 공고 데이터 (수집 스크립트가 갱신)
├── scripts/fetch_bizinfo.py          # 기업마당 OpenAPI 수집 (BIZINFO_API_KEY 필요)
├── scripts/fetch_kosmo.py            # KOSMO(smart-factory.kr) 사업공고 수집 (키 불필요)
├── scripts/update_data.ps1           # 수집 → GitHub 반영 원클릭 스크립트 (작업 스케줄러가 매일 9시 실행)
└── .github/workflows/update-data.yml # (참고) 기업마당이 해외 IP를 차단해 자동 스케줄은 비활성화
```

데이터 출처는 두 곳이며 목록 화면에서 출처별 필터링이 가능합니다:
- **기업마당**: 전 부처 지원사업 공고 (OpenAPI)
- **KOSMO**: 스마트공장 구축·고도화 사업 공고 — 일반정부형, 대중소상생형, AI트랙 등 (smart-factory.kr)

처음에는 **샘플 데이터**가 들어 있으며, API 키를 등록하면 실제 데이터로 교체됩니다.

## 1. 기업마당 API 키 발급 (무료)

1. [기업마당](https://www.bizinfo.go.kr) 접속 → 회원가입/로그인
2. 하단 **OpenAPI** 메뉴 → 활용 신청
3. 발급된 **인증키(crtfcKey)** 를 복사

## 2. 로컬에서 실행/테스트

```powershell
# 데이터 수집 (API 키 필요)
$env:BIZINFO_API_KEY = "발급받은키"
python scripts/fetch_bizinfo.py

# 웹앱 실행
python -m http.server 8000
# 브라우저에서 http://localhost:8000 접속
```

## 3. 인터넷 공개 배포 (GitHub Pages, 무료)

1. GitHub에 새 저장소 생성 (예: `pjfinder`) 후 이 폴더를 push

   ```powershell
   git init
   git add .
   git commit -m "PjFinder 초기 구축"
   git remote add origin https://github.com/<계정명>/pjfinder.git
   git push -u origin main
   ```

2. 저장소 **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `BIZINFO_API_KEY` / Value: 발급받은 인증키

3. 저장소 **Settings → Pages**
   - Source: `Deploy from a branch`, Branch: `main` / `(root)` 선택

4. **Actions 탭 → "공고 데이터 자동 수집" → Run workflow** 로 첫 수집 실행
   - 이후 매일 오전 7시(KST)에 자동 수집되며, 과거 공고가 계속 누적되어 예측 정확도가 올라갑니다.

5. 완료! `https://<계정명>.github.io/pjfinder/` 주소를 공유하면 누구나 볼 수 있습니다.

## 참고

- 예측 정보는 과거 공고일 기반 추정치로, 실제 공고 일정과 다를 수 있습니다.
- 데이터 출처: [기업마당(bizinfo.go.kr)](https://www.bizinfo.go.kr) 지원사업정보 OpenAPI
