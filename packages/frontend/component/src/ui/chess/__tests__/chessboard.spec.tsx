/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { Chessboard } from '../chessboard';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** The board is a plain grid, so a square's rect is derivable from the board's. */
function stubBoardRect(container: HTMLElement, size = 800) {
  const board = container.querySelector('[role="grid"]') as HTMLElement;
  board.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: size,
      height: size,
      right: size,
      bottom: size,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  return board;
}

/** Client point at the centre of a square, for the default white orientation. */
function pointOf(square: string, size = 800) {
  const file = square.charCodeAt(0) - 97;
  const rank = Number.parseInt(square.slice(1), 10) - 1;
  const cell = size / 8;
  return {
    clientX: file * cell + cell / 2,
    clientY: (7 - rank) * cell + cell / 2,
  };
}

describe('Chessboard rendering', () => {
  test('draws 64 squares and 32 pieces from the starting FEN', () => {
    const { container } = render(<Chessboard fen={START} />);
    expect(container.querySelectorAll('[role="gridcell"]')).toHaveLength(64);
    expect(container.querySelectorAll('[data-piece]')).toHaveLength(32);
  });

  test('places each piece on the square its FEN field names', () => {
    const { container } = render(<Chessboard fen={START} />);
    const at = (square: string) =>
      container.querySelector<HTMLElement>(
        `[data-piece][data-square="${square}"]`
      )?.dataset.piece;

    expect(at('a1')).toBe('R');
    expect(at('e1')).toBe('K');
    expect(at('d8')).toBe('q');
    expect(at('h7')).toBe('p');
    expect(at('e4')).toBeUndefined();
  });

  test('reads a placement-only string as well as a full FEN', () => {
    const { container } = render(<Chessboard fen="8/8/8/4k3/8/8/8/4K3" />);
    expect(container.querySelectorAll('[data-piece]')).toHaveLength(2);
    expect(
      container.querySelector<HTMLElement>('[data-piece][data-square="e5"]')
        ?.dataset.piece
    ).toBe('k');
  });

  test('flipping the board moves a8 to the opposite corner', () => {
    const white = render(<Chessboard fen={START} />);
    const black = render(<Chessboard fen={START} orientation="black" />);

    const firstCell = (result: ReturnType<typeof render>) =>
      result.container.querySelector<HTMLElement>('[role="gridcell"]')?.dataset
        .square;

    expect(firstCell(white)).toBe('a8');
    expect(firstCell(black)).toBe('h1');
  });

  test('renders overlays for last move, check and custom highlights', () => {
    const { container } = render(
      <Chessboard
        fen={START}
        lastMove={{ from: 'e2', to: 'e4' }}
        check="e1"
        highlights={[{ square: 'd5', color: 'red' }]}
      />
    );

    const cell = (square: string) =>
      container.querySelector(`[role="gridcell"][data-square="${square}"]`);

    expect(cell('e2')?.children.length).toBeGreaterThan(0);
    expect(cell('e4')?.children.length).toBeGreaterThan(0);
    expect(cell('e1')?.children.length).toBeGreaterThan(0);
    expect(cell('d5')?.querySelector('[style*="red"]')).not.toBeNull();
    expect(cell('h6')?.children.length).toBe(0);
  });

  test('draws one line per arrow', () => {
    const { container } = render(
      <Chessboard
        fen={START}
        arrows={[
          { from: 'e2', to: 'e4' },
          { from: 'g1', to: 'f3' },
        ]}
      />
    );
    expect(container.querySelectorAll('svg line')).toHaveLength(2);
  });

  test('omits coordinates when asked', () => {
    const withCoords = render(<Chessboard fen={START} />);
    const without = render(<Chessboard fen={START} coordinates={false} />);
    // 8 files + 8 ranks along two edges.
    expect(withCoords.container.querySelectorAll('span')).toHaveLength(16);
    expect(without.container.querySelectorAll('span')).toHaveLength(0);
  });
});

