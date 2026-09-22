/**
 * bassEmphasis — make the existing bass line hit harder.
 *
 * Phase 2 of `thoughts/shared/plans/2026-09-22-bass-as-musical-target.md`.
 *
 * Three low-end gestures exist and they mean different things, which is why
 * this is not folded into either of the others:
 *
 *   bassEmphasis  the bass line that is already playing becomes dominant.
 *                 DRY. Nothing is added; what is there is lifted.
 *   bassThrow     the bass goes into the dub return path for a moment. WET.
 *   subSwell      a low event is ADDED underneath a return. A new sound.
 *
 * ## The shape
 *
 * A low shelf on the master-insert dry path — `masterBassPunchDb`, which the
 * bus keeps OUTSIDE the echo feedback loop, so lifting the low end here cannot
 * feed the regeneration and cannot run away. Corner between 80 and 120 Hz,
 * chosen from the target channel's own register. Alongside it a small low-mid
 * dip, because taking a little out around the mid scoop is what makes the bass
 * read as louder without spending the dB (the plan: "so the bass feels louder
 * without enormous gain").
 *
 * The amount is NOT a constant. It comes from `bassEmphasisShape`, which
 * scales the plan's +2..4 dB range by the low-frequency headroom left in the
 * energy budget and by how convincingly the target reads as the low end.
 *
 * Eased in over a quarter of the gesture, held, eased out over a quarter —
 * smoothstep, so neither end has a corner in it.
 *
 * Two things follow from borrowing the desk's own controls rather than
 * building a second EQ, and both are deliberate:
 *
 *  - `midScoopGainDb` is shared by the master path and the wet bus, so the
 *    cleanup dips both. That is what a mid scoop IS on a desk, and it comes
 *    back with everything else.
 *  - `masterBassPunchDb` only reaches a filter while the bus is enabled and
 *    the master insert is wired. With the bus off the setting is stored and
 *    restored but nothing is heard — the same as every other master-side
 *    control, and it takes effect the moment the bus comes up.
 *
 * ## Refusing
 *
 * > Never boost bass merely because the bass is currently quiet.
 *
 * WHEN to fire is `bassOpportunity`'s decision and this move does not
 * second-guess it. What this move does guarantee is that it cannot be pointed
 * at the wrong thing: with no channel, with no song to profile, or with a
 * channel that does not read as the low end, it fires nothing at all. A move
 * that boosts an arbitrary channel because it was handed an arbitrary number
 * is worse than a move that does nothing.
 *
 * ## Releasing
 *
 * A bass emphasis that fails to release is a permanently altered mix. So the
 * restore path is built first and defended three ways: the settings are
 * snapshotted before the first write, the envelope releases itself after its
 * own length whether or not anyone calls `dispose`, and `dispose` is
 * idempotent. Whichever arrives first restores; the other is a no-op.
 */

import type { DubMove } from './_types';
import type { DubBusSettings } from '@/types/dub';
import { getDubTargetProfiles } from '../channelProfiles';
import { BASS_TARGET_THRESHOLD } from '@/lib/dub/bassState';
import {
  bassEmphasisShape,
  bassEmphasisEase,
  UNMEASURED_HEADROOM,
} from '@/lib/dub/bassEmphasisShape';

/** Bus settings the gesture borrows. Claimed so a mirror push cannot revert them. */
const OWNED_KEYS: string[] = ['masterBassPunchDb', 'bassShelfFreqHz', 'midScoopGainDb'];

/**
 * Envelope step, ms.
 *
 * The bus ramps every biquad write over 50 ms, so steps this far apart chain
 * into a continuous ramp rather than a staircase. Roughly 25 writes a second
 * while the gesture is moving, and none at all while it sits at the top.
 */
const STEP_MS = 40;

const barMsAt = (bpm: number): number => (60000 / Math.max(30, Math.min(300, bpm))) * 4;

