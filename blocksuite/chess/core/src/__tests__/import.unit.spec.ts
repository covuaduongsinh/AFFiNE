import { describe, expect, it } from 'vitest';

import {
  captionFromHeaders,
  formatMovePreview,
  lichessExportUrl,
  lichessUserGamesUrl,
  parseLichessRef,
} from '../import';
import { importPgnGames, parsePgn, parsePgnGames } from '../pgn';

const GAME_A = `[Event "Open"]
[Site "Ha Noi"]
[Date "2026.01.01"]
[Round "1"]
[White "Carlsen, M"]
[Black "Nakamura, H"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 1-0
`;

const GAME_B = `[Event "Closed"]
[White "Ding"]
[Black "Giri"]
[Result "1/2-1/2"]

1. d4 Nf6 2. c4 e6 1/2-1/2
`;

const ILLEGAL = `[Event "Broken"]
[White "A"]
[Black "B"]
[Result "*"]

1. e5 *
`;

const SCHOLARS = `[Event "Casual"]
[White "White"]
[Black "Black"]
[Result "*"]

1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# *
`;

describe('importPgnGames', () => {
  it('keeps legal games and records illegal chunks', () => {
    const file = `${GAME_A}\n${ILLEGAL}\n${GAME_B}`;
    const result = importPgnGames(file);
    expect(result.games).toHaveLength(2);
    expect(result.skipped).toHaveLength(1);
    expect(result.games[0].headers.White).toBe('Carlsen, M');
    expect(result.games[1].headers.White).toBe('Ding');
    expect(result.skipped[0].index).toBe(1);
    expect(result.skipped[0].error.length).toBeGreaterThan(0);
  });

  it('returns empty lists when the file has no games', () => {
    expect(importPgnGames('   \n\n')).toEqual({ games: [], skipped: [] });
  });

  it('does not change parsePgn / parsePgnGames abort behaviour', () => {
    expect(() => parsePgn(ILLEGAL)).toThrow();
    expect(() => parsePgnGames(`${GAME_A}\n${ILLEGAL}`)).toThrow();
    expect(parsePgnGames(`${GAME_A}\n${GAME_B}`)).toHaveLength(2);
  });
});

describe('captionFromHeaders', () => {
  it('joins players and drops a trailing event separator', () => {
    expect(
      captionFromHeaders({ White: 'Carlsen, M', Black: 'Nakamura, H' })
    ).toBe('Carlsen, M – Nakamura, H');
    expect(
      captionFromHeaders({
        White: 'Carlsen, M',
        Black: 'Nakamura, H',
        Event: 'Open',
      })
    ).toBe('Carlsen, M – Nakamura, H · Open');
    expect(captionFromHeaders({})).toBe('? – ?');
  });
});

describe('formatMovePreview', () => {
  it('labels Scholar’s mate path [0,0,0] after Bc4', () => {
    const game = parsePgn(SCHOLARS);
    expect(formatMovePreview(game, [0, 0, 0])).toBe('2. Bc4');
    expect(formatMovePreview(game, [0])).toBe('1. e4');
    expect(formatMovePreview(game, [0, 0])).toBe('1... e5');
    expect(formatMovePreview(game, [9])).toBe('');
  });
});

describe('parseLichessRef', () => {
  it('reads game URLs, export paths, and 8-char ids', () => {
    expect(parseLichessRef('https://lichess.org/abcdefgh')).toEqual({
      kind: 'game',
      id: 'abcdefgh',
    });
    expect(parseLichessRef('https://lichess.org/AbCdEfGh/black')).toEqual({
      kind: 'game',
      id: 'abcdefgh',
    });
    expect(parseLichessRef('https://lichess.org/abcdefgh#12')).toEqual({
      kind: 'game',
      id: 'abcdefgh',
    });
    expect(parseLichessRef('https://lichess.org/game/export/abcdefgh')).toEqual(
      {
        kind: 'game',
        id: 'abcdefgh',
      }
    );
    expect(parseLichessRef('AbCdEfGh')).toEqual({
      kind: 'game',
      id: 'abcdefgh',
    });
  });

  it('reads username URLs and bare usernames', () => {
    expect(
      parseLichessRef('https://lichess.org/api/games/user/DrNykterstein')
    ).toEqual({ kind: 'user', username: 'DrNykterstein' });
    expect(parseLichessRef('DrNykterstein')).toEqual({
      kind: 'user',
      username: 'DrNykterstein',
    });
  });

  it('rejects prose', () => {
    expect(parseLichessRef('check out this game please')).toBeNull();
    expect(parseLichessRef('')).toBeNull();
  });
});

describe('lichess URL builders', () => {
  it('builds public export URLs and clamps max', () => {
    expect(lichessExportUrl('abcdefgh')).toBe(
      'https://lichess.org/game/export/abcdefgh?evals=0&clocks=1'
    );
    expect(lichessUserGamesUrl('alice', 50)).toBe(
      'https://lichess.org/api/games/user/alice?max=50&clocks=1&evals=0&opening=1'
    );
    expect(lichessUserGamesUrl('alice', 0)).toContain('max=1');
    expect(lichessUserGamesUrl('alice', 999)).toContain('max=200');
  });
});
