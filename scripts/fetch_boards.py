# -*- coding: utf-8 -*-
"""게시판형 기관 사이트에서 지원사업 공고를 수집한다. (인증키 불필요)

대상 3곳 — 기업마당/KOSMO/IRIS에 잘 올라오지 않는 영역을 보완:
  - 한국에너지공단(energy.or.kr)   : FEMS·에너지효율·에너지진단 등
  - K-Startup(k-startup.go.kr)     : 창업, 지자체 창업센터 공고
  - 한국환경산업기술원(keiti.re.kr) : 탄소중립·환경

세 곳 모두 공식 API가 아니라 게시판 HTML을 읽는 방식이라, 사이트가 개편되면
파서가 깨질 수 있다. 한 곳이 실패해도 나머지는 계속 수집되도록 사이트별로
예외를 격리한다.

사용법: python scripts/fetch_boards.py
        BOARDS_ONLY=KEA python scripts/fetch_boards.py   # 특정 사이트만
"""
import html as html_mod
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

from fetch_bizinfo import DATA_PATH, strip_html

KST = timezone(timedelta(hours=9))
TODAY = datetime.now(KST)

UA = {"User-Agent": "Mozilla/5.0 (PjFinder collector)"}
DELAY = float(os.environ.get("BOARDS_DELAY", "0.2"))
MAX_PAGES = int(os.environ.get("BOARDS_MAX_PAGES", "3"))
MAX_DETAILS = int(os.environ.get("BOARDS_MAX_DETAILS", "60"))
ONLY = os.environ.get("BOARDS_ONLY", "").strip()

# 게시판에는 지원사업 공고와 일반 공지(설문·결과발표·입찰 등)가 섞여 있다.
# 아래 규칙으로 "기업이 신청할 수 있는 공고"만 남긴다.
WANT = re.compile(r"지원사업|모집|공모|참여기업|시범사업|바우처|지원\s*계획|"
                  r"지원\s*공고|신규\s*과제|경진대회|참가\s*기업")
SKIP = re.compile(r"결과\s*(알림|발표|공고|공지)?$|선정\s*결과|평가\s*결과|낙찰|입찰|"
                  r"규격|개인정보|설문조사|채용|공청회|간담회|수의계약|"
                  r"청렴도|정기감사|시정조치")


def http(url, data=None, retries=3):
    body = urllib.parse.urlencode(data).encode() if data else None
    headers = dict(UA)
    if body:
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    req = urllib.request.Request(url, data=body, headers=headers)
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(1.5 * (attempt + 1))


def clean(s):
    """HTML 조각 → 사람이 읽는 텍스트."""
    return re.sub(r"\s+", " ", html_mod.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def is_support_notice(title):
    return bool(WANT.search(title)) and not SKIP.search(title)


def find_period(text):
    """본문에서 '2026-07-01 ~ 2026-07-31' 형태의 접수기간을 추출."""
    if not text:
        return None, None
    D = r"(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})"
    m = re.search(D + r"[^~]{0,12}~[^0-9]{0,12}" + D, text)
    if not m:
        return None, None
    g = m.groups()
    fmt = lambda y, mo, d: f"{y}-{int(mo):02d}-{int(d):02d}"
    return fmt(g[0], g[1], g[2]), fmt(g[3], g[4], g[5])


# ────────────────────────────── 한국에너지공단 ──────────────────────────────
KEA = "https://www.energy.or.kr"


def kea_list(page):
    html = http(f"{KEA}/front/board/List2.do?bbs_id=1&page={page}")
    rows = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S):
        m = re.search(r"fn_Detail\('(\d+)','(\d+)'\)", tr)
        t = re.search(r'class="cnt_txt"><span>([^<]+)</span>', tr)
        d = re.search(r">\s*(20\d{2}-\d{2}-\d{2})\s*<", tr)
        if not (m and t):
            continue
        rows.append({
            "id": f"KEA_{m.group(2)}",
            "mng_no": m.group(1),
            "board_no": m.group(2),
            "title": clean(t.group(1)),
            "created": d.group(1) if d else "",
            "has_file": "tb_file" in tr,
        })
    return rows


def kea_detail(item):
    html = http(f"{KEA}/front/board/View2.do", {
        "siteCd": "001000000000000",
        "boardMngNo": item["mng_no"],
        "boardNo": item["board_no"],
    })
    body = ""
    m = re.search(r'view_cont"?>(.*?)(?:<div class="(?:file|btn)|</section)', html, re.S)
    if m:
        body = strip_html(m.group(1))[:2000]
    attachments = []
    # onclick="fileDownload('24536','1','2')" → GET 다운로드 가능 (검증됨)
    for fno, fseq, bmng in re.findall(r"fileDownload\('(\d+)','(\d+)','(\d+)'\)", html):
        name = ""
        nm = re.search(r"fileDownload\('%s','%s','%s'\)[^>]*>\s*<span>.*?</em>([^<]+)"
                       % (fno, fseq, bmng), html, re.S)
        if nm:
            name = clean(nm.group(1))
        attachments.append({
            "name": name or "첨부파일",
            "url": f"{KEA}/commonFile/fileDownload.do?fileNo={fno}&fileSeq={fseq}&boardMngNo={bmng}",
        })
    return {"summary": body, "attachments": attachments}


