/**
 * Slowing the transport down, whichever engine is playing.
 *
 * `transportTapeStop` ramped tempo and pitch through `LibopenmptEngine` and
 * nothing else, so on every other format it fell back to closing the bus
 * low-pass and raised a toast saying the move only works with
 * .mod/.xm/.s3m/.it. Asked 2026-09-22: "is there really a reason for tape stop
 * not working in ahx or have we been lazy?" — lazy. The replayers that own
 * their own output can all be read at a fractional rate.
 *
 * This is the one place that knows which engine is live and how to ask it, so
 * a move never has to. A rate of 1.0 is normal speed; lower is slower AND
 * lower-pitched, because these are resamplers rather than time-stretchers —
 * which is exactly the tape behaviour the move wants.
 */

/** What a transport-rate capable engine looks like from here. */
export interface TransportRateTarget {
  /** A name for logs and for telling the user what carried the move. */
  readonly engineName: string;
  /** 1.0 = normal speed. Pitch follows tempo. */
  setRate(factor: number): void;
}

/**
 * The engine currently producing sound, if it can change its transport rate.
 *
 * Returns null when nothing playing supports it — the caller then falls back
 * to the bus-only colouring, which works for every engine.
 */
export async function getTransportRateTarget(): Promise<TransportRateTarget | null> {
  // LibOpenMPT first: it is the MOD/XM/S3M/IT path and has the most exact
  // control, setting tempo and pitch as separate module parameters.
  try {
    const { LibopenmptEngine } = await import('@/engine/libopenmpt/LibopenmptEngine');
    if (LibopenmptEngine.hasInstance() && LibopenmptEngine.getInstance().isAvailable()) {
      const eng = LibopenmptEngine.getInstance();
      return {
        engineName: 'LibOpenMPT',
        setRate(factor) {
          try { eng.setTempoFactor(factor); eng.setPitchFactor(factor); } catch { /* engine went away */ }
        },
      };
    }
  } catch { /* module not loaded */ }

  // Hively/AHX: the worklet resamples its own ring buffer.
  try {
    const active = (globalThis as {
      __devilboxActiveHivelyEngine?: { setRateFactor?: (f: number) => void } | null;
    }).__devilboxActiveHivelyEngine;
    if (active && typeof active.setRateFactor === 'function') {
      return {
        engineName: 'Hively',
        setRate(factor) {
          try { active.setRateFactor!(factor); } catch { /* engine went away */ }
        },
      };
    }
  } catch { /* no active engine */ }

  return null;
}
