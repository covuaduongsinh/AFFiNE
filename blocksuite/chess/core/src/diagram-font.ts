/**
 * Transforms a FEN string into a text block formatted for TrueType chess diagram fonts
 * (e.g. OpenChessFont / ChessMerida / Chess Leipzig standard encoding).
 *
 * Each character represents a piece on a light or dark square, or a border tile.
 */

export interface ChessFontDiagramOptions {
  orientation?: 'white' | 'black';
  border?: boolean;
}

const WHITE_PIECE_LIGHT: Record<string, string> = {
  K: 'K',
  Q: 'Q',
  R: 'R',
  B: 'B',
  N: 'N',
  P: 'P',
};

const WHITE_PIECE_DARK: Record<string, string> = {
  K: 'k',
  Q: 'q',
  R: 'r',
  B: 'b',
  N: 'n',
  P: 'p',
};

const BLACK_PIECE_LIGHT: Record<string, string> = {
  K: 'L',
  Q: 'W',
  R: 'T',
  B: 'V',
  N: 'M',
  P: 'O',
};

const BLACK_PIECE_DARK: Record<string, string> = {
  K: 'l',
  Q: 'w',
  R: 't',
  B: 'v',
  N: 'm',
  P: 'o',
};

/**
 * Encodes a position into 10 lines of TrueType chess font characters (top border, 8 ranks, bottom border).
 */
export function fenToChessFontText(
  fen: string,
  options: ChessFontDiagramOptions = {}
): string {
  const orientation = options.orientation === 'black' ? 'black' : 'white';
  const showBorder = options.border !== false;

  const placement = fen.trim().split(/\s+/)[0] || '8/8/8/8/8/8/8/8';
  const rawRanks = placement.split('/');
  while (rawRanks.length < 8) rawRanks.push('8');

  const ranks = orientation === 'black' ? [...rawRanks].reverse() : rawRanks;
  const lines: string[] = [];

  if (showBorder) {
    // Top border with a-h file labels (10 characters: top-left corner, a-h, top-right corner)
    lines.push('!"#$%&\'()*');
  }

  for (let r = 0; r < 8; r++) {
    const rankNum = orientation === 'black' ? r + 1 : 8 - r;
    const rankStr =
      orientation === 'black'
        ? ranks[r].split('').reverse().join('')
        : ranks[r];

    let rowChars = '';
    let file = 0;

    for (let c = 0; c < rankStr.length && file < 8; c++) {
      const ch = rankStr[c];
      if (ch >= '1' && ch <= '8') {
        const emptyCount = parseInt(ch, 10);
        for (let i = 0; i < emptyCount && file < 8; i++) {
          const isLight = (file + r) % 2 === 0;
          rowChars += isLight ? ' ' : '+';
          file++;
        }
      } else {
        const isLight = (file + r) % 2 === 0;
        const isWhite = ch === ch.toUpperCase();
        const upper = ch.toUpperCase();

        if (isWhite) {
          rowChars += isLight
            ? (WHITE_PIECE_LIGHT[upper] ?? (isLight ? ' ' : '+'))
            : (WHITE_PIECE_DARK[upper] ?? (isLight ? ' ' : '+'));
        } else {
          rowChars += isLight
            ? (BLACK_PIECE_LIGHT[upper] ?? (isLight ? ' ' : '+'))
            : (BLACK_PIECE_DARK[upper] ?? (isLight ? ' ' : '+'));
        }
        file++;
      }
    }

    // Pad remaining empty squares if FEN rank was incomplete
    while (file < 8) {
      const isLight = (file + r) % 2 === 0;
      rowChars += isLight ? ' ' : '+';
      file++;
    }

    if (showBorder) {
      lines.push(`${rankNum}${rowChars}${rankNum}`);
    } else {
      lines.push(rowChars);
    }
  }

  if (showBorder) {
    // Bottom border with a-h file labels (10 characters: bottom-left corner, a-h, bottom-right corner)
    lines.push('/012345678');
  }

  return lines.join('\n');
}
