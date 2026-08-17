import {
  type ChessArrow,
  Chessboard,
  ChessPiece,
  type PieceLetter,
  type SquareName,
} from '@affine/component/ui/chess';
import { useSignalValue } from '@affine/core/modules/doc-info/utils';
import type { ChessBoardBlockModel } from '@blocksuite/chess-block-board';
import {
  algebraicToSquare,
  applyMove,
  findMove,
  findPieces,
  inCheck,
  KING,
  legalMoves,
  parseDiagramFen,
  parseFen,
  readPlacement,
  squareToAlgebraic,
  START_FEN,
  toFen,
  writeFen,
} from '@blocksuite/chess-core';
import clsx from 'clsx';
import { useCallback, useMemo, useState } from 'react';

import * as styles from './chess-board-view.css';
import * as gameStyles from './chess-game-view.css';
import { guardFieldPointer, nestedFieldEvents } from './field-guard';

export interface ChessBoardViewProps {
  model: ChessBoardBlockModel;
}

/** What a click on a square does while the position editor is open. */
type SetupTool = 'hand' | 'erase' | PieceLetter;

const WHITE_PIECES: PieceLetter[] = ['K', 'Q', 'R', 'B', 'N', 'P'];
const BLACK_PIECES: PieceLetter[] = ['k', 'q', 'r', 'b', 'n', 'p'];

const PIECE_NAMES: Record<string, string> = {
  K: 'Vua',
  Q: 'Hậu',
  R: 'Xe',
  B: 'Tượng',
  N: 'Mã',
  P: 'Tốt',
};

const pieceTitle = (letter: PieceLetter) => {
  const side = letter === letter.toUpperCase() ? 'trắng' : 'đen';
  return `Đặt ${PIECE_NAMES[letter.toUpperCase()]} ${side}`;
};

const pieceTestId = (letter: PieceLetter) =>
  `chess-setup-tool-${letter === letter.toUpperCase() ? 'w' : 'b'}${letter.toUpperCase()}`;

const CASTLE_RIGHTS = [
  { right: 'K', label: 'Trắng O-O' },
  { right: 'Q', label: 'Trắng O-O-O' },
  { right: 'k', label: 'Đen O-O' },
  { right: 'q', label: 'Đen O-O-O' },
] as const;

const noop = () => {};

/**
 * Bridges the block model to the presentational board.
 *
 * This is where the chess rules live: the board component knows nothing about
 * legality, so this view derives the legal destinations, resolves a from/to
 * pair into a real move, and writes the resulting FEN back to the document.
 * The FEN on the model stays the single source of truth.
 *
 * While the position editor is open, the board switches from playing moves to
 * setting up a position: it renders the draft FEN — the board component draws
 * any placement, kings or not — and clicks place, erase or drag pieces with no
 * legality involved. `parseFen` gates the Save, so only a legal position ever
 * reaches the document.
 */
