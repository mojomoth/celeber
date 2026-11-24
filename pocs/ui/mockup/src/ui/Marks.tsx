import { Icon } from './Icon';
import s from './ui.module.css';

/** 선택됨 표시: 26px 검정 원 + 흰 체크 (05 사진 카드 오른쪽 위) */
export function CheckMark() {
  return (
    <span className={s.chk} aria-hidden>
      <Icon name="check" size={14} stroke={2.4} />
    </span>
  );
}

/** 선택 안 됨 표시: 26px 빈 원 */
export function RadioMark() {
  return <span className={s.radio} aria-hidden />;
}
