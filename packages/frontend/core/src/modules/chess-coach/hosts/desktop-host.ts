import type { ChessToolResult } from '@blocksuite/chess-engine';

import type {
  CoachApiKeyInput,
  CoachClientEvent,
  CoachHost,
  CoachHubInfo,
  CoachProvider,
  CoachStatus,
} from '../types';

interface DesktopCoachApi {
  status: () => Promise<CoachStatus>;
  hubInfo: () => Promise<CoachHubInfo>;
  query: (prompt: string) => Promise<void>;
  stop: () => Promise<void>;
  setProvider: (provider: CoachProvider) => Promise<CoachStatus>;
  saveApiKey: (input: CoachApiKeyInput) => Promise<CoachStatus>;
  clearApiKey: () => Promise<CoachStatus>;
  toolResult: (requestId: string, result: ChessToolResult) => Promise<void>;
}

interface DesktopCoachEvents {
  onStream: (fn: (event: CoachClientEvent) => void) => () => void;
  onToolCall: (
    fn: (request: { requestId: string; name: string; args: unknown }) => void
  ) => () => void;
}

export class DesktopCoachHost implements CoachHost {
  readonly id = 'electron';

  constructor(
    private readonly api: DesktopCoachApi,
    private readonly ev: DesktopCoachEvents
  ) {}

  status(): Promise<CoachStatus> {
    return this.api.status();
  }

  hubInfo(): Promise<CoachHubInfo | null> {
    return this.api.hubInfo();
  }

  query(prompt: string): Promise<void> {
    return this.api.query(prompt);
  }

  stop(): Promise<void> {
    return this.api.stop();
  }

  setProvider(provider: CoachProvider): Promise<CoachStatus> {
    return this.api.setProvider(provider);
  }

  saveApiKey(input: CoachApiKeyInput): Promise<CoachStatus> {
    return this.api.saveApiKey(input);
  }

  clearApiKey(): Promise<CoachStatus> {
    return this.api.clearApiKey();
  }

  replyTool(requestId: string, result: ChessToolResult): Promise<void> {
    return this.api.toolResult(requestId, cloneToolResult(result));
  }

  subscribe(listener: (event: CoachClientEvent) => void): () => void {
    const offStream = this.ev.onStream(event => listener(event));
    const offTool = this.ev.onToolCall(request =>
      listener({
        type: 'invoke',
        requestId: request.requestId,
        name: request.name,
        args: request.args,
      })
    );
    return () => {
      offStream();
      offTool();
    };
  }
}

/** Electron IPC structured-clone cannot send proxies or class instances. */
export function cloneToolResult(result: ChessToolResult): ChessToolResult {
  try {
    return JSON.parse(JSON.stringify(result)) as ChessToolResult;
  } catch {
    return {
      ok: false,
      code: 'write_failed',
      error: 'tool result was not serializable',
    };
  }
}
