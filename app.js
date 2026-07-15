/* PjFinder — 정부지원과제 파인더 */
(function () {
  "use strict";

  let DATA = { announcements: [] };
  const TODAY = new Date();
  TODAY.setHours(0, 0, 0, 0);

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // ---------- 유틸 ----------
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function parseDate(s) {
    if (!s) return null;
    const d = new Date(s + "T00:00:00");
    return isNaN(d) ? null : d;
  }

  function fmtDate(s) {
    return s ? s.replace(/-/g, ".") : "";
  }

  // 접수 상태: open(접수중) / upcoming(예정) / closed(마감) / always(상시)
  function statusOf(a) {
    const start = parseDate(a.applyStart);
    const end = parseDate(a.applyEnd);
    if (!start && !end) {
      return /상시|소진|수시|예산/.test(a.applyText || "") || !a.applyText ? "always" : "always";
    }
    if (start && TODAY < start) return "upcoming";
    if (end && TODAY > end) return "closed";
    return "open";
  }

  const STATUS_LABEL = { open: "접수중", upcoming: "접수예정", closed: "마감", always: "상시" };

  function ddayOf(a) {
    const end = parseDate(a.applyEnd);
    if (!end || statusOf(a) !== "open") return null;
    return Math.round((end - TODAY) / 86400000);
  }

  function statusBadge(a) {
    const st = statusOf(a);
    let html = `<span class="badge ${st}">${STATUS_LABEL[st]}</span>`;
    const d = ddayOf(a);
    if (d !== null) {
      html += ` <span class="badge dday ${d > 7 ? "far" : ""}">D-${d === 0 ? "DAY" : d}</span>`;
    }
    return html;
  }

  // ---------- 탭 ----------
  $$(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".tab").forEach((b) => b.classList.toggle("active", b === btn));
      $$(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + btn.dataset.tab));
    });
  });

  // ---------- 공고 목록 ----------
  let currentStatus = "";
  let currentField = "";
  let currentSource = "";

  function srcOf(a) {
    return a.source || "기업마당";
  }

  function buildSourceFilters() {
    const sources = [...new Set(DATA.announcements.map(srcOf))].sort();
    const row = $("#sourceFilters");
    if (sources.length < 2) { row.hidden = true; return; }
    row.hidden = false;
    row.innerHTML = '<span class="filter-label">출처</span>' +
      '<button class="chip active" data-source="">전체</button>' +
      sources.map((s) => `<button class="chip" data-source="${esc(s)}">${esc(s)}</button>`).join("");
    row.querySelectorAll(".chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        currentSource = chip.dataset.source;
        row.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === chip));
        renderList();
      });
    });
  }

  function buildFieldFilters() {
    const fields = [...new Set(DATA.announcements.map((a) => a.field).filter(Boolean))].sort();
    const row = $("#fieldFilters");
    row.innerHTML = '<span class="filter-label">분야</span>' +
      '<button class="chip active" data-field="">전체</button>' +
      fields.map((f) => `<button class="chip" data-field="${esc(f)}">${esc(f)}</button>`).join("");
    row.querySelectorAll(".chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        currentField = chip.dataset.field;
        row.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === chip));
        renderList();
      });
    });
  }

  $("#statusFilters").querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      currentStatus = chip.dataset.status;
      $("#statusFilters").querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === chip));
      renderList();
    });
  });

  $("#searchInput").addEventListener("input", renderList);
  $("#sortSelect").addEventListener("change", renderList);

  function matchesQuery(a, q) {
    if (!q) return true;
    const hay = [a.title, a.agency, a.org, a.field, a.subField, a.summary, a.target,
      (a.hashtags || []).join(" ")].join(" ").toLowerCase();
    return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
  }

  function renderList() {
    const q = $("#searchInput").value.trim();
    const sort = $("#sortSelect").value;
    let items = DATA.announcements.filter((a) => matchesQuery(a, q));
    if (currentStatus) items = items.filter((a) => statusOf(a) === currentStatus);
    if (currentField) items = items.filter((a) => a.field === currentField);
    if (currentSource) items = items.filter((a) => srcOf(a) === currentSource);

    if (sort === "latest") {
      items.sort((x, y) => (y.created || "").localeCompare(x.created || ""));
    } else if (sort === "deadline") {
      const key = (a) => {
        const d = ddayOf(a);
        return d === null ? Infinity : d;
      };
      items.sort((x, y) => key(x) - key(y));
    } else if (sort === "views") {
      items.sort((x, y) => (Number(y.views) || 0) - (Number(x.views) || 0));
    }

    $("#resultCount").textContent = `총 ${items.length}건`;
    const list = $("#cardList");
    if (!items.length) {
      list.innerHTML = '<p class="empty">조건에 맞는 공고가 없습니다.</p>';
      return;
    }
    list.innerHTML = items.map((a) => {
      const period = a.applyStart
        ? `${fmtDate(a.applyStart)} ~ ${fmtDate(a.applyEnd)}`
        : (a.applyText || "기간 정보 없음");
      return `<article class="card" data-id="${esc(a.id)}">
        <div class="card-top">
          ${statusBadge(a)}
          ${a.field ? `<span class="badge field">${esc(a.field)}</span>` : ""}
          <span class="badge source">${esc(srcOf(a))}</span>
        </div>
        <h3>${esc(a.title)}</h3>
        <div class="card-meta">
          <span>🏛 ${esc(a.agency || "-")}</span>
          ${a.org ? `<span>🏢 ${esc(a.org)}</span>` : ""}
          <span>🗓 ${esc(period)}</span>
          ${a.attachments && a.attachments.length ? `<span>📎 첨부 ${a.attachments.length}개</span>` : ""}
        </div>
        ${a.hashtags && a.hashtags.length
          ? `<div class="card-tags">${a.hashtags.map((t) => `<span class="tag">#${esc(t)}</span>`).join("")}</div>` : ""}
      </article>`;
    }).join("");
    list.querySelectorAll(".card").forEach((card) => {
      card.addEventListener("click", () => openDetail(card.dataset.id));
    });
  }

  // ---------- 상세 요약 ----------
  // 공고 본문 텍스트에서 항목별 핵심 문장을 추출 (없으면 null)
  // '□ 신청자격 : …' 같은 라벨형 줄을 우선하고, 다른 단어에 포함된 키워드(예: 신규지원'대상')는 제외
  function extractSection(text, keywords, maxLen) {
    if (!text) return null;
    maxLen = maxLen || 240;
    const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const kws = keywords.map((k) => k.replace(/\s/g, ""));
    let best = null;
    for (let i = 0; i < lines.length; i++) {
      // 글머리표·번호 제거 후 공백을 없애 위치 비교
      const stripped = lines[i]
        .replace(/^[\s□■◇◆○●◦•▶►〈<\[(【*-]+/, "")
        .replace(/^제?\d+[.)]\s*|^[가-힣][.)]\s*/, "")
        .replace(/\s+/g, "");
      for (const kw of kws) {
        const pos = stripped.indexOf(kw);
        if (pos === -1) continue;
        if (pos > 0 && /[가-힣]/.test(stripped[pos - 1])) continue; // 합성어 내부 매칭 제외
        let score = pos === 0 ? 100 : pos <= 4 ? 60 : 20;
        const after = stripped.slice(pos + kw.length, pos + kw.length + 2);
        if (after.startsWith(":") || after.startsWith("：")) score += 30; // '키워드 :' 라벨형
        if (!best || score > best.score) best = { i, score };
      }
    }
    if (!best) return null;
    let snippet = lines[best.i];
    let j = best.i;
    // 라벨만 있는 짧은 줄이면 다음 줄들을 이어붙임 (최대 3줄)
    while ((snippet.length < 30 || /[:：]\s*$/.test(snippet)) && j + 1 < lines.length && j - best.i < 3) {
      j += 1;
      snippet += " " + lines[j];
    }
    return snippet.length > maxLen ? snippet.slice(0, maxLen) + "…" : snippet;
  }

  function extractMoney(text) {
    const bykw = extractSection(text, ["지원금액", "지원규모", "지원한도", "정부지원금", "총사업비", "총 사업비", "정부출연금", "지원내용"]);
    // 키워드 줄에 실제 숫자가 있으면 채택
    if (bykw && /\d/.test(bykw)) return bykw;
    if (!text) return null;
    const lines = text.split(/\n+/).map((l) => l.trim());
    const hits = lines.filter((l) =>
      /(\d[\d,.]*\s*(억|백만|천만|만)\s*원|\d[\d,.]*\s*억)/.test(l) && /지원|사업비|출연|보조|한도|이내/.test(l)).slice(0, 2);
    if (hits.length) return hits.join(" / ").slice(0, 240);
    return bykw || null;
  }

  const REF = '<span class="ref-note">공고 원문·첨부파일에서 확인</span>';

  // 텍스트에서 8개 항목을 추출해 [라벨, HTML값] 배열 생성 (상세보기 + PDF 분석 공용)
  function buildSummaryRows(text, extras) {
    extras = extras || {};
    const val = (v) => (v ? esc(v) : REF); // 값이 없으면 '원문 참조' 안내
    const DATE = "\\d{4}\\s*[.\\-\\/년]\\s*\\d{1,2}\\s*[.\\-\\/월]\\s*\\d{1,2}[일.]?\\s*(?:\\([^)]{1,4}\\))?\\s*(?:\\d{1,2}\\s*:\\s*\\d{2})?";
    const overview = (extras.overview
      || extractSection(text, ["사업개요", "사업 개요", "공고개요", "사업목적", "지원목적"], 600)
      || (text || "").split(/\n+/).slice(0, 4).join(" ").slice(0, 250) // 폴백: 문서 서두(제목·목적)
      || "").trim();
    const period = extras.period
      || extractSection(text, ["접수기간", "신청기간", "모집기간", "공모기간", "접수 기간", "신청 기간"], 200)
      || (text.match(new RegExp(DATE + "\\s*~\\s*" + DATE)) || [null])[0];
    return [
      ["사업개요", val(overview && (overview.length > 600 ? overview.slice(0, 600) + "…" : overview))],
      ["모집기간", val(period)],
      ["금액", val(extractMoney(text))],
      ["참가조건", val(extras.target || extractSection(text, ["지원대상", "신청자격", "참여자격", "지원자격", "참가자격", "공모대상", "신청 자격", "지원 대상"]))],
      ["제출서류", val(extractSection(text, ["제출서류", "신청서류", "제출 서류", "구비서류", "제출서식", "제출 서식"]))],
      ["평가방식", val(extractSection(text, ["평가방식", "평가방법", "평가절차", "선정방법", "선정절차", "심사방법", "평가기준", "평가 및 선정", "선정 절차"]))],
      ["사업기간", val(extractSection(text, ["사업기간", "수행기간", "연구개발기간", "협약기간", "개발기간", "지원기간", "사업 기간"]))],
      ["문의처", val(extras.contact || extractSection(text, ["문의처", "문의", "연락처", "담당자"]))],
    ];
  }

  function buildDetailHtml(a) {
    const period = a.applyStart
      ? `${fmtDate(a.applyStart)} ~ ${fmtDate(a.applyEnd)}`
      : (a.applyText || "-");
    const d = ddayOf(a);
    const periodTxt = period + (d !== null ? ` (D-${d === 0 ? "DAY" : d})` : "");
    const text = [a.summary, a.applyMethod].filter(Boolean).join("\n");
    const overview = (a.summary || "").trim();
    const rows = buildSummaryRows(text, {
      overview: overview,
      period: periodTxt,
      target: a.target,
      contact: a.contact,
    });
    const srcName = srcOf(a);
    return `
      <div class="detail-badges">${statusBadge(a)}
        ${a.field ? `<span class="badge field">${esc(a.field)}</span>` : ""}
        <span class="badge source">${esc(srcName)}</span></div>
      <h2 class="detail-title">${esc(a.title)}</h2>
      <p class="detail-meta">🏛 ${esc(a.agency || "-")}${a.org ? ` · 🏢 ${esc(a.org)}` : ""}${a.subField ? ` · ${esc(a.subField)}` : ""}</p>
      <dl class="summary-grid">
        ${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}
      </dl>
      ${a.hashtags && a.hashtags.length
        ? `<div class="card-tags" style="margin-top:14px">${a.hashtags.map((t) => `<span class="tag">#${esc(t)}</span>`).join("")}</div>` : ""}
      <div class="detail-section">
        <h4>📎 첨부파일 ${a.attachments && a.attachments.length ? `(${a.attachments.length})` : ""}</h4>
        ${a.attachments && a.attachments.length
          ? `<ul class="attach-list">${a.attachments.map((f) =>
              `<li><a href="${esc(f.url)}" target="_blank" rel="noopener" ${f.url === "#sample" ? 'onclick="alert(\'샘플 데이터입니다. 실제 데이터 연동 후 다운로드할 수 있습니다.\');return false;"' : "download"}>⬇️ ${esc(f.name)}</a></li>`).join("")}</ul>`
          : '<p style="color:var(--muted);font-size:.9rem">첨부파일이 없습니다. 원문 페이지를 확인해주세요.</p>'}
      </div>
      <div class="detail-actions">
        ${a.url ? `<a class="btn-primary" href="${esc(a.url)}" target="_blank" rel="noopener">${srcName === "KOSMO" ? "KOSMO에서 원문 보기" : srcName === "IRIS" ? "IRIS에서 원문 보기" : "기업마당에서 원문 보기"} ↗</a>` : ""}
      </div>`;
  }

  function openDetail(id) {
    const a = DATA.announcements.find((x) => x.id === id);
    if (!a) return;
    $("#detailContent").innerHTML = buildDetailHtml(a);
    $("#detailModal").hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeDetail() {
    $("#detailModal").hidden = true;
    document.body.style.overflow = "";
  }
  $(".modal-close").addEventListener("click", closeDetail);
  $(".modal-backdrop").addEventListener("click", closeDetail);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDetail(); });

  // ---------- 첨부파일 검색 ----------
  $("#fileSearchInput").addEventListener("input", renderFiles);

  function renderFiles() {
    const q = $("#fileSearchInput").value.trim().toLowerCase();
    const rows = [];
    DATA.announcements.forEach((a) => {
      (a.attachments || []).forEach((f) => {
        const hay = (f.name + " " + a.title).toLowerCase();
        if (!q || q.split(/\s+/).every((w) => hay.includes(w))) {
          rows.push({ file: f, parent: a });
        }
      });
    });
    $("#fileResultCount").textContent = `첨부파일 ${rows.length}개`;
    const list = $("#fileList");
    if (!rows.length) {
      list.innerHTML = '<p class="empty">검색된 첨부파일이 없습니다.</p>';
      return;
    }
    const iconOf = (name) => {
      if (/\.pdf$/i.test(name)) return "📕";
      if (/\.hwpx?$/i.test(name)) return "📘";
      if (/\.(doc|docx)$/i.test(name)) return "📄";
      if (/\.(xls|xlsx)$/i.test(name)) return "📗";
      if (/\.(zip|7z|rar)$/i.test(name)) return "🗜️";
      return "📎";
    };
    list.innerHTML = rows.map((r) => `
      <div class="file-item">
        <span class="file-icon">${iconOf(r.file.name)}</span>
        <div class="file-info">
          <div class="file-name">${esc(r.file.name)}</div>
          <div class="file-parent" data-id="${esc(r.parent.id)}">📋 ${esc(r.parent.title)}</div>
        </div>
        <a class="file-dl" href="${esc(r.file.url)}" target="_blank" rel="noopener"
          ${r.file.url === "#sample" ? 'onclick="alert(\'샘플 데이터입니다. 실제 데이터 연동 후 다운로드할 수 있습니다.\');return false;"' : "download"}>다운로드</a>
      </div>`).join("");
    list.querySelectorAll(".file-parent").forEach((el) => {
      el.addEventListener("click", () => openDetail(el.dataset.id));
    });
  }

  // ---------- 공고 시기 예측 ----------
  // 사업명 정규화: 연도·차수·꺾쇠 표기 제거 → 같은 사업끼리 그룹핑
  function normalizeTitle(title) {
    return title
      .replace(/\[([^\]]*)\]/g, " $1 ")  // 괄호만 제거하고 내용(지역·기업명)은 그룹 구분에 유지
      .replace(/\(\s*(재공고|재|연장|변경|수정|수시)\s*\)/g, " ")
      .replace(/재공고|추가모집/g, " ")
      .replace(/20\d{2}(\s*년도?)?|(?:^|\s)\d{2}년/g, " ")
      .replace(/제?\s*\d+\s*차/g, " ")
      .replace(/모집\s*공고|시행계획\s*공고|참여기업|창업\s*기업|공고문?|안내/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function announceDateOf(a) {
    return parseDate(a.created) || parseDate(a.applyStart);
  }

  function buildPredictions(includeSingle) {
    const groups = new Map();
    DATA.announcements.forEach((a) => {
      const d = announceDateOf(a);
      if (!d) return;
      const key = normalizeTitle(a.title);
      if (!key) return;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ a, d });
    });

    const preds = [];
    groups.forEach((entries, key) => {
      // 같은 해 중복(차수)은 가장 이른 공고만 사용해 연간 주기를 계산
      const byYear = new Map();
      entries.forEach((e) => {
        const y = e.d.getFullYear();
        if (!byYear.has(y) || e.d < byYear.get(y).d) byYear.set(y, e);
      });
      const yearly = [...byYear.values()].sort((x, y) => x.d - y.d);
      if (yearly.length < (includeSingle ? 1 : 2)) return;

      // 평균 공고 시점(연중 일자)
      const avgDoy = Math.round(yearly.reduce((s, e) => {
        const start = new Date(e.d.getFullYear(), 0, 1);
        return s + (e.d - start) / 86400000;
      }, 0) / yearly.length);

      const lastYear = yearly[yearly.length - 1].d.getFullYear();
      const yearsSinceLast = TODAY.getFullYear() - lastYear;
      const active = yearsSinceLast <= 1; // 2년 이상 공고가 없으면 중단된 사업으로 추정
      // 예측일은 항상 오늘 기준 미래(최근 45일 이내 과거까지 허용)로 계산
      const graceMs = 45 * 86400000;
      let predYear = lastYear + 1;
      let predDate = new Date(predYear, 0, 1 + avgDoy);
      while (TODAY - predDate > graceMs) {
        predYear += 1;
        predDate = new Date(predYear, 0, 1 + avgDoy);
      }

      preds.push({
        name: key,
        entries: entries.sort((x, y) => y.d - x.d),
        yearlyCount: yearly.length,
        predDate,
        active,
        lastYear,
        latest: yearly[yearly.length - 1].a,
      });
    });

    preds.sort((x, y) =>
      x.active !== y.active ? (x.active ? -1 : 1) : x.predDate - y.predDate);
    return preds;
  }

  function fmtPredict(d) {
    const day = d.getDate();
    const part = day <= 10 ? "초" : day <= 20 ? "중순" : "말";
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${part}`;
  }

  function renderPredict() {
    const includeSingle = $("#includeSingle").checked;
    const q = $("#predictSearchInput").value.trim().toLowerCase();
    let preds = buildPredictions(includeSingle);
    if (q) {
      preds = preds.filter((p) =>
        q.split(/\s+/).every((w) => p.name.toLowerCase().includes(w)));
    }
    const list = $("#predictList");
    if (!preds.length) {
      list.innerHTML = '<p class="empty">예측할 수 있는 사업이 아직 없습니다.<br>데이터가 누적되면 같은 사업의 과거 공고일을 바탕으로 예측을 제공합니다.</p>';
      return;
    }
    const MONTHS = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];
    list.innerHTML = preds.map((p) => {
      const pastMonths = new Set(p.entries.map((e) => e.d.getMonth()));
      const predMonth = p.predDate.getMonth();
      const strip = MONTHS.map((m, i) => {
        const cls = i === predMonth ? "predicted" : pastMonths.has(i) ? "past" : "";
        return `<div class="month-cell ${cls}">${m}</div>`;
      }).join("");
      const conf = !p.active ? ["low", `마지막 공고 ${p.lastYear}년 · 중단 추정`]
        : p.yearlyCount >= 3 ? ["high", `이력 ${p.yearlyCount}년 · 신뢰도 높음`]
        : p.yearlyCount === 2 ? ["high", "이력 2년 · 참고용"]
        : ["low", "이력 1건 · 정확도 낮음"];
      const when = p.active
        ? `다음 공고 예상 시기: <strong>${fmtPredict(p.predDate)}</strong>`
        : `${p.lastYear}년 이후 공고가 없어 재공고 여부가 불확실합니다. (재개 시 ${p.predDate.getMonth() + 1}월경 예상)`;
      return `<div class="predict-card ${p.active ? "" : "inactive"}">
        <div class="card-top">
          <span class="confidence ${conf[0]}">${conf[1]}</span>
        </div>
        <h3>${esc(p.name)}</h3>
        <p class="predict-when">${when}</p>
        <div class="month-strip">${strip}</div>
        <div class="predict-history">
          과거 공고일:
          <ul>${p.entries.map((e) =>
            `<li>${fmtDate(e.a.created || e.a.applyStart)} — ${esc(e.a.title)}</li>`).join("")}</ul>
        </div>
      </div>`;
    }).join("");
  }

  $("#includeSingle").addEventListener("change", renderPredict);
  $("#predictSearchInput").addEventListener("input", renderPredict);

  // ---------- 공고문 분석 (PDF) ----------
  // 공고문 구조를 인식해 항목 제목부터 다음 섹션 전까지 통째로 추출.
  // 제목 3단계: Ⅰ.(3) > □(2) > 1.(1) — 시작 제목보다 같거나 큰 단계를 만나면 중단
  const PAGE_NUM_LINE = /^[-–ㅡ\s]*\d+\s*[-–ㅡ\s]*$/;

  function headLevel(line) {
    if (/^\s*(?:[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ]|[IVX]{1,4}\s*[.)]|【)/.test(line)) return 3;
    if (/^\s*[□■◇◆]/.test(line)) return 2;
    if (/^\s*\d{1,2}\s*[.)]\s/.test(line)) return 1;
    return 0;
  }

  function extractBlock(text, keywords, maxChars) {
    if (!text) return null;
    maxChars = maxChars || 1000;
    const lines = text.split(/\n+/).map((l) => l.trim()).filter((l) => l && !PAGE_NUM_LINE.test(l));
    const kws = keywords.map((k) => k.replace(/\s/g, ""));
    let best = null;
    for (let i = 0; i < lines.length; i++) {
      const stripped = lines[i]
        .replace(/^[\s□■◇◆○●◦•▶►〈<\[(【*-]+/, "")
        .replace(/^제?\d+[.)]\s*|^[가-힣][.)]\s*/, "")
        .replace(/\s+/g, "");
      for (const kw of kws) {
        const pos = stripped.indexOf(kw);
        if (pos === -1) continue;
        if (pos > 0 && /[가-힣]/.test(stripped[pos - 1])) {
          // 공백 제거로 합성어처럼 보이는 경우, 원본 줄에서 앞 글자가 공백/기호면 정상 매칭으로 인정
          const po = lines[i].indexOf(kw);
          if (po === -1 || (po > 0 && /[가-힣]/.test(lines[i][po - 1]))) continue;
        }
        let score = pos === 0 ? 100 : pos <= 4 ? 60 : 20;
        if (headLevel(lines[i]) > 0) score += 40; // 제목형 줄 가중치
        const after = stripped.slice(pos + kw.length, pos + kw.length + 2);
        if (after.startsWith(":") || after.startsWith("：")) score += 20;
        if (lines[i].replace(/\s/g, "").length <= kw.length + 14) score += 20; // 짧은 제목 줄
        if (!best || score > best.score) best = { i, score };
      }
    }
    if (!best) return null;
    const startLevel = headLevel(lines[best.i]);
    const out = [lines[best.i]];
    let chars = lines[best.i].length;
    for (let j = best.i + 1; j < lines.length && chars < maxChars && out.length < 60; j++) {
      const lv = headLevel(lines[j]);
      if (lv > 0 && lv >= startLevel) break; // 같은 단계 이상의 다음 섹션 제목에서 중단
      out.push(lines[j]);
      chars += lines[j].length;
    }
    const block = out.join("\n");
    return block.length > maxChars ? block.slice(0, maxChars) + "\n…(생략 — 아래 전체 텍스트 참조)" : block;
  }

  // PDF 전용: 섹션 블록 단위의 상세 요약
  function buildPdfSummaryRows(text) {
    const val = (v) => (v ? esc(v) : REF);
    const DATE = "\\d{4}\\s*[.\\-\\/년]\\s*\\d{1,2}\\s*[.\\-\\/월]\\s*\\d{1,2}[일.]?\\s*(?:\\([^)]{1,4}\\))?\\s*(?:\\d{1,2}\\s*:\\s*\\d{2})?";
    const overview = extractBlock(text, ["사업개요", "사업 개요", "공고개요", "사업목적", "지원목적", "지원개요", "공고 개요"], 900)
      || text.split(/\n+/).filter((l) => l.trim() && !PAGE_NUM_LINE.test(l)).slice(0, 8).join("\n").slice(0, 500);
    const period = extractBlock(text, ["접수기간", "신청기간", "모집기간", "공모기간", "접수 기간", "신청기한", "접수기한", "신청서 제출기간", "추진일정", "접수 및 신청"], 500)
      || (text.match(new RegExp(DATE + "\\s*~\\s*" + DATE)) || [null])[0];
    const money = extractBlock(text, ["지원금액", "지원규모", "지원내용", "정부지원금", "총사업비", "정부출연금", "지원한도", "연구개발비"], 900)
      || extractMoney(text);
    return [
      ["사업개요", val(overview)],
      ["모집기간", val(period)],
      ["금액", val(money)],
      ["참가조건", val(extractBlock(text, ["신청자격", "지원대상", "참여자격", "지원자격", "공모대상", "신청요건", "참여요건", "지원 대상"], 1000))],
      ["제출서류", val(extractBlock(text, ["제출서류", "신청서류", "구비서류", "제출서식", "제출 서류", "제출방법", "신청방법", "접수방법", "신청 및 접수"], 1000))],
      ["평가방식", val(extractBlock(text, ["평가방식", "평가방법", "평가절차", "선정방법", "선정절차", "심사방법", "평가기준", "평가 및 선정", "선정 절차", "평가내용", "평가일정", "선정평가"], 1000))],
      ["사업기간", val(extractBlock(text, ["사업기간", "수행기간", "연구개발기간", "협약기간", "지원기간", "사업 기간"], 400))],
      ["문의처", val(extractBlock(text, ["문의처", "문의 및", "문의", "담당부서", "연락처"], 600))],
    ];
  }

  function ensurePdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "vendor/pdf.min.js";
      s.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";
        resolve(window.pdfjsLib);
      };
      s.onerror = () => reject(new Error("PDF 분석 라이브러리를 불러오지 못했습니다."));
      document.head.appendChild(s);
    });
  }

  // PDF 텍스트를 y좌표 기준으로 줄 단위 복원
  async function extractPdfText(file) {
    const lib = await ensurePdfJs();
    const buf = await file.arrayBuffer();
    const pdf = await lib.getDocument({ data: buf }).promise;
    const pages = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      const lines = [];
      tc.items.forEach((it) => {
        if (!it.str || !it.str.trim()) return;
        const y = it.transform[5];
        let line = lines.find((l) => Math.abs(l.y - y) <= 3);
        if (!line) {
          line = { y, items: [] };
          lines.push(line);
        }
        line.items.push({ x: it.transform[4], str: it.str });
      });
      const text = lines
        .sort((a, b) => b.y - a.y)
        .map((l) => l.items.sort((a, b) => a.x - b.x).map((i) => i.str).join(" ").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .join("\n");
      pages.push(text);
      $("#pdfStatus").textContent = `분석 중… (${p}/${pdf.numPages} 페이지)`;
    }
    return pages.join("\n");
  }

  async function analyzePdf(file) {
    const status = $("#pdfStatus");
    const result = $("#pdfResult");
    if (!file || !/\.pdf$/i.test(file.name)) {
      status.textContent = "PDF 파일만 분석할 수 있습니다.";
      return;
    }
    status.textContent = "PDF를 읽는 중…";
    result.innerHTML = "";
    try {
      const text = await extractPdfText(file);
      if (!text || text.replace(/\s/g, "").length < 50) {
        status.textContent = "";
        result.innerHTML = '<p class="empty">이 PDF에서 텍스트를 추출할 수 없습니다.<br>스캔(이미지) 방식의 PDF는 분석할 수 없어요.</p>';
        return;
      }
      const rows = buildPdfSummaryRows(text);
      status.textContent = `분석 완료 — ${file.name} (텍스트 ${text.length.toLocaleString()}자)`;
      result.innerHTML = `
        <div class="pdf-card">
          <h2 class="detail-title">📄 ${esc(file.name)}</h2>
          <dl class="summary-grid">
            ${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}
          </dl>
          <details class="pdf-fulltext">
            <summary>추출된 전체 텍스트 보기</summary>
            <pre>${esc(text.slice(0, 20000))}${text.length > 20000 ? "\n…(이하 생략)" : ""}</pre>
          </details>
          <p class="pdf-note">※ 자동 추출 결과이므로 반드시 원문과 대조해서 확인하세요. 항목이 "원문 참조"로 나오면 공고문 내 표·이미지 형태라 추출하지 못한 경우입니다.</p>
        </div>`;
    } catch (err) {
      status.textContent = "";
      result.innerHTML = `<p class="empty">분석 실패: ${esc(err.message)}</p>`;
    }
  }

  const drop = $("#pdfDrop");
  drop.addEventListener("click", () => $("#pdfInput").click());
  $("#pdfInput").addEventListener("change", (e) => {
    if (e.target.files[0]) analyzePdf(e.target.files[0]);
  });
  ["dragover", "dragenter"].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("dragover"); }));
  ["dragleave", "drop"].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("dragover"); }));
  drop.addEventListener("drop", (e) => {
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) analyzePdf(f);
  });

  // ---------- 초기화 ----------
  fetch("data/announcements.json")
    .then((r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then((doc) => {
      DATA = doc;
      $("#sampleBanner").hidden = !doc.sample;
      $("#updatedAt").textContent =
        `데이터 기준: ${doc.updatedAt || "-"} · 총 ${doc.announcements.length}건 · 출처: ${doc.source || "기업마당"}`;
      buildFieldFilters();
      buildSourceFilters();
      renderList();
      renderFiles();
      renderPredict();
    })
    .catch((err) => {
      $("#cardList").innerHTML =
        `<p class="empty">데이터를 불러오지 못했습니다. (${esc(err.message)})<br>data/announcements.json 파일을 확인해주세요.</p>`;
    });
})();
