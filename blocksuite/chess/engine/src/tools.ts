import {
  type Game,
  type GameHeader,
  type MovePath,
  nodeAt,
  parseFen,
  parsePgn,
  positionAt,
  serializePgn,
  setComment,
  setNags,
  toFen,
} from '@blocksuite/chess-core';

import { applyScanToGame, parseGameScan, serializeGameScan } from './apply.js';
import { pvUciToSan } from './pv.js';
import type { GameScan, PositionEval } from './types.js';

export const CHESS_TOOL_NAMES = [
  'chess.analyze',
  'chess.scan_game',
  'chess.read_doc',
  'chess.write_doc',
  'chess.make_puzzle',
] as const;

export type ChessToolName = (typeof CHESS_TOOL_NAMES)[number];

export function isChessToolName(name: string): name is ChessToolName {
  return (CHESS_TOOL_NAMES as readonly string[]).includes(name);
}

const PRAISE_NAGS = new Set([1, 3, 5]);
const DEFAULT_DEPTH = 14;
const DEFAULT_MULTIPV = 2;

export interface ChessGameSnapshot {
  pgn: string;
  currentPath: MovePath;
  analysisJson?: string;
}

export interface ChessToolContext {
  engineEnabled: boolean;
  lastScan: GameScan | null;
  evaluate(fen: string, depth: number, multipv: number): Promise<PositionEval>;
  scan(game: Game, depth: number): Promise<GameScan>;
  readGame(): ChessGameSnapshot | null;
  writeGame(next: ChessGameSnapshot): void;
}

export type ChessToolErrorCode =
  | 'unknown_tool'
  | 'engine_disabled'
  | 'engine_unavailable'
  | 'no_game'
  | 'invalid_args'
  | 'invalid_fen'
  | 'write_failed';

export type ChessToolResult =
  | { ok: true; payload: unknown }
  | { ok: false; error: string; code: ChessToolErrorCode };

export const CHESS_TOOL_SCHEMAS: Record<
  ChessToolName,
  { description: string; inputSchema: Record<string, unknown> }
> = {
  'chess.analyze': {
    description:
      'Evaluate a position with the local chess engine. Never invent scores.',
    inputSchema: {
      type: 'object',
      properties: {
        fen: { type: 'string' },
        depth: { type: 'number' },
        multipv: { type: 'number' },
      },
    },
  },
  'chess.scan_game': {
    description:
      'Scan the focused game main line. Set apply=true to write [%eval] and judgment NAGs.',
    inputSchema: {
      type: 'object',
      properties: {
        depth: { type: 'number' },
        apply: { type: 'boolean' },
      },
    },
  },
  'chess.read_doc': {
    description:
      'Read the focused chess game (PGN, path, FEN, optional labels).',
    inputSchema: {
      type: 'object',
      properties: {
        includeAnalysis: { type: 'boolean' },
      },
    },
  },
  'chess.write_doc': {
    description:
      'Write the focused game. apply_scan uses the last scan. One undo step.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['apply_scan', 'set_comment', 'set_nags', 'set_path'],
        },
        path: { type: 'array', items: { type: 'number' } },
        comment: { type: 'string' },
        nags: { type: 'array', items: { type: 'number' } },
      },
      required: ['action'],
    },
  },
  'chess.make_puzzle': {
    description: 'Build a puzzle from the first blunder in the last scan.',
    inputSchema: { type: 'object', properties: {} },
  },
};

function fail(code: ChessToolErrorCode, error: string): ChessToolResult {
  return { ok: false, code, error };
}

function asRecord(args: unknown): Record<string, unknown> {
  return args && typeof args === 'object' && !Array.isArray(args)
    ? (args as Record<string, unknown>)
    : {};
}

function asPath(value: unknown): MovePath | null {
  if (!Array.isArray(value)) return null;
  if (!value.every(item => Number.isInteger(item) && item >= 0)) return null;
  return value as MovePath;
}

function parseSnapshot(snapshot: ChessGameSnapshot): Game | null {
  try {
    return parsePgn(snapshot.pgn);
  } catch {
    return null;
  }
}

function requireEngine(ctx: ChessToolContext): ChessToolResult | null {
  if (!ctx.engineEnabled) {
    return fail('engine_disabled', 'chess engine is disabled');
  }
  return null;
}

