'use client';
/**
 * 추구미 추출 전체 플로우: 사진 입력(업로드/카메라/URL/저장된 연예인 사진) → 분석 가능 여부 → 분석 → onComplete.
 * 다른 앱에서 "@celeber/celeb-vibe/flow"로 import. API는 apiBase + '/api/vibe/*', '/api/uploads'.
 */
import { useCallback, useEffect, useState } from 'react';
import type { ImageRef, VibeAnalysis } from '@celeber/core/contracts';
import { Button, Card, EmptyState, FileButton, ImagePickerGrid, MockBadge, Notice, StepIndicator, Tabs } from '@celeber/ui';
import type { CelebImageOption } from '../lib/summary';
import { ACCEPT_IMAGES, importVibeUrl, listCelebImageOptionsApi, uploadVibeDataUrl, uploadVibeImage } from './api';
import { CameraCapture } from './camera-capture';
import { VibeAnalyzer } from './vibe-analyzer';

export interface VibeFlowProps {
  apiBase?: string;
  /** 미리 채울 인물 이름 (메타데이터) */
  initialCelebName?: string;
  /** search-celeb 저장 사진 탭 표시 (기본 true) */
  showSavedCelebImages?: boolean;
  onComplete: (result: { analysis: VibeAnalysis; warning?: string }) => void;
}

type Source = 'upload' | 'camera' | 'url' | 'saved';
const STEPS = ['사진 선택', '분석 가능 여부', '추구미 분석'];

interface Picked {
  image: ImageRef;
  celebId?: string;
  celebImageId?: string;
}

