import type { Meta, StoryObj } from '@storybook/react';
import { useCallback, useState } from 'react';

import { type ChessArrow, Chessboard } from './chessboard';

const meta: Meta<typeof Chessboard> = {
  title: 'UI/Chessboard',
  component: Chessboard,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div style={{ width: 420 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Chessboard>;

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const StartingPosition: Story = {
  args: { fen: START },
};

export const Flipped: Story = {
  args: { fen: START, orientation: 'black' },
};

export const WithoutCoordinates: Story = {
  args: { fen: START, coordinates: false },
};

export const Annotated: Story = {
  args: {
    fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
    lastMove: { from: 'f1', to: 'c4' },
    arrows: [
      { from: 'c4', to: 'f7' },
      { from: 'f3', to: 'e5', color: 'rgba(190, 40, 40, 0.72)' },
    ],
    highlights: [{ square: 'f7', color: 'rgba(255, 120, 0, 0.35)' }],
  },
};

export const InCheck: Story = {
  args: {
    fen: 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3',
    check: 'e1',
    lastMove: { from: 'd8', to: 'h4' },
  },
};

export const SmallInline: Story = {
  args: { fen: START },
  decorators: [
    Story => (
      <div style={{ width: 140 }}>
        <Story />
      </div>
    ),
  ],
};

/**
 * Exercises selection, drag and the arrow gesture. There is no rules engine
 * wired in here — the destination list is fixed, and moves just relocate a
 * piece — because the board deliberately knows nothing about legality.
 */
const InteractiveDemo = () => {
  const [fen, setFen] = useState(START);
  const [selected, setSelected] = useState<string | null>(null);
  const [arrows, setArrows] = useState<ChessArrow[]>([]);

  const handleArrow = useCallback((arrow: ChessArrow) => {
    setArrows(current => {
      const existing = current.findIndex(
        a => a.from === arrow.from && a.to === arrow.to
      );
      return existing === -1
        ? [...current, arrow]
        : current.filter((_, i) => i !== existing);
    });
  }, []);

  const handleMove = useCallback((from: string, to: string) => {
    setFen(current => {
      const [placement, ...rest] = current.split(' ');
      const rows = placement.split('/').map(expandRank);
      const fileOf = (sq: string) => sq.charCodeAt(0) - 97;
      const rowOf = (sq: string) => 8 - Number.parseInt(sq.slice(1), 10);
      const moving = rows[rowOf(from)][fileOf(from)];
      if (!moving) return current;
      rows[rowOf(from)][fileOf(from)] = '';
      rows[rowOf(to)][fileOf(to)] = moving;
      return [rows.map(collapseRank).join('/'), ...rest].join(' ');
    });
    setSelected(null);
  }, []);

  return (
    <Chessboard
      fen={fen}
      interactive
      selected={selected}
      onSelect={setSelected}
      legalDestinations={
        selected ? ['e4', 'e5', 'd4', 'd5', 'f3', 'c3', 'c6', 'f6'] : []
      }
      arrows={arrows}
      onArrowDraw={handleArrow}
      onMove={handleMove}
    />
  );
};

export const Interactive: Story = {
  render: () => <InteractiveDemo />,
};

function expandRank(rank: string): string[] {
  const cells: string[] = [];
  for (const ch of rank) {
    if (ch >= '1' && ch <= '8') {
      for (let i = ch.charCodeAt(0) - 48; i > 0; i--) cells.push('');
    } else {
      cells.push(ch);
    }
  }
  return cells;
}

function collapseRank(cells: string[]): string {
  let out = '';
  let empty = 0;
  for (const cell of cells) {
    if (cell === '') {
      empty++;
      continue;
    }
    if (empty > 0) {
      out += empty;
      empty = 0;
    }
    out += cell;
  }
  return empty > 0 ? out + empty : out;
}
