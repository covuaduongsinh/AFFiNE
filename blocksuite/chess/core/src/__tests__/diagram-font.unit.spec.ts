import { describe, expect, it } from 'vitest';

import { fenToChessFontText } from '../diagram-font';
import { START_FEN } from '../fen';

describe('fenToChessFontText', () => {
  it('encodes start position with 10 lines of diagram text including borders', () => {
    const text = fenToChessFontText(START_FEN);
    const lines = text.split('\n');
    expect(lines).toHaveLength(10);
    expect(lines[0]).toBe('!"#$%&\'()*');
    expect(lines[1]).toBe('8TmVwLvMt8'); // Black pieces on rank 8
    expect(lines[2]).toBe('7oOoOoOoO7'); // Black pawns on rank 7
    expect(lines[7]).toBe('2PpPpPpPp2'); // White pawns on rank 2
    expect(lines[8]).toBe('1rNbQkBnR1'); // White pieces on rank 1
    expect(lines[9]).toBe('/012345678');
  });

  it('supports black orientation by flipping ranks and files', () => {
    const text = fenToChessFontText(START_FEN, { orientation: 'black' });
    const lines = text.split('\n');
    expect(lines).toHaveLength(10);
    expect(lines[1]).toBe('1RnBkQbNr1'); // White rank 1 from h1 to a1
    expect(lines[8]).toBe('8tMvLwVmT8'); // Black rank 8 from h8 to a8
  });

  it('can omit borders if requested', () => {
    const text = fenToChessFontText(START_FEN, { border: false });
    const lines = text.split('\n');
    expect(lines).toHaveLength(8);
    expect(lines[0]).toBe('TmVwLvMt');
  });

  it('handles empty board and sparse positions gracefully', () => {
    const empty = fenToChessFontText('8/8/8/8/8/8/8/8 w - - 0 1');
    const lines = empty.split('\n');
    expect(lines).toHaveLength(10);
    expect(lines[1]).toBe('8 + + + +8');
    expect(lines[2]).toBe('7+ + + + 7');
  });
});
