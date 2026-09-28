# WANI.SYS — project hub

`toowani.com` — 김창완(@toowani)이 운영하는 프로젝트 서브도메인들을 모아 보여주는 랜딩 허브. 순수 HTML/CSS/JS, 빌드 도구 없이 GitHub Pages에 바로 배포됩니다.

이력서·포트폴리오(옛 WANI.SYS CV)는 별도 저장소로 분리되어 [cv.toowani.com](https://cv.toowani.com)에서 서비스됩니다.

## 파일 구조

```
index.html          허브 페이지 뼈대 (site-header / hero / 프로젝트 카드 / 푸터) — p4l.toowani.com 룩
css/style.css        ★ 스타일 전체 + hub 전용 테마 토큰(:root — 연한 초록 강조, 다크·라이트). contests·privacy도 이 파일을 베이스로 씀
js/hub.js             ★ projects.json을 읽어 카드 렌더 + 테마 토글 + 로그인 상태(C 패턴) + 옛 CV 딥링크 리다이렉트
projects.json        ★ 프로젝트 목록 데이터 — 이 파일만 고치면 카드가 바뀝니다
shared/topbar.js     다른 서브도메인이 <script> 한 줄로 삽입하는 공통 상단바 (아래 "shared/" 절 참고)
shared/tokens.css    공통 디자인 토큰(CSS 변수) — hub 자신도 이 파일을 씀
podcast4life/        YouTube 감사·검증용 공개 페이지 (프로젝트 목록과 무관, 그대로 유지)
p4l-ywt2ce/           옛 P4L 쇼츠 미리보기 경로 → p4l.toowani.com으로 안내 리다이렉트
```

## 프로젝트 추가/수정 방법

`projects.json`에 항목을 추가·수정하면 됩니다. 각 필드:

| 필드 | 설명 |
|---|---|
| `id` | 내부 식별용 문자열 |
| `name` | 카드에 표시될 이름 |
| `url` | 서브도메인 주소 |
| `description` | 한 줄 설명 |
| `tags` | 태그 배열 |
| `status` | `"live"` \| `"dev"`(개발중 배지) — 개발 단계 표시. `access`와 독립적 |
| `access` | `"public"` \| `"private"`(🔒 배지, 링크는 유지 — 차단 여부는 목적지 사이트가 `auth.toowani.com/authorize`로 직접 판단, 허브는 배지만 표시) |
| `thumbnail` | 썸네일 이미지 경로, 없으면 `null` (이니셜 플레이스홀더 표시) |
| `public` | `false`면 카드 목록에서 완전히 제외 (access와 다른 축 — 노출 여부일 뿐) |

> 주의: 이 사이트는 정적 호스팅이라 `projects.json` 자체는 누구나 fetch해서 원문을 볼 수 있습니다. `public: false`는 화면에 안 보이게 할 뿐, 파일 안에 있는 내용은 숨겨지지 않습니다. 존재 자체를 완전히 비밀로 하고 싶은 프로젝트는 애초에 이 파일에 넣지 마세요.

## 로컬에서 보기

```
python3 -m http.server 8000
# → http://localhost:8000
```

## GitHub Pages 배포

이 저장소(`toowani.github.io`)는 `toowani.com`으로 커스텀 도메인이 연결되어 있습니다. `main` 브랜치에 push하면 자동 배포됩니다.

## 디자인 — party4life 룩 (2026-09-28)

hub의 모든 페이지(index · contests · privacy · 404)는 p4l.toowani.com(party4life)의
"night sky / glow" 룩을 그대로 따른다 — 둥근 패널(18px), 필 버튼, `Baloo 2` +
`Gothic A1`(Google Fonts, 각 HTML `<head>`에서 link), 배경 글로우, `.chrome-text`
그라데이션 제목, `.section-title` + `.idx`, `.entry-card`. 단 강조색은 남색·파랑
대신 hub 고유의 **연한 초록(`--acc: #aad59e`, 라이트 `#6fa562`)**이고 배경도
초록빛이 도는 짙은 밤색이다.

토큰(`--panel`, `--line`, `--acc-glow`, `--radius` …)은 `css/style.css` 맨 위
`:root` / `body[data-theme="light"]` 블록에 있다. `shared/tokens.css`는 다른
서브도메인이 로드하는 신뢰 경계 파일이라 **건드리지 않았고**, style.css가 그 뒤에
로드되므로 같은 이름(`--acc`, `--fg` …)은 style.css 값이 이긴다. 옛 변수명
(`--bg`, `--dim`, `--hairline`, `--mono` …)은 별칭으로 남겨 뒀다.

## shared/ — 신뢰 경계

`shared/topbar.js`, `shared/tokens.css`는 `https://toowani.com/shared/...`로 정적 배포되고, status·p4l·class 등 **다른 서브도메인 페이지 안에서 그대로 실행/적용**됩니다. status처럼 인증으로 보호된 페이지 안에서도 돌아가는 외부 스크립트라는 뜻이므로:

- **외부 의존성 추가 금지** — CDN, 폰트, 애널리틱스 등 어떤 원격 리소스도 참조하지 않는다. 전부 자체 완결(self-contained)로 작성
- **변경 시 diff 리뷰 필수** — 이 두 파일을 고치는 커밋은 배포 전 반드시 diff를 사람이 검토한다
- `topbar.js`는 Shadow DOM으로 격리되고 호스트 페이지 레이아웃을 직접 건드리지 않는다(오버레이 방식). 호스트가 자기 헤더를 보정하고 싶으면 `--tw-topbar-height` CSS 변수 또는 `tw-topbar-ready` 커스텀 이벤트(`document`에 발행, `detail.height`)를 쓴다

## 옛 CV 딥링크 처리

과거 `toowani.com/#dev`, `#artist`, `#journey`, `#game`으로 유입되던 링크는 `index.html`의 인라인 스크립트가 즉시 `cv.toowani.com`의 동일 해시로 리다이렉트합니다. 그 외 이력서 등 옛 정적 자산 링크로 들어온 방문자는 404 페이지에서 `cv.toowani.com` 안내를 받습니다.

## contests/ — CONTEST RADAR

AI 공모전 · 개발 해커톤/경진대회 · 창업 공모전 공고를 여러 사이트에서 모아
마감일 순으로 보여주는 개인용 페이지 (`https://toowani.com/contests/`, `noindex`).

```
contests/index.html      페이지 뼈대
contests/contests.css    전용 스타일 (shared/tokens.css 위에 얹음)
contests/contests.js     data.json → 목록 렌더, 필터/정렬, 관심·지원함·숨김·메모(localStorage)
contests/data.json       ★ 수집 산출물 — 손으로 고치지 말 것 (봇 커밋이 덮어씀)
scripts/scrape-contests.mjs   수집기 (Node 20+, 의존성 없음)
.github/workflows/scrape-contests.yml   6시간마다 수집기 실행 → data.json 변경 시 자동 커밋
```

| 소스 | 방식 | 범위 |
|---|---|---|
| 링커리어 | GraphQL (`api.linkareer.com`) | 공모전 전체(OPEN) 중 키워드 매칭 |
| 홀라 (holaworld.io) | REST (`api.holaworld.io/api/events`) | hackathon / contest |
| 위비티 | HTML 목록 + 상세 | 게임/SW · 웹/IT · 과학/공학 · 기획/아이디어 · 영상/UCC 분야 |
| Dev-Event (GitHub) | README 마크다운 | 분류 `대회` 또는 제목에 해커톤/공모전 |
| K-Startup | HTML 목록 | 모집중 사업공고 중 공모/대회/데모데이 성격 |

- 분류 태그(`ai` / `dev` / `startup` / `video`)는 `scripts/scrape-contests.mjs`의 `RULES`
  정규식으로 제목에서 자동 부여. 태그가 하나도 안 붙으면 버림. 청소년·아동 전용,
  취업 멘토링·포럼 같은 비(非)공모 행사는 `YOUTH_ONLY`/`NOISE`로 걸러냄.
  → 놓치는 공고가 있으면 이 정규식을 손보면 된다.
- 소스 하나가 실패해도 직전 결과를 유지하고 페이지 상단 출처 표시가 빨간 점으로 바뀐다.
- 같은 공고가 여러 사이트에 올라오면 제목 정규화로 하나로 합치고 출처 링크를 전부 남긴다.
- 관심(★)·지원함·숨김·메모는 브라우저 localStorage에만 저장. 상단 "백업/복원"으로 JSON
  내보내기·불러오기 가능(기기 간 이동용).
- 수동 실행: `node scripts/scrape-contests.mjs` (hub/ 루트에서) 또는 GitHub Actions
  탭에서 `scrape-contests` → Run workflow.
