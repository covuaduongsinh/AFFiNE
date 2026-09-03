import { describe, expect, it } from 'vitest';

import {
  assertCanAssign,
  canGrade,
  canSubmit,
  isSubmissionLocked,
  validateScore,
} from '../lifecycle';

const assigned = {
  kind: 'submission',
  status: 'assigned',
  assignee: 'student',
};

describe('assignment lifecycle', () => {
  it('draft → assign → submit → grade', () => {
    expect(canSubmit({ kind: 'assignment', status: 'draft' }, 'coach')).toBe(
      false
    );
    expect(canSubmit(assigned, 'student')).toBe(true);
    expect(canSubmit(assigned, 'other')).toBe(false);
    expect(
      canGrade({ kind: 'submission', status: 'submitted', assignee: 'student' })
    ).toBe(true);
    expect(
      canGrade({ kind: 'submission', status: 'graded', assignee: 'student' })
    ).toBe(true);
  });

  it('rejects submit by the wrong user', () => {
    expect(canSubmit(assigned, 'coach')).toBe(false);
  });

  it('rejects score 11', () => {
    expect(validateScore(11)).toBe(false);
    expect(validateScore(8)).toBe(true);
    expect(validateScore(null)).toBe(true);
    expect(validateScore(-1)).toBe(false);
  });

  it('locks the assignee after submit', () => {
    expect(
      isSubmissionLocked(
        { kind: 'submission', status: 'submitted', assignee: 'student' },
        'student'
      )
    ).toBe(true);
    expect(
      isSubmissionLocked(
        { kind: 'submission', status: 'submitted', assignee: 'student' },
        'coach'
      )
    ).toBe(false);
  });
});

describe('assignTo preconditions', () => {
  it('local workspaces throw need_sync', () => {
    expect(() => assertCanAssign('local', 'u1', ['m1'])).toThrow('need_sync');
    expect(() => assertCanAssign('affine-cloud', undefined, ['m1'])).toThrow(
      'need_sync'
    );
    expect(() => assertCanAssign('affine-cloud', 'u1', [])).toThrow(
      'no_assignee'
    );
  });
});
