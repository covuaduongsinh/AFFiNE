import { ChessBoardBlockComponent } from './board-block.js';

export function effects() {
  customElements.define('affine-chess-board', ChessBoardBlockComponent);
}
