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

export const hint = style({
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/secondary'),
  wordBreak: 'break-all',
});

export const messages = style({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
});

export const message = style({
  fontSize: cssVar('fontSm'),
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  color: cssVarV2('text/primary'),
});

export const role = style({
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/secondary'),
  marginBottom: 2,
});

export const row = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  alignItems: 'center',
});

export const select = style({
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  background: 'transparent',
  color: cssVarV2('text/primary'),
  borderRadius: 4,
  padding: '4px 6px',
  fontSize: cssVar('fontXs'),
});

export const secret = style({
  flex: 1,
  minWidth: 120,
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  background: 'transparent',
  color: cssVarV2('text/primary'),
  borderRadius: 4,
  padding: '4px 6px',
  fontSize: cssVar('fontXs'),
});

export const composer = style({
  display: 'flex',
  gap: 6,
});

export const input = style({
  flex: 1,
  minHeight: 56,
  resize: 'vertical',
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  borderRadius: 4,
  padding: 8,
  background: 'transparent',
  color: cssVarV2('text/primary'),
  fontSize: cssVar('fontSm'),
});

export const button = style({
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  background: 'transparent',
  color: cssVarV2('text/primary'),
  borderRadius: 4,
  padding: '4px 8px',
  cursor: 'pointer',
  fontSize: cssVar('fontSm'),
  alignSelf: 'flex-end',
  selectors: {
    '&:disabled': {
      opacity: 0.4,
      cursor: 'default',
    },
  },
});
