# -*- coding: utf-8 -*-
"""KOSMO 스마트공장 사업관리시스템(smart-factory.kr)에서 사업공고를 수집해
data/announcements.json 에 병합하는 스크립트. (인증키 불필요)

- 목록 API로 전체 공고(과거 이력 포함)를 페이지 순회 수집
- 최근 공고(기본 240일 이내)에 한해 상세 본문/첨부파일까지 수집
- 오래된 공고는 목록 정보만 저장 (공고 시기 예측용 이력)

사용법: python scripts/fetch_kosmo.py
"""
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone, timedelta

from fetch_bizinfo import strip_html, DATA_PATH

BASE = "https://www.smart-factory.kr"
LIST_URL = BASE + "/usr/bg/ba/ma/bsnsPbanc/selectBsnsPbancPage.do"
DETAIL_URL = BASE + "/usr/bg/ba/ma/bsnsPbanc/selectBsnsPbancDtlPage.do"
FILES_URL = BASE + "/files/selectTmpltAtchList.do"
DOWNLOAD_URL = BASE + "/file/imageFileDownload.do?atchFileId={}&atchFileSn={}"
DETAIL_PAGE = BASE + "/usr/bg/ba/ma/bsnsPbancDtl?pbancId={}&pbancSn={}"

PAGE_SIZE = 100
DETAIL_DAYS = int(os.environ.get("KOSMO_DETAIL_DAYS", "240"))  # 상세 수집 대상 기간
DELAY = 0.15  # 요청 간격(초) — 서버 부담 최소화

KST = timezone(timedelta(hours=9))


def post_json(url, payload, retries=3):
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (PjFinder collector)",
        "Referer": BASE + "/usr/bg/ba/ma/bsnsPbanc",
    })
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=40) as resp:
                return json.loads(resp.read().decode("utf-8", errors="replace"))
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(2 * (attempt + 1))


def fetch_list_page(page):
    payload = {
        "key": "list", "bizYr": "", "bizClsfYrNm": "", "dtlPbancNm": "",
        "rcptStts": "",  # 빈 값 = 전체(마감 포함)
        "ordrSe": "REG",
        "currentPage": str(page), "showPage": str(PAGE_SIZE),
        "blockPage": "10", "pageBasic": "1", "startNumber": str((page - 1) * PAGE_SIZE),
    }
    doc = post_json(LIST_URL, payload)
    items = doc.get("pbancList") or []
    total = int((doc.get("paginationInfo") or {}).get("totalCount") or 0)
    return items, total


def fetch_detail(pbanc_id, pbanc_sn):
    doc = post_json(DETAIL_URL, {"key": "info", "pbancId": pbanc_id, "pbancSn": pbanc_sn})
    return doc.get("pbancInfo") or {}


def fetch_attachments(atch_file_id):
    if not atch_file_id:
        return []
    doc = post_json(FILES_URL, {
        "tmpltType": 0, "exclDocTypeCd": [], "speclDocTypeCd": [],
        "atchFileId": atch_file_id, "taskClsfCd": "", "upDocTypeCd": "F00276",
        "sbmsnEsntlYn": "N", "extnNm": "", "singleOnlyRead": "N",
    })
    files = doc.get("fileList") or []
    out = []
    for f in files:
        if f.get("delYn") == "Y":
            continue
        enc_id, enc_sn = f.get("atchFileIdEncode"), f.get("atchFileSnEncode")
        if not enc_id or not enc_sn:
            continue
        out.append({
            "name": f.get("orginalFileNm") or "첨부파일",
            "url": DOWNLOAD_URL.format(enc_id, enc_sn),
        })
    return out


def parse_period(raw):
    """'2026-07-14 09:00 ~ 2026-07-24 17:00' → (시작일, 종료일)"""
    dates = re.findall(r"(\d{4})-(\d{2})-(\d{2})", raw or "")
    if len(dates) >= 2:
        return "-".join(dates[0]), "-".join(dates[1])
    return None, None


def parse_org(pbanc_no):
    """공고번호에서 공고 기관명 추출: '(재)대구테크노파크 공고 제20260714-16' → '(재)대구테크노파크'"""
    if not pbanc_no:
        return ""
    m = re.match(r"^(.*?)(?:\s*공고)?\s*제?\s*\d", pbanc_no.strip())
    org = (m.group(1).strip() if m else pbanc_no.strip())
    return org if 1 < len(org) <= 30 else ""


