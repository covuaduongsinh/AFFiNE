import {
  lichessExportUrl,
  type LichessRef,
  lichessUserGamesUrl,
} from '@blocksuite/chess-core';

export async function fetchLichessPgn(
  ref: LichessRef,
  max = 50,
  signal?: AbortSignal
): Promise<string> {
  const url =
    ref.kind === 'game'
      ? lichessExportUrl(ref.id)
      : lichessUserGamesUrl(ref.username, max);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/x-chess-pgn',
        'User-Agent': 'ChessSuite/0.27',
      },
      signal,
    });
  } catch {
    throw new Error('lichess_http');
  }

  if (response.status === 404) throw new Error('lichess_not_found');
  if (response.status === 429) throw new Error('lichess_rate_limit');
  if (!response.ok) throw new Error('lichess_http');

  const body = await response.text();
  if (body.trim() === '') throw new Error('lichess_empty');
  return body;
}
