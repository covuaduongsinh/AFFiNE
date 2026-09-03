import { parsePgn } from '@blocksuite/chess-core';
import { describe, expect, it, vi } from 'vitest';

import {
  applyImportedGames,
  isPgnFile,
  titleFromPgnFileName,
} from '../import-apply';

const GAME = parsePgn('[White "A"]\n[Black "B"]\n\n1. e4 e5 *\n');

describe('applyImportedGames', () => {
  it('writes nothing for an empty list', async () => {
    const host = {
      insertOne: vi.fn(() => true),
      createMultiGameDoc: vi.fn(async () => 'doc'),
    };
    expect(await applyImportedGames([], host, 'x')).toEqual({ inserted: 0 });
    expect(host.insertOne).not.toHaveBeenCalled();
    expect(host.createMultiGameDoc).not.toHaveBeenCalled();
  });

  it('inserts a single game in place', async () => {
    const host = {
      insertOne: vi.fn(() => true),
      createMultiGameDoc: vi.fn(async () => 'doc'),
    };
    expect(await applyImportedGames([GAME], host, 'one')).toEqual({
      inserted: 1,
    });
    expect(host.insertOne).toHaveBeenCalledOnce();
    expect(host.createMultiGameDoc).not.toHaveBeenCalled();
  });

  it('falls back to a one-game doc when insertOne fails', async () => {
    const host = {
      insertOne: vi.fn(() => false),
      createMultiGameDoc: vi.fn(async () => 'doc-1'),
    };
    expect(await applyImportedGames([GAME], host, 'one')).toEqual({
      docId: 'doc-1',
      inserted: 1,
    });
    expect(host.createMultiGameDoc).toHaveBeenCalledWith('one', [GAME]);
  });

  it('creates a multi-game doc for two or more games', async () => {
    const host = {
      insertOne: vi.fn(() => true),
      createMultiGameDoc: vi.fn(async () => 'doc-n'),
    };
    const result = await applyImportedGames([GAME, GAME], host, 'two');
    expect(result).toEqual({ docId: 'doc-n', inserted: 2 });
    expect(host.insertOne).not.toHaveBeenCalled();
    expect(host.createMultiGameDoc).toHaveBeenCalledOnce();
  });
});

describe('titleFromPgnFileName', () => {
  it('strips pgn and txt suffixes', () => {
    expect(titleFromPgnFileName('Open.pgn')).toBe('Open');
    expect(titleFromPgnFileName('notes.TXT')).toBe('notes');
  });
});

describe('isPgnFile', () => {
  it('accepts pgn names and chess mime types', () => {
    expect(isPgnFile({ name: 'a.pgn', type: '' } as File)).toBe(true);
    expect(isPgnFile({ name: 'a.txt', type: 'text/plain' } as File)).toBe(true);
    expect(
      isPgnFile({ name: 'a.bin', type: 'application/x-chess-pgn' } as File)
    ).toBe(true);
    expect(isPgnFile({ name: 'a.md', type: 'text/markdown' } as File)).toBe(
      false
    );
  });
});
