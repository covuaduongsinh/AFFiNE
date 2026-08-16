import { Chessboard } from '@affine/component/ui/chess';
import { useSignalValue } from '@affine/core/modules/doc-info/utils';
import type { ChessGameBlockModel } from '@blocksuite/chess-block-game';
import {
  algebraicToSquare,
  childrenAt,
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
  serializePgn,
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
  const containerRef = useRef<HTMLDivElement>(null);

  const readonly = model.store.readonly;

  const game = useMemo<Game | null>(() => {
    try {
      return parsePgn(pgn);
    } catch {
      return null;
    }
  }, [pgn]);

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
    model.store.updateBlock(model, {
      orientation: orientation === 'white' ? 'black' : 'white',
    });
  }, [model, orientation]);

  const handleMove = useCallback(
    (from: string, to: string) => {
      if (!game || !position || readonly) return;
      const move = findMove(
        position,
        algebraicToSquare(from),
        algebraicToSquare(to)
      );
      if (!move) return;

      const result = playMove(game, path, move);
      model.store.updateBlock(model, {
        pgn: serializePgn(game),
        currentPath: result.path,
      });
      setSelected(null);
    },
    [game, model, path, position, readonly]
  );

  /** Arrow keys walk the line; up and down switch between variations. */
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const onKeyDown = (event: KeyboardEvent) => {
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
      <div className={styles.error}>
        This game could not be read as PGN. The text is preserved and can be
        fixed by editing the block source.
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
              No moves yet — play one on the board.
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
      </div>
    </div>
  );
};
