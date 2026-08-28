import type { Framework } from '@toeverything/infra';

import { WorkspaceServerService } from '../cloud';
import { DocsService } from '../doc';
import { WorkspaceScope, WorkspaceService } from '../workspace';
import { WorkspacePropertyService } from '../workspace-property';
import { ChessAssignmentService } from './services/chess-assignment';

export function configureChessAssignmentModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(ChessAssignmentService, [
      DocsService,
      WorkspaceService,
      WorkspacePropertyService,
      WorkspaceServerService,
    ]);
}

export {
  assertCanAssign,
  canGrade,
  canSubmit,
  CHESS_ASSIGNEE,
  CHESS_ASSIGNMENT_DOC,
  CHESS_KIND,
  CHESS_SCORE,
  CHESS_STATUS,
  isSubmissionLocked,
  validateScore,
} from './lifecycle';
export { ChessAssignmentService } from './services/chess-assignment';
