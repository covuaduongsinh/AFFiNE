import { BOARD_SIZE } from '@affine/component/ui/chess';
import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const wrap = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
  flex: '0 0 18px',
});

export const bar = style({
  width: 14,
  height: BOARD_SIZE,
  borderRadius: 3,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
});

export const black = style({
  backgroundColor: cssVarV2('text/primary'),
  minHeight: 0,
});

export const white = style({
  // Must not be the page background: a 0.00 bar is half white, and that
  // half would vanish against `layer/background/primary`.
  backgroundColor: cssVarV2('layer/background/secondary'),
  minHeight: 0,
});

export const label = style({
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/secondary'),
  fontVariantNumeric: 'tabular-nums',
  writingMode: 'horizontal-tb',
});
