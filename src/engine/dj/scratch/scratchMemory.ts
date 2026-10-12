/**
 * Performance memory and cooldowns (owner plan `thoughts/shared/plans/2026-10-08-dj-view-scratch-plan.md`
 * sections 53, 54, 89, 90; ledger SCR-P6.6, P6.7).
 *
 * A bounded ring of what the performer did (gesture, source, routine, intensity, transition
 * type, the section it played in and the next one) plus the quality each phrase scored. It
 * answers three questions, all deterministic and transparent (section 90: no machine learning):
 *
 *   is this gesture / source / routine / intensity tier / performance type cooling down?
 *   how much does memory prefer this source + gesture here? (a pairing that scored >= 0.8 at
 *     the same section change +0.1, one that scored <= 0.4 -0.2, the pairing just played -1)
 *   what was used recently? (the scratch context's `recentGestures/Sources/Routines`)
 */

import type { ScratchGestureId } from './scratchTypes';

export const MEMORY_SIZE = 16;

/** Section 54 cooldowns in bars. */
export const GESTURE_COOLDOWN_BARS: Readonly<Partial<Record<ScratchGestureId, number>>> = {
  crab: 16, eightFingerCrab: 16, scribble: 8, baby: 2, babySlow: 2,
};
export const DEFAULT_GESTURE_COOLDOWN_BARS = 4;
/** Keyed by the source key (`crate:<record>` etc.) or the bare record id. */
export const SOURCE_COOLDOWN_BARS: Readonly<Record<string, number>> = { AH_STANDARD: 8 };
export const DEFAULT_SOURCE_COOLDOWN_BARS = 4;
export const ROUTINE_COOLDOWN_BARS = 16;
export const INTENSITY_COOLDOWN_BARS: Readonly<Record<'feature', number>> = { feature: 32 };
export const PERFORMANCE_COOLDOWN_BARS: Readonly<Record<'battle', number>> = { battle: 64 };

/** Section 90 preference steps. */
export const GOOD_PAIRING = 0.8;
export const POOR_PAIRING = 0.4;
export const GOOD_PAIRING_BONUS = 0.1;
export const POOR_PAIRING_PENALTY = -0.2;
export const REPEAT_PAIRING_PENALTY = -1;

export interface ScratchMemoryEntry {
  bar: number;
  gesture: ScratchGestureId;
  sourceKey: string;
  routine?: string;
  /** 0..1 stroke intensity. */
  intensity: number;
  transitionType?: string;
  section: string;
  nextSection?: string;
}

const recordIdOf = (sourceKey: string): string => sourceKey.replace(/^crate:/, '');
const pairingKey = (sourceKey: string, gesture: string, section: string, next = ''): string => `${sourceKey}+${gesture}@${section}->${next}`;

export class ScratchMemory {
  private ring: ScratchMemoryEntry[] = [];
  private lastGesture = new Map<string, number>();
  private lastSource = new Map<string, number>();
  private lastRoutine = new Map<string, number>();
  private lastTier = new Map<string, number>();
  private lastPerformance = new Map<string, number>();
  /** Pairing -> best quality it scored (and how often it played). */
  private pairings = new Map<string, { quality: number; count: number }>();
  private lastPair: string | null = null;

  get entries(): readonly ScratchMemoryEntry[] { return this.ring; }

  record(e: ScratchMemoryEntry): void {
    this.ring.push(e);
    if (this.ring.length > MEMORY_SIZE) this.ring.shift();
    this.lastGesture.set(e.gesture, e.bar);
    this.lastSource.set(e.sourceKey, e.bar);
    if (e.routine) this.lastRoutine.set(e.routine, e.bar);
    const pk = `${e.sourceKey}+${e.gesture}`;
    this.lastPair = pk;
    const k = pairingKey(e.sourceKey, e.gesture, e.section, e.nextSection);
    const p = this.pairings.get(k);
    this.pairings.set(k, { quality: p?.quality ?? -1, count: (p?.count ?? 0) + 1 });
  }

  /** A feature / battle performed at `bar` (the intensity tier and performance type cooldowns). */
  recordPerformance(kind: 'feature' | 'battle', bar: number): void {
    this.lastTier.set('feature', bar);
    if (kind === 'battle') this.lastPerformance.set('battle', bar);
  }

  /** The quality a phrase scored (section 89), credited to every pairing it played. */
  recordQuality(entries: readonly ScratchMemoryEntry[], quality: number): void {
    for (const e of entries) {
      const k = pairingKey(e.sourceKey, e.gesture, e.section, e.nextSection);
      const p = this.pairings.get(k) ?? { quality: -1, count: 0 };
      this.pairings.set(k, { quality: Math.max(p.quality, quality), count: p.count });
    }
  }

  private ready(map: Map<string, number>, key: string, cooldown: number, bar: number): boolean {
    const last = map.get(key);
    return last === undefined || bar - last >= cooldown || bar < last;
  }

  gestureReady(g: ScratchGestureId, bar: number): boolean {
    return this.ready(this.lastGesture, g, GESTURE_COOLDOWN_BARS[g] ?? DEFAULT_GESTURE_COOLDOWN_BARS, bar);
  }
  sourceReady(sourceKey: string, bar: number): boolean {
    return this.ready(this.lastSource, sourceKey, SOURCE_COOLDOWN_BARS[sourceKey] ?? SOURCE_COOLDOWN_BARS[recordIdOf(sourceKey)] ?? DEFAULT_SOURCE_COOLDOWN_BARS, bar);
  }
  routineReady(name: string, bar: number): boolean {
    return this.ready(this.lastRoutine, name, ROUTINE_COOLDOWN_BARS, bar);
  }
  featureReady(bar: number): boolean {
    return this.ready(this.lastTier, 'feature', INTENSITY_COOLDOWN_BARS.feature, bar);
  }
  battleReady(bar: number): boolean {
    return this.ready(this.lastPerformance, 'battle', PERFORMANCE_COOLDOWN_BARS.battle, bar);
  }

  /** Gestures cooling down at `bar` (the planner leaves them out). */
  coolingGestures(bar: number, among: readonly ScratchGestureId[]): ScratchGestureId[] {
    return among.filter((g) => !this.gestureReady(g, bar));
  }

  /**
   * Section 53 / 90 preference for playing `gesture` on `sourceKey` at this section change: the
   * pairing just played -1 (vary it, or rest), a pairing that scored >= 0.8 here +0.1, one that
   * scored <= 0.4 -0.2, otherwise 0.
   */
  preference(sourceKey: string, gesture: ScratchGestureId, section: string, nextSection?: string): number {
    if (this.lastPair === `${sourceKey}+${gesture}`) return REPEAT_PAIRING_PENALTY;
    const p = this.pairings.get(pairingKey(sourceKey, gesture, section, nextSection));
    if (!p || p.quality < 0) return 0;
    if (p.quality >= GOOD_PAIRING) return GOOD_PAIRING_BONUS;
    if (p.quality <= POOR_PAIRING) return POOR_PAIRING_PENALTY;
    return 0;
  }

  /** How many times this pairing has played in the ring (repetition, section 52). */
  timesPlayed(sourceKey: string, gesture: ScratchGestureId): number {
    return this.ring.filter((e) => e.sourceKey === sourceKey && e.gesture === gesture).length;
  }

  recent(): { recentGestures: string[]; recentSources: string[]; recentRoutines: string[] } {
    return {
      recentGestures: this.ring.map((e) => e.gesture),
      recentSources: this.ring.map((e) => e.sourceKey),
      recentRoutines: this.ring.flatMap((e) => (e.routine ? [e.routine] : [])),
    };
  }
}
