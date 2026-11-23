'use client';
/**
 * ⑤ 드레이핑 썸네일: 사용자 정면 사진(같은 크롭) + 턱 아래 천을 canvas로 합성.
 * 사진의 조명·표정·구도는 그대로 두고 천의 색만 바꾼다. 천에는 주름 음영과 목 아래 그림자를 넣고,
 * 천 색이 목에 비치는 반사광을 턱선 아래에만 아주 약하게(soft-light) 더한다. 얼굴 픽셀은 바꾸지 않는다.
 */
import { useEffect, useRef, useState } from 'react';
import { type DrapeAnchor, cropIntersection, drapeCrop, drapeOutline, shadeHex } from '../lib/drape';

const imageCache = new Map<string, Promise<HTMLImageElement>>();
function loadImage(src: string): Promise<HTMLImageElement> {
  let p = imageCache.get(src);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => {
        imageCache.delete(src);
        reject(new Error('image load failed'));
      };
      img.src = src;
    });
    imageCache.set(src, p);
  }
  return p;
}

/** 목 반사광 세기 (soft-light). 얼굴에는 적용하지 않는다 */
export const DRAPE_REFLECTION_ALPHA = 0.12;

function hexToRgba(hex: string, a: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** 캔버스에 합성 (테스트/다른 용도에서 재사용 가능) */
export function drawDrape(canvas: HTMLCanvasElement, img: HTMLImageElement, anchor: DrapeAnchor, hex: string, aspect: number, cssWidth: number): void {
  const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
  const W = Math.round(cssWidth * dpr);
  const H = Math.round(W / aspect);
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const crop = drapeCrop(anchor, iw, ih, aspect);

  ctx.fillStyle = '#E9E6E0';
  ctx.fillRect(0, 0, W, H);
  const inter = cropIntersection(crop, iw, ih, W, H);
  if (inter) {
    const { dx, dy, dw, dh } = inter.dst;
    ctx.drawImage(img, inter.src.sx, inter.src.sy, inter.src.sw, inter.src.sh, dx, dy, dw, dh);
    // 사진 밖 영역은 가장자리 픽셀을 늘려 채운다 (회색 띠 방지, 천이 대부분 덮는다)
    const x0 = Math.floor(dx);
    const x1 = Math.ceil(dx + dw);
    const y0 = Math.floor(dy);
    const y1 = Math.ceil(dy + dh);
    if (y1 < H) ctx.drawImage(canvas, x0, y1 - 2, Math.max(1, x1 - x0), 1, x0, y1 - 1, Math.max(1, x1 - x0), H - y1 + 1);
    if (y0 > 0) ctx.drawImage(canvas, x0, y0 + 1, Math.max(1, x1 - x0), 1, x0, 0, Math.max(1, x1 - x0), y0 + 1);
    if (x0 > 0) ctx.drawImage(canvas, x0 + 1, 0, 1, H, 0, 0, x0 + 1, H);
    if (x1 < W) ctx.drawImage(canvas, x1 - 2, 0, 1, H, x1 - 1, 0, W - x1 + 1, H);
  }

  const o = drapeOutline(anchor, crop, iw, ih, W, H);
  const path = new Path2D();
  const t = o.top;
  path.moveTo(t[0].x, t[0].y);
  for (let i = 1; i < t.length - 1; i++) {
    const mx = (t[i].x + t[i + 1].x) / 2;
    const my = (t[i].y + t[i + 1].y) / 2;
    path.quadraticCurveTo(t[i].x, t[i].y, mx, my);
  }
  path.lineTo(t[t.length - 1].x, t[t.length - 1].y);
  path.lineTo(o.bottom[0].x, o.bottom[0].y);
  path.lineTo(o.bottom[1].x, o.bottom[1].y);
  path.closePath();

  // 반사광: 천 색이 목(턱 아래)에만 아주 약하게 비치는 효과.
  // 얼굴(턱선 위)은 건드리지 않는다 — 비교 대상인 얼굴 픽셀을 색마다 다르게 칠하면 조명 동일 조건이 깨진다.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, o.chin.y + o.faceH * 0.02, W, H);
  ctx.clip();
  ctx.globalCompositeOperation = 'soft-light';
  const rg = ctx.createRadialGradient(o.chin.x, o.chin.y + o.faceH * 0.18, 0, o.chin.x, o.chin.y + o.faceH * 0.18, o.faceW * 0.4);
  rg.addColorStop(0, hexToRgba(hex, DRAPE_REFLECTION_ALPHA));
  rg.addColorStop(1, hexToRgba(hex, 0));
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // 목에 드리우는 그림자 + 천 바탕
  ctx.save();
  ctx.shadowColor = 'rgba(30, 20, 15, 0.38)';
  ctx.shadowBlur = Math.max(4, o.faceW * 0.06);
  ctx.shadowOffsetY = -Math.max(1, o.faceW * 0.012);
  ctx.fillStyle = hex;
  ctx.fill(path);
  ctx.restore();

  // 천 안쪽 음영과 주름
  ctx.save();
  ctx.clip(path);
  const lg = ctx.createLinearGradient(0, o.chin.y, 0, H);
  lg.addColorStop(0, 'rgba(255,255,255,0.10)');
  lg.addColorStop(0.45, 'rgba(255,255,255,0)');
  lg.addColorStop(1, 'rgba(0,0,0,0.20)');
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, W, H);
  const side = ctx.createLinearGradient(0, 0, W, 0);
  side.addColorStop(0, 'rgba(0,0,0,0.14)');
  side.addColorStop(0.3, 'rgba(0,0,0,0)');
  side.addColorStop(0.7, 'rgba(0,0,0,0)');
  side.addColorStop(1, 'rgba(0,0,0,0.14)');
  ctx.fillStyle = side;
  ctx.fillRect(0, 0, W, H);
  ctx.lineCap = 'round';
  const dark = shadeHex(hex, -0.32);
  const light = shadeHex(hex, 0.22);
  for (const [a, c, b] of o.folds) {
    ctx.strokeStyle = hexToRgba(dark, 0.32);
    ctx.lineWidth = o.faceW * 0.07;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
    ctx.stroke();
    ctx.strokeStyle = hexToRgba(light, 0.22);
    ctx.lineWidth = o.faceW * 0.03;
    ctx.beginPath();
    ctx.moveTo(a.x + o.faceW * 0.05, a.y + o.faceH * 0.02);
    ctx.quadraticCurveTo(c.x + o.faceW * 0.05, c.y, b.x + o.faceW * 0.05, b.y);
    ctx.stroke();
  }
  // 위쪽 가장자리 접힘선
  ctx.strokeStyle = hexToRgba(light, 0.35);
  ctx.lineWidth = Math.max(1, o.faceW * 0.015);
  ctx.stroke(path);
  ctx.restore();
}

