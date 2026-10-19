/**
 * Forget the engine and audio-context globals that survive a module reload.
 *
 * ToneEngine and the DEViLBOX AudioContext live on globalThis so that a Vite
 * HMR re-evaluation reuses them (utils/globalSingleton.ts, utils/audio-context.ts).
 * A test harness that calls `vi.resetModules()` to get a fresh engine per render
 * must forget them too, or the next render reuses an engine bound to a context
 * that has already finished rendering and comes out silent.
 */
export function forgetAudioGlobals(): void {
  const g = globalThis as Record<string, unknown>;
  delete g.__devilboxSingletons;
  delete g.__devilboxAudioContext;
}
