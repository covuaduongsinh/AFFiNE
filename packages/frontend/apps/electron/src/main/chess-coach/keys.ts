import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import { safeStorage } from 'electron';

export type CoachApiProviderId = 'openrouter' | 'openai' | 'xai';

export const COACH_API_PROVIDERS: Record<
  CoachApiProviderId,
  { baseUrl: string; defaultModel: string }
> = {
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
  },
  xai: {
    baseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-4-fast-non-reasoning',
  },
};

export interface CoachApiKeyRecord {
  provider: CoachApiProviderId;
  apiKey: string;
  model: string;
  baseUrl: string;
}

interface StoredCoachKey {
  v: 1;
  provider: CoachApiProviderId;
  model: string;
  baseUrl: string;
  credential: string;
}

export function coachKeysPath(userData: string): string {
  return path.join(userData, 'chess-coach', 'api-key.json');
}

export function loadCoachApiKey(userData: string): CoachApiKeyRecord | null {
  const file = coachKeysPath(userData);
  if (!existsSync(file)) return null;
  try {
    const stored = JSON.parse(readFileSync(file, 'utf8')) as StoredCoachKey;
    if (stored.v !== 1 || typeof stored.credential !== 'string') return null;
    const apiKey = decryptSecret(stored.credential);
    if (!apiKey) return null;
    return {
      provider: stored.provider,
      apiKey,
      model: stored.model,
      baseUrl: stored.baseUrl,
    };
  } catch {
    return null;
  }
}

export function saveCoachApiKey(
  userData: string,
  input: {
    provider: CoachApiProviderId;
    apiKey: string;
    model?: string;
    baseUrl?: string;
  }
): CoachApiKeyRecord {
  const defaults = COACH_API_PROVIDERS[input.provider];
  if (!defaults) {
    throw new Error(`unsupported API provider ${input.provider}`);
  }
  const key = input.apiKey.trim();
  if (!key) throw new Error('api key is required');
  const record: CoachApiKeyRecord = {
    provider: input.provider,
    apiKey: key,
    model: input.model?.trim() || defaults.defaultModel,
    baseUrl: normalizeBaseUrl(input.baseUrl ?? defaults.baseUrl),
  };
  const dir = path.dirname(coachKeysPath(userData));
  mkdirSync(dir, { recursive: true });
  const stored: StoredCoachKey = {
    v: 1,
    provider: record.provider,
    model: record.model,
    baseUrl: record.baseUrl,
    credential: encryptSecret(record.apiKey),
  };
  writeFileSync(coachKeysPath(userData), JSON.stringify(stored), 'utf8');
  return record;
}

export function clearCoachApiKey(userData: string): void {
  const file = coachKeysPath(userData);
  if (!existsSync(file)) return;
  try {
    unlinkSync(file);
  } catch {
    writeFileSync(file, '', 'utf8');
  }
}

export function normalizeBaseUrl(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('API base URL must be http(s)');
  }
  if (parsed.username || parsed.password) {
    throw new Error('API base URL must not contain credentials');
  }
  return parsed.toString().replace(/\/+$/, '');
}

function encryptSecret(plain: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(plain).toString('base64');
  }
  if (process.env.AFFINE_COACH_ALLOW_PLAIN_KEYS === '1') {
    return `plain:${plain}`;
  }
  throw new Error('Secure key storage is not available');
}

function decryptSecret(stored: string): string | null {
  if (stored.startsWith('plain:')) {
    if (process.env.AFFINE_COACH_ALLOW_PLAIN_KEYS === '1') {
      return stored.slice('plain:'.length);
    }
    return null;
  }
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(Buffer.from(stored, 'base64'));
  } catch {
    return null;
  }
}