def kosmo_id(item):
    return f"KOSMO_{item.get('pbancId')}_{item.get('pbancSn')}"


def track_tags(title, cls_nm):
    text = f"{title} {cls_nm}"
    tags = ["스마트공장", "KOSMO"]
    if "상생" in text:
        tags.append("대중소상생형")
    if "고도화" in text:
        tags.append("고도화")
    if "기초" in text:
        tags.append("기초")
    if "AI" in text.upper():
        tags.append("AI")
    return tags


def normalize(item, detail=None, attachments=None):
    title = (item.get("dtlPbancNm") or "").strip()
    cls_nm = (item.get("bizClsfYrNm") or "").strip()
    apply_start, apply_end = parse_period(item.get("rcptYmdDa2001"))
    detail = detail or {}
    return {
        "id": kosmo_id(item),
        "title": title,
        "agency": "중소벤처기업부",
        "org": parse_org(item.get("pbancNo")) or "스마트공장사업관리시스템",
        "field": "기술",
        "subField": cls_nm or "스마트공장",
        "summary": strip_html(detail.get("pbancCn", ""))[:2000],
        "target": "",
        "applyStart": apply_start,
        "applyEnd": apply_end,
        "applyText": (item.get("rcptYmdDa2001") or "").strip(),
        "applyMethod": "KOSMO 스마트공장 사업관리시스템(www.smart-factory.kr) 온라인 신청"
                       if item.get("onlnAplyYn") == "Y" else "",
        "contact": "",
        "url": DETAIL_PAGE.format(item.get("pbancId"), item.get("pbancSn")),
        "attachments": attachments or [],
        "hashtags": track_tags(title, cls_nm),
        "created": (item.get("pbancYmd") or "").strip(),
        "views": 0,
        "source": "KOSMO",
    }


def load_doc():
    if os.path.exists(DATA_PATH):
        with open(DATA_PATH, encoding="utf-8") as f:
            doc = json.load(f)
        if not doc.get("sample"):
            return doc
    return {"sample": False, "announcements": []}


def main():
    doc = load_doc()
    existing = {a["id"]: a for a in doc.get("announcements", [])}
    cutoff = (datetime.now(KST) - timedelta(days=DETAIL_DAYS)).strftime("%Y-%m-%d")

    # 1) 목록 전체 순회
    rows, page = [], 1
    while True:
        items, total = fetch_list_page(page)
        if not items:
            break
        rows.extend(items)
        if len(rows) >= total or page > 200:
            break
        page += 1
        time.sleep(DELAY)
    print(f"KOSMO 목록 수집: {len(rows)}건")

    # 2) 신규 + 최근 공고만 상세/첨부 수집
    added, updated, detailed = 0, 0, 0
    for i, item in enumerate(rows):
        aid = kosmo_id(item)
        is_new = aid not in existing
        pbanc_ymd = (item.get("pbancYmd") or "").strip()
        detail, attachments = None, None
        if is_new and pbanc_ymd >= cutoff:
            try:
                detail = fetch_detail(item.get("pbancId"), item.get("pbancSn"))
                time.sleep(DELAY)
                attachments = fetch_attachments(detail.get("atchFileId"))
                time.sleep(DELAY)
                detailed += 1
            except Exception as e:
                print(f"  상세 수집 실패({aid}): {e}")
        a = normalize(item, detail, attachments)
        if not is_new:
            # 기존 상세 정보(본문/첨부)는 유지하고 목록 레벨 정보만 갱신
            old = existing[aid]
            for k in ("summary", "attachments", "target", "contact"):
                if old.get(k):
                    a[k] = old[k]
            updated += 1
        else:
            added += 1
        existing[aid] = a
        if (i + 1) % 200 == 0:
            print(f"  진행: {i + 1}/{len(rows)}")

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
    print(f"KOSMO 수집 완료: 신규 {added}건(상세 {detailed}건), 갱신 {updated}건, 전체 {len(announcements)}건")


if __name__ == "__main__":
    sys.exit(main())
