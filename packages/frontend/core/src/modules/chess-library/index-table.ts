import {
  captionFromHeaders,
  countMoves,
  parsePgn,
} from '@blocksuite/chess-core';

export type ChessGameRow = {
  id: string;
  docId: string;
  blockId: string;
  white: string;
  black: string;
  event: string;
  date: string;
  result: string;
  eco: string;
  site: string;
  caption: string;
  plyCount: number;
};

export function chessGameRowId(docId: string, blockId: string): string {
  return `${docId}:${blockId}`;
}

export function rowFromPgn(
  docId: string,
  blockId: string,
  pgn: string
): ChessGameRow {
  const id = chessGameRowId(docId, blockId);
  try {
    const game = parsePgn(pgn);
    const headers = game.headers;
    return {
      id,
      docId,
      blockId,
      white: headers.White ?? '',
      black: headers.Black ?? '',
      event: headers.Event ?? '',
      date: headers.Date ?? '',
      result: headers.Result ?? game.result,
      eco: headers.ECO ?? '',
      site: headers.Site ?? '',
      caption: captionFromHeaders(headers),
      plyCount: countMoves(game),
    };
  } catch {
    return {
      id,
      docId,
      blockId,
      white: '',
      black: '',
      event: '',
      date: '',
      result: '',
      eco: '',
      site: '',
      caption: '',
      plyCount: 0,
    };
  }
}

export function filterGameRows(
  rows: ChessGameRow[],
  filter?: { q?: string; result?: string }
): ChessGameRow[] {
  const q = filter?.q?.trim().toLowerCase();
  const result = filter?.result;
  return rows.filter(row => {
    if (result && row.result !== result) return false;
    if (!q) return true;
    return [row.white, row.black, row.event, row.eco, row.site, row.caption]
      .join('\n')
      .toLowerCase()
      .includes(q);
  });
}