function requireGame(
  ctx: ChessToolContext
): { snapshot: ChessGameSnapshot; game: Game } | ChessToolResult {
  const snapshot = ctx.readGame();
  if (!snapshot) return fail('no_game', 'no focused chess game');
  const game = parseSnapshot(snapshot);
  if (!game) return fail('no_game', 'focused chess game is unreadable');
  return { snapshot, game };
}

async function analyze(
  ctx: ChessToolContext,
  args: Record<string, unknown>
): Promise<ChessToolResult> {
  const blocked = requireEngine(ctx);
  if (blocked) return blocked;

  let fen: string;
  if (typeof args.fen === 'string' && args.fen.trim()) {
    fen = args.fen.trim();
    try {
      parseFen(fen);
    } catch {
      return fail('invalid_fen', 'FEN could not be parsed');
    }
  } else {
    const loaded = requireGame(ctx);
    if ('ok' in loaded) return loaded;
    fen = toFen(positionAt(loaded.game, loaded.snapshot.currentPath ?? []));
  }

  const depth =
    typeof args.depth === 'number' && args.depth > 0
      ? Math.floor(args.depth)
      : DEFAULT_DEPTH;
  const multipv =
    typeof args.multipv === 'number' && args.multipv > 0
      ? Math.floor(args.multipv)
      : DEFAULT_MULTIPV;

  try {
    const evaluated = await ctx.evaluate(fen, depth, multipv);
    return {
      ok: true,
      payload: {
        fen,
        depth: evaluated.depth,
        multipv,
        score: evaluated.score,
        pv: evaluated.pv,
        pvSan: pvUciToSan(fen, evaluated.pv),
      },
    };
  } catch (error) {
    return fail(
      'engine_unavailable',
      error instanceof Error ? error.message : 'chess engine is unavailable'
    );
  }
}

async function scanGameTool(
  ctx: ChessToolContext,
  args: Record<string, unknown>
): Promise<ChessToolResult> {
  const blocked = requireEngine(ctx);
  if (blocked) return blocked;
  const loaded = requireGame(ctx);
  if ('ok' in loaded) return loaded;

  const depth =
    typeof args.depth === 'number' && args.depth > 0
      ? Math.floor(args.depth)
      : DEFAULT_DEPTH;

  let report: GameScan;
  try {
    report = await ctx.scan(loaded.game, depth);
  } catch (error) {
    return fail(
      'engine_unavailable',
      error instanceof Error ? error.message : 'chess engine is unavailable'
    );
  }
  ctx.lastScan = report;

  const nextPgn =
    args.apply === true
      ? applyScanPgn(loaded.game, report)
      : loaded.snapshot.pgn;
  ctx.writeGame({
    pgn: nextPgn,
    currentPath: loaded.snapshot.currentPath,
    analysisJson: serializeGameScan(report),
  });

  return {
    ok: true,
    payload: {
      engineId: report.engineId,
      engineVersion: report.engineVersion,
      depth: report.depth,
      whiteAcpl: report.whiteAcpl,
      blackAcpl: report.blackAcpl,
      applied: args.apply === true,
      nodes: summarizeScan(report),
    },
  };
}

function applyScanPgn(game: Game, report: GameScan): string {
  applyScanToGame(game, report);
  return serializePgn(game);
}

function summarizeScan(report: GameScan) {
  return report.nodes.map(node => ({
    path: node.path,
    playedUci: node.playedUci,
    bestUci: node.bestUci,
    bestPvSan: node.bestPvSan,
    label: node.label,
    cpl: node.cpl,
  }));
}

function readDoc(
  ctx: ChessToolContext,
  args: Record<string, unknown>
): ChessToolResult {
  const loaded = requireGame(ctx);
  if ('ok' in loaded) return loaded;
  const path = loaded.snapshot.currentPath ?? [];
  const fen = toFen(positionAt(loaded.game, path));
  const headers = Object.fromEntries(
    Object.entries(loaded.game.headers).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string'
    )
  ) as GameHeader;

  const payload: Record<string, unknown> = {
    headers,
    pgn: loaded.snapshot.pgn,
    currentPath: path,
    fen,
    result: loaded.game.result,
  };

  if (args.includeAnalysis) {
    const scan =
      parseGameScan(loaded.snapshot.analysisJson) ?? ctx.lastScan ?? null;
    if (scan) {
      payload.analysis = {
        whiteAcpl: scan.whiteAcpl,
        blackAcpl: scan.blackAcpl,
        nodes: summarizeScan(scan),
      };
    }
  }

  return { ok: true, payload };
}

