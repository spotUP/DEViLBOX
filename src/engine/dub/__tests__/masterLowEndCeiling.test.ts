import { describe, it, expect } from 'vitest';

/**
 * The BASS slider must never be silently dead.
 *
 * `bassShelfGainDb` and `masterBassPunchDb` were summed into one node and the
 * total clamped to +9 dB. The shipped defaults are 9 + 6 = 15, so the master
 * shelf arrived already pinned at the ceiling and the slider did nothing from
 * +3 upward — nine dB of a twenty-four dB control. Measured against the live
 * bus on 2026-09-22:
 *
 *     bassShelfGainDb  0  ->  shelf node  6 dB
 *     bassShelfGainDb  3  ->  shelf node  9 dB   (cap)
 *     bassShelfGainDb  9  ->  shelf node  9 dB   (cap, from 15)
 *
 * Reported as "i expect more bass when i pull the bass slider but i dont get
 * more bass", and "a dub producer needs to have HEAVY bass".
 *
 * A ceiling is still needed — the insert only ever ADDS level, and uncapped it
 * produced "the dub bus clipping and disting most of the time" (2026-09-18).
 * What changed is who pays for it: BASS always gets exactly what it asks for,
 * and PUNCH gives way.
 *
 * This mirrors the arithmetic in `DubBus._applySettings`. A DubBus cannot be
 * constructed under happy-dom (no AudioWorklet registry), and the rule is
 * worth pinning on its own — it is the thing that was wrong.
 */

const MASTER_LOW_CEILING_DB = 18;

/** Exactly the clamp `_applySettings` performs. */
function resolveLowEnd(bassShelfGainDb: number, masterBassPunchDb: number) {
  const safeBassGain = Math.max(-12, Math.min(12, bassShelfGainDb));
  const wantPunch = Math.max(-18, Math.min(18, masterBassPunchDb));
  const punchHeadroom = Math.max(0, MASTER_LOW_CEILING_DB - Math.max(0, safeBassGain));
  const punch = wantPunch > 0 ? Math.min(wantPunch, punchHeadroom) : wantPunch;
  return { shelf: safeBassGain, punch, total: safeBassGain + punch };
}

describe('the BASS control', () => {
  it('reaches the shelf unmodified, at every point in its travel', () => {
    for (const db of [-12, -6, 0, 3, 6, 9, 12]) {
      expect(resolveLowEnd(db, 6).shelf, `bass ${db}`).toBe(db);
    }
  });

  it('is never flattened by where PUNCH happens to sit', () => {
    // The exact failure: with punch at its default the slider died above +3.
    const a = resolveLowEnd(3, 6);
    const b = resolveLowEnd(9, 6);
    const c = resolveLowEnd(12, 6);
    expect(a.shelf).toBe(3);
    expect(b.shelf).toBe(9);
    expect(c.shelf).toBe(12);
    // And each step is audibly different in total, not the same 9 dB.
    expect(b.total).toBeGreaterThan(a.total);
    expect(c.total).toBeGreaterThan(b.total);
  });

  it('gets heavy — dub is drums and bass', () => {
    expect(resolveLowEnd(12, 6).total).toBe(18);
    // Against the old behaviour, which capped this same request at 9.
    expect(resolveLowEnd(12, 6).total).toBeGreaterThan(9);
  });
});

describe('the ceiling still holds', () => {
  it('never lets the pair exceed the limit', () => {
    for (const bass of [-12, 0, 6, 12]) {
      for (const punch of [-18, 0, 6, 18]) {
        expect(resolveLowEnd(bass, punch).total, `${bass}/${punch}`)
          .toBeLessThanOrEqual(MASTER_LOW_CEILING_DB);
      }
    }
  });

  it('spends the ceiling on PUNCH, not on BASS', () => {
    // Ask for more than the ceiling between them: bass keeps its full value.
    const r = resolveLowEnd(12, 18);
    expect(r.shelf).toBe(12);
    expect(r.punch).toBe(6);
    expect(r.total).toBe(18);
  });

  it('leaves a cut alone — only boosts are rationed', () => {
    // A negative punch is removing weight; there is nothing to protect.
    const r = resolveLowEnd(12, -18);
    expect(r.punch).toBe(-18);
    expect(r.total).toBe(-6);
  });
});
