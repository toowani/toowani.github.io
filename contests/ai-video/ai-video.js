/* ============================================================
   WANI.SYS — AI VIDEO TRACKER
   tracker.json(Claude가 공고를 읽고 갱신) + ../data.json(레이더 자동 수집)을 읽어
   일정 타임라인 · 대회 보드 · 1등 질문지를 그린다.
   답변은 localStorage에 자동 저장되고, "답변 보내기"로 비공개 저장소 이슈를 연다.
   ============================================================ */
(function () {
  "use strict";

  var ANSWER_REPO = "toowani/ai-video-contest";
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
    answer: "아래 질문에 답해 주세요",
    plan: "Claude가 답변으로 기획 중",
    produce: "영상 생성·편집 중",
    submit: "제출 직전, 마지막 클릭은 직접",
    submitted: "제출 완료, 발표 대기",
    result: "결과 발표됨",
    skip: "이번엔 패스"
  };
  var FILTERS = [
    { key: "all", label: "전체" },
    { key: "answer", label: "답변 대기" },
    { key: "active", label: "진행 중" },
    { key: "submitted", label: "제출·결과" },
    { key: "skip", label: "패스" }
  ];
  var KIND_LABEL = { deadline: "마감", announce: "발표", award: "시상", other: "일정" };

  var $ = function (s, el) { return (el || document).querySelector(s); };
  var body = document.body;
  var tracker = null;
  var filter = "all";

  // ---------- theme (레이더와 같은 키) ----------
  var theme = lsGet("wani-hub-theme") || "dark";
  if (theme === "light") body.dataset.theme = "light";
  var themeBtn = $("#btn-theme");
  function syncThemeBtn() { themeBtn.textContent = theme === "light" ? "◐ Dark" : "◐ Light"; }
  syncThemeBtn();
  themeBtn.addEventListener("click", function () {
    theme = theme === "dark" ? "light" : "dark";
    lsSet("wani-hub-theme", theme);
    if (theme === "light") body.dataset.theme = "light"; else delete body.dataset.theme;
    syncThemeBtn();
  });

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 저장 불가 환경 */ } }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function isISO(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s); }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function daysUntil(iso) {
    var a = new Date(todayISO() + "T00:00:00"), b = new Date(iso + "T00:00:00");
    return Math.round((b - a) / 86400000);
  }
  function ddayText(n) { return n === 0 ? "D-DAY" : n > 0 ? "D-" + n : "D+" + (-n); }
  function mdText(iso) {
    var d = new Date(iso + "T00:00:00");
    return (d.getMonth() + 1) + "/" + d.getDate() + "<small>" + "일월화수목금토"[d.getDay()] + "</small>";
  }
  function won(n) {
    if (!n) return "";
    return n >= 10000 ? (n / 10000).toLocaleString("ko-KR") + "만원" : n.toLocaleString("ko-KR") + "원";
  }
  function stageIndex(key) {
    for (var i = 0; i < STAGES.length; i++) if (STAGES[i].key === key) return i;
    return -1;
  }
  function toast(msg) {
    var t = document.createElement("div");
    t.className = "toast"; t.textContent = msg;
    body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }

  // ---------- answers ----------
  function ansKey(id) { return "wani-aiv-ans:" + id; }
  function sentKey(id) { return "wani-aiv-sent:" + id; }
  function loadAns(id) {
    try { return JSON.parse(lsGet(ansKey(id)) || "[]"); } catch (e) { return []; }
  }
  function answeredCount(c) {
    var a = loadAns(c.id);
    return (c.questions || []).filter(function (_, i) { return a[i] && a[i].trim(); }).length;
  }

  // ---------- load ----------
  Promise.all([
    fetch("tracker.json?t=" + Math.floor(Date.now() / 60000)).then(function (r) { return r.json(); }),
    fetch("../data.json?t=" + Math.floor(Date.now() / 600000)).then(function (r) { return r.json(); }).catch(function () { return null; })
  ]).then(function (res) {
    tracker = res[0];
    render(res[1]);
  }).catch(function (e) {
    $("#updated").textContent = "불러오기 실패: " + e.message;
  });

  function render(radar) {
    var cs = tracker.contests;
    $("#updated").textContent = "보드 갱신 " + (tracker.updatedAt || "?") + " · 대회 " + cs.length + "개";

    var live = cs.filter(function (c) { return c.stage !== "skip"; });
    $("#st-wait").textContent = cs.filter(function (c) { return c.stage === "answer"; }).length;
    $("#st-work").textContent = cs.filter(function (c) { return c.stage === "plan" || c.stage === "produce"; }).length;
    $("#st-submit").textContent = cs.filter(function (c) { return c.stage === "submit"; }).length;
    $("#st-done").textContent = cs.filter(function (c) { return c.stage === "submitted"; }).length;
    $("#st-prize").textContent = won(live.reduce(function (s, c) { return s + (c.firstPrize || 0); }, 0)) || "–";

    renderTimeline(live);
    renderChips();
    renderBoard();
    renderNew(radar);
    openFromHash();
  }

  // ---------- timeline ----------
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
    // 같은 날 같은 대회 일정은 마감 > 발표 > 시상 > 기타 하나만 남긴다
    var seen = {};
    return ev.filter(function (e) {
      if (seen[e.date]) return false;
      seen[e.date] = 1; e.c = c; return true;
    });
  }

  function renderTimeline(live) {
    var ev = [];
    live.forEach(function (c) { ev = ev.concat(eventsOf(c)); });
    // 이미 제출한 대회의 마감은 숨기고, 아직 할 일이 남은 일정만 남긴다
    ev = ev.filter(function (e) {
      var n = daysUntil(e.date);
      if (n < -7) return false;
      if (e.kind === "deadline" && stageIndex(e.c.stage) >= stageIndex("submitted")) return false;
      return true;
    });
    ev.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });

    var el = $("#timeline");
    if (!ev.length) { el.innerHTML = '<p class="empty-note">예정된 일정이 없어요.</p>'; return; }
    var html = "", lastGroup = "";
    ev.forEach(function (e) {
      var n = daysUntil(e.date);
      var g = n < 0 ? "지난 7일" : n < 7 ? "이번 7일" : n < 14 ? "다음 7일" : n < 31 ? "한 달 안" : "그 이후";
      if (g !== lastGroup) { html += '<div class="tl-week">' + g + "</div>"; lastGroup = g; }
      var st = e.c.stage === "answer" ? ' <span class="stage-mini s-wait">답변 대기</span>' : "";
      html += '<div class="tl-row' + (n < 0 ? " past" : "") + '" data-id="' + esc(e.c.id) + '">' +
        '<div class="tl-date">' + mdText(e.date) + "</div>" +
        '<div class="tl-kind k-' + e.kind + '">' + esc(e.text) + "</div>" +
        '<div class="tl-dday' + (n >= 0 && n <= 3 ? " hot" : "") + '">' + ddayText(n) + "</div>" +
        '<div class="tl-title">' + esc(e.c.title) + st + "</div></div>";
    });
    // 날짜가 공고에 확정되지 않은 발표일
    var vague = live.filter(function (c) { return c.announceDate && !isISO(c.announceDate); });
    if (vague.length) {
      html += '<div class="tl-week">발표일 미확정</div>';
      vague.forEach(function (c) {
        html += '<div class="tl-row" data-id="' + esc(c.id) + '"><div class="tl-date">–</div>' +
          '<div class="tl-kind k-announce">결과 발표</div><div class="tl-dday">' + esc(c.announceDate) + "</div>" +
          '<div class="tl-title">' + esc(c.title) + "</div></div>";
      });
    }
    el.innerHTML = html;
    Array.prototype.forEach.call(el.querySelectorAll(".tl-row"), function (row) {
      row.addEventListener("click", function () { openCard(row.dataset.id); });
    });
  }

  // ---------- board ----------
  function renderChips() {
    var el = $("#chips-stage");
    el.innerHTML = '<span class="chips-label">단계</span>' + FILTERS.map(function (f) {
      return '<button class="chip' + (f.key === filter ? " on" : "") + '" data-f="' + f.key + '">' + f.label +
        '<span class="n">' + matchFilter(f.key).length + "</span></button>";
    }).join("");
    Array.prototype.forEach.call(el.querySelectorAll(".chip"), function (b) {
      b.addEventListener("click", function () { filter = b.dataset.f; renderChips(); renderBoard(); });
    });
  }

  function matchFilter(key) {
    return tracker.contests.filter(function (c) {
      if (key === "all") return true;
      if (key === "answer") return c.stage === "answer";
      if (key === "active") return ["analysis", "plan", "produce", "submit"].indexOf(c.stage) >= 0;
      if (key === "submitted") return c.stage === "submitted" || c.stage === "result";
      return c.stage === key;
    });
  }

  var PRIO_ORDER = { S: 0, A: 1, B: 2 };
  function renderBoard() {
    var list = matchFilter(filter).slice().sort(function (a, b) {
      var sa = a.stage === "skip" ? 1 : 0, sb = b.stage === "skip" ? 1 : 0;
      if (sa !== sb) return sa - sb;
      var pa = PRIO_ORDER[a.priority] != null ? PRIO_ORDER[a.priority] : 9;
      var pb = PRIO_ORDER[b.priority] != null ? PRIO_ORDER[b.priority] : 9;
      if (pa !== pb) return pa - pb;
      return (a.applyEnd || "9") < (b.applyEnd || "9") ? -1 : 1;
    });
    var el = $("#board");
    if (!list.length) { el.innerHTML = '<p class="empty-note">이 단계의 대회가 없어요.</p>'; return; }
    el.innerHTML = list.map(cardHTML).join("");
    list.forEach(bindCard);
  }

  function cardHTML(c) {
    var n = isISO(c.applyEnd) ? daysUntil(c.applyEnd) : null;
    var cls = n == null ? "unk" : n < 0 ? "over" : n <= 1 ? "d1" : n <= 3 ? "d3" : n <= 7 ? "d7" : "";
    var si = stageIndex(c.stage);
    var bars = STAGES.map(function (s, i) {
      return "<span class=\"" + (c.stage === "skip" ? "" : i < si ? "on" : i === si ? "cur" : "") + "\" title=\"" + s.label + "\"></span>";
    }).join("");
    var stageName = c.stage === "skip" ? "패스" : (STAGES[si] ? STAGES[si].label : c.stage);
    var qn = (c.questions || []).length, an = answeredCount(c);
    var ansTag = c.stage === "answer" && qn ? ' <span class="tag">답변 ' + an + "/" + qn + "</span>" : "";

    return '<details class="card' + (c.stage === "skip" ? " skip" : "") + '" id="c-' + esc(c.id) + '" data-id="' + esc(c.id) + '">' +
      "<summary>" +
        '<div class="dday ' + cls + '">' + (n == null ? "미정" : ddayText(n)) + "<small>" + (isISO(c.applyEnd) ? c.applyEnd.slice(5).replace("-", "/") + " 마감" : "") + "</small></div>" +
        '<div class="head">' +
          '<div class="title-line">' + (c.priority ? '<span class="prio p-' + esc(c.priority) + '">' + esc(c.priority) + "</span>" : "") +
            '<span class="title">' + esc(c.title) + "</span></div>" +
          '<div class="sub"><span class="host">' + esc(c.host) + "</span>" +
            (c.announceDate ? '<span class="period">발표 <b>' + esc(c.announceDate) + "</b></span>" : "") + "</div>" +
          '<div class="stages">' + bars + "</div>" +
          '<div class="tags"><span class="stage-label">' + esc(stageName) + "</span>" +
            '<span class="tag">' + esc(STAGE_HINT[c.stage] || "") + "</span>" + ansTag +
            (c.eligible && c.eligible !== "가능" ? '<span class="tag reason">자격 ' + esc(c.eligible) + "</span>" : "") + "</div>" +
        "</div>" +
        '<div class="prize">' + (c.firstPrize ? "1등 " + won(c.firstPrize) : "") + "</div>" +
      "</summary>" +
      '<div class="body">' + detailHTML(c) + "</div>" +
    "</details>";
  }

  function detailHTML(c) {
    var f = c.format || {};
    var fmt = [f.length, f.ratio, f.resolution, f.fileType, f.other].filter(Boolean).join(" · ");
    var rows = [
      ["주제", c.theme],
      ["형식", fmt],
      ["참가 자격", [c.eligibility, c.eligibilityReason ? "→ " + c.eligibilityReason : ""].filter(Boolean).join(" ")],
      ["제출 방법", c.submission],
      ["필수 표기", (c.mustInclude || []).join(" / ")],
      ["AI 규정", c.aiRules],
      ["상금", c.prizes],
      ["일정", (c.milestones || []).map(function (m) { return m.date + " " + m.label; }).join(" · ")]
    ].filter(function (r) { return r[1]; });
    var html = '<dl class="kv">' + rows.map(function (r) { return "<dt>" + r[0] + "</dt><dd>" + esc(r[1]) + "</dd>"; }).join("") +
      (c.officialUrl ? '<dt>공고 원문</dt><dd><a href="' + esc(c.officialUrl) + '" target="_blank" rel="noopener">' + esc(c.officialUrl) + "</a></dd>" : "") +
      "</dl>";
    if (c.result) html += '<div class="note-box insight"><b>결과</b>' + esc(c.result) + "</div>";
    if (c.note) html += '<div class="note-box"><b>CLAUDE 메모</b>' + esc(c.note) + "</div>";
    if (c.winInsight) html += '<div class="note-box insight"><b>1등을 가르는 것</b>' + esc(c.winInsight) + "</div>";
    if (c.judging && c.judging.length) {
      html += '<table class="judging">' + c.judging.map(function (j) {
        return "<tr><td>" + esc(j.item) + (j.detail ? '<br><span class="why">' + esc(j.detail) + "</span>" : "") +
          '</td><td class="w">' + esc(j.weight == null ? "" : j.weight) + "</td></tr>";
      }).join("") + "</table>";
    }
    if (c.questions && c.questions.length && c.stage !== "skip") html += questionsHTML(c);
    return html;
  }

  function questionsHTML(c) {
    var a = loadAns(c.id), sent = lsGet(sentKey(c.id));
    return '<div class="qs">' +
      '<div class="qs-head"><h3>1등을 위해 답할 질문</h3><span class="qs-progress">' + answeredCount(c) + "/" + c.questions.length + " 답변</span></div>" +
      c.questions.map(function (q, i) {
        return '<div class="q"><label for="q-' + esc(c.id) + "-" + i + '"><span class="n">Q' + (i + 1) + "</span>" + esc(q.q) + "</label>" +
          (q.why ? '<span class="why">' + esc(q.why) + "</span>" : "") +
          '<textarea id="q-' + esc(c.id) + "-" + i + '" data-i="' + i + '" placeholder="정답은 없어요. 떠오르는 대로, 구체적인 장면일수록 좋아요.">' + esc(a[i] || "") + "</textarea></div>";
      }).join("") +
      '<div class="qs-actions"><button class="act go" data-send>답변 보내기</button>' +
        '<button class="act" data-copy>복사만</button>' +
        (sent ? '<span class="sent-badge">✓ ' + esc(sent) + " 보냄</span>" : '<span class="hint">답변은 이 브라우저에 자동 저장돼요.</span>') +
      "</div></div>";
  }

  function bindCard(c) {
    var card = document.getElementById("c-" + c.id);
    if (!card) return;
    Array.prototype.forEach.call(card.querySelectorAll("textarea"), function (ta) {
      ta.addEventListener("input", function () {
        var a = loadAns(c.id);
        a[+ta.dataset.i] = ta.value;
        lsSet(ansKey(c.id), JSON.stringify(a));
        var p = card.querySelector(".qs-progress");
        if (p) p.textContent = answeredCount(c) + "/" + c.questions.length + " 답변";
      });
    });
    var send = card.querySelector("[data-send]"), copy = card.querySelector("[data-copy]");
    if (send) send.addEventListener("click", function () { sendAnswers(c); });
    if (copy) copy.addEventListener("click", function () { copyText(answersMarkdown(c)).then(function (ok) { toast(ok ? "답변을 복사했어요" : "복사하지 못했어요"); }); });
  }

  function answersMarkdown(c) {
    var a = loadAns(c.id);
    return "<!-- contest-id: " + c.id + " -->\n" +
      "# " + c.title + "\n\n" +
      c.questions.map(function (q, i) {
        return "## Q" + (i + 1) + ". " + q.q + "\n\n" + ((a[i] || "").trim() || "(답변 없음)");
      }).join("\n\n") + "\n";
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return false; });
    }
    return Promise.resolve(false);
  }

  function sendAnswers(c) {
    if (!answeredCount(c)) { toast("먼저 질문에 답해 주세요"); return; }
    var md = answersMarkdown(c);
    var title = "[답변] " + c.title;
    var base = "https://github.com/" + ANSWER_REPO + "/issues/new?labels=answer&title=" + encodeURIComponent(title);
    var url = base + "&body=" + encodeURIComponent(md);
    copyText(md).then(function (copied) {
      // 너무 긴 답변은 URL에 실리지 않으니, 클립보드에 담고 붙여넣기를 안내한다
      if (url.length > 7500) {
        url = base + "&body=" + encodeURIComponent("<!-- contest-id: " + c.id + " -->\n(클립보드에 복사된 답변을 여기에 붙여넣어 주세요)");
        toast(copied ? "답변이 길어서 클립보드에 담았어요. 이슈 본문에 붙여넣어 주세요" : "답변이 길어요. '복사만'으로 복사해 붙여넣어 주세요");
      }
      window.open(url, "_blank", "noopener");
      var stamp = todayISO();
      lsSet(sentKey(c.id), stamp);
      var actions = document.querySelector("#c-" + CSS.escape(c.id) + " .qs-actions");
      var badge = actions && actions.querySelector(".sent-badge, .hint");
      if (badge) { badge.className = "sent-badge"; badge.textContent = "✓ " + stamp + " 보냄"; }
    });
  }

  function openCard(id) {
    if (filter !== "all" && !matchFilter(filter).some(function (c) { return c.id === id; })) {
      filter = "all"; renderChips(); renderBoard();
    }
    var card = document.getElementById("c-" + id);
    if (!card) return;
    card.open = true;
    card.scrollIntoView({ block: "start" });
    card.classList.add("flash");
    setTimeout(function () { card.classList.remove("flash"); }, 1600);
    history.replaceState(null, "", "#" + id);
  }
  function openFromHash() {
    var id = decodeURIComponent(location.hash.slice(1));
    // 브라우저의 스크롤 복원이 끝난 뒤에 열어야 위치가 덮이지 않는다
    if (id) setTimeout(function () { openCard(id); }, 80);
  }

  // ---------- 아직 분석하지 않은 AI 영상 공모전 ----------
  function renderNew(radar) {
    if (!radar) return;
    var items = radar.items || Object.keys(radar).map(function (k) { return radar[k]; }).filter(Array.isArray)[0] || [];
    var known = {};
    tracker.contests.forEach(function (c) { (c.sourceIds || []).concat([c.id]).forEach(function (s) { known[s] = 1; }); });
    (tracker.ignoredIds || []).forEach(function (s) { known[s] = 1; });
    var today = todayISO();
    var fresh = items.filter(function (i) {
      var video = (i.tags || []).indexOf("video") >= 0 || /영상|숏폼|뮤직비디오|MV|필름/.test(i.title || "");
      var ai = /AI|인공지능|생성형/i.test((i.title || "") + " " + (i.tags || []).join(" "));
      return video && ai && !known[i.id] && (!i.applyEnd || i.applyEnd >= today);
    }).sort(function (a, b) { return (a.applyEnd || "9") < (b.applyEnd || "9") ? -1 : 1; });
    if (!fresh.length) return;
    $("#new-block").hidden = false;
    $("#new-list").innerHTML = fresh.map(function (i) {
      return '<div class="new-row"><span class="d">' + (i.applyEnd ? ddayText(daysUntil(i.applyEnd)) : "미정") + "</span>" +
        '<a href="' + esc(i.officialUrl || i.url) + '" target="_blank" rel="noopener">' + esc(i.title) + "</a>" +
        '<span class="tag">' + esc(i.host || "") + "</span></div>";
    }).join("");
  }

  // ---------- 캘린더(.ics) ----------
  $("#btn-ics").addEventListener("click", function () {
    if (!tracker) return;
    var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//toowani//ai-video-tracker//KO", "CALSCALE:GREGORIAN", "X-WR-CALNAME:AI 영상 공모전"];
    var stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    tracker.contests.filter(function (c) { return c.stage !== "skip"; }).forEach(function (c) {
      eventsOf(c).forEach(function (e) {
        var d = e.date.replace(/-/g, "");
        var next = new Date(e.date + "T00:00:00"); next.setDate(next.getDate() + 1);
        var d2 = next.getFullYear() + pad(next.getMonth() + 1) + pad(next.getDate());
        lines.push("BEGIN:VEVENT",
          "UID:" + c.id.replace(/[^\w-]/g, "_") + "-" + e.kind + "-" + d + "@toowani.com",
          "DTSTAMP:" + stamp,
          "DTSTART;VALUE=DATE:" + d, "DTEND;VALUE=DATE:" + d2,
          "SUMMARY:" + icsEsc("[" + KIND_LABEL[e.kind] + "] " + c.title + (e.kind === "other" ? " · " + e.text : "")),
          "DESCRIPTION:" + icsEsc(e.text + "\\nhttps://toowani.com/contests/ai-video/#" + c.id),
          "URL:https://toowani.com/contests/ai-video/#" + c.id,
          // 전날 오전 9시에 알림
          "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsEsc(c.title), "TRIGGER:-PT15H", "END:VALARM",
          "END:VEVENT");
      });
    });
    lines.push("END:VCALENDAR");
    var blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "ai-video-contests.ics";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });
  function icsEsc(s) { return String(s).replace(/([,;])/g, "\\$1").replace(/\n/g, "\\n"); }
})();
