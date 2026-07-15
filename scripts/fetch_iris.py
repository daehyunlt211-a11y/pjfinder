# -*- coding: utf-8 -*-
"""IRIS 범부처통합연구지원시스템(iris.go.kr)에서 R&D 사업공고를 수집해
data/announcements.json 에 병합하는 스크립트. (인증키 불필요)

- 접수예정/접수중 공고는 전부, 마감 공고는 최근 IRIS_HISTORY_DAYS(기본 540일)까지 수집
- 최근 IRIS_DETAIL_DAYS(기본 180일) 공고는 상세 본문/첨부파일까지 수집
- 매일 실행 시에는 이미 수집된 마감 공고 구간에서 순회를 조기 종료(증분 수집)

사용법: python scripts/fetch_iris.py
        IRIS_BACKFILL=1 python scripts/fetch_iris.py  # 최초 전체 백필
"""
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone, timedelta

from fetch_bizinfo import strip_html, DATA_PATH

BASE = "https://www.iris.go.kr"
LIST_URL = BASE + "/contents/retrieveBsnsAncmBtinSituList.do"
DETAIL_URL = BASE + "/contents/retrieveBsnsAncmView.do?ancmId={}"
DOWNLOAD_URL = BASE + "/comm/file/fileDownload.do?atchDocId={}&atchFileId={}"

HISTORY_DAYS = int(os.environ.get("IRIS_HISTORY_DAYS", "30"))    # 마감 공고 수집 범위(최근 N일)
DETAIL_DAYS = int(os.environ.get("IRIS_DETAIL_DAYS", "180"))     # 상세 수집 대상 기간
MAX_DETAILS = int(os.environ.get("IRIS_MAX_DETAILS", "400"))     # 회당 상세 수집 상한(매일 조금씩 보충)
BACKFILL = os.environ.get("IRIS_BACKFILL", "") == "1"
DELAY = 0.15

KST = timezone(timedelta(hours=9))
TODAY = datetime.now(KST)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (PjFinder collector)",
    "Referer": BASE + "/contents/retrieveBsnsAncmBtinSituListView.do",
}


def http(url, data=None, retries=3):
    body = urllib.parse.urlencode(data).encode() if data else None
    headers = dict(HEADERS)
    if body:
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    req = urllib.request.Request(url, data=body, headers=headers)
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=40) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(2 * (attempt + 1))


def fetch_list(prg, page):
    doc = json.loads(http(LIST_URL, {"ancmPrg": prg, "pageIndex": str(page)}))
    items = doc.get("listBsnsAncmBtinSitu") or []
    info = doc.get("paginationInfo") or {}
    return items, int(info.get("totalRecordCount") or 0)


def norm_date(s):
    """'2026.04.28' / '2026-04-28' → '2026-04-28'"""
    m = re.search(r"(\d{4})[.\-/](\d{2})[.\-/](\d{2})", s or "")
    return f"{m.group(1)}-{m.group(2)}-{m.group(3)}" if m else None


