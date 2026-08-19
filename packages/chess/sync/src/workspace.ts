import { and, eq } from 'drizzle-orm';

import { members, users, workspaces } from './db/schema.js';
import { gqlError } from './errors.js';
import type { AppState, GqlContext, MemberRow, UserRow } from './types.js';

const WORKSPACE_KEYS = [
  'Workspace_Administrators_Manage',
  'Workspace_Blobs_List',
  'Workspace_Blobs_Read',
  'Workspace_Blobs_Write',
  'Workspace_Copilot',
  'Workspace_CreateDoc',
  'Workspace_Delete',
  'Workspace_Organize_Read',
  'Workspace_Payment_Manage',
  'Workspace_Properties_Create',
  'Workspace_Properties_Delete',
  'Workspace_Properties_Read',
  'Workspace_Properties_Update',
  'Workspace_Read',
  'Workspace_Settings_Read',
  'Workspace_Settings_Update',
  'Workspace_Sync',
  'Workspace_TransferOwner',
  'Workspace_Users_Manage',
  'Workspace_Users_Read',
] as const;

const DOC_KEYS = [
  'Doc_Copy',
  'Doc_Delete',
  'Doc_Duplicate',
  'Doc_Properties_Read',
  'Doc_Properties_Update',
  'Doc_Publish',
  'Doc_Read',
  'Doc_Restore',
  'Doc_TransferOwner',
  'Doc_Trash',
  'Doc_Update',
  'Doc_Users_Manage',
  'Doc_Users_Read',
  'Doc_Comments_Create',
  'Doc_Comments_Delete',
  'Doc_Comments_Read',
  'Doc_Comments_Resolve',
  'Doc_Comments_Update',
] as const;

const COLLABORATOR_TRUE: Record<string, true> = {
  Workspace_Read: true,
  Workspace_Sync: true,
  Workspace_Blobs_List: true,
  Workspace_Blobs_Read: true,
  Workspace_Blobs_Write: true,
  Workspace_CreateDoc: true,
  Workspace_Organize_Read: true,
  Workspace_Properties_Read: true,
  Workspace_Settings_Read: true,
  Workspace_Users_Read: true,
};
export function workspacePermissions(role: string) {
  const perms: Record<string, boolean> = {};
  for (const key of WORKSPACE_KEYS) {
    if (key === 'Workspace_Copilot' || key === 'Workspace_Payment_Manage') {
      perms[key] = false;
      continue;
    }
    if (role === 'Owner') {
      perms[key] = true;
      continue;
    }
    if (role === 'Admin') {
      perms[key] =
        key !== 'Workspace_TransferOwner' && key !== 'Workspace_Delete';
      continue;
    }
    perms[key] = COLLABORATOR_TRUE[key] === true;
  }
  return perms;
}

export function docPermissions(allowed: boolean) {
  const perms: Record<string, boolean> = {};
  for (const key of DOC_KEYS) perms[key] = allowed;
  return perms;
}

export function requireUser(ctx: GqlContext): UserRow {
  if (!ctx.user) {
    throw gqlError(401, 'UNAUTHORIZED', 'Authentication required');
  }
  return ctx.user;
}

export async function getMember(
  state: AppState,
  workspaceId: string,
  userId: string
): Promise<MemberRow | undefined> {
  const [row] = await state.db.db
    .select()
    .from(members)
    .where(
      and(eq(members.workspaceId, workspaceId), eq(members.userId, userId))
    );
  return row;
}

export async function requireMember(
  ctx: GqlContext,
  workspaceId: string
): Promise<MemberRow> {
  const user = requireUser(ctx);
  const member = await getMember(ctx.state, workspaceId, user.id);
  if (!member || member.status !== 'Accepted') {
    throw gqlError(403, 'ACCESS_DENIED', 'Not a workspace member');
  }
  return member;
}

export async function requireRole(
  ctx: GqlContext,
  workspaceId: string,
  roles: string[]
) {
  const member = await requireMember(ctx, workspaceId);
  if (!roles.includes(member.role)) {
    throw gqlError(403, 'ACCESS_DENIED', 'Insufficient permission');
  }
  return member;
}

export async function getOwnerId(state: AppState, workspaceId: string) {
  const [row] = await state.db.db
    .select()
    .from(members)
    .where(
      and(eq(members.workspaceId, workspaceId), eq(members.role, 'Owner'))
    );
  return row?.userId ?? workspaceId;
}

export async function publicUser(state: AppState, userId: string) {
  const [row] = await state.db.db
    .select()
    .from(users)
    .where(eq(users.id, userId));
  if (!row) return null;
  return { id: row.id, name: row.name, avatarUrl: row.avatarUrl };
}

export async function workspaceExists(state: AppState, id: string) {
  const [row] = await state.db.db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, id));
  return row;
}
