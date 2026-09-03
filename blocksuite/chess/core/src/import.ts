import { nodeAt } from './move-tree.js';
import { BLACK, type Game, type GameHeader, type MovePath } from './types.js';

/** `${White} – ${Black}` plus optional ` · Event`. */
export function captionFromHeaders(headers: GameHeader): string {
  const players = `${headers.White ?? '?'} – ${headers.Black ?? '?'}`;
  const event = headers.Event?.trim() ?? '';
  return (event ? `${players} · ${event}` : players).trim();
}

/**
 * PGN-style move label at `path`, e.g. `2. Bc4` or `12... Nxe7`.
 * Missing path → empty string.
 */
export function formatMovePreview(game: Game, path: MovePath): string {
  const node = nodeAt(game, path);
  if (!node || path.length === 0) return '';
  const ply = path.length - 1 + (game.setup.turn === BLACK ? 1 : 0);
  const fullMove = Math.floor(ply / 2) + game.setup.fullmoves;
  const dots = ply % 2 === 1 ? '...' : '.';
  return `${fullMove}${dots} ${node.san}`;
}

export type LichessRef =
  | { kind: 'game'; id: string }
  | { kind: 'user'; username: string };

const USERNAME_RE = /^[A-Za-z0-9_-]{2,30}$/;
const GAME_ID_RE = /^[A-Za-z0-9]{8}$/;

function stripQueryAndHash(input: string): string {
  const noHash = input.split('#')[0] ?? input;
  return noHash.split('?')[0] ?? noHash;
}

/**
 * Resolve a Lichess game URL/id or username. Query and hash are ignored.
 * 8-character alphanumeric tokens are always game ids.
 */
export function parseLichessRef(input: string): LichessRef | null {
  const trimmed = stripQueryAndHash(input.trim());
  if (!trimmed) return null;

  if (/lichess\.org/i.test(trimmed) || /^https?:\/\//i.test(trimmed)) {
    let pathname = trimmed;
    try {
      const href = /^https?:\/\//i.test(trimmed)
        ? trimmed
        : `https://${trimmed}`;
      pathname = new URL(href).pathname;
    } catch {
      const match = trimmed.match(/lichess\.org(\/[^?#]*)?/i);
      pathname = match?.[1] ?? '/';
    }

    const userApi = pathname.match(
      /\/api\/games\/user\/([A-Za-z0-9_-]{2,30})\/?$/
    );
    if (userApi) return { kind: 'user', username: userApi[1] };

    const game = pathname.match(
      /(?:\/game\/export\/|\/)([A-Za-z0-9]{8})(?:\/|$)/
    );
    if (game) return { kind: 'game', id: game[1].toLowerCase() };

    return null;
  }

  if (GAME_ID_RE.test(trimmed)) {
    return { kind: 'game', id: trimmed.toLowerCase() };
  }
  if (USERNAME_RE.test(trimmed) && trimmed.length !== 8) {
    return { kind: 'user', username: trimmed };
  }
  return null;
}

export function lichessExportUrl(id: string): string {
  return `https://lichess.org/game/export/${id}?evals=0&clocks=1`;
}

export function lichessUserGamesUrl(username: string, max: number): string {
  const clamped = Math.min(200, Math.max(1, max));
  return `https://lichess.org/api/games/user/${username}?max=${clamped}&clocks=1&evals=0&opening=1`;
}
