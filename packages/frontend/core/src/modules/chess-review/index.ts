import type { Framework } from '@toeverything/infra';

import { WorkspaceDBService } from '../db';
import { WorkspaceScope } from '../workspace';
import { ChessReviewService } from './services/chess-review';

export function configureChessReviewModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(ChessReviewService, [WorkspaceDBService]);
}

export type { ReviewCard } from './services/chess-review';
export { ChessReviewService } from './services/chess-review';
export type { ReviewGrade } from './sm2';
export { matchMove, review } from './sm2';
