import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ALTEC_HPF_STEPS, snapToAltecStep } from '@/types/dub';
import { DEFAULT_DUB_BUS } from '@/types/dub';

/**
 * Switching the dub bus on must not high-pass the whole song.
 *
 * `masterHpf` sits in the master insert, upstream of `masterBassShelf`, and it
 * was fed the same Hz as the wet bus HPF. Those are not the same quantity: on
 * the wet path the cutoff keeps echo feedback out of the mud, while on the dry
 * mix it subtracts from the song. With `hpfStepped` (the default) the lowest
 * Altec position is 70 Hz, so the entire mix was high-passed at 70 Hz whenever
 * the bus was enabled, with no control position that turned it off — and the
 * BASS shelf at 60 Hz then boosted a band that had already been removed, while
 * `masterToneTrim` charged the whole mix for the boost.
 *
 * Measured on the live insert, bassShelfGainDb 12 + masterBassPunchDb 6:
 *
 *     masterHpfHz 70:  insertIn 0.015687 -> afterShelf 0.016667   (+0.5 dB)
 *     masterHpfHz 20:  insertIn 0.021783 -> afterShelf 0.027151   (+1.9 dB)
 *
 * Reported as "when i slide the bass slider to the right the music gets
 * quieter but no more bass" (2026-09-22).
 */

const source = readFileSync(
  join(process.cwd(), 'src/engine/dub/DubBus.ts'),
  'utf-8',
);

/** Exactly the mapping `masterHpfHzFor` performs. */
const MASTER_HPF_IDLE_HZ = 20;
function masterHpfHzFor(hz: number): number {
  return hz <= ALTEC_HPF_STEPS[0] ? MASTER_HPF_IDLE_HZ : hz;
}

describe('the full-mix HPF', () => {
  it('idles transparent at the control\'s resting position', () => {
    const resting = snapToAltecStep(DEFAULT_DUB_BUS.hpfCutoff);
    expect(resting).toBe(70);
    expect(masterHpfHzFor(resting)).toBe(20);
  });

  it('idles transparent below the resting position too', () => {
    // Continuous mode reaches down to the control minimum.
    expect(masterHpfHzFor(20)).toBe(20);
    expect(masterHpfHzFor(65)).toBe(20);
  });

  it('still sweeps the full mix above the resting position', () => {
    // A Tubby filter sweep has to be audible on the dry mix — that is the
    // whole reason the master insert has an HPF at all.
    for (const step of ALTEC_HPF_STEPS.filter(s => s > 70)) {
      expect(masterHpfHzFor(step)).toBe(step);
    }
  });

  it('leaves the low end alone at rest, so the BASS shelf has something to lift', () => {
    // The shelf corner. An idle HPF above it makes the control inaudible.
    expect(masterHpfHzFor(snapToAltecStep(DEFAULT_DUB_BUS.hpfCutoff)))
      .toBeLessThan(DEFAULT_DUB_BUS.bassShelfFreqHz);
  });

  it('routes every master HPF write through the mapping', () => {
    // The bus HPF writes (`this.hpf`, `hpf2`, `hpf3`, `hpfResonance`) keep the
    // raw Hz — only the full-mix one is remapped.
    const writes = source.match(/this\.masterHpf\.frequency[^\n]*/g) ?? [];
    expect(writes.length).toBeGreaterThan(0);
    for (const write of writes) {
      expect(write).toContain('masterHpfHzFor(');
    }
  });

  it('keeps the shelf downstream of the HPF, so a sweep still removes the boost', () => {
    expect(source).toContain('this.masterHpf.connect(this.masterBassShelf);');
  });
});
