import { LifeCycleWatcher } from '@blocksuite/affine/std';

/**
 * Marks an input the editor must keep its hands off. The shield below stops
 * events targeting anything carrying this attribute before the editor's own
 * listeners — document-level, capture-phase included — ever see them.
 */
export const CHESS_FIELD_ATTR = 'data-chess-field';

const FIELD_SELECTOR = `[${CHESS_FIELD_ATTR}]`;

type EditableField = HTMLInputElement | HTMLTextAreaElement;

/**
 * Live tally of what actually reaches the chess fields, shown in the PGN
 * editor's status line.
 *
 * On the machine that reported the bug, keystrokes died with the field focused
 * and the app blameless — something registered before the app (an extension's
 * content script, security tooling) was cancelling them. These three numbers
 * split that world cleanly: keys seen at all, keys that arrived already
 * default-prevented, and edits the shield re-created by hand.
 */
export const chessFieldStats = {
  /** `keydown` events the shield saw targeting a chess field. */
  keys: 0,
  /** Of those, how many arrived with their default action already cancelled. */
  blocked: 0,
  /** Edits performed manually because the default was not going to run. */
  healed: 0,
};

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

/** The field an event is aimed at, or null when it is none of our business. */
function fieldOf(target: EventTarget | null): EditableField | null {
  if (!(target instanceof Element)) return null;
  const field = target.closest(FIELD_SELECTOR);
  return field instanceof HTMLInputElement ||
    field instanceof HTMLTextAreaElement
    ? field
    : null;
}

function isEditable(field: EditableField): boolean {
  return !field.readOnly && !field.disabled;
}

/**
 * Performs an edit the browser was supposed to make and did not, then raises
 * the `input` event React's onChange rides on. `setRangeText` bypasses the
 * value setter React instruments, so React's tracker still sees the change and
 * does not swallow the notification.
 */
function replaceSelection(
  field: EditableField,
  text: string,
  inputType: string,
  start?: number,
  end?: number
) {
  const from = start ?? field.selectionStart ?? field.value.length;
  const to = end ?? field.selectionEnd ?? from;
  field.setRangeText(text, from, to, 'end');
  field.dispatchEvent(
    new InputEvent('input', { bubbles: true, inputType, data: text || null })
  );
}

/**
 * Re-creates the default action of a keystroke whose default was cancelled.
 *
 * Only the editing basics are covered: characters, line breaks, deletion, and
 * the select-all/copy/cut/paste shortcuts. Anything else — arrows, home/end,
 * undo — is left alone rather than imitated badly; those defaults are also far
 * less commonly cancelled, since interceptors go after the text itself.
 */
function healKeydown(field: EditableField, event: KeyboardEvent): boolean {
  if (!isEditable(field) || event.isComposing) return false;

  const combo = event.ctrlKey || event.metaKey;
  if (combo && !event.altKey) {
    const key = event.key.toLowerCase();
    if (key === 'a') {
      field.select();
      return true;
    }
    if (key === 'v') {
      // Async by necessity; the insertion lands a beat later.
      navigator.clipboard
        .readText()
        .then(text => {
          if (text) replaceSelection(field, text, 'insertFromPaste');
        })
        .catch(() => {});
      return true;
    }
    if (key === 'c' || key === 'x') {
      const start = field.selectionStart ?? 0;
      const end = field.selectionEnd ?? 0;
      const chosen = field.value.slice(start, end);
      if (!chosen) return false;
      navigator.clipboard.writeText(chosen).catch(() => {});
      if (key === 'x') replaceSelection(field, '', 'deleteByCut');
      return true;
    }
    return false;
  }
  if (combo || event.altKey) return false;

  const { key } = event;
  if (key.length === 1) {
    replaceSelection(field, key, 'insertText');
    return true;
  }
  if (key === 'Enter' && field instanceof HTMLTextAreaElement) {
    replaceSelection(field, '\n', 'insertLineBreak');
    return true;
  }
  if (key === 'Backspace' || key === 'Delete') {
    const start = field.selectionStart ?? 0;
    const end = field.selectionEnd ?? 0;
    if (start !== end) {
      replaceSelection(field, '', 'deleteContentBackward');
    } else if (key === 'Backspace' && start > 0) {
      replaceSelection(field, '', 'deleteContentBackward', start - 1, start);
    } else if (key === 'Delete' && end < field.value.length) {
      replaceSelection(field, '', 'deleteContentForward', end, end + 1);
    }
    return true;
  }
  return false;
}

/** The clipboard counterpart of {@link healKeydown}. */
function healClipboard(field: EditableField, event: ClipboardEvent): boolean {
  if (!isEditable(field)) return false;

  if (event.type === 'paste') {
    const text = event.clipboardData?.getData('text/plain');
    if (!text) return false;
    replaceSelection(field, text, 'insertFromPaste');
    return true;
  }

  const start = field.selectionStart ?? 0;
  const end = field.selectionEnd ?? 0;
  const chosen = field.value.slice(start, end);
  if (!chosen) return false;
  navigator.clipboard.writeText(chosen).catch(() => {});
  if (event.type === 'cut') replaceSelection(field, '', 'deleteByCut');
  return true;
}

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
 * This is also the last observation point before the default action, which
 * makes it the one place where `event.defaultPrevented` is a verdict: true
 * here means some listener registered before the app — an extension's content
 * script, security software — has already cancelled the edit, and nothing
 * downstream can revive it. When that verdict comes in, the shield performs
 * the edit itself. On a healthy machine that branch is never taken.
 *
 * The cost is that nothing else hears these events either, including our own
 * React handlers on the fields. Anything a field needs beyond browser defaults
 * has to live right here — Enter-to-commit on single-line inputs, and the
 * healing above.
 */
export class ChessFieldShield extends LifeCycleWatcher {
  static override key = 'affine-chess-field-shield';

  private readonly _shield = (event: Event) => {
    const field = fieldOf(event.target);
    if (!field) return;

    if (event.type === 'keydown') {
      const keyEvent = event as KeyboardEvent;
      chessFieldStats.keys++;
      if (keyEvent.key === 'Enter' && field instanceof HTMLInputElement) {
        // Enter commits a single-line field. React's own key handlers are
        // starved along with the editor's, so it is implemented here.
        field.blur();
      } else if (event.defaultPrevented) {
        chessFieldStats.blocked++;
        if (healKeydown(field, keyEvent)) chessFieldStats.healed++;
      }
    } else if (
      (event.type === 'paste' ||
        event.type === 'cut' ||
        event.type === 'copy') &&
      event.defaultPrevented &&
      healClipboard(field, event as ClipboardEvent)
    ) {
      chessFieldStats.healed++;
    }

    // Immediate: a same-node listener registered after this one is still the
    // editor's, and it must not see the event either.
    event.stopImmediatePropagation();
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
