import type { ChessToolResult } from '@blocksuite/chess-engine';

export type CoachProvider = 'claude' | 'grok' | 'api' | 'none';

export interface CoachStatus {
  available: boolean;
  provider: CoachProvider;
  providers?: { claude: boolean; grok: boolean; api: boolean };
  claudePath: string | null;
  grokPath?: string | null;
  api?: { provider: string; model: string } | null;
  hub: { url: string; token: string } | null;
}

export interface CoachHubInfo {
  url: string;
  token: string;
  cliHint: string;
}

export type CoachClientEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; name: string; args: unknown; id: string }
  | { type: 'tool_result'; id: string; result: ChessToolResult }
  | { type: 'final' }
  | { type: 'error'; error: string }
  | { type: 'invoke'; requestId: string; name: string; args: unknown };

export interface CoachApiKeyInput {
  provider: 'openrouter' | 'openai' | 'xai';
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export interface CoachHost {
  readonly id: string;
  status(): Promise<CoachStatus>;
  hubInfo(): Promise<CoachHubInfo | null>;
  query(prompt: string): Promise<void>;
  stop(): Promise<void>;
  setProvider(provider: CoachProvider): Promise<CoachStatus | void>;
  saveApiKey(input: CoachApiKeyInput): Promise<CoachStatus | void>;
  clearApiKey(): Promise<CoachStatus | void>;
  replyTool(requestId: string, result: ChessToolResult): Promise<void>;
  subscribe(listener: (event: CoachClientEvent) => void): () => void;
}
