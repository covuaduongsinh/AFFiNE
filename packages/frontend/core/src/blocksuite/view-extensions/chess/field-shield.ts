import { LifeCycleWatcher } from '@blocksuite/affine/std';

/**
 * Marks an input the editor must keep its hands off. The shield below stops
 * events targeting anything carrying this attribute before the editor's own
 * listeners — document-level, capture-phase included — ever see them.
 */
export const CHESS_FIELD_ATTR = 'data-chess-field';

const FIELD_SELECTOR = `[${CHESS_FIELD_ATTR}]`;

/**
 * Everything the editor is known to intercept around a focused field: caret
 * placement, keystrokes, clipboard, IME composition, text selection, and the
 * context menu. `input` and `focus`/`blur` are deliberately absent — the React
 * views need those, and the editor does not fight over them.
 */
const SHIELDED_EVENTS = [
  'pointerdown',
  'pointerup',
  'mousedown',
  'mouseup',
  'click',
  'dblclick',
  'keydown',
  'keyup',
  'beforeinput',
  'copy',
  'cut',
  'paste',
  'compositionstart',
  'compositionupdate',
  'compositionend',
  'selectstart',
  'contextmenu',
] as const;

/**
 * A window-level, capture-phase shield around the chess blocks' text fields.
 *
 * Three fixes stopped events at the fields themselves and each one left the
 * user in the same place, because they all ran in the bubble phase: a
 * document-level capture listener runs before any of them, and one that calls
 * `preventDefault()` on `mousedown` or `beforeinput` kills the caret or the
 * keystroke before the field's own handlers are ever consulted.
 *
 * The capture chain starts at `window`, so a capture listener here runs before
 * every listener the editor owns, on any node. Stopping propagation this early
 * starves them all, while the browser's default behaviour — which is exactly
 * what a plain textarea wants — still runs, and the `input` events React needs
 * are not on the shielded list.
 *
 * The cost is that nothing else hears these events either, including our own
 * React handlers on the fields. Anything a field needs beyond browser defaults
 * has to live right here — currently just Enter-to-commit on single-line
 * inputs.
 */
export class ChessFieldShield extends LifeCycleWatcher {
  static override key = 'affine-chess-field-shield';

  private readonly _shield = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest(FIELD_SELECTOR)) {
      return;
    }

    // React's own key handlers are starved along with the editor's, so the
    // one keyboard nicety the fields rely on is implemented here.
    if (
      event.type === 'keydown' &&
      (event as KeyboardEvent).key === 'Enter' &&
      target instanceof HTMLInputElement
    ) {
      target.blur();
    }

    event.stopPropagation();
  };

  override mounted() {
    super.mounted();
    for (const type of SHIELDED_EVENTS) {
      window.addEventListener(type, this._shield, true);
    }
  }

  override unmounted() {
    super.unmounted();
    for (const type of SHIELDED_EVENTS) {
      window.removeEventListener(type, this._shield, true);
    }
  }
}
