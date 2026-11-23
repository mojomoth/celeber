# CELEBER BI · Color Halo

[선정 시안](../../docs/bi/drafts/selected/01-color-halo.svg)에서 앱 개발용 에셋을 추출했습니다. 로고는 투명 배경의 SVG이며, 레터링은 벡터 경로로 포함되어 있습니다.

| 파일 | 적용 위치 |
| --- | --- |
| `logo-on-light.svg`, `logo-on-dark.svg` | 헤더, 랜딩 등 심볼과 워드마크를 함께 사용하는 곳 |
| `symbol-on-light.svg`, `symbol-on-dark.svg` | 내비게이션이나 작은 영역의 단독 심볼 |
| `wordmark-on-light.svg`, `wordmark-on-dark.svg` | 브랜드 이름만 배치하는 곳 |
| `color-halo-background.svg` | 랜딩 화면의 세로형 그라데이션 배경. 화면 크기에 맞춰 채우고 밝은 로고를 겹쳐 사용 |
| `icon.svg`, `favicon.ico` | 웹 아이콘. ICO는 16, 32, 48 px 포함 |
| `apple-icon.png` | iOS 홈 화면에 추가하는 웹앱용 180 × 180 PNG |
| `icon-192.png`, `icon-512.png` | 웹앱 매니페스트의 일반 아이콘 (`purpose: "any"`) |
| `icon-maskable-512.png` | 웹앱 매니페스트의 마스크 적용 아이콘 (`purpose: "maskable"`) |
| `app-icon-1024.png` | 플랫폼별 아이콘 제작용 1024 × 1024 불투명 원본 |
| `colors.json` | 시안의 로고 색상과 5색 팔레트 |

`on-light`는 밝은 배경에 쓰는 잉크색(`#25222B`), `on-dark`는 어두운 배경에 쓰는 아이보리색(`#FFFDF8`)입니다.

Next.js App Router에서는 `icon.svg`와 `apple-icon.png`를 `app/`에 둘 수 있습니다. PWA용 PNG는 `public/`에서 제공하고 매니페스트에서 경로를 지정합니다. [Next.js 앱 아이콘](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/app-icons) · [Next.js PWA](https://nextjs.org/docs/app/guides/progressive-web-apps)