export const ChessBoardView = ({ model }: ChessBoardViewProps) => {
  const fen = useSignalValue(model.props.fen$);
  const orientation = useSignalValue(model.props.orientation$);
  const editable = useSignalValue(model.props.editable$);
  const arrows = useSignalValue(model.props.arrows$);
  const highlights = useSignalValue(model.props.highlights$);

  const [selected, setSelected] = useState<string | null>(null);
  /** `null` when the position editor is closed; the draft FEN when open. */
  const [draft, setDraft] = useState<string | null>(null);
  const [tool, setTool] = useState<SetupTool>('hand');

  const readonly = model.store.readonly;
  /**
   * Boards written before the `editable` prop existed have no value stored for
   * it; those were always meant to be movable, so absence means true. Only an
   * explicit false — the fixed diagram — locks the pieces.
   */
  const movesEnabled = editable !== false;
  const interactive = movesEnabled && !readonly;

  /** A position we cannot parse is shown as-is rather than silently repaired. */
  const position = useMemo(() => {
    try {
      return parseFen(fen);
    } catch {
      return null;
    }
  }, [fen]);

  const moves = useMemo(
    () => (position ? legalMoves(position) : []),
    [position]
  );

  const destinations = useMemo(() => {
    if (!selected) return [];
    return moves
      .filter(move => squareToAlgebraic(move.from) === selected)
      .map(move => squareToAlgebraic(move.to));
  }, [moves, selected]);

  const checkSquare = useMemo(() => {
    if (!position || !inCheck(position)) return undefined;
    const [king] = findPieces(position, position.turn, KING);
    return king === undefined ? undefined : squareToAlgebraic(king);
  }, [position]);

  const handleMove = useCallback(
    (from: string, to: string) => {
      if (!position || readonly) return;
      const move = findMove(
        position,
        algebraicToSquare(from),
        algebraicToSquare(to)
      );
      // An illegal drag just snaps back; nothing is written to the document.
      if (!move) return;
      // Each move is its own undo step, or one Ctrl+Z takes the block away
      // along with everything played on it.
      model.store.captureSync();
      model.store.updateBlock(model, {
        fen: toFen(applyMove(position, move)),
      });
      setSelected(null);
    },
    [model, position, readonly]
  );

  const handleArrowDraw = useCallback(
    (arrow: ChessArrow) => {
      if (readonly) return;
      const current = model.props.arrows ?? [];
      const existing = current.findIndex(
        item => item.from === arrow.from && item.to === arrow.to
      );
      model.store.captureSync();
      model.store.updateBlock(model, {
        arrows:
          existing === -1
            ? [...current, { from: arrow.from, to: arrow.to }]
            : current.filter((_, index) => index !== existing),
      });
    },
    [model, readonly]
  );

  const editing = draft !== null;
  const draftValue = draft ?? fen;

  /**
   * The draft FEN split into the parts the setup tools operate on. The FEN
   * string stays the single source of truth, so the palette and the text box
   * can never disagree: typing re-derives these, a board edit rewrites the
   * string through {@link writeFen}.
   */
  const draftParts = useMemo(() => {
    const fields = draftValue.trim().split(/\s+/);
    const castling = fields[2];
    return {
      placement: readPlacement(draftValue),
      turn: fields[1] === 'b' ? ('b' as const) : ('w' as const),
      castling: castling === undefined || castling === '-' ? '' : castling,
    };
  }, [draftValue]);

  const updateDraft = useCallback(
    (
      mutate: (parts: {
        placement: Map<string, string>;
        turn: 'w' | 'b';
        castling: string;
      }) => void
    ) => {
      const parts = {
        ...draftParts,
        placement: new Map(draftParts.placement),
      };
      mutate(parts);
      // En passant, clocks: reset. A position being set up has no history for
      // them to describe.
      setDraft(writeFen(parts));
    },
    [draftParts]
  );

  const handleSetupSquare = useCallback(
    (square: SquareName) => {
      if (tool === 'hand') return;
      updateDraft(parts => {
        if (tool === 'erase') parts.placement.delete(square);
        else parts.placement.set(square, tool);
      });
    },
    [tool, updateDraft]
  );

  const handleSetupMove = useCallback(
    (from: SquareName, to: SquareName) => {
      if (tool !== 'hand' || from === to) return;
      updateDraft(parts => {
        const piece = parts.placement.get(from);
        if (piece === undefined) return;
        parts.placement.delete(from);
        parts.placement.set(to, piece);
      });
    },
    [tool, updateDraft]
  );

  const toggleCastle = useCallback(
    (right: 'K' | 'Q' | 'k' | 'q') => {
      updateDraft(parts => {
        parts.castling = ['K', 'Q', 'k', 'q']
          .filter(item =>
            item === right
              ? !parts.castling.includes(item)
              : parts.castling.includes(item)
          )
          .join('');
      });
    },
    [updateDraft]
  );

  const setTurn = useCallback(
    (turn: 'w' | 'b') => {
      updateDraft(parts => {
        parts.turn = turn;
      });
    },
    [updateDraft]
  );

  /**
   * Parse error for the text in the editor, or null when it is valid.
   *
   * Diagram parse: a position without kings is a legitimate thing to save —
   * printed material is full of pawn-structure diagrams. The strict parse
   * above still governs play, so a king-less board simply has no moves.
   */
  const draftError = useMemo(() => {
    try {
      parseDiagramFen(draftValue);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Unreadable FEN';
    }
  }, [draftValue]);

  const saveDraft = useCallback(() => {
    if (readonly) return;
    try {
      parseDiagramFen(draftValue);
    } catch {
      return;
    }
    model.store.captureSync();
    model.store.updateBlock(model, { fen: draftValue });
    setDraft(null);
  }, [draftValue, model, readonly]);

  const toggleMoves = useCallback(() => {
    if (readonly) return;
    model.store.captureSync();
    model.store.updateBlock(model, { editable: !movesEnabled });
  }, [model, movesEnabled, readonly]);

  const openEditor = useCallback(() => {
    setDraft(fen);
    setTool('hand');
  }, [fen]);

  return (
    // tabIndex mirrors the game view: a click into the board must focus the
    // container, so the paste watcher can tell "a FEN pasted onto this board"
    // from "a FEN pasted into the document" and replace the position in place.
    <div className={styles.container} tabIndex={0}>
      <Chessboard
        fen={editing ? draftValue : fen}
        orientation={orientation}
        interactive={editing ? !readonly : interactive}
        selected={editing ? null : selected}
        onSelect={editing ? noop : setSelected}
        legalDestinations={editing ? [] : destinations}
        check={editing ? undefined : checkSquare}
        arrows={arrows}
        highlights={highlights}
        onMove={editing ? handleSetupMove : handleMove}
        onSquareClick={editing ? handleSetupSquare : undefined}
        onArrowDraw={handleArrowDraw}
      />
      {/* Author-only controls; hidden on the whiteboard, where the block fills
          a fixed bound with the board alone (see edgeless-board-block.ts). */}
      {!readonly && (
        <div
          className={clsx(gameStyles.controls, styles.belowBoard)}
          data-chess-board-controls="true"
        >
          <button
            className={clsx(
              gameStyles.controlButton,
              editing && gameStyles.currentMove
            )}
            onClick={() => (editing ? setDraft(null) : openEditor())}
            title={editing ? 'Close the position editor' : 'Edit position'}
            data-testid="chess-board-edit-toggle"
          >
            ✎
          </button>
          <button
            className={gameStyles.controlButton}
            onClick={toggleMoves}
            title="Bật/tắt di chuyển quân trên bàn cờ"
            data-testid="chess-board-lock-toggle"
          >
            {movesEnabled ? 'Đi quân: Bật' : 'Đi quân: Tắt'}
          </button>
        </div>
      )}
      {editing && !readonly && (
        <div
          className={clsx(gameStyles.editor, styles.belowBoard)}
          data-chess-board-controls="true"
        >
          <div className={styles.paletteRow}>
            <button
              className={clsx(
                gameStyles.controlButton,
                styles.paletteButton,
                tool === 'hand' && gameStyles.currentMove
              )}
              onClick={() => setTool('hand')}
              title="Di dời quân bằng kéo-thả"
              data-testid="chess-setup-tool-hand"
            >
              ✋
            </button>
            {[...WHITE_PIECES, ...BLACK_PIECES].map(letter => (
              <button
                key={letter}
                className={clsx(
                  gameStyles.controlButton,
                  styles.paletteButton,
                  tool === letter && gameStyles.currentMove
                )}
                onClick={() => setTool(tool === letter ? 'hand' : letter)}
                title={pieceTitle(letter)}
                data-testid={pieceTestId(letter)}
              >
                <span className={styles.pieceBox}>
                  <ChessPiece piece={letter} />
                </span>
              </button>
            ))}
            <button
              className={clsx(
                gameStyles.controlButton,
                styles.paletteButton,
                tool === 'erase' && gameStyles.currentMove
              )}
              onClick={() => setTool(tool === 'erase' ? 'hand' : 'erase')}
              title="Xóa quân ở ô được bấm"
              data-testid="chess-setup-tool-erase"
            >
              🗑
            </button>
          </div>
          <div className={styles.setupRow}>
            <button
              className={gameStyles.controlButton}
              onClick={() => updateDraft(parts => parts.placement.clear())}
              data-testid="chess-setup-clear"
            >
              Xóa bàn
            </button>
            <button
              className={gameStyles.controlButton}
              onClick={() => setDraft(START_FEN)}
              data-testid="chess-setup-start"
            >
              Thế ban đầu
            </button>
            <button
              className={clsx(
                gameStyles.controlButton,
                draftParts.turn === 'w' && gameStyles.currentMove
              )}
              onClick={() => setTurn('w')}
              data-testid="chess-setup-turn-w"
            >
              Trắng đi
            </button>
            <button
              className={clsx(
                gameStyles.controlButton,
                draftParts.turn === 'b' && gameStyles.currentMove
              )}
              onClick={() => setTurn('b')}
              data-testid="chess-setup-turn-b"
            >
              Đen đi
            </button>
          </div>
          <div className={styles.setupRow}>
            <span>Nhập thành:</span>
            {CASTLE_RIGHTS.map(({ right, label }) => (
              <label key={right} className={styles.castleLabel}>
                {/* No pointer guard here: a checkbox's React onChange rides on
                    the click reaching React's root, which the guard would cut
                    off. It needs no caret protection anyway. */}
                <input
                  type="checkbox"
                  className={styles.castleCheckbox}
                  checked={draftParts.castling.includes(right)}
                  onChange={() => toggleCastle(right)}
                  data-testid={`chess-setup-castle-${right}`}
                />
                {label}
              </label>
            ))}
          </div>
          <input
            ref={guardFieldPointer}
            className={styles.fenInput}
            value={draftValue}
            spellCheck={false}
            aria-label="FEN position"
            data-testid="chess-fen-editor"
            placeholder={START_FEN}
            onChange={event => setDraft(event.target.value)}
            {...nestedFieldEvents}
            onKeyDown={event => {
              event.stopPropagation();
              if (event.key === 'Enter' && draftError === null) saveDraft();
            }}
          />
          <div className={gameStyles.editorFooter}>
            <span
              className={clsx(
                gameStyles.editorStatus,
                draftError && gameStyles.error
              )}
            >
              {draftError ??
                'Đặt quân bằng bảng chọn, kéo-thả, hoặc sửa FEN trực tiếp.'}
            </span>
            <button
              className={gameStyles.controlButton}
              data-testid="chess-fen-paste-btn"
              title="Đọc FEN từ clipboard — không cần bàn phím"
              onClick={() => {
                navigator.clipboard
                  .readText()
                  .then(text => {
                    if (text.trim()) setDraft(text.trim());
                  })
                  .catch(() => {});
              }}
            >
              Dán FEN
            </button>
            <button
              className={gameStyles.controlButton}
              onClick={() => setDraft(null)}
            >
              Cancel
            </button>
            <button
              className={gameStyles.primaryButton}
              onClick={saveDraft}
              disabled={draftError !== null}
              data-testid="chess-fen-save"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
