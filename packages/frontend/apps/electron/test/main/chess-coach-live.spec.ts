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
  queryClaude,
} from '../../src/main/chess-coach/claude';

/**
 * Hits the real `claude` binary. Opt-in: set AFFINE_COACH_LIVE=1.
 * Skips when the binary is missing or the user is not signed in.
 */
const binary =
  process.env.AFFINE_COACH_LIVE === '1' ? findClaudeBinary() : null;
const describeIfClaude = binary ? describe : describe.skip;

describeIfClaude('live Claude Code', () => {
  test('stream-json replies with text or a clear auth error', async () => {
    const events = [];
    for await (const event of queryClaude({
      prompt: 'Reply with the single word PONG and nothing else.',
      binary: binary ?? undefined,
    })) {
      events.push(event);
      if (
        event.type === 'error' &&
        /login|auth|unauthorized|not logged|api key/i.test(event.error)
      ) {
        return;
      }
    }
    expect(
      events.some(event => event.type === 'text' || event.type === 'final')
    ).toBe(true);
  }, 90_000);
});
