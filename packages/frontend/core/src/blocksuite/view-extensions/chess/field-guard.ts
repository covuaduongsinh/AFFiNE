/**
 * Keeps events inside a chess field from doubling as editor commands.
 *
 * The editor listens at two points of the bubble path, and a field has to cut
 * an event off before the relevant one:
 *
 *   field → … → editor-host → #app (React root) → document → window
 *
 * Keyboard and clipboard handling (including the clipboard controller that
 * would `preventDefault()` a paste and paste into the document instead) sits
 * on `document`, past React's root, so the React handlers below stop those in
 * time. Pointer handling sits on `editor-host`, *before* React's root — only
 * a listener on the element itself runs early enough, which is what
 * {@link guardFieldPointer} attaches. The built-in caption editor stops the
 * same events, natively on its textarea
 * (`blocksuite/affine/components/src/caption/block-caption.ts`).
 */
export const stopPropagation = (event: { stopPropagation: () => void }) =>
  event.stopPropagation();

export const nestedFieldEvents = {
  onCut: stopPropagation,
  onCopy: stopPropagation,
  onPaste: stopPropagation,
  onKeyDown: stopPropagation,
  onKeyUp: stopPropagation,
} as const;

/** Pointer events the editor host would otherwise read as block gestures. */
const POINTER_EVENTS = [
  'pointerdown',
  'pointerup',
  'mousedown',
  'mouseup',
  'click',
  'dblclick',
] as const;

/**
 * Ref callback attaching the pointer half of the field guard — see the note
 * on {@link nestedFieldEvents} for why this half cannot be React props.
 *
 * A click that arrives without having granted focus (an upstream `mousedown`
 * `preventDefault()` suppresses caret placement but not the click) claims it
 * by hand. Attach-once by marker: ref callbacks re-run on every commit of a
 * keyed field, and the listeners must not stack.
 */
export const guardFieldPointer = (field: HTMLElement | null) => {
  if (!field || field.dataset.chessPointerGuard === 'true') return;
  field.dataset.chessPointerGuard = 'true';
  const guard = (event: Event) => {
    event.stopPropagation();
    if (event.type === 'click' && document.activeElement !== field) {
      field.focus();
    }
  };
  for (const type of POINTER_EVENTS) field.addEventListener(type, guard);
};
