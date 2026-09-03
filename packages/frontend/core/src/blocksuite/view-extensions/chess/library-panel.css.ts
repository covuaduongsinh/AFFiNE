import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const root = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  minHeight: 0,
  padding: 12,
  gap: 8,
});

export const title = style({
  fontSize: cssVar('fontSm'),
  fontWeight: 600,
  color: cssVarV2('text/primary'),
});

export const tabs = style({
  display: 'flex',
  gap: 4,
  flexWrap: 'wrap',
});

export const tab = style({
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  background: 'transparent',
  borderRadius: 6,
  padding: '4px 8px',
  fontSize: cssVar('fontXs'),
  cursor: 'pointer',
  color: cssVarV2('text/secondary'),
});

export const tabActive = style({
  color: cssVarV2('text/primary'),
  background: cssVarV2('layer/background/hoverOverlay'),
});

export const row = style({
  display: 'flex',
  gap: 6,
  flexWrap: 'wrap',
  alignItems: 'center',
});

export const input = style({
  flex: 1,
  minWidth: 80,
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  borderRadius: 6,
  padding: '4px 8px',
  fontSize: cssVar('fontXs'),
});

export const button = style({
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  background: cssVarV2('button/secondary'),
  borderRadius: 6,
  padding: '4px 8px',
  fontSize: cssVar('fontXs'),
  cursor: 'pointer',
});

export const table = style({
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
  fontSize: cssVar('fontXs'),
});

export const tableRow = style({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr 1fr auto auto auto',
  gap: 6,
  padding: '6px 0',
  borderBottom: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  cursor: 'pointer',
});

export const empty = style({
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/secondary'),
});

export const boardWrap = style({
  width: '100%',
  maxWidth: 280,
});
