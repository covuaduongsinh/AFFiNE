import {
  captionFromHeaders,
  type Game,
  serializePgn,
} from '@blocksuite/chess-core';

export const PGN_IMPORT_MAX_BYTES = 8 * 1024 * 1024;

export async function readPgnFile(file: File): Promise<string> {
  if (file.size > PGN_IMPORT_MAX_BYTES) {
    throw new Error('pgn_too_large');
  }
  return file.text();
}

export type ApplyImportHost = {
  insertOne(pgn: string, caption: string): boolean;
  createMultiGameDoc(title: string, games: Game[]): Promise<string>;
};

export async function applyImportedGames(
  games: Game[],
  host: ApplyImportHost,
  title: string
): Promise<{ docId?: string; inserted: number }> {
  if (games.length === 0) {
    return { inserted: 0 };
  }

  if (games.length === 1) {
    const game = games[0];
    const caption = captionFromHeaders(game.headers);
    if (host.insertOne(serializePgn(game), caption)) {
      return { inserted: 1 };
    }
    const docId = await host.createMultiGameDoc(title, games);
    return { docId, inserted: 1 };
  }

  const docId = await host.createMultiGameDoc(title, games);
  return { docId, inserted: games.length };
}

export function titleFromPgnFileName(name: string): string {
  return name.replace(/\.(pgn|txt)$/i, '') || name;
}

export function isPgnFile(file: File): boolean {
  if (/\.(pgn|txt)$/i.test(file.name)) return true;
  if (file.type === 'application/x-chess-pgn') return true;
  return file.type === 'text/plain' && /\.pgn$/i.test(file.name);
}
