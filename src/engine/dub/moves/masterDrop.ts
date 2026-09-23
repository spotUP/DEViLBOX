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

/**
 * The longest the desk may stay dropped.
 *
 * A drop is a musical gesture of a bar or two, and it is the ONLY move that
 * takes every source down at once — so if its release is ever lost, the whole
 * instrument is silent with nothing on screen to explain it. That happened on
 * 2026-09-24: playback running, every channel unmuted, and
 * `masterVolume: 0, sampleBusGain: 0, synthBusGain: 0` with an AHX tune
 * playing to nobody. A reload was the only way back.
 *
 * A hold is supposed to end when the hand lets go, and normally does. This is
 * for when it does not: a pointer the browser takes away, a note-off that
 * never arrives, a button that unmounts mid-press. Whatever the cause, the
 * sound comes back.
 *
 * Deliberately generous — eight bars at 60 BPM is 32 seconds, so no musical
 * drop is cut short.
 */
export const MASTER_DROP_CEILING_MS = 40_000;

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
      }
      for (const entry of collected) {
        // Guard: if a gain is already at (or effectively at) ZERO when
        // collected — the snowball case where a failed restore left prev=0 and
        // every later drop inherits it — treat it as 1.0 so we never "restore"
        // to permanent silence.
        //
        // The threshold was 0.05, which also swallowed a gain the user had
        // genuinely set low: a master at 0.04 came back at FULL SCALE on pad
        // release. That is a loud surprise on a live rig, and the snowball case
        // this guards is exactly zero, not merely quiet.
        if (entry.prev <= 0.0005) entry.prev = 1.0;
        pairs.push(entry);
        try {
          entry.param.cancelScheduledValues(t);
          entry.param.setValueAtTime(entry.param.value, t);
          entry.param.linearRampToValueAtTime(0, t + attackSec);
        } catch { /* ok */ }
      }
    })();

    /** Put every gain back where it was found. Safe to call twice. */
    let restored = false;
    const restore = () => {
      if (restored) return;
      restored = true;
      const now = ctx.currentTime;
      for (const { param, prev } of pairs) {
        try {
          param.cancelScheduledValues(now);
          param.setValueAtTime(param.value, now);
          param.linearRampToValueAtTime(prev, now + releaseSec);
        } catch (err) {
          console.error('[masterDrop] RESTORE failed for a gain:', err);
        }
      }
    };

    // The backstop. Nothing about a held button can be trusted to end, and
    // this is the one move whose failure to end leaves no sound at all.
    const ceiling = setTimeout(() => {
      console.warn(
        `[masterDrop] held for ${MASTER_DROP_CEILING_MS}ms with no release — `
        + 'restoring. Something dropped the release; the desk does not stay silent.',
      );
      restore();
    }, MASTER_DROP_CEILING_MS);

    return {
      dispose() {
        disposed = true;
        clearTimeout(ceiling);
        restore();
      },
    };
  },
};
