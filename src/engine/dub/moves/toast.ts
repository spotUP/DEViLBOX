/**
 * toast — MC vocal throw into the dub. While held:
 *   - The DJ mic (DJMicEngine singleton) is tapped and routed into the bus
 *     input so the voice picks up the full echo + spring chain.
 *   - Tone-side buses are ducked so the voice sits cleanly over the music
 *     (WASM engine outputs untouched — cross-engine ducking is a Phase-3
 *     follow-up; see task #14).
 *   - The mic's existing primary path (→ DJ mixer) stays live, so the voice
 *     is also audible dry through the normal DJ signal path. The dub tap is
 *     additive, not a replacement.
 *
 * Requires an active DJ mic (DJMicEngine.isActive === true). No-op + warn
 * otherwise — user needs to grant mic permission in the DJ view first.
 */

import type { DubMove } from './_types';
import { getDJEngineIfActive } from '@/engine/dj/DJEngine';
import { getToneEngine } from '@/engine/ToneEngine';

export const toast: DubMove = {
  id: 'toast',
  kind: 'hold',
  defaults: { duckFactor: 0.4, attackSec: 0.04, releaseSec: 0.12, micGain: 1.0 },

  execute({ bus, params }) {
    const dj = getDJEngineIfActive();
    const mic = dj?.mic;
    const src = mic?.getSourceNode?.();
    if (!mic?.isActive || !src) {
      console.warn('[toast] no active DJ mic — start the mic in the DJ view first');
      void import('@/stores/useNotificationStore').then(({ notify }) =>
        notify.warning('Toast needs the DJ mic — start it in the DJ view first'));
      return null;
    }

    const duckFactor = params.duckFactor ?? this.defaults.duckFactor;
    const attackSec = params.attackSec ?? this.defaults.attackSec;
    const releaseSec = params.releaseSec ?? this.defaults.releaseSec;
    const micGain = params.micGain ?? this.defaults.micGain;

    const ctx = bus.inputNode.context as AudioContext;

    // Parallel tap from mic source → gain → bus input. Separate from the
    // mic's primary routing to DJ mixer.
    const tap = ctx.createGain();
    tap.gain.value = 0;
    try {
      src.connect(tap);
      tap.connect(bus.inputNode);
      const now = ctx.currentTime;
      tap.gain.setValueAtTime(0, now);
      tap.gain.linearRampToValueAtTime(micGain, now + attackSec);
    } catch (e) {
      console.warn('[toast] mic→bus tap failed:', e);
      return null;
    }

    // Duck ALL audio buses — Tone.js + any active WASM replayer outputs.
    // This ensures the voice sits cleanly over the music regardless of
    // which engine is playing.
    const duckedParams: Array<{ param: AudioParam; prev: number }> = [];
    try {
      const tone = getToneEngine();
      const now = ctx.currentTime;
      for (const g of [tone.masterInput.gain, tone.synthBus.gain]) {
        const prev = g.value;
        duckedParams.push({ param: g as unknown as AudioParam, prev });
        g.cancelScheduledValues(now);
        g.setValueAtTime(prev, now);
        g.linearRampToValueAtTime(prev * duckFactor, now + attackSec);
      }
    } catch { /* tone engine not ready */ }

    // Duck WASM engine outputs (best-effort, async)
    void (async () => {
      const engineLoaders = [
        () => import('@/engine/libopenmpt/LibopenmptEngine').then(m => m.LibopenmptEngine),
        () => import('@/engine/hively/HivelyEngine').then(m => m.HivelyEngine),
        () => import('@/engine/uade/UADEEngine').then(m => m.UADEEngine),
        () => import('@/engine/furnace-dispatch/FurnaceDispatchEngine').then(m => m.FurnaceDispatchEngine),
      ];
      const now = ctx.currentTime;
      for (const load of engineLoaders) {
        try {
          const E = await load();
          if (E && (E as any).hasInstance?.() ) {
            const inst = (E as any).getInstance();
            const g = (inst.output as GainNode | undefined)?.gain;
            if (g) {
              duckedParams.push({ param: g, prev: g.value });
              g.cancelScheduledValues(now);
              g.setValueAtTime(g.value, now);
              g.linearRampToValueAtTime(g.value * duckFactor, now + attackSec);
            }
          }
        } catch { /* engine not loaded */ }
      }
    })();

    return {
      dispose() {
        const now = ctx.currentTime;
        try {
          tap.gain.cancelScheduledValues(now);
          tap.gain.setValueAtTime(tap.gain.value, now);
          tap.gain.linearRampToValueAtTime(0, now + releaseSec);
          setTimeout(() => {
            try { tap.disconnect(); } catch { /* ok */ }
          }, Math.ceil((releaseSec + 0.05) * 1000));
        } catch { /* ok */ }
        // Restore all ducked gains
        for (const { param, prev } of duckedParams) {
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
