import { beforeAppQuit } from '../cleanup';
import type { NamespaceHandlers } from '../type';
import { chessSync } from './manager';

beforeAppQuit(() => {
  chessSync.close().catch(() => {});
});

export const chessSyncHandlers = {
  info: async () => {
    return chessSync.ensureStarted();
  },
} satisfies NamespaceHandlers;
