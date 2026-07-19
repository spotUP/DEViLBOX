/**
 * Cross-pipeline "already handled" sentinel for keyboard events.
 *
 * DEViLBOX has two capture-phase `keydown` listeners on `window` that can both
 * see the same event: the app-wide `useGlobalKeyboardHandler` and the per-view
 * `useTrackerInput` (plus its `useNoteInput` / `useEffectInput` /
 * `useNavigationInput` sub-handlers). Because both are capture-phase on the SAME
 * target, `stopPropagation()` cannot separate them — the second listener still
 * runs. To stop the tracker pipeline from re-executing an action the global
 * handler already performed, the global handler stamps the event and the tracker
 * pipeline bails when it sees the stamp.
 *
 * This was historically an untyped `(e as any).__handled = true` sprinkled across
 * six files. That is duplicated, un-typed magic and there was no test proving the
 * producer flag and the consumer check even used the same property name — a typo
 * on either side would silently reintroduce the double-fire bug. The flag now
 * lives here as two typed helpers over one private symbol-like key, so the
 * producer and every consumer share a single source of truth.
 */

/**
 * The property name the sentinel is stored under. Kept as a named constant so the
 * producer and consumers can never drift apart, and so a regression test can
 * assert the exact contract without stringly-typed guesswork.
 */
export const KEY_HANDLED_PROP = '__handled' as const;

interface KeyHandledCarrier {
  [KEY_HANDLED_PROP]?: boolean;
}

/**
 * Mark a keyboard event as already handled by an upstream (global) pipeline.
 * Downstream tracker handlers will skip it. Idempotent.
 */
export function markKeyHandled(e: KeyboardEvent): void {
  (e as unknown as KeyHandledCarrier)[KEY_HANDLED_PROP] = true;
}

/**
 * True when an upstream pipeline already handled this event. Downstream handlers
 * must return early (without executing or preventing default again) when true.
 */
export function isKeyHandled(e: KeyboardEvent): boolean {
  return (e as unknown as KeyHandledCarrier)[KEY_HANDLED_PROP] === true;
}
