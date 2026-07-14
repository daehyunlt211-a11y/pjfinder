# -*- coding: utf-8 -*-
"""기업마당(bizinfo.go.kr) OpenAPI에서 정부지원사업 공고를 수집해
data/announcements.json 에 누적 저장하는 스크립트.

사용법:
    BIZINFO_API_KEY 환경변수에 인증키를 넣고 실행
    python scripts/fetch_bizinfo.py

기존 데이터와 병합(공고ID 기준)하므로 매일 실행하면 과거 공고가 계속 누적되고,
누적된 이력은 웹앱의 '공고 시기 예측' 화면에서 사용된다.
"""
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone, timedelta

API_URL = "https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do"
BASE_URL = "https://www.bizinfo.go.kr"
DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "announcements.json")
FETCH_COUNT = int(os.environ.get("BIZINFO_FETCH_COUNT", "500"))

KST = timezone(timedelta(hours=9))


def strip_html(text):
    if not text:
        return ""
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
    text = re.sub(r"</p\s*>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    text = text.replace("&nbsp;", " ").replace("&amp;", "&")
    text = text.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"')
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def parse_apply_period(raw):
    """'20260101 ~ 20260131' 형태를 (start, end, 원문)으로 분해. 상시/소진시 등은 원문만 유지."""
    if not raw:
        return None, None, ""
    m = re.search(
        r"(\d{4})[-./]?(\d{2})[-./]?(\d{2})\s*~\s*(\d{4})[-./]?(\d{2})[-./]?(\d{2})", raw)
    if m:
        g = m.groups()
        return f"{g[0]}-{g[1]}-{g[2]}", f"{g[3]}-{g[4]}-{g[5]}", raw.strip()
    return None, None, raw.strip()


def extract_attachments(item):
    """API 응답에서 첨부파일 후보 필드를 찾아 [{name, url}] 목록으로 변환."""
    attachments = []
    # 필드명이 문서 버전에 따라 다를 수 있어 경로성 필드를 폭넓게 탐색
    path_keys = [k for k in item.keys() if "flpth" in k.lower() or "filepath" in k.lower()]
    name_keys = [k for k in item.keys() if re.search(r"file.?nm|flnm", k.lower())]
    paths, names = [], []
    for k in path_keys:
        v = (item.get(k) or "").strip()
        if v:
            paths.extend(p.strip() for p in v.split(",") if p.strip())
    for k in name_keys:
        v = (item.get(k) or "").strip()
        if v:
            names.extend(n.strip() for n in v.split(",") if n.strip())
    for i, p in enumerate(paths):
        url = p if p.startswith("http") else BASE_URL + (p if p.startswith("/") else "/" + p)
        name = names[i] if i < len(names) else os.path.basename(urllib.parse.urlparse(url).path)
        attachments.append({"name": name or "첨부파일", "url": url})
    return attachments


def normalize(item):
    apply_start, apply_end, apply_text = parse_apply_period(item.get("reqstBeginEndDe", ""))
    url = item.get("pblancUrl", "") or ""
    if url and not url.startswith("http"):
        url = BASE_URL + (url if url.startswith("/") else "/" + url)
    created = (item.get("creatPnttm") or "").strip()  # 예: '2026-07-01' 또는 '20260701...'
    m = re.search(r"(\d{4})[-.]?(\d{2})[-.]?(\d{2})", created)
    created = f"{m.group(1)}-{m.group(2)}-{m.group(3)}" if m else ""
    hashtags = [t.strip() for t in (item.get("hashtags") or "").split(",") if t.strip()]
    return {
        "id": item.get("pblancId") or item.get("pblancNo") or "",
        "title": (item.get("pblancNm") or "").strip(),
        "agency": (item.get("jrsdInsttNm") or "").strip(),
        "org": (item.get("excInsttNm") or "").strip(),
        "field": (item.get("pldirSportRealmLclasCodeNm") or "").strip(),
        "subField": (item.get("pldirSportRealmMlsfcCodeNm") or "").strip(),
        "summary": strip_html(item.get("bsnsSumryCn", "")),
        "target": strip_html(item.get("trgetNm", "")),
        "applyStart": apply_start,
        "applyEnd": apply_end,
        "applyText": apply_text,
        "applyMethod": strip_html(item.get("reqstMthPapersCn", "")),
        "contact": strip_html(item.get("refrncNm", "")),
        "url": url,
        "attachments": extract_attachments(item),
        "hashtags": hashtags,
        "created": created,
        "views": item.get("inqireCo") or 0,
        "source": "기업마당",
    }


def fetch(api_key):
    params = urllib.parse.urlencode({
        "crtfcKey": api_key,
        "dataType": "json",
        "searchCnt": str(FETCH_COUNT),
    })
    req = urllib.request.Request(f"{API_URL}?{params}", headers={"User-Agent": "PjFinder/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        body = resp.read().decode("utf-8", errors="replace")
    data = json.loads(body)
    if isinstance(data, dict) and data.get("reqErr"):
        raise SystemExit(f"API 오류: {data['reqErr']}")
    items = data.get("jsonArray", data) if isinstance(data, dict) else data
    if not isinstance(items, list):
        raise SystemExit(f"예상하지 못한 응답 형식: {body[:300]}")
    return items


def load_existing():
    if os.path.exists(DATA_PATH):
        with open(DATA_PATH, encoding="utf-8") as f:
            doc = json.load(f)
        # 샘플 데이터는 실데이터 수집 시작 시 폐기
        if doc.get("sample"):
            return {}
        return {a["id"]: a for a in doc.get("announcements", [])}
    return {}


def main():
    api_key = os.environ.get("BIZINFO_API_KEY", "").strip()
    if not api_key:
        raise SystemExit("BIZINFO_API_KEY 환경변수가 설정되지 않았습니다. "
                         "기업마당(bizinfo.go.kr) > OpenAPI 신청 후 발급받은 키를 설정하세요.")
    items = fetch(api_key)
    existing = load_existing()
    added, updated = 0, 0
    for raw in items:
        a = normalize(raw)
        if not a["id"] or not a["title"]:
            continue
        if a["id"] in existing:
            updated += 1
        else:
            added += 1
        existing[a["id"]] = a
    for a in existing.values():
        a.setdefault("source", "기업마당")
    announcements = sorted(existing.values(), key=lambda a: a.get("created") or "", reverse=True)
    doc = {
        "sample": False,
        "updatedAt": datetime.now(KST).strftime("%Y-%m-%d %H:%M:%S"),
        "source": "기업마당(bizinfo.go.kr) OpenAPI + KOSMO(smart-factory.kr)",
        "announcements": announcements,
    }
    os.makedirs(os.path.dirname(DATA_PATH), exist_ok=True)
    with open(DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    print(f"수집 완료: 신규 {added}건, 갱신 {updated}건, 총 {len(announcements)}건")


if __name__ == "__main__":
    sys.exit(main())
