import { apis, events } from '@affine/electron-api';
import type { EngineHost } from '@blocksuite/chess-engine';

import { NativeEngineHost } from './native-host';
import { NullEngineHost } from './null-host';

export function createDefaultHost(): EngineHost {
  const api = apis?.chessEngine;
  const ev = events?.chessEngine;
  if (BUILD_CONFIG.isElectron && api && ev) {
    return new NativeEngineHost(api, ev);
  }
  return new NullEngineHost();
}
