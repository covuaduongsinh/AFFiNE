import type { BoardOrientation } from '@affine/component/ui/chess';
import type { Color } from '@blocksuite/chess-core';
import type { Score } from '@blocksuite/chess-engine';

import { formatScore, whiteBarShare } from './analysis-ui';
import * as styles from './eval-bar.css';

export interface EvalBarProps {
  score: Score;
  turn: Color;
  orientation: BoardOrientation;
}

export const EvalBar = ({ score, turn, orientation }: EvalBarProps) => {
  const whiteShare = whiteBarShare(score, turn);
  const topIsWhite = orientation === 'black';
  const topShare = topIsWhite ? whiteShare : 1 - whiteShare;
  const bottomShare = 1 - topShare;

  return (
    <div className={styles.wrap} data-testid="chess-eval-bar">
      <div className={styles.bar} aria-hidden="true">
        <div
          className={topIsWhite ? styles.white : styles.black}
          style={{ flex: topShare }}
        />
        <div
          className={topIsWhite ? styles.black : styles.white}
          style={{ flex: bottomShare }}
        />
      </div>
      <span className={styles.label}>{formatScore(score, turn)}</span>
    </div>
  );
};
