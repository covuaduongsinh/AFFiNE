import { notify } from '@affine/component';
import { Chessboard } from '@affine/component/ui/chess';
import {
  ChessAssignmentService,
  isSubmissionLocked,
} from '@affine/core/modules/chess-assignment';
import { ChessCoachService } from '@affine/core/modules/chess-coach';
import { ChessLibraryService } from '@affine/core/modules/chess-library';
import { ChessReviewService } from '@affine/core/modules/chess-review';
import { ServerService } from '@affine/core/modules/cloud';
import { DocCommentManagerService } from '@affine/core/modules/comment/services/doc-comment-manager';
import type { DocComment } from '@affine/core/modules/comment/types';
import { DocService } from '@affine/core/modules/doc';
import { useSignalValue } from '@affine/core/modules/doc-info/utils';
import { ViewService, WorkbenchService } from '@affine/core/modules/workbench';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { ServerFeature } from '@affine/graphql';
import { I18n } from '@affine/i18n';
import type { ChessGameBlockModel } from '@blocksuite/chess-block-game';
import {
  algebraicToSquare,
  childrenAt,
  deleteFrom,
  findMove,
  findPieces,
  formatMovePreview,
  type Game,
  inCheck,
  KING,
  legalMoves,
  type MoveNode,
  type MovePath,
  nodeAt,
  parseFen,
  parsePgn,
  playMove,
  positionAt,
  promoteVariation,
  serializePgn,
  setComment,
  setNags,
  squareToAlgebraic,
  toFen,
  WHITE,
} from '@blocksuite/chess-core';
import {
  applyScanToGame,
  type MoveLabel,
  pvUciToSan,
} from '@blocksuite/chess-engine';
import { useLiveData, useServiceOptional } from '@toeverything/infra';
import clsx from 'clsx';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { formatScore, labelForPath, splitMoveComment } from './analysis-ui';
import * as styles from './chess-game-view.css';
import { EvalBar } from './eval-bar';
import { guardFieldPointer, nestedFieldEvents } from './field-guard';
import { useChessAnalysis } from './use-chess-analysis';

const MemoChessboard = memo(Chessboard);

const EMPTY_COMMENTS: DocComment[] = [];

export interface ChessGameViewProps {
  model: ChessGameBlockModel;
}

/** NAG numbers the annotation symbols map to. */
const NAG_SYMBOLS: Record<number, string> = {
  1: '!',
  2: '?',
  3: '!!',
  4: '??',
  5: '!?',
  6: '?!',
  10: '=',
  13: '∞',
  14: '⩲',
  15: '⩱',
  16: '±',
  17: '∓',
  18: '+−',
  19: '−+',
};

const samePath = (a: MovePath, b: MovePath) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

/** Move number and side to move, read from the position the move was played in. */
function numbering(node: MoveNode) {
  const position = parseFen(node.fenBefore);
  return {
    isWhite: position.turn === WHITE,
    number: position.fullmoves,
  };
}

const MOVE_LABEL_CLASS: Partial<Record<MoveLabel, string>> = {
  inaccuracy: styles.moveInaccuracy,
  mistake: styles.moveMistake,
  blunder: styles.moveBlunder,
};

function moveLabelTitle(label?: MoveLabel): string | undefined {
  if (label === 'inaccuracy') {
    return I18n.t('com.affine.chess.engine.inaccuracy');
  }
  if (label === 'mistake') return I18n.t('com.affine.chess.engine.mistake');
  if (label === 'blunder') return I18n.t('com.affine.chess.engine.blunder');
  return undefined;
}

const SCAN_DEPTHS = [10, 12, 14, 16] as const;

interface MoveTokenProps {
  node: MoveNode;
  path: MovePath;
  currentPath: MovePath;
  onSelect: (path: MovePath) => void;
  /** Black must restate the number after a comment or a variation. */
  forceNumber: boolean;
  label?: MoveLabel;
  commented?: boolean;
}

