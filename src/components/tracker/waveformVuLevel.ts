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

export interface ChannelMeterInput {
  mode: 'trigger' | 'realtime';
  /** The level of a note trigger that arrived this frame, or null when none did. */
  trigger: number | null;
  /** The channel's measured level (strip RMS merged with engine levels); 0 in trigger mode. */
  realtimeLevel: number;
  /** The level the engine reports for this channel, or null when the engine reports none. */
  engineLevel: number | null;
  /** The channel's waveform this frame, if a direct-routed engine captures one. */
  waveform: ArrayLike<number> | null | undefined;
  /** The waveform's full scale (see waveformVuLevel). */
  fullScale: number;
  /** The waveform level of the previous frame, for onset detection. */
  prevSource: number;
}

/**
 * The level a channel meter rises to this frame, and the waveform level to
 * remember for the next frame's onset check. One rule for every meter:
 *
 * - Trigger mode follows note starts: the note trigger, or a waveform onset
 *   for an engine that sends no triggers.
 * - Realtime mode follows the measured level. A note trigger counts only on a
 *   channel with no measured level (a synth that bypasses the channel strip),
 *   so a measured meter never jumps to the note volume on top of its level.
 *
 * The waveform is read only when the engine reports no levels of its own. An
 * engine that does report them already sends their onsets as triggers and
 * merges them into the realtime level, so its waveform would count twice.
 */
export function channelMeterTarget(input: ChannelMeterInput): { target: number; source: number } {
  const { mode, trigger, realtimeLevel, engineLevel, waveform } = input;
  let source = input.prevSource;
  let waveTarget = 0;
  const hasWaveform = engineLevel === null && !!waveform && waveform.length > 0;
  if (hasWaveform) {
    source = waveformVuLevel(null, waveform, input.fullScale);
    waveTarget = engineFedMeterTarget(mode, source, input.prevSource);
  }
  if (mode === 'trigger') return { target: Math.max(trigger ?? 0, waveTarget), source };
  const measured = hasWaveform || engineLevel !== null || realtimeLevel > 0;
  const target = Math.max(realtimeLevel, waveTarget, measured ? 0 : (trigger ?? 0));
  return { target, source };
}