def kea_normalize(item, detail):
    detail = detail or {}
    start, end = find_period(detail.get("summary", ""))
    return {
        "id": item["id"],
        "title": item["title"],
        "agency": "산업통상부",
        "org": "한국에너지공단",
        "field": "에너지",
        "subField": "",
        "summary": detail.get("summary", ""),
        "target": "",
        "applyStart": start,
        "applyEnd": end,
        "applyText": f"{start} ~ {end}" if start else "공고문 참조",
        "applyMethod": "",
        "contact": "",
        # 상세가 POST 전용이라 원문 링크는 게시판 목록으로 연결
        "url": f"{KEA}/front/board/List2.do?bbs_id=1",
        "attachments": detail.get("attachments", []),
        "hashtags": ["에너지", "한국에너지공단"],
        "created": item["created"],
        "views": 0,
        "source": "에너지공단",
    }


# ────────────────────────────── K-Startup ──────────────────────────────
KSTARTUP = "https://www.k-startup.go.kr"
KSTARTUP_LIST = KSTARTUP + "/web/contents/bizpbanc-ongoing.do"


def kst_list(page):
    html = http(f"{KSTARTUP_LIST}?page={page}")
    rows = []
    # 공고 한 건 = <li class="notice"> ... </li> 블록
    for seg in re.split(r'<li[^>]*class="[^"]*notice[^"]*"', html)[1:]:
        seg = seg.split("</li>")[0]
        sn = re.search(r"go_view\((\d+)\)", seg)
        t = re.search(r'<p class="tit">([^<]+)', seg)
        if not (sn and t):
            continue
        # 카테고리는 flag type0N (flag day = D-day, flag_agency = 공공/민간이라 제외)
        cat = re.search(r'<span class="flag type\d+">\s*([^<]+)</span>', seg)
        # 하단 정보줄: [0] 사업명, [1] 주관기관, 이후 등록/시작/마감일자
        spans = [clean(x) for x in re.findall(r'<span class="list">(.*?)</span>', seg, re.S)]
        info = [s for s in spans if not re.match(r"(등록일자|시작일자|마감일자|조회)", s)]
        pick = lambda label: (re.search(label + r"[^0-9]{0,10}(20\d{2}-\d{2}-\d{2})", seg) or [None, None])
        reg, st, ed = (pick("등록일자"), pick("시작일자"), pick("마감일자"))
        rows.append({
            "id": f"KSTARTUP_{sn.group(1)}",
            "sn": sn.group(1),
            "title": clean(t.group(1)),
            "category": clean(cat.group(1)) if cat else "",
            "biz": info[0] if len(info) > 0 else "",
            "org": info[1] if len(info) > 1 else "",
            "created": reg[1] if reg[1] else "",
            "start": st[1] if st[1] else None,
            "end": ed[1] if ed[1] else None,
        })
    # 같은 공고가 상단 배너와 목록에 중복 노출될 수 있어 ID 기준 정리
    uniq = {}
    for r in rows:
        uniq.setdefault(r["id"], r)
    return list(uniq.values())


def kst_normalize(item, detail=None):
    return {
        "id": item["id"],
        "title": item["title"],
        "agency": "중소벤처기업부",
        "org": item.get("org") or "창업진흥원",
        "field": "창업",
        "subField": item.get("category", ""),
        "summary": item.get("biz", ""),
        "target": "",
        "applyStart": item.get("start"),
        "applyEnd": item.get("end"),
        "applyText": (f"{item['start']} ~ {item['end']}"
                      if item.get("start") and item.get("end") else "공고문 참조"),
        "applyMethod": "K-Startup(www.k-startup.go.kr) 온라인 신청",
        "contact": "",
        "url": f"{KSTARTUP_LIST}?schM=view&pbancSn={item['sn']}",
        "attachments": [],
        "hashtags": ["창업", "K-Startup"] + ([item["category"]] if item.get("category") else []),
        "created": item.get("created", ""),
        "views": 0,
        "source": "K-Startup",
    }


# ────────────────────────────── 한국환경산업기술원 ──────────────────────────────
KEITI = "https://www.keiti.re.kr"


def keiti_list(page):
    html = http(f"{KEITI}/site/keiti/ex/board/List.do?cbIdx=277&pageIndex={page}")
    rows = []
    for m in re.finditer(r'href="(/site/keiti/ex/board/View\.do\?cbIdx=277&(?:amp;)?bcIdx=(\d+))"(.*?)</a>',
                         html, re.S):
        seg = m.group(3)
        subj = re.search(r'<span class="subject">(.*?)</span>', seg, re.S)
        date = re.search(r'<span class="date">\s*(20\d{2}-\d{2}-\d{2})', seg)
        text = re.search(r'<span class="text">(.*?)</span>', seg, re.S)
        if not subj:
            continue
        rows.append({
            "id": f"KEITI_{m.group(2)}",
            "bc_idx": m.group(2),
            "title": clean(subj.group(1)),
            "created": date.group(1) if date else "",
            "preview": clean(text.group(1)) if text else "",
        })
    return rows


