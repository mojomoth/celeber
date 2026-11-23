// 검증 프로브(라운드 2): 앉은 사진에서 한쪽 무릎 visibility만 0.5 아래로 내리면 not-standing 검사가 건너뛰어지는지
import { expect, it } from 'vitest';
import { loadFixture } from '../../../../../pocs/camera-body/test/fixture';
import { computeBodyAnalysis } from '../../../../../pocs/camera-body/src/lib/analyze';

for (const name of ['g-sit', 'g-sit2']) {
  it(name, () => {
    const base = computeBodyAnalysis(loadFixture(name));
    const inp = loadFixture(name);
    inp.landmarks[25] = { ...inp.landmarks[25], visibility: 0.49 };
    const hid = computeBodyAnalysis(inp);
    console.log(name, 'base', base.status, base.failureReasons.map((r) => r.code).join(','), '| knee25 vis 0.49 ->', hid.status, hid.ratios?.headsTall, hid.ratios?.legToHeight, hid.ratios?.thighToShin, hid.failureReasons.map((r) => r.code).join(','));
    expect(base.status).toBe('failed');
  });
}
