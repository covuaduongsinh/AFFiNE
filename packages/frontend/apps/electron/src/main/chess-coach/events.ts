import { Subject } from 'rxjs';

import type { MainEventRegister } from '../type';
import type { CoachStreamEvent, CoachToolRequest } from './types';

export const chessCoachSubjects = {
  stream$: new Subject<CoachStreamEvent>(),
  toolCall$: new Subject<CoachToolRequest>(),
};

export const chessCoachEvents = {
  onStream: (fn: (event: CoachStreamEvent) => void) => {
    const sub = chessCoachSubjects.stream$.subscribe(fn);
    return () => sub.unsubscribe();
  },
  onToolCall: (fn: (request: CoachToolRequest) => void) => {
    const sub = chessCoachSubjects.toolCall$.subscribe(fn);
    return () => sub.unsubscribe();
  },
} satisfies Record<string, MainEventRegister>;