const MoveToken = ({
  node,
  path,
  currentPath,
  onSelect,
  forceNumber,
  label,
  commented,
}: MoveTokenProps) => {
  const { isWhite, number } = numbering(node);

  return (
    <>
      {(isWhite || forceNumber) && (
        <span className={styles.moveNumber}>
          {number}
          {isWhite ? '.' : '...'}
        </span>
      )}
      <span
        role="button"
        tabIndex={0}
        className={clsx(
          styles.move,
          samePath(path, currentPath) && styles.currentMove,
          commented && styles.commentedMove,
          label && MOVE_LABEL_CLASS[label]
        )}
        title={moveLabelTitle(label)}
        onClick={() => onSelect(path)}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') onSelect(path);
        }}
      >
        {node.san}
        {node.nags.map(nag => NAG_SYMBOLS[nag] ?? `$${nag}`).join('')}
      </span>{' '}
      {node.comment !== undefined && (
        <span className={styles.comment}>
          {splitMoveComment(node.comment).map((part, index) =>
            part.kind === 'eval' ? (
              <span key={index} className={styles.evalGlyph}>
                {part.value}
              </span>
            ) : (
              part.value
            )
          )}
        </span>
      )}
    </>
  );
};

interface MoveListProps {
  /** A sibling array: `nodes[i]` sits at `[...basePath, i]`. */
  nodes: MoveNode[];
  basePath: MovePath;
  currentPath: MovePath;
  onSelect: (path: MovePath) => void;
  forceNumber?: boolean;
  labels?: ReadonlyMap<string, MoveLabel>;
  commentedPaths?: ReadonlySet<string>;
}

/**
 * Renders a ply and everything below it.
 *
 * Variations are siblings in the tree, so `nodes[0]` continues the line and the
 * rest render as indented blocks under the move they replace — which is how a
 * printed annotation reads, and keeps deep nesting legible.
 */
const MoveList = ({
  nodes,
  basePath,
  currentPath,
  onSelect,
  forceNumber = false,
  labels,
  commentedPaths,
}: MoveListProps) => {
  if (nodes.length === 0) return null;

  const [main, ...alternatives] = nodes;
  const mainPath = [...basePath, 0];

  return (
    <>
      <MoveToken
        node={main}
        path={mainPath}
        currentPath={currentPath}
        onSelect={onSelect}
        forceNumber={forceNumber}
        label={labels ? labelForPath(labels, mainPath) : undefined}
        commented={commentedPaths?.has(mainPath.join('.'))}
      />
      {alternatives.map((alternative, index) => {
        // `index` counts from the second sibling, so the real index is +1.
        const alternativePath = [...basePath, index + 1];
        return (
          <span key={alternative.id} className={styles.variation}>
            <MoveToken
              node={alternative}
              path={alternativePath}
              currentPath={currentPath}
              onSelect={onSelect}
              forceNumber
              label={labels ? labelForPath(labels, alternativePath) : undefined}
              commented={commentedPaths?.has(alternativePath.join('.'))}
            />
            <MoveList
              nodes={alternative.children}
              basePath={alternativePath}
              currentPath={currentPath}
              onSelect={onSelect}
              forceNumber={alternative.comment !== undefined}
              labels={labels}
              commentedPaths={commentedPaths}
            />
          </span>
        );
      })}
      <MoveList
        nodes={main.children}
        basePath={mainPath}
        currentPath={currentPath}
        onSelect={onSelect}
        forceNumber={alternatives.length > 0 || main.comment !== undefined}
        labels={labels}
        commentedPaths={commentedPaths}
      />
    </>
  );
};

interface PgnEditorProps {
  value: string;
  error: string | null;
  readonly: boolean;
  /** Hidden when the stored PGN is broken: there is nothing safe to go back to. */
  canCancel: boolean;
  onChange: (text: string) => void;
  onSave: () => void;
  onCancel: () => void;
  /**
   * Whether to put the caret in the box on open.
   *
   * True when the user asked for the editor, false when a broken PGN forced it
   * open — a document that grabs focus on load because one game has a typo in
   * it would be worse than the problem.
   */
  autoFocus: boolean;
}

