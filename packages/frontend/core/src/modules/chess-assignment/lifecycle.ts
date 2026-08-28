export const CHESS_KIND = 'chess-kind';
export const CHESS_STATUS = 'chess-status';
export const CHESS_DUE = 'chess-due';
export const CHESS_ASSIGNEE = 'chess-assignee';
export const CHESS_ASSIGNMENT_DOC = 'chess-assignment-doc';
export const CHESS_SCORE = 'chess-score';

export const ASSIGNMENT_PROPERTY_IDS = [
  CHESS_KIND,
  CHESS_STATUS,
  CHESS_DUE,
  CHESS_ASSIGNEE,
  CHESS_ASSIGNMENT_DOC,
  CHESS_SCORE,
] as const;

export type ChessKind = 'library' | 'assignment' | 'submission';
export type ChessStatus = 'draft' | 'assigned' | 'submitted' | 'graded';

export type AssignmentProps = {
  kind?: string | null;
  status?: string | null;
  assignee?: string | null;
  assignmentDocId?: string | null;
  score?: string | null;
};

export function canSubmit(
  props: AssignmentProps,
  currentUserId: string
): boolean {
  return (
    props.kind === 'submission' &&
    props.assignee === currentUserId &&
    props.status === 'assigned'
  );
}

export function canGrade(props: AssignmentProps): boolean {
  return (
    props.kind === 'submission' &&
    (props.status === 'submitted' || props.status === 'graded')
  );
}

export function validateScore(score: number | null): boolean {
  if (score === null) return true;
  return Number.isFinite(score) && score >= 0 && score <= 10;
}

export function assertCanAssign(
  flavour: string,
  accountId: string | undefined,
  memberIds: string[]
): void {
  if (flavour === 'local' || !accountId) {
    throw new Error('need_sync');
  }
  if (memberIds.length === 0) {
    throw new Error('no_assignee');
  }
}

export function isSubmissionLocked(
  props: AssignmentProps,
  currentUserId: string | undefined
): boolean {
  return (
    props.kind === 'submission' &&
    props.assignee === currentUserId &&
    (props.status === 'submitted' || props.status === 'graded')
  );
}

export function submissionTitle(
  sourceTitle: string,
  memberName: string
): string {
  return `${sourceTitle} — ${memberName}`;
}
