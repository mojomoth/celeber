# 데모 전신 사진 (Mock 이미지 검색용)

키 없는 데모 모드에서 `mockImageProvider`가 카테고리마다 1장씩 섞는 래스터 전신 사진이다(`src/server/search/demo-photos.ts`).
SVG 실루엣은 MediaPipe가 사람으로 인식하지 못해 celeb-vibe에서 항상 '분석 불가'가 되므로, 분석 가능한 사진이 최소 1장 있어야
"이름 검색 → 대표·최근·평소 사진 → 분석 → 추구미 가이드"를 키 없이 끝까지 시연할 수 있다.

| 파일 | 출처 (리포지토리 안) | 쓰는 카테고리 |
| --- | --- | --- |
| `look-a.jpg` | `docs/ui/refs/screens/10-doji-outfit-preview.jpg` 인물 영역 | 대표 |
| `look-b.jpg` | `docs/ui/refs/screens/09-ssense-outfit-gallery.jpg` 인물 영역 | 최근 |
| `look-b-2.jpg` | 위 사진 좌우 반전 | 평소 |

- 흰 배경(하이라이트 클리핑 → '극단적 조명' 판정)은 옅은 회색으로 바꿨다. 원본 해상도 그대로(짧은 변 ≥ 360px).
- 실존 연예인 사진이 아니며 검색한 이름과 무관한 데모 모델이다. 화면에는 '데모 사진'으로 표시된다.
- 참고 시안 화면에서 잘라 낸 사진이므로 PoC 데모 용도로만 쓰고 배포물에 넣지 않는다.
