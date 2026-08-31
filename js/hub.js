/* ============================================================
   WANI.SYS — PROJECT HUB CONTROLLER
   projects.json을 읽어 카드 그리드를 그리고, 테마를 토글합니다.
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
    themeBtn.textContent = theme === "light" ? "◐ DARK" : "◐ LIGHT";
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

  function badgeHTML(p) {
    var html = "";
    if (p.status === "dev") html += '<span class="badge badge-dev">' + STATUS_LABEL.dev + "</span>";
    if (p.access === "private") html += '<span class="badge badge-private">🔒 ' + ACCESS_LABEL.private + "</span>";
    return html;
  }

  function cardHTML(p) {
    var locked = p.access === "private";
    var initial = p.name ? p.name.trim().slice(0, 1).toUpperCase() : "?";
    var thumb = p.thumbnail
      ? '<div class="card-thumb"><img src="' + p.thumbnail + '" alt=""></div>'
      : '<div class="card-thumb">' + initial + "</div>";
    // private이어도 링크는 살려둔다 — 차단 여부는 목적지 사이트가
    // auth.toowani.com/authorize로 직접 판단한다(허브는 판단하지 않음).
    // 배지는 안내일 뿐이다.
    var link = '<a class="card-link" href="' + p.url + '" target="_blank" rel="noopener">바로가기</a>';
    var tags = (p.tags && p.tags.length)
      ? '<div class="card-tags">' + p.tags.map(function (t) { return '<span class="tag">' + t + "</span>"; }).join("") + "</div>"
      : "";

    return (
      '<article class="card' + (locked ? " locked" : "") + '">' +
        thumb +
        '<div class="card-head"><h3 class="card-title">' + p.name + "</h3>" + badgeHTML(p) + "</div>" +
        '<p class="card-desc">' + (p.description || "") + "</p>" +
        tags +
        link +
      "</article>"
    );
  }

  /* ---------- 로그인 상태 (C 패턴, auth-design.md 9절) ---------- */
  var authBtn = $("#btn-auth");
  function renderAuthBtn(session) {
    if (session && session.email) {
      authBtn.textContent = session.email.split("@")[0] + " · 로그아웃";
      authBtn.title = session.email;
      authBtn.onclick = function () {
        location.href = "https://auth.toowani.com/logout?redirect=" + encodeURIComponent(location.href);
      };
    } else {
      authBtn.textContent = "로그인";
      authBtn.removeAttribute("title");
      authBtn.onclick = function () {
        location.href = "https://auth.toowani.com/login?redirect=" + encodeURIComponent(location.href);
      };
    }
  }
  fetch("https://auth.toowani.com/me", { credentials: "include" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(renderAuthBtn)
    .catch(function () { renderAuthBtn(null); });

  fetch("projects.json")
    .then(function (r) { return r.json(); })
    .then(function (list) {
      var visible = list.filter(function (p) { return p.public !== false; });
      $("#project-grid").innerHTML = visible.length
        ? visible.map(cardHTML).join("")
        : '<p class="empty-note">준비 중입니다.</p>';
    })
    .catch(function () {
      $("#project-grid").innerHTML = '<p class="empty-note">프로젝트 목록을 불러오지 못했습니다.</p>';
    });
})();
