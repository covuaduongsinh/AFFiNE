import { describe, expect, it } from 'vitest';

import { parsePgn } from '../pgn.js';

/**
 * PGN as it actually arrives from the sites coaches copy from.
 *
 * The editor disables Save whenever `parsePgn` throws, so anything rejected
 * here is a game the user simply cannot get into the app — the editor opens,
 * shows the text, and refuses to accept it.
 */
const SAMPLES: Array<{ name: string; pgn: string }> = [
  {
    name: 'lichess export with clock comments',
    pgn: `[Event "Rated Blitz game"]
[Site "https://lichess.org/abcd1234"]
[Date "2024.03.11"]
[White "coach"]
[Black "student"]
[Result "1-0"]
[UTCDate "2024.03.11"]
[UTCTime "18:22:01"]
[WhiteElo "1712"]
[BlackElo "1688"]
[TimeControl "300+3"]
[Termination "Normal"]

1. e4 { [%clk 0:05:00] } 1... c5 { [%clk 0:05:00] } 2. Nf3 { [%clk 0:05:01] } 2... d6 { [%clk 0:05:02] } 3. d4 { [%clk 0:04:58] } 1-0`,
  },
  {
    name: 'chess.com export with a %-escape line',
    pgn: `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2024.06.02"]
[Round "-"]
[White "Player1"]
[Black "Player2"]
[Result "0-1"]
[ECO "B01"]
[CurrentPosition "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -"]

1. e4 d5 2. exd5 Qxd5 3. Nc3 Qa5 0-1`,
  },
  {
    name: 'numeric NAGs',
    pgn: '1. e4 $1 e5 $2 2. Nf3 $146 Nc6 *',
  },
  {
    name: 'no space after the move number',
    pgn: '1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 *',
  },
  {
    name: 'black continuation numbering',
    pgn: '1. e4 e5 2. Nf3 { a comment } 2... Nc6 3. Bb5 *',
  },
  {
    // Black must clear g8 as well, or the sample tests nothing but its own typo.
    name: 'castling written with zeros',
    pgn: '1. e4 e5 2. Nf3 Nf6 3. Bc4 Bc5 4. 0-0 0-0 *',
  },
  {
    name: 'promotion, check and mate marks',
    pgn: '1. e4 e5 2. Nf3 f6 3. Nxe5 fxe5 4. Qh5+ Ke7 5. Qxe5+ Kf7 6. Bc4+ Kg6 7. Qf5+ Kh6 8. d4+ g5 9. h4 Kg7 10. Qf7# *',
  },
  {
    name: 'no result token at all',
    pgn: '1. e4 e5 2. Nf3 Nc6',
  },
  {
    name: 'a draw',
    pgn: '[Result "1/2-1/2"]\n\n1. e4 e5 1/2-1/2',
  },
  {
    name: 'comment spanning several lines',
    pgn: `1. e4 {This is a long note
that wraps onto a second line.} e5 2. Nf3 *`,
  },
  {
    name: 'nested variations with comments',
    pgn: '1. e4 e5 (1... c5 {the Sicilian} 2. Nf3 (2. Nc3 Nc6) 2... d6) 2. Nf3 *',
  },
  {
    name: 'annotated move with a suffix symbol',
    pgn: '1. e4! e5?! 2. Nf3!? Nc6?? 3. Bb5!! a6 *',
  },
  {
    name: 'crlf line endings',
    pgn: '[Event "CRLF"]\r\n[Result "*"]\r\n\r\n1. e4 e5 2. Nf3 *\r\n',
  },
  {
    name: 'moves that start on the tag line block without a blank line',
    pgn: '[Event "No blank line"]\n[Result "*"]\n1. e4 e5 *',
  },
];

describe('parsePgn on real-world exports', () => {
  for (const { name, pgn } of SAMPLES) {
    it(name, () => {
      expect(() => parsePgn(pgn)).not.toThrow();
    });
  }
});
