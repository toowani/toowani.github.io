/* ============================================================
   WANI.SYS — AI VIDEO TRACKER · 질문 · 답변 페이지
   왼쪽 대회 목록에서 고르면 오른쪽에 공고 요약 + 1등 질문지를 보여준다.
   답변은 localStorage에 자동 저장되고, "답변 보내기"로 비공개 저장소 이슈를 연다.
   ============================================================ */
(function () {
  "use strict";
  var A = window.AIV, $ = A.$, esc = A.esc;
  var ANSWER_REPO = "toowani/ai-video-contest";
  var PRIO_ORDER = { S: 0, A: 1, B: 2 };
  var tracker = null, list = [], current = null;

  A.initTheme();
  A.initWidth();

  A.load("../").then(function (res) {
    tracker = res[0];
    // 패스한 대회는 빼고, 답변 대기 → 그 밖의 진행 중 → 제출 끝난 순서
    list = tracker.contests.filter(function (c) { return c.stage !== "skip"; }).sort(function (a, b) {
      var ga = group(a), gb = group(b);
      if (ga !== gb) return ga - gb;
      var pa = PRIO_ORDER[a.priority] != null ? PRIO_ORDER[a.priority] : 9;
      var pb = PRIO_ORDER[b.priority] != null ? PRIO_ORDER[b.priority] : 9;
      if (pa !== pb) return pa - pb;
      return (a.applyEnd || "9") < (b.applyEnd || "9") ? -1 : 1;
    });
    var wait = list.filter(function (c) { return c.stage === "answer"; }).length;
    $("#tab-wait").textContent = wait || "";
    var id = decodeURIComponent(location.hash.slice(1));
    select(list.some(function (c) { return c.id === id; }) ? id : (list[0] && list[0].id), false);
    window.addEventListener("hashchange", function () { select(decodeURIComponent(location.hash.slice(1)), false); });
  }).catch(function (e) {
    $("#qa-side").innerHTML = '<p class="empty-note">불러오기 실패: ' + esc(e.message) + "</p>";
  });

  function group(c) {
    if (c.stage === "answer") return 0;
    return A.stageIndex(c.stage) >= A.stageIndex("submitted") ? 2 : 1;
  }

  // ---------- answers ----------
  function ansKey(id) { return "wani-aiv-ans:" + id; }
  function sentKey(id) { return "wani-aiv-sent:" + id; }
  function loadAns(id) {
    try { return JSON.parse(A.lsGet(ansKey(id)) || "[]"); } catch (e) { return []; }
  }
  function answeredCount(c) {
    var a = loadAns(c.id);
    return (c.questions || []).filter(function (_, i) { return a[i] && a[i].trim(); }).length;
  }

  // ---------- sidebar ----------
  var GROUP_LABEL = ["답변 대기", "진행 중", "제출 완료"];
  function renderSide() {
    var html = "", last = -1;
    list.forEach(function (c) {
      var g = group(c);
      if (g !== last) { html += '<div class="qa-group">' + GROUP_LABEL[g] + "</div>"; last = g; }
      var n = A.isISO(c.applyEnd) ? A.daysUntil(c.applyEnd) : null;
      var qn = (c.questions || []).length, an = answeredCount(c);
      var sent = A.lsGet(sentKey(c.id));
      var badge = g === 0 && qn ? (sent ? '<span class="qa-badge ok">보냄</span>' : '<span class="qa-badge' + (an === qn ? " ok" : "") + '">' + an + "/" + qn + "</span>")
        : '<span class="qa-badge dim">' + esc(A.stageName(c)) + "</span>";
      html += '<a class="qa-item' + (current && current.id === c.id ? " on" : "") + '" href="#' + esc(c.id) + '">' +
        '<span class="qa-dd' + (g < 2 && n != null && n <= 7 ? " hot" : "") + '">' + (g === 2 || n == null ? "–" : A.ddayText(n)) + "</span>" +
        '<span class="qa-name"><b>' + A.newBadge(c) + (c.priority ? '<span class="prio p-' + esc(c.priority) + '">' + esc(c.priority) + "</span> " : "") + esc(A.shortName(c)) + "</b>" +
          '<small>' + esc(c.title) + "</small></span>" +
        badge + "</a>";
    });
    $("#qa-side").innerHTML = html;
  }

  function select(id, scroll) {
    var c = list.filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    current = c;
    if (location.hash.slice(1) !== id) history.replaceState(null, "", "#" + id);
    renderSide();
    renderMain(c);
    // 좁은 화면에선 목록이 위에 있으니 본문으로 내려준다
    if (scroll !== false || window.innerWidth <= 860) {
      if (window.innerWidth <= 860 && location.hash) $("#qa-main").scrollIntoView({ block: "start" });
    }
  }

  // ---------- main ----------
  function renderMain(c) {
    var n = A.isISO(c.applyEnd) ? A.daysUntil(c.applyEnd) : null;
    var f = c.format || {};
    var fmt = [f.length, f.ratio, f.resolution, f.fileType].filter(Boolean).join(" · ");
    var html = '<header class="qa-head">' +
      '<div class="title-line">' + A.newBadge(c) + (c.priority ? '<span class="prio p-' + esc(c.priority) + '">' + esc(c.priority) + "</span>" : "") +
        '<h2 class="qa-title">' + esc(c.title) + "</h2></div>" +
      '<div class="sub"><span class="host">' + esc(c.host) + "</span>" +
        (A.isISO(c.applyEnd) ? '<span class="period">마감 <b>' + c.applyEnd.slice(5).replace("-", "/") + (c.applyEndTime ? " " + esc(c.applyEndTime) : "") + "</b> (" + A.ddayText(n) + ")</span>" : "") +
        (c.announceDate ? '<span class="period">발표 <b>' + esc(c.announceDate) + "</b></span>" : "") +
        (c.firstPrize ? '<span class="prize">1등 ' + A.won(c.firstPrize) + "</span>" : "") + "</div>" +
      A.stageBars(c) +
      '<div class="tags"><span class="stage-label">' + esc(A.stageName(c)) + "</span><span class=\"tag\">" + esc(A.STAGE_HINT[c.stage] || "") + "</span></div>" +
    "</header>";

    html += '<dl class="kv brief">' +
      (c.theme ? "<dt>주제</dt><dd>" + esc(c.theme) + "</dd>" : "") +
      (fmt ? "<dt>형식</dt><dd>" + esc(fmt) + "</dd>" : "") + "</dl>";
    if (c.winInsight) html += '<div class="note-box insight"><b>1등을 가르는 것</b>' + esc(c.winInsight) + "</div>";
    if (c.note) html += '<div class="note-box"><b>CLAUDE 메모</b>' + esc(c.note) + "</div>";
    if (c.result) html += '<div class="note-box insight"><b>결과</b>' + esc(c.result) + "</div>";
    html += winnersHTML(c.pastWinners);

    if (c.questions && c.questions.length) html += questionsHTML(c);
    else html += '<p class="day-empty">이 대회는 따로 답할 질문이 없어요. 진행 상황만 확인하세요.</p>';

    html += detailsHTML(c);
    $("#qa-main").innerHTML = html;
    bindQuestions(c);
  }

  // 이전 수상작 분석: 패턴은 펼쳐 두고, 작품 목록은 접어 둔다
  function winnersHTML(w) {
    if (!w) return "";
    function list(title, cls, items) {
      return items && items.length ? '<div class="pw-col ' + cls + '"><h4>' + title + "</h4><ul>" +
        items.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ul></div>" : "";
    }
    var works = (w.works || []).map(function (x) {
      var t = esc(x.title || "제목 미상");
      if (x.url) t = '<a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + t + "</a>";
      return "<tr><td class=\"pw-meta\">" + esc([x.year, x.award].filter(Boolean).join(" ")) +
        (x.length ? '<br><span class="why">' + esc(x.length) + "</span>" : "") +
        "</td><td>" + t + (x.what ? '<br><span class="why">' + esc(x.what) + "</span>" : "") + "</td></tr>";
    }).join("");
    return '<section class="pw">' +
      '<div class="pw-head"><h3>이전 수상작 분석</h3>' + (w.scope ? '<p class="pw-scope">' + esc(w.scope) + "</p>" : "") + "</div>" +
      '<div class="pw-grid">' + list("이긴 작품의 공통점", "win", w.patterns) + list("묻히는 패턴 (피할 것)", "avoid", w.avoid) +
        list("이번 대회만의 레버", "lever", w.levers) + "</div>" +
      (works ? '<details class="low-details pw-works"><summary>분석한 작품 ' + w.works.length + "편</summary><table class=\"judging\">" + works + "</table></details>" : "") +
      "</section>";
  }

  function detailsHTML(c) {
    var rows = [
      ["참가 자격", [c.eligibility, c.eligibilityReason ? "→ " + c.eligibilityReason : ""].filter(Boolean).join(" ")],
      ["제출 방법", c.submission],
      ["필수 표기", (c.mustInclude || []).join(" / ")],
      ["AI 규정", c.aiRules],
      ["상금", c.prizes],
      ["형식 기타", (c.format || {}).other],
      ["일정", (c.milestones || []).map(function (m) { return m.date + " " + m.label; }).join(" · ")],
      ["확인 못 한 것", (c.unknowns || []).join(" / ")]
    ].filter(function (r) { return r[1]; });
    var judging = c.judging && c.judging.length ? '<table class="judging">' + c.judging.map(function (j) {
      return "<tr><td>" + esc(j.item) + (j.detail ? '<br><span class="why">' + esc(j.detail) + "</span>" : "") +
        '</td><td class="w">' + esc(j.weight == null ? "" : j.weight) + "</td></tr>";
    }).join("") + "</table>" : "";
    return '<details class="low-details qa-details"><summary>공고 상세 · 심사 배점</summary>' +
      judging +
      '<dl class="kv">' + rows.map(function (r) { return "<dt>" + r[0] + "</dt><dd>" + esc(r[1]) + "</dd>"; }).join("") +
      (c.officialUrl ? '<dt>공고 원문</dt><dd><a href="' + esc(c.officialUrl) + '" target="_blank" rel="noopener">' + esc(c.officialUrl) + "</a></dd>" : "") +
      "</dl></details>";
  }

  function questionsHTML(c) {
    var a = loadAns(c.id), sent = A.lsGet(sentKey(c.id));
    return '<div class="qs">' +
      '<div class="qs-head"><h3>1등을 위해 답할 질문</h3><span class="qs-progress">' + answeredCount(c) + "/" + c.questions.length + " 답변</span></div>" +
      c.questions.map(function (q, i) {
        return '<div class="q"><label for="q-' + i + '"><span class="n">Q' + (i + 1) + "</span>" + esc(q.q) + "</label>" +
          (q.why ? '<span class="why">' + esc(q.why) + "</span>" : "") +
          '<textarea id="q-' + i + '" data-i="' + i + '" placeholder="정답은 없어요. 떠오르는 대로, 구체적인 장면일수록 좋아요.">' + esc(a[i] || "") + "</textarea></div>";
      }).join("") +
      '<div class="qs-actions"><button class="act go" data-send>답변 보내기</button>' +
        '<button class="act" data-copy>복사만</button>' +
        (sent ? '<span class="sent-badge">✓ ' + esc(sent) + " 보냄</span>" : '<span class="hint">답변은 이 브라우저에 자동 저장돼요.</span>') +
      "</div></div>";
  }

  function bindQuestions(c) {
    var root = $("#qa-main");
    Array.prototype.forEach.call(root.querySelectorAll("textarea"), function (ta) {
      ta.addEventListener("input", function () {
        var a = loadAns(c.id);
        a[+ta.dataset.i] = ta.value;
        A.lsSet(ansKey(c.id), JSON.stringify(a));
        $(".qs-progress", root).textContent = answeredCount(c) + "/" + c.questions.length + " 답변";
        renderSide();
      });
    });
    var send = root.querySelector("[data-send]"), copy = root.querySelector("[data-copy]");
    if (send) send.addEventListener("click", function () { sendAnswers(c); });
    if (copy) copy.addEventListener("click", function () {
      copyText(answersMarkdown(c)).then(function (ok) { A.toast(ok ? "답변을 복사했어요" : "복사하지 못했어요"); });
    });
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
    if (!answeredCount(c)) { A.toast("먼저 질문에 답해 주세요"); return; }
    var md = answersMarkdown(c);
    var base = "https://github.com/" + ANSWER_REPO + "/issues/new?labels=answer&title=" + encodeURIComponent("[답변] " + c.title);
    var url = base + "&body=" + encodeURIComponent(md);
    copyText(md).then(function (copied) {
      // 너무 긴 답변은 URL에 실리지 않으니, 클립보드에 담고 붙여넣기를 안내한다
      if (url.length > 7500) {
        url = base + "&body=" + encodeURIComponent("<!-- contest-id: " + c.id + " -->\n(클립보드에 복사된 답변을 여기에 붙여넣어 주세요)");
        A.toast(copied ? "답변이 길어서 클립보드에 담았어요. 이슈 본문에 붙여넣어 주세요" : "답변이 길어요. '복사만'으로 복사해 붙여넣어 주세요");
      }
      window.open(url, "_blank", "noopener");
      var stamp = A.todayISO();
      A.lsSet(sentKey(c.id), stamp);
      var badge = $("#qa-main .qs-actions .sent-badge, #qa-main .qs-actions .hint");
      if (badge) { badge.className = "sent-badge"; badge.textContent = "✓ " + stamp + " 보냄"; }
      renderSide();
    });
  }
})();
