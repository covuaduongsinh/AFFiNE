import { Service } from '@toeverything/infra';

import { AuthService, type WorkspaceServerService } from '../../cloud';
import type { DocsService } from '../../doc';
import type { WorkspaceService } from '../../workspace';
import type { WorkspacePropertyService } from '../../workspace-property';
import {
  assertCanAssign,
  canGrade,
  canSubmit,
  CHESS_ASSIGNEE,
  CHESS_ASSIGNMENT_DOC,
  CHESS_DUE,
  CHESS_KIND,
  CHESS_SCORE,
  CHESS_STATUS,
  submissionTitle,
  validateScore,
} from '../lifecycle';

const PROPERTY_DEFS: {
  id: string;
  type: 'text' | 'date' | 'number';
  name: string;
}[] = [
  { id: CHESS_KIND, type: 'text', name: 'Kind' },
  { id: CHESS_STATUS, type: 'text', name: 'Status' },
  { id: CHESS_DUE, type: 'date', name: 'Due' },
  { id: CHESS_ASSIGNEE, type: 'text', name: 'Assignee' },
  { id: CHESS_ASSIGNMENT_DOC, type: 'text', name: 'Assignment' },
  { id: CHESS_SCORE, type: 'number', name: 'Score' },
];

export class ChessAssignmentService extends Service {
  constructor(
    private readonly docsService: DocsService,
    private readonly workspaceService: WorkspaceService,
    private readonly workspacePropertyService: WorkspacePropertyService,
    private readonly workspaceServerService: WorkspaceServerService
  ) {
    super();
  }

  private get accountId(): string | undefined {
    return this.workspaceServerService.server?.scope.get(AuthService).session
      .account$.value?.id;
  }

  currentUserId(): string | undefined {
    return this.accountId;
  }

  ensureProperties(): void {
    for (const def of PROPERTY_DEFS) {
      const existing = this.workspacePropertyService.propertyInfo$(
        def.id
      ).value;
      if (!existing) {
        this.workspacePropertyService.createProperty({
          id: def.id,
          type: def.type,
          name: def.name,
        });
        continue;
      }
      if (existing.isDeleted) {
        this.workspacePropertyService.updatePropertyInfo(def.id, {
          isDeleted: false,
        });
      }
    }
  }

  private set(docId: string, key: string, value: string): void {
    this.docsService.list.doc$(docId).value?.setCustomProperty(key, value);
  }

  private get(docId: string, key: string): string | undefined | null {
    return this.docsService.list.doc$(docId).value?.customProperty$(key).value;
  }

  /** Named `docProps` because `Component` already owns an instance `props`. */
  docProps(docId: string) {
    return {
      kind: this.get(docId, CHESS_KIND),
      status: this.get(docId, CHESS_STATUS),
      assignee: this.get(docId, CHESS_ASSIGNEE),
      assignmentDocId: this.get(docId, CHESS_ASSIGNMENT_DOC),
      score: this.get(docId, CHESS_SCORE),
    };
  }

  createAssignmentFromCurrentDoc(docId: string): string {
    this.ensureProperties();
    this.set(docId, CHESS_KIND, 'assignment');
    this.set(docId, CHESS_STATUS, 'draft');
    return docId;
  }

  async assignTo(
    assignmentDocId: string,
    memberIds: string[],
    memberName: (id: string) => string
  ): Promise<string[]> {
    assertCanAssign(
      this.workspaceService.workspace.meta.flavour,
      this.accountId,
      memberIds
    );
    this.ensureProperties();
    const source = this.docsService.list.doc$(assignmentDocId).value;
    const sourceTitle = source?.title$.value ?? 'Assignment';
    const created: string[] = [];
    for (const memberId of memberIds) {
      const copyId = await this.docsService.duplicate(assignmentDocId);
      this.set(copyId, CHESS_KIND, 'submission');
      this.set(copyId, CHESS_STATUS, 'assigned');
      this.set(copyId, CHESS_ASSIGNEE, memberId);
      this.set(copyId, CHESS_ASSIGNMENT_DOC, assignmentDocId);
      this.set(copyId, CHESS_SCORE, '');
      const due = this.get(assignmentDocId, CHESS_DUE);
      if (due) this.set(copyId, CHESS_DUE, due);
      await this.docsService.changeDocTitle(
        copyId,
        submissionTitle(sourceTitle, memberName(memberId))
      );
      created.push(copyId);
    }
    this.set(assignmentDocId, CHESS_STATUS, 'assigned');
    return created;
  }

  submit(docId: string, currentUserId: string): void {
    if (!canSubmit(this.docProps(docId), currentUserId)) {
      throw new Error('cannot_submit');
    }
    this.set(docId, CHESS_STATUS, 'submitted');
  }

  grade(docId: string, score: number | null): void {
    if (!canGrade(this.docProps(docId))) {
      throw new Error('cannot_grade');
    }
    if (!validateScore(score)) {
      throw new Error('invalid_score');
    }
    this.set(docId, CHESS_SCORE, score === null ? '' : String(score));
    this.set(docId, CHESS_STATUS, 'graded');
  }
}
