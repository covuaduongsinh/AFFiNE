import { randomUUID } from 'node:crypto';

import type { ChessToolResult } from '@blocksuite/chess-engine';

import { chessCoachSubjects } from './events';

const DEFAULT_TIMEOUT_MS = 180_000;

const pending = new Map<
  string,
  {
    resolve: (result: ChessToolResult) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();

export function completeRendererTool(
  requestId: string,
  result: ChessToolResult
): boolean {
  const wait = pending.get(requestId);
  if (!wait) return false;
  clearTimeout(wait.timer);
  pending.delete(requestId);
  wait.resolve(result);
  return true;
}

export function requestRendererTool(
  name: string,
  args: unknown,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<ChessToolResult> {
  const requestId = randomUUID();
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      resolve({
        ok: false,
        code: 'engine_unavailable',
        error: 'tool call timed out (no focused chess game)',
      });
    }, timeoutMs);
    pending.set(requestId, { resolve, timer });
    chessCoachSubjects.toolCall$.next({ requestId, name, args });
  });
}

export function resetRendererToolBridge(): void {
  for (const wait of pending.values()) {
    clearTimeout(wait.timer);
    wait.resolve({
      ok: false,
      code: 'engine_unavailable',
      error: 'coach bridge reset',
    });
  }
  pending.clear();
}
