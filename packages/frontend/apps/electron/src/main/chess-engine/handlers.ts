import type { AnalyzeRequest } from '@blocksuite/chess-engine';

import { beforeAppQuit } from '../cleanup';
import type { NamespaceHandlers } from '../type';
import { nativeEngine } from './manager';

beforeAppQuit(() => {
  nativeEngine.dispose().catch(() => {
    // quitting; a failed quit handshake is not worth crashing the app
  });
});

export const chessEngineHandlers = {
  status: async () => {
    return nativeEngine.status();
  },
  analyze: async (_event, request: AnalyzeRequest) => {
    await nativeEngine.analyze(request);
  },
  stop: async (_event, jobId?: string) => {
    await nativeEngine.stop(jobId);
  },
} satisfies NamespaceHandlers;
