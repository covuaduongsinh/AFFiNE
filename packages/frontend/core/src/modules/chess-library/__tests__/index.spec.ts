import { describe, expect, it } from 'vitest';

import { chessGameRowId, filterGameRows, rowFromPgn } from '../index-table';

const CARLSEN = `[Event "Open"]
[Site "Wijk"]
[White "Carlsen, M"]
[Black "Nakamura, H"]
[Result "1-0"]
[ECO "C65"]

1. e4 e5 2. Nf3 1-0
`;

const DING = `[Event "Closed"]
[White "Ding"]
[Black "Giri"]
[Result "1/2-1/2"]

1. d4 Nf6 1/2-1/2
`;

describe('rowFromPgn', () => {
  it('indexes headers and still records a broken block', () => {
    const ok = rowFromPgn('doc-a', 'block-1', CARLSEN);
    expect(ok.id).toBe(chessGameRowId('doc-a', 'block-1'));
    expect(ok.white).toBe('Carlsen, M');
    expect(ok.result).toBe('1-0');
    expect(ok.eco).toBe('C65');
    expect(ok.plyCount).toBeGreaterThan(0);

    const broken = rowFromPgn('doc-a', 'block-2', 'not a game');
    expect(broken.white).toBe('');
    expect(broken.plyCount).toBe(0);
    expect(broken.caption).toBe('');
  });
});

describe('filterGameRows', () => {
  const rows = [rowFromPgn('d1', 'b1', CARLSEN), rowFromPgn('d2', 'b2', DING)];

  it('filters by player query', () => {
    expect(filterGameRows(rows, { q: 'Carlsen' })).toHaveLength(1);
    expect(filterGameRows(rows, { q: 'carlsen' })[0].black).toBe('Nakamura, H');
  });

  it('filters by exact result', () => {
    expect(filterGameRows(rows, { result: '1/2-1/2' })).toHaveLength(1);
    expect(filterGameRows(rows, { result: '*' })).toHaveLength(0);
  });
});

describe('rebuild orphans', () => {
  it('drops rows whose block is gone', () => {
    const indexed = [
      rowFromPgn('d1', 'keep', CARLSEN),
      rowFromPgn('d1', 'gone', DING),
    ];
    const live = new Set(['d1:keep']);
    const kept = indexed.filter(row => live.has(row.id));
    expect(kept).toHaveLength(1);
    expect(kept[0].blockId).toBe('keep');
  });
});
