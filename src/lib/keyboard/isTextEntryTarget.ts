/**
 * Whether a key event belongs to something the user is typing into, so
 * note entry, shortcuts and the keyboard router leave it alone.
 *
 * Covers native fields, contenteditable, CodeMirror (its root div takes focus
 * after Tab, the contenteditable is an inner child), and any element marked
 * `data-captures-typing`: a surface that takes typed text without being an
 * <input>, such as the jukebox list, whose filter is typed straight into the
 * list. Without the marker every letter typed there also played a note.
 *
 * Only inputs that take typed text count. A focused slider, checkbox or button
 * takes no text, and treating it as a field silently handed the tracker's
 * navigation keys to the browser: after one click on the master volume slider,
 * every PageDown meant for the pattern lowered the master 6 dB instead.
 */
const NON_TEXT_INPUT_TYPES = new Set([
  'range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file', 'image',
]);

export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function') return false;
  const el = target as HTMLElement;
  const tag = el.tagName;
  // A non-text input still counts inside a marked surface (a load dialog
  // traps every key, whatever control has focus).
  if (tag === 'INPUT' && !NON_TEXT_INPUT_TYPES.has((el as HTMLInputElement).type)) return true;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return !!el.closest('.cm-editor, [data-captures-typing]');
}
