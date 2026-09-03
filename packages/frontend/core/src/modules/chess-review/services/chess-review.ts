import { LiveData, Service } from '@toeverything/infra';
import { nanoid } from 'nanoid';
import { type Observable, switchMap } from 'rxjs';

import type { WorkspaceDBService } from '../../db';
import { matchMove, review, type ReviewGrade } from '../sm2';

export type ReviewCard = {
  id: string;
  fen: string;
  prompt: string;
  solutionSan: string;
  sourceDocId: string;
  sourceBlockId: string;
  ef: number;
  interval: number;
  repetitions: number;
  due: number;
  lastScore: number;
};

export class ChessReviewService extends Service {
  constructor(private readonly dbService: WorkspaceDBService) {
    super();
  }

  private get table() {
    return this.dbService.userdataDB$.value.chessReview;
  }

  /** Reactive queue so answering a card re-renders the Review tab. */
  readonly cards$ = LiveData.from<ReviewCard[]>(
    this.dbService.userdataDB$.pipe(
      switchMap(db => db.chessReview.find$() as Observable<ReviewCard[]>)
    ),
    []
  );

  add(input: {
    fen: string;
    prompt?: string;
    solutionSan?: string;
    sourceDocId: string;
    sourceBlockId: string;
  }): string {
    const id = nanoid();
    this.table.create({
      id,
      fen: input.fen,
      prompt: input.prompt ?? '',
      solutionSan: input.solutionSan ?? '',
      sourceDocId: input.sourceDocId,
      sourceBlockId: input.sourceBlockId,
      ef: 2.5,
      interval: 0,
      repetitions: 0,
      due: Date.now(),
      lastScore: 0,
    });
    return id;
  }

  addFromPuzzle(
    puzzle: { fen: string; solutionSan: string },
    source: { docId: string; blockId: string }
  ): string {
    return this.add({
      fen: puzzle.fen,
      prompt: 'Find the best move',
      solutionSan: puzzle.solutionSan,
      sourceDocId: source.docId,
      sourceBlockId: source.blockId,
    });
  }

  dueCards(now = Date.now()): ReviewCard[] {
    return (this.table.find() as ReviewCard[])
      .filter(card => card.due <= now)
      .sort((a, b) => a.due - b.due);
  }

  answer(id: string, q: ReviewGrade): void {
    const card = this.table.get(id) as ReviewCard | null;
    if (!card) return;
    const next = review(card, q, Date.now());
    this.table.update(id, {
      ...next,
      lastScore: q,
    });
  }

  matchMove(fen: string, playedSan: string, solutionSan: string): boolean {
    return matchMove(fen, playedSan, solutionSan);
  }
}
