import { style } from '@vanilla-extract/css';

/**
 * Touch-sized controls, applied only where a finger is the pointer.
 *
 * The chess controls were drawn for a mouse and sit between 14 and 32 px —
 * fine against a cursor, and roughly half of what a fingertip can reliably
 * hit. Rather than enlarging everything and coarsening the desktop editor,
 * this is gated on `pointer: coarse`, which is true of phones and tablets and
 * false of a trackpad or mouse.
 *
 * Compose it into a control's own style rather than restyling by element:
 * these blocks live inside a document, and a global rule would reach the
 * user's own content.
 */
export const touchTarget = style({
  '@media': {
    '(pointer: coarse)': {
      minHeight: 44,
      minWidth: 44,
    },
  },
});

/**
 * For controls that only need to be tall — a text input, a select, anything
 * that already spans the width it needs and would look wrong forced square.
 */
export const touchHeight = style({
  '@media': {
    '(pointer: coarse)': {
      minHeight: 44,
    },
  },
});

/**
 * Field text at 16 px, which is the size iOS Safari stops fighting.
 *
 * Focusing an input with a font under 16 px makes Safari zoom the page, and
 * the entry document sets `maximum-scale=1`, so the reader cannot pinch back
 * out — they are stranded at 1.3× until the field loses focus. Every chess
 * field is `fontXs`, which is 12. Compose this into anything typed into.
 */
export const touchTypeSize = style({
  '@media': {
    '(pointer: coarse)': {
      fontSize: 16,
    },
  },
});

/**
 * For a small mark inside a larger hit area — the colour dot in a swatch, the
 * box of a checkbox. The parent carries `touchTarget` for the hit area; this
 * grows the mark enough to aim at.
 */
export const touchMark = style({
  '@media': {
    '(pointer: coarse)': {
      minWidth: 24,
      minHeight: 24,
    },
  },
});
