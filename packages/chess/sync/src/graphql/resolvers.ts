import { and, desc, eq } from 'drizzle-orm';
import { GraphQLScalarType, Kind } from 'graphql';
import * as Y from 'yjs';

import { removeBlobFile, writeBlobFile } from '../blob/store.js';
import { newId } from '../crypto.js';
import {
  blobs,
  comments,
  inviteLinks,
  invites,
  members,
  replies,
  users,
  workspaces,
} from '../db/schema.js';
import { gqlError } from '../errors.js';
import { loadYDoc, releaseDoc } from '../sync/docs.js';
import type { GqlContext } from '../types.js';
import {
  docPermissions,
  getMember,
  getOwnerId,
  publicUser,
  requireMember,
  requireRole,
  requireUser,
  workspaceExists,
  workspacePermissions,
} from '../workspace.js';

const DateTime = new GraphQLScalarType({
  name: 'DateTime',
  serialize(value) {
    if (value instanceof Date) return value.toISOString();
    return String(value);
  },
  parseValue(value) {
    return new Date(String(value));
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) return new Date(ast.value);
    return null;
  },
});

const JSONObject = new GraphQLScalarType({
  name: 'JSONObject',
  serialize: value => value,
  parseValue: value => value,
  parseLiteral() {
    return null;
  },
});

const SafeInt = new GraphQLScalarType({
  name: 'SafeInt',
  serialize: value => Number(value),
  parseValue: value => Number(value),
  parseLiteral(ast) {
    if (ast.kind === Kind.INT) return Number(ast.value);
    return null;
  },
});

const BLOB_LIMIT = 104857600;

function userType(user: {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  avatarUrl: string | null;
}) {
  return {
    ...user,
    hasPassword: true,
    features: [],
  };
}

function workspaceType(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    initialized: true,
    team: false,
    public: false,
    createdAt: extra.createdAt ?? new Date(),
    ...extra,
  };
}

const EXPIRE_MS: Record<string, number> = {
  OneDay: 86400000,
  ThreeDays: 3 * 86400000,
  OneWeek: 7 * 86400000,
  OneMonth: 30 * 86400000,
};

async function commentType(ctx: GqlContext, row: typeof comments.$inferSelect) {
  const user = (await publicUser(ctx.state, row.userId)) ?? {
    id: row.userId,
    name: 'user',
    avatarUrl: null,
  };
  const replyRows = await ctx.state.db.db
    .select()
    .from(replies)
    .where(eq(replies.commentId, row.id));
  return {
    id: row.id,
    content: row.content,
    resolved: row.resolved,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    user,
    replies: await Promise.all(replyRows.map(reply => replyType(ctx, reply))),
  };
}

async function replyType(ctx: GqlContext, row: typeof replies.$inferSelect) {
  const user = (await publicUser(ctx.state, row.userId)) ?? {
    id: row.userId,
    name: 'user',
    avatarUrl: null,
  };
  return {
    commentId: row.commentId,
    id: row.id,
    content: row.content,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    user,
  };
}

