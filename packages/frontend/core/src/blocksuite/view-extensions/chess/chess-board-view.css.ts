import { BOARD_SIZE } from '@affine/component/ui/chess';
import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const container = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
});

/**
 * The board caps itself at BOARD_SIZE and centres; the rows under it carry the
 * same constraint so the controls line up with the board's edges rather than
 * the block's.
 */
export const belowBoard = style({
  width: '100%',
  maxWidth: BOARD_SIZE,
  margin: '0 auto',
});

/**
 * The piece SVGs read their colours through custom properties that the board
 * component declares on itself — a palette rendered outside the board must
 * re-declare them (same values, including the dark override) or the pieces
 * come out unpainted.
 */
export const paletteRow = style({
  vars: {
    '--chess-piece-light': '#ffffff',
    '--chess-piece-dark': '#2b2724',
  },
  display: 'flex',
  flexWrap: 'wrap',
  gap: 4,
  alignItems: 'center',
  selectors: {
    '[data-theme="dark"] &': {
      vars: {
        '--chess-piece-light': '#eceae7',
        '--chess-piece-dark': '#16130f',
      },
    },
  },
});

export const paletteButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 2,
});

export const pieceBox = style({
  display: 'block',
  width: 22,
  height: 22,
});

export const setupRow = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  alignItems: 'center',
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/secondary'),
});

/**
 * A colour swatch paints itself, so it carries no label — its accessible name
 * comes from `title`/`aria-label` on the button.
 */
export const colorSwatch = style({
  minWidth: 24,
  width: 24,
  padding: 0,
  selectors: {
    '&::after': {
      content: '""',
      display: 'block',
      width: 14,
      height: 14,
      margin: '0 auto',
      borderRadius: 3,
      backgroundColor: 'var(--chess-swatch)',
    },
  },
});

export const castleLabel = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  cursor: 'pointer',
  userSelect: 'none',
});

/**
 * The app's global stylesheet strips native appearance from every `input`
 * (theme/global.css), which leaves a bare checkbox with nothing to draw —
 * invisible. Restore it explicitly.
 */
export const castleCheckbox = style({
  appearance: 'auto',
  WebkitAppearance: 'checkbox',
  width: 14,
  height: 14,
  margin: 0,
  accentColor: cssVarV2('button/primary'),
  cursor: 'pointer',
});

export const fenInput = style({
  width: '100%',
  padding: '6px 8px',
  borderRadius: 4,
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  backgroundColor: cssVarV2('layer/background/primary'),
  color: cssVarV2('text/primary'),
  fontFamily: cssVar('fontCodeFamily'),
  fontSize: cssVar('fontXs'),
  selectors: {
    '&:focus': {
      outline: 'none',
      borderColor: cssVarV2('layer/insideBorder/primaryBorder'),
    },
  },
});
