/**
 * AudioContext Singleton - Shared audio context across the application
 *
 * Web Audio best practices:
 * - Only create one AudioContext per application
 * - Reuse context to avoid browser limits (typically 6 contexts max)
 * - Resume context on user interaction (autoplay policy)
 */

let globalAudioContext: AudioContext | null = null;
let resumePromise: Promise<void> | null = null;

/**
 * Get or create the global AudioContext instance
 */
export function getAudioContext(): AudioContext {
  if (!globalAudioContext) {
    globalAudioContext = new AudioContext();
    console.log('[AudioContext] Created global instance');
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
