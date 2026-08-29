import { BOARD_SIZE } from '@affine/component/ui/chess';
import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

import { touchHeight, touchTarget, touchTypeSize } from './touch.css';

export const container = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'stretch',
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
  maxWidth: BOARD_SIZE + 28,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
});

export const boardWithEval = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'flex-start',
  gap: 6,
});

export const sideColumn = style({
  flex: '1 1 260px',
  minWidth: 240,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  // Cap at the board+controls height when the columns sit side by side so
  // Analyze stays on screen with the pieces. No min-height: a short game
  // must not leave a blank band above the tools.
  maxHeight: BOARD_SIZE + 40,
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

export const controlButton = style([
  touchTarget,
  {
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
  },
]);

export const moveList = style({
  flex: '1 1 auto',
  minHeight: 0,
  overflowY: 'auto',
  fontSize: cssVar('fontSm'),
  lineHeight: 1.75,
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

export const evalGlyph = style({
  display: 'inline-block',
  fontStyle: 'normal',
  fontSize: cssVar('fontXs'),
  fontVariantNumeric: 'tabular-nums',
  color: cssVarV2('text/secondary'),
  margin: '0 2px',
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
  lineHeight: 1.6,
});

export const error = style({
  color: cssVarV2('status/error'),
  fontSize: cssVar('fontXs'),
});

/**
 * The PGN editor spans the whole block.
 *
 * The container wraps, so a 100% basis puts this on its own row underneath the
 * board and the move list — PGN carries multi-line headers and needs the width.
 */
export const editor = style({
  flexBasis: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  paddingTop: 12,
  borderTop: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
});

export const editorTextarea = style([
  touchTypeSize,
  {
    width: '100%',
    minHeight: 140,
    resize: 'vertical',
    padding: 8,
    borderRadius: 4,
    border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
    backgroundColor: cssVarV2('layer/background/primary'),
    color: cssVarV2('text/primary'),
    fontFamily: cssVar('fontCodeFamily'),
    fontSize: cssVar('fontXs'),
    lineHeight: 1.6,
    selectors: {
      '&:focus': {
        outline: 'none',
        borderColor: cssVarV2('layer/insideBorder/primaryBorder'),
      },
    },
  },
]);

export const editorFooter = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
});

export const editorStatus = style({
  flex: 1,
  minWidth: 160,
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/secondary'),
});

export const primaryButton = style([
  touchTarget,
  {
    border: 'none',
    borderRadius: 4,
    height: 28,
    padding: '0 12px',
    cursor: 'pointer',
    fontSize: cssVar('fontSm'),
    backgroundColor: cssVarV2('button/primary'),
    color: cssVarV2('button/pureWhiteText'),
    selectors: {
      '&:disabled': {
        opacity: 0.4,
        cursor: 'default',
      },
    },
  },
]);

/** Annotation tools for whichever move is currently selected. */
export const annotations = style({
  display: 'flex',
  flexDirection: 'column',
  flexShrink: 0,
  gap: 6,
  paddingTop: 8,
  borderTop: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
});

export const nagRow = style({
  display: 'flex',
  gap: 4,
  flexWrap: 'wrap',
  alignItems: 'center',
});

export const nagButton = style([
  touchTarget,
  {
    minWidth: 30,
    height: 26,
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: cssVar('fontSm'),
    fontWeight: 600,
    border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
    background: 'transparent',
    color: cssVarV2('text/primary'),
    selectors: {
      '&:hover': { backgroundColor: cssVarV2('layer/background/hoverOverlay') },
    },
  },
]);

export const nagButtonActive = style({
  backgroundColor: cssVarV2('layer/background/hoverOverlay'),
  borderColor: cssVarV2('layer/insideBorder/primaryBorder'),
});

export const commentInput = style([
  touchTypeSize,
  touchHeight,
  {
    width: '100%',
    height: 28,
    padding: '0 8px',
    borderRadius: 4,
    border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
    backgroundColor: cssVarV2('layer/background/primary'),
    color: cssVarV2('text/primary'),
    fontSize: cssVar('fontXs'),
    selectors: {
      '&:focus': {
        outline: 'none',
        borderColor: cssVarV2('layer/insideBorder/primaryBorder'),
      },
    },
  },
]);

export const dangerButton = style({
  color: cssVarV2('status/error'),
});

export const analysis = style({
  display: 'flex',
  flexDirection: 'column',
  flexShrink: 0,
  gap: 6,
  paddingTop: 8,
  borderTop: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/secondary'),
});

export const analysisRow = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: 4,
  alignItems: 'center',
});

export const analysisPv = style({
  fontVariantNumeric: 'tabular-nums',
  color: cssVarV2('text/primary'),
  wordBreak: 'break-word',
  maxHeight: '4.4em',
  overflowY: 'auto',
});

export const progress = style({
  height: 4,
  borderRadius: 2,
  backgroundColor: cssVarV2('layer/insideBorder/border'),
  overflow: 'hidden',
});

export const progressFill = style({
  height: '100%',
  backgroundColor: cssVarV2('button/primary'),
});

export const moveInaccuracy = style({
  color: cssVarV2('status/warning'),
});

export const moveMistake = style({
  color: '#d97706',
});

export const moveBlunder = style({
  color: cssVarV2('status/error'),
  fontWeight: 600,
});
