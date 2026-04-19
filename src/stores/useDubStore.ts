/**
 * useDubStore — Phase 1 of Tracker Dub Studio.
 *
 * Owns dub state that doesn't belong in useDrumPadStore:
 *   - armed: whether live move performances get captured into the current
 *     pattern's dubLane by DubRecorder.
 *   - lastCapturedAt: timestamp of the most recent capture, used by the REC
 *     indicator to flash on each successful write.
 *
 * Bus settings (enabled, echo intensity, spring wet, etc.) still live in
 * useDrumPadStore for now — both consumers read from there. A later phase
 * can unify when the tracker starts writing those too.
 *
 * Writes are rAF-batched via scheduleDubStoreSync so the recorder can
 * capture at audio-rate (dozens of events per second during rapid-fire
 * performance) without stampeding zustand updates.
 */

import { create } from 'zustand';

interface DubStore {
  /** When true, DubRecorder captures live router events into the current
   *  pattern's dubLane. Live performances always fire audio regardless. */
  armed: boolean;
  setArmed: (v: boolean) => void;

  /** Set to performance.now() by the recorder right after it writes an event.
   *  UI subscribes for a brief REC-indicator flash on every capture. */
  lastCapturedAt: number | null;
  markCaptured: () => void;

  /** Full-Screen Dub Mode toggle. When true, DubFullScreenMode renders over
   *  the tracker view with gig-sized buttons, big KILL, and context-aware
   *  keyboard bindings (no note entry in this mode). Tab toggles. */
  fullScreen: boolean;
  setFullScreen: (v: boolean) => void;
}

export const useDubStore = create<DubStore>((set) => ({
  armed: false,
  setArmed: (v) => set({ armed: v }),

  lastCapturedAt: null,
  markCaptured: () => set({ lastCapturedAt: performance.now() }),

  fullScreen: false,
  setFullScreen: (v) => set({ fullScreen: v }),
}));

/**
 * rAF-batched write helper — modeled on scheduleDJStoreSync (see
 * `CLAUDE.md` > "DJ param writes are rAF-batched"). Use this for any write
 * that might fire at audio-rate (e.g. recorder event writes during fast
 * performing). Callbacks run at most once per animation frame, grouped so
 * all zustand updates in the same frame flush together → single subscriber
 * broadcast per frame.
 */
let _pendingSync: ReturnType<typeof requestAnimationFrame> | null = null;
const _pendingCallbacks: Array<() => void> = [];

export function scheduleDubStoreSync(fn: () => void): void {
  _pendingCallbacks.push(fn);
  if (_pendingSync !== null) return;
  _pendingSync = requestAnimationFrame(() => {
    _pendingSync = null;
    const cbs = _pendingCallbacks.splice(0, _pendingCallbacks.length);
    for (const cb of cbs) {
      try {
        cb();
      } catch (err) {
        console.warn('[useDubStore] scheduled sync callback failed:', err);
      }
    }
  });
}
