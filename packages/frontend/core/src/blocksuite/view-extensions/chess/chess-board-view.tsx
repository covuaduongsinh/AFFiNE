import {
  type ChessArrow,
  Chessboard,
  ChessPiece,
  type PieceLetter,
  type SquareName,
} from '@affine/component/ui/chess';
import { useAppSettingHelper } from '@affine/core/components/hooks/affine/use-app-setting-helper';
import { ChessReviewService } from '@affine/core/modules/chess-review';
import { useSignalValue } from '@affine/core/modules/doc-info/utils';
import { I18n } from '@affine/i18n';
import {
  ANNOTATION_COLORS,
  type AnnotationColorKey,
  type ChessBoardBlockModel,
} from '@blocksuite/chess-block-board';
import {
  algebraicToSquare,
  applyMove,
  type ChessPieceSet,
  findMove,
  findPieces,
  inCheck,
  KING,
  legalMoves,
  parseDiagramFen,
  parseFen,
  PIECE_SETS_METADATA,
  readPlacement,
  squareToAlgebraic,
  START_FEN,
  toFen,
  writeFen,
} from '@blocksuite/chess-core';
import { useServiceOptional } from '@toeverything/infra';
import clsx from 'clsx';
import {
  type CSSProperties,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { formatScore } from './analysis-ui';
import * as styles from './chess-board-view.css';
import * as gameStyles from './chess-game-view.css';
import { EvalBar } from './eval-bar';
import { guardFieldPointer, nestedFieldEvents } from './field-guard';
import { useChessAnalysis } from './use-chess-analysis';

const MemoChessboard = memo(Chessboard);

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

/**
 * The colours a lesson is drawn in.
 *
 * These are the four the Obsidian plugin understands, in its own values, so a
 * board annotated here looks the same in both apps and survives the trip out
 * as `annotations:` tokens. Anything else would be dropped to a default on
 * export, which is why there is no free colour picker here.
 */
const ANNOTATION_CHOICES = [
  { key: 'y', label: 'Vàng' },
  { key: 'g', label: 'Xanh lá' },
  { key: 'b', label: 'Xanh dương' },
  { key: 'r', label: 'Đỏ' },
] as const satisfies readonly { key: AnnotationColorKey; label: string }[];

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
  const review = useServiceOptional(ChessReviewService);
  const fen = useSignalValue(model.props.fen$);
  const orientation = useSignalValue(model.props.orientation$);
  const editable = useSignalValue(model.props.editable$);
  const arrows = useSignalValue(model.props.arrows$);
  const highlights = useSignalValue(model.props.highlights$);
  const {
    activate,
    available,
    engineArrow,
    isActive,
    lastInfo,
    live,
    requestAnalyze,
    startLive,
    status,
    stop,
  } = useChessAnalysis(model.id);

  const { appSettings, updateSettings } = useAppSettingHelper();
  const pieceSet = appSettings.chessPieceSet ?? 'staunton';
  const [selected, setSelected] = useState<string | null>(null);
  /** `null` when the position editor is closed; the draft FEN when open. */
  const [draft, setDraft] = useState<string | null>(null);
  const [tool, setTool] = useState<SetupTool>('hand');
  /** Whether clicks and right-drags draw annotations instead of playing. */
  const [annotating, setAnnotating] = useState(false);
  const [inkColor, setInkColor] = useState<AnnotationColorKey>('y');

  const cyclePieceSet = useCallback(() => {
    const keys = Object.keys(PIECE_SETS_METADATA) as ChessPieceSet[];
    const current = appSettings.chessPieceSet ?? 'staunton';
    const next = keys[(keys.indexOf(current) + 1) % keys.length];
    updateSettings('chessPieceSet', next);
  }, [appSettings.chessPieceSet, updateSettings]);

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

  /**
   * Right-drag toggles an arrow; drawing over one in a different colour
   * recolours it rather than making the author erase and redraw.
   */
  const handleArrowDraw = useCallback(
    (arrow: ChessArrow) => {
      if (readonly) return;
      const color = ANNOTATION_COLORS[inkColor];
      const current = model.props.arrows ?? [];
      const existing = current.findIndex(
        item => item.from === arrow.from && item.to === arrow.to
      );
      model.store.captureSync();
      model.store.updateBlock(model, {
        arrows:
          existing === -1
            ? [...current, { from: arrow.from, to: arrow.to, color }]
            : current[existing].color === color
              ? current.filter((_, index) => index !== existing)
              : current.map((item, index) =>
                  index === existing ? { ...item, color } : item
                ),
      });
    },
    [inkColor, model, readonly]
  );

  /** Clicking a square while annotating tints it, in the same three states. */
  const handleHighlightToggle = useCallback(
    (square: SquareName) => {
      if (readonly) return;
      const color = ANNOTATION_COLORS[inkColor];
      const current = model.props.highlights ?? [];
      const existing = current.findIndex(item => item.square === square);
      model.store.captureSync();
      model.store.updateBlock(model, {
        highlights:
          existing === -1
            ? [...current, { square, color }]
            : current[existing].color === color
              ? current.filter((_, index) => index !== existing)
              : current.map((item, index) =>
                  index === existing ? { ...item, color } : item
                ),
      });
    },
    [inkColor, model, readonly]
  );

  const clearAnnotations = useCallback(() => {
    if (readonly) return;
    model.store.captureSync();
    model.store.updateBlock(model, { arrows: [], highlights: [] });
  }, [model, readonly]);

  const toggleAnnotating = useCallback(() => {
    setAnnotating(current => !current);
    // A piece picked up before switching modes would otherwise stay lit with
    // no way to put it down.
    setSelected(null);
  }, []);

  const editing = draft !== null;
  const draftValue = draft ?? fen;
  /** Annotation mode only applies to the live board, never to the draft. */
  const annotatingNow = annotating && !editing && !readonly;

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

  const mergedArrows = useMemo(
    () => [...(arrows ?? []), ...(engineArrow ? [engineArrow] : [])],
    [arrows, engineArrow]
  );

  useEffect(() => {
    if (!live || !isActive) return;
    requestAnalyze(editing ? draftValue : fen);
  }, [isActive, live, requestAnalyze, draftValue, editing, fen]);

  const openEditor = useCallback(() => {
    setDraft(fen);
    setTool('hand');
  }, [fen]);

  return (
    // tabIndex mirrors the game view: a click into the board must focus the
    // container, so the paste watcher can tell "a FEN pasted onto this board"
    // from "a FEN pasted into the document" and replace the position in place.
    <div
      className={styles.container}
      tabIndex={0}
      onPointerDown={activate}
      onFocusCapture={activate}
    >
      <div className={gameStyles.boardWithEval}>
        {available && (lastInfo || live) && position && (
          <EvalBar
            score={lastInfo?.score ?? { type: 'cp', value: 0 }}
            turn={position.turn}
            orientation={orientation}
          />
        )}
        <MemoChessboard
          fen={editing ? draftValue : fen}
          orientation={orientation}
          pieceSet={pieceSet}
          // Annotating freezes the pieces: one click cannot both tint a square
          // and pick up whatever stands on it.
          interactive={
            editing ? !readonly : annotatingNow ? false : interactive
          }
          annotatable={annotatingNow}
          selected={editing || annotatingNow ? null : selected}
          onSelect={editing ? noop : setSelected}
          legalDestinations={editing || annotatingNow ? [] : destinations}
          check={editing ? undefined : checkSquare}
          arrows={mergedArrows}
          highlights={highlights}
          onMove={editing ? handleSetupMove : handleMove}
          onSquareClick={
            editing
              ? handleSetupSquare
              : annotatingNow
                ? handleHighlightToggle
                : undefined
          }
          onArrowDraw={handleArrowDraw}
        />
      </div>
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
          <button
            className={clsx(
              gameStyles.controlButton,
              annotating && gameStyles.currentMove
            )}
            onClick={toggleAnnotating}
            title="Tô ô bằng cách bấm, vẽ mũi tên bằng cách kéo chuột phải"
            data-testid="chess-annotate-toggle"
          >
            {annotating ? 'Chú thích: Bật' : 'Chú thích: Tắt'}
          </button>
          <button
            className={gameStyles.controlButton}
            onClick={cyclePieceSet}
            title={`Đổi bộ quân cờ (Hiện tại: ${PIECE_SETS_METADATA[pieceSet].name})`}
            data-testid="chess-piece-set-toggle"
          >
            {`Quân: ${PIECE_SETS_METADATA[pieceSet].name}`}
          </button>
          <button
            className={clsx(
              gameStyles.controlButton,
              live && isActive && gameStyles.currentMove
            )}
            data-testid="chess-board-analyze"
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
            className={gameStyles.controlButton}
            data-testid="chess-add-review"
            title={I18n.t('com.affine.chess.review.add')}
            onClick={() => {
              review?.add({
                fen,
                sourceDocId: model.store.id,
                sourceBlockId: model.id,
              });
            }}
          >
            {I18n.t('com.affine.chess.review.add')}
          </button>
          <button
            className={gameStyles.controlButton}
            data-testid="chess-board-stop"
            disabled={
              !isActive || (status !== 'thinking' && status !== 'scanning')
            }
            onClick={stop}
          >
            {I18n.t('com.affine.chess.engine.stop')}
          </button>
          {lastInfo && position && (
            <span className={gameStyles.header}>
              {formatScore(lastInfo.score, position.turn)}
            </span>
          )}
        </div>
      )}
      {/* The colours are the four the Obsidian plugin can name, so a lesson
          drawn here goes back out intact — see obsidian-fence.ts. */}
      {!readonly && !editing && annotating && (
        <div
          className={clsx(styles.setupRow, styles.belowBoard)}
          data-chess-board-controls="true"
        >
          {ANNOTATION_CHOICES.map(({ key, label }) => (
            <button
              key={key}
              className={clsx(
                gameStyles.controlButton,
                styles.colorSwatch,
                inkColor === key && gameStyles.currentMove
              )}
              style={
                { '--chess-swatch': ANNOTATION_COLORS[key] } as CSSProperties
              }
              onClick={() => setInkColor(key)}
              title={label}
              aria-label={label}
              data-testid={`chess-annotate-color-${key}`}
            />
          ))}
          <button
            className={gameStyles.controlButton}
            onClick={clearAnnotations}
            title="Xoá mọi mũi tên và ô đã tô trên bàn cờ này"
            data-testid="chess-annotate-clear"
          >
            Xoá chú thích
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