def parse_detail(html):
    """상세 HTML에서 본문/문의처/첨부파일 추출."""
    out = {"summary": "", "contact": "", "attachments": []}
    # 첨부파일: f_bsnsAncm_downloadAtchFile('atchDocId','atchFileId','파일명','크기')
    for m in re.finditer(
            r"f_bsnsAncm_downloadAtchFile\('([^']*)','([^']*)','([^']*)'\s*,\s*'?\d*'?\)", html):
        doc_id, file_id, name = m.group(1), m.group(2), m.group(3).strip()
        out["attachments"].append({
            "name": name or "첨부파일",
            "url": DOWNLOAD_URL.format(urllib.parse.quote(doc_id, safe=""),
                                       urllib.parse.quote(file_id, safe="")),
        })
    text = strip_html(re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", " ", html))
    # 문의처: '사업담당자 연락처' 라벨 다음 내용
    m = re.search(r"연락처\s*\n?\s*([^\n]{5,120})", text)
    if m and "미개시" not in m.group(1):
        out["contact"] = m.group(1).strip()
    # 본문: '■ 공고문' 이후 ~ '신청하기/목록' 이전
    m = re.search(r"공고문\s*\n([\s\S]*?)(?:신청하기|프린트하기|링크공유|$)", text)
    if m:
        out["summary"] = m.group(1).strip()[:1500]
    return out


def normalize(item, detail=None):
    detail = detail or {}
    return {
        "id": f"IRIS_{item.get('ancmId')}",
        "title": (item.get("ancmTl") or "").strip(),
        "agency": (item.get("blngGovdSeNm") or "").strip(),
        "org": (item.get("sorgnNm") or "").strip(),
        "field": "R&D",
        "subField": (item.get("pbofrTpSeNmLst") or "").strip(),
        "summary": detail.get("summary", ""),
        "target": "",
        "applyStart": norm_date(item.get("rcveStrDe")),
        "applyEnd": norm_date(item.get("rcveEndDe")),
        "applyText": f"{item.get('rcveStrDe', '')} ~ {item.get('rcveEndDe', '')}".strip(" ~"),
        "applyMethod": "IRIS 범부처통합연구지원시스템(www.iris.go.kr) 온라인 접수",
        "contact": detail.get("contact", ""),
        "url": DETAIL_URL.format(item.get("ancmId")),
        "attachments": detail.get("attachments", []),
        "hashtags": ["R&D", "IRIS"] + ([item.get("pbofrTpSeNmLst")] if item.get("pbofrTpSeNmLst") else []),
        "created": norm_date(item.get("ancmDe")) or "",
        "views": 0,
        "source": "IRIS",
    }


def load_doc():
    if os.path.exists(DATA_PATH):
        with open(DATA_PATH, encoding="utf-8") as f:
            doc = json.load(f)
        if not doc.get("sample"):
            return doc
    return {"sample": False, "announcements": []}


def collect(prg, existing, cutoff, incremental_stop):
    """한 탭(prg)을 순회 수집. incremental_stop=True면 기존에 수집한 오래된 구간에서 중단."""
    rows, page, known_streak = [], 1, 0
    while True:
        items, total = fetch_list(prg, page)
        if not items:
            break
        stop = False
        for it in items:
            created = norm_date(it.get("ancmDe")) or ""
            if prg == "ancmEnd" and created and created < cutoff:
                stop = True
                break
            if incremental_stop and f"IRIS_{it.get('ancmId')}" in existing:
                known_streak += 1
                # 연속 30건이 이미 수집된 것이면 이후는 기존 구간으로 판단하고 중단
                if prg == "ancmEnd" and known_streak >= 30:
                    stop = True
                    break
            else:
                known_streak = 0
            rows.append(it)
        if stop or page * 10 >= total or page > 3000:
            break
        page += 1
        time.sleep(DELAY)
    return rows


def main():
    doc = load_doc()
    existing = {a["id"]: a for a in doc.get("announcements", [])}
    cutoff = (TODAY - timedelta(days=HISTORY_DAYS)).strftime("%Y-%m-%d")
    detail_cutoff = (TODAY - timedelta(days=DETAIL_DAYS)).strftime("%Y-%m-%d")

    rows = []
    # 접수중을 먼저 수집해 상세 수집 상한(MAX_DETAILS)이 접수중 공고에 우선 배정되도록 함
    tabs = [t.strip() for t in os.environ.get("IRIS_TABS", "ancmIng,ancmPre,ancmEnd").split(",") if t.strip()]
    for prg in tabs:
        got = collect(prg, existing, cutoff, incremental_stop=not BACKFILL)
        print(f"IRIS {prg}: {len(got)}건", flush=True)
        rows.extend(got)

    added, updated, detailed = 0, 0, 0
    for i, item in enumerate(rows):
        aid = f"IRIS_{item.get('ancmId')}"
        is_new = aid not in existing
        created = norm_date(item.get("ancmDe")) or ""
        # 신규이거나, 기존에 상세 없이 저장된 공고를 상한 내에서 보충 수집
        needs_detail = (is_new or not (existing.get(aid) or {}).get("summary")) \
            and created >= detail_cutoff and detailed < MAX_DETAILS
        detail = None
        if needs_detail:
            try:
                detail = parse_detail(http(DETAIL_URL.format(item.get("ancmId"))))
                detailed += 1
                time.sleep(DELAY)
            except Exception as e:
                print(f"  상세 수집 실패({aid}): {e}", flush=True)
        a = normalize(item, detail)
        if not is_new:
            old = existing[aid]
            for k in ("summary", "attachments", "target", "contact"):
                if old.get(k):
                    a[k] = old[k]
            updated += 1
        else:
            added += 1
        existing[aid] = a
        if (i + 1) % 500 == 0:
            print(f"  진행: {i + 1}/{len(rows)} (상세 {detailed}건)", flush=True)

    announcements = sorted(existing.values(), key=lambda a: a.get("created") or "", reverse=True)
    doc = {
        "sample": False,
        "updatedAt": datetime.now(KST).strftime("%Y-%m-%d %H:%M:%S"),
        "source": "기업마당(bizinfo.go.kr) + KOSMO(smart-factory.kr) + IRIS(iris.go.kr)",
        "announcements": announcements,
    }
    os.makedirs(os.path.dirname(DATA_PATH), exist_ok=True)
    with open(DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    print(f"IRIS 수집 완료: 신규 {added}건(상세 {detailed}건), 갱신 {updated}건, 전체 {len(announcements)}건")


if __name__ == "__main__":
    sys.exit(main())
