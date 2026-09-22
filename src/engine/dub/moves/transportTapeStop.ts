/**
 * transportTapeStop — the real deal, not the bus-only approximation in
 * tapeStop.ts. Ramps both tempo AND pitch down together so the song
 * pitches as it slows, matching a physical tape reel decelerating.
 *
 * HOLD behaviour:
 *   - Press: transport ramps to floor (~8% speed) over 0.8s. Bus LPF also
 *     closes to mask the resampler aliasing that comes with it.
 *   - Hold: transport stays near-silent.
 *   - Release (dispose): transport ramps back to 1.0 over 0.25s.
 *
 * This used to drive `LibopenmptEngine` directly and raise a toast on every
 * other format saying the move only works with .mod/.xm/.s3m/.it. It now asks
 * `transportRate` for whichever engine is playing, so AHX/HVL gets a real
 * transport slowdown too. Engines with no rate control still get the bus-only
 * colouring — the move always does something, and says which engine carried it
 * only when there is nothing to carry.
 */

import type { DubMove } from './_types';
import { getTransportRateTarget, type TransportRateTarget } from '../transportRate';

const STEPS = 24;

function cancelTimers(timers: Set<ReturnType<typeof setTimeout>>): void {
  for (const t of timers) clearTimeout(t);
  timers.clear();
}

/**
 * Step `target` from one rate to another over `durationSec`.
 *
 * Timers rather than an AudioParam because the rate is a message to a worklet
 * or a WASM call, not a param on the graph. Each pending step is tracked so a
 * release mid-ramp can cancel the rest — otherwise the down-ramp keeps firing
 * underneath the restore and the song stays slow.
 */
function rampRate(
  target: TransportRateTarget,
  fromFactor: number,
  toFactor: number,
  durationSec: number,
  timers: Set<ReturnType<typeof setTimeout>>,
): void {
  const stepMs = (durationSec * 1000) / STEPS;
  for (let i = 1; i <= STEPS; i++) {
    const v = fromFactor + (toFactor - fromFactor) * (i / STEPS);
    const t = setTimeout(() => {
      timers.delete(t);
      target.setRate(v);
    }, stepMs * i);
    timers.add(t);
  }
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
    /** Resolved asynchronously; a release before it lands must still restore. */
    let rateTarget: TransportRateTarget | null = null;

    // Bus-only analog tape coloring (works for ALL engines):
    // LPF closes as transport slows, hides digital aliasing artifacts.
    const busRestore = bus.startTapeHold(downSec);
    bus.sweepMasterLpf(400, downSec, 9999); // hold LPF closed until release

    void (async () => {
      const target = await getTransportRateTarget();
      // Released while we were resolving — do not start a ramp nothing will
      // stop.
      if (disposed) return;
      if (!target) {
        void import('@/stores/useNotificationStore').then(({ notify }) =>
          notify.info('Tape Stop: this engine has no transport control — filter sweep only'));
        return;
      }
      rateTarget = target;
      rampRate(target, 1.0, floorFactor, downSec, timers);
    })();

    return {
      dispose() {
        if (disposed) return;
        disposed = true;
        cancelTimers(timers);
        // Restore bus LPF + return gain
        busRestore();
        bus.sweepMasterLpf(20000, 0.15, 0);
        // Ramp the transport back to full speed. Starting from the floor
        // rather than from wherever the down-ramp reached is deliberate: the
        // exact current rate is not readable from every engine, and ramping
        // from the floor is never audible as a jump because the restore is
        // short and ends at 1.0 regardless.
        if (rateTarget) {
          const restoreTimers = new Set<ReturnType<typeof setTimeout>>();
          rampRate(rateTarget, floorFactor, 1.0, 0.25, restoreTimers);
        }
      },
    };
  },
};
