import type { Framework } from '@toeverything/infra';

import { WorkspaceDBService } from '../db';
import { DocsService } from '../doc';
import { WorkbenchService } from '../workbench';
import { WorkspaceScope } from '../workspace';
import { ChessLibraryService } from './services/chess-library';

export function configureChessLibraryModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(ChessLibraryService, [
      DocsService,
      WorkspaceDBService,
      WorkbenchService,
    ]);
}

export type { ApplyImportHost } from './import-apply';
export { applyImportedGames, readPgnFile } from './import-apply';
export type { ChessGameRow } from './index-table';
export { filterGameRows, rowFromPgn } from './index-table';
export { fetchLichessPgn } from './lichess';
export { ChessLibraryService } from './services/chess-library';
