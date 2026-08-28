import type { CommentChangeAction, PublicUserType } from '@affine/graphql';
import type { DocMode } from '@blocksuite/affine/model';
import type {
  BaseSelection,
  DocSnapshot,
  Store,
} from '@blocksuite/affine/store';
import type { MovePath } from '@blocksuite/chess-core';

export type CommentId = string;

export type CommentAttachment = {
  id: string;
  url?: string; // attachment may not be uploaded yet
  filename?: string;
  mimeType?: string;
  size?: number; // in bytes
};

export type ChessCommentTarget = {
  blockId: string;
  path: MovePath;
  san: string;
  fenAfter?: string;
};
export interface BaseComment {
  id: CommentId;
  content?: DocCommentContent;
  createdAt: number;
  updatedAt: number;
  user: PublicUserType;
}

export interface DocComment extends BaseComment {
  resolved: boolean;
  mentions: string[];
  replies?: DocCommentReply[];
}

export type PendingComment = {
  id: CommentId;
  doc: Store;
  preview?: string;
  selections?: BaseSelection[];
  commentId?: CommentId;
  attachments: CommentAttachment[];
  chess?: ChessCommentTarget;
};

export interface DocCommentReply extends BaseComment {
  commentId: CommentId;
  mentions: string[];
}

export type DocCommentContent = {
  snapshot: DocSnapshot;
  attachments?: CommentAttachment[];
  mode?: DocMode;
  preview?: string;
  chess?: ChessCommentTarget;
};

export interface DocCommentListResult {
  comments: DocComment[];
  hasNextPage: boolean;
  startCursor: string;
  endCursor: string;
}

export interface DocCommentChange {
  action: CommentChangeAction;
  comment: DocComment;
  id: CommentId; // the id of the comment or reply
  commentId?: CommentId; // a change with comment id is a reply
}

export type DocCommentChangeListResult = {
  changes: DocCommentChange[];
  startCursor: string;
  endCursor: string;
  hasNextPage: boolean;
};
