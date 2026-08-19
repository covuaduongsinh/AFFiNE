import { Service } from '@toeverything/infra';

import type { ChessEngineService } from '../../chess-engine';
import type { FeatureFlagService } from '../../feature-flag';
import { createCoachHost } from '../hosts/create-host';
import { ChessCoachSession } from '../session';

export class ChessCoachService extends Service {
  readonly session: ChessCoachSession;

  constructor(
    private readonly chessEngineService: ChessEngineService,
    private readonly featureFlagService: FeatureFlagService
  ) {
    super();
    this.session = new ChessCoachSession(
      this.chessEngineService.engine,
      createCoachHost(),
      () => this.featureFlagService.flags.enable_chess_coach.value === true,
      () => this.featureFlagService.flags.enable_chess_engine.value === true
    );
    this.disposables.push(() => this.session.dispose());
  }
}
