import { Framework } from '@toeverything/infra';
import { describe, expect, it, vi } from 'vitest';

import { FindInPage } from '../entities/find-in-page';
import { FindInPageService } from '../services/find-in-page';
import {
  type FindInPageBackend,
  FindInPageBackend as FindInPageBackendIdentifier,
} from '../services/find-in-page-backend';

describe('FindInPage Entity', () => {
  it('should initialize and toggle visibility', () => {
    const mockBackend: FindInPageBackend = {
      find: vi.fn().mockResolvedValue({ matches: 2, activeMatchOrdinal: 1 }),
      clear: vi.fn(),
    };

    const framework = new Framework();
    framework
      .service(FindInPageService)
      .entity(FindInPage, [FindInPageBackendIdentifier])
      .impl(FindInPageBackendIdentifier, () => mockBackend);

    const provider = framework.provider();
    const findInPageService = provider.get(FindInPageService);
    const findInPage = findInPageService.findInPage;

    expect(findInPage.visible$.value).toBe(false);

    findInPage.toggleVisible('hello');
    expect(findInPage.visible$.value).toBe(true);
    expect(findInPage.searchText$.value).toBe('hello');

    findInPage.toggleVisible();
    expect(findInPage.visible$.value).toBe(false);
    expect(mockBackend.clear).toHaveBeenCalled();
  });

  it('should trigger direction forward and backward', () => {
    const mockBackend: FindInPageBackend = {
      find: vi.fn().mockResolvedValue({ matches: 2, activeMatchOrdinal: 1 }),
      clear: vi.fn(),
    };

    const framework = new Framework();
    framework
      .service(FindInPageService)
      .entity(FindInPage, [FindInPageBackendIdentifier])
      .impl(FindInPageBackendIdentifier, () => mockBackend);

    const provider = framework.provider();
    const findInPage = provider.get(FindInPageService).findInPage;
    findInPage.findInPage('test');

    findInPage.forward();
    findInPage.backward();

    expect(findInPage.visible$.value).toBe(true);
  });
});
