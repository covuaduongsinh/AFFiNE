import type { BlockSnapshot } from '@blocksuite/store';
import { describe, expect, it } from 'vitest';

import { chessGamePdfAdapterMatcher } from '../adapters/pdf.js';
import { ChessGameBlockSchema, EMPTY_PGN } from '../model.js';

const snapshot: BlockSnapshot = {
  type: 'block',
  id: 'block:game',
  flavour: 'affine:chess-game',
  props: {},
  children: [],
};

const render = async (props: Record<string, unknown>) =>
  await chessGamePdfAdapterMatcher.toContent(snapshot, {
    props,
    baseIndent: 0,
  });

const svgOf = (entry: unknown): string | undefined => {
  if (entry && typeof entry === 'object' && 'svg' in entry) {
    const svg = entry.svg;
    if (typeof svg === 'string') return svg;
  }
  return undefined;
};

const textOf = (entry: unknown): string | undefined => {
  if (entry && typeof entry === 'object' && 'text' in entry) {
    const text = entry.text;
    if (typeof text === 'string') return text;
  }
  return undefined;
};

describe('chess game pdf adapter', () => {
  it('claims the flavour it is registered for', () => {
    expect(chessGamePdfAdapterMatcher.flavour).toBe(
      ChessGameBlockSchema.model.flavour
    );
    expect(chessGamePdfAdapterMatcher.flavour).toBe('affine:chess-game');
  });

  it('prints the board plus the movetext', async () => {
    const content = await render({ pgn: '1. e4 e5 2. Nf3 *' });
    expect(svgOf(content[0])).toContain('<svg');
    expect(svgOf(content[0])).not.toContain('<text');
    const texts = content.map(textOf).filter(text => text !== undefined);
    expect(texts.some(text => text.includes('Nf3'))).toBe(true);
    // Headers are dropped: the movetext is the reader's content.
    expect(texts.some(text => text.includes('['))).toBe(false);
  });

  it('draws the position the reader is looking at', async () => {
    const start = svgOf((await render({ pgn: '1. e4 e5 *' }))[0]);
    const afterE4 = svgOf(
      (await render({ pgn: '1. e4 e5 *', currentPath: [0] }))[0]
    );
    expect(afterE4).not.toBe(start);
    // A path that does not exist falls back to the setup position.
    expect(
      svgOf((await render({ pgn: '1. e4 e5 *', currentPath: [9] }))[0])
    ).toBe(start);
  });

  it('captions from the PGN headers when the block has none', async () => {
    const content = await render({
      pgn: '[White "Carlsen, M"]\n[Black "Nakamura, H"]\n\n1. e4 *',
    });
    expect(content.map(textOf)).toContain('Carlsen, M – Nakamura, H');
  });

  it('says nothing rather than captioning a headerless game', async () => {
    const content = await render({ pgn: '1. e4 *' });
    expect(JSON.stringify(content)).not.toContain('? – ?');
  });

  it('keeps an unreadable PGN verbatim and draws no board', async () => {
    const content = await render({ pgn: '[[[[' });
    expect(content.every(entry => svgOf(entry) === undefined)).toBe(true);
    expect(content.map(textOf)).toContain('[[[[');
  });

  it('draws the start position for an empty game and no movetext', async () => {
    const content = await render({ pgn: EMPTY_PGN });
    expect(svgOf(content[0])).toContain('<g transform="translate(0 7)');
    expect(content).toHaveLength(1);
  });

  it('leaves the engine overlay out of the PDF', async () => {
    const content = await render({
      pgn: '1. e4 *',
      analysisJson: '{"scan":"secret"}',
    });
    expect(JSON.stringify(content)).not.toContain('secret');
  });
});
