import { ChessBoardBlockComponent } from './board-block.js';
import { EdgelessChessBoardBlockComponent } from './edgeless-board-block.js';

export function effects() {
  customElements.define('affine-chess-board', ChessBoardBlockComponent);
  customElements.define(
    'affine-edgeless-chess-board',
    EdgelessChessBoardBlockComponent
  );
}
