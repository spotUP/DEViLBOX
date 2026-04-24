/**
 * transportTapeStop — the real deal, not the bus-only approximation in
 * tapeStop.ts. Ramps both tempo AND pitch down together so the song
 * pitches as it slows, matching a physical tape reel decelerating.
 *
 * HOLD behaviour:
 *   - Press: transport ramps to floor (~8% speed) over 0.8s. Bus LPF also
 *     closes to mask LibOpenMPT's resampler aliasing.
 *   - Hold: transport stays near-silent.
 *   - Release (dispose): transport ramps back to 1.0 over 0.25s.
 *
 * Currently only wired for LibOpenMPT. For other engines the bus-only
 * tapeStop (DubBus.startTapeHold) carries the effect.
 */

import type { DubMove } from './_types';

const STEPS = 24;

function cancelTimers(timers: Set<ReturnType<typeof setTimeout>>): void {
  for (const t of timers) clearTimeout(t);
  timers.clear();
}

async function rampLibOpenMPT(
  fromFactor: number,
  toFactor: number,
  durationSec: number,
  timers: Set<ReturnType<typeof setTimeout>>,
): Promise<void> {
  const mod = await import('@/engine/libopenmpt/LibopenmptEngine');
  if (!mod.LibopenmptEngine.hasInstance()) return;
  const eng = mod.LibopenmptEngine.getInstance();
  const stepMs = (durationSec * 1000) / STEPS;
  for (let i = 1; i <= STEPS; i++) {
    const v = fromFactor + (toFactor - fromFactor) * (i / STEPS);
    const t = setTimeout(() => {
      timers.delete(t);
      try { eng.setTempoFactor(v); eng.setPitchFactor(v); } catch { /* ok */ }
    }, stepMs * i);
    timers.add(t);
  }
}

async function setLibOpenMPTFactor(factor: number): Promise<void> {
  const mod = await import('@/engine/libopenmpt/LibopenmptEngine');
  if (!mod.LibopenmptEngine.hasInstance()) return;
  const eng = mod.LibopenmptEngine.getInstance();
  try { eng.setTempoFactor(factor); eng.setPitchFactor(factor); } catch { /* ok */ }
}

export const transportTapeStop: DubMove = {
  id: 'transportTapeStop',
  kind: 'hold',
  defaults: { downSec: 0.8, floorFactor: 0.08 },

  execute({ bus, params }) {
    const downSec = (params.downSec as number | undefined) ?? (this.defaults.downSec as number);
    const floorFactor = Math.max(0.05, (params.floorFactor as number | undefined) ?? (this.defaults.floorFactor as number));

    const timers = new Set<ReturnType<typeof setTimeout>>();
    let disposed = false;

    // Bus-only analog tape coloring (works for ALL engines):
    // LPF closes as transport slows, hides digital aliasing artifacts.
    const busRestore = bus.startTapeHold(downSec);
    bus.sweepMasterLpf(400, downSec, 9999); // hold LPF closed until release

    // Best-effort LibOpenMPT transport ramp
    void (async () => {
      const mod = await import('@/engine/libopenmpt/LibopenmptEngine');
      const isLib = mod.LibopenmptEngine.hasInstance() && mod.LibopenmptEngine.getInstance().isAvailable();
      if (!isLib) {
        void import('@/stores/useNotificationStore').then(({ notify }) =>
          notify.info('Tape Stop: transport slowdown only works with .mod/.xm/.s3m/.it formats'));
        return;
      }
      await rampLibOpenMPT(1.0, floorFactor, downSec, timers);
    })();

    return {
      dispose() {
        if (disposed) return;
        disposed = true;
        cancelTimers(timers);
        // Restore bus LPF + return gain
        busRestore();
        bus.sweepMasterLpf(20000, 0.15, 0);
        // Ramp transport back to full speed
        void (async () => {
          const mod = await import('@/engine/libopenmpt/LibopenmptEngine');
          if (!mod.LibopenmptEngine.hasInstance()) return;
          const eng = mod.LibopenmptEngine.getInstance();
          if (!eng.isAvailable()) return;
          // Cancel any in-progress ramp by checking current factor
          try {
            const currentFactor = (eng as unknown as { getTempoFactor?: () => number }).getTempoFactor?.() ?? floorFactor;
            const restoreTimers = new Set<ReturnType<typeof setTimeout>>();
            await rampLibOpenMPT(currentFactor, 1.0, 0.25, restoreTimers);
          } catch {
            // Fallback: snap to 1.0
            await setLibOpenMPTFactor(1.0);
          }
        })();
      },
    };
  },
};
