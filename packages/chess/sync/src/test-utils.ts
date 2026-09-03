import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type ChessSyncHandle, startChessSync } from './index.js';

export interface TestServer {
  handle: ChessSyncHandle;
  dataDir: string;
}

export async function startTestServer(): Promise<TestServer> {
  const dataDir = await mkdtemp(join(tmpdir(), 'chess-sync-'));
  const handle = await startChessSync({
    host: '127.0.0.1',
    port: 0,
    dataDir,
  });
  return { handle, dataDir };
}

export async function stopTestServer(server: TestServer): Promise<void> {
  await server.handle.close();
  await rm(server.dataDir, { recursive: true, force: true });
}

export function cookieHeader(setCookie: string[] | undefined): string {
  if (!setCookie?.length) return '';
  return setCookie
    .map(entry => entry.split(';')[0])
    .filter(Boolean)
    .join('; ');
}

export async function signInCookie(
  baseUrl: string,
  email: string,
  password: string
): Promise<{ cookies: string; user: { id: string } }> {
  const res = await fetch(`${baseUrl}/api/auth/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`sign-in failed: ${res.status} ${await res.text()}`);
  }
  const cookies = cookieHeader(res.headers.getSetCookie());
  const session = await fetch(`${baseUrl}/api/auth/session`, {
    headers: { cookie: cookies },
  });
  const body = (await session.json()) as { user: { id: string } | null };
  if (!body.user) throw new Error('signed-in session missing user');
  return { cookies, user: body.user };
}

export async function signInNative(
  baseUrl: string,
  email: string,
  password: string
): Promise<{
  accessToken: string;
  refreshToken: string;
  userId: string;
}> {
  const signIn = await fetch(`${baseUrl}/api/auth/sign-in`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-affine-client-kind': 'native',
    },
    body: JSON.stringify({ email, password }),
  });
  if (!signIn.ok) {
    throw new Error(
      `native sign-in failed: ${signIn.status} ${await signIn.text()}`
    );
  }
  const signed = (await signIn.json()) as {
    id: string;
    exchangeCode: string;
  };
  const exchange = await fetch(`${baseUrl}/api/auth/session/exchange`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      code: signed.exchangeCode,
      installationId: 'test-install',
      platform: 'test',
      deviceName: 'vitest',
    }),
  });
  if (!exchange.ok) {
    throw new Error(
      `exchange failed: ${exchange.status} ${await exchange.text()}`
    );
  }
  const tokens = (await exchange.json()) as {
    accessToken: string;
    refreshToken: string;
  };
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    userId: signed.id,
  };
}

export async function gql<T>(
  baseUrl: string,
  query: string,
  variables?: Record<string, unknown>,
  auth?: { cookies?: string; token?: string }
): Promise<{ data?: T; errors?: { message: string; extensions?: unknown }[] }> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (auth?.cookies) headers.cookie = auth.cookies;
  if (auth?.token) headers.authorization = `Bearer ${auth.token}`;
  const res = await fetch(`${baseUrl}/graphql`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });
  return (await res.json()) as {
    data?: T;
    errors?: { message: string; extensions?: unknown }[];
  };
}
