/**
 * masterDrop — mute every dry audio source for a window, leaving the dub
 * bus return audible. Classic dub "drop" where the main mix vanishes and
 * only the echo / reverb tail plays out, then the mix snaps back in.
 *
 * Audio routing in DEViLBOX is NOT centralized — each engine connects
 * directly to `ctx.destination`:
 *   - Tone.js instruments → masterInput → masterEffectsInput → destination
 *   - Synths (DevilboxSynth) → synthBus → masterEffectsInput → destination
 *   - WASM replayers (LibOpenMPT / Hively / UADE / Furnace / …) →
 *     engine.output (a GainNode) → destination
 *   - DubBus return → drumpad.masterGain → destination  ← untouched by drop
 *
 * So masterDrop ramps every root gain EXCEPT the dub bus. Each active WASM
 * engine singleton is asked for its `output.gain`; we capture the current
 * value, ramp to 0 on fire, ramp back on release.
 *
 * Global move.
 */

import type { DubMove } from './_types';
import { getToneEngine } from '@/engine/ToneEngine';

// Collect every active audio-source root gain so masterDrop can ramp them
// together. Returns an array of { gain, prev } pairs; caller restores on
// release. Any engine without a live instance is silently skipped.
async function collectDryGains(): Promise<Array<{ param: AudioParam; prev: number }>> {
  const out: Array<{ param: AudioParam; prev: number }> = [];

  // Tone.js sample + synth buses — always present.
  try {
    const tone = getToneEngine();
    const sample = tone.masterInput.gain as unknown as AudioParam;
    const synth = tone.synthBus.gain as unknown as AudioParam;
    out.push({ param: sample, prev: sample.value });
    out.push({ param: synth, prev: synth.value });
  } catch { /* tone engine not initialized */ }

  // WASM replayers that expose `.output: GainNode`. Each is a singleton
  // gated by `hasInstance()` so ramping only touches live audio paths.
  const engineLoaders = [
    () => import('@/engine/libopenmpt/LibopenmptEngine').then(m => m.LibopenmptEngine),
    () => import('@/engine/hively/HivelyEngine').then(m => m.HivelyEngine),
    () => import('@/engine/uade/UADEEngine').then(m => m.UADEEngine),
    () => import('@/engine/furnace-dispatch/FurnaceDispatchEngine').then(m => m.FurnaceDispatchEngine),
  ];
  for (const load of engineLoaders) {
    try {
      const E = await load();
      if (E && (E as any).hasInstance && (E as any).hasInstance()) {
        const inst = (E as any).getInstance();
        const outputNode = inst.output as GainNode | undefined;
        if (outputNode?.gain) {
          out.push({ param: outputNode.gain, prev: outputNode.gain.value });
        }
      }
    } catch { /* engine module not loaded */ }
  }
  return out;
}

export const masterDrop: DubMove = {
  id: 'masterDrop',
  kind: 'hold',
  defaults: { attackSec: 0.02, releaseSec: 0.08 },

  execute({ bus, params }) {
    const attackSec = params.attackSec ?? this.defaults.attackSec;
    const releaseSec = params.releaseSec ?? this.defaults.releaseSec;
    const ctx = bus.inputNode.context as AudioContext;

    // Snapshot + ramp. Tone.js buses are available synchronously; WASM
    // engines require dynamic imports but resolve near-instantly (modules
    // are already loaded). Using fresh `ctx.currentTime` inside the
    // callback avoids scheduling ramps at stale timestamps.
    const pairs: Array<{ param: AudioParam; prev: number }> = [];
    let disposed = false;

    void (async () => {
      const collected = await collectDryGains();
      if (disposed) return;
      const t = ctx.currentTime;
      if (collected.length === 0) {
        console.warn('[masterDrop] no dry gains found — drop will be inaudible');
        void import('@/stores/useNotificationStore').then(({ notify }) =>
          notify.warning('Drop: no active audio sources found'));
      } else {
        console.log(`[masterDrop] fired — ramping ${collected.length} dry gains to 0`);
      }
      for (const entry of collected) {
        pairs.push(entry);
        try {
          entry.param.cancelScheduledValues(t);
          entry.param.setValueAtTime(entry.param.value, t);
          entry.param.linearRampToValueAtTime(0, t + attackSec);
        } catch { /* ok */ }
      }
    })();

    return {
      dispose() {
        disposed = true;
        const now = ctx.currentTime;
        for (const { param, prev } of pairs) {
          try {
            param.cancelScheduledValues(now);
            param.setValueAtTime(param.value, now);
            param.linearRampToValueAtTime(prev, now + releaseSec);
          } catch { /* ok */ }
        }
      },
    };
  },
};
