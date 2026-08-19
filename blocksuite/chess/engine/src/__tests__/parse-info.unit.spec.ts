import { describe, expect, it } from 'vitest';

import { parseUciLine } from '../parse-info';

describe('parseUciLine', () => {
  it('reads a typical multipv info line', () => {
    const parsed = parseUciLine(
      'info depth 14 seldepth 22 multipv 2 score cp 32 nodes 12345 nps 456789 time 27 pv e2e4 e7e5 g1f3'
    );
    expect(parsed).toEqual({
      kind: 'info',
      info: {
        depth: 14,
        seldepth: 22,
        multipv: 2,
        score: { type: 'cp', value: 32 },
        pv: ['e2e4', 'e7e5', 'g1f3'],
        nodes: 12345,
        nps: 456789,
        timeMs: 27,
      },
    });
  });

  it('reads mate scores and skips bound flags', () => {
    const parsed = parseUciLine(
      'info depth 12 score mate -3 lowerbound pv e5f7'
    );
    expect(parsed.kind).toBe('info');
    if (parsed.kind !== 'info') return;
    expect(parsed.info.score).toEqual({ type: 'mate', value: -3 });
    expect(parsed.info.pv).toEqual(['e5f7']);
    expect(parsed.info.multipv).toBe(1);
  });

  it('parses bestmove with and without ponder', () => {
    expect(parseUciLine('bestmove e2e4 ponder e7e5')).toEqual({
      kind: 'bestmove',
      bestmove: 'e2e4',
      ponder: 'e7e5',
    });
    expect(parseUciLine('bestmove e2e4')).toEqual({
      kind: 'bestmove',
      bestmove: 'e2e4',
      ponder: undefined,
    });
    expect(parseUciLine('bestmove (none)')).toEqual({
      kind: 'bestmove',
      bestmove: '',
    });
  });

  it('recognises handshake lines and ignores diagnostics', () => {
    expect(parseUciLine('uciok')).toEqual({ kind: 'uciok' });
    expect(parseUciLine('readyok')).toEqual({ kind: 'readyok' });
    expect(parseUciLine('id name Arasan 25.3')).toEqual({
      kind: 'id',
      key: 'name',
      value: 'Arasan 25.3',
    });
    expect(parseUciLine('info string NNUE loaded')).toEqual({ kind: 'ignore' });
    expect(
      parseUciLine('info depth 14 time 800 nodes 12345 nps 1000 hashfull 40')
    ).toEqual({ kind: 'ignore' });
    expect(parseUciLine('option name Hash type spin')).toEqual({
      kind: 'ignore',
    });
    expect(parseUciLine('')).toEqual({ kind: 'ignore' });
  });
});
