import type { EngineBestMove, EngineInfo } from '@blocksuite/chess-engine';
import { Subject } from 'rxjs';

import type { MainEventRegister } from '../type';

export const chessEngineSubjects = {
  info$: new Subject<EngineInfo>(),
  bestMove$: new Subject<EngineBestMove>(),
  exit$: new Subject<{ code: number }>(),
};

export const chessEngineEvents = {
  onInfo: (fn: (info: EngineInfo) => void) => {
    const sub = chessEngineSubjects.info$.subscribe(fn);
    return () => sub.unsubscribe();
  },
  onBestMove: (fn: (move: EngineBestMove) => void) => {
    const sub = chessEngineSubjects.bestMove$.subscribe(fn);
    return () => sub.unsubscribe();
  },
  onExit: (fn: (event: { code: number }) => void) => {
    const sub = chessEngineSubjects.exit$.subscribe(fn);
    return () => sub.unsubscribe();
  },
} satisfies Record<string, MainEventRegister>;
