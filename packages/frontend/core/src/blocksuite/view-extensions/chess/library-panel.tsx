import { notify } from '@affine/component';
import { Chessboard } from '@affine/component/ui/chess';
import { I18n } from '@affine/i18n';
import {
  legalMoves,
  moveToSan,
  parseFen,
  squareToAlgebraic,
} from '@blocksuite/chess-core';
import {
  useLiveData,
  useService,
  useServiceOptional,
} from '@toeverything/infra';
import clsx from 'clsx';
import { useCallback, useMemo, useState } from 'react';

import {
  CHESS_KIND,
  CHESS_SCORE,
  CHESS_STATUS,
  ChessAssignmentService,
} from '../../../modules/chess-assignment';
import {
  type ChessGameRow,
  ChessLibraryService,
  filterGameRows,
} from '../../../modules/chess-library';
import { isPgnFile } from '../../../modules/chess-library/import-apply';
import {
  ChessReviewService,
  type ReviewCard,
  type ReviewGrade,
} from '../../../modules/chess-review';
import { DocService, DocsService } from '../../../modules/doc';
import { FeatureFlagService } from '../../../modules/feature-flag';
import { WorkspaceMembersService } from '../../../modules/permissions';
import { WorkbenchService } from '../../../modules/workbench';
import * as styles from './library-panel.css';

type Tab = 'games' | 'import' | 'assignments' | 'review';

const EMPTY_GAMES: ChessGameRow[] = [];
const EMPTY_CARDS: ReviewCard[] = [];

