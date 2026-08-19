import os from 'node:os';
import path from 'node:path';

import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const electronMock = vi.hoisted(() => ({
  tmpDir: '',
}));

vi.mock('electron', () => ({
  app: {
    getPath: () => electronMock.tmpDir || os.tmpdir(),
    on: vi.fn(),
  },
}));

vi.mock('../../src/main/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { memoryAuditSink } from '../../src/main/chess-coach/audit';
import { ChessCoachHub } from '../../src/main/chess-coach/hub';

describe('ChessCoachHub', () => {
  let hub: ChessCoachHub | undefined;

  beforeEach(async () => {
    electronMock.tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'affine-chess-coach-')
    );
  });

  afterEach(async () => {
    await hub?.stop();
    if (electronMock.tmpDir) {
      await fs.remove(electronMock.tmpDir);
      electronMock.tmpDir = '';
    }
  });

  test('denies tools outside the whitelist and writes audit', async () => {
    const audit: Array<{ tool: string; allowed: boolean }> = [];
    hub = new ChessCoachHub({
      invokeTool: async () => {
        throw new Error('should not run');
      },
      audit: memoryAuditSink(audit),
    });
    const denied = await hub.call('bash', { command: 'ls' });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.code).toBe('unknown_tool');
    expect(audit).toEqual([
      expect.objectContaining({ tool: 'bash', allowed: false }),
    ]);
  });

  test('forwards whitelisted tools and records allow', async () => {
    const audit: Array<{ tool: string; allowed: boolean }> = [];
    hub = new ChessCoachHub({
      invokeTool: async (name, args) => ({
        ok: true,
        payload: { name, args },
      }),
      audit: memoryAuditSink(audit),
    });
    const result = await hub.call('chess.analyze', { fen: 'start' });
    expect(result).toEqual({
      ok: true,
      payload: { name: 'chess.analyze', args: { fen: 'start' } },
    });
    expect(audit[0]).toMatchObject({ tool: 'chess.analyze', allowed: true });
  });

  test('HTTP MCP requires the bearer token and lists chess tools', async () => {
    hub = new ChessCoachHub({
      invokeTool: async () => ({ ok: true, payload: {} }),
      audit: () => {},
      token: 'test-token',
    });
    const started = await hub.start();

    const denied = await fetch(started.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(denied.status).toBe(401);

    const listed = await fetch(started.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer test-token',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    });
    expect(listed.status).toBe(200);
    const body = (await listed.json()) as {
      result: { tools: Array<{ name: string }> };
    };
    const names = body.result.tools.map(tool => tool.name);
    expect(names).toContain('chess.analyze');
    expect(names).toContain('chess.write_doc');
    expect(names).not.toContain('bash');
  });

  test('tools/call over HTTP goes through the whitelist', async () => {
    hub = new ChessCoachHub({
      invokeTool: async () => ({ ok: true, payload: { score: 1 } }),
      audit: () => {},
      token: 'test-token',
    });
    const started = await hub.start();
    const response = await fetch(started.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer test-token',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'rm', arguments: {} },
      }),
    });
    const body = (await response.json()) as {
      result: { isError: boolean; content: Array<{ text: string }> };
    };
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain('not allowed');
  });
});
