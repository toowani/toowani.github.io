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
  var STATUS_LABEL = { dev: "개발중", private: "비공개" };

  function badgeHTML(status) {
    if (status === "dev") return '<span class="badge badge-dev">' + STATUS_LABEL.dev + "</span>";
    if (status === "private") return '<span class="badge badge-private">🔒 ' + STATUS_LABEL.private + "</span>";
    return "";
  }

  function cardHTML(p) {
    var locked = p.status === "private";
    var initial = p.name ? p.name.trim().slice(0, 1).toUpperCase() : "?";
    var thumb = p.thumbnail
      ? '<div class="card-thumb"><img src="' + p.thumbnail + '" alt=""></div>'
      : '<div class="card-thumb">' + initial + "</div>";
    var link = locked
      ? '<span class="card-link disabled">비공개</span>'
      : '<a class="card-link" href="' + p.url + '" target="_blank" rel="noopener">바로가기</a>';
    var tags = (p.tags && p.tags.length)
      ? '<div class="card-tags">' + p.tags.map(function (t) { return '<span class="tag">' + t + "</span>"; }).join("") + "</div>"
      : "";

    return (
      '<article class="card' + (locked ? " locked" : "") + '">' +
        thumb +
        '<div class="card-head"><h3 class="card-title">' + p.name + "</h3>" + badgeHTML(p.status) + "</div>" +
        '<p class="card-desc">' + (p.description || "") + "</p>" +
        tags +
        link +
      "</article>"
    );
  }

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
