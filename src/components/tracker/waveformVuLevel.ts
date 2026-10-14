import { VU_ONSET_RISE } from '@/engine/tone/channelMeterFeed';

export { VU_ONSET_RISE };

/**
 * Meter level for a channel of a direct-routed WASM engine.
 *
 * Two sources exist. An engine that reports its own per-channel levels
 * (libopenmpt's channel VU, AdPlug) is reporting what the mixer actually
 * produced, so those win. Only an engine with no levels of its own (Cinter,
 * Furnace, Hively) is metered from the peak of its per-channel waveform.
 *
 * The waveform is NOT safe as a level for libopenmpt: its oscilloscope
 * module solos one channel per audio quantum by toggling the mute flag, and
 * libopenmpt latches a mute at the next tick, so the previous channel keeps
 * sounding into the capture of every silent channel. A channel with no notes
 * showed ~0.09 peak (a lit meter) while its real VU was exactly 0.
 */
export function waveformVuLevel(
  engineLevel: number | null,
  waveform: ArrayLike<number> | null | undefined,
  /** The waveform's full scale: 32768 for an engine's int16 capture, 1 for a float window (a DJ deck's channel scopes). */
  fullScale = 32768,
): number {
  if (engineLevel !== null) return engineLevel;
  if (!waveform || waveform.length === 0) return 0;
  let peak = 0;
  for (let k = 0; k < waveform.length; k++) {
    const a = Math.abs(waveform[k]);
    if (a > peak) peak = a;
  }
  return peak / fullScale;
}


/**
 * Meter target for an engine-fed channel (one with no note-trigger events of
 * its own, metered from its level or waveform peak).
 *
 * Live mode follows the level. Trigger mode follows note triggers: the meter
 * flashes only on the frame the source level jumps (a note starting) and then
 * decays on its own, so a held or slowly moving level gives 0 here.
 */
export function engineFedMeterTarget(
  mode: 'trigger' | 'realtime',
  level: number,
  prevLevel: number,
): number {
  if (mode === 'realtime') return level;
  return level - prevLevel > VU_ONSET_RISE ? level : 0;
}

/**
 * Whether a meter drops to 0 this frame: on the frame playback stops, so no note scheduled before the stop bounces it
 * afterwards. A meter that is already stopped keeps running its triggers and fall-off, so a note sounded while stopped
 * (a row preview stepped with Enter) moves the meter of its channel like a played note.
 */
export function meterKilledByStop(playing: boolean, wasPlaying: boolean): boolean {
  return wasPlaying && !playing;
}
