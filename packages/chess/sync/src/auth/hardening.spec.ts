import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { blobPath } from '../blob/store.js';
import { startChessSync } from '../server.js';
import { cookieHeader } from '../test-utils.js';

describe('blob keys stay inside the blob tree', () => {
  it('rejects a key that walks out of it', () => {
    // `setBlob` uses the upload's own filename as the key, so this is a name a
    // client can choose. Before the containment check it resolved to a path
    // outside the data directory and the server wrote there.
    for (const key of [
      '../../etc/passwd',
      '..%2f..%2fx'.replace(/%2f/g, '/'),
      'a/../../../b',
    ]) {
      expect(() => blobPath('/data', 'ws1', key)).toThrow(/invalid blob key/);
    }
  });

  it('still accepts the keys the app actually uses', () => {
    for (const key of ['avatar-abc123', 'comment-1.png', 'nested/name.jpg']) {
      expect(blobPath('/data', 'ws1', key)).toContain('/data/blobs/ws1/');
    }
  });
});

describe('the sign-in allowlist', () => {
  let server: { close: () => Promise<void> } | null = null;
  let dir = '';

  afterEach(async () => {
    if (server) await server.close();
    server = null;
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  const start = async (allowedEmails: string[]) => {
    dir = await mkdtemp(join(tmpdir(), 'chess-sync-hard-'));
    const handle = await startChessSync({
      host: '127.0.0.1',
      port: 0,
      dataDir: dir,
      allowedEmails,
    });
    server = handle;
    return handle.baseUrl;
  };

  const signIn = (baseUrl: string, email: string) =>
    fetch(`${baseUrl}/api/auth/sign-in`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'password1' }),
    });

  it('lets a listed address in and creates the account', async () => {
    const baseUrl = await start(['coach@club.test']);
    const res = await signIn(baseUrl, 'coach@club.test');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ email: 'coach@club.test' });
  });

  it('is case-insensitive about the address', async () => {
    const baseUrl = await start(['coach@club.test']);
    const res = await signIn(baseUrl, 'Coach@Club.TEST');
    expect(res.status).toBe(200);
  });

  it('turns an unlisted address away without creating anything', async () => {
    const baseUrl = await start(['coach@club.test']);
    const res = await signIn(baseUrl, 'stranger@example.com');
    expect(res.status).toBe(403);

    // And the refusal must not have registered them on the way out.
    const pre = await fetch(`${baseUrl}/api/auth/preflight`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'stranger@example.com' }),
    });
    expect(await pre.json()).toMatchObject({ registered: false });
  });

  it('does not confirm which unlisted addresses hold accounts', async () => {
    // Registered first with the list open, then locked out by a narrower list:
    // preflight must not become an oracle for addresses that can no longer be
    // used anyway.
    const baseUrl = await start([]);
    await signIn(baseUrl, 'old@club.test');
    await server!.close();
    server = null;

    const handle = await startChessSync({
      host: '127.0.0.1',
      port: 0,
      dataDir: dir,
      allowedEmails: ['coach@club.test'],
    });
    server = handle;
    const pre = await fetch(`${handle.baseUrl}/api/auth/preflight`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'old@club.test' }),
    });
    expect(await pre.json()).toMatchObject({ registered: false });
  });

  it('lets anyone in when the list is empty', async () => {
    // Local development and the embedded desktop server rely on this.
    const baseUrl = await start([]);
    expect((await signIn(baseUrl, 'anyone@example.com')).status).toBe(200);
  });
});

describe('session cookies', () => {
  let server: { close: () => Promise<void> } | null = null;
  let dir = '';

  afterEach(async () => {
    if (server) await server.close();
    server = null;
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  const start = async (publicOrigin?: string) => {
    dir = await mkdtemp(join(tmpdir(), 'chess-sync-cookie-'));
    const handle = await startChessSync({
      host: '127.0.0.1',
      port: 0,
      dataDir: dir,
      publicOrigin,
    });
    server = handle;
    return handle;
  };

  const cookiesFor = async (port: number) => {
    // baseUrl is now the *public* address, which does not resolve from here.
    // The socket is still on loopback.
    const baseUrl = `http://127.0.0.1:${port}`;
    const res = await fetch(`${baseUrl}/api/auth/sign-in`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'c@club.test', password: 'password1' }),
    });
    return res.headers.getSetCookie();
  };

  it('marks them secure behind an https address', async () => {
    const handle = await start('https://affine.example.vn');
    const set = await cookiesFor(handle.port);
    expect(set.join(';')).toMatch(/Secure/i);
  });

  it('leaves them usable over plain http locally', async () => {
    // A local run has no TLS, and a Secure cookie would simply never be sent.
    const handle = await start();
    const set = await cookiesFor(handle.port);
    expect(cookieHeader(set)).toContain('affine_session=');
    expect(set.join(';')).not.toMatch(/Secure/i);
  });

  it('reports the configured address as its own', async () => {
    // The desktop app registers this value as the server. A loopback address
    // would be useless to a machine that is not this one.
    const handle = await start('https://affine.example.vn');
    expect(handle.baseUrl).toBe('https://affine.example.vn');
  });
});

describe('data directory', () => {
  it('does not leak the jwt secret into a blob path', async () => {
    // Guards the shape of the tree the containment check depends on.
    const dir = await mkdtemp(join(tmpdir(), 'chess-sync-tree-'));
    await writeFile(join(dir, 'jwt-secret'), 'deadbeef', 'utf8');
    // One '..' only reaches blobs/ itself; two escape the data directory, which
    // is where jwt-secret and the database live.
    expect(() => blobPath(dir, 'ws', '../../jwt-secret')).toThrow();
    expect(() => blobPath(dir, 'ws', '../../pg/PG_VERSION')).toThrow();
    await rm(dir, { recursive: true, force: true });
  });
});
