/**
 * Which waveform a channel scope draws.
 *
 * A channel can sound from two places. A WASM engine (libopenmpt, UADE,
 * Furnace, ...) renders its own channels and feeds the oscilloscope store.
 * Tone.js voices and per-channel synth lanes play into the channel's Tone
 * strip. A song whose instruments are Tone synths (a MIDI import, a fresh song
 * of TB303s) is still sequenced by libopenmpt through an empty XM: the store
 * then holds libopenmpt's frames for those channels, all silent, while the
 * sound is on the Tone strip. The scope draws whichever source carries signal.
 */

/** Below this the engine frame is silence (16 of 32768, about -66 dBFS). */
const ENGINE_SILENT_PEAK = 16;
/** The same level on the Tone strip's float scale. */
const STRIP_SILENT_PEAK = ENGINE_SILENT_PEAK / 32768;

export interface ChannelScopeSource {
  data: Int16Array | Float32Array;
  /** Float samples (-1..1) rather than Int16. */
  isFloat: boolean;
}

function peakOf(data: ArrayLike<number>): number {
  let peak = 0;
  for (let i = 0; i < data.length; i++) {
    const v = Math.abs(data[i]);
    if (v > peak) peak = v;
  }
  return peak;
}

/**
 * The engine frame when it carries signal, else the Tone strip waveform when
 * that does, else the engine frame (a silent channel draws flat), else null.
 */
export function channelScopeSource(
  engineFrame: Int16Array | null | undefined,
  stripWaveform: Float32Array | null | undefined,
): ChannelScopeSource | null {
  const engine = engineFrame && engineFrame.length > 0 ? engineFrame : null;
  if (engine && peakOf(engine) > ENGINE_SILENT_PEAK) return { data: engine, isFloat: false };
  if (stripWaveform && stripWaveform.length > 0 && peakOf(stripWaveform) > STRIP_SILENT_PEAK) {
    return { data: stripWaveform, isFloat: true };
  }
  return engine ? { data: engine, isFloat: false } : null;
}
