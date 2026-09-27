/**
 * The crash-recovery prompt, made visible to anything outside React.
 *
 * Found 2026-09-18: a DEViLBOX dialog was on screen — the boot-time
 * Restore/Discard prompt for unsaved work — while `get_modal_state` reported
 * `modalOpen: null` and `dismiss_modal` answered "No modal was open". Both
 * read `useUIStore.modalOpen`, and this prompt is driven by
 * `useProjectPersistence`'s own `useState`, so neither could see it. A tool
 * that reports the UI incorrectly is the same class of fault as X8's stale
 * descriptions.
 *
 * The prompt registers itself here while it is open, the way `DubRouter` and
 * the performance journal already take registrations rather than importing
 * their callers.
 *
 * Deliberately NOT wired into `dismiss_modal`. Dismissing this dialog means
 * choosing between restoring and DISCARDING unsaved work, and a general
 * "close whatever is open" must never silently throw away a take nobody has
 * saved. The choice gets its own explicit call.
 */

export interface RecoveryPromptActions {
  /** Load the recovered snapshot, replacing what is open. */
  restore(): void;
  /** Throw the snapshot away. Destructive — only on an explicit choice. */
  discard(): void;
  /** Anything worth showing about what is on offer. */
  describe?(): { name?: string; savedAt?: string } | null;
}

let _prompt: RecoveryPromptActions | null = null;
const _openListeners = new Set<() => void>();

/** Called by the prompt as it mounts, and with `null` as it goes. */
export function setRecoveryPrompt(actions: RecoveryPromptActions | null): void {
  _prompt = actions;
  if (actions) for (const fn of _openListeners) { try { fn(); } catch { /* listener's problem */ } }
}

/** Be told whenever the prompt opens. Returns the unsubscribe. */
export function onRecoveryPromptOpen(fn: () => void): () => void {
  _openListeners.add(fn);
  return () => { _openListeners.delete(fn); };
}

export function isRecoveryPromptOpen(): boolean {
  return _prompt !== null;
}

export function describeRecoveryPrompt(): { name?: string; savedAt?: string } | null {
  try {
    return _prompt?.describe?.() ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve the prompt one way or the other.
 *
 * Returns false when there was nothing to resolve, so a caller can tell "I
 * discarded it" from "there was no dialog".
 */
export function resolveRecoveryPrompt(action: 'restore' | 'discard'): boolean {
  const prompt = _prompt;
  if (!prompt) return false;
  if (action === 'restore') prompt.restore();
  else prompt.discard();
  return true;
}
