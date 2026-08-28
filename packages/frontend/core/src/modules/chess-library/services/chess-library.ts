import { notify } from '@affine/component';
import { I18n } from '@affine/i18n';
import { Text } from '@blocksuite/affine/store';
import {
  captionFromHeaders,
  type Game,
  importPgnGames,
  parseLichessRef,
  serializePgn,
} from '@blocksuite/chess-core';
import { LiveData, Service } from '@toeverything/infra';
import type { Observable } from 'rxjs';

import type { WorkspaceDBService } from '../../db';
import type { DocsService } from '../../doc';
import type { WorkbenchService } from '../../workbench';
import {
  applyImportedGames,
  type ApplyImportHost,
  readPgnFile,
  titleFromPgnFileName,
} from '../import-apply';
import {
  type ChessGameRow,
  chessGameRowId,
  filterGameRows,
  rowFromPgn,
} from '../index-table';
import { fetchLichessPgn } from '../lichess';

export class ChessLibraryService extends Service {
  constructor(
    private readonly docsService: DocsService,
    private readonly dbService: WorkspaceDBService,
    private readonly workbenchService: WorkbenchService
  ) {
    super();
  }

  private get table() {
    return this.dbService.db.chessGames;
  }

  /** Reactive index so the Games tab refreshes on import and rebuild. */
  readonly games$ = LiveData.from<ChessGameRow[]>(
    this.dbService.db.chessGames.find$() as Observable<ChessGameRow[]>,
    []
  );

  async createMultiGameDoc(title: string, games: Game[]): Promise<string> {
    const record = this.docsService.createDoc();
    await this.docsService.changeDocTitle(record.id, title);
    const { doc, release } = this.docsService.open(record.id);
    try {
      await doc.waitForSyncReady();
      const note = doc.blockSuiteDoc.getBlocksByFlavour('affine:note')[0];
      if (!note) {
        throw new Error('missing_note');
      }
      for (const game of games) {
        const caption = captionFromHeaders(game.headers);
        doc.blockSuiteDoc.addBlock(
          'affine:paragraph' as never,
          { type: 'h6', text: new Text(caption) },
          note.id
        );
        const blockId = doc.blockSuiteDoc.addBlock(
          'affine:chess-game' as never,
          {
            pgn: serializePgn(game),
            currentPath: [],
            orientation: 'white',
            caption,
            analysisJson: '',
          },
          note.id
        );
        this.upsertGame(record.id, blockId, serializePgn(game));
      }
    } finally {
      release();
    }
    this.workbenchService.workbench.openDoc(record.id);
    return record.id;
  }

  createHost(insertOne: ApplyImportHost['insertOne']): ApplyImportHost {
    return {
      insertOne,
      createMultiGameDoc: (title, games) =>
        this.createMultiGameDoc(title, games),
    };
  }

  async applyGames(
    games: Game[],
    title: string,
    insertOne: ApplyImportHost['insertOne'] = () => false
  ) {
    return applyImportedGames(games, this.createHost(insertOne), title);
  }

  async importFiles(
    files: File[],
    insertOne: ApplyImportHost['insertOne'] = () => false
  ): Promise<{ inserted: number; skipped: number; docIds: string[] }> {
    let inserted = 0;
    let skipped = 0;
    const docIds: string[] = [];
    for (const file of files) {
      try {
        const text = await readPgnFile(file);
        const result = importPgnGames(text);
        skipped += result.skipped.length;
        if (result.games.length === 0) {
          notify.error({
            title: I18n.t('com.affine.chess.library.noGame'),
          });
          continue;
        }
        const applied = await this.applyGames(
          result.games,
          titleFromPgnFileName(file.name),
          insertOne
        );
        inserted += applied.inserted;
        if (applied.docId) docIds.push(applied.docId);
        notify({
          title: I18n.t('com.affine.chess.library.importResult', {
            ok: result.games.length,
            skipped: result.skipped.length,
          }),
        });
      } catch (error) {
        notify.error({
          title:
            error instanceof Error && error.message === 'pgn_too_large'
              ? I18n.t('com.affine.chess.library.tooLarge')
              : I18n.t('com.affine.chess.library.importFailed'),
        });
      }
    }
    return { inserted, skipped, docIds };
  }

  async importLichess(
    input: string,
    max = 50,
    insertOne: ApplyImportHost['insertOne'] = () => false
  ) {
    const ref = parseLichessRef(input);
    if (!ref) {
      notify.error({
        title: I18n.t('com.affine.chess.library.lichessInvalid'),
      });
      return;
    }
    try {
      const text = await fetchLichessPgn(ref, max);
      const result = importPgnGames(text);
      if (result.games.length === 0) {
        notify.error({ title: I18n.t('com.affine.chess.library.noGame') });
        return;
      }
      const title =
        ref.kind === 'user'
          ? `Lichess · ${ref.username}`
          : `Lichess · ${ref.id}`;
      await this.applyGames(result.games, title, insertOne);
      notify({
        title: I18n.t('com.affine.chess.library.importResult', {
          ok: result.games.length,
          skipped: result.skipped.length,
        }),
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : 'lichess_http';
      const key =
        code === 'lichess_not_found'
          ? 'com.affine.chess.library.lichessNotFound'
          : code === 'lichess_rate_limit'
            ? 'com.affine.chess.library.lichessRateLimit'
            : 'com.affine.chess.library.lichessHttp';
      notify.error({ title: I18n.t(key) });
    }
  }

  upsertGame(docId: string, blockId: string, pgn: string): void {
    const row = rowFromPgn(docId, blockId, pgn);
    // The ORM rejects a payload carrying the primary key on update.
    const { id, ...fields } = row;
    if (this.table.get(id)) {
      this.table.update(id, fields);
    } else {
      this.table.create(row);
    }
  }

  removeGame(docId: string, blockId: string): void {
    this.table.delete(chessGameRowId(docId, blockId));
  }

  list(filter?: { q?: string; result?: string }): ChessGameRow[] {
    return filterGameRows(this.table.find() as ChessGameRow[], filter);
  }

  async rebuild(): Promise<{ indexed: number }> {
    const seen = new Set<string>();
    const docs = this.docsService.list.docs$.value;
    for (const record of docs) {
      if (record.trash$.value) continue;
      const { doc, release } = this.docsService.open(record.id);
      try {
        await doc.waitForSyncReady();
        const blocks =
          doc.blockSuiteDoc.getBlocksByFlavour('affine:chess-game');
        for (const block of blocks) {
          const pgn = (block.model.props as { pgn?: string }).pgn ?? '';
          this.upsertGame(record.id, block.id, pgn);
          seen.add(chessGameRowId(record.id, block.id));
        }
      } finally {
        release();
      }
    }
    for (const row of this.table.find() as ChessGameRow[]) {
      if (!seen.has(row.id)) this.table.delete(row.id);
    }
    return { indexed: seen.size };
  }
}
