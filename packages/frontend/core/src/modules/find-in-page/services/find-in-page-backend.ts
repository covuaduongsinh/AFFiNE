import { createIdentifier } from '@toeverything/infra';

export interface FindInPageResult {
  matches: number;
  activeMatchOrdinal: number;
}

export interface FindInPageBackend {
  find(
    text: string,
    options?: { forward?: boolean; findNext?: boolean }
  ): Promise<FindInPageResult | null>;
  clear(): Promise<void> | void;
}

export const FindInPageBackend =
  createIdentifier<FindInPageBackend>('FindInPageBackend');
