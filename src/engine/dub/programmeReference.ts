/**
 * The live programme reference — how loud the MUSIC currently is.
 *
 * Generated dub moves (siren, sonar ping, toast, sub swell, radio riser,
 * oscillator bass) each picked an absolute amplitude, which is a level
 * relative to full scale rather than to the mix. A tracker module plays at
 * roughly 0.05 to 0.15 RMS, so a 0.8-peak sine sits fifteen to twenty decibels
 * over it — reported 2026-09-18 as "some effects like the siren etc are MUCH
 * louder than the music".
 *
 * This samples the programme and keeps a smoothed reading the moves scale
 * against. Sampling is throttled and shared: a burst of moves in one bar reads
 * one number rather than each taking its own snapshot of a different instant.
 */

import { AudioDataBus } from '@/engine/vj/AudioDataBus';
import {
  smoothProgrammeLevel,
  generatedPeakFor,
  shelfTrimDb,
  type ProgrammeLevel,
} from '@/lib/dub/programmeLevel';

/** Minimum gap between samples. Four a second is plenty for a reference. */
const SAMPLE_INTERVAL_MS = 250;

let _level: ProgrammeLevel | null = null;
let _lastSampleMs = -Infinity;

/**
 * The current programme level, sampled at most four times a second.
 *
 * Returns the smoothed reading rather than the instantaneous one: programme
 * level moves constantly, and a reference that followed every frame would make
 * one move quiet and the next loud for reasons a listener cannot connect to
 * anything.
 */
export function getProgrammeLevel(): ProgrammeLevel {
  const now = performance.now();
  if (now - _lastSampleMs >= SAMPLE_INTERVAL_MS) {
    _lastSampleMs = now;
    try {
      const bus = AudioDataBus.getShared();
      bus.update();
      const frame = bus.getFrame();
      const low = frame.subEnergy + frame.bassEnergy;
      const total = low + frame.midEnergy + frame.highEnergy;
      _level = smoothProgrammeLevel(_level, {
        rms: frame.rms,
        peak: frame.peak,
        lowShare: total > 0 ? low / total : undefined,
      });
    } catch {
      // No analyser yet. Leave the previous reading; `generatedPeakFor` falls
      // back to a modest fixed peak when there is nothing valid.
    }
  }
  return _level ?? { rms: 0, peak: 0, lowShare: 0.4, valid: false };
}

/**
 * Peak a generated sound should reach, referenced to the music.
 *
 * `intent` is the caller's musical level (the move's own `level` parameter),
 * scaling the move's presence rather than replacing it.
 */
export function generatedPeak(moveId: string, intent = 1): number {
  return generatedPeakFor(moveId, getProgrammeLevel(), intent);
}

/** Forget the reference — a new song, a stopped transport. */
export function resetProgrammeReference(): void {
  _level = null;
  _lastSampleMs = -Infinity;
}

/**
 * Trim for a master-insert shelf boost, measured against the programme.
 *
 * Trimming by the full shelf gain assumed the whole mix was being lifted; only
 * the low end is. On a Perry preset that meant a 9 dB drop when the bus came
 * on, which is what "the volume difference between dub bus on/off is huge"
 * was describing.
 */
export function shelfTrimForProgramme(shelfGainDb: number): number {
  return shelfTrimDb(shelfGainDb, getProgrammeLevel());
}
