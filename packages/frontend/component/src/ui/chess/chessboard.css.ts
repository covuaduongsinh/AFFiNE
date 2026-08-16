import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

/**
 * Board palette.
 *
 * Square and piece colours are deliberately *not* app theme tokens — a chess
 * board has its own visual language and must stay readable on any surface.
 * They are plain custom properties so a caller (or a future per-user board
 * theme) can override one without restyling the component, and so the piece
 * SVGs in `pieces.tsx` can pick up the colours through `var()`.
 */
export const board = style({
  vars: {
    '--chess-square-light': '#f2e6d0',
    '--chess-square-dark': '#b58863',
    '--chess-piece-light': '#ffffff',
    '--chess-piece-dark': '#2b2724',
    '--chess-last-move': 'rgba(255, 206, 0, 0.42)',
    '--chess-selected': 'rgba(20, 122, 255, 0.45)',
    '--chess-check': 'rgba(219, 40, 40, 0.55)',
    '--chess-arrow': 'rgba(21, 128, 61, 0.72)',
    '--chess-hint': 'rgba(0, 0, 0, 0.2)',
  },
  position: 'relative',
  aspectRatio: '1 / 1',
  width: '100%',
  display: 'grid',
  gridTemplateColumns: 'repeat(8, 1fr)',
  gridTemplateRows: 'repeat(8, 1fr)',
  borderRadius: 4,
  overflow: 'hidden',
  userSelect: 'none',
  touchAction: 'manipulation',
  selectors: {
    '[data-theme="dark"] &': {
      vars: {
        '--chess-square-light': '#7d7266',
        '--chess-square-dark': '#4b423a',
        '--chess-piece-light': '#eceae7',
        '--chess-piece-dark': '#16130f',
        '--chess-hint': 'rgba(0, 0, 0, 0.34)',
      },
    },
  },
});

export const square = style({
  position: 'relative',
  width: '100%',
  height: '100%',
});

export const light = style({ backgroundColor: 'var(--chess-square-light)' });
export const dark = style({ backgroundColor: 'var(--chess-square-dark)' });

export const interactive = style({ cursor: 'pointer' });

/** Tints stack as separate absolutely-positioned layers. */
const overlay = style({
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
});

export const lastMoveOverlay = style([
  overlay,
  { backgroundColor: 'var(--chess-last-move)' },
]);

export const selectedOverlay = style([
  overlay,
  { backgroundColor: 'var(--chess-selected)' },
]);

export const checkOverlay = style([
  overlay,
  {
    background:
      'radial-gradient(circle at center, var(--chess-check) 0%, var(--chess-check) 32%, transparent 72%)',
  },
]);

export const customOverlay = overlay;

/** A dot marks an empty destination. */
export const moveHint = style([
  overlay,
  {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    selectors: {
      '&::after': {
        content: '""',
        width: '30%',
        height: '30%',
        borderRadius: '50%',
        backgroundColor: 'var(--chess-hint)',
      },
    },
  },
]);

/** A ring marks a destination that would capture, so the piece stays visible. */
export const captureHint = style([
  overlay,
  {
    borderRadius: '50%',
    boxShadow: 'inset 0 0 0 5px var(--chess-hint)',
  },
]);

export const pieceLayer = style({
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  zIndex: 2,
});

export const piece = style({
  position: 'absolute',
  width: '12.5%',
  height: '12.5%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'left 120ms ease-out, top 120ms ease-out',
});

export const dragging = style({
  transition: 'none',
  zIndex: 3,
  filter: 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.35))',
});

export const arrowLayer = style({
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  zIndex: 4,
});

const coordinate = style({
  position: 'absolute',
  // Sized against the board, not the viewport, so a small inline board still reads.
  fontSize: 'clamp(7px, 2.2cqi, 13px)',
  fontWeight: 600,
  lineHeight: 1,
  opacity: 0.75,
  pointerEvents: 'none',
});

export const fileCoordinate = style([
  coordinate,
  { right: '5%', bottom: '4%' },
]);

export const rankCoordinate = style([coordinate, { left: '5%', top: '4%' }]);

/** Coordinates take the opposite square colour so they stay readable. */
export const onLightSquare = style({ color: 'var(--chess-square-dark)' });
export const onDarkSquare = style({ color: 'var(--chess-square-light)' });

export const wrapper = style({
  containerType: 'inline-size',
  width: '100%',
  color: cssVarV2('text/primary'),
});
