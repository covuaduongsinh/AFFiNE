import { afterEach, describe, expect, it } from 'vitest';

import {
  cookieHeader,
  startTestServer,
  stopTestServer,
  type TestServer,
} from '../test-utils.js';

describe('auth REST', () => {
  let server: TestServer;

  afterEach(async () => {
    if (server) await stopTestServer(server);
  });

  it('registers via sign-in, preflight, session cookie, native exchange, refresh, change-password', async () => {
    server = await startTestServer();
    const { baseUrl } = server.handle;

    const created = await fetch(`${baseUrl}/api/auth/sign-in`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@x.test', password: 'password1' }),
    });
    expect(created.status).toBe(200);
    const cookies = cookieHeader(created.headers.getSetCookie());
    expect(cookies).toContain('affine_session=');

    const preflight = await fetch(`${baseUrl}/api/auth/preflight`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@x.test' }),
    });
    expect(preflight.status).toBe(200);
    await expect(preflight.json()).resolves.toMatchObject({
      registered: true,
      methods: { password: { available: true } },
    });

    const wrong = await fetch(`${baseUrl}/api/auth/sign-in`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@x.test', password: 'wrongpass' }),
    });
    expect(wrong.status).toBe(400);
    await expect(wrong.json()).resolves.toMatchObject({
      status: 400,
      code: 'INVALID_PASSWORD',
      type: 'INVALID_PASSWORD',
      name: 'INVALID_PASSWORD',
      message: 'Invalid password',
    });

    const session = await fetch(`${baseUrl}/api/auth/session`, {
      headers: { cookie: cookies },
    });
    expect(session.status).toBe(200);
    const sessionBody = (await session.json()) as {
      user: { id: string } | null;
    };
    expect(sessionBody.user?.id).toEqual(expect.any(String));

    const native = await fetch(`${baseUrl}/api/auth/sign-in`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-affine-client-kind': 'native',
      },
      body: JSON.stringify({ email: 'a@x.test', password: 'password1' }),
    });
    expect(native.status).toBe(200);
    const nativeBody = (await native.json()) as { exchangeCode?: string };
    expect(nativeBody.exchangeCode).toEqual(expect.any(String));

    const exchanged = await fetch(`${baseUrl}/api/auth/session/exchange`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        code: nativeBody.exchangeCode,
        installationId: 'install-1',
        platform: 'electron',
        deviceName: 'vitest',
      }),
    });
    expect(exchanged.status).toBe(200);
    const tokens = (await exchanged.json()) as {
      tokenType: string;
      expiresIn: number;
      accessToken: string;
      refreshToken: string;
    };
    expect(tokens.tokenType).toBe('Bearer');
    expect(tokens.expiresIn).toBe(900);
    expect(tokens.accessToken).toEqual(expect.any(String));
    expect(tokens.refreshToken).toEqual(expect.any(String));

    const refreshed = await fetch(`${baseUrl}/api/auth/session/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });
    expect(refreshed.status).toBe(200);
    const rotated = (await refreshed.json()) as { refreshToken: string };
    expect(rotated.refreshToken).toEqual(expect.any(String));
    expect(rotated.refreshToken).not.toBe(tokens.refreshToken);

    const reuse = await fetch(`${baseUrl}/api/auth/session/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });
    expect(reuse.status).toBeGreaterThanOrEqual(400);

    const changed = await fetch(`${baseUrl}/api/auth/change-password`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: cookies,
      },
      body: JSON.stringify({
        oldPassword: 'password1',
        newPassword: 'password2',
      }),
    });
    expect(changed.status).toBe(200);
    await expect(changed.json()).resolves.toEqual({ ok: true });

    const oldPass = await fetch(`${baseUrl}/api/auth/sign-in`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@x.test', password: 'password1' }),
    });
    expect(oldPass.status).toBe(400);

    const newPass = await fetch(`${baseUrl}/api/auth/sign-in`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@x.test', password: 'password2' }),
    });
    expect(newPass.status).toBe(200);
  });
});
