import {
  CHESS_TOOL_SCHEMAS,
  type ChessToolResult,
  isChessToolName,
} from '@blocksuite/chess-engine';

import type { CoachApiKeyRecord } from './keys';
import { COACH_SYSTEM_PROMPT, type CoachStreamEvent } from './types';

export type CoachToolInvoker = (
  name: string,
  args: unknown
) => Promise<ChessToolResult>;

export interface ApiLoopOptions {
  prompt: string;
  key: CoachApiKeyRecord;
  invokeTool: CoachToolInvoker;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  maxRounds?: number;
}

const OPENAI_TOOLS = Object.entries(CHESS_TOOL_SCHEMAS).map(
  ([name, schema]) => ({
    type: 'function' as const,
    function: {
      name,
      description: schema.description,
      parameters: schema.inputSchema,
    },
  })
);

/**
 * OpenAI-compatible chat-completions loop (OpenRouter / OpenAI / xAI).
 * Tools go through the same Hub invoker as the CLI adapters.
 */
export async function* queryOpenAiCompatible(
  options: ApiLoopOptions
): AsyncGenerator<CoachStreamEvent> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxRounds = options.maxRounds ?? 8;
  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: COACH_SYSTEM_PROMPT },
    { role: 'user', content: options.prompt },
  ];

  for (let round = 0; round < maxRounds; round++) {
    if (options.signal?.aborted) {
      yield { type: 'error', error: 'stopped' };
      return;
    }

    let payload: ChatCompletion;
    try {
      payload = await completeOnce({
        fetchImpl,
        key: options.key,
        messages,
        signal: options.signal,
      });
    } catch (error) {
      yield {
        type: 'error',
        error: error instanceof Error ? error.message : 'API request failed',
      };
      return;
    }

    const choice = payload.choices?.[0]?.message;
    if (!choice) {
      yield { type: 'error', error: 'API returned no message' };
      return;
    }

    const text = collectContent(choice.content);
    if (text) {
      yield { type: 'text', text };
    }

    const calls = Array.isArray(choice.tool_calls) ? choice.tool_calls : [];
    if (calls.length === 0) {
      yield { type: 'final' };
      return;
    }

    messages.push({
      role: 'assistant',
      content: choice.content ?? null,
      tool_calls: calls,
    });

    for (const call of calls) {
      const name = call.function?.name ?? '';
      let args: unknown = {};
      try {
        args = call.function?.arguments
          ? JSON.parse(call.function.arguments)
          : {};
      } catch {
        args = {};
      }
      const result = isChessToolName(name)
        ? await options.invokeTool(name, args)
        : {
            ok: false as const,
            code: 'unknown_tool' as const,
            error: `tool ${name} is not allowed`,
          };
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }

  yield { type: 'error', error: 'API tool loop exceeded the round limit' };
}

interface ChatCompletion {
  choices?: Array<{
    message?: {
      content?: unknown;
      tool_calls?: Array<{
        id: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
  error?: { message?: string };
}

async function completeOnce(options: {
  fetchImpl: typeof fetch;
  key: CoachApiKeyRecord;
  messages: Array<Record<string, unknown>>;
  signal?: AbortSignal;
}): Promise<ChatCompletion> {
  const url = `${options.key.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const response = await options.fetchImpl(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${options.key.apiKey}`,
    },
    body: JSON.stringify({
      model: options.key.model,
      messages: options.messages,
      tools: OPENAI_TOOLS,
      tool_choice: 'auto',
    }),
    signal: options.signal,
  });
  const json = (await response.json()) as ChatCompletion;
  if (!response.ok) {
    throw new Error(
      json.error?.message || `API ${response.status} ${response.statusText}`
    );
  }
  return json;
}

function collectContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map(part => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && 'text' in part) {
        return String((part as { text: unknown }).text ?? '');
      }
      return '';
    })
    .join('');
}
