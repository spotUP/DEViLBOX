/**
 * The two saturation stages of the WobbleBass: the filter drive before the filter and the
 * distortion section after it.
 *
 * Both soft stages are unity-slope tanh WaveShapers (`makeSaturationCurve`), not `Tone.Distortion`.
 * That curve has a small-signal gain of 3.7× at drive 30 and 4.8× at drive 40 under a ceiling of
 * 0.35, so the preset's 5 ms amplitude attack reached the ceiling within ~1 ms and every note
 * started with a thump; its `oversample: '2x'` also delayed the synth by ~128 samples (2.6 ms at
 * 48 kHz) per stage, so the bass played ~5 ms behind the sample channels in a hybrid song.
 * Measured 2026-10-22 on a tap after the filter: onset +2.8 ms, 70% of the steady level within
 * 1 ms of onset, identical cold and warm. The 'hard' (Chebyshev) and 'bitcrush' stages are
 * unchanged.
 */
import * as Tone from 'tone';
import type { WobbleBassConfig } from '@typedefs/instrument';
import { makeSaturationCurve, softDriveK, fuzzDriveK } from '@/lib/audio/saturationCurve';

/** The pre-filter drive stage, or null when the drive is 0. */
export function createWobbleFilterDrive(drive: number): Tone.WaveShaper | null {
  if (drive <= 0) return null;
  return new Tone.WaveShaper(makeSaturationCurve(softDriveK(drive)));
}

/** The post-filter distortion stage, or null when the section is disabled. */
export function createWobbleDistortion(section: WobbleBassConfig['distortion']): Tone.ToneAudioNode | null {
  if (!section.enabled) return null;
  switch (section.type) {
    case 'soft':
      return new Tone.WaveShaper(makeSaturationCurve(softDriveK(section.drive)));
    case 'hard':
      return new Tone.Chebyshev({ order: Math.floor(1 + (section.drive / 100) * 50) });
    case 'fuzz':
      return new Tone.WaveShaper(makeSaturationCurve(fuzzDriveK(section.drive)));
    case 'bitcrush':
      return new Tone.BitCrusher(Math.max(2, 12 - Math.floor(section.drive / 10)));
    default:
      return null;
  }
}
