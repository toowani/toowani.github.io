/* ============================================================
   WANI.SYS — SHARED TOPBAR
   toowani.com이 https://toowani.com/shared/topbar.js?v=1 로 정적 배포.
   각 서브도메인은 <script src="https://toowani.com/shared/topbar.js?v=1"></script>
   한 줄만 삽입. Shadow DOM으로 완전히 격리된 fixed 오버레이 바를 붙인다.

   신뢰 경계: 이 파일은 status/p4l/class 등 여러 서브도메인 안에서 그대로
   실행된다. 외부 스크립트/스타일/폰트 참조 추가 금지, 변경 시 diff 리뷰
   필수. 상세 규칙은 워크스페이스 루트 CLAUDE.md 참고.

   호환: 호스트 페이지 레이아웃은 건드리지 않는다(오버레이 방식). 호스트가
   자기 헤더를 내리고 싶으면 --tw-topbar-height CSS 변수(document.documentElement,
   즉 :root에 노출 -- 페이지 어디서나 var(--tw-topbar-height, 0px)로 참조 가능)
   또는 "tw-topbar-ready" 커스텀 이벤트(document에 발행, detail.height)를
   써서 알아서 보정한다. status 통합 때는 헤더 하나로 안 끝나고 그 아래
   캔버스·패널까지 같이 밀어야 해서 이벤트 쪽을 씀 -- 둘 다 유효한 선택지.
   ============================================================ */
