import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

import { logger } from '../logger';
import { queryOpenAiCompatible } from './api-loop';
import { createJsonlAuditSink } from './audit';
import { requestRendererTool } from './bridge';
import { findClaudeBinary, queryClaude } from './claude';
import { chessCoachSubjects } from './events';
import { findGrokBinary, queryGrok, writeGrokMcpConfig } from './grok';
import { ChessCoachHub } from './hub';
import {
  clearCoachApiKey,
  type CoachApiProviderId,
  loadCoachApiKey,
  saveCoachApiKey,
} from './keys';
import type { CoachHubInfo, CoachProvider, CoachStatus } from './types';

class ChessCoachManager {
  private hub: ChessCoachHub | null = null;
  private abort: AbortController | null = null;
  private mcpConfigPath: string | null = null;
  private preferred: CoachProvider = 'claude';

  private userData(): string {
    return app.getPath('userData');
  }

  status(): CoachStatus {
    const claudePath = findClaudeBinary();
    const grokPath = findGrokBinary();
    const key = loadCoachApiKey(this.userData());
    const providers = {
      claude: Boolean(claudePath),
      grok: Boolean(grokPath),
      api: Boolean(key),
    };
    const provider = this.resolveProvider(providers);
    const ready =
      (provider === 'claude' && providers.claude) ||
      (provider === 'grok' && providers.grok) ||
      (provider === 'api' && providers.api);
    return {
      available: ready && Boolean(this.hub),
      provider,
      providers,
      claudePath,
      grokPath,
      api: key ? { provider: key.provider, model: key.model } : null,
      hub: this.hub ? { url: this.hub.url, token: this.hub.token } : null,
    };
  }

  setProvider(provider: CoachProvider): void {
    if (provider === 'none') return;
    this.preferred = provider;
  }

  saveApiKey(input: {
    provider: CoachApiProviderId;
    apiKey: string;
    model?: string;
    baseUrl?: string;
  }) {
    const record = saveCoachApiKey(this.userData(), input);
    this.preferred = 'api';
    return { provider: record.provider, model: record.model };
  }

  clearApiKey(): void {
    clearCoachApiKey(this.userData());
    if (this.preferred === 'api') this.preferred = 'claude';
  }

  async ensureStarted(): Promise<CoachHubInfo> {
    if (!this.hub) {
      const dir = path.join(this.userData(), 'chess-coach');
      mkdirSync(dir, { recursive: true });
      this.hub = new ChessCoachHub({
        invokeTool: (name, args) => requestRendererTool(name, args),
        audit: createJsonlAuditSink(path.join(dir, 'audit.jsonl')),
      });
      await this.hub.start();
      this.mcpConfigPath = path.join(dir, 'mcp.json');
      writeFileSync(
        this.mcpConfigPath,
        JSON.stringify(
          {
            mcpServers: {
              'affine-chess': {
                type: 'http',
                url: this.hub.url,
                headers: { Authorization: `Bearer ${this.hub.token}` },
              },
            },
          },
          null,
          2
        ),
        'utf8'
      );
      writeGrokMcpConfig(dir, this.hub.url, this.hub.token);
      logger.info('[chess-coach] hub listening', this.hub.url);
    }
    return {
      url: this.hub.url,
      token: this.hub.token,
      cliHint: `claude mcp add --transport http affine-chess ${this.hub.url}`,
    };
  }

  async query(prompt: string): Promise<void> {
    await this.ensureStarted();
    if (this.abort) this.abort.abort();
    this.abort = new AbortController();
    const signal = this.abort.signal;
    const status = this.status();

    if (status.provider === 'none') {
      chessCoachSubjects.stream$.next({
        type: 'error',
        error:
          'No coach backend. Sign in to Claude Code or Grok (monthly subscription), or paste an API key as fallback.',
      });
      return;
    }

    try {
      const stream =
        status.provider === 'api'
          ? this.queryApi(prompt, signal)
          : status.provider === 'grok'
            ? queryGrok({
                prompt,
                binary: status.grokPath ?? undefined,
                cwd: this.mcpConfigPath
                  ? path.dirname(this.mcpConfigPath)
                  : undefined,
                signal,
              })
            : queryClaude({
                prompt,
                binary: status.claudePath ?? undefined,
                mcpConfigPath: this.mcpConfigPath ?? undefined,
                signal,
              });

      for await (const event of stream) {
        if (signal.aborted) break;
        chessCoachSubjects.stream$.next(event);
      }
    } catch (error) {
      chessCoachSubjects.stream$.next({
        type: 'error',
        error: error instanceof Error ? error.message : 'coach query failed',
      });
    } finally {
      if (this.abort?.signal === signal) this.abort = null;
    }
  }

  async stop(): Promise<void> {
    this.abort?.abort();
    this.abort = null;
  }

  async dispose(): Promise<void> {
    await this.stop();
    await this.hub?.stop();
    this.hub = null;
  }

  private resolveProvider(providers: CoachStatus['providers']): CoachProvider {
    if (
      this.preferred === 'claude' ||
      this.preferred === 'grok' ||
      this.preferred === 'api'
    ) {
      return this.preferred;
    }
    if (providers.claude) return 'claude';
    if (providers.grok) return 'grok';
    if (providers.api) return 'api';
    return 'none';
  }

  private queryApi(prompt: string, signal: AbortSignal) {
    const key = loadCoachApiKey(this.userData());
    if (!key) {
      return (async function* () {
        yield {
          type: 'error' as const,
          error: 'No API key saved',
        };
      })();
    }
    return queryOpenAiCompatible({
      prompt,
      key,
      invokeTool: (name, args) => requestRendererTool(name, args),
      signal,
    });
  }
}

export const chessCoach = new ChessCoachManager();
