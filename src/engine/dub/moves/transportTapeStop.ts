/**
 * transportTapeStop — the real deal, not the bus-only approximation in
 * tapeStop.ts. Ramps both tempo AND pitch down together so the song
 * pitches as it slows, matching a physical tape reel decelerating.
 *
 * Currently only wired for LibOpenMPT (setTempoFactor + setPitchFactor
 * exposed on the engine wrapper). Other engines (UADE / Hively / Furnace)
 * don't expose a smooth speed ramp from their worklets yet — this move
 * warns and falls through to the bus-only tapeStop when it can't drive
 * the transport directly.
 *
 * Global, one-shot. After `downSec + holdSec`, everything snaps back.
 */

import type { DubMove } from './_types';

const STEPS = 24;  // steps per ramp direction — 24 over 600ms = ~25ms per step, smooth enough

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
      try {
        eng.setTempoFactor(v);
        eng.setPitchFactor(v);
      } catch { /* ok */ }
    }, stepMs * i);
    timers.add(t);
  }
}

export const transportTapeStop: DubMove = {
  id: 'transportTapeStop',
  kind: 'trigger',
  defaults: { downSec: 0.8, holdSec: 0.2, floorFactor: 0.08 },

  execute({ bus, params }) {
    const downSec = params.downSec ?? this.defaults.downSec;
    const holdSec = params.holdSec ?? this.defaults.holdSec;
    const floorFactor = Math.max(0.05, params.floorFactor ?? this.defaults.floorFactor);

    // Stack the bus-only tape stop on top of the transport slowdown so the
    // tail gets analog tape coloration (LPF closing + echo-rate ramp +
    // spring) alongside the digital transport time-stretch. Without this
    // the transport slowdown sounds purely mathematical — tape character
    // comes from the bus wet chain, not the libopenmpt resampler.
    console.log(`[transportTapeStop] fired downSec=${downSec} holdSec=${holdSec} floor=${floorFactor}`);
    bus.tapeStop(downSec, holdSec);
    // Sweep the master-insert LPF down to 400 Hz over the stop — hides
    // LibOpenMPT's resampler aliasing ("bit crush") during extreme
    // slowdown by rolling off the highs that carry the artifacts.
    bus.sweepMasterLpf(400, downSec, holdSec + 0.1);

    // Best-effort: check if LibOpenMPT is the active engine. If not, the
    // bus-only tapeStop above is the whole effect.
    void (async () => {
      const mod = await import('@/engine/libopenmpt/LibopenmptEngine');
      const isLib = mod.LibopenmptEngine.hasInstance() && mod.LibopenmptEngine.getInstance().isAvailable();
      if (!isLib) {
        console.warn('[transportTapeStop] only implemented for LibOpenMPT — bus-only tapeStop carries the effect');
        void import('@/stores/useNotificationStore').then(({ notify }) =>
          notify.info('Tape Stop: transport slowdown only works with .mod/.xm/.s3m/.it formats — using bus-only effect'));
        return;
      }
      const timers = new Set<ReturnType<typeof setTimeout>>();
      // Ramp down
      await rampLibOpenMPT(1.0, floorFactor, downSec, timers);
      // Hold at floor
      await new Promise<void>(r => {
        const t = setTimeout(() => { timers.delete(t); r(); }, (downSec + holdSec) * 1000);
        timers.add(t);
      });
      // Ramp back up to normal speed
      await rampLibOpenMPT(floorFactor, 1.0, 0.25, timers);
    })();

    return null;
  },
};
