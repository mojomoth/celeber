'use client';
/**
 * 사진으로 찾기 결과: 올린 사진 + 사진 구도 + 역이미지 검색 상태 + 사진 속 글자.
 * 후보 목록은 CandidateList로 따로 그린다.
 */
import { AnalyzingOverlay, Chip, MockBadge, Notice, PhotoFrame } from '@celeber/ui';
import { withBase } from '../lib/api';
import type { IdentifyResponse, PhotoFraming } from '../lib/types';
import s from './search-celeb.module.css';

const FRAMING_LABEL: Record<PhotoFraming, string> = {
  'full-body': '전신 사진',
  'upper-body': '상반신 사진',
  'face-closeup': '얼굴 클로즈업',
  'no-person': '인물 없음',
  unknown: '구도 미판정',
};

const REVERSE_LABEL: Record<IdentifyResponse['reverse']['status'], string> = {
  ok: '역이미지 검색 완료',
  unavailable: '역이미지 검색 사용 불가',
  error: '역이미지 검색 실패',
};

export function IdentifyPanel({ previewUrl, result, loading, apiBase = '' }: { previewUrl?: string; result?: IdentifyResponse | null; loading?: boolean; apiBase?: string }) {
  const src = result ? withBase(apiBase, result.upload.url) : previewUrl;
  return (
    <div className="cb-stack">
      <div className={s.photoRow}>
        <div style={{ position: 'relative' }}>
          <PhotoFrame src={src} alt="올린 연예인 사진" label="업로드한 사진" />
          {loading ? <AnalyzingOverlay message="단서 찾는 중" /> : null}
        </div>
        <div className="cb-stack-sm">
          {result ? (
            <>
              <div className="cb-row" style={{ gap: 6, flexWrap: 'wrap' }}>
                <Chip>{FRAMING_LABEL[result.photoCheck.framing]}</Chip>
                {result.photoCheck.personCount !== null ? <Chip>{`${result.photoCheck.personCount}명`}</Chip> : null}
                {result.isMock ? <MockBadge /> : null}
              </div>
              <p className="cb-body" style={{ margin: 0 }}>
                {result.photoCheck.note}
              </p>
              <p className="cb-caption cb-muted" style={{ margin: 0 }}>
                {REVERSE_LABEL[result.reverse.status]}
                {result.reverse.status === 'ok' ? ` · 비슷한 페이지 ${result.reverse.visualMatchCount}건` : ''}
              </p>
              {result.photoText.texts.length ? (
                <div>
                  <div className="cb-caption cb-muted">사진 속 글자</div>
                  <div className={s.texts}>
                    {result.photoText.texts.map((t, i) => (
                      <Chip key={`${i}-${t}`}>{t}</Chip>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : loading ? (
            <p className="cb-body cb-muted" style={{ margin: 0 }}>
              역이미지 검색 결과의 제목과 사진 속 글자에서 이름 후보를 찾고 있습니다.
            </p>
          ) : null}
          <p className={s.policy} style={{ margin: 0 }}>
            얼굴로 인물을 식별하지 않습니다. 검색 결과 제목과 사진 속 글자만 사용하며, 최종 확인은 직접 해 주세요.
          </p>
        </div>
      </div>
      {result?.notices.map((n) => (
        <Notice key={n} tone={result.needsNameSearch ? 'warn' : 'info'}>
          {n}
        </Notice>
      ))}
    </div>
  );
}
