import type { Framework } from '@toeverything/infra';

import { DesktopApiService } from '../desktop-api';
import { FindInPage } from './entities/find-in-page';
import { BrowserFindInPageBackend } from './services/browser-backend';
import { DesktopFindInPageBackend } from './services/desktop-backend';
import { FindInPageService } from './services/find-in-page';
import { FindInPageBackend } from './services/find-in-page-backend';

export { BrowserFindInPageBackend } from './services/browser-backend';
export { DesktopFindInPageBackend } from './services/desktop-backend';
export { FindInPageService } from './services/find-in-page';
export {
  FindInPageBackend,
  type FindInPageResult,
} from './services/find-in-page-backend';

export function configureFindInPageCommonModule(framework: Framework) {
  framework.service(FindInPageService).entity(FindInPage, [FindInPageBackend]);
}

export function configureBrowserFindInPageModule(framework: Framework) {
  configureFindInPageCommonModule(framework);
  framework.impl(FindInPageBackend, () => new BrowserFindInPageBackend());
}

export function configureDesktopFindInPageModule(framework: Framework) {
  configureFindInPageCommonModule(framework);
  framework.impl(FindInPageBackend, DesktopFindInPageBackend, [
    DesktopApiService,
  ]);
}

export const configureFindInPageModule = configureBrowserFindInPageModule;
