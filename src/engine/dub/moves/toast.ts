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

    // Duck Tone.js buses (sample + synth). WASM replayer outputs would need
    // their own ramping — deferred.
    let prevSample = 1;
    let prevSynth = 1;
    try {
      const tone = getToneEngine();
      prevSample = tone.masterInput.gain.value;
      prevSynth = tone.synthBus.gain.value;
      const now = ctx.currentTime;
      tone.masterInput.gain.cancelScheduledValues(now);
      tone.masterInput.gain.setValueAtTime(prevSample, now);
      tone.masterInput.gain.linearRampToValueAtTime(prevSample * duckFactor, now + attackSec);
      tone.synthBus.gain.cancelScheduledValues(now);
      tone.synthBus.gain.setValueAtTime(prevSynth, now);
      tone.synthBus.gain.linearRampToValueAtTime(prevSynth * duckFactor, now + attackSec);
    } catch { /* tone engine not ready */ }

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
        try {
          const tone = getToneEngine();
          const t = ctx.currentTime;
          tone.masterInput.gain.cancelScheduledValues(t);
          tone.masterInput.gain.setValueAtTime(tone.masterInput.gain.value, t);
          tone.masterInput.gain.linearRampToValueAtTime(prevSample, t + releaseSec);
          tone.synthBus.gain.cancelScheduledValues(t);
          tone.synthBus.gain.setValueAtTime(tone.synthBus.gain.value, t);
          tone.synthBus.gain.linearRampToValueAtTime(prevSynth, t + releaseSec);
        } catch { /* ok */ }
      },
    };
  },
};
