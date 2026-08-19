import { afterEach, describe, expect, it } from 'vitest';

import {
  gql,
  signInCookie,
  startTestServer,
  stopTestServer,
  type TestServer,
} from '../test-utils.js';

describe('graphql', () => {
  let server: TestServer;

  afterEach(async () => {
    if (server) await stopTestServer(server);
  });

  it('returns self-hosted serverConfig and workspace invite flow', async () => {
    server = await startTestServer();
    const { baseUrl } = server.handle;

    const config = await gql<{
      serverConfig: {
        version: string;
        type: string;
        features: string[];
        initialized: boolean;
      };
    }>(
      baseUrl,
      `query {
        serverConfig {
          version
          type
          features
          initialized
        }
      }`
    );
    expect(config.errors).toBeUndefined();
    expect(config.data?.serverConfig.version).toBe('0.27.0');
    expect(config.data?.serverConfig.type).toBe('Selfhosted');
    expect(config.data?.serverConfig.initialized).toBe(true);
    expect([...config.data!.serverConfig.features].sort()).toEqual([
      'Comment',
      'LocalWorkspace',
    ]);

    const owner = await signInCookie(baseUrl, 'owner@x.test', 'password1');
    const created = await gql<{
      createWorkspace: { id: string; public: boolean };
    }>(
      baseUrl,
      `mutation { createWorkspace { id public createdAt } }`,
      undefined,
      { cookies: owner.cookies }
    );
    expect(created.errors).toBeUndefined();
    const workspaceId = created.data!.createWorkspace.id;

    const listed = await gql<{
      workspaces: { id: string }[];
    }>(
      baseUrl,
      `query { workspaces { id initialized team owner { id } } }`,
      undefined,
      {
        cookies: owner.cookies,
      }
    );
    expect(listed.data?.workspaces).toHaveLength(1);
    expect(listed.data?.workspaces[0]?.id).toBe(workspaceId);

    await signInCookie(baseUrl, 'member@x.test', 'password1');
    const invited = await gql<{
      inviteMembers: { email: string; inviteId: string }[];
    }>(
      baseUrl,
      `mutation($workspaceId: String!, $emails: [String!]!) {
        inviteMembers(workspaceId: $workspaceId, emails: $emails) {
          email
          inviteId
        }
      }`,
      { workspaceId, emails: ['member@x.test'] },
      { cookies: owner.cookies }
    );
    expect(invited.errors).toBeUndefined();
    const inviteId = invited.data!.inviteMembers[0]!.inviteId;

    const member = await signInCookie(baseUrl, 'member@x.test', 'password1');
    const accepted = await gql<{ acceptInviteById: boolean }>(
      baseUrl,
      `mutation($workspaceId: String!, $inviteId: String!) {
        acceptInviteById(workspaceId: $workspaceId, inviteId: $inviteId)
      }`,
      { workspaceId, inviteId },
      { cookies: member.cookies }
    );
    expect(accepted.errors).toBeUndefined();
    expect(accepted.data?.acceptInviteById).toBe(true);

    const memberWorkspaces = await gql<{ workspaces: { id: string }[] }>(
      baseUrl,
      `query { workspaces { id } }`,
      undefined,
      { cookies: member.cookies }
    );
    expect(memberWorkspaces.data?.workspaces.map(w => w.id)).toContain(
      workspaceId
    );
  });
});
