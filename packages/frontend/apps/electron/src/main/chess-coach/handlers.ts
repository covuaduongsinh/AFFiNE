import type { ChessToolResult } from '@blocksuite/chess-engine';

import { beforeAppQuit } from '../cleanup';
import type { NamespaceHandlers } from '../type';
import { completeRendererTool } from './bridge';
import { chessCoach } from './manager';

beforeAppQuit(() => {
  chessCoach.dispose().catch(() => {});
});

export const chessCoachHandlers = {
  status: async () => {
    await chessCoach.ensureStarted();
    return chessCoach.status();
  },
  hubInfo: async () => {
    return chessCoach.ensureStarted();
  },
  query: async (_event, prompt: string) => {
    if (typeof prompt !== 'string' || !prompt.trim()) {
      throw new Error('prompt is required');
    }
    await chessCoach.query(prompt.trim());
  },
  setProvider: async (_event, provider: string) => {
    if (provider !== 'claude' && provider !== 'grok' && provider !== 'api') {
      throw new Error('provider must be claude, grok, or api');
    }
    chessCoach.setProvider(provider);
    return chessCoach.status();
  },
  saveApiKey: async (
    _event,
    input: {
      provider: 'openrouter' | 'openai' | 'xai';
      apiKey: string;
      model?: string;
      baseUrl?: string;
    }
  ) => {
    if (!input || typeof input.apiKey !== 'string') {
      throw new Error('apiKey is required');
    }
    chessCoach.saveApiKey(input);
    return chessCoach.status();
  },
  clearApiKey: async () => {
    chessCoach.clearApiKey();
    return chessCoach.status();
  },
  stop: async () => {
    await chessCoach.stop();
  },
  toolResult: async (_event, requestId: string, result: ChessToolResult) => {
    if (typeof requestId !== 'string') {
      throw new Error('requestId is required');
    }
    completeRendererTool(requestId, result);
  },
} satisfies NamespaceHandlers;
