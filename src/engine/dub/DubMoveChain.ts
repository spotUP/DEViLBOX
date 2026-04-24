/**
 * DubMoveChain — compose multiple moves into a single macro.
 *
 * A chain is a sequence of moves with beat-relative offsets, packaged
 * as a single triggerable unit. Assign a chain to a pad or keyboard
 * shortcut to fire compound dub techniques:
 *
 *   "echoBuildUp on skanks → channelMute skanks → filterDrop"
 *
 * The Dubroom tutorial describes these compound techniques as the real
 * art of dub mixing — individual effects are only ingredients.
 */

import { fire } from './DubRouter';

export interface ChainStep {
  /** Beat offset from chain start (0 = immediate) */
  beat: number;
  /** Move ID to fire */
  moveId: string;
  /** Duration in beats (for hold moves). Omit for triggers. */
  holdBeats?: number;
  /** Target channel (undefined = global) */
  channelId?: number;
  /** Per-move param overrides */
  params?: Record<string, number>;
}

export interface DubMoveChain {
  id: string;
  name: string;
  steps: ChainStep[];
}

// ─── Built-in chains ────────────────────────────────────────────────────

export const BUILTIN_CHAINS: DubMoveChain[] = [
  {
    id: 'echoAndDrop',
    name: 'Echo Then Drop',
    steps: [
      { beat: 0, moveId: 'echoThrow', holdBeats: 2 },
      { beat: 2, moveId: 'filterDrop', holdBeats: 2 },
    ],
  },
  {
    id: 'spaceOut',
    name: 'Space Out',
    steps: [
      { beat: 0, moveId: 'ghostReverb', holdBeats: 4 },
      { beat: 0.5, moveId: 'dubSiren', holdBeats: 3 },
      { beat: 3.5, moveId: 'springSlam' },
    ],
  },
  {
    id: 'buildAndRelease',
    name: 'Build And Release',
    steps: [
      { beat: 0, moveId: 'voltageStarve', holdBeats: 3, params: { targetBits: 4 } },
      { beat: 1, moveId: 'eqSweep', holdBeats: 2 },
      { beat: 3, moveId: 'springKick' },
      { beat: 3.5, moveId: 'dubStab' },
    ],
  },
  {
    id: 'dubSiren',
    name: 'Siren And Echo',
    steps: [
      { beat: 0, moveId: 'dubSiren', holdBeats: 4 },
      { beat: 2, moveId: 'echoThrow', holdBeats: 2 },
      { beat: 4, moveId: 'springSlam' },
    ],
  },
  {
    id: 'metalRhythm',
    name: 'Metal Rhythm',
    steps: [
      { beat: 0, moveId: 'ringMod', holdBeats: 2, params: { freq: 220 } },
      { beat: 0, moveId: 'echoThrow', holdBeats: 2 },
      { beat: 2, moveId: 'springKick' },
    ],
  },
];

// ─── Chain runner ───────────────────────────────────────────────────────

interface ActiveHold {
  dispose: () => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Execute a move chain. Returns a cancel function that cleans up
 * all pending timers and releases all active holds.
 */
export function runChain(chain: DubMoveChain, bpm: number): () => void {
  const beatMs = 60_000 / Math.max(30, bpm);
  const timers: ReturnType<typeof setTimeout>[] = [];
  const activeHolds: ActiveHold[] = [];
  let cancelled = false;

  for (const step of chain.steps) {
    const startMs = step.beat * beatMs;

    const timer = setTimeout(() => {
      if (cancelled) return;

      const handle = fire(step.moveId, step.channelId, step.params ?? {}, 'live');

      if (handle && step.holdBeats) {
        const holdMs = step.holdBeats * beatMs;
        const releaseTimer = setTimeout(() => {
          if (!cancelled) handle.dispose();
        }, holdMs);
        activeHolds.push({ dispose: handle.dispose, timer: releaseTimer });
        timers.push(releaseTimer);
      }
    }, startMs);

    timers.push(timer);
  }

  return () => {
    cancelled = true;
    for (const t of timers) clearTimeout(t);
    for (const h of activeHolds) {
      clearTimeout(h.timer);
      try { h.dispose(); } catch { /* ok */ }
    }
    timers.length = 0;
    activeHolds.length = 0;
  };
}