function writeDoc(
  ctx: ChessToolContext,
  args: Record<string, unknown>
): ChessToolResult {
  const loaded = requireGame(ctx);
  if ('ok' in loaded) return loaded;
  const action = args.action;
  if (typeof action !== 'string') {
    return fail('invalid_args', 'write_doc requires action');
  }

  try {
    if (action === 'apply_scan') {
      const scan = ctx.lastScan;
      if (!scan) return fail('invalid_args', 'no scan to apply');
      ctx.writeGame({
        pgn: applyScanPgn(loaded.game, scan),
        currentPath: loaded.snapshot.currentPath,
        analysisJson: serializeGameScan(scan),
      });
      return { ok: true, payload: { action, applied: true } };
    }

    if (action === 'set_path') {
      const path = asPath(args.path);
      if (!path) return fail('invalid_args', 'set_path requires a path array');
      ctx.writeGame({
        pgn: loaded.snapshot.pgn,
        currentPath: path,
        analysisJson: loaded.snapshot.analysisJson,
      });
      return { ok: true, payload: { action, path } };
    }

    const path = asPath(args.path);
    if (!path) return fail('invalid_args', `${action} requires a path array`);
    const node = nodeAt(loaded.game, path);
    if (!node) return fail('invalid_args', 'path is not in the game');

    if (action === 'set_comment') {
      if (typeof args.comment !== 'string') {
        return fail('invalid_args', 'set_comment requires comment');
      }
      setComment(loaded.game, path, args.comment);
    } else if (action === 'set_nags') {
      if (
        !Array.isArray(args.nags) ||
        !args.nags.every(n => Number.isInteger(n))
      ) {
        return fail('invalid_args', 'set_nags requires nags: number[]');
      }
      const praise = node.nags.filter(nag => PRAISE_NAGS.has(nag));
      const incoming = (args.nags as number[]).filter(
        nag => !PRAISE_NAGS.has(nag)
      );
      setNags(loaded.game, path, [...praise, ...incoming]);
    } else {
      return fail('invalid_args', `unknown write action ${action}`);
    }

    ctx.writeGame({
      pgn: serializePgn(loaded.game),
      currentPath: loaded.snapshot.currentPath,
      analysisJson: loaded.snapshot.analysisJson,
    });
    return { ok: true, payload: { action, path } };
  } catch (error) {
    return fail(
      'write_failed',
      error instanceof Error ? error.message : 'write failed'
    );
  }
}

function makePuzzle(ctx: ChessToolContext): ChessToolResult {
  const loaded = requireGame(ctx);
  if ('ok' in loaded) return loaded;
  const scan = ctx.lastScan ?? parseGameScan(loaded.snapshot.analysisJson);
  if (!scan) return fail('invalid_args', 'no scan to build a puzzle from');
  const blunder = scan.nodes.find(node => node.label === 'blunder');
  if (!blunder) return fail('invalid_args', 'scan has no blunder');
  const node = nodeAt(loaded.game, blunder.path);
  if (!node) return fail('invalid_args', 'blunder path is not in the game');
  return {
    ok: true,
    payload: {
      fen: node.fenBefore,
      playedUci: blunder.playedUci,
      bestUci: blunder.bestUci,
      solutionSan: blunder.bestPvSan[0] ?? blunder.bestUci,
      label: blunder.label,
    },
  };
}

export async function runChessTool(
  ctx: ChessToolContext,
  name: string,
  args?: unknown
): Promise<ChessToolResult> {
  if (!isChessToolName(name)) {
    return fail('unknown_tool', `tool ${name} is not allowed`);
  }
  const record = asRecord(args);
  switch (name) {
    case 'chess.analyze':
      return analyze(ctx, record);
    case 'chess.scan_game':
      return scanGameTool(ctx, record);
    case 'chess.read_doc':
      return readDoc(ctx, record);
    case 'chess.write_doc':
      return writeDoc(ctx, record);
    case 'chess.make_puzzle':
      return makePuzzle(ctx);
  }
}