export function createResolvers() {
  return {
    DateTime,
    JSONObject,
    SafeInt,
    Query: {
      serverConfig: (_: unknown, __: unknown, ctx: GqlContext) => ({
        version: '0.27.0',
        baseUrl: ctx.origin,
        name: 'Chess Sync',
        features: ['Comment', 'LocalWorkspace'],
        type: 'Selfhosted',
        initialized: true,
        calendarProviders: [],
        credentialsRequirement: {
          password: { minLength: 8, maxLength: 32 },
        },
      }),
      currentUser: (_: unknown, __: unknown, ctx: GqlContext) =>
        ctx.user ? userType(ctx.user) : null,
      workspaces: async (_: unknown, __: unknown, ctx: GqlContext) => {
        if (!ctx.user) return [];
        const rows = await ctx.state.db.db
          .select({ workspaceId: members.workspaceId })
          .from(members)
          .where(
            and(eq(members.userId, ctx.user.id), eq(members.status, 'Accepted'))
          );
        return rows.map(row => workspaceType(row.workspaceId));
      },
      workspace: async (_: unknown, args: { id: string }, ctx: GqlContext) => {
        const row = await workspaceExists(ctx.state, args.id);
        if (!row) throw gqlError(404, 'WORKSPACE_NOT_FOUND', 'not found');
        return workspaceType(row.id, {
          public: row.public,
          createdAt: row.createdAt,
        });
      },
      getInviteInfo: async (
        _: unknown,
        args: { inviteId: string },
        ctx: GqlContext
      ) => {
        const [invite] = await ctx.state.db.db
          .select()
          .from(invites)
          .where(eq(invites.id, args.inviteId));
        if (!invite) throw gqlError(404, 'NOT_FOUND', 'invite not found');
        const inviter = await publicUser(ctx.state, invite.invitedBy);
        const [inviteeUser] = await ctx.state.db.db
          .select()
          .from(users)
          .where(eq(users.email, invite.email.toLowerCase()));
        return {
          workspace: {
            id: invite.workspaceId,
            name: invite.workspaceId,
            avatar: '',
          },
          user: {
            id: inviter?.id ?? invite.invitedBy,
            name: inviter?.name ?? 'user',
            email: '',
            avatarUrl: inviter?.avatarUrl ?? null,
          },
          status: invite.status,
          invitee: {
            id: inviteeUser?.id ?? invite.id,
            name: invite.email,
            email: invite.email,
            avatarUrl: inviteeUser?.avatarUrl ?? null,
          },
        };
      },
      publicUserById: async (
        _: unknown,
        args: { id: string },
        ctx: GqlContext
      ) => publicUser(ctx.state, args.id),
      workspaceRolePermissions: async (
        _: unknown,
        args: { id: string },
        ctx: GqlContext
      ) => {
        const member = ctx.user
          ? await getMember(ctx.state, args.id, ctx.user.id)
          : undefined;
        const role = member?.role ?? 'External';
        return { role, permissions: workspacePermissions(role) };
      },
    },
    WorkspaceType: {
      owner: async (parent: { id: string }, _: unknown, ctx: GqlContext) => {
        const ownerId = await getOwnerId(ctx.state, parent.id);
        const user = await publicUser(ctx.state, ownerId);
        return userType({
          id: ownerId,
          name: user?.name ?? 'owner',
          email: '',
          emailVerified: true,
          avatarUrl: user?.avatarUrl ?? null,
        });
      },
      blobs: async (parent: { id: string }, _: unknown, ctx: GqlContext) => {
        await requireMember(ctx, parent.id);
        const rows = await ctx.state.db.db
          .select()
          .from(blobs)
          .where(
            and(eq(blobs.workspaceId, parent.id), eq(blobs.deleted, false))
          );
        return rows.map(row => ({
          key: row.key,
          size: row.size,
          mime: row.mime,
          createdAt: row.createdAt.toISOString(),
        }));
      },
      quota: () => ({
        blobLimit: BLOB_LIMIT,
        humanReadable: { blobLimit: '100MB' },
      }),
      comments: async (
        parent: { id: string },
        args: {
          docId: string;
          pagination?: { first?: number; after?: string };
        },
        ctx: GqlContext
      ) => {
        await requireMember(ctx, parent.id);
        const first = args.pagination?.first ?? 50;
        const rows = await ctx.state.db.db
          .select()
          .from(comments)
          .where(
            and(
              eq(comments.workspaceId, parent.id),
              eq(comments.docId, args.docId)
            )
          )
          .orderBy(desc(comments.createdAt));
        let slice = rows;
        if (args.pagination?.after) {
          const idx = rows.findIndex(row => row.id === args.pagination?.after);
          slice = idx >= 0 ? rows.slice(idx + 1) : rows;
        }
        const page = slice.slice(0, first);
        const nodes = await Promise.all(page.map(row => commentType(ctx, row)));
        return {
          totalCount: rows.length,
          edges: nodes.map(node => ({ cursor: node.id, node })),
          pageInfo: {
            startCursor: nodes[0]?.id ?? null,
            endCursor: nodes[nodes.length - 1]?.id ?? null,
            hasNextPage: slice.length > first,
            hasPreviousPage: Boolean(args.pagination?.after),
          },
        };
      },
      doc: async (
        parent: { id: string },
        args: { docId: string },
        ctx: GqlContext
      ) => {
        const member = ctx.user
          ? await getMember(ctx.state, parent.id, ctx.user.id)
          : undefined;
        const allowed = member?.status === 'Accepted';
        const ownerId = await getOwnerId(ctx.state, parent.id);
        return {
          id: args.docId,
          mode: 'Page',
          public: false,
          permissions: docPermissions(Boolean(allowed)),
          summary: '',
          creatorId: ownerId,
          lastUpdaterId: ownerId,
        };
      },
      publicDocs: () => [],
      histories: () => [],
      docs: async (
        parent: { id: string },
        args: { pagination?: { first?: number; after?: string } },
        ctx: GqlContext
      ) => {
        const ownerId = await getOwnerId(ctx.state, parent.id);
        const rootDoc = await loadYDoc(ctx.state, parent.id, parent.id);
        const metaMap = rootDoc.getMap('meta');
        const pages = metaMap.get('pages') as Y.Array<unknown> | undefined;
        const docList: Array<{
          id: string;
          creatorId: string;
          lastUpdaterId: string;
          permissions: ReturnType<typeof docPermissions>;
          mode: string;
          public: boolean;
          summary: string;
        }> = [];
        if (pages && pages instanceof Y.Array) {
          for (let i = 0; i < pages.length; i++) {
            const p = pages.get(i);
            if (p instanceof Y.Map) {
              const id = p.get('id') as string;
              if (id) {
                docList.push({
                  id,
                  creatorId: (p.get('createdBy') as string) || ownerId,
                  lastUpdaterId: (p.get('updatedBy') as string) || ownerId,
                  permissions: docPermissions(true),
                  mode: 'Page',
                  public: false,
                  summary: '',
                });
              }
            }
          }
        }
        releaseDoc(parent.id, parent.id);

        const first = args.pagination?.first ?? 100;
        let slice = docList;
        if (args.pagination?.after) {
          const idx = docList.findIndex(d => d.id === args.pagination?.after);
          slice = idx >= 0 ? docList.slice(idx + 1) : docList;
        }
        const page = slice.slice(0, first);
        return {
          totalCount: docList.length,
          pageInfo: {
            startCursor: page[0]?.id ?? null,
            endCursor: page[page.length - 1]?.id ?? null,
            hasNextPage: slice.length > first,
            hasPreviousPage: Boolean(args.pagination?.after),
          },
          edges: page.map(node => ({ cursor: node.id, node })),
        };
      },
      pageMeta: async (
        parent: { id: string },
        args: { pageId: string },
        ctx: GqlContext
      ) => {
        const ownerId = await getOwnerId(ctx.state, parent.id);
        const user = await publicUser(ctx.state, ownerId);
        const editor = user
          ? { name: user.name, avatarUrl: user.avatarUrl }
          : null;
        return {
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: editor,
          updatedBy: editor,
        };
      },
      blobUploadPartUrl: () => null,
    },
    Mutation: {
      createWorkspace: async (_: unknown, __: unknown, ctx: GqlContext) => {
        const user = requireUser(ctx);
        const id = newId();
        const [row] = await ctx.state.db.db
          .insert(workspaces)
          .values({ id })
          .returning();
        await ctx.state.db.db.insert(members).values({
          workspaceId: id,
          userId: user.id,
          role: 'Owner',
          status: 'Accepted',
          inviteId: newId(),
        });
        return workspaceType(id, { createdAt: row?.createdAt ?? new Date() });
      },
      deleteWorkspace: async (
        _: unknown,
        args: { id: string },
        ctx: GqlContext
      ) => {
        await requireRole(ctx, args.id, ['Owner']);
        await ctx.state.db.db
          .delete(workspaces)
          .where(eq(workspaces.id, args.id));
        return true;
      },
      leaveWorkspace: async (
        _: unknown,
        args: { workspaceId: string },
        ctx: GqlContext
      ) => {
        const member = await requireMember(ctx, args.workspaceId);
        if (member.role === 'Owner') {
          throw gqlError(400, 'ACTION_FORBIDDEN', 'You cannot leave as owner');
        }
        await ctx.state.db.db
          .delete(members)
          .where(
            and(
              eq(members.workspaceId, args.workspaceId),
              eq(members.userId, member.userId)
            )
          );
        return true;
      },
      inviteMembers: async (
        _: unknown,
        args: { workspaceId: string; emails: string[] },
        ctx: GqlContext
      ) => {
        const inviter = await requireRole(ctx, args.workspaceId, [
          'Owner',
          'Admin',
        ]);
        const results = [];
        for (const email of args.emails) {
          const inviteId = newId();
          await ctx.state.db.db.insert(invites).values({
            id: inviteId,
            workspaceId: args.workspaceId,
            email: email.toLowerCase(),
            invitedBy: inviter.userId,
          });
          results.push({ email, inviteId });
        }
        return results;
      },
      acceptInviteById: async (
        _: unknown,
        args: { workspaceId?: string; inviteId: string },
        ctx: GqlContext
      ) => {
        const user = requireUser(ctx);
        const [invite] = await ctx.state.db.db
          .select()
          .from(invites)
          .where(eq(invites.id, args.inviteId));
        if (!invite || invite.status !== 'Pending') {
          throw gqlError(404, 'NOT_FOUND', 'invite not found');
        }
        if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
          throw gqlError(403, 'ACCESS_DENIED', 'invite email mismatch');
        }
        if (args.workspaceId && args.workspaceId !== invite.workspaceId) {
          throw gqlError(400, 'INVALID_INPUT', 'workspace mismatch');
        }
        await ctx.state.db.db
          .insert(members)
          .values({
            workspaceId: invite.workspaceId,
            userId: user.id,
            role: invite.role,
            status: 'Accepted',
            inviteId: invite.id,
          })
          .onConflictDoNothing();
        await ctx.state.db.db
          .update(invites)
          .set({ status: 'Accepted' })
          .where(eq(invites.id, invite.id));
        return true;
      },
      createInviteLink: async (
        _: unknown,
        args: { workspaceId: string; expireTime: string },
        ctx: GqlContext
      ) => {
        await requireRole(ctx, args.workspaceId, ['Owner', 'Admin']);
        const token = newId();
        const expireTime = new Date(
          Date.now() + (EXPIRE_MS[args.expireTime] ?? EXPIRE_MS.OneWeek)
        );
        await ctx.state.db.db
          .insert(inviteLinks)
          .values({ workspaceId: args.workspaceId, token, expireTime })
          .onConflictDoUpdate({
            target: inviteLinks.workspaceId,
            set: { token, expireTime },
          });
        return {
          link: `${ctx.origin}/invite/${token}`,
          expireTime,
        };
      },
      revokeInviteLink: async (
        _: unknown,
        args: { workspaceId: string },
        ctx: GqlContext
      ) => {
        await requireRole(ctx, args.workspaceId, ['Owner', 'Admin']);
        await ctx.state.db.db
          .delete(inviteLinks)
          .where(eq(inviteLinks.workspaceId, args.workspaceId));
        return true;
      },
      grantMember: async (
        _: unknown,
        args: { workspaceId: string; userId: string; permission: string },
        ctx: GqlContext
      ) => {
        const actor = await requireRole(ctx, args.workspaceId, ['Owner']);
        if (args.permission === 'Owner') {
          await ctx.state.db.db
            .update(members)
            .set({ role: 'Admin' })
            .where(
              and(
                eq(members.workspaceId, args.workspaceId),
                eq(members.userId, actor.userId)
              )
            );
        }
        await ctx.state.db.db
          .update(members)
          .set({ role: args.permission })
          .where(
            and(
              eq(members.workspaceId, args.workspaceId),
              eq(members.userId, args.userId)
            )
          );
        return true;
      },
      approveMember: async (
        _: unknown,
        args: { workspaceId: string; userId: string },
        ctx: GqlContext
      ) => {
        await requireRole(ctx, args.workspaceId, ['Owner', 'Admin']);
        await ctx.state.db.db
          .update(members)
          .set({ status: 'Accepted' })
          .where(
            and(
              eq(members.workspaceId, args.workspaceId),
              eq(members.userId, args.userId)
            )
          );
        return true;
      },
      revokeMember: async (
        _: unknown,
        args: { workspaceId: string; userId: string },
        ctx: GqlContext
      ) => {
        await requireRole(ctx, args.workspaceId, ['Owner', 'Admin']);
        const target = await getMember(
          ctx.state,
          args.workspaceId,
          args.userId
        );
        if (target?.role === 'Owner') {
          throw gqlError(400, 'ACTION_FORBIDDEN', 'cannot revoke Owner');
        }
        await ctx.state.db.db
          .delete(members)
          .where(
            and(
              eq(members.workspaceId, args.workspaceId),
              eq(members.userId, args.userId)
            )
          );
        return true;
      },
      updateProfile: async (
        _: unknown,
        args: { input: { name?: string } },
        ctx: GqlContext
      ) => {
        const user = requireUser(ctx);
        if (args.input.name) {
          await ctx.state.db.db
            .update(users)
            .set({ name: args.input.name })
            .where(eq(users.id, user.id));
          user.name = args.input.name;
        }
        return userType(user);
      },
      createComment: async (
        _: unknown,
        args: {
          input: { workspaceId: string; docId: string; content: unknown };
        },
        ctx: GqlContext
      ) => {
        const user = requireUser(ctx);
        await requireMember(ctx, args.input.workspaceId);
        const [row] = await ctx.state.db.db
          .insert(comments)
          .values({
            id: newId(),
            workspaceId: args.input.workspaceId,
            docId: args.input.docId,
            content: args.input.content,
            userId: user.id,
          })
          .returning();
        if (!row) {
          throw gqlError(
            500,
            'INTERNAL_SERVER_ERROR',
            'Failed to create comment'
          );
        }
        return commentType(ctx, row);
      },
      updateComment: async (
        _: unknown,
        args: { input: { id: string; content: unknown } },
        ctx: GqlContext
      ) => {
        requireUser(ctx);
        await ctx.state.db.db
          .update(comments)
          .set({ content: args.input.content, updatedAt: new Date() })
          .where(eq(comments.id, args.input.id));
        return true;
      },
      deleteComment: async (
        _: unknown,
        args: { id: string },
        ctx: GqlContext
      ) => {
        requireUser(ctx);
        await ctx.state.db.db.delete(comments).where(eq(comments.id, args.id));
        return true;
      },
      resolveComment: async (
        _: unknown,
        args: { input: { id: string; resolved: boolean } },
        ctx: GqlContext
      ) => {
        requireUser(ctx);
        await ctx.state.db.db
          .update(comments)
          .set({ resolved: args.input.resolved, updatedAt: new Date() })
          .where(eq(comments.id, args.input.id));
        return true;
      },
      createReply: async (
        _: unknown,
        args: { input: { commentId: string; content: unknown } },
        ctx: GqlContext
      ) => {
        const user = requireUser(ctx);
        const [row] = await ctx.state.db.db
          .insert(replies)
          .values({
            id: newId(),
            commentId: args.input.commentId,
            content: args.input.content,
            userId: user.id,
          })
          .returning();
        if (!row) {
          throw gqlError(
            500,
            'INTERNAL_SERVER_ERROR',
            'Failed to create reply'
          );
        }
        return replyType(ctx, row);
      },
      updateReply: async (
        _: unknown,
        args: { input: { id: string; content: unknown } },
        ctx: GqlContext
      ) => {
        requireUser(ctx);
        await ctx.state.db.db
          .update(replies)
          .set({ content: args.input.content, updatedAt: new Date() })
          .where(eq(replies.id, args.input.id));
        return true;
      },
      deleteReply: async (
        _: unknown,
        args: { id: string },
        ctx: GqlContext
      ) => {
        requireUser(ctx);
        await ctx.state.db.db.delete(replies).where(eq(replies.id, args.id));
        return true;
      },
      uploadCommentAttachment: async (
        _: unknown,
        args: { workspaceId: string; docId: string; attachment: File },
        ctx: GqlContext
      ) => {
        await requireMember(ctx, args.workspaceId);
        const key = `comment-${newId()}`;
        const bytes = new Uint8Array(await args.attachment.arrayBuffer());
        await writeBlobFile(
          ctx.state,
          args.workspaceId,
          key,
          args.attachment.type || 'application/octet-stream',
          bytes
        );
        return `${ctx.origin}/api/workspaces/${args.workspaceId}/blobs/${key}`;
      },
      setBlob: async (
        _: unknown,
        args: { workspaceId: string; blob: File },
        ctx: GqlContext
      ) => {
        await requireMember(ctx, args.workspaceId);
        const key = args.blob.name;
        const bytes = new Uint8Array(await args.blob.arrayBuffer());
        return writeBlobFile(
          ctx.state,
          args.workspaceId,
          key,
          args.blob.type || 'application/octet-stream',
          bytes
        );
      },
      createBlobUpload: async (
        _: unknown,
        args: { workspaceId: string; key: string },
        ctx: GqlContext
      ) => {
        await requireMember(ctx, args.workspaceId);
        return {
          method: 'GRAPHQL',
          blobKey: args.key,
          alreadyUploaded: false,
          uploadUrl: null,
          headers: null,
          expiresAt: null,
          uploadId: null,
          partSize: null,
          uploadedParts: [],
        };
      },
      deleteBlob: async (
        _: unknown,
        args: { workspaceId: string; key: string; permanently?: boolean },
        ctx: GqlContext
      ) => {
        await requireMember(ctx, args.workspaceId);
        if (args.permanently) {
          await ctx.state.db.db
            .delete(blobs)
            .where(
              and(
                eq(blobs.workspaceId, args.workspaceId),
                eq(blobs.key, args.key)
              )
            );
          await removeBlobFile(ctx.state, args.workspaceId, args.key);
        } else {
          await ctx.state.db.db
            .update(blobs)
            .set({ deleted: true })
            .where(
              and(
                eq(blobs.workspaceId, args.workspaceId),
                eq(blobs.key, args.key)
              )
            );
        }
        return true;
      },
      releaseDeletedBlobs: async (
        _: unknown,
        args: { workspaceId: string },
        ctx: GqlContext
      ) => {
        await requireMember(ctx, args.workspaceId);
        const rows = await ctx.state.db.db
          .select()
          .from(blobs)
          .where(
            and(
              eq(blobs.workspaceId, args.workspaceId),
              eq(blobs.deleted, true)
            )
          );
        for (const row of rows) {
          await removeBlobFile(ctx.state, args.workspaceId, row.key);
        }
        await ctx.state.db.db
          .delete(blobs)
          .where(
            and(
              eq(blobs.workspaceId, args.workspaceId),
              eq(blobs.deleted, true)
            )
          );
        return true;
      },
      sendChangePasswordEmail: () => true,
      sendSetPasswordEmail: () => true,
      sendVerifyEmail: () => true,
      sendChangeEmail: () => true,
      sendVerifyChangeEmail: () => true,
      changePassword: () => true,
      changeEmail: (_: unknown, __: unknown, ctx: GqlContext) =>
        ctx.user
          ? userType(ctx.user)
          : userType({
              id: 'unknown',
              name: 'user',
              email: '',
              emailVerified: true,
              avatarUrl: null,
            }),
      verifyEmail: () => true,
      updateSettings: () => true,
      deleteAccount: async (_: unknown, __: unknown, ctx: GqlContext) => {
        const user = requireUser(ctx);
        await ctx.state.db.db.delete(users).where(eq(users.id, user.id));
        return { success: true };
      },
      uploadAvatar: async (
        _: unknown,
        args: { avatar: File },
        ctx: GqlContext
      ) => {
        const user = requireUser(ctx);
        const key = `avatar-${user.id}`;
        const bytes = new Uint8Array(await args.avatar.arrayBuffer());
        await writeBlobFile(
          ctx.state,
          'avatars',
          key,
          args.avatar.type || 'image/png',
          bytes
        );
        const avatarUrl = `${ctx.origin}/api/workspaces/avatars/blobs/${key}`;
        await ctx.state.db.db
          .update(users)
          .set({ avatarUrl })
          .where(eq(users.id, user.id));
        user.avatarUrl = avatarUrl;
        return userType(user);
      },
      removeAvatar: async (_: unknown, __: unknown, ctx: GqlContext) => {
        const user = requireUser(ctx);
        await ctx.state.db.db
          .update(users)
          .set({ avatarUrl: null })
          .where(eq(users.id, user.id));
        return { success: true };
      },
      updateWorkspace: (_: unknown, args: { input: { id: string } }) =>
        workspaceType(args.input.id),
      publishDoc: (_: unknown, args: { docId: string }) => ({
        id: args.docId,
        mode: 'Page',
        public: false,
        permissions: docPermissions(true),
        summary: '',
      }),
      revokePublicDoc: (_: unknown, args: { docId: string }) => ({
        id: args.docId,
        mode: 'Page',
        public: false,
        permissions: docPermissions(true),
        summary: '',
      }),
      grantDocUserRoles: () => true,
      updateDocUserRole: () => true,
      revokeDocUserRoles: () => true,
      updateDocDefaultRole: () => true,
      mentionUser: () => newId(),
      recoverDoc: () => new Date(),
    },
  };
}
