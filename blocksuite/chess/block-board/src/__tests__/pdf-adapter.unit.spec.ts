import type { BlockSnapshot } from '@blocksuite/store';
import { describe, expect, it } from 'vitest';

import { chessBoardPdfAdapterMatcher } from '../adapters/pdf.js';
import { ChessBoardBlockSchema, START_FEN } from '../model.js';

const snapshot: BlockSnapshot = {
  type: 'block',
  id: 'block:board',
  flavour: 'affine:chess-board',
  props: {},
  children: [],
};

const render = async (props: Record<string, unknown>) =>
  await chessBoardPdfAdapterMatcher.toContent(snapshot, {
    props,
    baseIndent: 0,
  });

/** Narrows a pdfmake content entry to the SVG shape without an unchecked cast. */
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

describe('chess board pdf adapter', () => {
  it('claims the flavour it is registered for', () => {
    expect(chessBoardPdfAdapterMatcher.flavour).toBe(
      ChessBoardBlockSchema.model.flavour
    );
    expect(chessBoardPdfAdapterMatcher.flavour).toBe('affine:chess-board');
  });

  it('draws the clean position as a sized vector board without <text> tags', async () => {
    const content = await render({ fen: START_FEN, orientation: 'white' });
    expect(content).toHaveLength(1);
    expect(svgOf(content[0])).toContain('<svg');
    expect(svgOf(content[0])).not.toContain('<text');
    expect(content[0]).toMatchObject({ width: 320, height: 320 });
  });

  it('falls back to the start position when the fen is missing', async () => {
    const empty = svgOf((await render({}))[0]);
    expect(empty).toBe(svgOf((await render({ fen: START_FEN }))[0]));
    expect(svgOf((await render({ fen: '   ' }))[0])).toBe(empty);
  });

  it('prints the caption under the board', async () => {
    const content = await render({ fen: START_FEN, caption: 'Thế bắt đầu' });
    expect(content).toHaveLength(2);
    expect(textOf(content[1])).toBe('Thế bắt đầu');
  });

  it('carries annotations onto the diagram and drops malformed ones', async () => {
    const content = await render({
      fen: START_FEN,
      arrows: [{ from: 'e2', to: 'e4' }, { from: 'e2' }, 'nonsense'],
      highlights: [{ square: 'e4', color: '#ffce00' }, { square: 'e5' }],
    });
    const svg = svgOf(content[0]) ?? '';
    expect(svg).toContain('<polygon');
    expect(svg.split('<polygon').length - 1).toBe(1);
    expect(svg).toContain('fill="#ffce00"');
    expect(content[0]).toMatchObject({ width: 320, height: 320 });
  });

  it('leaves the Obsidian round-trip payload out of the PDF', async () => {
    const content = await render({
      fen: START_FEN,
      extraLines: ['style: pixel'],
      extraAnnotations: ['Ce4'],
    });
    expect(JSON.stringify(content)).not.toContain('pixel');
    expect(JSON.stringify(content)).not.toContain('Ce4');
  });

  it('renders chess diagram font text when chessDiagramStyle is font', async () => {
    const configs = new Map<string, unknown>([['chessDiagramStyle', 'font']]);
    const content = await chessBoardPdfAdapterMatcher.toContent(snapshot, {
      props: { fen: START_FEN },
      baseIndent: 0,
      configs,
    });
    expect(content).toHaveLength(1);
    expect(textOf(content[0])).toContain('!"#$%&\'()*');
    expect(content[0]).toMatchObject({ font: 'OpenChessFont', fontSize: 22 });
  });
});
