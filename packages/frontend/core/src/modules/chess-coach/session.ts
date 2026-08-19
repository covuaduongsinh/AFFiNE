import type { Game } from '@blocksuite/chess-core';
import {
  type ChessGameSnapshot,
  type ChessToolContext,
  type ChessToolResult,
  type GameScan,
  runChessTool,
} from '@blocksuite/chess-engine';
import { LiveData } from '@toeverything/infra';

import type { ChessEngine } from '../chess-engine/engine';
import type {
  CoachApiKeyInput,
  CoachClientEvent,
  CoachHost,
  CoachProvider,
  CoachStatus,
} from './types';

export interface CoachGameAdapter {
  get(): ChessGameSnapshot;
  apply(next: ChessGameSnapshot): void;
}

export interface CoachChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'error';
  text: string;
}

export class ChessCoachSession {
  readonly status$ = new LiveData<CoachStatus>({
    available: false,
    provider: 'none',
    claudePath: null,
    hub: null,
  });
  readonly messages$ = new LiveData<CoachChatMessage[]>([]);
  readonly busy$ = new LiveData(false);
  readonly hubHint$ = new LiveData<string | null>(null);

  private lastScan: GameScan | null = null;
  private readonly games = new Map<string, CoachGameAdapter>();
  private readonly offHost: () => void;
  private assistantBuf = '';

  constructor(
    private readonly engine: ChessEngine,
    private readonly host: CoachHost,
    private readonly isCoachEnabled: () => boolean,
    private readonly isEngineEnabled: () => boolean
  ) {
    this.offHost = this.host.subscribe(event => {
      this.onHostEvent(event).catch(() => {});
    });
    this.refresh().catch(() => {});
  }

  attachGame(blockId: string, adapter: CoachGameAdapter): () => void {
    this.games.set(blockId, adapter);
    return () => {
      if (this.games.get(blockId) === adapter) this.games.delete(blockId);
    };
  }

  async refresh(): Promise<void> {
    if (!this.isCoachEnabled()) {
      this.status$.next({
        available: false,
        provider: 'none',
        providers: { claude: false, grok: false, api: false },
        claudePath: null,
        grokPath: null,
        api: null,
        hub: null,
      });
      this.hubHint$.next(null);
      return;
    }
    const status = await this.host.status();
    this.status$.next(status);
    const info = await this.host.hubInfo();
    this.hubHint$.next(info?.cliHint ?? null);
  }

  async send(prompt: string): Promise<void> {
    const trimmed = prompt.trim();
    if (!trimmed || this.busy$.value) return;
    if (!this.isCoachEnabled()) {
      this.push({
        role: 'error',
        text: 'Chess coach is disabled',
      });
      return;
    }
    if (this.host.id === 'null' || !this.status$.value.available) {
      this.push({
        role: 'error',
        text: 'The chess coach is available in the desktop app with Claude Code, Grok Build, or an API key.',
      });
      return;
    }
    this.push({ role: 'user', text: trimmed });
    this.assistantBuf = '';
    this.busy$.next(true);
    try {
      await this.host.query(trimmed);
    } catch (error) {
      this.push({
        role: 'error',
        text: error instanceof Error ? error.message : 'coach query failed',
      });
      this.busy$.next(false);
    }
  }

  async stop(): Promise<void> {
    await this.host.stop();
    this.busy$.next(false);
  }

  async setProvider(provider: CoachProvider): Promise<void> {
    const next = await this.host.setProvider(provider);
    if (next) this.status$.next(next);
    else await this.refresh();
  }

  async saveApiKey(input: CoachApiKeyInput): Promise<void> {
    const next = await this.host.saveApiKey(input);
    if (next) this.status$.next(next);
    else await this.refresh();
  }

  async clearApiKey(): Promise<void> {
    const next = await this.host.clearApiKey();
    if (next) this.status$.next(next);
    else await this.refresh();
  }

  async runTool(name: string, args?: unknown): Promise<ChessToolResult> {
    const ctx = this.createContext();
    const result = await runChessTool(ctx, name, args);
    this.lastScan = ctx.lastScan;
    return result;
  }

  dispose(): void {
    this.offHost();
    this.host.stop().catch(() => {});
  }

  private createContext(): ChessToolContext {
    return {
      engineEnabled: this.isEngineEnabled(),
      lastScan: this.lastScan,
      evaluate: (fen, depth, multipv) =>
        this.engine.evaluate(fen, depth, multipv),
      scan: (game: Game, depth: number) => this.engine.scan(game, { depth }),
      readGame: () => {
        const id = this.engine.activeBlock;
        if (!id) return null;
        return this.games.get(id)?.get() ?? null;
      },
      writeGame: next => {
        const id = this.engine.activeBlock;
        if (!id) return;
        this.games.get(id)?.apply(next);
      },
    };
  }

  private async onHostEvent(event: CoachClientEvent): Promise<void> {
    if (event.type === 'invoke') {
      const result = await this.runTool(event.name, event.args);
      try {
        await this.host.replyTool(event.requestId, result);
      } catch {
        await this.host
          .replyTool(event.requestId, {
            ok: false,
            code: 'write_failed',
            error: 'tool result could not be sent to the coach',
          })
          .catch(() => {});
      }
      this.push({
        role: 'tool',
        text: `${event.name} ${result.ok ? 'ok' : result.error}`,
      });
      return;
    }
    if (event.type === 'text') {
      this.assistantBuf += event.text;
      this.replaceAssistant(this.assistantBuf);
      return;
    }
    if (event.type === 'error') {
      this.push({ role: 'error', text: event.error });
      this.busy$.next(false);
      return;
    }
    if (event.type === 'final') {
      if (this.assistantBuf && !this.hasAssistant(this.assistantBuf)) {
        this.replaceAssistant(this.assistantBuf);
      }
      this.busy$.next(false);
    }
  }

  private push(message: Omit<CoachChatMessage, 'id'>): void {
    const next: CoachChatMessage = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      ...message,
    };
    this.messages$.next([...this.messages$.value, next]);
  }

  private replaceAssistant(text: string): void {
    const messages = this.messages$.value;
    const last = messages.at(-1);
    if (last?.role === 'assistant') {
      this.messages$.next([...messages.slice(0, -1), { ...last, text }]);
      return;
    }
    this.push({ role: 'assistant', text });
  }

  private hasAssistant(text: string): boolean {
    const last = this.messages$.value.at(-1);
    return last?.role === 'assistant' && last.text === text;
  }
}
