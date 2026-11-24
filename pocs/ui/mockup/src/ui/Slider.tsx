import s from './ui.module.css';

/**
 * 표시용 슬라이더 (04 명도·채도·대비). value 0–100 위치에 흰 pill 라벨, 아래 양 끝 글자.
 * 높이 34 + 끝 글자(top 40). 여러 개를 쌓을 때 간격은 화면이 정한다 (시안 gap 38).
 */
export function Slider({ value, label, ends }: { value: number; label: string; ends: [string, string] }) {
  const v = Math.min(100, Math.max(0, value));
  return (
    <div className={s.slider} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} aria-valuetext={label} aria-label={`${ends[0]}–${ends[1]}`}>
      <div className={s.sliderTrack} />
      <div className={s.sliderPill} style={{ left: `${v}%` }}>
        {label}
      </div>
      <div className={s.sliderEnds}>
        <span>{ends[0]}</span>
        <span>{ends[1]}</span>
      </div>
    </div>
  );
}
