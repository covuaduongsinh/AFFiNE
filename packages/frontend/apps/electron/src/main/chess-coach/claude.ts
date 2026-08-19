import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

import { logger } from '../logger';
import { firstExistingPath, pathCandidates, spawnCli } from './spawn-cli';
import { COACH_SYSTEM_PROMPT, type CoachStreamEvent } from './types';

export function findClaudeBinary(
  env: NodeJS.ProcessEnv = process.env
): string | null {
  if (env.AFFINE_CLAUDE_PATH !== undefined) {
    const override = env.AFFINE_CLAUDE_PATH.trim();
    return override && existsSync(override) ? override : null;
  }

  const home = homedir();
  return firstExistingPath([
    path.join(home, '.local', 'bin', 'claude.exe'),
    path.join(home, '.local', 'bin', 'claude'),
    path.join(home, 'AppData', 'Roaming', 'npm', 'claude.exe'),
    path.join(home, 'AppData', 'Roaming', 'npm', 'claude.cmd'),
    path.join(home, '.claude', 'bin', 'claude.exe'),
    path.join(home, '.claude', 'bin', 'claude'),
    ...pathCandidates('claude', env),
  ]);
}

export interface ClaudeQueryOptions {
  prompt: string;
  mcpConfigPath?: string;
  binary?: string;
  signal?: AbortSignal;
}

/**
 * Spawn the user's `claude` CLI. Tokens stay inside that product.
 * Prompt goes on stdin so FEN/PGN never land on the command line.
 */
export async function* queryClaude(
  options: ClaudeQueryOptions
): AsyncGenerator<CoachStreamEvent> {
  const binary = options.binary ?? findClaudeBinary();
  if (!binary) {
    yield {
      type: 'error',
      error:
        'Claude Code is not installed (set AFFINE_CLAUDE_PATH or install claude)',
    };
    return;
  }

  const args = ['-p', '--output-format', 'stream-json', '--verbose'];
  if (options.mcpConfigPath) {
    args.push('--mcp-config', options.mcpConfigPath);
  }

  const child = spawnCli(binary, args);
  const body = `${COACH_SYSTEM_PROMPT}\n\nUser:\n${options.prompt}`;
  child.stdin.write(body);
  child.stdin.end();

  const onAbort = () => {
    try {
      child.kill();
    } catch {
      // already gone
    }
  };
  options.signal?.addEventListener('abort', onAbort, { once: true });

  try {
    yield* readClaudeStream(child);
  } finally {
    options.signal?.removeEventListener('abort', onAbort);
    if (!child.killed) {
      child.kill();
    }
  }
}

async function* readClaudeStream(
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
    const event = parseClaudeLine(trimmed);
    if (!event) continue;
    if (event.type === 'final') sawFinal = true;
    yield event;
  }

  const code: number | null = await new Promise(resolve => {
    if (child.exitCode !== null) {
      resolve(child.exitCode);
      return;
    }
    child.once('exit', code => resolve(code));
  });

  if (!sawFinal && code !== 0) {
    logger.warn('[chess-coach] claude exited', code, stderr.slice(0, 400));
    yield {
      type: 'error',
      error: stderr.trim() || `claude exited with code ${code}`,
    };
    return;
  }
  if (!sawFinal) {
    yield { type: 'final' };
  }
}

export function parseClaudeLine(line: string): CoachStreamEvent | null {
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return { type: 'text', text: line };
  }

  if (value.type === 'error' || (value.type === 'result' && value.is_error)) {
    const err =
      (typeof value.error === 'string' && value.error) ||
      (typeof value.result === 'string' && value.result) ||
      'claude error';
    return { type: 'error', error: err };
  }

  if (value.type === 'result') {
    return { type: 'final' };
  }

  if (
    value.type === 'assistant' &&
    value.message &&
    typeof value.message === 'object'
  ) {
    const message = value.message as { content?: unknown };
    const text = collectText(message.content);
    return text ? { type: 'text', text } : null;
  }

  const event = value.event;
  if (event && typeof event === 'object') {
    const delta = (event as { delta?: { text?: string; type?: string } }).delta;
    if (delta?.text) return { type: 'text', text: delta.text };
  }

  if (typeof value.text === 'string' && value.type === 'content_block_delta') {
    return { type: 'text', text: value.text };
  }

  return null;
}

function collectText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map(part => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && 'text' in part) {
        return String((part as { text: unknown }).text ?? '');
      }
      return '';
    })
    .join('');
}
