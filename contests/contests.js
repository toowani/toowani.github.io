/* ============================================================
   WANI.SYS — CONTEST RADAR CONTROLLER
   data.json(scripts/scrape-contests.mjs 산출물)을 읽어 마감일 순으로 그린다.
   관심(★)·지원함(✓)·숨김·메모는 localStorage — 서버 없음.
   모든 텍스트는 textContent/createElement로만 삽입 (외부 사이트에서 긁어온
   문자열이라 innerHTML에 넣지 않는다).
   ============================================================ */
(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var body = document.body;

  /* ---------- 테마 (hub와 같은 키 공유) ---------- */
  var theme = localStorage.getItem("wani-hub-theme") || "dark";
  if (theme === "light") body.dataset.theme = "light";
  var themeBtn = $("#btn-theme");
  function syncThemeBtn() { themeBtn.textContent = theme === "light" ? "◐ DARK" : "◐ LIGHT"; }
  syncThemeBtn();
  themeBtn.addEventListener("click", function () {
    theme = theme === "dark" ? "light" : "dark";
    localStorage.setItem("wani-hub-theme", theme);
    if (theme === "light") body.dataset.theme = "light"; else delete body.dataset.theme;
    syncThemeBtn();
  });

  /* ---------- 개인 상태 ---------- */
  var STATE_KEY = "wani-contests-state";
  var state = { star: {}, applied: {}, hidden: {}, memo: {}, lastVisit: null, filters: null };
  try {
    var saved = JSON.parse(localStorage.getItem(STATE_KEY) || "null");
    if (saved && typeof saved === "object") {
      ["star", "applied", "hidden", "memo"].forEach(function (k) { if (saved[k] && typeof saved[k] === "object") state[k] = saved[k]; });
      state.lastVisit = saved.lastVisit || null;
      state.filters = saved.filters || null;
    }
  } catch (e) { /* 손상된 저장값은 무시 */ }
  var prevVisit = state.lastVisit; // NEW 판정 기준: 직전 방문
  state.lastVisit = new Date().toISOString();
  function save() { try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) { /* 저장 불가 환경 */ } }
  save();

  /* ---------- 상수 ---------- */
  var SOURCE_LABEL = { linkareer: "링커리어", hola: "홀라", wevity: "위비티", devevent: "Dev-Event", kstartup: "K-Startup" };
  var TAG_LABEL = { ai: "AI", dev: "해커톤·개발", startup: "창업", video: "영상" };
  var KST = 9 * 60 * 60 * 1000;
  function todayKST() { return new Date(Date.now() + KST).toISOString().slice(0, 10); }
  function dayDiff(a, b) { return Math.round((Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86400000); }
  function fmtDate(d) { return d ? d.slice(2).replace(/-/g, ".") : "?"; }

  /* ---------- 필터 상태 ---------- */
  var filters = {
    q: "",
    cats: { ai: true, dev: true, startup: true, video: true },
    status: { open: true, upcoming: true, closed: false },
    sources: {},
    starOnly: false, hideApplied: false, showHidden: false, newOnly: false,
    sort: "deadline",
  };
  if (state.filters) {
    try {
      var f = state.filters;
      if (f.cats) filters.cats = f.cats;
      if (f.status) filters.status = f.status;
      if (f.sources) filters.sources = f.sources;
      if (f.sort) filters.sort = f.sort;
      filters.hideApplied = !!f.hideApplied;
    } catch (e) { /* ignore */ }
  }
  function persistFilters() {
    state.filters = { cats: filters.cats, status: filters.status, sources: filters.sources, sort: filters.sort, hideApplied: filters.hideApplied };
    save();
  }

  /* ---------- 데이터 ---------- */
  var DATA = null;
  var TODAY = todayKST();

  function enrich(it) {
    it._srcs = [];
    var seen = {};
    (it.sources || [{ source: it.source, url: it.url }]).forEach(function (s) {
      if (!seen[s.source]) { seen[s.source] = true; it._srcs.push(s); }
    });
    if (it.applyEnd) {
      it._d = dayDiff(it.applyEnd, TODAY);
      it._status = it._d < 0 ? "closed" : (it.applyStart && dayDiff(it.applyStart, TODAY) > 0 ? "upcoming" : "open");
    } else {
      it._d = null;
      it._status = it.applyStart && dayDiff(it.applyStart, TODAY) > 0 ? "upcoming" : "open";
    }
    it._new = !!(prevVisit && it.firstSeen && it.firstSeen > prevVisit.slice(0, 10)) || (!prevVisit && false);
    it._hay = [it.title, it.host, it.sourceCategory, it.target, it.place, it.prize].filter(Boolean).join(" ").toLowerCase();
    return it;
  }

  function matches(it) {
    if (!filters.showHidden && state.hidden[it.id]) return false;
    if (filters.showHidden && !state.hidden[it.id]) return false;
    if (filters.starOnly && !state.star[it.id]) return false;
    if (filters.hideApplied && state.applied[it.id]) return false;
    if (filters.newOnly && !it._new) return false;
    if (!filters.status[it._status]) return false;
    if (!it.tags.some(function (t) { return filters.cats[t]; })) return false;
    var srcOn = Object.keys(filters.sources).filter(function (k) { return filters.sources[k]; });
    if (srcOn.length && !it._srcs.some(function (s) { return filters.sources[s.source]; })) return false;
    if (filters.q) {
      var terms = filters.q.toLowerCase().split(/\s+/).filter(Boolean);
      for (var i = 0; i < terms.length; i++) if (it._hay.indexOf(terms[i]) < 0) return false;
    }
    return true;
  }

  var SORTERS = {
    deadline: function (a, b) { return (a.applyEnd || "9999").localeCompare(b.applyEnd || "9999") || a.title.localeCompare(b.title); },
    new: function (a, b) { return (b.firstSeen || "").localeCompare(a.firstSeen || "") || (b.postedAt || "").localeCompare(a.postedAt || "") || SORTERS.deadline(a, b); },
    start: function (a, b) { return (b.applyStart || "").localeCompare(a.applyStart || "") || SORTERS.deadline(a, b); },
    title: function (a, b) { return a.title.localeCompare(b.title, "ko"); },
  };

  function groupOf(it) {
    if (it._status === "closed") return { k: "g-over", t: "마감됨" };
    if (it._status === "upcoming") return { k: "g-up", t: "접수 예정" };
    if (it._d == null) return { k: "g-unk", t: "마감일 미상" };
    if (it._d <= 7) return { k: "g-week", t: "7일 내 마감" };
    if (it._d <= 14) return { k: "g-next", t: "2주 내 마감" };
    if (it._d <= 30) return { k: "g-month", t: "한 달 내 마감" };
    return { k: "g-later", t: "그 이후" };
  }

  /* ---------- 렌더 헬퍼 ---------- */
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function link(href, cls, text, title) {
    var a = el("a", cls, text);
    a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer";
    if (title) a.title = title;
    return a;
  }
  function gcalURL(it) {
    var d = (it.applyEnd || it.applyStart || TODAY).replace(/-/g, "");
    var next = new Date(Date.parse(it.applyEnd || it.applyStart || TODAY) + 86400000).toISOString().slice(0, 10).replace(/-/g, "");
    var details = ["마감: " + (it.applyEnd || "?"), it.host ? "주최: " + it.host : "", it.officialUrl || it.url].filter(Boolean).join("\n");
    return "https://calendar.google.com/calendar/render?action=TEMPLATE" +
      "&text=" + encodeURIComponent("[마감] " + it.title) +
      "&dates=" + d + "/" + next +
      "&details=" + encodeURIComponent(details);
  }

  function ddayEl(it) {
    var e = el("div", "dday");
    var small = el("small");
    if (it._status === "closed") { e.classList.add("over"); e.textContent = "D+" + (-it._d); small.textContent = "마감"; }
    else if (it._status === "upcoming") { e.classList.add("up"); e.textContent = "예정"; small.textContent = fmtDate(it.applyStart) + " 시작"; }
    else if (it._d == null) { e.classList.add("unk"); e.textContent = "D-?"; small.textContent = "미상"; }
    else {
      e.textContent = it._d === 0 ? "D-DAY" : "D-" + it._d;
      if (it._d <= 1) e.classList.add("d1"); else if (it._d <= 3) e.classList.add("d3"); else if (it._d <= 7) e.classList.add("d7");
      small.textContent = fmtDate(it.applyEnd);
    }
    e.appendChild(small);
    return e;
  }

  function itemEl(it) {
    var row = el("article", "item");
    row.dataset.id = it.id;
    if (state.star[it.id]) row.classList.add("starred");
    if (state.applied[it.id]) row.classList.add("applied");
    if (state.hidden[it.id]) row.classList.add("hidden-item");

    row.appendChild(ddayEl(it));

    var main = el("div", "main");
    var tl = el("div", "title-line");
    var primary = it.officialUrl || it.url;
    tl.appendChild(link(primary, "title", it.title, it.officialUrl ? "공식 페이지 열기" : "공고 보기"));
    if (it._new) tl.appendChild(el("span", "badge-new", "NEW"));
    main.appendChild(tl);

    var sub = el("div", "sub");
    if (it.host) sub.appendChild(el("span", "host", it.host));
    var period = el("span", "period");
    period.appendChild(document.createTextNode("접수 " + fmtDate(it.applyStart) + " ~ "));
    period.appendChild(el("b", null, it.applyEnd ? fmtDate(it.applyEnd) : "?"));
    sub.appendChild(period);
    if (it.eventStart && it.source !== "wevity") sub.appendChild(el("span", null, "행사 " + fmtDate(it.eventStart) + (it.eventEnd && it.eventEnd !== it.eventStart ? " ~ " + fmtDate(it.eventEnd) : "")));
    if (it.prize) sub.appendChild(el("span", null, "상금 " + it.prize));
    if (it.place) sub.appendChild(el("span", null, it.place));
    if (it.target) sub.appendChild(el("span", null, (/^대상/.test(it.target) ? "" : "대상 ") + it.target));
    main.appendChild(sub);

    var tags = el("div", "tags");
    it.tags.forEach(function (t) { tags.appendChild(el("span", "tag t-" + t, TAG_LABEL[t] || t)); });
    if (it.sourceCategory) tags.appendChild(el("span", "tag cat", it.sourceCategory));
    it._srcs.forEach(function (s) { tags.appendChild(link(s.url, "tag src", SOURCE_LABEL[s.source] || s.source, "출처 페이지 열기")); });
    main.appendChild(tags);
    row.appendChild(main);

    var actions = el("div", "actions");
    var r1 = el("div", "act-row");
    r1.appendChild(link(primary, "act go", it.officialUrl ? "지원하러 →" : "공고 →"));
    r1.appendChild(link(gcalURL(it), "act", "📅", "Google 캘린더에 마감일 추가"));
    actions.appendChild(r1);
    var r2 = el("div", "act-row");
    var bStar = el("button", "act" + (state.star[it.id] ? " on-star" : ""), state.star[it.id] ? "★ 관심" : "☆ 관심");
    bStar.addEventListener("click", function () { toggle("star", it.id); });
    var bApp = el("button", "act" + (state.applied[it.id] ? " on-applied" : ""), state.applied[it.id] ? "✓ 지원함" : "지원함");
    bApp.addEventListener("click", function () { toggle("applied", it.id); });
    var bHide = el("button", "act" + (state.hidden[it.id] ? " on-hidden" : ""), state.hidden[it.id] ? "숨김 해제" : "숨김");
    bHide.addEventListener("click", function () { toggle("hidden", it.id); });
    r2.appendChild(bStar); r2.appendChild(bApp); r2.appendChild(bHide);
    actions.appendChild(r2);
    var memo = el("div", "memo");
    var inp = el("input");
    inp.type = "text"; inp.placeholder = "메모…"; inp.value = state.memo[it.id] || "";
    inp.addEventListener("change", function () {
      if (inp.value.trim()) state.memo[it.id] = inp.value.trim(); else delete state.memo[it.id];
      save();
    });
    memo.appendChild(inp);
    actions.appendChild(memo);
    row.appendChild(actions);
    return row;
  }

  function toggle(kind, id) {
    if (state[kind][id]) delete state[kind][id]; else state[kind][id] = TODAY;
    save();
    render();
  }

  /* ---------- 렌더 ---------- */
  function render() {
    if (!DATA) return;
    var list = $("#list");
    list.textContent = "";
    var items = DATA.items.filter(matches).sort(SORTERS[filters.sort] || SORTERS.deadline);
    if (!items.length) {
      list.appendChild(el("p", "empty-note", "조건에 맞는 공고가 없습니다."));
    } else if (filters.sort === "deadline") {
      var lastKey = null, frag = document.createDocumentFragment();
      var groups = {};
      items.forEach(function (it) { var g = groupOf(it); (groups[g.k] = groups[g.k] || { g: g, items: [] }).items.push(it); });
      ["g-week", "g-next", "g-month", "g-later", "g-unk", "g-up", "g-over"].forEach(function (k) {
        if (!groups[k]) return;
        var h = el("h2", "group-title " + k, groups[k].g.t);
        h.appendChild(el("span", "n", groups[k].items.length + "건"));
        frag.appendChild(h);
        groups[k].items.forEach(function (it) { frag.appendChild(itemEl(it)); });
      });
      list.appendChild(frag);
    } else {
      var frag2 = document.createDocumentFragment();
      items.forEach(function (it) { frag2.appendChild(itemEl(it)); });
      list.appendChild(frag2);
    }
    renderStats();
  }

  function renderStats() {
    var all = DATA.items.filter(function (it) { return !state.hidden[it.id]; });
    var open = all.filter(function (it) { return it._status === "open"; });
    $("#st-open").textContent = open.length;
    $("#st-week").textContent = open.filter(function (it) { return it._d != null && it._d <= 7; }).length;
    $("#st-new").textContent = all.filter(function (it) { return it._new; }).length;
    $("#st-star").textContent = all.filter(function (it) { return state.star[it.id]; }).length;
    $("#st-applied").textContent = DATA.items.filter(function (it) { return state.applied[it.id]; }).length;
  }

  function renderSourceChips() {
    var wrap = $("#chips-src");
    wrap.textContent = "";
    wrap.appendChild(el("span", "chips-label", "출처"));
    var counts = {};
    DATA.items.forEach(function (it) { it._srcs.forEach(function (s) { counts[s.source] = (counts[s.source] || 0) + 1; }); });
    Object.keys(SOURCE_LABEL).forEach(function (k) {
      var b = el("button", "chip" + (filters.sources[k] ? " on" : ""), SOURCE_LABEL[k]);
      b.appendChild(el("span", "n", String(counts[k] || 0)));
      b.dataset.src = k;
      b.addEventListener("click", function () {
        filters.sources[k] = !filters.sources[k];
        b.classList.toggle("on", !!filters.sources[k]);
        persistFilters(); render();
      });
      wrap.appendChild(b);
    });
  }

  function renderMeta() {
    var gen = DATA.generatedAt ? new Date(DATA.generatedAt) : null;
    var ago = gen ? Math.round((Date.now() - gen.getTime()) / 3600000) : null;
    $("#updated").textContent = gen
      ? "마지막 수집 " + gen.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) + " KST" + (ago != null ? " (" + (ago < 1 ? "1시간 이내" : ago + "시간 전") + ")" : "") + " · 총 " + DATA.items.length + "건"
      : "수집 시각 미상";
    var h = $("#sources-health");
    h.textContent = "";
    Object.keys(DATA.sources || {}).forEach(function (k) {
      var s = DATA.sources[k];
      var sp = el("span", s.ok ? "" : "stale", (SOURCE_LABEL[k] || k) + " " + (s.count != null ? s.count : "?"));
      if (!s.ok) sp.title = "이번 수집 실패 — 직전 결과 유지. " + (s.error || "");
      h.appendChild(sp);
    });
  }

  /* ---------- 컨트롤 바인딩 ---------- */
  $$("#chips-cat .chip").forEach(function (b) {
    b.classList.toggle("on", !!filters.cats[b.dataset.cat]);
    b.addEventListener("click", function () {
      filters.cats[b.dataset.cat] = !filters.cats[b.dataset.cat];
      b.classList.toggle("on", filters.cats[b.dataset.cat]);
      persistFilters(); render();
    });
  });
  $$("#chips-status .chip[data-status]").forEach(function (b) {
    b.classList.toggle("on", !!filters.status[b.dataset.status]);
    b.addEventListener("click", function () {
      filters.status[b.dataset.status] = !filters.status[b.dataset.status];
      b.classList.toggle("on", filters.status[b.dataset.status]);
      persistFilters(); render();
    });
  });
  function bindToggle(id, key, persist) {
    var b = $(id);
    b.classList.toggle("on", !!filters[key]);
    b.addEventListener("click", function () {
      filters[key] = !filters[key];
      b.classList.toggle("on", filters[key]);
      if (persist) persistFilters();
      render();
    });
  }
  bindToggle("#f-star", "starOnly");
  bindToggle("#f-hide-applied", "hideApplied", true);
  bindToggle("#f-show-hidden", "showHidden");
  bindToggle("#f-new", "newOnly");

  var q = $("#q"), qTimer = null;
  q.addEventListener("input", function () {
    clearTimeout(qTimer);
    qTimer = setTimeout(function () { filters.q = q.value.trim(); render(); }, 120);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && document.activeElement !== q && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); }
    if (e.key === "Escape" && document.activeElement === q) { q.value = ""; filters.q = ""; render(); q.blur(); }
  });
  var sortSel = $("#sort");
  sortSel.value = filters.sort;
  sortSel.addEventListener("change", function () { filters.sort = sortSel.value; persistFilters(); render(); });

  /* ---------- 백업 / 복원 ---------- */
  $("#btn-export").addEventListener("click", function () {
    var blob = new Blob([JSON.stringify({ star: state.star, applied: state.applied, hidden: state.hidden, memo: state.memo, exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "contest-radar-" + TODAY + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });
  $("#btn-import").addEventListener("click", function () { $("#file-import").click(); });
  $("#file-import").addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var d = JSON.parse(fr.result);
        ["star", "applied", "hidden", "memo"].forEach(function (k) {
          if (d[k] && typeof d[k] === "object") Object.keys(d[k]).forEach(function (id) { state[k][id] = d[k][id]; });
        });
        save(); render();
        alert("복원했습니다 (기존 표시와 합쳐짐).");
      } catch (err) { alert("파일을 읽지 못했습니다: " + err.message); }
      e.target.value = "";
    };
    fr.readAsText(f);
  });

  /* ---------- 로드 ---------- */
  fetch("data.json?t=" + Math.floor(Date.now() / 600000), { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function (d) {
      DATA = d;
      DATA.items = (d.items || []).map(enrich);
      // 마감된 지원함/관심 항목이 data에서 사라져도 상태는 남는다 — 정리는 사용자 몫(백업에 포함)
      renderSourceChips();
      renderMeta();
      render();
    })
    .catch(function (e) {
      $("#list").textContent = "";
      $("#list").appendChild(el("p", "empty-note", "데이터를 불러오지 못했습니다: " + e.message));
      $("#updated").textContent = "";
    });
})();
