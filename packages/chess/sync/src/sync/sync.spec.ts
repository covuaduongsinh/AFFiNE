import { io, type Socket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import {
  gql,
  signInNative,
  startTestServer,
  stopTestServer,
  type TestServer,
} from '../test-utils.js';

function connect(baseUrl: string, token: string): Promise<Socket> {
  const { promise, resolve, reject } = Promise.withResolvers<Socket>();
  const socket = io(baseUrl, {
    transports: ['polling', 'websocket'],
    auth: { token, tokenType: 'jwt' },
  });
  socket.once('connect', () => resolve(socket));
  socket.once('connect_error', reject);
  return promise;
}
function ack<T>(socket: Socket, event: string, payload: unknown): Promise<T> {
  const { promise, resolve, reject } = Promise.withResolvers<T>();
  socket.emit(
    event,
    payload,
    (res: { data?: T; error?: { name: string; message: string } }) => {
      if (res?.error) {
        reject(
          Object.assign(new Error(res.error.message), { name: res.error.name })
        );
        return;
      }
      resolve(res.data as T);
    }
  );
  return promise;
}
describe('space sync', () => {
  let server: TestServer;
  const sockets: Socket[] = [];

  afterEach(async () => {
    for (const socket of sockets) socket.close();
    sockets.length = 0;
    if (server) await stopTestServer(server);
  });

  it('broadcasts a Yjs update and load-doc returns the same snapshot', async () => {
    server = await startTestServer();
    const { baseUrl } = server.handle;
    const a = await signInNative(baseUrl, 'a@sync.test', 'password1');
    await signInNative(baseUrl, 'b@sync.test', 'password1');
    const created = await gql<{ createWorkspace: { id: string } }>(
      baseUrl,
      `mutation { createWorkspace { id } }`,
      undefined,
      { token: a.accessToken }
    );
    const spaceId = created.data!.createWorkspace.id;
    const invite = await gql<{
      inviteMembers: { inviteId: string }[];
    }>(
      baseUrl,
      `mutation($workspaceId: String!, $emails: [String!]!) {
        inviteMembers(workspaceId: $workspaceId, emails: $emails) { email inviteId }
      }`,
      { workspaceId: spaceId, emails: ['b@sync.test'] },
      { token: a.accessToken }
    );
    const b = await signInNative(baseUrl, 'b@sync.test', 'password1');
    await gql(
      baseUrl,
      `mutation($workspaceId: String!, $inviteId: String!) {
        acceptInviteById(workspaceId: $workspaceId, inviteId: $inviteId)
      }`,
      {
        workspaceId: spaceId,
        inviteId: invite.data!.inviteMembers[0]!.inviteId,
      },
      { token: b.accessToken }
    );

    const socketA = await connect(baseUrl, a.accessToken);
    const socketB = await connect(baseUrl, b.accessToken);
    sockets.push(socketA, socketB);

    const join = { spaceType: 'workspace', spaceId, clientVersion: '0.27.0' };
    await ack(socketA, 'space:join', join);
    await ack(socketB, 'space:join', join);

    const docA = new Y.Doc();
    docA.getMap('map').set('k', 'v');
    const update = Buffer.from(Y.encodeStateAsUpdate(docA)).toString('base64');
    const docId = 'root';

    const broadcast = Promise.withResolvers<{ update: string }>();
    const timer = setTimeout(
      () => broadcast.reject(new Error('no broadcast')),
      5000
    );
    socketB.once('space:broadcast-doc-update', payload => {
      clearTimeout(timer);
      broadcast.resolve(payload);
    });
    await ack(socketA, 'space:push-doc-update', {
      spaceType: 'workspace',
      spaceId,
      docId,
      update,
    });
    const received = await broadcast.promise;
    const docB = new Y.Doc();
    Y.applyUpdate(docB, Buffer.from(received.update, 'base64'));
    expect(docB.getMap('map').get('k')).toBe('v');

    const loaded = await ack<{
      missing: string;
      state: string;
      timestamp: number;
    }>(socketB, 'space:load-doc', { spaceType: 'workspace', spaceId, docId });
    const fresh = new Y.Doc();
    Y.applyUpdate(fresh, Buffer.from(loaded.missing, 'base64'));
    expect(fresh.getMap('map').get('k')).toBe('v');
  });
});
