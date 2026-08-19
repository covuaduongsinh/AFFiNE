import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';

import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const electronMock = vi.hoisted(() => ({
  encryption: true,
}));

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => electronMock.encryption,
    encryptString: (value: string) => Buffer.from(`enc:${value}`),
    decryptString: (buf: Buffer) => {
      const text = buf.toString();
      return text.startsWith('enc:') ? text.slice(4) : text;
    },
  },
}));

import { queryOpenAiCompatible } from '../../src/main/chess-coach/api-loop';
import {
  clearCoachApiKey,
  loadCoachApiKey,
  saveCoachApiKey,
} from '../../src/main/chess-coach/keys';

describe('coach API key store', () => {
  let tmp = '';

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'affine-coach-key-'));
    electronMock.encryption = true;
  });

  afterEach(async () => {
    await fs.remove(tmp);
  });

  test('round-trips a key through encrypt/decrypt', () => {
    saveCoachApiKey(tmp, {
      provider: 'openrouter',
      apiKey: 'sk-or-test',
      model: 'openai/gpt-4o-mini',
    });
    expect(loadCoachApiKey(tmp)).toEqual({
      provider: 'openrouter',
      apiKey: 'sk-or-test',
      model: 'openai/gpt-4o-mini',
      baseUrl: 'https://openrouter.ai/api/v1',
    });
    clearCoachApiKey(tmp);
    expect(loadCoachApiKey(tmp)).toBeNull();
  });

  test('rejects a base URL with credentials', () => {
    expect(() =>
      saveCoachApiKey(tmp, {
        provider: 'openai',
        apiKey: 'sk',
        baseUrl: 'https://user:pass@api.openai.com/v1',
      })
    ).toThrow(/credentials/);
  });
});

describe('queryOpenAiCompatible', () => {
  test('runs one tool call then a final answer through the invoker', async () => {
    const calls: Array<{ name: string; args: unknown }> = [];
    let round = 0;
    const server = createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      if (round === 0) {
        round += 1;
        res.end(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: '',
                  tool_calls: [
                    {
                      id: 'c1',
                      function: {
                        name: 'chess.analyze',
                        arguments: JSON.stringify({ fen: 'start' }),
                      },
                    },
                  ],
                },
              },
            ],
          })
        );
        return;
      }
      res.end(
        JSON.stringify({
          choices: [{ message: { content: 'White is slightly better.' } }],
        })
      );
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    const events = [];
    try {
      for await (const event of queryOpenAiCompatible({
        prompt: 'how is this position?',
        key: {
          provider: 'openrouter',
          apiKey: 'sk-test',
          model: 'openai/gpt-4o-mini',
          baseUrl: `http://127.0.0.1:${port}`,
        },
        invokeTool: async (name, args) => {
          calls.push({ name, args });
          return {
            ok: true,
            payload: { score: { type: 'cp', value: 32 } },
          };
        },
      })) {
        events.push(event);
      }
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close(err => (err ? reject(err) : resolve()))
      );
    }

    expect(calls).toEqual([{ name: 'chess.analyze', args: { fen: 'start' } }]);
    expect(events).toContainEqual({
      type: 'text',
      text: 'White is slightly better.',
    });
    expect(events.at(-1)).toEqual({ type: 'final' });
  });

  test('denies a tool the model invented', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    id: 'c1',
                    function: { name: 'bash', arguments: '{}' },
                  },
                ],
              },
            },
          ],
        })
      );
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    let invoked = 0;
    const events = [];
    try {
      for await (const event of queryOpenAiCompatible({
        prompt: 'rm -rf',
        key: {
          provider: 'openai',
          apiKey: 'sk',
          model: 'gpt-4o-mini',
          baseUrl: `http://127.0.0.1:${port}`,
        },
        invokeTool: async () => {
          invoked += 1;
          return { ok: true, payload: {} };
        },
        maxRounds: 1,
      })) {
        events.push(event);
      }
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close(err => (err ? reject(err) : resolve()))
      );
    }

    expect(invoked).toBe(0);
    expect(events.some(event => event.type === 'error')).toBe(true);
  });
});
