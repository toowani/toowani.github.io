/* ============================================================
   WANI.SYS — AI VIDEO TRACKER 공통 모듈
   일정 페이지(index.html)와 질문 페이지(questions/)가 함께 쓰는
   데이터 로드 · 날짜 계산 · 테마 · 캘린더(.ics) 내보내기.
   ============================================================ */
(function () {
  "use strict";

  var STAGES = [
    { key: "analysis", label: "분석" },
    { key: "answer", label: "답변 대기" },
    { key: "plan", label: "기획" },
    { key: "produce", label: "제작" },
    { key: "submit", label: "제출 대기" },
    { key: "submitted", label: "제출 완료" },
    { key: "result", label: "결과" }
  ];
  var STAGE_HINT = {
    analysis: "Claude가 공고를 읽는 중",
    answer: "질문에 답해 주세요",
    plan: "Claude가 답변으로 기획 중",
    produce: "영상 생성·편집 중",
    submit: "제출 직전, 마지막 클릭은 직접",
    submitted: "제출 완료, 발표 대기",
    result: "결과 발표됨",
    skip: "이번엔 패스"
  };
  var KIND_LABEL = { deadline: "마감", announce: "발표", award: "시상", other: "일정" };

  function $(s, el) { return (el || document).querySelector(s); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 저장 불가 환경 */ } }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function isISO(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s); }
  function toISO(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function todayISO() { return toISO(new Date()); }
  function daysUntil(iso) {
    var a = new Date(todayISO() + "T00:00:00"), b = new Date(iso + "T00:00:00");
    return Math.round((b - a) / 86400000);
  }
  function ddayText(n) { return n === 0 ? "D-DAY" : n > 0 ? "D-" + n : "D+" + (-n); }
  function won(n) {
    if (!n) return "";
    return n >= 10000 ? (n / 10000).toLocaleString("ko-KR") + "만원" : n.toLocaleString("ko-KR") + "원";
  }
  function stageIndex(key) {
    for (var i = 0; i < STAGES.length; i++) if (STAGES[i].key === key) return i;
    return -1;
  }
  function stageName(c) {
    if (c.stage === "skip") return "패스";
    var i = stageIndex(c.stage);
    return i >= 0 ? STAGES[i].label : c.stage;
  }
  function stageBars(c) {
    var si = stageIndex(c.stage);
    return '<div class="stages">' + STAGES.map(function (s, i) {
      return '<span class="' + (c.stage === "skip" ? "" : i < si ? "on" : i === si ? "cur" : "") + '" title="' + s.label + '"></span>';
    }).join("") + "</div>";
  }
  function shortName(c) { return c.short || c.title; }
  // 자동 수집으로 들어온 지 3일이 안 된 대회
  function isNew(c) { return isISO(c.addedAt) && daysUntil(c.addedAt) > -3; }
  function newBadge(c) { return isNew(c) ? '<span class="badge-new">New</span> ' : ""; }

  function toast(msg) {
    var t = document.createElement("div");
    t.className = "toast"; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }

  // 레이더와 같은 테마 키를 쓴다
  function initTheme() {
    var body = document.body, btn = $("#btn-theme");
    var theme = lsGet("wani-hub-theme") || "dark";
    if (theme === "light") body.dataset.theme = "light";
    function sync() { btn.textContent = theme === "light" ? "◐ Dark" : "◐ Light"; }
    sync();
    btn.addEventListener("click", function () {
      theme = theme === "dark" ? "light" : "dark";
      lsSet("wani-hub-theme", theme);
      if (theme === "light") body.dataset.theme = "light"; else delete body.dataset.theme;
      sync();
    });
  }

  // 페이지 너비: 보통(레이더와 같은 980px) · 넓게 · 전체. 두 페이지가 같은 설정을 공유한다
  function initWidth() {
    var group = $("#width-switch");
    if (!group) return;
    var w = lsGet("wani-aiv-width") || "wide";
    function apply() {
      document.body.dataset.width = w;
      Array.prototype.forEach.call(group.querySelectorAll("button"), function (b) {
        b.classList.toggle("on", b.dataset.w === w);
        b.setAttribute("aria-pressed", b.dataset.w === w ? "true" : "false");
      });
    }
    apply();
    group.addEventListener("click", function (ev) {
      var b = ev.target.closest("button[data-w]");
      if (!b) return;
      w = b.dataset.w; lsSet("wani-aiv-width", w); apply();
    });
  }

  // 마감 > 발표 > 시상 > 기타 순으로, 같은 날 같은 대회 일정은 하나만 남긴다
  function eventsOf(c) {
    var ev = [];
    if (isISO(c.applyEnd)) ev.push({ date: c.applyEnd, kind: "deadline", text: "접수 마감" + (c.applyEndTime ? " " + c.applyEndTime : "") });
    if (isISO(c.announceDate)) ev.push({ date: c.announceDate, kind: "announce", text: "결과 발표" });
    if (isISO(c.awardDate)) ev.push({ date: c.awardDate, kind: "award", text: "시상식" });
    (c.milestones || []).forEach(function (m) {
      if (!isISO(m.date)) return;
      // 주최 측 내부 심사 일정은 내가 할 일이 아니라서 뺀다
      if (/심사|검토|평가/.test(m.label) && !/결선|발표|투표/.test(m.label)) return;
      ev.push({ date: m.date, kind: "other", text: m.label });
    });
    var seen = {};
    return ev.filter(function (e) {
      if (seen[e.date]) return false;
      seen[e.date] = 1; e.c = c; return true;
    });
  }

  function load(base) {
    return Promise.all([
      fetch(base + "tracker.json?t=" + Math.floor(Date.now() / 60000)).then(function (r) { return r.json(); }),
      fetch(base + "../data.json?t=" + Math.floor(Date.now() / 600000)).then(function (r) { return r.json(); }).catch(function () { return null; })
    ]);
  }

  function icsEsc(s) { return String(s).replace(/([,;])/g, "\\$1").replace(/\n/g, "\\n"); }
  function downloadICS(tracker) {
    var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//toowani//ai-video-tracker//KO", "CALSCALE:GREGORIAN", "X-WR-CALNAME:AI 영상 공모전"];
    var stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    tracker.contests.filter(function (c) { return c.stage !== "skip"; }).forEach(function (c) {
      eventsOf(c).forEach(function (e) {
        var d = e.date.replace(/-/g, "");
        var next = new Date(e.date + "T00:00:00"); next.setDate(next.getDate() + 1);
        var link = "https://toowani.com/contests/ai-video/questions/#" + c.id;
        lines.push("BEGIN:VEVENT",
          "UID:" + c.id.replace(/[^\w-]/g, "_") + "-" + e.kind + "-" + d + "@toowani.com",
          "DTSTAMP:" + stamp,
          "DTSTART;VALUE=DATE:" + d, "DTEND;VALUE=DATE:" + toISO(next).replace(/-/g, ""),
          "SUMMARY:" + icsEsc("[" + KIND_LABEL[e.kind] + "] " + shortName(c) + (e.kind === "other" ? " · " + e.text : "")),
          "DESCRIPTION:" + icsEsc(c.title + " — " + e.text + "\n" + link),
          "URL:" + link,
          // 전날 오전 9시에 알림
          "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsEsc(shortName(c)), "TRIGGER:-PT15H", "END:VALARM",
          "END:VEVENT");
      });
    });
    lines.push("END:VCALENDAR");
    var blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "ai-video-contests.ics";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  window.AIV = {
    STAGES: STAGES, STAGE_HINT: STAGE_HINT, KIND_LABEL: KIND_LABEL,
    $: $, lsGet: lsGet, lsSet: lsSet, esc: esc, pad: pad, isISO: isISO, toISO: toISO, todayISO: todayISO,
    daysUntil: daysUntil, ddayText: ddayText, won: won, stageIndex: stageIndex, stageName: stageName,
    stageBars: stageBars, shortName: shortName, isNew: isNew, newBadge: newBadge, toast: toast, initTheme: initTheme, initWidth: initWidth, eventsOf: eventsOf,
    load: load, downloadICS: downloadICS
  };
})();
