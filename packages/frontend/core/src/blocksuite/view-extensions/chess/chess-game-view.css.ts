import { BOARD_SIZE } from '@affine/component/ui/chess';
import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const container = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: 16,
  padding: 16,
  backgroundColor: cssVarV2('layer/background/primary'),
});

/*
 * The board column is pinned to the standard board size so a position looks
 * the same here as it does standing alone in the document. When the note is too
 * narrow to seat the move list beside it, the flex container wraps and the list
 * moves underneath rather than squeezing the board.
 */
export const boardColumn = style({
  flex: `1 1 ${BOARD_SIZE}px`,
  minWidth: 240,
  maxWidth: BOARD_SIZE,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
});

export const sideColumn = style({
  flex: '1 1 260px',
  minWidth: 220,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  // Long games must scroll inside the block rather than stretch the document.
  maxHeight: 420,
});

export const header = style({
  fontSize: cssVar('fontSm'),
  color: cssVarV2('text/secondary'),
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  alignItems: 'baseline',
});

export const players = style({
  fontWeight: 600,
  color: cssVarV2('text/primary'),
});

export const controls = style({
  display: 'flex',
  gap: 4,
  alignItems: 'center',
});

export const controlButton = style({
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  background: 'transparent',
  color: cssVarV2('text/primary'),
  borderRadius: 4,
  minWidth: 32,
  height: 28,
  cursor: 'pointer',
  fontSize: cssVar('fontSm'),
  lineHeight: 1,
  selectors: {
    '&:hover:not(:disabled)': {
      backgroundColor: cssVarV2('layer/background/hoverOverlay'),
    },
    '&:disabled': {
      opacity: 0.4,
      cursor: 'default',
    },
  },
});

export const moveList = style({
  flex: 1,
  overflowY: 'auto',
  fontSize: cssVar('fontSm'),
  lineHeight: 1.7,
  color: cssVarV2('text/primary'),
  wordBreak: 'break-word',
});

export const moveNumber = style({
  color: cssVarV2('text/secondary'),
  marginRight: 2,
  userSelect: 'none',
});

export const move = style({
  display: 'inline-block',
  padding: '0 4px',
  borderRadius: 3,
  cursor: 'pointer',
  fontVariantNumeric: 'tabular-nums',
  selectors: {
    '&:hover': {
      backgroundColor: cssVarV2('layer/background/hoverOverlay'),
    },
  },
});

export const currentMove = style({
  backgroundColor: cssVarV2('layer/background/hoverOverlay'),
  fontWeight: 700,
  outline: `1px solid ${cssVarV2('layer/insideBorder/primaryBorder')}`,
});

export const comment = style({
  color: cssVarV2('text/secondary'),
  fontStyle: 'italic',
  margin: '0 4px',
});

export const variation = style({
  display: 'block',
  marginLeft: 12,
  paddingLeft: 8,
  borderLeft: `2px solid ${cssVarV2('layer/insideBorder/border')}`,
  color: cssVarV2('text/secondary'),
  fontSize: cssVar('fontXs'),
});

export const empty = style({
  color: cssVarV2('text/placeholder'),
  fontStyle: 'italic',
});

export const error = style({
  padding: 16,
  color: cssVarV2('status/error'),
  fontSize: cssVar('fontSm'),
});
