import { ChessBoardBlockComponent } from './board-block';

export function effects() {
  customElements.define('affine-chess-board', ChessBoardBlockComponent);
}
