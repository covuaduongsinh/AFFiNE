import { afterEach, describe, expect, it } from 'vitest';

import {
  gql,
  signInCookie,
  startTestServer,
  stopTestServer,
  type TestServer,
} from '../test-utils.js';

describe('blobs', () => {
  let server: TestServer;

  afterEach(async () => {
    if (server) await stopTestServer(server);
  });

  it('creates GRAPHQL upload, setBlob multipart, GET bytes, listBlobs', async () => {
    server = await startTestServer();
    const { baseUrl } = server.handle;
    const owner = await signInCookie(baseUrl, 'blob@x.test', 'password1');
    const created = await gql<{ createWorkspace: { id: string } }>(
      baseUrl,
      `mutation { createWorkspace { id } }`,
      undefined,
      { cookies: owner.cookies }
    );
    const workspaceId = created.data!.createWorkspace.id;
    const key = 'note.txt';
    const bytes = Buffer.from('pgn-or-image');

    const upload = await gql<{
      createBlobUpload: {
        method: string;
        blobKey: string;
        alreadyUploaded: boolean;
      };
    }>(
      baseUrl,
      `mutation($workspaceId: String!, $key: String!, $size: Int!, $mime: String!) {
        createBlobUpload(workspaceId: $workspaceId, key: $key, size: $size, mime: $mime) {
          method
          blobKey
          alreadyUploaded
          uploadUrl
          headers
          expiresAt
          uploadId
          partSize
          uploadedParts { partNumber etag }
        }
      }`,
      {
        workspaceId,
        key,
        size: bytes.byteLength,
        mime: 'text/plain',
      },
      { cookies: owner.cookies }
    );
    expect(upload.errors).toBeUndefined();
    expect(upload.data?.createBlobUpload.method).toBe('GRAPHQL');
    expect(upload.data?.createBlobUpload.blobKey).toBe(key);
    expect(upload.data?.createBlobUpload.alreadyUploaded).toBe(false);

    const operations = JSON.stringify({
      name: 'setBlobMutation',
      query: `mutation setBlobMutation($workspaceId: String!, $blob: Upload!) {
        setBlob(workspaceId: $workspaceId, blob: $blob)
      }`,
      variables: { workspaceId, blob: null },
      map: {},
    });
    const form = new FormData();
    form.set('operations', operations);
    form.set('map', JSON.stringify({ '0': ['variables.blob'] }));
    form.set('0', new File([bytes], key, { type: 'text/plain' }));
    const setBlob = await fetch(`${baseUrl}/graphql`, {
      method: 'POST',
      headers: { cookie: owner.cookies },
      body: form,
    });
    expect(setBlob.status).toBe(200);
    const setBody = (await setBlob.json()) as {
      data?: { setBlob: string };
      errors?: unknown;
    };
    expect(setBody.errors).toBeUndefined();
    expect(setBody.data?.setBlob).toBe(key);

    const raw = await fetch(
      `${baseUrl}/api/workspaces/${workspaceId}/blobs/${key}`,
      {
        headers: { cookie: owner.cookies },
      }
    );
    expect(raw.status).toBe(200);
    expect(raw.headers.get('content-type')).toMatch(/text\/plain/);
    expect(Buffer.from(await raw.arrayBuffer()).toString()).toBe(
      'pgn-or-image'
    );

    const listed = await gql<{
      workspace: { blobs: { key: string }[] };
    }>(
      baseUrl,
      `query($workspaceId: String!) {
        workspace(id: $workspaceId) { blobs { key size mime createdAt } }
      }`,
      { workspaceId },
      { cookies: owner.cookies }
    );
    expect(listed.errors).toBeUndefined();
    expect(listed.data?.workspace.blobs.map(b => b.key)).toContain(key);
  });
});
