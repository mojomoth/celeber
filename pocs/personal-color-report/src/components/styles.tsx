/**
 * 리포트 전용 스타일. 다른 앱이 이 컴포넌트를 import해도 CSS 파일 설정 없이 동작하도록
 * React 19 <style href precedence>로 문서 head에 한 번만 넣는다. 토큰은 @celeber/ui(--cb-*)를 쓴다.
 */
const CSS = `
.pcr { display: grid; gap: var(--cb-s4); padding-bottom: var(--cb-s6); }
.pcr-head { display: grid; gap: var(--cb-s3); padding-top: var(--cb-s2); }
.pcr-head__title { font-size: 26px; line-height: 33px; font-weight: 800; letter-spacing: -0.02em; margin: 0; }
.pcr-head__row { display: flex; align-items: center; gap: var(--cb-s2); flex-wrap: wrap; }
.pcr-meta { display: grid; grid-template-columns: auto 1fr; gap: 6px var(--cb-s4); margin: 0; padding: var(--cb-s3) var(--cb-s4); background: var(--cb-paper); border: 1px solid var(--cb-line); border-radius: 12px; font-size: 13px; line-height: 19px; }
.pcr-meta dt { color: var(--cb-text-2); font-weight: 600; }
.pcr-meta dd { margin: 0; }
.pcr-variant { display: grid; gap: 6px; }
.pcr-variant__note { font-size: 12px; line-height: 17px; color: var(--cb-text-2); }
.pcr-legend { display: flex; gap: 16px; font-size: 12px; line-height: 17px; color: var(--cb-text-2); }
.pcr-legend span { display: inline-flex; align-items: center; gap: 6px; }
.pcr-legend i { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.pcr-photos { display: grid; gap: var(--cb-s2); }
.pcr-photos__more { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--cb-s2); }
.pcr-photos__more figure { margin: 0; }
.pcr-photos__more img { width: 100%; aspect-ratio: 3 / 4; object-fit: cover; border-radius: 10px; background: var(--cb-paper); display: block; }
.pcr-photos__more figcaption { font-size: 12px; color: var(--cb-text-2); margin-top: 4px; text-align: center; }
.pcr-card { display: grid; gap: var(--cb-s3); }
.pcr-type { border-radius: 14px; padding: var(--cb-s4) var(--cb-s4); text-align: center; }
.pcr-type__ko { font-size: 28px; line-height: 34px; font-weight: 800; letter-spacing: -0.01em; }
.pcr-type__en { font-size: 15px; line-height: 20px; font-weight: 600; opacity: 0.9; margin-top: 2px; }
.pcr-secondary { display: flex; align-items: baseline; gap: var(--cb-s3); font-size: 14px; }
.pcr-secondary strong { font-size: 20px; color: var(--cb-iris-deep); font-weight: 700; }
.pcr-scores { display: grid; gap: 6px; }
.pcr-score { display: grid; grid-template-columns: 96px 1fr 40px; align-items: center; gap: var(--cb-s2); font-size: 12px; color: var(--cb-text-2); }
.pcr-score__track { height: 6px; border-radius: 3px; background: var(--cb-line); overflow: hidden; }
.pcr-score__fill { display: block; height: 100%; background: var(--cb-ink); border-radius: 3px; }
.pcr-point { background: var(--cb-paper); border-radius: 12px; padding: var(--cb-s3) var(--cb-s4); font-size: 13px; line-height: 20px; }
.pcr-point__title { font-weight: 700; font-size: 13px; margin-bottom: 4px; }
.pcr-compare { display: grid; gap: var(--cb-s2); }
.pcr-compare__row { display: grid; grid-template-columns: 44px auto 1fr; gap: var(--cb-s2); align-items: center; font-size: 13px; line-height: 19px; }
.pcr-compare__tag { font-weight: 700; font-size: 12px; }
.pcr-dots { display: flex; gap: 3px; }
.pcr-dot { width: 18px; height: 18px; border-radius: 50%; border: 1px solid rgba(37,34,43,0.14); display: inline-block; }
.pcr-measured { display: grid; grid-template-columns: repeat(auto-fill, minmax(70px, 1fr)); gap: var(--cb-s2); }
.pcr-measured__item { display: grid; justify-items: center; gap: 2px; font-size: 11px; line-height: 15px; text-align: center; color: var(--cb-text-2); }
.pcr-measured__chip { width: 36px; height: 36px; border-radius: 50%; border: 1px solid rgba(37,34,43,0.14); }
.pcr-drape { display: grid; gap: var(--cb-s3); }
.pcr-drape__pair { display: grid; grid-template-columns: 1fr 1fr; gap: var(--cb-s2); }
.pcr-drape__big { position: relative; }
.pcr-drape__badge { display: flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 700; margin-top: 6px; }
.pcr-drape__badge--ok { color: var(--cb-ok); }
.pcr-drape__badge--no { color: var(--cb-danger); }
.pcr-drape__sub { font-size: 12px; color: var(--cb-text-2); line-height: 17px; }
.pcr-drape__group { display: grid; gap: 6px; padding: var(--cb-s3); border-radius: 12px; }
.pcr-drape__group--ok { background: var(--cb-iris-soft); }
.pcr-drape__group--no { background: #FBEDEE; }
.pcr-drape__label { font-size: 13px; font-weight: 700; }
.pcr-drape__group--ok .pcr-drape__label { color: var(--cb-iris-deep); }
.pcr-drape__group--no .pcr-drape__label { color: var(--cb-danger); }
.pcr-drape__grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.pcr-drape__thumb { border: 0; padding: 0; background: none; cursor: pointer; display: grid; gap: 4px; justify-items: center; font: inherit; color: inherit; min-height: 44px; }
.pcr-drape__thumb canvas, .pcr-drape__big canvas { width: 100%; height: auto; display: block; border-radius: 10px; background: #E9E6E0; }
.pcr-drape__thumb[aria-pressed="true"] canvas { outline: 2px solid var(--cb-iris-deep); outline-offset: 1px; }
.pcr-drape__name { font-size: 11px; line-height: 14px; text-align: center; word-break: keep-all; }
.pcr-drape__big .pcr-drape__name { font-size: 13px; font-weight: 700; margin-top: 4px; }
.pcr-tip { display: flex; gap: 6px; align-items: flex-start; background: var(--cb-paper); border-radius: 10px; padding: var(--cb-s2) var(--cb-s3); font-size: 12px; line-height: 18px; color: var(--cb-text-2); }
.pcr-tip b { color: var(--cb-ink); font-weight: 700; }
.pcr-sub { font-size: 13px; font-weight: 700; margin: 0; }
.pcr-metals { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--cb-s2); }
.pcr-metal { display: grid; justify-items: center; gap: 4px; font-size: 11px; line-height: 15px; text-align: center; }
.pcr-avoid { font-size: 12px; color: var(--cb-text-2); }
.pcr-hair { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--cb-s2); }
.pcr-styles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--cb-s3); }
.pcr-style { display: grid; grid-template-columns: 52px 1fr; gap: var(--cb-s2); align-items: center; }
.pcr-style__label { font-size: 13px; font-weight: 700; line-height: 18px; }
.pcr-style__reason { font-size: 11px; line-height: 15px; color: var(--cb-text-2); }
.pcr-caution { display: grid; grid-template-columns: 40px 1fr; gap: var(--cb-s3); align-items: start; }
.pcr-caution__icon { width: 40px; height: 40px; border-radius: 10px; background: var(--cb-paper); display: grid; place-items: center; color: var(--cb-text-2); }
.pcr-conf { display: grid; grid-template-columns: 1fr; gap: var(--cb-s4); }
.pcr-conf > :first-child { justify-self: center; }
.pcr-swatches-1line .cb-swatch__name { white-space: nowrap; }
.pcr-factors { display: grid; gap: var(--cb-s2); }
.pcr-factor { display: grid; gap: 3px; }
.pcr-factor__top { display: flex; justify-content: space-between; font-size: 12px; font-weight: 600; }
.pcr-factor__detail { font-size: 11px; line-height: 15px; color: var(--cb-text-2); }
.pcr-disclaimer { font-size: 12px; line-height: 17px; color: var(--cb-text-2); text-align: center; padding: 0 var(--cb-s2); }
.pcr-grooming-colors { display: inline-flex; gap: 3px; margin-left: 6px; vertical-align: middle; }
.pcr-grooming-colors .pcr-dot { width: 14px; height: 14px; }
.pcr-list { display: grid; gap: var(--cb-s2); }
.pcr-list__item { display: grid; grid-template-columns: 64px 1fr auto; gap: var(--cb-s3); align-items: center; text-decoration: none; color: inherit; padding: var(--cb-s2); border-radius: 12px; border: 1px solid var(--cb-line); background: var(--cb-card); min-height: 44px; }
.pcr-list__item img { width: 64px; height: 80px; object-fit: cover; border-radius: 8px; background: var(--cb-paper); display: block; }
.pcr-list__name { font-weight: 700; font-size: 15px; line-height: 22px; }
.pcr-list__meta { font-size: 12px; color: var(--cb-text-2); line-height: 17px; }
.pcr-choice { display: grid; grid-template-columns: 56px 1fr; gap: var(--cb-s3); align-items: center; text-align: left; width: 100%; padding: var(--cb-s2) var(--cb-s3); border-radius: 12px; border: 1px solid var(--cb-line); background: var(--cb-card); font: inherit; color: inherit; cursor: pointer; min-height: 56px; }
.pcr-choice[aria-pressed="true"] { border-color: var(--cb-iris-deep); background: var(--cb-iris-soft); box-shadow: inset 0 0 0 1px var(--cb-iris-deep); }
.pcr-choice { position: relative; }
.pcr-choice__check { position: absolute; right: var(--cb-s3); top: 50%; transform: translateY(-50%); width: 24px; height: 24px; border-radius: 50%; background: var(--cb-iris-deep); color: var(--cb-ivory); display: none; place-items: center; }
.pcr-choice[aria-pressed="true"] .pcr-choice__check { display: grid; }
.pcr-choice[aria-pressed="true"] { padding-right: calc(var(--cb-s3) + 32px); }
.pcr-choice img, .pcr-choice__ph { width: 56px; height: 70px; object-fit: cover; border-radius: 8px; background: var(--cb-paper); display: grid; place-items: center; color: var(--cb-text-2); }
`;

export function ReportStyles() {
  return (
    <style href="celeber-personal-color-report" precedence="default">
      {CSS}
    </style>
  );
}
