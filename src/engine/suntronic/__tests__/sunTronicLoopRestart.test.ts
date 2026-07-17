/**
 * Regression: the sequence loop restart must reload each voice's cursor.
 *
 * Bug (2026-07-17): `loadPosition` handled the two restart cases (position past
 * the end → wrap, and an `entry.trackPtrs[0] === 0` restart marker) by setting
 * `v.position = 0` and RETURNING immediately — without reloading `v.cursor` /
 * `v.transpose` from sequence[0]. So after the song looped, every voice kept its
 * STALE end-of-song cursor and streamed garbage note data for one whole position
 * before the next position increment reloaded it. Audible only on the 2nd loop of
 * full playback (skip-to-position rebuilds the player fresh, so the loop
 * transition never happens and it sounded clean — exactly the user's report:
 * "effects missing on a few notes, only when the full song plays, 2nd loop").
 *
 * The ctor loads position 0 by setting `cursor = entry.trackPtrs[ch]` (line ~275)
 * — the restart must mirror that. The fix falls through both restart paths to the
 * same cursor/transpose load.
 *
 * Fixture: `ready` (the iconic V1.3 tune). Its sequence loops at tick 2555. This
 * probes tick 2570 — 15 ticks into the 2nd loop, inside the position that was
 * garbage pre-fix.
 *
 * Fails-on-revert signatures (restore the early `return` in loadPosition's two
 * restart branches → the stale cursor makes voices 1/2/3 read the SAME data and
 * voice 0 jump an octave):
 *  - voice 0's period stays in its real ~1700 range (pre-fix: collapses to ~200 —
 *    ~3 octaves too high);
 *  - voices 1, 2, 3 hold DISTINCT periods (pre-fix they collapse to one identical
 *    value — the stale-cursor tell: three tracks reading one stream).
 * Cross-checked byte-exact against the UADE AUD PER Paula-log oracle at the seam
 * (native v0 ~1697 == UADE ~1697; pre-fix native v0 ~200 vs UADE ~1700).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSunTronicV13Score } from '@/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../SunTronicPlayer';

const CORPUS = join(__dirname, '../../../../public/data/songs/formats/SUNTronicTunes');
const LOOP_TICK = 2555;      // sequence wraps here (probe-poswrap: pos 31 -> 0)
const PROBE_TICK = 2570;     // 15 ticks into the 2nd loop

describe('SunTronic sequence loop restart reloads the voice cursor', () => {
  const data = new Uint8Array(readFileSync(join(CORPUS, 'ready')));
  const score = parseSunTronicV13Score(data);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const player: any = new (SunTronicPlayer as any)(score);

  let looped = false;
  let probe: { period: number }[] = [];
  for (let t = 0; t <= PROBE_TICK; t++) {
    const snap = player.stepVblankOnce();
    if (t === LOOP_TICK) looped = player.debugVoice(0).position === 0;
    if (t === PROBE_TICK) probe = snap.voices;
  }

  it('has actually crossed the loop restart at tick 2555', () => {
    expect(looped).toBe(true);
  });

  it('keeps voice 0 in its true octave after the loop (not the stale-cursor jump)', () => {
    // Post-fix native v0 ~1697 (== UADE oracle). Pre-fix the stale cursor drops it
    // to ~200 (≈3 octaves up). Assert it stayed a long (low-pitch) period.
    expect(probe[0].period).toBeGreaterThan(1000);
  });

  it('keeps voices 1/2/3 distinct after the loop (no stale-cursor collapse)', () => {
    const [, v1, v2, v3] = probe.map((v) => v.period);
    // Pre-fix all three read the same stale stream → v1 === v2 === v3 (e.g. 356).
    // Post-fix they track independent tracks → at least two of the three differ.
    const distinct = new Set([v1, v2, v3]).size;
    expect(distinct).toBeGreaterThan(1);
  });
});
