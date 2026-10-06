/**
 * Whether a key event belongs to something the user is typing into, so
 * note entry, shortcuts and the keyboard router leave it alone.
 *
 * Covers native fields, contenteditable, CodeMirror (its root div takes focus
 * after Tab, the contenteditable is an inner child), and any element marked
 * `data-captures-typing`: a surface that takes typed text without being an
 * <input>, such as the jukebox list, whose filter is typed straight into the
 * list. Without the marker every letter typed there also played a note.
 */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function') return false;
  const el = target as HTMLElement;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return !!el.closest('.cm-editor, [data-captures-typing]');
}