export const bassEmphasis: DubMove = {
  id: 'bassEmphasis',
  kind: 'hold',
  defaults: {
    /** Gesture length in bars. The plan says one to two. */
    holdBars: 2,
    /**
     * Share of the low-frequency-risk budget still free, 0..1.
     *
     * A caller holding an `EnergyLedger` passes the real figure from
     * `bassEmphasisHeadroom`. The default is what the budget allows with
     * nothing else in the air — never 1, because a performer that cannot see
     * the ledger should not push hardest.
     */
    headroom: UNMEASURED_HEADROOM,
  },

  execute({ bus, channelId, params, bpm }) {
    // ── Refuse anything that is not the bass ────────────────────────────
    if (channelId === undefined) {
      console.warn('[bassEmphasis] no target channel — doing nothing');
      return null;
    }
    const target = getDubTargetProfiles().find(p => p.channelId === channelId) ?? null;
    if (!target) {
      console.warn(
        `[bassEmphasis] ch${channelId} cannot be profiled (no song loaded?) — doing nothing`,
      );
      return null;
    }
    if (target.targets.bassEmphasis < BASS_TARGET_THRESHOLD) {
      console.warn(
        `[bassEmphasis] ch${channelId} does not read as the low end `
        + `(${target.targets.bassEmphasis.toFixed(2)} < ${BASS_TARGET_THRESHOLD}) — doing nothing`,
      );
      return null;
    }

    const shape = bassEmphasisShape({
      register: target.identity.register.value,
      bassEmphasisTarget: target.targets.bassEmphasis,
      headroom: params.headroom ?? this.defaults.headroom,
      holdBars: params.holdBars ?? this.defaults.holdBars,
    });

    // ── Snapshot before the first write ─────────────────────────────────
    const prior = bus.getSettings() as DubBusSettings;
    const priorPunch = prior.masterBassPunchDb ?? 0;
    const priorFreq = prior.bassShelfFreqHz;
    const priorScoop = prior.midScoopGainDb ?? 0;

    // The bus drops writes to keys a move owns — including the move's own —
    // so each step hands ownership back for the one write and takes it again
    // immediately. Ownership is what protects the value while the envelope is
    // NOT writing, which is most of the gesture.
    let unclaim = bus.claimSettingKeys(OWNED_KEYS);
    const write = (patch: Partial<DubBusSettings>): void => {
      unclaim();
      bus.setSettings(patch);
      unclaim = bus.claimSettingKeys(OWNED_KEYS);
    };

    // Corner first and once: it does not move during the gesture, and sliding
    // a shelf's frequency under a listener is a different effect entirely.
    write({ bassShelfFreqHz: shape.freqHz });

    const barMs = barMsAt(bpm);
    const attackMs = Math.max(STEP_MS, shape.attackBars * barMs);
    const releaseMs = Math.max(STEP_MS, shape.releaseBars * barMs);
    const totalMs = shape.holdBars * barMs;
    // What is left for the top of the gesture once both eases are paid for.
    const sustainMs = Math.max(0, totalMs - attackMs - releaseMs);

    /** Apply the envelope at `level` (0 = the user's mix, 1 = full emphasis). */
    const applyLevel = (level: number): void => {
      write({
        masterBassPunchDb: priorPunch + shape.gainDb * level,
        midScoopGainDb: priorScoop - shape.cleanupDb * level,
      });
    };

    let timer: ReturnType<typeof setInterval> | null = null;
    let endTimer: ReturnType<typeof setTimeout> | null = null;
    let finished = false;
    /** Hand the mix back. Exactly once, from whichever path gets here first. */
    const finish = (): void => {
      if (finished) return;
      finished = true;
      if (timer !== null) { clearInterval(timer); timer = null; }
      if (endTimer !== null) { clearTimeout(endTimer); endTimer = null; }
      // Ownership goes back BEFORE the restoring write, or the bus drops it
      // and the mix keeps the boost for the rest of the session.
      unclaim();
      bus.setSettings({
        masterBassPunchDb: priorPunch,
        bassShelfFreqHz: priorFreq,
        midScoopGainDb: priorScoop,
      });
    };

    const startedAt = Date.now();
    /** Set when a release begins: the ms at which the fall started. */
    let releasingFrom: number | null = null;
    /** Level the release started from, so a short hold falls from where it was. */
    let releaseLevel = 0;

    const tick = (): void => {
      if (finished) return;
      const now = Date.now();
      if (releasingFrom === null) {
        const elapsed = now - startedAt;
        if (elapsed >= attackMs + sustainMs) {
          // Ran its own length with nobody releasing it: release itself.
          beginRelease(1);
          return;
        }
        if (elapsed >= attackMs) {
          applyLevel(1);   // the top; cheap because the bus drops equal writes
          return;
        }
        applyLevel(bassEmphasisEase(elapsed / attackMs));
        return;
      }
      const fallen = (now - releasingFrom) / releaseMs;
      if (fallen >= 1) { finish(); return; }
      applyLevel(releaseLevel * bassEmphasisEase(1 - fallen));
    };

    /** Start the eased fall from `level`, then restore when it lands. */
    const beginRelease = (level: number): void => {
      if (finished || releasingFrom !== null) return;
      releasingFrom = Date.now();
      releaseLevel = level;
      // A backstop in case the interval is starved: the restore must not
      // depend on a timer that fires on time.
      endTimer = setTimeout(finish, releaseMs + STEP_MS * 2);
    };

    applyLevel(0);
    timer = setInterval(tick, STEP_MS);

    return {
      dispose() {
        if (finished) return;
        if (releasingFrom !== null) return;   // already falling; let it land
        const elapsed = Date.now() - startedAt;
        const reached = elapsed >= attackMs ? 1 : bassEmphasisEase(elapsed / attackMs);
        beginRelease(reached);
      },
    };
  },
};
