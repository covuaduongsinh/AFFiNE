import { type ChessArrow, Chessboard } from '@affine/component/ui/chess';
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
  parseFen,
  squareToAlgebraic,
  toFen,
} from '@blocksuite/chess-core';
import { useCallback, useMemo, useState } from 'react';

export interface ChessBoardViewProps {
  model: ChessBoardBlockModel;
}

/**
 * Bridges the block model to the presentational board.
 *
 * This is where the chess rules live: the board component knows nothing about
 * legality, so this view derives the legal destinations, resolves a from/to
 * pair into a real move, and writes the resulting FEN back to the document.
 * The FEN on the model stays the single source of truth.
 */
export const ChessBoardView = ({ model }: ChessBoardViewProps) => {
  const fen = useSignalValue(model.props.fen$);
  const orientation = useSignalValue(model.props.orientation$);
  const editable = useSignalValue(model.props.editable$);
  const arrows = useSignalValue(model.props.arrows$);
  const highlights = useSignalValue(model.props.highlights$);

  const [selected, setSelected] = useState<string | null>(null);

  const readonly = model.store.readonly;
  const interactive = editable && !readonly;

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
      model.store.updateBlock(model, {
        arrows:
          existing === -1
            ? [...current, { from: arrow.from, to: arrow.to }]
            : current.filter((_, index) => index !== existing),
      });
    },
    [model, readonly]
  );

  return (
    <Chessboard
      fen={fen}
      orientation={orientation}
      interactive={interactive}
      selected={selected}
      onSelect={setSelected}
      legalDestinations={destinations}
      check={checkSquare}
      arrows={arrows}
      highlights={highlights}
      onMove={handleMove}
      onArrowDraw={handleArrowDraw}
    />
  );
};
