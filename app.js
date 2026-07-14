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

  // ---------- 상세 ----------
  function openDetail(id) {
    const a = DATA.announcements.find((x) => x.id === id);
    if (!a) return;
    const period = a.applyStart
      ? `${fmtDate(a.applyStart)} ~ ${fmtDate(a.applyEnd)}`
      : (a.applyText || "-");
    const rows = [
      ["지원분야", [a.field, a.subField].filter(Boolean).join(" > ") || "-"],
      ["소관부처", a.agency || "-"],
      ["수행기관", a.org || "-"],
      ["신청기간", period],
      ["지원대상", a.target || "-"],
      ["신청방법", a.applyMethod || "-"],
      ["문의처", a.contact || "-"],
    ];
    $("#detailContent").innerHTML = `
      <div class="detail-badges">${statusBadge(a)}
        ${a.field ? `<span class="badge field">${esc(a.field)}</span>` : ""}</div>
      <h2 class="detail-title">${esc(a.title)}</h2>
      <dl class="summary-grid">
        ${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}
      </dl>
      ${a.summary ? `<div class="detail-section"><h4>📄 사업 개요</h4><p>${esc(a.summary)}</p></div>` : ""}
      ${a.hashtags && a.hashtags.length
        ? `<div class="card-tags" style="margin-top:14px">${a.hashtags.map((t) => `<span class="tag">#${esc(t)}</span>`).join("")}</div>` : ""}
      <div class="detail-section">
        <h4>📎 첨부파일 ${a.attachments && a.attachments.length ? `(${a.attachments.length})` : ""}</h4>
        ${a.attachments && a.attachments.length
          ? `<ul class="attach-list">${a.attachments.map((f) =>
              `<li><a href="${esc(f.url)}" target="_blank" rel="noopener" ${f.url === "#sample" ? 'onclick="alert(\'샘플 데이터입니다. 실제 데이터 연동 후 다운로드할 수 있습니다.\');return false;"' : "download"}>⬇️ ${esc(f.name)}</a></li>`).join("")}</ul>`
          : '<p style="color:var(--muted);font-size:.9rem">첨부파일이 없습니다.</p>'}
      </div>
      <div class="detail-actions">
        ${a.url ? `<a class="btn-primary" href="${esc(a.url)}" target="_blank" rel="noopener">기업마당에서 원문 보기 ↗</a>` : ""}
      </div>`;
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
      .replace(/\[[^\]]*\]/g, " ")
      .replace(/\(\s*(재공고|재|연장|변경|수정)\s*\)/g, " ")
      .replace(/재공고/g, " ")
      .replace(/20\d{2}\s*년도?/g, " ")
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
      let predYear = lastYear + 1;
      let predDate = new Date(predYear, 0, 1 + avgDoy);
      // 예측일이 이미 한참 지났으면 다음 해로
      if (predDate < TODAY && (TODAY - predDate) / 86400000 > 60) {
        predDate = new Date(predYear + 1, 0, 1 + avgDoy);
      }

      preds.push({
        name: key,
        entries: entries.sort((x, y) => y.d - x.d),
        yearlyCount: yearly.length,
        predDate,
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

  function renderPredict() {
    const includeSingle = $("#includeSingle").checked;
    const preds = buildPredictions(includeSingle);
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
      const conf = p.yearlyCount >= 3 ? ["high", `이력 ${p.yearlyCount}년 · 신뢰도 높음`]
        : p.yearlyCount === 2 ? ["high", "이력 2년 · 참고용"]
        : ["low", "이력 1건 · 정확도 낮음"];
      return `<div class="predict-card">
        <div class="card-top">
          <span class="confidence ${conf[0]}">${conf[1]}</span>
        </div>
        <h3>${esc(p.name)}</h3>
        <p class="predict-when">다음 공고 예상 시기: <strong>${fmtPredict(p.predDate)}</strong></p>
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
      renderList();
      renderFiles();
      renderPredict();
    })
    .catch((err) => {
      $("#cardList").innerHTML =
        `<p class="empty">데이터를 불러오지 못했습니다. (${esc(err.message)})<br>data/announcements.json 파일을 확인해주세요.</p>`;
    });
})();
