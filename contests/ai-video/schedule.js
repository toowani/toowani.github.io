/* ============================================================
   WANI.SYS — AI VIDEO TRACKER · 일정 페이지
   월간 캘린더 + 선택한 날의 일정 + 대회별 진행 현황.
   ============================================================ */
(function () {
  "use strict";
  var A = window.AIV, $ = A.$, esc = A.esc;
  var tracker = null, events = [], byDate = {};
  var view = new Date(); view.setDate(1);
  var selected = A.todayISO();
  var MAX_CHIPS = 3;

  A.initTheme();
  A.initWidth();

  A.load("").then(function (res) {
    tracker = res[0];
    render(res[1]);
  }).catch(function (e) {
    $("#updated").textContent = "불러오기 실패: " + e.message;
  });

  function render(radar) {
    var cs = tracker.contests;
    var live = cs.filter(function (c) { return c.stage !== "skip"; });
    var wait = cs.filter(function (c) { return c.stage === "answer"; }).length;
    $("#updated").textContent = "보드 갱신 " + (tracker.updatedAt || "?") + " · 대회 " + cs.length + "개 (진행 " + live.length + " · 패스 " + (cs.length - live.length) + ")";
    $("#st-wait").textContent = wait;
    $("#tab-wait").textContent = wait || "";
    $("#st-work").textContent = cs.filter(function (c) { return c.stage === "plan" || c.stage === "produce"; }).length;
    $("#st-submit").textContent = cs.filter(function (c) { return c.stage === "submit"; }).length;
    $("#st-done").textContent = cs.filter(function (c) { return c.stage === "submitted"; }).length;
    $("#st-prize").textContent = A.won(live.reduce(function (s, c) { return s + (c.firstPrize || 0); }, 0)) || "–";

    live.forEach(function (c) {
      A.eventsOf(c).forEach(function (e) {
        // 이미 제출한 대회의 마감은 할 일이 아니므로 캘린더에서 뺀다
        if (e.kind === "deadline" && A.stageIndex(c.stage) >= A.stageIndex("submitted")) return;
        events.push(e);
      });
    });
    var order = { deadline: 0, announce: 1, award: 2, other: 3 };
    events.sort(function (a, b) { return order[a.kind] - order[b.kind]; });
    events.forEach(function (e) { (byDate[e.date] = byDate[e.date] || []).push(e); });

    renderCalendar();
    renderDay();
    renderStatus(live, cs.filter(function (c) { return c.stage === "skip"; }));
    renderNew(radar);
  }

  // ---------- calendar ----------
  function renderCalendar() {
    var y = view.getFullYear(), m = view.getMonth();
    $("#cal-title").textContent = y + "년 " + (m + 1) + "월";
    var start = new Date(y, m, 1 - new Date(y, m, 1).getDay());
    var today = A.todayISO();
    var html = "일월화수목금토".split("").map(function (d, i) {
      return '<div class="cal-dow' + (i === 0 ? " sun" : i === 6 ? " sat" : "") + '">' + d + "</div>";
    }).join("");
    for (var i = 0; i < 42; i++) {
      var d = new Date(start); d.setDate(start.getDate() + i);
      if (i === 35 && d.getMonth() !== m) break; // 5주로 끝나는 달은 마지막 줄 생략
      var iso = A.toISO(d), evs = byDate[iso] || [];
      var cls = "cal-day" + (d.getMonth() !== m ? " out" : "") + (iso === today ? " today" : "") +
        (iso === selected ? " sel" : "") + (iso < today ? " past" : "") + (evs.length ? " has" : "");
      // 일정 칩은 그 대회의 질문 페이지로 바로 가는 링크, 칸의 빈 곳은 날짜 선택
      var chips = evs.slice(0, MAX_CHIPS).map(function (e) {
        return '<a class="cal-chip k-' + e.kind + '" href="questions/#' + esc(e.c.id) + '" title="' +
          esc(A.KIND_LABEL[e.kind] + " · " + e.c.title + " · " + e.text) + '">' + esc(A.shortName(e.c)) + "</a>";
      }).join("");
      if (evs.length > MAX_CHIPS) chips += '<span class="cal-more">+' + (evs.length - MAX_CHIPS) + "</span>";
      var dots = evs.map(function (e) { return '<i class="k-' + e.kind + '"></i>'; }).join("");
      html += '<div class="' + cls + '" role="gridcell" tabindex="0" data-date="' + iso + '" aria-label="' + iso + " 일정 " + evs.length + '개">' +
        '<span class="cal-num' + (d.getDay() === 0 ? " sun" : d.getDay() === 6 ? " sat" : "") + '">' + d.getDate() + "</span>" +
        '<span class="cal-chips">' + chips + "</span>" +
        '<span class="cal-dots">' + dots + "</span></div>";
    }
    var el = $("#cal");
    el.innerHTML = html;
    Array.prototype.forEach.call(el.querySelectorAll(".cal-day"), function (b) {
      function pick() {
        selected = b.dataset.date;
        var d = new Date(selected + "T00:00:00");
        if (d.getMonth() !== view.getMonth()) { view = new Date(d.getFullYear(), d.getMonth(), 1); }
        renderCalendar(); renderDay();
      }
      b.addEventListener("click", function (ev) { if (!ev.target.closest("a")) pick(); });
      b.addEventListener("keydown", function (ev) {
        if ((ev.key === "Enter" || ev.key === " ") && ev.target === b) { ev.preventDefault(); pick(); }
      });
    });
  }

  function shiftMonth(n) { view = new Date(view.getFullYear(), view.getMonth() + n, 1); renderCalendar(); }
  $("#cal-prev").addEventListener("click", function () { shiftMonth(-1); });
  $("#cal-next").addEventListener("click", function () { shiftMonth(1); });
  $("#cal-today").addEventListener("click", function () {
    var t = new Date(); view = new Date(t.getFullYear(), t.getMonth(), 1); selected = A.todayISO();
    renderCalendar(); renderDay();
  });
  $("#btn-ics").addEventListener("click", function () { if (tracker) A.downloadICS(tracker); });

  // ---------- 선택한 날 ----------
  function renderDay() {
    var d = new Date(selected + "T00:00:00"), n = A.daysUntil(selected);
    var head = (d.getMonth() + 1) + "월 " + d.getDate() + "일 (" + "일월화수목금토"[d.getDay()] + ") · " + A.ddayText(n);
    var evs = byDate[selected] || [];
    var html = '<div class="day-head">' + head + "</div>";
    if (!evs.length) {
      // 빈 날을 눌렀으면 다음 일정을 알려준다
      var next = Object.keys(byDate).sort().filter(function (k) { return k > selected; })[0];
      html += '<p class="day-empty">일정 없음' + (next ? ' · 다음 일정 <button class="link-btn" data-go="' + next + '">' +
        next.slice(5).replace("-", "/") + " " + esc(A.shortName(byDate[next][0].c)) + " " + A.KIND_LABEL[byDate[next][0].kind] + "</button>" : "") + "</p>";
    } else {
      html += evs.map(function (e) {
        var c = e.c, ask = c.stage === "answer" && (c.questions || []).length;
        return '<a class="day-ev" href="questions/#' + esc(c.id) + '">' +
          '<span class="tl-kind k-' + e.kind + '">' + esc(e.kind === "other" ? "일정" : A.KIND_LABEL[e.kind]) + "</span>" +
          '<div class="day-ev-main"><b>' + esc(c.title) + "</b>" +
            '<span class="day-ev-sub">' + esc(e.text) + " · " + esc(A.stageName(c)) + "</span></div>" +
          (ask ? '<span class="act go">질문 답하기 →</span>' : '<span class="act">상세 →</span>') +
        "</a>";
      }).join("");
    }
    var el = $("#day-panel");
    el.innerHTML = html;
    var go = el.querySelector("[data-go]");
    if (go) go.addEventListener("click", function () {
      selected = go.dataset.go;
      var nd = new Date(selected + "T00:00:00");
      view = new Date(nd.getFullYear(), nd.getMonth(), 1);
      renderCalendar(); renderDay();
    });
  }

  // ---------- 진행 현황 ----------
  var PRIO_ORDER = { S: 0, A: 1, B: 2 };
  function nextEvent(c) {
    var today = A.todayISO();
    return events.filter(function (e) { return e.c === c && e.date >= today; })[0] ||
      null;
  }
  function statusRow(c) {
    var n = A.isISO(c.applyEnd) ? A.daysUntil(c.applyEnd) : null;
    var done = A.stageIndex(c.stage) >= A.stageIndex("submitted");
    var cls = done || n == null ? "unk" : n < 0 ? "over" : n <= 1 ? "d1" : n <= 3 ? "d3" : n <= 7 ? "d7" : "";
    var ne = nextEvent(c);
    var ask = c.stage === "answer" && (c.questions || []).length;
    var label = done ? (c.announceDate ? "발표 " + (A.isISO(c.announceDate) ? A.ddayText(A.daysUntil(c.announceDate)) : "미정") : "발표 대기")
      : n == null ? "미정" : A.ddayText(n);
    return '<div class="srow' + (c.stage === "skip" ? " skip" : "") + '">' +
      '<div class="dday ' + cls + '">' + esc(label) + "<small>" +
        (done ? "" : A.isISO(c.applyEnd) ? c.applyEnd.slice(5).replace("-", "/") + " 마감" : "") + "</small></div>" +
      '<div class="srow-main">' +
        '<div class="title-line">' + (c.priority ? '<span class="prio p-' + esc(c.priority) + '">' + esc(c.priority) + "</span>" : "") +
          '<span class="title">' + esc(c.title) + "</span></div>" +
        (c.stage === "skip" ? '<div class="reason-text">' + esc(c.note || "") + "</div>" :
          A.stageBars(c) +
          '<div class="tags"><span class="stage-label">' + esc(A.stageName(c)) + "</span>" +
            '<span class="tag">' + esc(A.STAGE_HINT[c.stage] || "") + "</span>" +
            (ne && !(ne.kind === "deadline") ? '<span class="tag">다음: ' + ne.date.slice(5).replace("-", "/") + " " + esc(ne.text) + "</span>" : "") +
            (c.announceDate && !A.isISO(c.announceDate) ? '<span class="tag">발표 ' + esc(c.announceDate) + "</span>" : "") +
          "</div>") +
      "</div>" +
      '<div class="srow-side">' + (c.firstPrize ? '<span class="prize">1등 ' + A.won(c.firstPrize) + "</span>" : "") +
        (c.stage === "skip" ? "" : ask ? '<a class="act go" href="questions/#' + esc(c.id) + '">질문 답하기 →</a>'
          : '<a class="act" href="questions/#' + esc(c.id) + '">상세</a>') + "</div>" +
    "</div>";
  }

  function renderStatus(live, skipped) {
    live.sort(function (a, b) {
      var da = A.stageIndex(a.stage) >= A.stageIndex("submitted") ? 1 : 0, db = A.stageIndex(b.stage) >= A.stageIndex("submitted") ? 1 : 0;
      if (da !== db) return da - db;
      return (a.applyEnd || "9") < (b.applyEnd || "9") ? -1 : 1;
    });
    $("#status-list").innerHTML = live.length ? live.map(statusRow).join("") : '<p class="empty-note">진행 중인 대회가 없어요.</p>';
    if (skipped.length) {
      $("#skip-block").hidden = false;
      $("#skip-summary").textContent = "패스한 대회 " + skipped.length + "개 (자격 불가 · 영상 아님 · 시간 부족)";
      $("#skip-list").innerHTML = skipped.map(statusRow).join("");
    }
  }

  // ---------- 아직 분석하지 않은 AI 영상 공모전 ----------
  function renderNew(radar) {
    if (!radar) return;
    var items = radar.items || Object.keys(radar).map(function (k) { return radar[k]; }).filter(Array.isArray)[0] || [];
    var known = {};
    tracker.contests.forEach(function (c) { (c.sourceIds || []).concat([c.id]).forEach(function (s) { known[s] = 1; }); });
    (tracker.ignoredIds || []).forEach(function (s) { known[s] = 1; });
    var today = A.todayISO();
    var fresh = items.filter(function (i) {
      var video = (i.tags || []).indexOf("video") >= 0 || /영상|숏폼|뮤직비디오|MV|필름/.test(i.title || "");
      var ai = /AI|인공지능|생성형/i.test((i.title || "") + " " + (i.tags || []).join(" "));
      return video && ai && !known[i.id] && (!i.applyEnd || i.applyEnd >= today);
    }).sort(function (a, b) { return (a.applyEnd || "9") < (b.applyEnd || "9") ? -1 : 1; });
    if (!fresh.length) return;
    $("#new-block").hidden = false;
    $("#new-list").innerHTML = fresh.map(function (i) {
      return '<div class="new-row"><span class="d">' + (i.applyEnd ? A.ddayText(A.daysUntil(i.applyEnd)) : "미정") + "</span>" +
        '<a href="' + esc(i.officialUrl || i.url) + '" target="_blank" rel="noopener">' + esc(i.title) + "</a>" +
        '<span class="tag">' + esc(i.host || "") + "</span></div>";
    }).join("");
  }
})();
