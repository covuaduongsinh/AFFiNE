import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

import { logger } from '../logger';
import { parseClaudeLine } from './claude';
import { firstExistingPath, pathCandidates, spawnCli } from './spawn-cli';
import { COACH_SYSTEM_PROMPT, type CoachStreamEvent } from './types';

export function findGrokBinary(
  env: NodeJS.ProcessEnv = process.env
): string | null {
  if (env.AFFINE_GROK_PATH !== undefined) {
    const override = env.AFFINE_GROK_PATH.trim();
    return override && existsSync(override) ? override : null;
  }

  const home = homedir();
  return firstExistingPath([
    path.join(home, '.local', 'bin', 'grok.exe'),
    path.join(home, '.local', 'bin', 'grok'),
    path.join(home, '.grok', 'bin', 'grok.exe'),
    path.join(home, '.grok', 'bin', 'grok'),
    path.join(home, 'AppData', 'Local', 'xai', 'grok.exe'),
    path.join(home, 'AppData', 'Roaming', 'npm', 'grok.exe'),
    path.join(home, 'AppData', 'Roaming', 'npm', 'grok.cmd'),
    ...pathCandidates('grok', env),
  ]);
}

export interface GrokQueryOptions {
  prompt: string;
  mcpConfigPath?: string;
  cwd?: string;
  binary?: string;
  signal?: AbortSignal;
}

/**
 * Grok 1.0 has no `--mcp-config`. Project MCP lives in `.grok/config.toml`.
 */
export function writeGrokMcpConfig(
  dir: string,
  url: string,
  token: string
): string {
  const grokDir = path.join(dir, '.grok');
  mkdirSync(grokDir, { recursive: true });
  writeFileSync(
    path.join(grokDir, 'config.toml'),
    [
      '[mcp_servers.affine-chess]',
      `url = ${JSON.stringify(url)}`,
      `headers = { Authorization = ${JSON.stringify(`Bearer ${token}`)} }`,
      'enabled = true',
      '',
    ].join('\n'),
    'utf8'
  );
  return dir;
}

/**
 * Spawn the user's `grok` CLI (Grok Build). Auth stays in that product
 * (`grok login`). Prompt is one argv element — no shell.
 */
export async function* queryGrok(
  options: GrokQueryOptions
): AsyncGenerator<CoachStreamEvent> {
  const binary = options.binary ?? findGrokBinary();
  if (!binary) {
    yield {
      type: 'error',
      error:
        'Grok Build is not installed (set AFFINE_GROK_PATH or install grok)',
    };
    return;
  }

  const body = `${COACH_SYSTEM_PROMPT}\n\nUser:\n${options.prompt}`;
  const args = [
    '-p',
    body,
    '--output-format',
    'streaming-json',
    '--always-approve',
  ];
  const cwd =
    options.cwd ??
    (options.mcpConfigPath ? path.dirname(options.mcpConfigPath) : undefined);
  if (cwd) args.push('--cwd', cwd);

  const child = spawnCli(binary, args);
  const onAbort = () => {
    try {
      child.kill();
    } catch {
      // already gone
    }
  };
  options.signal?.addEventListener('abort', onAbort, { once: true });

  try {
    yield* readGrokStream(child);
  } finally {
    options.signal?.removeEventListener('abort', onAbort);
    if (!child.killed) {
      child.kill();
    }
  }
}

async function* readGrokStream(
  child: ChildProcessWithoutNullStreams
): AsyncGenerator<CoachStreamEvent> {
  const rl = readline.createInterface({ input: child.stdout });
  let sawFinal = false;
  let stderr = '';
  child.stderr.on('data', chunk => {
    stderr += String(chunk);
    if (stderr.length > 4000) stderr = stderr.slice(-4000);
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const event = parseGrokLine(trimmed);
    if (!event) continue;
    if (event.type === 'final') sawFinal = true;
    yield event;
  }

  const code: number | null = await new Promise(resolve => {
    if (child.exitCode !== null) {
      resolve(child.exitCode);
      return;
    }
    child.once('exit', exitCode => resolve(exitCode));
  });

  if (!sawFinal && code !== 0) {
    logger.warn('[chess-coach] grok exited', code, stderr.slice(0, 400));
    yield {
      type: 'error',
      error: stderr.trim() || `grok exited with code ${code}`,
    };
    return;
  }
  if (!sawFinal) {
    yield { type: 'final' };
  }
}

export function parseGrokLine(line: string): CoachStreamEvent | null {
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return { type: 'text', text: line };
  }

  const type = String(value.type ?? '');
  if (
    type === 'done' ||
    type === 'end' ||
    type === 'complete' ||
    type === 'result'
  ) {
    return { type: 'final' };
  }
  if (type === 'error') {
    const err =
      (typeof value.error === 'string' && value.error) ||
      (typeof value.message === 'string' && value.message) ||
      'grok error';
    return { type: 'error', error: err };
  }
  if (type === 'thought' || type === 'available_commands' || type === 'usage') {
    return null;
  }

  const text =
    (typeof value.data === 'string' && value.data) ||
    (typeof value.text === 'string' && value.text) ||
    (typeof value.content === 'string' && value.content) ||
    (typeof value.delta === 'string' && value.delta) ||
    '';
  if (text) return { type: 'text', text };

  const asClaude = parseClaudeLine(line);
  if (asClaude && asClaude.type !== 'text') return asClaude;
  return asClaude;
}
