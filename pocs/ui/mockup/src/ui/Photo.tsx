import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import s from './ui.module.css';

/** 사진 한 장. 목업 사진은 public/photos의 정적 JPEG라 next/image 최적화를 쓰지 않는다. */
export function Photo({ src, alt = '', position, className, style }: { src: string; alt?: string; position?: string; className?: string; style?: CSSProperties }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} style={position ? { objectPosition: position, ...style } : style} decoding="async" />
  );
}

/** 2열 사진 그리드, 2pt 흰 이음새. 행 간격은 rowGap(기본 0, 03 히어로처럼 맞붙일 땐 2). */
export function PhotoGrid({ children, rowGap = 0, className, style }: { children: ReactNode; rowGap?: number; className?: string; style?: CSSProperties }) {
  return (
    <div className={[s.grid2, className].filter(Boolean).join(' ')} style={{ rowGap, ...style }}>
      {children}
    </div>
  );
}

/**
 * 사진 타일 (H&M). 굵은 라벨 28/800을 왼쪽 아래(20, 16)에 두고 아래 스크림을 깐다.
 * - labelTone='ink': 밝은 배경 사진용. 잉크색 라벨을 위쪽에 두고 스크림을 끈다 (05 원본/적용 룩)
 * - label 없이 쓰면 스크림도 없다 (04 드레이프 타일: 천 색 왜곡 방지)
 * - height: 타일 높이(px 숫자 또는 CSS 값). 그리드 칸을 채우려면 '100%'
 * - position: object-position (예: '50% 14%')
 * - children: 오른쪽 위 선택 표시 같은 겹침 요소 (직접 position: absolute로 배치)
 */
export function PhotoTile({
  src,
  alt = '',
  label,
  sublabel,
  labelTone = 'light',
  height,
  position,
  href,
  className,
  imgClassName,
  style,
  children,
}: {
  src: string;
  alt?: string;
  label?: ReactNode;
  sublabel?: ReactNode;
  labelTone?: 'light' | 'ink';
  height?: number | string;
  position?: string;
  href?: string;
  className?: string;
  imgClassName?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const body = (
    <>
      <Photo src={src} alt={alt} position={position} className={[s.tileImg, imgClassName].filter(Boolean).join(' ')} />
      {label && labelTone === 'light' ? <div className={s.scrim} aria-hidden /> : null}
      {label ? (
        <div className={[s.lbl, labelTone === 'ink' ? s.lblInk : ''].join(' ')}>
          {label}
          {sublabel ? <small>{sublabel}</small> : null}
        </div>
      ) : null}
      {children}
    </>
  );
  const cls = [s.tile, className].filter(Boolean).join(' ');
  const st = { height, ...style };
  return href ? (
    <Link href={href} className={cls} style={st}>
      {body}
    </Link>
  ) : (
    <div className={cls} style={st}>
      {body}
    </div>
  );
}

/** 타일 아래 캡션 (시안 .cta): 15/500 제목 + 12.5 회색 보조문. 높이 76 이상 */
export function TileCaption({ title, meta, className, style }: { title: ReactNode; meta?: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={[s.cta, className].filter(Boolean).join(' ')} style={style}>
      <div>{title}</div>
      {meta ? <div className={s.ctaMeta}>{meta}</div> : null}
    </div>
  );
}
