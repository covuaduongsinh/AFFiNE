import { describe, expect, it } from 'vitest';

import { fenToSvg } from '../board-svg';
import { START_FEN } from '../fen';

const count = (svg: string, needle: string) => svg.split(needle).length - 1;

describe('fenToSvg', () => {
  it('draws every square and every piece of the start position', () => {
    const svg = fenToSvg(START_FEN);
    expect(count(svg, '<rect')).toBe(64);
    expect(count(svg, '<g transform=')).toBe(32);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(
      true
    );
    expect(svg).toContain('viewBox="0 0 8 8"');
    expect(svg).toContain('width="320" height="320"');
  });

  it('flips the board when black is at the bottom', () => {
    expect(fenToSvg(START_FEN, { orientation: 'white' })).toContain(
      'transform="translate(0 7)'
    );
    expect(fenToSvg(START_FEN, { orientation: 'black' })).toContain(
      'transform="translate(7 0)'
    );
  });

  it('still draws a board for unparseable input, skipping non-pieces', () => {
    const svg = fenToSvg('not a fen');
    expect(count(svg, '<rect')).toBe(64);
    // `readPlacement` is lenient and keeps unknown letters: only the `n` of
    // "not" is a piece, `o` and `t` have no glyph and are dropped.
    expect(count(svg, '<g transform=')).toBe(1);
    expect(count(fenToSvg('xyz/wv'), '<g transform=')).toBe(0);
  });

  it('drops highlight colours it cannot vouch for', () => {
    const injected = fenToSvg(START_FEN, {
      highlights: [{ square: 'e4', color: 'url(#x)' }],
    });
    expect(injected).not.toContain('url(');

    const accepted = fenToSvg(START_FEN, {
      highlights: [{ square: 'e4', color: '#ffce00' }],
    });
    expect(accepted).toContain(
      '<rect x="4" y="4" width="1" height="1" fill="#ffce00"/>'
    );
  });

  it('draws arrows as a line plus a solid head', () => {
    const svg = fenToSvg(START_FEN, { arrows: [{ from: 'e2', to: 'e4' }] });
    expect(svg).toContain('<line');
    expect(svg).toContain('<polygon');
    // No SVG 2 marker plumbing: pdfmake's renderer ignores it.
    expect(svg).not.toContain('<marker');
  });

  it('skips zero-length arrows', () => {
    const svg = fenToSvg(START_FEN, { arrows: [{ from: 'e2', to: 'e2' }] });
    expect(svg).not.toContain('<polygon');
  });

  it('labels files and ranks unless asked not to', () => {
    const labelled = fenToSvg(START_FEN);
    expect(count(labelled, '<text')).toBe(16);
    expect(labelled).toContain('>a</text>');
    expect(labelled).toContain('>8</text>');
    expect(fenToSvg(START_FEN, { coordinates: false })).not.toContain('<text');
    expect(fenToSvg(START_FEN, { textInSvg: false })).not.toContain('<text');
  });

  it('renders correctly with all supported piece sets', () => {
    const sets = [
      'staunton',
      'kosal',
      'celtic',
      'rhosgfx',
      'firi',
      'geometric',
    ] as const;
    for (const pieceSet of sets) {
      const svg = fenToSvg(START_FEN, { pieceSet });
      expect(count(svg, '<rect')).toBe(64);
      expect(count(svg, '<g transform=')).toBe(32);
      expect(svg).toContain('viewBox="0 0 8 8"');
    }
  });
});
