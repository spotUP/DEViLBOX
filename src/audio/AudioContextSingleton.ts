/**
 * AudioContext Singleton - Shared audio context across the application
 *
 * Web Audio best practices:
 * - Only create one AudioContext per application
 * - Reuse context to avoid browser limits (typically 6 contexts max)
 * - Resume context on user interaction (autoplay policy)
 *
 * iOS FIX: This module now tries to reuse the ToneEngine's shared AudioContext
 * (via getDevilboxAudioContext) instead of creating a separate one. iOS Safari
 * limits concurrent AudioContexts to ~4-6, so we must consolidate.
 */

import { getDevilboxAudioContext } from '@utils/audio-context';

let globalAudioContext: AudioContext | null = null;
let resumePromise: Promise<void> | null = null;

/**
 * Get or create the global AudioContext instance.
 * Prefers the shared ToneEngine context to avoid exceeding iOS limits.
 */
export function getAudioContext(): AudioContext {
  if (!globalAudioContext) {
    // Try to use the shared ToneEngine context first (avoids iOS context limit)
    try {
      const shared = getDevilboxAudioContext();
      if (shared) {
        globalAudioContext = shared;
        console.log('[AudioContext] Using shared ToneEngine context');
        return globalAudioContext;
      }
    } catch {
      // ToneEngine not initialized yet — fall through to create standalone
    }
    globalAudioContext = new AudioContext();
    console.log('[AudioContext] Created standalone instance (ToneEngine not yet available)');
  }
  return globalAudioContext;
}

/**
 * Resume AudioContext if suspended (required by browser autoplay policy)
 * Call this on user interaction (click, touch, etc.)
 */
export async function resumeAudioContext(): Promise<void> {
  const context = getAudioContext();

  if (context.state === 'suspended') {
    // Avoid multiple resume calls
    if (!resumePromise) {
      resumePromise = context.resume().then(() => {
        console.log('[AudioContext] Resumed');
        resumePromise = null;
      });
    }
    await resumePromise;
  }
}

/**
 * Check if AudioContext is ready for playback
 */
export function isAudioContextReady(): boolean {
  return globalAudioContext !== null && globalAudioContext.state === 'running';
}

/**
 * Close the global AudioContext (cleanup on app unmount)
 */
export async function closeAudioContext(): Promise<void> {
  if (globalAudioContext) {
    await globalAudioContext.close();
    globalAudioContext = null;
    console.log('[AudioContext] Closed');
  }
}
