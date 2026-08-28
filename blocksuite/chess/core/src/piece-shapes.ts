/**
 * Original geometric piece set.
 *
 * Drawn from scratch rather than adapted from an existing set: the widely used
 * free sets (Cburnett, Merida and the rest of the Lichess family) are GPL or
 * CC-BY-SA, which a closed-source product cannot ship. These are deliberately
 * geometric instead of Staunton-imitating — a clean abstract shape reads better
 * at 24px than a poor copy of a carved piece, and it doubles as brand identity.
 *
 * Every glyph is drawn in a 45x45 box on a shared base so the pieces line up.
 * The art lives here, in the zero-dependency core, so the on-screen board and
 * the PDF exporter draw the same pieces from one source.
 */

export type PieceLetter =
  | 'P'
  | 'N'
  | 'B'
  | 'R'
  | 'Q'
  | 'K'
  | 'p'
  | 'n'
  | 'b'
  | 'r'
  | 'q'
  | 'k';

/** Shared plinth every piece stands on. */
const BASE =
  'M9.5 40.5h26a1 1 0 0 0 1-1v-2a2 2 0 0 0-2-2h-24a2 2 0 0 0-2 2v2a1 1 0 0 0 1 1z';

/** Collar between the body and the plinth. */
const COLLAR = 'M13 32h19l1.5 3.5h-22z';

/**
 * Lowercase piece letter → paths in draw order.
 *
 * The last two entries are always the collar then the base, so a renderer can
 * paint them with one fill/stroke pair without knowing the piece.
 */
export const PIECE_SHAPES: Record<string, string[]> = {
  p: [
    // Head, then a waisted body flaring into the collar.
    'M22.5 8a6 6 0 1 1 0 12 6 6 0 0 1 0-12z',
    'M19 20.5h7l1.5 4.5c.8 2.4 1.7 4.6 2 7h-14c.3-2.4 1.2-4.6 2-7z',
    COLLAR,
    BASE,
  ],
  r: [
    // Three crenellations over a tapered tower.
    'M10.5 8h5.5v3.5h4V8h5v3.5h4V8h5.5v9h-24z',
    'M14 17h17l-1.6 15h-13.8z',
    COLLAR,
    BASE,
  ],
  n: [
    // Angular horse head: muzzle to the left, mane stepping down the right.
    'M24 7c-4.6 0-8.3 2.2-11 6-1.7 2.4-3.4 4-4.6 6.4-.9 1.8-.3 3.6 1.4 4.2 1.4.5 2.7-.1 3.6-1.3l1.7-2.2 2.1 1.6-3.4 5.4c-1.3 2-1.9 3.5-1.8 4.9h19.5c1.2-7.4 1.4-13.2-.4-18C29.6 9.4 27.2 7 24 7z',
    COLLAR,
    BASE,
  ],
  b: [
    // Finial, mitre with its slit, then the body.
    'M22.5 5.5a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2z',
    'M22.5 11c3.6 0 6.5 3 6.5 6.6 0 2.6-1.4 4-2.6 5.9h-7.8c-1.2-1.9-2.6-3.3-2.6-5.9C16 14 18.9 11 22.5 11zm-.9 3.4v2.2h-2.2v1.8h2.2v2.2h1.8v-2.2h2.2v-1.8h-2.2v-2.2z',
    'M17 24.5h11c.9 3 1.7 5.3 1.9 7.5h-14.8c.2-2.2 1-4.5 1.9-7.5z',
    COLLAR,
    BASE,
  ],
  q: [
    // Five-point crown over a flared body.
    'M8 13.5a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4zm7.5-3.5a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4zM22.5 8a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8zm7 2a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4zM37 13.5a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4z',
    'M9 18.5l3.2 8.5h20.6l3.2-8.5-6 4-3.5-6.5-4 7-4-7-3.5 6.5z',
    'M12.2 27h20.6l.7 5h-22z',
    COLLAR,
    BASE,
  ],
  k: [
    // Cross finial, then a crown that mirrors the queen's silhouette.
    'M21.3 4h2.4v3h3v2.4h-3v3.6h-2.4V9.4h-3V7h3z',
    'M22.5 13.5c5 0 9 3.2 9 7.4 0 2.7-1.6 4.6-3 6.1h-12c-1.4-1.5-3-3.4-3-6.1 0-4.2 4-7.4 9-7.4z',
    'M14.5 27h16l.8 5h-17.6z',
    COLLAR,
    BASE,
  ],
};

/** Side of the square box every glyph in `PIECE_SHAPES` is drawn in. */
export const PIECE_VIEWBOX_SIZE = 45;
