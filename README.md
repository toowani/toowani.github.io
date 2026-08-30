# WANI.SYS — project hub

`toowani.com` — 김창완(@toowani)이 운영하는 프로젝트 서브도메인들을 모아 보여주는 랜딩 허브. 순수 HTML/CSS/JS, 빌드 도구 없이 GitHub Pages에 바로 배포됩니다.

이력서·포트폴리오(옛 WANI.SYS CV)는 별도 저장소로 분리되어 [cv.toowani.com](https://cv.toowani.com)에서 서비스됩니다.

## 파일 구조

```
index.html          허브 페이지 뼈대 (HUD / 자기소개 / 프로젝트 그리드 / 푸터)
css/style.css        스타일 전체 (다크·라이트 테마, 카드 그리드, 반응형)
js/hub.js             ★ projects.json을 읽어 카드 렌더 + 테마 토글 + 옛 CV 딥링크 리다이렉트
projects.json        ★ 프로젝트 목록 데이터 — 이 파일만 고치면 카드가 바뀝니다
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
| `status` | `"live"` \| `"dev"`(개발중 배지) \| `"private"`(🔒 배지, 링크는 유지 — 실제 접근 제어는 Cloudflare Access가 담당) |
| `thumbnail` | 썸네일 이미지 경로, 없으면 `null` (이니셜 플레이스홀더 표시) |
| `public` | `false`면 카드 목록에서 완전히 제외 |

> 주의: 이 사이트는 정적 호스팅이라 `projects.json` 자체는 누구나 fetch해서 원문을 볼 수 있습니다. `public: false`는 화면에 안 보이게 할 뿐, 파일 안에 있는 내용은 숨겨지지 않습니다. 존재 자체를 완전히 비밀로 하고 싶은 프로젝트는 애초에 이 파일에 넣지 마세요.

## 로컬에서 보기

```
python3 -m http.server 8000
# → http://localhost:8000
```

## GitHub Pages 배포

이 저장소(`toowani.github.io`)는 `toowani.com`으로 커스텀 도메인이 연결되어 있습니다. `main` 브랜치에 push하면 자동 배포됩니다.

## 옛 CV 딥링크 처리

과거 `toowani.com/#dev`, `#artist`, `#journey`, `#game`으로 유입되던 링크는 `index.html`의 인라인 스크립트가 즉시 `cv.toowani.com`의 동일 해시로 리다이렉트합니다. 그 외 이력서 등 옛 정적 자산 링크로 들어온 방문자는 404 페이지에서 `cv.toowani.com` 안내를 받습니다.
