import type { Framework } from '@toeverything/infra';

import { FeatureFlagService } from '../feature-flag';
import { ChessEngineService } from './services/chess-engine';

export function configureChessEngineModule(framework: Framework) {
  framework.service(ChessEngineService, [FeatureFlagService]);
}

export { type AsyncEvalCache, createPersistentCache } from './cache';
export { ChessEngine, type ChessEngineStatus } from './engine';
export { createDefaultHost } from './hosts/create-host';
export { NativeEngineHost } from './hosts/native-host';
export { NullEngineHost } from './hosts/null-host';
export { ChessEngineService } from './services/chess-engine';
