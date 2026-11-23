/** 원형 인물 썸네일 (없으면 이름 첫 글자) */
import s from './search-celeb.module.css';

export function CelebAvatar({ src, name, size = 56 }: { src?: string; name: string; size?: number }) {
  return (
    <span className={s.avatar} style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" loading="lazy" /> : name.trim().slice(0, 1)}
    </span>
  );
}
