import { DebugLogger } from '@affine/debug';

import type { DesktopApiService } from '../../desktop-api';
import type {
  FindInPageBackend,
  FindInPageResult,
} from './find-in-page-backend';

const logger = new DebugLogger('affine:find-in-page:desktop');

export class DesktopFindInPageBackend implements FindInPageBackend {
  constructor(private readonly desktopApi: DesktopApiService) {}

  async find(
    text: string,
    options?: { forward?: boolean; findNext?: boolean }
  ): Promise<FindInPageResult | null> {
    if (!this.desktopApi?.handler?.findInPage) {
      return null;
    }
    const res = await this.desktopApi.handler.findInPage.find(text, options);
    if (!res) return null;
    return {
      matches: res.matches,
      activeMatchOrdinal: res.activeMatchOrdinal,
    };
  }

  async clear(): Promise<void> {
    if (this.desktopApi?.handler?.findInPage) {
      await this.desktopApi.handler.findInPage.clear().catch(logger.error);
    }
  }
}