const PgnEditor = ({
  value,
  error,
  readonly,
  canCancel,
  onChange,
  onSave,
  onCancel,
  autoFocus,
}: PgnEditorProps) => {
  const textarea = useRef<HTMLTextAreaElement | null>(null);

  // Pressing the edit button means wanting to type, so do not make the user
  // click again — and this way the caret never depends on a click at all.
  useEffect(() => {
    if (autoFocus) textarea.current?.focus();
  }, [autoFocus]);

  return (
    <div className={styles.editor}>
      <textarea
        ref={element => {
          textarea.current = element;
          guardFieldPointer(element);
        }}
        className={styles.editorTextarea}
        value={value}
        readOnly={readonly}
        spellCheck={false}
        aria-label="PGN source"
        data-testid="chess-pgn-editor"
        placeholder={'[Event "..."]\n\n1. e4 e5 2. Nf3 *'}
        onChange={event => onChange(event.target.value)}
        {...nestedFieldEvents}
      />
      <div className={styles.editorFooter}>
        <span className={clsx(styles.editorStatus, error && styles.error)}>
          {error ?? 'Paste a game, or edit the moves and annotations directly.'}
        </span>
        <button
          className={styles.controlButton}
          disabled={readonly}
          data-testid="chess-pgn-paste-btn"
          title="Đọc PGN từ clipboard — không cần bàn phím"
          onClick={() => {
            // Reads the clipboard on click: no keyboard event is involved, so
            // this works even where keystrokes are being killed outside the
            // app. Replaces the whole draft — a copied game is a whole game.
            navigator.clipboard
              .readText()
              .then(text => {
                if (text.trim()) onChange(text);
              })
              .catch(() => {});
          }}
        >
          Dán PGN
        </button>
        {canCancel && (
          <button className={styles.controlButton} onClick={onCancel}>
            Cancel
          </button>
        )}
        <button
          className={styles.primaryButton}
          onClick={onSave}
          disabled={readonly || error !== null}
          data-testid="chess-pgn-save"
        >
          Save
        </button>
      </div>
    </div>
  );
};

/** Symbols offered for annotating the selected move, with their NAG numbers. */
const NAG_CHOICES: { nag: number; symbol: string; label: string }[] = [
  { nag: 1, symbol: '!', label: 'Good move' },
  { nag: 2, symbol: '?', label: 'Mistake' },
  { nag: 3, symbol: '!!', label: 'Brilliant' },
  { nag: 4, symbol: '??', label: 'Blunder' },
  { nag: 5, symbol: '!?', label: 'Interesting' },
  { nag: 6, symbol: '?!', label: 'Dubious' },
];

/**
 * Replays and annotates a game.
 *
 * The stored PGN is the source of truth; analysisJson is a local overlay.
 */
