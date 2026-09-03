import { describe, expect, it } from 'vitest';

import type { ChessCommentTarget, DocCommentContent } from '../types';

const chess: ChessCommentTarget = {
  blockId: 'block-1',
  path: [0],
  san: 'e4',
};

describe('chess comment target', () => {
  it('commit keeps chess on content', () => {
    const pending = {
      preview: '1. e4',
      attachments: [],
      chess,
    };
    const content: DocCommentContent = {
      snapshot: { type: 'page' } as never,
      preview: pending.preview,
      attachments: pending.attachments,
      ...(pending.chess ? { chess: pending.chess } : {}),
    };
    expect(content.chess?.path).toEqual([0]);
    expect(content.chess?.san).toBe('e4');
  });

  it('list payload parses chess.path', () => {
    const raw = JSON.stringify({
      preview: '1. e4',
      chess,
    });
    const listed = JSON.parse(raw) as { chess?: ChessCommentTarget };
    expect(listed.chess?.path).toEqual([0]);
  });
});