describe('Chessboard interaction', () => {
  test('ignores pointer input when not interactive', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <Chessboard fen={START} onSelect={onSelect} />
    );
    const board = stubBoardRect(container);

    fireEvent.pointerDown(board, { button: 0, ...pointOf('e2') });
    expect(onSelect).not.toHaveBeenCalled();
  });

  test('selects the piece under the pointer', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <Chessboard fen={START} interactive onSelect={onSelect} />
    );
    const board = stubBoardRect(container);

    fireEvent.pointerDown(board, { button: 0, ...pointOf('e2') });
    expect(onSelect).toHaveBeenCalledWith('e2');
  });

  test('clears the selection when an empty square is pressed', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <Chessboard fen={START} interactive onSelect={onSelect} />
    );
    const board = stubBoardRect(container);

    fireEvent.pointerDown(board, { button: 0, ...pointOf('e4') });
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  test('click-then-click on a marked destination emits a move', () => {
    const onMove = vi.fn();
    const { container } = render(
      <Chessboard
        fen={START}
        interactive
        selected="e2"
        legalDestinations={['e3', 'e4']}
        onMove={onMove}
      />
    );
    const board = stubBoardRect(container);

    fireEvent.pointerDown(board, { button: 0, ...pointOf('e4') });
    expect(onMove).toHaveBeenCalledWith('e2', 'e4');
  });

  test('does not emit a move onto an unmarked square', () => {
    const onMove = vi.fn();
    const { container } = render(
      <Chessboard
        fen={START}
        interactive
        selected="e2"
        legalDestinations={['e3']}
        onMove={onMove}
      />
    );
    const board = stubBoardRect(container);

    fireEvent.pointerDown(board, { button: 0, ...pointOf('e5') });
    expect(onMove).not.toHaveBeenCalled();
  });

  test('dragging from one square to another emits a move', () => {
    const onMove = vi.fn();
    const { container } = render(
      <Chessboard fen={START} interactive onMove={onMove} />
    );
    const board = stubBoardRect(container);
    board.setPointerCapture = vi.fn();

    fireEvent.pointerDown(board, { button: 0, pointerId: 1, ...pointOf('g1') });
    fireEvent.pointerMove(board, { pointerId: 1, ...pointOf('f3') });
    fireEvent.pointerUp(board, { pointerId: 1, ...pointOf('f3') });

    expect(onMove).toHaveBeenCalledWith('g1', 'f3');
  });

  test('releasing on the origin square is a selection, not a move', () => {
    const onMove = vi.fn();
    const { container } = render(
      <Chessboard fen={START} interactive onMove={onMove} />
    );
    const board = stubBoardRect(container);
    board.setPointerCapture = vi.fn();

    fireEvent.pointerDown(board, { button: 0, pointerId: 1, ...pointOf('g1') });
    fireEvent.pointerUp(board, { pointerId: 1, ...pointOf('g1') });

    expect(onMove).not.toHaveBeenCalled();
  });

  test('right-drag reports an arrow instead of a move', () => {
    const onArrowDraw = vi.fn();
    const onMove = vi.fn();
    const { container } = render(
      <Chessboard
        fen={START}
        interactive
        onArrowDraw={onArrowDraw}
        onMove={onMove}
      />
    );
    const board = stubBoardRect(container);

    fireEvent.pointerDown(board, { button: 2, pointerId: 2, ...pointOf('d2') });
    fireEvent.pointerUp(board, { pointerId: 2, ...pointOf('d4') });

    expect(onArrowDraw).toHaveBeenCalledWith({ from: 'd2', to: 'd4' });
    expect(onMove).not.toHaveBeenCalled();
  });

  test('maps pointer coordinates through a flipped board', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <Chessboard
        fen={START}
        orientation="black"
        interactive
        onSelect={onSelect}
      />
    );
    const board = stubBoardRect(container);

    // Top-left of a flipped board is h1, which holds the white rook.
    fireEvent.pointerDown(board, { button: 0, clientX: 50, clientY: 50 });
    expect(onSelect).toHaveBeenCalledWith('h1');
  });
});