export const ChessLibraryPanel = () => {
  const flags = useService(FeatureFlagService);
  const enabled = useLiveData(flags.flags.enable_chess_pedagogy.$);
  const library = useServiceOptional(ChessLibraryService);
  const assignment = useServiceOptional(ChessAssignmentService);
  const review = useServiceOptional(ChessReviewService);
  const docs = useServiceOptional(DocsService);
  const doc = useServiceOptional(DocService);
  const workbench = useServiceOptional(WorkbenchService);
  const members = useServiceOptional(WorkspaceMembersService);
  const [tab, setTab] = useState<Tab>('games');
  const [query, setQuery] = useState('');
  const [gameUrl, setGameUrl] = useState('');
  const [username, setUsername] = useState('');
  const [max, setMax] = useState(50);
  const [score, setScore] = useState('8');

  const allGames = useLiveData(library?.games$) ?? EMPTY_GAMES;
  const rows = useMemo(
    () => filterGameRows(allGames, { q: query }),
    [allGames, query]
  );
  const pageMembers = useLiveData(members?.members.pageMembers$) ?? [];
  const allDocs = useLiveData(docs?.list.docs$) ?? [];
  const assignmentDocs = allDocs.filter(record => {
    const kind = record.customProperty$(CHESS_KIND).value;
    return kind === 'assignment' || kind === 'submission';
  });
  const allCards = useLiveData(review?.cards$) ?? EMPTY_CARDS;
  const due = useMemo(() => {
    const now = Date.now();
    return allCards
      .filter(card => card.due <= now)
      .sort((a, b) => a.due - b.due);
  }, [allCards]);
  const [activeCard] = due;
  const me = assignment?.currentUserId();
  const [played, setPlayed] = useState<string | null>(null);

  const openGame = useCallback(
    async (docId: string, blockId: string) => {
      workbench?.workbench.openDoc(docId);
      if (!docs) return;
      const { doc, release } = docs.open(docId);
      try {
        await doc.waitForSyncReady();
        const block = doc.blockSuiteDoc.getBlock(blockId);
        if (block) {
          doc.blockSuiteDoc.updateBlock(block.model, { currentPath: [] });
        }
      } finally {
        release();
      }
    },
    [docs, workbench]
  );

  if (!enabled || !library) return null;

  return (
    <div className={styles.root} data-testid="chess-library-panel">
      <div className={styles.title}>
        {I18n.t('com.affine.chess.library.title')}
      </div>
      <div className={styles.tabs}>
        {(['games', 'import', 'assignments', 'review'] as const).map(id => (
          <button
            key={id}
            className={clsx(styles.tab, tab === id && styles.tabActive)}
            data-testid={`chess-library-tab-${id}`}
            onClick={() => setTab(id)}
          >
            {I18n.t(`com.affine.chess.library.tab.${id}`)}
          </button>
        ))}
      </div>

      {tab === 'games' && (
        <>
          <div className={styles.row}>
            <input
              className={styles.input}
              placeholder={I18n.t('com.affine.chess.library.search')}
              value={query}
              onChange={event => setQuery(event.target.value)}
            />
            <button
              className={styles.button}
              data-testid="chess-library-rebuild"
              onClick={() => {
                library.rebuild().catch(() => {});
              }}
            >
              {I18n.t('com.affine.chess.library.rebuild')}
            </button>
          </div>
          <div className={styles.table}>
            {rows.length === 0 ? (
              <div className={styles.empty}>
                {I18n.t('com.affine.chess.library.empty')}
              </div>
            ) : (
              rows.map(row => (
                <div
                  key={row.id}
                  className={styles.tableRow}
                  onClick={() => void openGame(row.docId, row.blockId)}
                >
                  <span>{row.white || '?'}</span>
                  <span>{row.black || '?'}</span>
                  <span>{row.event}</span>
                  <span>{row.date}</span>
                  <span>{row.result}</span>
                  <span>{row.eco}</span>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {tab === 'import' && (
        <>
          <div className={styles.row}>
            <input
              type="file"
              accept=".pgn,.txt"
              multiple
              data-testid="chess-library-file"
              onChange={event => {
                const files = Array.from(event.target.files ?? []).filter(
                  isPgnFile
                );
                if (files.length) library.importFiles(files).catch(() => {});
              }}
            />
          </div>
          <div className={styles.row}>
            <input
              className={styles.input}
              placeholder={I18n.t('com.affine.chess.library.lichessGame')}
              value={gameUrl}
              onChange={event => setGameUrl(event.target.value)}
            />
            <button
              className={styles.button}
              onClick={() => void library.importLichess(gameUrl)}
            >
              {I18n.t('com.affine.chess.library.import')}
            </button>
          </div>
          <div className={styles.row}>
            <input
              className={styles.input}
              placeholder={I18n.t('com.affine.chess.library.lichessUser')}
              value={username}
              onChange={event => setUsername(event.target.value)}
            />
            <input
              className={styles.input}
              type="number"
              min={1}
              max={200}
              value={max}
              onChange={event => setMax(Number(event.target.value))}
            />
            <button
              className={styles.button}
              onClick={() => void library.importLichess(username, max)}
            >
              {I18n.t('com.affine.chess.library.import')}
            </button>
          </div>
        </>
      )}

      {tab === 'assignments' && assignment && (
        <>
          <div className={styles.row}>
            <button
              className={styles.button}
              data-testid="chess-assignment-new"
              onClick={() => {
                const docId = doc?.doc.id;
                if (!docId) return;
                assignment.createAssignmentFromCurrentDoc(docId);
              }}
            >
              {I18n.t('com.affine.chess.assignment.new')}
            </button>
            <button
              className={styles.button}
              data-testid="chess-assignment-assign"
              onClick={() => {
                members?.members.revalidate();
                const ids = pageMembers.map(member => member.id);
                const docId =
                  doc?.doc.id &&
                  docs?.list.doc$(doc.doc.id).value?.customProperty$(CHESS_KIND)
                    .value === 'assignment'
                    ? doc.doc.id
                    : docs?.list.docs$.value.find(
                        item =>
                          item.customProperty$(CHESS_KIND).value ===
                          'assignment'
                      )?.id;
                if (!docId) return;
                void assignment
                  .assignTo(
                    docId,
                    ids,
                    id => pageMembers.find(m => m.id === id)?.name ?? id
                  )
                  .catch(error => {
                    notify.error({
                      title:
                        error instanceof Error && error.message === 'need_sync'
                          ? I18n.t('com.affine.chess.assignment.needSync')
                          : I18n.t('com.affine.chess.assignment.failed'),
                    });
                  });
              }}
            >
              {I18n.t('com.affine.chess.assignment.assign')}
            </button>
          </div>
          <div className={styles.table}>
            {assignmentDocs.map(record => {
              const kind = record.customProperty$(CHESS_KIND).value;
              const status = record.customProperty$(CHESS_STATUS).value;
              return (
                <div
                  key={record.id}
                  className={styles.tableRow}
                  onClick={() => workbench?.workbench.openDoc(record.id)}
                >
                  <span>{record.title$.value}</span>
                  <span>{kind}</span>
                  <span>{status}</span>
                  <span>{record.customProperty$(CHESS_SCORE).value}</span>
                  {kind === 'submission' && status === 'assigned' && me && (
                    <button
                      className={styles.button}
                      onClick={event => {
                        event.stopPropagation();
                        try {
                          assignment.submit(record.id, me);
                        } catch {
                          notify.error({
                            title: I18n.t('com.affine.chess.assignment.failed'),
                          });
                        }
                      }}
                    >
                      {I18n.t('com.affine.chess.assignment.submit')}
                    </button>
                  )}
                  {kind === 'submission' &&
                    (status === 'submitted' || status === 'graded') && (
                      <span className={styles.row}>
                        <input
                          className={styles.input}
                          type="number"
                          min={0}
                          max={10}
                          value={score}
                          onClick={event => event.stopPropagation()}
                          onChange={event => setScore(event.target.value)}
                        />
                        <button
                          className={styles.button}
                          onClick={event => {
                            event.stopPropagation();
                            try {
                              assignment.grade(record.id, Number(score));
                            } catch {
                              notify.error({
                                title: I18n.t(
                                  'com.affine.chess.assignment.failed'
                                ),
                              });
                            }
                          }}
                        >
                          {I18n.t('com.affine.chess.assignment.grade')}
                        </button>
                      </span>
                    )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === 'review' && review && (
        <ReviewPane
          review={review}
          card={activeCard}
          dueCount={due.length}
          played={played}
          setPlayed={setPlayed}
        />
      )}
    </div>
  );
};

function ReviewPane({
  review,
  card,
  dueCount,
  played,
  setPlayed,
}: {
  review: ChessReviewService;
  card: ReviewCard | undefined;
  dueCount: number;
  played: string | null;
  setPlayed: (san: string | null) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  if (!card) {
    return (
      <div className={styles.empty} data-testid="chess-review-empty">
        {I18n.t('com.affine.chess.review.empty')}
      </div>
    );
  }
  const position = parseFen(card.fen);
  const moves = legalMoves(position);
  const destinations = selected
    ? moves
        .filter(move => squareToAlgebraic(move.from) === selected)
        .map(move => squareToAlgebraic(move.to))
    : [];
  const matched =
    played && card.solutionSan
      ? review.matchMove(card.fen, played, card.solutionSan)
      : null;
  const answer = (q: ReviewGrade) => {
    review.answer(card.id, q);
    setPlayed(null);
    setSelected(null);
  };
  return (
    <div>
      <div data-testid="chess-review-due">
        {I18n.t('com.affine.chess.review.due', {
          count: dueCount,
        })}
      </div>
      <div className={styles.empty}>{card.prompt}</div>
      <div className={styles.boardWrap}>
        <Chessboard
          fen={card.fen}
          interactive
          selected={selected ?? undefined}
          onSelect={setSelected}
          legalDestinations={destinations}
          onMove={(from, to) => {
            const move = moves.find(
              item =>
                squareToAlgebraic(item.from) === from &&
                squareToAlgebraic(item.to) === to
            );
            if (!move) return;
            setPlayed(moveToSan(position, move));
          }}
        />
      </div>
      {matched === true && (
        <div>{I18n.t('com.affine.chess.review.correct')}</div>
      )}
      {matched === false && (
        <div>
          {I18n.t('com.affine.chess.review.solution')}: {card.solutionSan}
        </div>
      )}
      <div className={styles.row}>
        {([1, 3, 4, 5] as const).map(grade => (
          <button
            key={grade}
            className={styles.button}
            data-testid={`chess-review-${grade}`}
            onClick={() => answer(grade)}
          >
            {I18n.t(
              grade === 1
                ? 'com.affine.chess.review.again'
                : grade === 3
                  ? 'com.affine.chess.review.hard'
                  : grade === 4
                    ? 'com.affine.chess.review.good'
                    : 'com.affine.chess.review.easy'
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
