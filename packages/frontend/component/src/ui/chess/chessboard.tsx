import clsx from 'clsx';
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';

import * as styles from './chessboard.css';
import {
  ChessPiece,
  type ChessPieceSet,
  type PieceLetter,
} from './pieces';

export type BoardOrientation = 'white' | 'black';

/** Algebraic square name, e.g. `"e4"`. */
export type SquareName = string;

export interface ChessArrow {
  from: SquareName;
  to: SquareName;
  color?: string;
}

export interface ChessHighlight {
  square: SquareName;
  color: string;
}

export interface ChessboardProps {
  /** Full FEN, or just its placement field — only the placement is read. */
  fen: string;
  orientation?: BoardOrientation;
  /** Piece set style. Defaults to 'staunton'. */
  pieceSet?: ChessPieceSet;
  /** Enables selecting, dragging and the right-drag arrow gesture. */
  interactive?: boolean;
  /**
   * Enables annotating without enabling play: squares still report clicks and
   * a right-drag still draws an arrow, but no piece may be selected or moved.
   *
   * A fixed diagram is exactly the board a lesson is drawn on, so annotation
   * cannot be tied to `interactive` — that is the one board where it is off.
   */
  annotatable?: boolean;
  coordinates?: boolean;
  /** Squares of the move just played, tinted so the move is visible at a glance. */
  lastMove?: { from: SquareName; to: SquareName };
  /** Square of a king in check. */
  check?: SquareName;
  arrows?: ChessArrow[];
  highlights?: ChessHighlight[];
  /**
   * Destinations to mark for the selected piece. The board only *draws* these —
   * legality is the caller's business, which keeps this component free of chess
   * rules and therefore free of dependencies.
   */
  legalDestinations?: SquareName[];
  /** Controlled selection. Omit to let the board manage it. */
  selected?: SquareName | null;
  onSelect?: (square: SquareName | null) => void;
  onMove?: (from: SquareName, to: SquareName) => void;
  onSquareClick?: (square: SquareName) => void;
  /** Fired when a right-drag completes. Toggle semantics are the caller's. */
  onArrowDraw?: (arrow: ChessArrow) => void;
  className?: string;
  style?: CSSProperties;
}

const FILES = 'abcdefgh';
const ALL_INDEXES = [0, 1, 2, 3, 4, 5, 6, 7];

const squareName = (file: number, rank: number): SquareName =>
  `${FILES[file]}${rank + 1}`;

/** Placement field of a FEN -> a `{ square: piece }` map. */
function readPlacement(fen: string): Map<SquareName, PieceLetter> {
  const pieces = new Map<SquareName, PieceLetter>();
  const placement = fen.trim().split(/\s+/)[0] ?? '';
  const ranks = placement.split('/');

  for (let i = 0; i < ranks.length && i < 8; i++) {
    const rank = 7 - i; // FEN lists rank 8 first.
    let file = 0;
    for (const ch of ranks[i]) {
      if (ch >= '1' && ch <= '8') {
        file += ch.charCodeAt(0) - 48;
        continue;
      }
      if (file > 7) break;
      pieces.set(squareName(file, rank), ch as PieceLetter);
      file++;
    }
  }

  return pieces;
}

/** Centre of a square in board space, where the whole board is 8x8 units. */
function centreOf(
  square: SquareName,
  orientation: BoardOrientation
): { x: number; y: number } | null {
  const file = FILES.indexOf(square[0]);
  const rank = Number.parseInt(square.slice(1), 10) - 1;
  if (file < 0 || Number.isNaN(rank) || rank < 0 || rank > 7) return null;
  return orientation === 'white'
    ? { x: file + 0.5, y: 7 - rank + 0.5 }
    : { x: 7 - file + 0.5, y: rank + 0.5 };
}

interface DragState {
  from: SquareName;
  x: number;
  y: number;
}

