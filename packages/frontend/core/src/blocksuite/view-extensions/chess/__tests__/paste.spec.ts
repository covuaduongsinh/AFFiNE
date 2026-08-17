import { START_FEN } from '@blocksuite/chess-core';
import { describe, expect, it } from 'vitest';

import { chessPasteMiddleware } from '../paste';

/**
 * Exercises the middleware against the exact snapshot shape the plain-text
 * adapter produces: one `affine:note` whose children are a paragraph per line.
 */
interface TestBlock {
  type: string;
  id: string;
  flavour: string;
  props: Record<string, unknown>;
  children: TestBlock[];
}

type Handler = (payload: unknown) => void;

function runMiddleware(content: TestBlock[]) {
  const handlers: Handler[] = [];
  const slots = {
    beforeImport: {
      subscribe: (fn: Handler) => {
        handlers.push(fn);
        return { unsubscribe: () => {} };
      },
    },
  };

  const snapshot = { type: 'slice', content };
  // The middleware only touches `slots`, so a stub context is enough.
  const dispose = chessPasteMiddleware()({ slots } as unknown as Parameters<
    ReturnType<typeof chessPasteMiddleware>
  >[0]);
  for (const handler of handlers) handler({ type: 'slice', snapshot });
  dispose?.();

  return snapshot;
}

function pastedText(...lines: string[]): TestBlock[] {
  return [
    {
      type: 'block',
      id: 'note',
      flavour: 'affine:note',
      props: {},
      children: lines.map((line, index) => ({
        type: 'block',
        id: `p${index}`,
        flavour: 'affine:paragraph',
        props: {
          type: 'text',
          text: {
            '$blocksuite:internal:text$': true,
            delta: [{ insert: line }],
          },
        },
        children: [],
      })),
    },
  ];
}

const block = (flavour: string): TestBlock => ({
  type: 'block',
  id: flavour,
  flavour,
  props: {},
  children: [],
});

describe('chess paste middleware', () => {
  it('turns a pasted FEN into a board block', () => {
    const { content } = runMiddleware(pastedText(START_FEN));
    const children = content[0].children;

    expect(children).toHaveLength(1);
    expect(children[0].flavour).toBe('affine:chess-board');
    expect(children[0].props.fen).toBe(START_FEN);
    expect(children[0].props.editable).toBe(true);
  });

  it('turns a pasted multi-line PGN into a game block', () => {
    const { content } = runMiddleware(
      pastedText('[Event "Test"]', '[Result "1-0"]', '', '1. e4 e5 2. Qh5 1-0')
    );
    const children = content[0].children;

    expect(children).toHaveLength(1);
    expect(children[0].flavour).toBe('affine:chess-game');
    expect(children[0].props.pgn).toContain('1. e4 e5 2. Qh5 1-0');
    expect(children[0].props.currentPath).toEqual([]);
  });

  it('leaves ordinary prose untouched', () => {
    const { content } = runMiddleware(
      pastedText('I played e4', 'and he answered e5.')
    );
    const children = content[0].children;

    expect(children).toHaveLength(2);
    expect(children[0].flavour).toBe('affine:paragraph');
  });

  it('ignores a slice that is not a single note of paragraphs', () => {
    const { content } = runMiddleware([block('affine:image')]);
    expect(content[0].flavour).toBe('affine:image');
  });

  it('ignores a note containing a non-paragraph child', () => {
    const input = pastedText(START_FEN);
    input[0].children.push(block('affine:code'));

    const { content } = runMiddleware(input);
    // Untouched: the FEN paragraph and the code block are both still there.
    expect(content[0].children).toHaveLength(2);
  });
});
