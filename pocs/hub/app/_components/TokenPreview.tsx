import { COOL_GRADIENT, WARM_GRADIENT } from '@celeber/core/personal-color';
import { Button, Chips, COLORS, Gauge, MockBadge, Notice, ReportRow, ReportTable, SPACE, Swatch, WarmCoolBars } from '@celeber/ui';

const COLOR_ROWS: { key: keyof typeof COLORS; name: string; role: string }[] = [
  { key: 'ink', name: '잉크', role: '본문·주 버튼' },
  { key: 'ivory', name: '아이보리', role: '리포트 바탕' },
  { key: 'paper', name: '종이', role: '보조 패널' },
  { key: 'text2', name: '보조 텍스트', role: '설명' },
  { key: 'line', name: '구분선', role: '행 구분' },
  { key: 'iris', name: '아이리스', role: 'BI 강조' },
  { key: 'irisDeep', name: '진한 아이리스', role: '선택 테두리' },
  { key: 'irisSoft', name: '옅은 아이리스', role: '선택 배경' },
  { key: 'mint', name: '민트', role: 'Color Halo' },
  { key: 'lime', name: '라임', role: '데모 배지' },
  { key: 'pink', name: '핑크', role: 'Color Halo' },
  { key: 'coral', name: '코럴', role: 'Color Halo' },
  { key: 'cameraBg', name: '촬영 바탕', role: '카메라 크롬' },
  { key: 'cameraText', name: '촬영 보조', role: '역상 설명' },
  { key: 'ok', name: '확인', role: '촬영 조건 확인' },
  { key: 'warn', name: '주의', role: '재촬영 안내' },
  { key: 'danger', name: '위험', role: '데이터 초기화' },
];

const TYPE_SCALE = [
  { cls: 'cb-screen-title', label: '화면 제목 32/39', sample: '퍼스널컬러' },
  { cls: 'cb-section-title', label: '섹션 제목 21/28', sample: '웜톤 vs 쿨톤 분석' },
  { cls: 'cb-row-title', label: '행 제목 15/22', sample: '피부톤 · 밝은 쿨 베이스' },
  { cls: 'cb-body', label: '본문 14/21', sample: '목 주변 천의 색만 바꿔 비교합니다.' },
  { cls: 'cb-caption', label: '캡션 12/17', sample: '자연광 정면 사진을 권장합니다.' },
];

export function TokenPreview() {
  return (
    <div className="cb-stack">
      <h3 className="cb-row-title">색상</h3>
      <div className="hub-colors">
        {COLOR_ROWS.map((c) => (
          <div key={c.key} className="hub-color">
            <span className="hub-color__chip" style={{ background: COLORS[c.key] }} />
            <span className="hub-color__name">{c.name}</span>
            <span className="cb-caption cb-muted hub-mono">{COLORS[c.key]}</span>
            <span className="cb-caption cb-muted">{c.role}</span>
          </div>
        ))}
      </div>

      <h3 className="cb-row-title">서체</h3>
      <div className="hub-type">
        {TYPE_SCALE.map((t) => (
          <div key={t.cls} className="hub-type__row">
            <span className="cb-caption cb-muted">{t.label}</span>
            <span className={t.cls}>{t.sample}</span>
          </div>
        ))}
      </div>

      <h3 className="cb-row-title">간격 · 모서리</h3>
      <div className="hub-space">
        {Object.entries(SPACE).map(([k, v]) => (
          <div key={k} className="hub-space__row">
            <span className="cb-caption hub-mono">{k}</span>
            <span className="hub-space__bar" style={{ width: v * 4 }} />
            <span className="cb-caption cb-muted">{v}pt</span>
          </div>
        ))}
        <p className="cb-caption cb-muted">기준 너비 390 · 좌우 24 · 카드 모서리 16 · 사진 모서리 14 · 버튼 높이 52 · 터치 44</p>
      </div>

      <h3 className="cb-row-title">구성 요소</h3>
      <div className="cb-stack-sm">
        <Button block>주 버튼</Button>
        <Button block variant="secondary">
          보조 버튼
        </Button>
      </div>
      <Chips items={['#신뢰감', '#지적', '#세련된', '#차분한']} />
      <div className="hub-swatches">
        <Swatch hex="#91A6BE" name="더스티 블루" shape="shirt" />
        <Swatch hex="#39455E" name="소프트 네이비" shape="suit" />
        <Swatch hex="#A7A0B9" name="라벤더 그레이" shape="tie" />
        <Swatch hex="#9B748A" name="모브" shape="circle" />
        <Swatch hex="#4A3B36" name="애쉬 브라운" shape="hair" />
      </div>
      <WarmCoolBars warmPercent={24} coolPercent={76} warmColors={WARM_GRADIENT} coolColors={COOL_GRADIENT} warmMarker={0.24} coolMarker={0.76} />
      <div className="hub-gauge-row">
        <Gauge value={72} label="분석 신뢰도 · 보통" size={88} />
        <ReportTable>
          <ReportRow icon="skin" label="피부톤" value="밝은 쿨 베이스" />
          <ReportRow icon="contrast" label="대비감" value="낮음~중간" />
        </ReportTable>
      </div>
      <Notice tone="warn" title="재촬영 권장">
        백열등 아래에서는 피부가 실제보다 노랗게 측정됩니다.
      </Notice>
      <div className="cb-row">
        <MockBadge />
        <span className="cb-caption cb-muted">키가 없거나 AI가 실패한 결과 옆에 붙는 배지</span>
      </div>
    </div>
  );
}