export const Chessboard = ({
  fen,
  orientation = 'white',
  pieceSet = 'staunton',
  interactive = false,
  annotatable = false,
  coordinates = true,
  lastMove,
  check,
  arrows,
  highlights,
  legalDestinations,
  selected: controlledSelected,
  onSelect,
  onMove,
  onSquareClick,
  onArrowDraw,
  className,
  style,
}: ChessboardProps) => {
  const boardRef = useRef<HTMLDivElement>(null);
  const [innerSelected, setInnerSelected] = useState<SquareName | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [arrowStart, setArrowStart] = useState<SquareName | null>(null);

  const selected =
    controlledSelected !== undefined ? controlledSelected : innerSelected;

  const setSelected = useCallback(
    (square: SquareName | null) => {
      if (controlledSelected === undefined) setInnerSelected(square);
      onSelect?.(square);
    },
    [controlledSelected, onSelect]
  );

  const pieces = useMemo(() => readPlacement(fen), [fen]);

  const highlightMap = useMemo(() => {
    const map = new Map<SquareName, string>();
    for (const item of highlights ?? []) map.set(item.square, item.color);
    return map;
  }, [highlights]);

  const destinations = useMemo(
    () => new Set(legalDestinations ?? []),
    [legalDestinations]
  );

  /** Which square lies under a client point, or null when outside the board. */
  const squareAtPoint = useCallback(
    (clientX: number, clientY: number): SquareName | null => {
      const element = boardRef.current;
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;

      const column = Math.floor(((clientX - rect.left) / rect.width) * 8);
      const row = Math.floor(((clientY - rect.top) / rect.height) * 8);
      if (column < 0 || column > 7 || row < 0 || row > 7) return null;

      return orientation === 'white'
        ? squareName(column, 7 - row)
        : squareName(7 - column, row);
    },
    [orientation]
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!interactive && !annotatable) return;
      const square = squareAtPoint(event.clientX, event.clientY);
      if (!square) return;

      // The right button draws an arrow instead of moving anything.
      if (event.button === 2) {
        setArrowStart(square);
        return;
      }
      if (event.button !== 0) return;

      onSquareClick?.(square);

      // Annotating a board leaves the position alone: the click has already
      // been reported, and nothing below it may pick a piece up.
      if (!interactive) return;

      // Clicking a marked destination completes a click-then-click move.
      if (
        selected !== null &&
        square !== selected &&
        destinations.has(square)
      ) {
        onMove?.(selected, square);
        setSelected(null);
        return;
      }

      if (!pieces.has(square)) {
        setSelected(null);
        return;
      }

      setSelected(square);
      event.currentTarget.setPointerCapture(event.pointerId);
      setDrag({ from: square, x: event.clientX, y: event.clientY });
    },
    [
      annotatable,
      destinations,
      interactive,
      onMove,
      onSquareClick,
      pieces,
      selected,
      setSelected,
      squareAtPoint,
    ]
  );

  const handlePointerMove = useCallback((event: ReactPointerEvent) => {
    const { clientX, clientY } = event;
    setDrag(current =>
      current ? { ...current, x: clientX, y: clientY } : null
    );
  }, []);

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const target = squareAtPoint(event.clientX, event.clientY);

      if (arrowStart !== null) {
        if (target !== null && target !== arrowStart) {
          onArrowDraw?.({ from: arrowStart, to: target });
        }
        setArrowStart(null);
        return;
      }

      if (drag === null) return;
      // Press and release on the same square is a selection, not a move.
      if (target !== null && target !== drag.from) {
        onMove?.(drag.from, target);
        setSelected(null);
      }
      setDrag(null);
    },
    [arrowStart, drag, onArrowDraw, onMove, setSelected, squareAtPoint]
  );

  /**
   * A cancelled pointer is not a released one.
   *
   * `pointercancel` carries coordinates like any other pointer event, so
   * routing it through the release handler was enough to commit a move: on a
   * phone the page scroller can claim a drag part-way through, and if the
   * finger had already crossed into the next square, the board wrote a move
   * nobody made. Drop the gesture instead — the piece stays where it was, and
   * the player tries again.
   */
  const handlePointerCancel = useCallback(() => {
    setArrowStart(null);
    setDrag(null);
  }, []);

  /** Squares in display order for the current orientation. */
  const cells = useMemo(() => {
    const ranks =
      orientation === 'white' ? [...ALL_INDEXES].reverse() : ALL_INDEXES;
    const files =
      orientation === 'white' ? ALL_INDEXES : [...ALL_INDEXES].reverse();
    return ranks.flatMap(rank => files.map(file => ({ file, rank })));
  }, [orientation]);

  /** Position of the dragged piece as a percentage of the board. */
  const dragOffset = useMemo(() => {
    const element = boardRef.current;
    if (drag === null || !element) return null;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      left: ((drag.x - rect.left) / rect.width) * 100 - 6.25,
      top: ((drag.y - rect.top) / rect.height) * 100 - 6.25,
    };
  }, [drag]);

  const bottomRank = orientation === 'white' ? 0 : 7;
  const leftFile = orientation === 'white' ? 0 : 7;

  return (
    <div
      data-chess-board="true"
      className={clsx(styles.wrapper, className)}
      style={style}
    >
      <div
        ref={boardRef}
        className={styles.board}
        data-interactive={interactive ? 'true' : undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onContextMenu={event => event.preventDefault()}
        role="grid"
        aria-label="Chess board"
      >
        {cells.map(({ file, rank }) => {
          const name = squareName(file, rank);
          const isLight = (file + rank) % 2 === 1;
          const isDestination = destinations.has(name);

          return (
            <div
              key={name}
              data-square={name}
              role="gridcell"
              aria-label={name}
              className={clsx(
                styles.square,
                isLight ? styles.light : styles.dark,
                (interactive || annotatable) && styles.interactive
              )}
            >
              {(lastMove?.from === name || lastMove?.to === name) && (
                <div className={styles.lastMoveOverlay} />
              )}
              {highlightMap.has(name) && (
                <div
                  className={styles.customOverlay}
                  style={{ backgroundColor: highlightMap.get(name) }}
                />
              )}
              {selected === name && <div className={styles.selectedOverlay} />}
              {check === name && <div className={styles.checkOverlay} />}
              {isDestination && (
                <div
                  className={
                    pieces.has(name) ? styles.captureHint : styles.moveHint
                  }
                />
              )}
              {coordinates && rank === bottomRank && (
                <span
                  className={clsx(
                    styles.fileCoordinate,
                    isLight ? styles.onLightSquare : styles.onDarkSquare
                  )}
                >
                  {FILES[file]}
                </span>
              )}
              {coordinates && file === leftFile && (
                <span
                  className={clsx(
                    styles.rankCoordinate,
                    isLight ? styles.onLightSquare : styles.onDarkSquare
                  )}
                >
                  {rank + 1}
                </span>
              )}
            </div>
          );
        })}

        <div className={styles.pieceLayer}>
          {[...pieces].map(([name, letter]) => {
            const centre = centreOf(name, orientation);
            if (!centre) return null;
            const isDragged = drag?.from === name && dragOffset !== null;

            return (
              <div
                key={name}
                data-square={name}
                data-piece={letter}
                className={clsx(styles.piece, isDragged && styles.dragging)}
                style={
                  isDragged
                    ? { left: `${dragOffset.left}%`, top: `${dragOffset.top}%` }
                    : {
                        left: `${(centre.x - 0.5) * 12.5}%`,
                        top: `${(centre.y - 0.5) * 12.5}%`,
                      }
                }
              >
                <ChessPiece piece={letter} pieceSet={pieceSet} />
              </div>
            );
          })}
        </div>

        {arrows !== undefined && arrows.length > 0 && (
          <svg
            className={styles.arrowLayer}
            viewBox="0 0 8 8"
            aria-hidden="true"
          >
            <defs>
              <marker
                id="affine-chess-arrowhead"
                viewBox="0 0 10 10"
                refX="7"
                refY="5"
                markerWidth="3.2"
                markerHeight="3.2"
                orient="auto-start-reverse"
              >
                <path d="M0 0 L10 5 L0 10 z" fill="context-stroke" />
              </marker>
            </defs>
            {arrows.map((arrow, index) => {
              const from = centreOf(arrow.from, orientation);
              const to = centreOf(arrow.to, orientation);
              if (!from || !to) return null;
              return (
                <line
                  key={`${arrow.from}-${arrow.to}-${index}`}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={arrow.color ?? 'var(--chess-arrow)'}
                  strokeWidth={0.16}
                  strokeLinecap="round"
                  markerEnd="url(#affine-chess-arrowhead)"
                />
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
};
