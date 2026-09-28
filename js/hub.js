/* ============================================================
   WANI.SYS — PROJECT HUB CONTROLLER
   projects.json을 읽어 카드 그리드를 그리고, 테마를 토글합니다.
   마크업은 party4life의 .entry-card 구조를 따른다.
   ============================================================ */
(function () {
  "use strict";

  var $ = function (s) { return document.querySelector(s); };
  var body = document.body;

  /* ---------- 라이트/다크 테마 ---------- */
  var theme = localStorage.getItem("wani-hub-theme") || "dark";
  if (theme === "light") body.dataset.theme = "light";

  var themeBtn = $("#btn-theme");
  function syncThemeBtn() {
    themeBtn.textContent = theme === "light" ? "◐ Dark" : "◐ Light";
  }
  syncThemeBtn();
  themeBtn.addEventListener("click", function () {
    theme = theme === "dark" ? "light" : "dark";
    localStorage.setItem("wani-hub-theme", theme);
    if (theme === "light") body.dataset.theme = "light";
    else delete body.dataset.theme;
    syncThemeBtn();
  });

  /* ---------- 프로젝트 카드 렌더 ---------- */
  // status(live/dev)와 access(public/private)는 서로 다른 축이라 분리한다
  // (auth-design.md 10절) — 예: STATUS는 dev이면서 동시에 access:private.
  var STATUS_LABEL = { dev: "개발중" };
  var ACCESS_LABEL = { private: "비공개" };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function cardEl(p, i) {
    var locked = p.access === "private";
    // private이어도 링크는 살려둔다 — 차단 여부는 목적지 사이트가
    // auth.toowani.com/authorize로 직접 판단한다(허브는 판단하지 않음).
    // 배지는 안내일 뿐이다.
    var a = el("a", "entry-card" + (locked ? " locked" : ""));
    a.href = p.url;
    if (!/^https?:\/\/toowani\.com\//.test(p.url)) { a.target = "_blank"; a.rel = "noopener"; }

    var numRow = el("div", "num-row");
    numRow.appendChild(el("span", "num", String(i + 1).padStart(2, "0")));
    if (p.status === "dev") numRow.appendChild(el("span", "badge badge-dev", STATUS_LABEL.dev));
    if (locked) numRow.appendChild(el("span", "badge badge-private", "🔒 " + ACCESS_LABEL.private));
    a.appendChild(numRow);

    a.appendChild(el("h2", "gothic", p.name || "?"));
    a.appendChild(el("p", null, p.description || ""));

    if (p.tags && p.tags.length) {
      var tags = el("div", "tags");
      p.tags.forEach(function (t) { tags.appendChild(el("span", null, t)); });
      a.appendChild(tags);
    }
    a.appendChild(el("span", "cta", "Enter →"));
    return a;
  }

  /* ---------- 로그인 상태 (C 패턴, auth-design.md 9절) ---------- */
  var authWidget = $("#auth-widget");
  function renderAuth(session) {
    authWidget.textContent = "";
    if (session && session.email) {
      // textContent -- never innerHTML -- so name(Google 계정 표시 이름,
      // 임의 문자열)이 그대로 들어와도 HTML로 해석되지 않는다.
      var name = el("span", "auth-name", session.name || session.email.split("@")[0]);
      name.title = session.email;
      authWidget.appendChild(name);
      var out = el("a", null, "로그아웃");
      out.href = "https://auth.toowani.com/logout?redirect=" + encodeURIComponent(location.href);
      authWidget.appendChild(out);
    } else {
      var login = el("a", null, "로그인");
      login.href = "https://auth.toowani.com/login?redirect=" + encodeURIComponent(location.href);
      authWidget.appendChild(login);
    }
  }
  fetch("https://auth.toowani.com/me", { credentials: "include" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(renderAuth)
    .catch(function () { renderAuth(null); });

  fetch("projects.json")
    .then(function (r) { return r.json(); })
    .then(function (list) {
      var grid = $("#project-grid");
      grid.textContent = "";
      var visible = list.filter(function (p) { return p.public !== false; });
      if (!visible.length) { grid.appendChild(el("p", "empty-note", "준비 중입니다.")); return; }
      visible.forEach(function (p, i) { grid.appendChild(cardEl(p, i)); });
    })
    .catch(function () {
      $("#project-grid").textContent = "";
      $("#project-grid").appendChild(el("p", "empty-note", "프로젝트 목록을 불러오지 못했습니다."));
    });
})();
