import type { EngineBestMove, EngineInfo, Score } from './types.js';

export type ParsedUciLine =
  | { kind: 'info'; info: Omit<EngineInfo, 'jobId'> }
  | { kind: 'bestmove'; bestmove: string; ponder?: string }
  | { kind: 'uciok' }
  | { kind: 'readyok' }
  | { kind: 'id'; key: 'name' | 'author'; value: string }
  | { kind: 'ignore' };

const INT = /^-?\d+$/;

function takeInt(tokens: string[], index: number): number | undefined {
  const raw = tokens[index];
  if (raw === undefined || !INT.test(raw)) return undefined;
  return Number.parseInt(raw, 10);
}

function parseScore(tokens: string[], start: number): Score | undefined {
  const kind = tokens[start];
  const value = takeInt(tokens, start + 1);
  if (value === undefined) return undefined;
  if (kind === 'cp' || kind === 'mate') return { type: kind, value };
  return undefined;
}

/**
 * Parse one stdout line from a UCI engine.
 *
 * Unknown tokens are skipped. `info string …` is ignored wholesale — those
 * lines are diagnostics, not search output.
 */
export function parseUciLine(line: string): ParsedUciLine {
  const trimmed = line.trim();
  if (trimmed === '') return { kind: 'ignore' };

  const tokens = trimmed.split(/\s+/);
  const head = tokens[0];

  if (head === 'uciok') return { kind: 'uciok' };
  if (head === 'readyok') return { kind: 'readyok' };

  if (head === 'id') {
    const key = tokens[1];
    if (key === 'name' || key === 'author') {
      return { kind: 'id', key, value: tokens.slice(2).join(' ') };
    }
    return { kind: 'ignore' };
  }

  if (head === 'bestmove') {
    const bestmove = tokens[1] ?? '';
    if (bestmove === '' || bestmove === '(none)') {
      return { kind: 'bestmove', bestmove: '' };
    }
    const ponder = tokens[2] === 'ponder' && tokens[3] ? tokens[3] : undefined;
    return { kind: 'bestmove', bestmove, ponder };
  }

  if (head !== 'info') return { kind: 'ignore' };
  if (tokens[1] === 'string') return { kind: 'ignore' };

  let depth = 0;
  let seldepth: number | undefined;
  let multipv = 1;
  let score: Score | undefined;
  let nodes: number | undefined;
  let nps: number | undefined;
  let timeMs: number | undefined;
  let pv: string[] = [];

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    switch (token) {
      case 'depth': {
        const value = takeInt(tokens, i + 1);
        if (value !== undefined) {
          depth = value;
          i++;
        }
        break;
      }
      case 'seldepth': {
        const value = takeInt(tokens, i + 1);
        if (value !== undefined) {
          seldepth = value;
          i++;
        }
        break;
      }
      case 'multipv': {
        const value = takeInt(tokens, i + 1);
        if (value !== undefined) {
          multipv = value;
          i++;
        }
        break;
      }
      case 'score': {
        const parsed = parseScore(tokens, i + 1);
        if (parsed) {
          score = parsed;
          i += 2;
          const bound = tokens[i + 1];
          if (bound === 'lowerbound' || bound === 'upperbound') i++;
        }
        break;
      }
      case 'nodes': {
        const value = takeInt(tokens, i + 1);
        if (value !== undefined) {
          nodes = value;
          i++;
        }
        break;
      }
      case 'nps': {
        const value = takeInt(tokens, i + 1);
        if (value !== undefined) {
          nps = value;
          i++;
        }
        break;
      }
      case 'time': {
        const value = takeInt(tokens, i + 1);
        if (value !== undefined) {
          timeMs = value;
          i++;
        }
        break;
      }
      case 'pv': {
        pv = tokens.slice(i + 1);
        i = tokens.length;
        break;
      }
      default:
        break;
    }
  }

  // `info depth 14 time … hashfull …` has no eval — inventing cp 0 would
  // wipe the last real score in the UI.
  if (!score) return { kind: 'ignore' };

  return {
    kind: 'info',
    info: {
      depth,
      seldepth,
      multipv,
      score,
      pv,
      nodes,
      nps,
      timeMs,
    },
  };
}

/** Attach a job id to a parsed info line so the UI can drop stale events. */
export function withJobId(
  info: Omit<EngineInfo, 'jobId'>,
  jobId: string
): EngineInfo {
  return { ...info, jobId };
}

export function withJobIdBestMove(
  parsed: Extract<ParsedUciLine, { kind: 'bestmove' }>,
  jobId: string
): EngineBestMove {
  return {
    jobId,
    bestmove: parsed.bestmove,
    ponder: parsed.ponder,
  };
}
