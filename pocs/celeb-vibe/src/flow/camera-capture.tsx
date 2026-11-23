'use client';
/**
 * 카메라로 사진(화보/화면/본인 코디 등) 촬영. 어두운 촬영 바탕 + 한 줄 지시 + 고정 셔터 + 프레이밍 가이드.
 * 카메라를 쓸 수 없으면 업로드 대체 경로를 쓴다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { CameraShell, CornerFrameGuide } from '@celeber/ui';

export function CameraCapture({ onCapture, onUpload, onClose }: { onCapture: (dataUrl: string) => void; onUpload: (file: File) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<{ tone: 'ok' | 'warn' | 'danger' | 'info'; text: string } | null>({ tone: 'info', text: '카메라 준비 중' });
  const [ready, setReady] = useState(false);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('이 브라우저는 카메라를 지원하지 않습니다.');
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => undefined);
        }
        setReady(true);
        setStatus({ tone: 'ok', text: '인물이 프레임 안에 들어오게 맞춰 주세요' });
      } catch (e) {
        setReady(false);
        setStatus({ tone: 'warn', text: `카메라를 열 수 없습니다: ${(e as Error).message}. 업로드를 이용해 주세요.` });
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [facing]);

  const shoot = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, 0, 0);
    onCapture(c.toDataURL('image/jpeg', 0.92));
  }, [onCapture]);

  return (
    <CameraShell
      title="추구미 사진 촬영"
      instruction="인물이 한 명만 프레임 안에 들어오게 찍어 주세요"
      hint="역광과 강한 필터는 피하세요. 전신이 보이면 하의·신발까지 분석합니다."
      status={status}
      guide={<CornerFrameGuide state={ready ? 'ok' : 'idle'} />}
      onShutter={shoot}
      shutterDisabled={!ready}
      onUpload={onUpload}
      uploadLabel="사진 업로드"
      secondaryAction={{ label: facing === 'environment' ? '전면' : '후면', icon: 'swap', onClick: () => setFacing((f) => (f === 'environment' ? 'user' : 'environment')) }}
      onClose={onClose}
    >
      <video ref={videoRef} playsInline muted autoPlay style={{ transform: facing === 'user' ? 'scaleX(-1)' : undefined }} />
    </CameraShell>
  );
}
