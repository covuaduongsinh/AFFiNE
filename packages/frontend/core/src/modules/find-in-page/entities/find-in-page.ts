import { DebugLogger } from '@affine/debug';
import { Entity, LiveData } from '@toeverything/infra';
import {
  debounceTime,
  distinctUntilChanged,
  from,
  of,
  shareReplay,
  switchMap,
  tap,
} from 'rxjs';

import type { FindInPageBackend } from '../services/find-in-page-backend';

const logger = new DebugLogger('affine:find-in-page');

export class FindInPage extends Entity {
  readonly searchText$ = new LiveData<string | null>(null);
  readonly isSearching$ = new LiveData(false);
  private readonly direction$ = new LiveData<'forward' | 'backward'>('forward');
  readonly visible$ = new LiveData(false);

  readonly result$ = LiveData.from(
    this.visible$.pipe(
      distinctUntilChanged(),
      switchMap(visible => {
        if (!visible) {
          return of(null);
        }
        let searchId = 0;
        return this.searchText$.pipe(
          tap(() => {
            this.isSearching$.next(false);
          }),
          debounceTime(500),
          switchMap(searchText => {
            if (!searchText) {
              return of(null);
            } else {
              let findNext = true;
              return this.direction$.pipe(
                switchMap(direction => {
                  this.isSearching$.next(true);
                  const currentId = ++searchId;
                  const promise = Promise.resolve(
                    this.backend.find(searchText, {
                      forward: direction === 'forward',
                      findNext,
                    })
                  ).finally(() => {
                    if (currentId === searchId) {
                      this.isSearching$.next(false);
                      findNext = false;
                    }
                  });
                  return from(promise);
                })
              );
            }
          })
        );
      }),
      shareReplay({
        bufferSize: 1,
        refCount: true,
      })
    ),
    null
  );

  constructor(private readonly backend: FindInPageBackend) {
    super();
  }

  findInPage(searchText?: string) {
    this.onChangeVisible(true);
    if (searchText !== undefined) {
      this.searchText$.next(searchText);
    }
  }

  onChangeVisible(visible: boolean) {
    this.visible$.next(visible);
    if (!visible) {
      this.clear();
    }
  }

  toggleVisible(text?: string) {
    const nextVisible = !this.visible$.value;
    this.visible$.next(nextVisible);
    if (!nextVisible) {
      this.clear();
    } else if (text) {
      this.searchText$.next(text);
    }
  }

  backward() {
    if (!this.searchText$.value) {
      return;
    }
    this.direction$.next('backward');
  }

  forward() {
    if (!this.searchText$.value) {
      return;
    }
    this.direction$.next('forward');
  }

  clear() {
    logger.debug('clear');
    Promise.resolve(this.backend.clear()).catch(logger.error);
  }
}