def keiti_detail(item):
    html = http(f"{KEITI}/site/keiti/ex/board/View.do?cbIdx=277&bcIdx={item['bc_idx']}")
    body = ""
    m = re.search(r'class="(?:bbs_content|view_cont|cont)[^"]*"[^>]*>(.*?)'
                  r'(?:<div class="(?:file|btn|paging)|</section)', html, re.S)
    if m:
        body = strip_html(m.group(1))[:2000]
    attachments = []
    # 예: /common/board/Download.do?bcIdx=..&cbIdx=277&streFileNm=..&fileNo=1
    for href, label in re.findall(r'href="([^"]*(?:Download\.do|fileDown|/download)[^"]*)"[^>]*>(.*?)</a>',
                                  html, re.S | re.I):
        href = html_mod.unescape(href)
        url = href if href.startswith("http") else KEITI + href
        attachments.append({"name": clean(label) or "첨부파일", "url": url})
    return {"summary": body, "attachments": attachments}


def keiti_normalize(item, detail):
    detail = detail or {}
    summary = detail.get("summary") or item.get("preview", "")
    start, end = find_period(summary)
    return {
        "id": item["id"],
        "title": item["title"],
        "agency": "기후에너지환경부",
        "org": "한국환경산업기술원",
        "field": "환경",
        "subField": "",
        "summary": summary,
        "target": "",
        "applyStart": start,
        "applyEnd": end,
        "applyText": f"{start} ~ {end}" if start else "공고문 참조",
        "applyMethod": "",
        "contact": "",
        "url": f"{KEITI}/site/keiti/ex/board/View.do?cbIdx=277&bcIdx={item['bc_idx']}",
        "attachments": detail.get("attachments", []),
        "hashtags": ["환경", "탄소중립", "한국환경산업기술원"],
        "created": item.get("created", ""),
        "views": 0,
        "source": "KEITI",
    }


SITES = [
    {"key": "KEA", "name": "한국에너지공단",
     "list": kea_list, "detail": kea_detail, "normalize": kea_normalize},
    {"key": "KSTARTUP", "name": "K-Startup",
     "list": kst_list, "detail": None, "normalize": kst_normalize},
    {"key": "KEITI", "name": "한국환경산업기술원",
     "list": keiti_list, "detail": keiti_detail, "normalize": keiti_normalize},
]


def load_doc():
    if os.path.exists(DATA_PATH):
        with open(DATA_PATH, encoding="utf-8") as f:
            doc = json.load(f)
        if not doc.get("sample"):
            return doc
    return {"sample": False, "announcements": []}


def collect_site(site, existing, stats):
    rows = []
    for page in range(1, MAX_PAGES + 1):
        try:
            got = site["list"](page)
        except Exception as e:
            print(f"  [{site['name']}] {page}페이지 목록 실패: {type(e).__name__} {e}")
            break
        if not got:
            break
        rows.extend(got)
        time.sleep(DELAY)

    kept = [r for r in rows if is_support_notice(r["title"])]
    stats["scanned"] += len(rows)
    added = updated = detailed = 0
    for item in kept:
        is_new = item["id"] not in existing
        detail = None
        if is_new and site["detail"] and detailed < MAX_DETAILS:
            try:
                detail = site["detail"](item)
                detailed += 1
                time.sleep(DELAY)
            except Exception as e:
                print(f"  [{site['name']}] 상세 실패({item['id']}): {type(e).__name__}")
        a = site["normalize"](item, detail)
        if not is_new:
            old = existing[item["id"]]
            for k in ("summary", "attachments", "target", "contact"):
                if old.get(k):
                    a[k] = old[k]
            updated += 1
        else:
            added += 1
        existing[item["id"]] = a
    print(f"  [{site['name']}] 목록 {len(rows)}건 → 지원사업 {len(kept)}건 "
          f"(신규 {added}, 갱신 {updated}, 상세 {detailed})")
    stats["added"] += added


def main():
    doc = load_doc()
    existing = {a["id"]: a for a in doc.get("announcements", [])}
    stats = {"scanned": 0, "added": 0}

    for site in SITES:
        if ONLY and ONLY.upper() != site["key"]:
            continue
        try:
            collect_site(site, existing, stats)
        except Exception as e:
            # 한 사이트가 깨져도 나머지는 계속 수집
            print(f"  [{site['name']}] 수집 실패: {type(e).__name__} {e}")

    announcements = sorted(existing.values(), key=lambda a: a.get("created") or "", reverse=True)
    doc = {
        "sample": False,
        "updatedAt": datetime.now(KST).strftime("%Y-%m-%d %H:%M:%S"),
        "source": "기업마당 + KOSMO + IRIS + 에너지공단 + K-Startup + KEITI",
        "announcements": announcements,
    }
    os.makedirs(os.path.dirname(DATA_PATH), exist_ok=True)
    with open(DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    print(f"게시판 수집 완료: 신규 {stats['added']}건, 전체 {len(announcements)}건")


if __name__ == "__main__":
    sys.exit(main())
