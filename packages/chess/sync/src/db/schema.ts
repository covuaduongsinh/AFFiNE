import {
  bigint,
  bigserial,
  boolean,
  customType,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; driverData: Uint8Array }>({
  dataType() {
    return 'bytea';
  },
  toDriver(value) {
    return new Uint8Array(value);
  },
  fromDriver(value) {
    return Buffer.from(value);
  },
});

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  emailVerified: boolean('email_verified').notNull().default(true),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  refreshHash: text('refresh_hash'),
  csrf: text('csrf').notNull(),
  exchangeCodeHash: text('exchange_code_hash'),
  installationId: text('installation_id'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  refreshExpiresAt: timestamp('refresh_expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const workspaces = pgTable('workspaces', {
  id: text('id').primaryKey(),
  public: boolean('public').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const members = pgTable(
  'members',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    status: text('status').notNull().default('Accepted'),
    inviteId: text('invite_id').notNull().unique(),
  },
  table => [primaryKey({ columns: [table.workspaceId, table.userId] })]
);

export const invites = pgTable('invites', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role').notNull().default('Collaborator'),
  status: text('status').notNull().default('Pending'),
  invitedBy: text('invited_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const inviteLinks = pgTable('invite_links', {
  workspaceId: text('workspace_id')
    .primaryKey()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expireTime: timestamp('expire_time', { withTimezone: true }).notNull(),
});

export const docUpdates = pgTable('doc_updates', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  docId: text('doc_id').notNull(),
  update: bytea('update').notNull(),
  timestamp: bigint('timestamp', { mode: 'number' }).notNull(),
  editor: text('editor').notNull(),
});

export const docSnapshots = pgTable(
  'doc_snapshots',
  {
    workspaceId: text('workspace_id').notNull(),
    docId: text('doc_id').notNull(),
    snapshot: bytea('snapshot').notNull(),
    state: bytea('state').notNull(),
    timestamp: bigint('timestamp', { mode: 'number' }).notNull(),
  },
  table => [primaryKey({ columns: [table.workspaceId, table.docId] })]
);

export const blobs = pgTable(
  'blobs',
  {
    workspaceId: text('workspace_id').notNull(),
    key: text('key').notNull(),
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deleted: boolean('deleted').notNull().default(false),
  },
  table => [primaryKey({ columns: [table.workspaceId, table.key] })]
);

export const comments = pgTable('comments', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  docId: text('doc_id').notNull(),
  content: jsonb('content').notNull(),
  resolved: boolean('resolved').notNull().default(false),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const replies = pgTable('replies', {
  id: text('id').primaryKey(),
  commentId: text('comment_id')
    .notNull()
    .references(() => comments.id, { onDelete: 'cascade' }),
  content: jsonb('content').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const schema = {
  users,
  sessions,
  workspaces,
  members,
  invites,
  inviteLinks,
  docUpdates,
  docSnapshots,
  blobs,
  comments,
  replies,
};
