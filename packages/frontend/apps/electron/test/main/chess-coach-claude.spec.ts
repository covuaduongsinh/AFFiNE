import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test, vi } from 'vitest';

vi.mock('../../src/main/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  findClaudeBinary,
  parseClaudeLine,
  queryClaude,
} from '../../src/main/chess-coach/claude';
import {
  firstExistingPath,
  pathCandidates,
} from '../../src/main/chess-coach/spawn-cli';

const fixture = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'fake-claude.mjs'
);

describe('parseClaudeLine', () => {
  test('maps assistant text and result to the coach contract', () => {
    expect(
      parseClaudeLine(
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'hello' }] },
        })
      )
    ).toEqual({ type: 'text', text: 'hello' });
    expect(
      parseClaudeLine(JSON.stringify({ type: 'result', subtype: 'success' }))
    ).toEqual({ type: 'final' });
    expect(
      parseClaudeLine(JSON.stringify({ type: 'error', error: 'nope' }))
    ).toEqual({ type: 'error', error: 'nope' });
  });
});

describe('queryClaude', () => {
  test('streams text then final from the fake CLI fixture', async () => {
    const events = [];
    for await (const event of queryClaude({
      prompt: 'hello coach',
      binary: fixture,
    })) {
      events.push(event);
    }
    expect(events[0]).toMatchObject({ type: 'text' });
    expect(String((events[0] as { text: string }).text)).toMatch(/^echo:/);
    expect(events.at(-1)).toEqual({ type: 'final' });
  });

  test('findClaudeBinary honors AFFINE_CLAUDE_PATH', () => {
    expect(
      findClaudeBinary({ AFFINE_CLAUDE_PATH: fixture } as NodeJS.ProcessEnv)
    ).toBe(fixture);
    expect(
      findClaudeBinary({
        AFFINE_CLAUDE_PATH: path.join('D:', 'missing-claude'),
      } as NodeJS.ProcessEnv)
    ).toBeNull();
  });

  test('pathCandidates finds a binary on PATH', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'coach-cli-'));
    const exe = path.join(
      dir,
      process.platform === 'win32' ? 'claude.exe' : 'claude'
    );
    writeFileSync(exe, '');
    expect(
      firstExistingPath(pathCandidates('claude', { PATH: dir, Path: dir }))
    ).toBe(exe);
  });
});