export function VibeFlow({ apiBase = '', initialCelebName = '', showSavedCelebImages = true, onComplete }: VibeFlowProps) {
  const [celebName, setCelebName] = useState(initialCelebName);
  const [source, setSource] = useState<Source>('upload');
  const [picked, setPicked] = useState<Picked | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [camera, setCamera] = useState(false);
  const [saved, setSaved] = useState<CelebImageOption[] | null>(null);
  const [savedSel, setSavedSel] = useState<string | null>(null);

  const take = useCallback(async (p: Promise<ImageRef>) => {
    setBusy(true);
    setError(null);
    try {
      const image = await p;
      setPicked({ image });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (source !== 'saved' || saved !== null) return;
    let cancelled = false;
    listCelebImageOptionsApi(apiBase)
      .then((items) => {
        if (!cancelled) setSaved(items);
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setSaved([]);
          setError(e.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [apiBase, saved, source]);

  const reset = () => {
    setPicked(null);
    setError(null);
  };

  if (camera) {
    return (
      <CameraCapture
        onClose={() => setCamera(false)}
        onCapture={(dataUrl) => {
          setCamera(false);
          void take(uploadVibeDataUrl(dataUrl, apiBase));
        }}
        onUpload={(file) => {
          setCamera(false);
          void take(uploadVibeImage(file, apiBase));
        }}
      />
    );
  }

  if (picked) {
    return (
      <div className="cb-stack">
        <StepIndicator steps={STEPS} current={1} />
        <VibeAnalyzer
          key={picked.image.uploadId}
          image={picked.image}
          apiBase={apiBase}
          celebName={celebName.trim() || undefined}
          celebId={picked.celebId}
          celebImageId={picked.celebImageId}
          onComplete={onComplete}
          onPickAnother={reset}
        />
      </div>
    );
  }

  const savedItem = saved?.find((s) => s.id === savedSel);

  return (
    <div className="cb-stack">
      <StepIndicator steps={STEPS} current={0} />
      <label className="cb-stack-sm" style={{ gap: 6 }}>
        <span className="cb-row-title">인물 이름 (선택)</span>
        <input
          value={celebName}
          onChange={(e) => setCelebName(e.target.value)}
          placeholder="예: 좋아하는 배우 이름"
          maxLength={60}
          style={{ height: 48, borderRadius: 12, border: '1px solid var(--cb-line)', padding: '0 14px', font: 'inherit', fontSize: 16, background: 'var(--cb-card)', color: 'var(--cb-ink)' }}
        />
        <span className="cb-caption cb-muted">이름은 기록용으로만 저장합니다. 사진 속 얼굴로 누구인지 판단하지 않습니다.</span>
      </label>

      <Tabs<Source>
        label="사진 가져오기"
        value={source}
        onChange={(v) => {
          setSource(v);
          setError(null);
        }}
        items={[
          { value: 'upload', label: '업로드', icon: 'upload' },
          { value: 'camera', label: '카메라', icon: 'camera' },
          { value: 'url', label: '주소', icon: 'search' },
          ...(showSavedCelebImages ? [{ value: 'saved' as const, label: '저장 사진', icon: 'image' as const }] : []),
        ]}
      />

      {source === 'upload' ? (
        <Card tone="paper">
          <div className="cb-stack-sm">
            <p className="cb-body">한 명이 크게 나온 사진이 정확합니다. 전신이 보이면 하의와 신발까지 분석합니다.</p>
            <FileButton accept={ACCEPT_IMAGES} variant="primary" block onFile={(f) => void take(uploadVibeImage(f, apiBase))}>
              {busy ? '올리는 중' : '사진 선택'}
            </FileButton>
            <p className="cb-caption cb-muted">JPEG · PNG · WebP, 25MB 이하</p>
          </div>
        </Card>
      ) : null}

      {source === 'camera' ? (
        <Card tone="paper">
          <div className="cb-stack-sm">
            <p className="cb-body">잡지·화면 속 사진이나 실제 코디를 촬영합니다. 카메라가 없으면 촬영 화면에서 업로드할 수 있습니다.</p>
            <Button block icon="camera" onClick={() => setCamera(true)}>
              카메라 열기
            </Button>
          </div>
        </Card>
      ) : null}

      {source === 'url' ? (
        <Card tone="paper">
          <form
            className="cb-stack-sm"
            onSubmit={(e) => {
              e.preventDefault();
              if (url.trim()) void take(importVibeUrl(url.trim(), apiBase));
            }}
          >
            <input
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://… 이미지 주소"
              aria-label="이미지 주소"
              style={{ height: 48, borderRadius: 12, border: '1px solid var(--cb-line)', padding: '0 14px', font: 'inherit', fontSize: 16, background: 'var(--cb-card)', color: 'var(--cb-ink)' }}
            />
            <Button type="submit" block loading={busy} disabled={!url.trim()}>
              가져오기
            </Button>
            <p className="cb-caption cb-muted">공개된 http/https 이미지 주소만 가져올 수 있습니다.</p>
          </form>
        </Card>
      ) : null}

      {source === 'saved' ? (
        saved === null ? (
          <p className="cb-body cb-muted">불러오는 중</p>
        ) : saved.length === 0 ? (
          <EmptyState title="저장된 연예인 사진이 없습니다" description="연예인 검색(search-celeb)에서 사진을 저장하면 여기에서 고를 수 있습니다." />
        ) : (
          <div className="cb-stack-sm">
            <ImagePickerGrid
              label="저장된 연예인 사진"
              items={saved.map((s) => ({
                id: s.id,
                src: `${apiBase}${s.image.url}`,
                alt: `${s.celebName} ${s.categoryLabel}`,
                caption: `${s.celebName} · ${s.categoryLabel}`,
                reason: s.analyzable === false ? (s.reasons[0]?.slice(0, 12) ?? '분석 불가') : undefined,
              }))}
              selectedIds={savedSel ? [savedSel] : []}
              onToggle={(id) => setSavedSel((cur) => (cur === id ? null : id))}
            />
            {savedItem?.isMock ? (
              <div className="cb-row">
                <MockBadge />
                <span className="cb-caption cb-muted">데모 검색 이미지(일러스트)입니다.</span>
              </div>
            ) : null}
            <Button
              block
              disabled={!savedItem}
              onClick={() => {
                if (!savedItem) return;
                if (!celebName.trim()) setCelebName(savedItem.celebName);
                setPicked({ image: savedItem.image, celebId: savedItem.celebId, celebImageId: savedItem.id });
              }}
            >
              이 사진으로 분석
            </Button>
          </div>
        )
      ) : null}

      {busy && source !== 'url' ? <p className="cb-caption cb-muted">사진을 올리는 중입니다.</p> : null}
      {error ? (
        <Notice tone="danger" title="사진을 가져오지 못했습니다">
          {error}
        </Notice>
      ) : null}
    </div>
  );
}
