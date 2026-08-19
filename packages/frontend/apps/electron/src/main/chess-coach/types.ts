import type { ChessToolResult } from '@blocksuite/chess-engine';

export type CoachProvider = 'claude' | 'grok' | 'api' | 'none';

export interface CoachStatus {
  available: boolean;
  provider: CoachProvider;
  providers: { claude: boolean; grok: boolean; api: boolean };
  claudePath: string | null;
  grokPath: string | null;
  api: { provider: string; model: string } | null;
  hub: { url: string; token: string } | null;
}

export interface CoachHubInfo {
  url: string;
  token: string;
  cliHint: string;
}

export type CoachStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; name: string; args: unknown; id: string }
  | { type: 'tool_result'; id: string; result: ChessToolResult }
  | { type: 'final' }
  | { type: 'error'; error: string };

export interface CoachToolRequest {
  requestId: string;
  name: string;
  args: unknown;
}

export const COACH_SYSTEM_PROMPT = [
  'You are a chess coach inside a local-first desktop app.',
  'Never invent evaluations, best moves, or SAN.',
  'Call chess.analyze before quoting a score or a best line.',
  'Call chess.scan_game before labelling inaccuracies, mistakes, or blunders.',
  'Call chess.write_doc only when the user asks you to annotate the game.',
  'Prefer the focused board; pass fen only when the user gives one.',
].join(' ');
