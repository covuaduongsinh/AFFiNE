import path from 'node:path';

import { type ChessSyncHandle,startChessSync } from '@chess/sync';
import { app } from 'electron';

import { logger } from '../logger';

const DEFAULT_HOST = '127.0.0.1';
const PORT_START = 3010;
const PORT_END = 3020;

class ChessSyncManager {
  private handle: ChessSyncHandle | null = null;
  private starting: Promise<ChessSyncHandle> | null = null;

  async ensureStarted(): Promise<{ baseUrl: string }> {
    if (this.handle) {
      return { baseUrl: this.handle.baseUrl };
    }
    if (!this.starting) {
      this.starting = this.start();
    }
    try {
      this.handle = await this.starting;
      return { baseUrl: this.handle.baseUrl };
    } finally {
      this.starting = null;
    }
  }

  private async start(): Promise<ChessSyncHandle> {
    const host = process.env.CHESS_SYNC_HOST ?? DEFAULT_HOST;
    const preferred = Number.parseInt(
      process.env.CHESS_SYNC_PORT ?? String(PORT_START),
      10
    );
    const dataDir = path.join(app.getPath('userData'), 'chess-sync');
    const ports = [preferred];
    for (let port = PORT_START; port <= PORT_END; port++) {
      if (port !== preferred) ports.push(port);
    }
    let lastError: unknown;
    for (const port of ports) {
      try {
        const handle = await startChessSync({ host, port, dataDir });
        logger.info('chess-sync listening', handle.baseUrl);
        return handle;
      } catch (error) {
        lastError = error;
        logger.warn('chess-sync bind failed', port, error);
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('chess-sync failed to start');
  }

  async close() {
    const handle = this.handle;
    this.handle = null;
    this.starting = null;
    if (handle) {
      await handle.close();
    }
  }
}

export const chessSync = new ChessSyncManager();