(function () {
  'use strict';

  if (document.getElementById('tw-topbar-host')) return; // 중복 삽입 방지

  var HEIGHT_PX = 32;
  var PROJECTS_URL = 'https://toowani.com/projects.json';
  var AUTH_ORIGIN = 'https://auth.toowani.com';

  var CSS_TEXT =
    ':host { all:initial; }' +
    '* { box-sizing:border-box; }' +
    '.bar {' +
      'display:flex; align-items:center; gap:14px;' +
      'height:' + HEIGHT_PX + 'px; padding:0 14px;' +
      'background:rgba(15,15,15,.82); backdrop-filter:blur(12px) saturate(140%);' +
      '-webkit-backdrop-filter:blur(12px) saturate(140%);' +
      'border-bottom:1px solid rgba(255,255,255,.12);' +
      'font-family:-apple-system,BlinkMacSystemFont,"Pretendard Variable",Pretendard,"Noto Sans KR",sans-serif;' +
      'font-size:12px; color:#e8e6df; position:relative;' +
    '}' +
    '@media (prefers-color-scheme: light) {' +
      '.bar { background:rgba(242,240,234,.86); border-bottom-color:rgba(0,0,0,.12); color:#191917; }' +
    '}' +
    '.brand { color:inherit; text-decoration:none; font-weight:600; letter-spacing:.5px; opacity:.85; }' +
    '.brand:hover { opacity:1; }' +
    '.mid { position:relative; margin-left:4px; }' +
    'button { font:inherit; color:inherit; background:none; border:1px solid rgba(255,255,255,.18); ' +
      'border-radius:3px; padding:4px 9px; cursor:pointer; }' +
    '@media (prefers-color-scheme: light) { button { border-color:rgba(0,0,0,.18); } }' +
    'button:hover { border-color:#aad59e; color:#aad59e; }' +
    '.auth-btn { margin-left:auto; max-width:32vw; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }' +
    '.switch-panel {' +
      'position:absolute; top:calc(100% + 6px); left:0; min-width:160px;' +
      'background:rgba(15,15,15,.95); border:1px solid rgba(255,255,255,.15); border-radius:4px;' +
      'padding:6px; display:flex; flex-direction:column; gap:2px;' +
    '}' +
    '@media (prefers-color-scheme: light) {' +
      '.switch-panel { background:rgba(242,240,234,.97); border-color:rgba(0,0,0,.15); }' +
    '}' +
    '.switch-panel[hidden] { display:none; }' +
    '.switch-panel a { color:inherit; text-decoration:none; padding:6px 8px; border-radius:3px; }' +
    '.switch-panel a:hover { background:rgba(255,255,255,.08); }' +
    '.switch-panel .empty { padding:6px 8px; opacity:.6; }';

  var host = document.createElement('div');
  host.id = 'tw-topbar-host';
  host.style.cssText =
    'all:initial;' +
    'position:fixed;top:0;left:0;right:0;height:' + HEIGHT_PX + 'px;' +
    'z-index:2147483647;' +
    '--tw-topbar-height:' + HEIGHT_PX + 'px;';

  var shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML =
    '<style>' + CSS_TEXT + '</style>' +
    '<div class="bar">' +
      '<a class="brand" href="https://toowani.com">toowani.com</a>' +
      '<div class="mid">' +
        '<button class="switch-btn" type="button" aria-haspopup="true" aria-expanded="false">프로젝트 ▾</button>' +
        '<div class="switch-panel" hidden></div>' +
      '</div>' +
      '<button class="auth-btn" type="button">…</button>' +
    '</div>';

  var switchBtn = shadow.querySelector('.switch-btn');
  var switchPanel = shadow.querySelector('.switch-panel');
  var authBtn = shadow.querySelector('.auth-btn');

  switchBtn.addEventListener('click', function () {
    var willOpen = switchPanel.hidden;
    switchPanel.hidden = !willOpen;
    switchBtn.setAttribute('aria-expanded', String(willOpen));
  });
  // composedPath()[0]가 아니라 host가 경로 안에 있는지로 판단 -- shadow tree
  // 안의 클릭은 host.contains()로는 안 잡히므로(별도 노드 트리) composedPath만 신뢰.
  document.addEventListener('click', function (e) {
    if (e.composedPath().indexOf(host) === -1) {
      switchPanel.hidden = true;
      switchBtn.setAttribute('aria-expanded', 'false');
    }
  });

  function renderAuthBtn(session) {
    if (session && session.email) {
      // textContent -- never innerHTML -- so name(Google 계정 표시 이름,
      // 임의 문자열)이 그대로 들어와도 HTML로 해석되지 않는다.
      var label = session.name || session.email.split('@')[0];
      authBtn.textContent = label + ' · 로그아웃';
      authBtn.title = session.email;
      authBtn.onclick = function () {
        location.href = AUTH_ORIGIN + '/logout?redirect=' + encodeURIComponent(location.href);
      };
    } else {
      authBtn.textContent = '로그인';
      authBtn.removeAttribute('title');
      authBtn.onclick = function () {
        location.href = AUTH_ORIGIN + '/login?redirect=' + encodeURIComponent(location.href);
      };
    }
  }

  function renderProjects(list) {
    var visible = (list || []).filter(function (p) { return p.public !== false; });
    if (!visible.length) {
      switchPanel.innerHTML = '<p class="empty">준비 중입니다.</p>';
      return;
    }
    switchPanel.innerHTML = visible
      .map(function (p) {
        var lock = p.access === 'private' ? ' 🔒' : '';
        return '<a href="' + p.url + '">' + p.name + lock + '</a>';
      })
      .join('');
  }

  document.documentElement.appendChild(host);
  // --tw-topbar-height도 함께: host 요소 자신에 준 변수는 <body> 쪽(형제 트리)
  // 엔 상속 안 되므로, 페이지 어디서든 var()로 쓸 수 있게 documentElement에도 건다.
  document.documentElement.style.setProperty('--tw-topbar-height', HEIGHT_PX + 'px');

  fetch(PROJECTS_URL)
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(renderProjects)
    .catch(function () { switchPanel.innerHTML = '<p class="empty">불러오지 못했습니다.</p>'; });

  fetch(AUTH_ORIGIN + '/me', { credentials: 'include' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(renderAuthBtn)
    .catch(function () { renderAuthBtn(null); });

  document.dispatchEvent(new CustomEvent('tw-topbar-ready', { detail: { height: HEIGHT_PX } }));
})();
