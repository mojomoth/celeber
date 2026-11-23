# personal-color-report minor 정리 독립 재검증 라운드 1 (2026-11-24, critic)

판정: PASS (major 0, minor 5). 파일 수정 없음. 증거는 [pcr-recheck-r1/](pcr-recheck-r1/), 프로브는 [pcr-minor-recheck-r1.probe.test.ts](pcr-minor-recheck-r1.probe.test.ts).

- 정적: app test 57 pass/1 skip, typecheck·lint exit 0. cvr test 74 pass/6 skip, typecheck 0.
- dev 3105 실제 모드(.env source, FORCE_MOCK 없음, 데이터 디렉터리 분리). anthropic 400(한도, 12-01) → openai gpt-6.2-sol. 끝에 종료, 3105 LISTEN 0.
- 기동 직후 /new·/reports HMR 새로고침 반복(8초 217회)이 잠깐 있었고 곧 2회로 안정됐다(cvr-r2 hmr-loop와 같은 dev 현상).
- A(card 정면+env): 200 19.4초, aiSource=ai, hybrid, isMock=false. 여름쿨 뮤트, 64 보통. AI 독립 판정은 이제 봄웜 브라이트로 불일치(규칙 결과를 안 보여 준 결과). ② 캡션 '12톤 사이의 상대 적합도… 판정 신뢰도는 64%' 표시. A-s02.png, A-s14.png
- R(왼쪽 볼 ROI를 파랗게 칠한 사진): ⑭ 피부 측정 품질 '왼쪽 볼 피부색을 읽지 못해 나머지 3곳으로 계산했습니다.' 실제 화면 표시. R-s14.png
- D(밝기 22% 정면 강행): 45 재촬영 권장, ⑬ '이번 촬영(정면): …빛을 마주 봐 주세요.' 마침표 확인. 막대 85% 아래 '판정 신뢰도는 45%' 캡션. D-s02.png
- 업로드 API: upload-api.txt. 빈 본문·빈 multipart → '첨부된 사진이 없습니다…', 잘린 multipart → '끝까지 읽지 못했습니다', 27MB 413 '(최대 25MB)', 정상 200, 외부 Origin 403.
- AI 독립 판정 프롬프트(buildOpinionPrompt)에 규칙 타입·축·점수 없음(코드 확인, Codex도 같은 결론).
- core에 구조화된 ROI 사유 코드 없음(SkinColorMeasurement엔 regions와 문자열 confidenceReasons만). 문구 매칭은 타당.

## 남은 minor (직접 재현)

1. ⑭ skinReasonTexts slice(0,2): 조명 추정 신뢰도 낮음 + 배경 없음/픽셀 적음이 앞에 오면 ROI 누락 안내가 잘린다(probe combo1·2). combo1은 '약하게 보정'과 '원본 그대로'가 함께 나와 서로 어긋난다.
2. ⑭ 문구 모순: core 기본 문장 '피부 표본이 충분하고 부위별 값이 안정적입니다.' 뒤에 ROI 누락이 붙는다(R 실화면). 턱만 남으면 균일도 100점 'ΔE 0.0'(probe chin-only).
3. uploadPOST: Content-Length가 있는데 첫 청크 전에 끊긴 전송도 '첨부된 사진이 없습니다'로 바뀐다(probe abort).
4. ⑬ 경고 끝에 공백이 있으면 '…어둡습니다. .'(probe trail, 현 camera-face 문구에선 안 생김).
5. text/plain 본문 업로드가 '사진 파일을 끝까지 읽지 못했습니다'(기존 동작, API 직접 호출만).

Codex sol 의견 중 미채택(재현 안 함): 독립 판정만 실패 시 warning 유실, 서술 실패 시 성공한 독립 판정 폐기, body:null+큰 Content-Length 413→400, 이미 읽은 요청 TypeError.
