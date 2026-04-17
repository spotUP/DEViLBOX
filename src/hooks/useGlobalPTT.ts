/**
 * useGlobalPTT — Global push-to-talk hook.
 *
 * Mounts in App.tsx so it works from any view.
 * Listens to useVocoderStore.pttActive (set by keyboard shortcut or MIDI).
 *
 * DJVocoderControl registers its engine here so we reuse the exact same
 * audio path as the TALK button. If no engine is registered (VJ-only),
 * we create a fallback.
 */

import { useEffect, useRef } from 'react';
import * as Tone from 'tone';
import { useVocoderStore } from '@stores/useVocoderStore';
import { VocoderEngine } from '@engine/vocoder/VocoderEngine';
import { getDJEngineIfActive } from '@engine/dj/DJEngine';

// ── Shared engine registry ──────────────────────────────────────────────────
// DJVocoderControl registers its engine + PTT callbacks here.
// The global PTT hook calls these instead of creating a separate engine.

let registeredPTTDown: (() => void) | null = null;
let registeredPTTUp: (() => void) | null = null;

/** Called by DJVocoderControl to register its PTT handlers */
export function registerPTTHandlers(down: () => void, up: () => void): void {
  registeredPTTDown = down;
  registeredPTTUp = up;
}

/** Called by DJVocoderControl on unmount */
export function unregisterPTTHandlers(): void {
  registeredPTTDown = null;
  registeredPTTUp = null;
}

// ── Fallback engine (when DJVocoderControl is not mounted) ──────────────────
let fallbackEngine: VocoderEngine | null = null;

async function ensureFallbackEngine(): Promise<VocoderEngine | null> {
  if (fallbackEngine) return fallbackEngine;
  try {
    await VocoderEngine.preload();
    const djEngine = getDJEngineIfActive();
    const dest = djEngine?.mixer.samplerInput ?? (() => {
      const d = Tone.getDestination();
      return (d as any).input ?? (d as any)._gainNode ?? (d as any).output?.input;
    })();
    fallbackEngine = new VocoderEngine(dest as AudioNode);
    await fallbackEngine.start();
    fallbackEngine.setMuted(true);
    fallbackEngine.setMicActive(false);
    fallbackEngine.setVocoderBypass(false);
    return fallbackEngine;
  } catch (err) {
    console.error('[GlobalPTT] Failed to start fallback vocoder:', err);
    fallbackEngine = null;
    return null;
  }
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useGlobalPTT(): void {
  const pttActive = useVocoderStore(s => s.pttActive);
  const prevRef = useRef(false);

  useEffect(() => {
    if (pttActive && !prevRef.current) {
      // PTT down — use registered DJ handler if available, otherwise fallback
      if (registeredPTTDown) {
        registeredPTTDown();
      } else {
        (async () => {
          const engine = await ensureFallbackEngine();
          if (!engine) return;
          engine.setMicActive(true);
          engine.setMuted(false);
          useVocoderStore.getState().setActive(true);
          try { getDJEngineIfActive()?.mixer.duck(); } catch { /* ok */ }
        })();
      }
    } else if (!pttActive && prevRef.current) {
      // PTT up
      if (registeredPTTUp) {
        registeredPTTUp();
      } else if (fallbackEngine) {
        fallbackEngine.setMuted(true);
        fallbackEngine.setMicActive(false);
        useVocoderStore.getState().setActive(false);
        try { getDJEngineIfActive()?.mixer.unduck(); } catch { /* ok */ }
      }
    }
    prevRef.current = pttActive;
  }, [pttActive]);

  useEffect(() => {
    return () => {
      if (fallbackEngine) {
        useVocoderStore.getState().setActive(false);
        fallbackEngine.dispose();
        fallbackEngine = null;
      }
    };
  }, []);
}
