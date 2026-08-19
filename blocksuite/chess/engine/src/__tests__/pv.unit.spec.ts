import { START_FEN } from '@blocksuite/chess-core';
import { describe, expect, it } from 'vitest';

import { pvUciToSan } from '../pv';

describe('pvUciToSan', () => {
  it('renders a starting-position PV as SAN', () => {
    expect(pvUciToSan(START_FEN, ['e2e4', 'e7e5', 'g1f3'])).toEqual([
      'e4',
      'e5',
      'Nf3',
    ]);
  });

  it('stops at the first illegal token instead of throwing', () => {
    expect(pvUciToSan(START_FEN, ['e2e4', 'e2e4', 'g1f3'])).toEqual(['e4']);
  });

  it('returns an empty list for an empty PV', () => {
    expect(pvUciToSan(START_FEN, [])).toEqual([]);
  });
});