export interface DrapeThumbProps {
  src: string;
  anchor: DrapeAnchor;
  hex: string;
  /** 색 이름 (대체 텍스트) */
  name: string;
  /** CSS 너비(px) 기준 해상도. 표시 너비는 부모가 정한다 */
  width?: number;
  /** 너비/높이 (기본 0.8) */
  aspect?: number;
}

/** 드레이핑 합성 canvas. 사진을 못 읽으면 같은 크기의 색 블록으로 대체 */
export function DrapeThumb({ src, anchor, hex, name, width = 120, aspect = 0.8 }: DrapeThumbProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const key = `${anchor.chin.x},${anchor.chin.y},${anchor.faceBox.w}`;
  useEffect(() => {
    let alive = true;
    loadImage(src)
      .then((img) => {
        if (alive && ref.current) drawDrape(ref.current, img, anchor, hex, aspect, width);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
    // anchor는 key로 비교 (객체 동일성 무시)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, key, hex, aspect, width]);
  if (failed) return <span role="img" aria-label={`${name} 천 예시`} style={{ display: 'block', width: '100%', aspectRatio: String(aspect), background: hex, borderRadius: 10 }} />;
  return <canvas ref={ref} role="img" aria-label={`${name} 천을 대었을 때 예시 합성`} width={width} height={Math.round(width / aspect)} />;
}
