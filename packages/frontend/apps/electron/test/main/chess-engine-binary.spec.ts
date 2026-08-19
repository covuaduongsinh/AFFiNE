import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import fs from 'fs-extra';
import { afterEach, describe, expect, test } from 'vitest';

import {
  arasanExecutableName,
  listArasanBinaries,
  resolveArasanBinary,
} from '../../src/main/chess-engine/binary';

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map(dir => fs.remove(dir)));
});

async function tempDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'affine-arasan-'));
  dirs.push(dir);
  return dir;
}

describe('resolveArasanBinary', () => {
  test('prefers the avx2 build when both exist', async () => {
    const dir = await tempDir();
    await writeFile(path.join(dir, 'arasanx-64.exe'), 'sse2');
    await writeFile(path.join(dir, 'arasanx-64-avx2.exe'), 'avx2');
    expect(listArasanBinaries({ dir, platform: 'win32', variant: '' })).toEqual(
      [path.join(dir, 'arasanx-64-avx2.exe'), path.join(dir, 'arasanx-64.exe')]
    );
    expect(resolveArasanBinary({ dir, platform: 'win32', variant: '' })).toBe(
      path.join(dir, 'arasanx-64-avx2.exe')
    );
  });

  test('AFFINE_ARASAN_VARIANT=sse2 forces the portable binary', async () => {
    const dir = await tempDir();
    await writeFile(path.join(dir, 'arasanx-64.exe'), 'sse2');
    await writeFile(path.join(dir, 'arasanx-64-avx2.exe'), 'avx2');
    expect(
      resolveArasanBinary({ dir, platform: 'win32', variant: 'sse2' })
    ).toBe(path.join(dir, 'arasanx-64.exe'));
  });

  test('returns null when the folder is empty', async () => {
    const dir = await tempDir();
    await mkdir(dir, { recursive: true });
    expect(resolveArasanBinary({ dir, platform: 'win32' })).toBeNull();
  });

  test('finds the vendored folder from the electron package cwd', () => {
    const previous = process.env.AFFINE_ARASAN_DIR;
    delete process.env.AFFINE_ARASAN_DIR;
    const cwd = process.cwd();
    process.chdir(path.join(__dirname, '../..'));
    try {
      const binary = resolveArasanBinary({ platform: 'win32' });
      expect(binary).toMatch(/arasanx-64/);
    } finally {
      process.chdir(cwd);
      if (previous === undefined) delete process.env.AFFINE_ARASAN_DIR;
      else process.env.AFFINE_ARASAN_DIR = previous;
    }
  });

  test('names a unix binary without .exe', () => {
    expect(arasanExecutableName('linux', 'avx2')).toBe('arasanx-64-avx2');
    expect(arasanExecutableName('win32', 'sse2')).toBe('arasanx-64.exe');
  });
});
