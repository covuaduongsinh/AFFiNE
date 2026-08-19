import { mkdtempSync, readFileSync } from 'node:fs';
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
  findGrokBinary,
  parseGrokLine,
  queryGrok,
  writeGrokMcpConfig,
} from '../../src/main/chess-coach/grok';

const fixture = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'fake-grok.mjs'
);

describe('parseGrokLine', () => {
  test('maps streaming-json text and done to the coach contract', () => {
    expect(parseGrokLine(JSON.stringify({ type: 'text', text: 'hi' }))).toEqual(
      {
        type: 'text',
        text: 'hi',
      }
    );
    expect(parseGrokLine(JSON.stringify({ type: 'done' }))).toEqual({
      type: 'final',
    });
    expect(
      parseGrokLine(JSON.stringify({ type: 'error', error: 'nope' }))
    ).toEqual({ type: 'error', error: 'nope' });
  });

  test('maps grok 1.0 ACP data field and end event', () => {
    expect(
      parseGrokLine(JSON.stringify({ type: 'text', data: 'pong' }))
    ).toEqual({ type: 'text', text: 'pong' });
    expect(
      parseGrokLine(JSON.stringify({ type: 'end', stopReason: 'end_turn' }))
    ).toEqual({ type: 'final' });
    expect(
      parseGrokLine(JSON.stringify({ type: 'thought', data: 'hmm' }))
    ).toBeNull();
  });
});

describe('queryGrok', () => {
  test('streams text then final from the fake CLI fixture', async () => {
    const events = [];
    for await (const event of queryGrok({
      prompt: 'hello grok',
      binary: fixture,
    })) {
      events.push(event);
    }
    expect(events[0]).toMatchObject({ type: 'text' });
    expect(String((events[0] as { text: string }).text)).toMatch(/echo:/);
    expect(events.at(-1)).toEqual({ type: 'final' });
  });

  test('does not pass Claude --mcp-config to grok 1.0', async () => {
    const events = [];
    for await (const event of queryGrok({
      prompt: 'analyze',
      binary: fixture,
      mcpConfigPath: path.join(path.dirname(fixture), 'mcp.json'),
    })) {
      events.push(event);
    }
    expect(events.at(-1)).toEqual({ type: 'final' });
    expect(events.some(event => event.type === 'error')).toBe(false);
  });

  test('findGrokBinary honors AFFINE_GROK_PATH', () => {
    expect(
      findGrokBinary({ AFFINE_GROK_PATH: fixture } as NodeJS.ProcessEnv)
    ).toBe(fixture);
    expect(
      findGrokBinary({
        AFFINE_GROK_PATH: path.join('D:', 'missing-grok'),
      } as NodeJS.ProcessEnv)
    ).toBeNull();
  });
});

describe('writeGrokMcpConfig', () => {
  test('writes project MCP toml grok 1.0 can load', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'grok-mcp-'));
    writeGrokMcpConfig(dir, 'http://127.0.0.1:9/mcp', 'tok');
    const toml = readFileSync(path.join(dir, '.grok', 'config.toml'), 'utf8');
    expect(toml).toContain('[mcp_servers.affine-chess]');
    expect(toml).toContain('http://127.0.0.1:9/mcp');
    expect(toml).toContain('Bearer tok');
  });
});