export const ChessGameView = ({ model }: ChessGameViewProps) => {
  const workbenchService = useServiceOptional(WorkbenchService);
  const viewService = useServiceOptional(ViewService);
  const coach = useServiceOptional(ChessCoachService);
  const library = useServiceOptional(ChessLibraryService);
  const assignment = useServiceOptional(ChessAssignmentService);
  const review = useServiceOptional(ChessReviewService);
  const commentManager = useServiceOptional(DocCommentManagerService);
  const docService = useServiceOptional(DocService);
  const workspace = useServiceOptional(WorkspaceService);
  const serverService = useServiceOptional(ServerService);
  const assignmentProps =
    assignment && docService ? assignment.docProps(docService.doc.id) : {};
  const me = assignment?.currentUserId();
  const locked = isSubmissionLocked(assignmentProps, me);
  const pgn = useSignalValue(model.props.pgn$);
  const currentPath = useSignalValue(model.props.currentPath$);
  const orientation = useSignalValue(model.props.orientation$);
  const analysisJson = useSignalValue(model.props.analysisJson$) ?? '';
  const readonly = model.store.readonly || locked;
  const persistScan = useCallback(
    (json: string) => {
      if (readonly) return;
      model.store.captureSync();
      model.store.updateBlock(model, { analysisJson: json });
    },
    [model, readonly]
  );
  const analysis = useChessAnalysis(model.id, {
    storedJson: analysisJson,
    persistScan,
  });
  const {
    activate,
    available,
    engineArrow,
    isActive,
    labels,
    lastInfo,
    live,
    progress,
    requestAnalyze,
    runScan,
    scan,
    scanError,
    scanning,
    startLive,
    status,
    stop,
  } = analysis;
  const [scanDepth, setScanDepth] = useState(14);

  const [selected, setSelected] = useState<string | null>(null);
  /** `null` when the PGN editor is closed; the draft text when it is open. */
  const [draft, setDraft] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const game = useMemo<Game | null>(() => {
    try {
      return parsePgn(pgn);
    } catch {
      return null;
    }
  }, [pgn]);

  /**
   * Apply an edit to the move tree and write the result back.
   *
   * Every edit re-parses the stored PGN rather than reusing the memoised game,
   * so a mutation can never be applied twice to the same in-memory tree. The
   * callback may return the path to select afterwards.
   *
   * `captureSync` opens a fresh undo step first. Without it an edit merges into
   * whatever the document did last — delete a variation right after inserting
   * the block and a single undo took the whole block away instead of putting
   * the moves back.
   */
  const mutate = useCallback(
    (edit: (game: Game) => MovePath | void) => {
      if (readonly) return;
      let fresh: Game;
      try {
        fresh = parsePgn(pgn);
      } catch {
        return;
      }
      const nextPath = edit(fresh);
      model.store.captureSync();
      model.store.updateBlock(model, {
        pgn: serializePgn(fresh),
        ...(nextPath === undefined ? {} : { currentPath: nextPath }),
      });
    },
    [model, pgn, readonly]
  );

  useEffect(() => {
    if (!coach) return;
    return coach.session.attachGame(model.id, {
      get: () => ({
        pgn: model.props.pgn,
        currentPath: model.props.currentPath ?? [],
        analysisJson: model.props.analysisJson ?? '',
      }),
      apply: next => {
        if (model.store.readonly) return;
        model.store.captureSync();
        model.store.updateBlock(model, {
          pgn: next.pgn,
          currentPath: next.currentPath,
          analysisJson: next.analysisJson ?? '',
        });
      },
    });
  }, [coach, model]);

  useEffect(() => {
    if (!library) return;
    library.upsertGame(model.store.id, model.id, pgn);
  }, [library, model.store.id, model.id, pgn]);

  const commentRef = commentManager?.get(model.store.id);
  const commentList = useLiveData(commentRef?.obj.comments$) ?? EMPTY_COMMENTS;
  useEffect(() => () => commentRef?.release(), [commentRef]);

  const commentedPaths = useMemo(() => {
    const paths = new Set<string>();
    for (const comment of commentList) {
      const target = comment.content?.chess;
      if (!comment.resolved && target?.blockId === model.id && target.path) {
        paths.add(target.path.join('.'));
      }
    }
    return paths;
  }, [commentList, model.id]);

  useEffect(() => {
    if (!commentRef) return;
    return commentRef.obj.onCommentHighlighted(id => {
      if (!id) return;
      const found = commentRef.obj.comments$.value.find(item => item.id === id);
      const target = found?.content?.chess;
      if (!target || target.blockId !== model.id) return;
      model.store.updateBlock(model, { currentPath: target.path });
    });
  }, [commentRef, model]);

  const openCoach = useCallback(() => {
    activate();
    workbenchService?.workbench.openSidebar();
    viewService?.view.activeSidebarTab('chess-coach');
  }, [activate, viewService, workbenchService]);

  const applyToPgn = useCallback(() => {
    if (!scan) return;
    mutate(fresh => {
      applyScanToGame(fresh, scan);
    });
  }, [mutate, scan]);

  const path = useMemo(() => currentPath ?? [], [currentPath]);

  const position = useMemo(
    () => (game ? positionAt(game, path) : null),
    [game, path]
  );

  const moves = useMemo(
    () => (position ? legalMoves(position) : []),
    [position]
  );

  const destinations = useMemo(() => {
    if (!selected) return [];
    return moves
      .filter(item => squareToAlgebraic(item.from) === selected)
      .map(item => squareToAlgebraic(item.to));
  }, [moves, selected]);

  const checkSquare = useMemo(() => {
    if (!position || !inCheck(position)) return undefined;
    const [king] = findPieces(position, position.turn, KING);
    return king === undefined ? undefined : squareToAlgebraic(king);
  }, [position]);

  const lastMove = useMemo(() => {
    if (!game || path.length === 0) return undefined;
    const node = nodeAt(game, path);
    return node
      ? {
          from: squareToAlgebraic(node.move.from),
          to: squareToAlgebraic(node.move.to),
        }
      : undefined;
  }, [game, path]);

  const goTo = useCallback(
    (next: MovePath) => {
      model.store.updateBlock(model, { currentPath: next });
      setSelected(null);
    },
    [model]
  );

  const stepForward = useCallback(
    (branch = 0) => {
      if (!game) return;
      const next = childrenAt(game, path);
      if (next[branch]) goTo([...path, branch]);
    },
    [game, goTo, path]
  );

  const stepBack = useCallback(() => {
    if (path.length > 0) goTo(path.slice(0, -1));
  }, [goTo, path]);

  const goToEnd = useCallback(() => {
    if (!game) return;
    const next: MovePath = [...path];
    let list = childrenAt(game, next);
    while (list.length > 0) {
      next.push(0);
      list = list[0].children;
    }
    goTo(next);
  }, [game, goTo, path]);

  const flip = useCallback(() => {
    model.store.captureSync();
    model.store.updateBlock(model, {
      orientation: orientation === 'white' ? 'black' : 'white',
    });
  }, [model, orientation]);

  const handleMove = useCallback(
    (from: string, to: string) => {
      if (!position || readonly) return;
      const move = findMove(
        position,
        algebraicToSquare(from),
        algebraicToSquare(to)
      );
      if (!move) return;

      mutate(fresh => playMove(fresh, path, move).path);
      setSelected(null);
    },
    [mutate, path, position, readonly]
  );

  const openEditor = useCallback(() => setDraft(pgn), [pgn]);

  /**
   * A PGN that cannot be parsed forces the editor open, so a typo is something
   * you repair rather than something that bricks the block.
   */
  const editing = draft !== null || game === null;
  const draftValue = draft ?? pgn;

  const saveDraft = useCallback(() => {
    if (readonly) return;
    try {
      parsePgn(draftValue);
    } catch {
      return;
    }
    // The old path almost certainly does not address anything in the new game.
    model.store.captureSync();
    model.store.updateBlock(model, { pgn: draftValue, currentPath: [] });
    setDraft(null);
  }, [draftValue, model, readonly]);

  /** Parse error for the text in the editor, or null when it is valid. */
  const draftError = useMemo(() => {
    try {
      parsePgn(draftValue);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Unreadable PGN';
    }
  }, [draftValue]);

  const currentNode = useMemo(
    () => (game && path.length > 0 ? nodeAt(game, path) : undefined),
    [game, path]
  );

  const toggleNag = useCallback(
    (nag: number) => {
      const existing = currentNode?.nags ?? [];
      const next = existing.includes(nag)
        ? existing.filter(item => item !== nag)
        : [...existing, nag];
      mutate(fresh => {
        setNags(fresh, path, next);
      });
    },
    [currentNode, mutate, path]
  );

  const applyComment = useCallback(
    (text: string) => {
      if (text === (currentNode?.comment ?? '')) return;
      mutate(fresh => {
        setComment(fresh, path, text);
      });
    },
    [currentNode, mutate, path]
  );

  const promote = useCallback(() => {
    mutate(fresh => promoteVariation(fresh, path));
  }, [mutate, path]);

  const deleteHere = useCallback(() => {
    mutate(fresh => deleteFrom(fresh, path));
  }, [mutate, path]);

  /** Arrow keys walk the line; up and down switch between variations. */
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const onKeyDown = (event: KeyboardEvent) => {
      // Typing in the PGN box or a comment field must move the caret, not the
      // game — this handler otherwise swallows every arrow key in the block.
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT' || target?.isContentEditable) {
        return;
      }

      switch (event.key) {
        case 'ArrowRight':
          stepForward();
          break;
        case 'ArrowLeft':
          stepBack();
          break;
        case 'ArrowDown':
          stepForward(1);
          break;
        case 'ArrowUp':
          stepForward(0);
          break;
        case 'f':
          flip();
          break;
        default:
          return;
      }
      event.preventDefault();
    };

    element.addEventListener('keydown', onKeyDown);
    return () => element.removeEventListener('keydown', onKeyDown);
  }, [flip, stepBack, stepForward]);

  const fenNow = position ? toFen(position) : null;
  const engineArrows = useMemo(
    () => (engineArrow ? [engineArrow] : undefined),
    [engineArrow]
  );
  useEffect(() => {
    if (!live || !isActive || !fenNow) return;
    requestAnalyze(fenNow);
  }, [isActive, live, requestAnalyze, fenNow]);

  if (!game || !position) {
    return (
      <div className={styles.container}>
        <PgnEditor
          value={draftValue}
          error={draftError ?? 'This PGN could not be read.'}
          readonly={readonly}
          canCancel={false}
          onChange={setDraft}
          onSave={saveDraft}
          onCancel={() => setDraft(null)}
          // Forced open by a broken PGN, not asked for: leave focus alone.
          autoFocus={false}
        />
      </div>
    );
  }

  const { headers } = game;
  const atStart = path.length === 0;
  const atEnd = childrenAt(game, path).length === 0;

  return (
    <div
      ref={containerRef}
      className={styles.container}
      tabIndex={0}
      onPointerDown={activate}
      onFocusCapture={activate}
    >
      <div className={styles.boardColumn}>
        <div className={styles.boardWithEval}>
          {available && (lastInfo || live) && (
            <EvalBar
              score={lastInfo?.score ?? { type: 'cp', value: 0 }}
              turn={position.turn}
              orientation={orientation}
            />
          )}
          <MemoChessboard
            fen={fenNow ?? toFen(position)}
            orientation={orientation}
            interactive={!readonly}
            selected={selected}
            onSelect={setSelected}
            legalDestinations={destinations}
            check={checkSquare}
            lastMove={lastMove}
            arrows={engineArrows}
            onMove={handleMove}
          />
        </div>
        <div className={styles.controls}>
          <button
            className={styles.controlButton}
            onClick={() => goTo([])}
            disabled={atStart}
            title="Start"
          >
            ⏮
          </button>
          <button
            className={styles.controlButton}
            onClick={stepBack}
            disabled={atStart}
            title="Previous move"
          >
            ◀
          </button>
          <button
            className={styles.controlButton}
            onClick={() => stepForward()}
            disabled={atEnd}
            title="Next move"
          >
            ▶
          </button>
          <button
            className={styles.controlButton}
            onClick={goToEnd}
            disabled={atEnd}
            title="End"
          >
            ⏭
          </button>
          <button className={styles.controlButton} onClick={flip} title="Flip">
            ⇅
          </button>
          {!readonly && (
            <button
              className={clsx(
                styles.controlButton,
                editing && styles.currentMove
              )}
              onClick={() => (editing ? setDraft(null) : openEditor())}
              title={editing ? 'Close the PGN editor' : 'Edit PGN'}
              data-testid="chess-edit-toggle"
            >
              ✎
            </button>
          )}
        </div>
      </div>

      <div className={styles.sideColumn}>
        <div className={styles.header}>
          <span className={styles.players}>
            {headers.White ?? 'White'} – {headers.Black ?? 'Black'}
          </span>
          <span>{game.result}</span>
          {headers.Event !== undefined && <span>· {headers.Event}</span>}
          {headers.ECO !== undefined && <span>· {headers.ECO}</span>}
        </div>
        <div className={styles.moveList}>
          {game.moves.length === 0 ? (
            <span className={styles.empty}>
              No moves yet. Paste a PGN here, press ✎ to write one, or just play
              a move on the board.
            </span>
          ) : (
            <MoveList
              nodes={game.moves}
              basePath={[]}
              currentPath={path}
              onSelect={goTo}
              labels={labels}
              commentedPaths={commentedPaths}
            />
          )}
        </div>

        <div className={styles.analysis}>
          <div className={styles.analysisRow}>
            <button
              className={clsx(
                styles.controlButton,
                live && isActive && styles.currentMove
              )}
              data-testid="chess-analyze"
              disabled={!available}
              title={
                available
                  ? I18n.t('com.affine.chess.engine.analyze')
                  : I18n.t('com.affine.chess.engine.unavailable')
              }
              onClick={startLive}
            >
              {I18n.t('com.affine.chess.engine.analyze')}
            </button>
            <button
              className={clsx(
                styles.controlButton,
                (scanning || status === 'scanning') && styles.currentMove
              )}
              data-testid="chess-scan"
              disabled={!available || scanning}
              title={I18n.t('com.affine.chess.engine.scan')}
              onClick={() => runScan(game, scanDepth)}
            >
              {scanning
                ? I18n.t('com.affine.chess.engine.scanning')
                : I18n.t('com.affine.chess.engine.scan')}
            </button>
            <button
              className={styles.controlButton}
              data-testid="chess-stop"
              disabled={
                !scanning &&
                (!isActive || (status !== 'thinking' && status !== 'scanning'))
              }
              onClick={stop}
            >
              {I18n.t('com.affine.chess.engine.stop')}
            </button>
            <button
              className={styles.controlButton}
              data-testid="chess-apply-pgn"
              disabled={readonly || !scan}
              title={I18n.t('com.affine.chess.engine.apply')}
              onClick={applyToPgn}
            >
              {I18n.t('com.affine.chess.engine.apply')}
            </button>
            <button
              className={styles.controlButton}
              data-testid="chess-ask-coach"
              title={I18n.t('com.affine.chess.coach.ask')}
              onClick={openCoach}
            >
              {I18n.t('com.affine.chess.coach.ask')}
            </button>
            <button
              className={styles.controlButton}
              data-testid="chess-add-review"
              title={I18n.t('com.affine.chess.review.add')}
              onClick={() => {
                if (!review || !position) return;
                const blunder = scan?.nodes.find(
                  node => node.label === 'blunder' && samePath(node.path, path)
                );
                if (blunder?.bestPvSan[0] && game) {
                  const parent = path.slice(0, -1);
                  review.addFromPuzzle(
                    {
                      fen: toFen(positionAt(game, parent)),
                      solutionSan: blunder.bestPvSan[0],
                    },
                    { docId: model.store.id, blockId: model.id }
                  );
                } else {
                  review.add({
                    fen: toFen(position),
                    sourceDocId: model.store.id,
                    sourceBlockId: model.id,
                  });
                }
              }}
            >
              {I18n.t('com.affine.chess.review.add')}
            </button>
            <select
              className={styles.controlButton}
              aria-label={I18n.t('com.affine.chess.engine.depth')}
              value={scanDepth}
              onChange={event => setScanDepth(Number(event.target.value))}
            >
              {SCAN_DEPTHS.map(depth => (
                <option key={depth} value={depth}>
                  {I18n.t('com.affine.chess.engine.depth')} {depth}
                </option>
              ))}
            </select>
          </div>
          {lastInfo && (
            <div className={styles.analysisPv} data-testid="chess-engine-pv">
              {formatScore(lastInfo.score, position.turn)} ·{' '}
              {pvUciToSan(toFen(position), lastInfo.pv).join(' ')}
            </div>
          )}
          {!available && (
            <div data-testid="chess-engine-unavailable">
              {I18n.t('com.affine.chess.engine.unavailable')}
            </div>
          )}
          {(scanning || (progress && progress.total > 0)) && (
            <>
              <div className={styles.progress}>
                <div
                  className={styles.progressFill}
                  style={{
                    width: `${
                      progress && progress.total > 0
                        ? (progress.done / progress.total) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
              <div data-testid="chess-scan-progress">
                {I18n.t('com.affine.chess.engine.scanning')}
                {progress && progress.total > 0
                  ? ` ${progress.done} / ${progress.total}`
                  : ''}
              </div>
            </>
          )}
          {scanError && (
            <div className={styles.error} data-testid="chess-scan-error">
              {I18n.t('com.affine.chess.engine.scanFailed')}: {scanError}
            </div>
          )}
          {scan && (
            <div>
              {I18n.t('com.affine.chess.engine.acpl')}{' '}
              {Math.round(scan.whiteAcpl)} / {Math.round(scan.blackAcpl)}
            </div>
          )}
        </div>

        {currentNode && !readonly && (
          <div className={styles.annotations}>
            <div className={styles.nagRow}>
              {NAG_CHOICES.map(({ nag, symbol, label }) => (
                <button
                  key={nag}
                  className={clsx(
                    styles.nagButton,
                    currentNode.nags.includes(nag) && styles.nagButtonActive
                  )}
                  title={label}
                  onClick={() => toggleNag(nag)}
                >
                  {symbol}
                </button>
              ))}
            </div>
            <input
              ref={guardFieldPointer}
              className={styles.commentInput}
              placeholder={`Comment on ${currentNode.san}`}
              defaultValue={currentNode.comment ?? ''}
              // Keyed by path so switching moves reloads the field rather than
              // carrying the previous move's comment across.
              key={path.join('.')}
              aria-label="Move comment"
              data-testid="chess-comment-input"
              onBlur={event => applyComment(event.target.value)}
              {...nestedFieldEvents}
              onKeyDown={event => {
                event.stopPropagation();
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
            />
            <button
              className={styles.controlButton}
              data-testid="chess-move-comment"
              onClick={() => {
                const flavour = workspace?.workspace.flavour;
                const features =
                  serverService?.server.config$.value.features ?? [];
                if (
                  flavour === 'local' ||
                  !features.includes(ServerFeature.Comment)
                ) {
                  notify.error({
                    title: I18n.t('com.affine.chess.assignment.needSync'),
                  });
                  return;
                }
                if (!commentRef || !game) return;
                const preview = formatMovePreview(game, path);
                void commentRef.obj
                  .addChessMoveComment(
                    {
                      blockId: model.id,
                      path,
                      san: currentNode.san,
                      fenAfter: currentNode.fenAfter,
                    },
                    preview
                  )
                  .then(() => {
                    workbenchService?.workbench.openSidebar();
                    viewService?.view.activeSidebarTab('comment');
                  })
                  .catch(() => {});
              }}
            >
              {I18n.t('com.affine.chess.library.moveComment')}
            </button>
            <div className={styles.nagRow}>
              {(path.at(-1) ?? 0) > 0 && (
                <button
                  className={styles.controlButton}
                  onClick={promote}
                  data-testid="chess-promote"
                >
                  Promote to main line
                </button>
              )}
              <button
                className={clsx(styles.controlButton, styles.dangerButton)}
                onClick={deleteHere}
                data-testid="chess-delete-from"
              >
                Delete from here
              </button>
            </div>
          </div>
        )}
      </div>

      {editing && (
        <PgnEditor
          value={draftValue}
          error={draftError}
          readonly={readonly}
          canCancel
          onChange={setDraft}
          onSave={saveDraft}
          onCancel={() => setDraft(null)}
          autoFocus
        />
      )}
    </div>
  );
};
