import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const root = style({
  width: '100%',
  height: '36px',
  minHeight: '36px',
  display: 'flex',
  alignItems: 'center',
  flexDirection: 'row',
  gap: '4px',
  padding: '0 8px',
  borderBottom: `1px solid ${cssVar('borderColor')}`,
  backgroundColor: cssVar('backgroundSecondaryColor'),
  userSelect: 'none',
  zIndex: 1,
});

export const tabsList = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '4px',
  overflowX: 'auto',
  overflowY: 'hidden',
  height: '100%',
  flex: 1,
  scrollbarWidth: 'none',
  selectors: {
    '&::-webkit-scrollbar': {
      display: 'none',
    },
  },
});

export const tab = style({
  height: '28px',
  minWidth: '80px',
  maxWidth: '200px',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '0 8px',
  borderRadius: '6px',
  color: cssVar('textSecondaryColor'),
  backgroundColor: 'transparent',
  cursor: 'pointer',
  fontSize: '12px',
  lineHeight: '16px',
  position: 'relative',
  transition: 'background-color 0.15s, color 0.15s',
  selectors: {
    '&:hover': {
      backgroundColor: cssVar('hoverColor'),
      color: cssVar('textPrimaryColor'),
    },
    '&[data-active="true"]': {
      backgroundColor: cssVar('backgroundPrimaryColor'),
      color: cssVar('textPrimaryColor'),
      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
    },
  },
});

export const tabIcon = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '14px',
  flexShrink: 0,
});

export const tabTitle = style({
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const tabCloseButton = style({
  flexShrink: 0,
  marginLeft: '2px',
  opacity: 0.6,
  selectors: {
    '&:hover': {
      opacity: 1,
    },
  },
});

export const tabAddButton = style({
  flexShrink: 0,
});
