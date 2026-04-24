/**
 * toast — MC vocal throw into the dub. While held:
 *   - Ensures the DJ mic is running (auto-starts if not active; user will
 *     see a browser permission prompt on first use).
 *   - Taps the mic source into the dub bus input so the voice picks up the
 *     full echo + spring chain.
 *   - Ducks Tone.js buses AND WASM engine outputs so the voice sits clearly.
 *   - The mic's existing primary path (→ DJ mixer) stays live.
 *
 * If the DJ engine has not been initialised (user hasn't opened the DJ view),
 * a temporary mic GainNode is created directly from getUserMedia and routed
 * exclusively into the bus input.
 */

import type { DubMove } from './_types';
import { getDJEngineIfActive } from '@/engine/dj/DJEngine';
import { getToneEngine } from '@/engine/ToneEngine';
import * as Tone from 'tone';

export const toast: DubMove = {
  id: 'toast',
  kind: 'hold',
  defaults: { duckFactor: 0.4, attackSec: 0.04, releaseSec: 0.12, micGain: 1.0 },

  execute({ bus, params }) {
    const duckFactor = (params.duckFactor as number | undefined) ?? (this.defaults.duckFactor as number);
    const attackSec  = (params.attackSec  as number | undefined) ?? (this.defaults.attackSec  as number);
    const releaseSec = (params.releaseSec as number | undefined) ?? (this.defaults.releaseSec as number);
    const micGain    = (params.micGain    as number | undefined) ?? (this.defaults.micGain    as number);

    const ctx = bus.inputNode.context as AudioContext;
    const tap = ctx.createGain();
    tap.gain.value = 0;
    tap.connect(bus.inputNode);

    const duckedParams: Array<{ param: AudioParam; prev: number }> = [];
    let cleanupOwned: (() => void) | null = null;

    const rampUp = () => {
      const now = ctx.currentTime;
      tap.gain.cancelScheduledValues(now);
      tap.gain.setValueAtTime(0, now);
      tap.gain.linearRampToValueAtTime(micGain, now + attackSec);
    };

    const applyDuck = () => {
      // Duck Tone.js buses
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

      // Duck WASM engine outputs
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
            if (E && (E as unknown as { hasInstance?: () => boolean }).hasInstance?.()) {
              const inst = (E as unknown as { getInstance: () => unknown }).getInstance();
              const g = (inst as { output?: GainNode }).output?.gain;
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
    };

    // Try the DJ engine mic first (already has permission + routing)
    const dj = getDJEngineIfActive();
    const mic = dj?.mic;

    if (mic) {
      void (async () => {
        if (!mic.isActive) {
          void import('@/stores/useNotificationStore').then(({ notify }) =>
            notify.warning('Toast: starting mic — allow access if prompted'));
          try {
            await mic.start();
          } catch {
            void import('@/stores/useNotificationStore').then(({ notify }) =>
              notify.error('Mic permission denied — allow mic access and try again'));
            return;
          }
        }
        const src = mic.getSourceNode();
        if (!src) return;
        try { src.connect(tap); } catch { /* ok */ }
        rampUp();
        applyDuck();
      })();
    } else {
      // DJ engine not initialised — open a standalone mic directly
      void (async () => {
        if (!navigator.mediaDevices?.getUserMedia) {
          void import('@/stores/useNotificationStore').then(({ notify }) =>
            notify.warning('Toast: mic not available — open the DJ view to set up your mic'));
          return;
        }
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
          });
        } catch {
          void import('@/stores/useNotificationStore').then(({ notify }) =>
            notify.error('Mic permission denied — allow mic access and try again'));
          return;
        }
        const rawCtx = Tone.getContext().rawContext as AudioContext;
        const src = rawCtx.createMediaStreamSource(stream);
        try { src.connect(tap); } catch { /* ok */ }
        rampUp();
        applyDuck();
        cleanupOwned = () => {
          try { src.disconnect(); } catch { /* ok */ }
          stream.getTracks().forEach(t => t.stop());
        };
      })();
    }

    return {
      dispose() {
        const now = ctx.currentTime;
        tap.gain.cancelScheduledValues(now);
        tap.gain.setValueAtTime(tap.gain.value, now);
        tap.gain.linearRampToValueAtTime(0, now + releaseSec);
        setTimeout(() => {
          try { tap.disconnect(); } catch { /* ok */ }
          cleanupOwned?.();
        }, Math.ceil((releaseSec + 0.05) * 1000));
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
