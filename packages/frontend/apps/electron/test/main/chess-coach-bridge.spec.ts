import { describe, expect, test } from 'vitest';

import {
  completeRendererTool,
  requestRendererTool,
  resetRendererToolBridge,
} from '../../src/main/chess-coach/bridge';
import { chessCoachSubjects } from '../../src/main/chess-coach/events';

describe('renderer tool bridge', () => {
  test('resolves when the renderer posts a toolResult', async () => {
    const seen: string[] = [];
    const off = chessCoachSubjects.toolCall$.subscribe(req => {
      seen.push(req.name);
      completeRendererTool(req.requestId, {
        ok: true,
        payload: { from: 'renderer' },
      });
    });
    try {
      const result = await requestRendererTool('chess.read_doc', {});
      expect(result).toEqual({ ok: true, payload: { from: 'renderer' } });
      expect(seen).toEqual(['chess.read_doc']);
    } finally {
      off.unsubscribe();
      resetRendererToolBridge();
    }
  });

  test('times out with a clear error when nobody answers', async () => {
    const result = await requestRendererTool('chess.read_doc', {}, 20);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('engine_unavailable');
      expect(result.error).toMatch(/timed out/i);
    }
    resetRendererToolBridge();
  });
});
