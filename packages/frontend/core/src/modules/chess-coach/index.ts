import type { Framework } from '@toeverything/infra';

import { ChessEngineService } from '../chess-engine';
import { FeatureFlagService } from '../feature-flag';
import { ChessCoachService } from './services/chess-coach';

export function configureChessCoachModule(framework: Framework) {
  framework.service(ChessCoachService, [
    ChessEngineService,
    FeatureFlagService,
  ]);
}

export { createCoachHost } from './hosts/create-host';
export { NullCoachHost } from './hosts/null-host';
export { ChessCoachService } from './services/chess-coach';
export type { CoachGameAdapter } from './session';
export { ChessCoachSession, type CoachChatMessage } from './session';
export type { CoachApiKeyInput, CoachProvider, CoachStatus } from './types';
