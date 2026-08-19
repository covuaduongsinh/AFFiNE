import { apis, events } from '@affine/electron-api';

import type { CoachHost } from '../types';
import { DesktopCoachHost } from './desktop-host';
import { NullCoachHost } from './null-host';

export function createCoachHost(): CoachHost {
  const api = apis?.chessCoach;
  const ev = events?.chessCoach;
  if (BUILD_CONFIG.isElectron && api && ev) {
    return new DesktopCoachHost(api, ev);
  }
  return new NullCoachHost();
}
