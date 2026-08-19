import { parseFen } from '@blocksuite/chess-core';
import type { AnalyzeRequest, EngineEvent } from '@blocksuite/chess-engine';

import { logger } from '../logger';
import {
  ARASAN_VERSION,
  listArasanBinaries,
  resolveArasanBinary,
  resolveArasanDir,
  resolveArasanNnue,
} from './binary';
import { chessEngineSubjects } from './events';
import { spawnArasanProcess } from './process';
import { UciSession } from './session';

const MAX_CRASHES = 3;

export interface ChessEngineStatus {
  available: boolean;
  backend: 'native';
  version: string;
}

/**
 * Process-wide Arasan host. One session at a time; a crash respawns on the
 * next analyze() until {@link MAX_CRASHES} in this app session.
 */
export class NativeChessEngine {
  private session: UciSession | null = null;
  private unsubscribe: (() => void) | null = null;
  private crashes = 0;
  private disposing = false;

  status(): ChessEngineStatus {
    return {
      available: resolveArasanBinary() !== null,
      backend: 'native',
      version: ARASAN_VERSION,
    };
  }

  async analyze(request: AnalyzeRequest): Promise<void> {
    parseFen(request.fen);
    const session = await this.ensureSession();
    await session.analyze(request);
  }

  async stop(jobId?: string): Promise<void> {
    await this.session?.stop(jobId);
  }

  async dispose(): Promise<void> {
    this.disposing = true;
    const session = this.session;
    this.session = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    await session?.dispose();
  }

  private async ensureSession(): Promise<UciSession> {
    if (this.session) return this.session;
    if (this.crashes >= MAX_CRASHES) {
      throw new Error(
        `Arasan crashed ${this.crashes} times; refusing to restart`
      );
    }
    const binaries = listArasanBinaries();
    if (binaries.length === 0) {
      throw new Error(
        `Arasan ${ARASAN_VERSION} is not installed. Run scripts/fetch-arasan.mjs.`
      );
    }
    const nnue = resolveArasanNnue(resolveArasanDir());
    if (!nnue) {
      logger.warn(
        '[chess-engine] NNUE file missing next to the binary; eval will be weak'
      );
    }

    let lastError: unknown;
    for (const binary of binaries) {
      logger.info('[chess-engine] spawning', binary);
      const { io } = spawnArasanProcess({
        binary,
        onStderr: chunk => {
          const text = chunk.trim();
          if (text) logger.warn('[chess-engine]', text);
        },
      });
      const session = new UciSession(io, { engineVersion: ARASAN_VERSION });
      const unsubscribe = session.subscribe(event => this.forward(event));
      try {
        await session.handshake();
        this.unsubscribe = unsubscribe;
        this.session = session;
        return session;
      } catch (error) {
        lastError = error;
        logger.warn(
          '[chess-engine] handshake failed, trying next binary',
          error
        );
        unsubscribe();
        await session.dispose();
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('failed to start Arasan');
  }

  private forward(event: EngineEvent) {
    if (event.type === 'info') {
      chessEngineSubjects.info$.next(event);
      return;
    }
    if (event.type === 'bestmove') {
      chessEngineSubjects.bestMove$.next(event);
      return;
    }
    chessEngineSubjects.exit$.next({ code: event.code });
    if (this.disposing) return;
    logger.error('[chess-engine] process exited', event.code);
    this.session = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.crashes += 1;
  }
}

export const nativeEngine = new NativeChessEngine();
