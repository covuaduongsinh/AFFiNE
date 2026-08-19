import { afterEach, describe, expect, it } from 'vitest';

import {
  gql,
  signInCookie,
  startTestServer,
  stopTestServer,
  type TestServer,
} from '../test-utils.js';

describe('comments', () => {
  let server: TestServer;

  afterEach(async () => {
    if (server) await stopTestServer(server);
  });

  it('creates, lists, and resolves a comment', async () => {
    server = await startTestServer();
    const { baseUrl } = server.handle;
    const owner = await signInCookie(baseUrl, 'comment@x.test', 'password1');
    const created = await gql<{ createWorkspace: { id: string } }>(
      baseUrl,
      `mutation { createWorkspace { id } }`,
      undefined,
      { cookies: owner.cookies }
    );
    const workspaceId = created.data!.createWorkspace.id;
    const docId = 'doc-1';
    const content = { type: 'doc', text: 'nice move' };

    const comment = await gql<{
      createComment: { id: string; resolved: boolean; content: unknown };
    }>(
      baseUrl,
      `mutation($input: CommentCreateInput!) {
        createComment(input: $input) {
          id
          content
          resolved
          createdAt
          updatedAt
          user { id name avatarUrl }
          replies { id }
        }
      }`,
      {
        input: {
          workspaceId,
          docId,
          docMode: 'page',
          docTitle: 'Game',
          content,
        },
      },
      { cookies: owner.cookies }
    );
    expect(comment.errors).toBeUndefined();
    const commentId = comment.data!.createComment.id;
    expect(comment.data?.createComment.resolved).toBe(false);

    const listed = await gql<{
      workspace: {
        comments: {
          edges: { node: { id: string; resolved: boolean } }[];
        };
      };
    }>(
      baseUrl,
      `query($workspaceId: String!, $docId: String!) {
        workspace(id: $workspaceId) {
          comments(docId: $docId) {
            totalCount
            edges { cursor node { id resolved content } }
            pageInfo { startCursor endCursor hasNextPage hasPreviousPage }
          }
        }
      }`,
      { workspaceId, docId },
      { cookies: owner.cookies }
    );
    expect(listed.data?.workspace.comments.edges.map(e => e.node.id)).toContain(
      commentId
    );

    const resolved = await gql<{ resolveComment: boolean }>(
      baseUrl,
      `mutation($input: CommentResolveInput!) {
        resolveComment(input: $input)
      }`,
      { input: { id: commentId, resolved: true } },
      { cookies: owner.cookies }
    );
    expect(resolved.data?.resolveComment).toBe(true);

    const again = await gql<{
      workspace: {
        comments: { edges: { node: { id: string; resolved: boolean } }[] };
      };
    }>(
      baseUrl,
      `query($workspaceId: String!, $docId: String!) {
        workspace(id: $workspaceId) {
          comments(docId: $docId) {
            edges { node { id resolved } }
          }
        }
      }`,
      { workspaceId, docId },
      { cookies: owner.cookies }
    );
    const node = again.data?.workspace.comments.edges.find(
      e => e.node.id === commentId
    );
    expect(node?.node.resolved).toBe(true);
  });
});
