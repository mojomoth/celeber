'use client';

import { useState } from 'react';
import type { NamedColor } from '@/data/types';
import { Swatch } from '@/ui';
import s from './screen.module.css';

/** 추천 의상색 견본. 누른 색에 선택 링이 옮겨 간다 (처음엔 첫 색). */
export function Palette({ colors }: { colors: NamedColor[] }) {
  const [selected, setSelected] = useState(0);
  return (
    <div className={s.swatches}>
      {colors.map((c, i) => (
        <button key={c.name} type="button" className={s.swatchBtn} aria-pressed={i === selected} onClick={() => setSelected(i)}>
          <Swatch color={c.hex} size={46} selected={i === selected} label={c.name} />
        </button>
      ))}
    </div>
  );
}
