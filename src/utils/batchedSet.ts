/**
 * batchedSet — Throttles Zustand store writes for continuous controls.
 *
 * Problem: knob/fader drags fire onChange at ~60fps. Each call does
 * Immer produce + Zustand subscriber notification + React reconciliation.
 * With 50+ subscribers, that blocks the main thread → audio glitches.
 *
 * Solution: collect mutations keyed by identity (e.g. "ch3-vol", "inst-1"),
 * flush them all in ONE setState call per animation frame. Audio engine
 * calls happen immediately outside this — only the React-facing store
 * write is batched.
 *
 * Usage:
 *   const batch = createBatchedSet(set);          // in store init
 *   batch('ch3-vol', s => { s.channels[3].volume = 0.8; });  // in action
 */

type ImmerMutation<S> = (state: S) => void;

interface BatchedSet<S> {
  /** Queue a mutation. `key` deduplicates: latest mutation per key wins. */
  (key: string, mutation: ImmerMutation<S>): void;
  /** Force-flush all pending mutations immediately (e.g. on unmount). */
  flush(): void;
}

/**
 * Create a batched setter for a Zustand+Immer store.
 *
 * @param set — the `set` function from the store's `create(immer((set) => ...))`.
 *              Must accept `(state: S) => void` (Immer draft mutation).
 */
export function createBatchedSet<S>(
  set: (fn: ImmerMutation<S>) => void,
): BatchedSet<S> {
  const pending = new Map<string, ImmerMutation<S>>();
  let scheduled = false;

  function flush(): void {
    scheduled = false;
    if (pending.size === 0) return;
    const mutations = [...pending.values()];
    pending.clear();
    // Single setState → single Immer produce → single subscriber broadcast
    set((state: S) => {
      for (const m of mutations) m(state);
    });
  }

  function batchedSet(key: string, mutation: ImmerMutation<S>): void {
    pending.set(key, mutation); // last-write-wins per key
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(flush);
    }
  }

  batchedSet.flush = flush;
  return batchedSet;
}
