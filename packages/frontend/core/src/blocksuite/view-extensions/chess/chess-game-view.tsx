import { Chessboard } from '@affine/component/ui/chess';
import { useSignalValue } from '@affine/core/modules/doc-info/utils';
import type { ChessGameBlockModel } from '@blocksuite/chess-block-game';
import {
  algebraicToSquare,
  childrenAt,
  deleteFrom,
  findMove,
  findPieces,
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
import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import * as styles from './chess-game-view.css';

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

interface MoveTokenProps {
  node: MoveNode;
  path: MovePath;
  currentPath: MovePath;
  onSelect: (path: MovePath) => void;
  /** Black must restate the number after a comment or a variation. */
  forceNumber: boolean;
}

const MoveToken = ({
  node,
  path,
  currentPath,
  onSelect,
  forceNumber,
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
          samePath(path, currentPath) && styles.currentMove
        )}
        onClick={() => onSelect(path)}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') onSelect(path);
        }}
      >
        {node.san}
        {node.nags.map(nag => NAG_SYMBOLS[nag] ?? `$${nag}`).join('')}
      </span>{' '}
      {node.comment !== undefined && (
        <span className={styles.comment}>{node.comment}</span>
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
            />
            <MoveList
              nodes={alternative.children}
              basePath={alternativePath}
              currentPath={currentPath}
              onSelect={onSelect}
              forceNumber={alternative.comment !== undefined}
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
      />
    </>
  );
};

/**
 * BlockSuite listens for pointer and keyboard events at the document level and
 * acts on them before a field nested inside a block ever sees them.
 *
 * Paste is the one that actually bites: the editor's clipboard controller
 * listens on `document`, calls `preventDefault()` and pastes into the document
 * instead, so pasting a PGN into this box did nothing at all — the box kept the
 * old text while the game silently changed underneath. Typing worked, which is
 * what made the report ("chưa sửa được pgn") look like a focus problem.
 *
 * This is the same set the built-in caption editor stops
 * (`blocksuite/affine/components/src/caption/block-caption.ts`).
 */
const stopPropagation = (event: { stopPropagation: () => void }) =>
  event.stopPropagation();

const nestedFieldEvents = {
  onPointerDown: stopPropagation,
  onPointerUp: stopPropagation,
  onClick: stopPropagation,
  onDoubleClick: stopPropagation,
  onMouseDown: stopPropagation,
  onCut: stopPropagation,
  onCopy: stopPropagation,
  onPaste: stopPropagation,
  onKeyDown: stopPropagation,
  onKeyUp: stopPropagation,
} as const;

interface PgnEditorProps {
  value: string;
  error: string | null;
  readonly: boolean;
  /** Hidden when the stored PGN is broken: there is nothing safe to go back to. */
  canCancel: boolean;
  onChange: (text: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

const PgnEditor = ({
  value,
  error,
  readonly,
  canCancel,
  onChange,
  onSave,
  onCancel,
}: PgnEditorProps) => (
  <div className={styles.editor}>
    <textarea
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
 * PGN text on the model is the source of truth: every edit re-parses it, mutates
 * the throwaway tree, and serializes straight back. That keeps annotations tied
 * to their moves through a CRDT merge and means the block's contents are always
 * exactly what another chess tool would read.
 */
export const ChessGameView = ({ model }: ChessGameViewProps) => {
  const pgn = useSignalValue(model.props.pgn$);
  const currentPath = useSignalValue(model.props.currentPath$);
  const orientation = useSignalValue(model.props.orientation$);

  const [selected, setSelected] = useState<string | null>(null);
  /** `null` when the PGN editor is closed; the draft text when it is open. */
  const [draft, setDraft] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const readonly = model.store.readonly;

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
        />
      </div>
    );
  }

  const { headers } = game;
  const atStart = path.length === 0;
  const atEnd = childrenAt(game, path).length === 0;

  return (
    <div ref={containerRef} className={styles.container} tabIndex={0}>
      <div className={styles.boardColumn}>
        <Chessboard
          fen={toFen(position)}
          orientation={orientation}
          interactive={!readonly}
          selected={selected}
          onSelect={setSelected}
          legalDestinations={destinations}
          check={checkSquare}
          lastMove={lastMove}
          onMove={handleMove}
        />
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
            />
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
        />
      )}
    </div>
  );
};
