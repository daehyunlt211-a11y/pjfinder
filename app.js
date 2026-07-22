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
        ${a.url ? `<a class="btn-primary" href="${esc(a.url)}" target="_blank" rel="noopener">${esc(srcName)}에서 원문 보기 ↗</a>` : ""}
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

      const lastYear = yearly[yearly.length - 1].d.getFullYear();
      // 2년 이상 공고가 없으면 중단된 사업으로 보고 제외 (미래 예측 대상 아님)
      if (TODAY.getFullYear() - lastYear >= 2) return;

      // 평균 공고 시점(연중 일자)
      const avgDoy = Math.round(yearly.reduce((s, e) => {
        const start = new Date(e.d.getFullYear(), 0, 1);
        return s + (e.d - start) / 86400000;
      }, 0) / yearly.length);

      // 예측일은 항상 오늘 이후(미래)로 계산
      let predYear = TODAY.getFullYear();
      let predDate = new Date(predYear, 0, 1 + avgDoy);
      predDate.setHours(0, 0, 0, 0);
      while (predDate < TODAY) {
        predYear += 1;
        predDate = new Date(predYear, 0, 1 + avgDoy);
        predDate.setHours(0, 0, 0, 0);
      }

      preds.push({
        name: key,
        entries: entries.sort((x, y) => y.d - x.d),
        yearlyCount: yearly.length,
        predDate,
        lastYear,
        latest: yearly[yearly.length - 1].a,
      });
    });

    preds.sort((x, y) => x.predDate - y.predDate);
    return preds;
  }

  function fmtPredict(d) {
    const day = d.getDate();
    const part = day <= 10 ? "초" : day <= 20 ? "중순" : "말";
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${part}`;
  }

  // 캘린더 상태
  let calYear, calMonth;      // 현재 표시 중인 연/월
  let calPreds = [];          // 필터가 적용된 미래 예측 목록
  let selectedDateKey = null; // 선택된 날짜(YYYY-MM-DD)

  function dateKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function predsByDate() {
    const map = new Map();
    calPreds.forEach((p) => {
      const k = dateKey(p.predDate);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(p);
    });
    return map;
  }

  function confOf(p) {
    return p.yearlyCount >= 3 ? ["high", `이력 ${p.yearlyCount}년 · 신뢰도 높음`]
      : p.yearlyCount === 2 ? ["high", "이력 2년 · 참고용"]
      : ["low", "이력 1건 · 정확도 낮음"];
  }

  function renderPredict() {
    const includeSingle = $("#includeSingle").checked;
    const q = $("#predictSearchInput").value.trim().toLowerCase();
    calPreds = buildPredictions(includeSingle);
    if (q) {
      calPreds = calPreds.filter((p) =>
        q.split(/\s+/).every((w) => p.name.toLowerCase().includes(w)));
    }

    if (!calPreds.length) {
      $("#calTitle").textContent = "";
      $("#calGrid").innerHTML = "";
      $("#calJump").hidden = true;
      $("#predictList").innerHTML =
        '<p class="empty">앞으로 예상되는 공고가 없습니다.<br>데이터가 누적되면 같은 사업의 과거 공고일을 바탕으로 예측을 제공합니다.</p>';
      return;
    }

    // 필터가 바뀌면 가장 이른 예측 달로 이동하고 그 날짜를 자동 선택
    const earliest = calPreds.reduce((m, p) => (p.predDate < m ? p.predDate : m), calPreds[0].predDate);
    calYear = earliest.getFullYear();
    calMonth = earliest.getMonth();
    selectedDateKey = dateKey(earliest);
    renderCalendar();
    renderPredictList(predsByDate().get(selectedDateKey), selectedDateKey);
  }

  const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

  function renderCalendar() {
    const byDate = predsByDate();
    $("#calTitle").textContent = `${calYear}년 ${calMonth + 1}월`;

    const monthCount = calPreds.filter((p) =>
      p.predDate.getFullYear() === calYear && p.predDate.getMonth() === calMonth).length;

    const startDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    let html = WEEK.map((w, i) =>
      `<div class="cal-dow ${i === 0 ? "sun" : i === 6 ? "sat" : ""}">${w}</div>`).join("");
    for (let i = 0; i < startDay; i++) html += '<div class="cal-cell empty"></div>';
    const todayKey = dateKey(TODAY);
    for (let d = 1; d <= daysInMonth; d++) {
      const k = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const items = byDate.get(k) || [];
      const dow = new Date(calYear, calMonth, d).getDay();
      const cls = ["cal-cell"];
      if (items.length) cls.push("has-pred");
      if (k === todayKey) cls.push("today");
      if (k === selectedDateKey) cls.push("selected");
      html += `<div class="${cls.join(" ")}" data-date="${k}">
        <span class="cal-day ${dow === 0 ? "sun" : dow === 6 ? "sat" : ""}">${d}</span>
        ${items.length ? `<span class="cal-badge">${items.length}</span>` : ""}
      </div>`;
    }
    $("#calGrid").innerHTML = html;
    $("#calGrid").querySelectorAll(".cal-cell.has-pred").forEach((cell) => {
      cell.addEventListener("click", () => {
        selectedDateKey = cell.dataset.date;
        renderCalendar();
        renderPredictList(byDate.get(selectedDateKey), selectedDateKey);
      });
    });

    // "다음 예측 달로" 버튼: 현재 달에 예측이 없고, 이후에 예측이 있으면 표시
    const nextPred = calPreds
      .map((p) => p.predDate)
      .filter((d) => d.getFullYear() > calYear || (d.getFullYear() === calYear && d.getMonth() > calMonth))
      .sort((a, b) => a - b)[0];
    const jump = $("#calJump");
    if (monthCount === 0 && nextPred) {
      jump.hidden = false;
      jump.textContent = `다음 예측: ${nextPred.getFullYear()}년 ${nextPred.getMonth() + 1}월 ▶▶`;
      jump.onclick = () => {
        calYear = nextPred.getFullYear();
        calMonth = nextPred.getMonth();
        renderCalendar();
      };
    } else {
      jump.hidden = true;
    }
  }

  function renderPredictList(items, key) {
    const list = $("#predictList");
    if (!items || !items.length) {
      list.innerHTML = '<p class="predict-hint">📅 달력에서 파란 점(숫자)이 있는 날짜를 클릭하면 그날 예상되는 공고가 여기에 표시됩니다.</p>';
      return;
    }
    const [y, m, d] = key.split("-").map(Number);
    list.innerHTML =
      `<h3 class="predict-list-title">📌 ${y}년 ${m}월 ${d}일 예상 공고 ${items.length}건</h3>` +
      items.map((p) => {
        const conf = confOf(p);
        return `<div class="predict-card">
          <div class="card-top">
            <span class="confidence ${conf[0]}">${conf[1]}</span>
          </div>
          <h3>${esc(p.name)}</h3>
          <p class="predict-when">예상 시기: <strong>${fmtPredict(p.predDate)}</strong></p>
          <div class="predict-history">
            과거 공고일:
            <ul>${p.entries.map((e) =>
              `<li>${fmtDate(e.a.created || e.a.applyStart)} — ${esc(e.a.title)}</li>`).join("")}</ul>
          </div>
        </div>`;
      }).join("");
  }

  $("#calPrev").addEventListener("click", () => {
    if (--calMonth < 0) { calMonth = 11; calYear--; }
    renderCalendar();
  });
  $("#calNext").addEventListener("click", () => {
    if (++calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendar();
  });
  $("#includeSingle").addEventListener("change", renderPredict);
  $("#predictSearchInput").addEventListener("input", renderPredict);

  // ---------- 맞춤 추천 ----------
  // 지원목적 → 공고 본문에서 찾을 키워드. 추천 점수의 주축이다.
  // 영문 약어(MES/POP/IP/DX 등)는 단어 경계를 붙인다. 경계가 없으면 공고 본문에
  // 섞여 있는 URL 조각(openRegistPopYn 등)에 오탐이 난다.
  const GOALS = [
    ["스마트공장·MES 구축", /스마트공장|\bMES\b|생산관리시스템|\bPOP\b|제조실행|생산정보화/i],
    ["설비 데이터 자동수집", /데이터\s*수집|설비\s*데이터|\bIoT\b|센서|게이트웨이|실시간\s*모니터/i],
    ["에너지 절감·FEMS", /\bFEMS\b|에너지관리|에너지진단|에너지효율|탄소중립|온실가스|에너지절약/i],
    ["AI 품질검사·예지보전", /\bAI\b|인공지능|머신러닝|딥러닝|비전검사|예지보전|제조지능/i],
    ["로봇·자동화 도입", /로봇|자동화|무인화|협동로봇/i],
    ["제품·기술 개발(R&D)", /R&D|기술개발|연구개발|신규과제|기술혁신/i],
    ["시제품 제작·시험인증", /시제품|인증|시험분석|규격인증|제품화|사업화/i],
    ["해외시장 진출·수출", /수출|해외|바우처|전시회|무역|글로벌|해외마케팅/i],
    ["인력 채용·교육", /고용|채용|인력|교육|훈련|일자리|양성/i],
    ["공장 확장·설비 구입", /정책자금|융자|시설자금|운전자금|설비투자|보증/i],
    ["특허·디자인 출원", /특허|지식재산|\bIP\b|상표|디자인출원|브랜드/i],
    ["보안·기술보호", /정보보안|기술보호|보안체계|정보보호|기술유출/i],
  ];

  const CERTS = ["벤처기업", "이노비즈", "메인비즈", "기업부설연구소", "뿌리기업",
    "소재부품장비", "스마트공장 수준확인", "수출기업", "청년친화", "여성기업",
    "장애인기업", "사회적기업", "ISO 인증", "IATF 16949"];

  const BLOCKERS = [
    ["tax", "국세·지방세 체납"],
    ["restrict", "정부사업 참여제한·부정수급 이력"],
    ["closed", "휴업·폐업 상태"],
    ["capital", "완전자본잠식"],
  ];

  // 상생형 사업의 모기업은 하드코딩하면 목록에 없는 기업(풀무원 등)이 "불명"으로 처리돼
  // 엉뚱한 추천이 나간다. 그래서 실제 공고 제목에서 추출해 목록을 만든다.
  // 괄호 안이 모기업이 아니라 차수·상태·사업명인 경우가 많아 걸러낸다.
  const NON_CORP = /^(제?\d+\s*차|수정|재공고|공고|연장|연장공고|추가|긴급|변경|최종|기초|고도화|신규|모집|알림|안내|결과|공지|필독|중요|스마트공장|지역일자리|지역특화|선도형|인공지능|상생형|대중소|공동|일반)$/;

  // "현대자동차그룹"과 "현대자동차 그룹"은 같은 회사 — 비교·집계는 정규화된 형태로 한다.
  function normCorp(s) {
    return (s || "").replace(/\s+/g, "").replace(/\((?:주|재|사)\)|㈜|주식회사/g, "");
  }

  function extractCorp(title) {
    // "[한국남부발전] 대중소 상생형…" / "[2차]2026 대중소상생형(삼성) 스마트공장…"
    let m = title.match(/^\s*[\[(【]\s*([^\])】]{2,20}?)\s*[\])】]/);
    if (m) {
      const v = m[1].trim();
      if (!NON_CORP.test(normCorp(v)) && !REGIONS.some((r) => v.includes(r))) return v;
    }
    m = title.match(/[(（]\s*([^)）]{2,16}?)\s*[)）]\s*스마트공장/);
    if (m && !NON_CORP.test(normCorp(m[1].trim()))) return m[1].trim();
    // 여기서 더 추측하면 "상생형 스마트공장"의 뒷 단어를 회사명으로 뽑는 오탐이 난다.
    return null;
  }

  let PARTNER_CORPS = []; // 데이터 로드 후 채워진다

  const REGIONS = ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기",
    "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"];
  // 공고 제목의 지역 표기 흔들림을 흡수 (예: [전남광주], 충청북도)
  const REGION_ALIAS = {
    서울: /서울/, 부산: /부산/, 대구: /대구/, 인천: /인천/, 광주: /광주/, 대전: /대전/,
    울산: /울산/, 세종: /세종/, 경기: /경기/, 강원: /강원/,
    충북: /충북|충청북도/, 충남: /충남|충청남도|대전충남/, 전북: /전북|전라북도/,
    전남: /전남|전라남도/, 경북: /경북|경상북도/, 경남: /경남|경상남도/, 제주: /제주/,
  };

  // 상생형 공고 제목에서 모기업을 뽑아 실제 존재하는 목록만 칩으로 만든다.
  function buildPartnerChips() {
    // 표기가 흔들리는 회사명을 정규화 키로 묶고, 가장 많이 쓰인 표기를 대표로 쓴다.
    const groups = new Map(); // norm → {count, forms:Map}
    DATA.announcements.forEach((a) => {
      const t = a.title || "";
      if (!/상생형|동반성장/.test(t)) return;
      const corp = extractCorp(t);
      if (!corp) return;
      const key = normCorp(corp);
      if (!groups.has(key)) groups.set(key, { count: 0, forms: new Map() });
      const g = groups.get(key);
      g.count += 1;
      g.forms.set(corp, (g.forms.get(corp) || 0) + 1);
    });
    PARTNER_CORPS = [...groups.entries()]
      .filter(([, g]) => g.count >= 2) // 1건짜리 오탐 제외
      .sort((x, y) => y[1].count - x[1].count)
      .map(([, g]) => [...g.forms.entries()].sort((x, y) => y[1] - x[1])[0][0]);
    $("#mPartners").innerHTML =
      `<label class="chip-check none"><input type="checkbox" value="__none"><span>해당 없음</span></label>` +
      PARTNER_CORPS.map((c) =>
        `<label class="chip-check"><input type="checkbox" value="${esc(c)}"><span>${esc(c)}</span></label>`).join("");
  }

  function buildMatchForm() {
    $("#mGoals").innerHTML = GOALS.map(([label], i) =>
      `<label class="chip-check"><input type="checkbox" value="${i}"><span>${esc(label)}</span></label>`).join("");
    $("#mCerts").innerHTML = CERTS.map((c) =>
      `<label class="chip-check"><input type="checkbox" value="${esc(c)}"><span>${esc(c)}</span></label>`).join("");
    $("#mBlockers").innerHTML = BLOCKERS.map(([k, label]) =>
      `<label class="chip-check danger"><input type="checkbox" value="${k}"><span>${esc(label)}</span></label>`).join("");
  }

  function readProfile() {
    const checked = (sel) => $$(sel + " input:checked").map((i) => i.value);
    return {
      region: $("#mRegion").value,
      size: $("#mSize").value,
      industry: $("#mIndustry").value,
      founded: $("#mFounded").value,
      employees: $("#mEmployees").value,
      revenue: $("#mRevenue").value,
      product: $("#mProduct").value.trim(),
      exportYn: $("#mExport").value,
      goals: checked("#mGoals").map(Number),
      plan: $("#mPlan").value.trim(),
      budget: $("#mBudget").value,
      selfPay: $("#mSelfPay").value,
      certs: checked("#mCerts"),
      blockers: checked("#mBlockers"),
      includeClosed: $("#mIncludeClosed").checked,
      partners: checked("#mPartners").filter((v) => v !== "__none"),
      partnerNone: $("#mPartners input[value='__none']").checked,
      isMember: $("#mMember").value === "yes",
      memberAnswered: $("#mMember").value !== "",
      isTenant: $("#mTenant").value === "yes",
      tenantAnswered: $("#mTenant").value !== "",
    };
  }

  function applyProfile(p) {
    if (!p) return;
    const set = (id, v) => { if (v !== undefined && v !== null) $(id).value = v; };
    set("#mRegion", p.region); set("#mSize", p.size); set("#mIndustry", p.industry);
    set("#mFounded", p.founded); set("#mEmployees", p.employees); set("#mRevenue", p.revenue);
    set("#mProduct", p.product); set("#mExport", p.exportYn); set("#mPlan", p.plan);
    set("#mBudget", p.budget); set("#mSelfPay", p.selfPay);
    if (p.memberAnswered) set("#mMember", p.isMember ? "yes" : "no");
    if (p.tenantAnswered) set("#mTenant", p.isTenant ? "yes" : "no");
    if (p.partnerNone) {
      const el = $("#mPartners input[value='__none']");
      if (el) el.checked = true;
    }
    (p.partners || []).forEach((c) => {
      const el = $$("#mPartners input").find((x) => x.value === c);
      if (el) el.checked = true;
    });
    $("#mIncludeClosed").checked = !!p.includeClosed;
    (p.goals || []).forEach((i) => {
      const el = $(`#mGoals input[value="${i}"]`);
      if (el) el.checked = true;
    });
    (p.certs || []).forEach((c) => {
      const el = $$("#mCerts input").find((x) => x.value === c);
      if (el) el.checked = true;
    });
    (p.blockers || []).forEach((b) => {
      const el = $(`#mBlockers input[value="${b}"]`);
      if (el) el.checked = true;
    });
  }

  const textCache = new Map();

  // 공고가 특정 집단에만 열려 있는지 판정. 지금 신청 가능한지가 추천의 전제이므로
  // 여기서 걸러내지 않으면 "신청도 못 하는 사업"이 상위에 뜬다.
  function restrictionsOf(a) {
    if (restrCache.has(a.id)) return restrCache.get(a.id);
    const title = a.title || "";
    const text = announceText(a);
    const out = [];

    // 대중소 상생형 = 해당 모기업의 협력사·추천기업만 신청 가능
    if (/상생형|동반성장/.test(title) || /대중소\s*상생/.test(text)) {
      const corp = extractCorp(title);
      out.push({
        type: "partner",
        key: corp,
        label: corp ? `${corp} 협력사·추천기업만 신청 가능` : "대기업 협력사만 신청 가능(상생형)",
      });
    }
    if (/협력사|협력기업|수요기업|공급망|1차\s*벤더|파트너사/.test(text) &&
        !out.some((r) => r.type === "partner")) {
      const corp = extractCorp(title);
      out.push({ type: "partner", key: corp, label: corp ? `${corp} 협력사 대상` : "협력사·수요기업 대상" });
    }
    if (/추천\s*(기업|서|받은)|지정\s*기업|선정된\s*기업|사전\s*(신청|수요조사|접수|등록)/.test(text)) {
      out.push({ type: "recommend", label: "사전 신청·기관 추천이 필요할 수 있음" });
    }
    if (/회원사|조합원|협회\s*회원|가입\s*기업/.test(text)) {
      out.push({ type: "member", label: "조합·협회 회원사 대상" });
    }
    if (/입주\s*기업|산업단지\s*입주|단지\s*내\s*기업|입주기업/.test(text)) {
      out.push({ type: "tenant", label: "산업단지·센터 입주기업 대상" });
    }
    restrCache.set(a.id, out);
    return out;
  }

  // 지원금액 추출. 데이터에는 "최대 5천만원", "300만원 이내", "3억원" 형태가 섞여 있어
  // 억/천만/백만/만 단위를 모두 처리한다. (기존엔 억·백만만 봐서 대부분 놓쳤다)
  const UNIT_TO_MW = { "억": 100, "천만": 10, "백만": 1, "만": 0.01 }; // 백만원 환산

  function supportAmount(a) {
    if (amountCache.has(a.id)) return amountCache.get(a.id);
    const text = announceText(a);
    let best = null;
    const re = /(?:최대\s*)?([\d][\d,.]*)\s*(억|천만|백만|만)\s*원/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const num = parseFloat(m[1].replace(/,/g, ""));
      if (!isFinite(num)) continue;
      const mw = num * (UNIT_TO_MW[m[2]] || 0);
      if (mw <= 0) continue;
      // 가장 큰 금액을 그 사업의 지원 규모로 본다
      if (!best || mw > best.millionWon) {
        best = { label: m[0].replace(/\s+/g, " ").trim(), millionWon: mw };
      }
    }
    amountCache.set(a.id, best);
    return best;
  }

  const restrCache = new Map();
  const amountCache = new Map();

  function announceText(a) {
    if (textCache.has(a.id)) return textCache.get(a.id);
    // 본문에 섞여 있는 URL은 매칭 오탐의 원인이라 제거한다
    const text = [a.title, a.summary, a.target, a.field, a.subField, a.org,
      (a.hashtags || []).join(" ")].filter(Boolean).join(" ")
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/\b[\w.]+\.(?:do|jsp|html?|kr|com)\b\S*/gi, " ");
    textCache.set(a.id, text);
    return text;
  }

  // 공고가 특정 지역 전용인지 판정. 전용이 아니면 null(전국 사업).
  function regionOf(a) {
    const head = (a.title || "").slice(0, 30);
    const m = head.match(/^\s*[\[(【]([^\])】]+)[\])】]/);
    const scope = m ? m[1] : head;
    for (const r of REGIONS) {
      if (REGION_ALIAS[r].test(scope)) return r;
    }
    return null;
  }

  function scoreAnnouncement(a, p) {
    const text = announceText(a);
    const reasons = [];
    const warnings = [];
    let score = 0;

    // 0단계 신청 가능 여부 — 자격이 닫혀 있으면 아무리 목적이 맞아도 신청할 수 없다
    for (const r of restrictionsOf(a)) {
      if (r.type === "partner") {
        const answered = p.partnerNone || p.partners.length > 0;
        if (r.key) {
          // 모기업이 특정된 공고 — 그 기업의 협력사인지로 갈린다 (표기 흔들림은 정규화로 흡수)
          const mine = p.partners.map(normCorp);
          if (mine.includes(normCorp(r.key))) {
            score += 24;
            reasons.push(`${r.key} 협력사 해당`);
          } else if (answered) {
            return null; // 협력관계를 밝혔는데 해당 없음 → 신청 불가
          } else {
            warnings.push(r.label);
          }
        } else {
          // 모기업을 특정하지 못한 공고 — 자격을 확인할 수 없으므로 가점도 주지 않는다
          if (p.partnerNone) return null;
          warnings.push(r.label);
        }
      } else if (r.type === "member") {
        if (p.isMember) { score += 8; reasons.push("조합·협회 회원"); }
        else if (p.memberAnswered) return null;
        else warnings.push(r.label);
      } else if (r.type === "tenant") {
        if (p.isTenant) { score += 8; reasons.push("산단 입주기업"); }
        else if (p.tenantAnswered) return null;
        else warnings.push(r.label);
      } else {
        warnings.push(r.label);
      }
    }

    // 1단계 신청자격 — 지역: 다른 지역 전용 공고는 아예 제외
    const region = regionOf(a);
    if (region && p.region && region !== p.region) return null;
    if (region && p.region && region === p.region) {
      score += 22;
      reasons.push(`${region} 지역사업`);
    } else if (!region) {
      score += 6; // 전국 대상
    }

    // 2단계 지원목적 — 추천의 핵심 (가중치 최대)
    let goalHit = 0;
    p.goals.forEach((i) => {
      const g = GOALS[i];
      if (g && g[1].test(text)) {
        goalHit += 1;
        if (reasons.length < 6) reasons.push(g[0]);
      }
    });
    if (p.goals.length && !goalHit) return null; // 목적이 하나도 안 맞으면 제외
    score += Math.min(goalHit * 26, 52);

    // 기업규모
    if (p.size && new RegExp(p.size).test(text)) {
      score += 14;
      reasons.push(p.size + " 대상");
    }
    // 업종·생산품 키워드
    const words = [p.industry, ...(p.product ? p.product.split(/[,\s]+/) : []),
      ...(p.plan ? p.plan.split(/[,\s]+/) : [])].filter((w) => w && w.length >= 2);
    const wordHit = words.filter((w) => text.includes(w));
    if (wordHit.length) {
      score += Math.min(wordHit.length * 8, 16);
      reasons.push(wordHit.slice(0, 2).join("·") + " 관련");
    }
    // 창업기업 (설립 7년 이내)
    if (p.founded) {
      const years = TODAY.getFullYear() - Number(p.founded);
      if (years <= 7 && /창업|초기기업|예비창업/.test(text)) {
        score += 10;
        reasons.push(`창업 ${years}년차 대상`);
      }
    }
    // 수출
    if (p.exportYn === "yes" && /수출|해외|글로벌/.test(text)) {
      score += 8;
      reasons.push("수출기업 대상");
    }
    // 가점 인증
    const certHit = (p.certs || []).filter((c) =>
      text.includes(c.replace(/\s*인증$/, "").replace("소재부품장비", "소재·부품·장비")));
    if (certHit.length) {
      score += Math.min(certHit.length * 5, 10);
      reasons.push("가점: " + certHit.slice(0, 2).join(", "));
    }

    // 접수 상태 — 지금 신청 가능한 것을 우선
    const st = statusOf(a);
    if (st === "open") score += 16;
    else if (st === "upcoming") score += 12;
    else if (st === "always") score += 8;
    else if (!p.includeClosed) return null;

    // 4단계 사업규모 — 추출된 지원금액과 희망 사업비 비교
    const amount = supportAmount(a);
    let budgetNote = null;
    if (amount) {
      budgetNote = `지원규모 ${amount.label}`;
      if (p.budget) {
        const mine = Number(p.budget);
        if (amount.millionWon >= mine * 0.5) {
          score += 10;
          reasons.push(`희망 사업비(${mine}백만원) 대비 규모 적합`);
        } else {
          score -= 8;
          warnings.push(`지원규모(${amount.label})가 희망 사업비 ${mine}백만원보다 작음`);
        }
      }
    } else if (p.budget) {
      budgetNote = "지원금액 미기재 (공고문 확인 필요)";
    }

    return {
      a, score: Math.max(0, Math.min(Math.round(score), 100)),
      reasons, warnings, budgetNote, region,
    };
  }

  function renderMatchResults(p) {
    const warn = $("#matchWarn");
    if (p.blockers.length) {
      const names = p.blockers.map((b) => (BLOCKERS.find((x) => x[0] === b) || [, b])[1]);
      warn.innerHTML = `<div class="warn-box">🚫 <strong>${esc(names.join(", "))}</strong>에 해당하면
        대부분의 정부지원사업은 신청이 제한됩니다. 아래 결과는 참고용이며,
        신청 전 해당 사항을 먼저 해소하거나 주관기관에 문의하세요.</div>`;
    } else {
      warn.innerHTML = "";
    }

    if (!p.goals.length) {
      $("#matchCount").textContent = "";
      $("#matchList").innerHTML =
        '<p class="empty">「2. 해결하려는 문제」를 하나 이상 선택해주세요.<br>이 항목이 추천의 기준이 됩니다.</p>';
      return;
    }

    const results = DATA.announcements
      .map((a) => scoreAnnouncement(a, p))
      .filter(Boolean)
      .sort((x, y) => y.score - x.score || (y.a.created || "").localeCompare(x.a.created || ""))
      .slice(0, 100);

    $("#matchCount").textContent =
      `적합도 높은 순 ${results.length}건 (전체 ${DATA.announcements.length}건 중 선별)`;

    if (!results.length) {
      $("#matchList").innerHTML =
        '<p class="empty">조건에 맞는 공고를 찾지 못했습니다.<br>목적을 더 선택하거나 지역을 "선택 안 함"으로 두고 다시 시도해보세요.</p>';
      return;
    }

    $("#matchList").innerHTML = results.map((r) => {
      const a = r.a;
      const period = a.applyStart ? `${fmtDate(a.applyStart)} ~ ${fmtDate(a.applyEnd)}`
        : (a.applyText || "기간 정보 없음");
      const grade = r.score >= 70 ? "high" : r.score >= 45 ? "mid" : "low";
      return `<article class="card match-card" data-id="${esc(a.id)}">
        <div class="card-top">
          <span class="match-score ${grade}">적합도 ${r.score}</span>
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
        <div class="match-why">
          <strong>추천 이유</strong>
          ${r.reasons.map((x) => `<span class="why-chip">${esc(x)}</span>`).join("")}
          ${r.budgetNote ? `<span class="why-chip amount">${esc(r.budgetNote)}</span>` : ""}
        </div>
        ${r.warnings.length ? `<div class="match-warn-row">
          ${r.warnings.map((w) => `<span class="warn-chip">⚠️ ${esc(w)}</span>`).join("")}
        </div>` : ""}
        <p class="match-todo">확인 필요: 세부 신청자격(업종·매출·중복지원 제한)은 공고문 원문에서 확인하세요.</p>
      </article>`;
    }).join("");

    $$("#matchList .card").forEach((card) => {
      card.addEventListener("click", () => openDetail(card.dataset.id));
    });
  }

  const PROFILE_KEY = "pjfinder.profile.v1";

  function runMatch() {
    const p = readProfile();
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
    } catch (e) { /* 저장 실패는 추천 자체를 막지 않는다 */ }
    renderMatchResults(p);
  }

  buildMatchForm();

  // 협력사 칩은 공고 데이터에서 만들어야 하므로 로드 완료 후 구성한다.
  function initMatchAfterData() {
    buildPartnerChips();
    try {
      const saved = localStorage.getItem(PROFILE_KEY);
      if (saved) applyProfile(JSON.parse(saved));
    } catch (e) { /* 저장값이 깨졌으면 빈 폼으로 시작 */ }
  }

  $("#matchForm").addEventListener("submit", (e) => {
    e.preventDefault();
    runMatch();
  });
  $("#mReset").addEventListener("click", () => {
    $("#matchForm").reset();
    $$("#mGoals input, #mCerts input, #mBlockers input").forEach((i) => (i.checked = false));
    try { localStorage.removeItem(PROFILE_KEY); } catch (e) { /* 무시 */ }
    $("#matchWarn").innerHTML = "";
    $("#matchCount").textContent = "";
    $("#matchList").innerHTML = "";
  });
  $("#mIncludeClosed").addEventListener("change", () => {
    if ($$("#mGoals input:checked").length) runMatch();
  });

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
      initMatchAfterData();
      renderList();
      renderFiles();
      renderPredict();
    })
    .catch((err) => {
      $("#cardList").innerHTML =
        `<p class="empty">데이터를 불러오지 못했습니다. (${esc(err.message)})<br>data/announcements.json 파일을 확인해주세요.</p>`;
    });
})();
