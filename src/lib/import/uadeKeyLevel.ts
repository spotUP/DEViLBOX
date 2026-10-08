/**
 * The level of a key on a Sampler of a song that UADE plays.
 *
 * A key plays an Amiga Sampler at its default volume (keyboardVelocity). The song voice is UADE's mix, which
 * renders a sample at channel volume 64 at 0.48 of full scale (rms, measured 2026-10-08 on a full-swing square
 * wave) where the ToneEngine Sampler chain renders it at 0.795: a key at the song's channel volume is 4.3 dB
 * hot. The default volume such an instrument carries is the channel volume the song plays it at, times this
 * factor (uadeSamplerKeys.test.ts holds a key to 2 dB of the song voice).
 */
export const UADE_KEY_LEVEL = 0.607;

/** The default volume (0-64) and dB volume of a Sampler that UADE plays at `channelVolume` (0-64). */
export function uadeKeyVolume(channelVolume: number): number {
  return Math.min(64, channelVolume) * UADE_KEY_LEVEL;
}

/**
 * Set a native parser's Sampler (volume 64 unless the format says otherwise) to the level UADE plays it at.
 * The instrument keeps its own default volume as the channel volume.
 */
export function levelSamplerForUade(inst: {
  volume: number;
  metadata?: { modPlayback?: { defaultVolume?: number; usePeriodPlayback?: boolean } };
}): void {
  const mp = inst.metadata?.modPlayback;
  if (!mp?.usePeriodPlayback) return;
  const v = uadeKeyVolume(mp.defaultVolume ?? 64);
  mp.defaultVolume = v;
  inst.volume = v > 0 ? 20 * Math.log10(v / 64) : -60;
}
