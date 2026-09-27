/**
 * Ducks a chip engine's shared output gain on stop, then puts it back.
 *
 * Furnace chip engines (FurnaceChipEngine, FurnaceDispatchEngine) play through
 * one shared GainNode per engine, not through the instruments' own outputs,
 * so releasing the instruments does not silence them on stop. The gain is
 * ramped to 0 over 50 ms and restored to 1 100 ms later.
 *
 * The restore timers used to live in ToneEngine's per-instrument
 * `releaseRestoreTimeouts`, which `disposeAllInstruments()` clears. Loading a
 * song stops playback first — ducking the gain — and disposes the old song's
 * instruments inside those 100 ms, cancelling the restore: the shared gain
 * stayed at 0 and the next Furnace or DefleMask song loaded played in
 * silence. Only the first song of a session was ever audible. The engine
 * gains outlive every instrument, so their restores live here, where
 * disposing instruments does not reach them.
 */
export class EngineGainDuck {
  private readonly restores = new Map<string, ReturnType<typeof setTimeout>>();

  duck(key: string, gain: GainNode, now: number): void {
    const prev = this.restores.get(key);
    if (prev) clearTimeout(prev);
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value || 1, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.05);
    this.restores.set(key, setTimeout(() => {
      this.restores.delete(key);
      try {
        gain.gain.cancelScheduledValues(0);
        gain.gain.value = 1;
      } catch { /* engine may be disposed */ }
    }, 100));
  }
}
