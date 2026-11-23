// 결과 뷰 등 재사용 React 컴포넌트. "@celeber/camera-body/components"
// 규칙: 상대경로만 사용. BodyPhotoPanel만 'use client'(레이어 탭), 나머지는 상태 없음.
export { BodyOverlay, DEFAULT_LAYERS, type OverlayLayers } from './BodyOverlay';
export { BodyPhotoPanel } from './BodyPhotoPanel';
export { RatioBar, RatioBars, ProportionDiagram, SilhouetteDiagram } from './RatioViz';
export { BodyResultView, BodyAddPlaceholder, BodyIssues, type BodyResultViewProps } from './BodyResultView';
