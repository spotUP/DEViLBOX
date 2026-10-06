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
): number {
  if (engineLevel !== null) return engineLevel;
  if (!waveform || waveform.length === 0) return 0;
  let peak = 0;
  for (let k = 0; k < waveform.length; k++) {
    const a = Math.abs(waveform[k]);
    if (a > peak) peak = a;
  }
  return peak / 32768;
}
