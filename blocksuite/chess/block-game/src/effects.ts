import { ChessGameBlockComponent } from './game-block.js';

export function effects() {
  customElements.define('affine-chess-game', ChessGameBlockComponent);
}
