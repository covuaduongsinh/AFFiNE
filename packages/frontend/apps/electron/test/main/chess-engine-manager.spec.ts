import { describe, expect, test, vi } from 'vitest';

vi.mock('../../src/main/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { NativeChessEngine } from '../../src/main/chess-engine/manager';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('NativeChessEngine', () => {
  test('rejects an unreadable FEN before spawning', async () => {
    const engine = new NativeChessEngine();
    await expect(
      engine.analyze({ jobId: 'bad', fen: 'not-a-fen' })
    ).rejects.toThrow();
  });

  test('reports unavailable when no binary is installed', () => {
    const previous = process.env.AFFINE_ARASAN_DIR;
    process.env.AFFINE_ARASAN_DIR = 'D:\\definitely-missing-arasan';
    try {
      const engine = new NativeChessEngine();
      expect(engine.status()).toEqual({
        available: false,
        backend: 'native',
        version: '26.0',
      });
    } finally {
      if (previous === undefined) delete process.env.AFFINE_ARASAN_DIR;
      else process.env.AFFINE_ARASAN_DIR = previous;
    }
  });

  test('accepts the starting FEN shape used by analyze', async () => {
    const { parseFen } = await import('@blocksuite/chess-core');
    expect(() => parseFen(START_FEN)).not.toThrow();
  });
});
