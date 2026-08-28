import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchLichessPgn } from '../lichess';

const GAME = `[Event "Rated"]\n[White "A"]\n[Black "B"]\n\n1. e4 e5 1-0\n`;
const TWO = `${GAME}\n${GAME}`;

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(status: number, body: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(body, {
          status,
          headers: { 'Content-Type': 'application/x-chess-pgn' },
        })
    )
  );
}

describe('fetchLichessPgn', () => {
  it('returns a game PGN on 200', async () => {
    stubFetch(200, GAME);
    const text = await fetchLichessPgn({ kind: 'game', id: 'abcdefgh' });
    expect(text).toContain('1. e4');
  });

  it('returns a user collection on 200', async () => {
    stubFetch(200, TWO);
    const text = await fetchLichessPgn({ kind: 'user', username: 'alice' }, 2);
    expect(text.split('[Event').length - 1).toBe(2);
  });

  it('maps 404 and 429', async () => {
    stubFetch(404, '');
    await expect(
      fetchLichessPgn({ kind: 'game', id: 'missing1' })
    ).rejects.toThrow('lichess_not_found');
    stubFetch(429, '');
    await expect(
      fetchLichessPgn({ kind: 'user', username: 'alice' })
    ).rejects.toThrow('lichess_rate_limit');
  });
});
