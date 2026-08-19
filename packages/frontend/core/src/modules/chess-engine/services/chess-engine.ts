import { Service } from '@toeverything/infra';

import type { FeatureFlagService } from '../../feature-flag';
import { createPersistentCache } from '../cache';
import { ChessEngine } from '../engine';
import { createDefaultHost } from '../hosts/create-host';

export class ChessEngineService extends Service {
  readonly engine: ChessEngine;

  constructor(private readonly featureFlagService: FeatureFlagService) {
    super();
    this.engine = new ChessEngine({
      host: createDefaultHost(),
      isEnabled: () =>
        this.featureFlagService.flags.enable_chess_engine.value === true,
    });
    createPersistentCache()
      .then(cache => {
        this.engine.attachCache(cache);
      })
      .catch(() => {});
    this.disposables.push(() => {
      this.engine.dispose().catch(() => {});
    });
  }
}
