/**
 * Stubs for the app graph a RECORD-VOICE reachability test does not exercise.
 *
 * `fireDjFx` lives in DjFxActions, whose static imports (transport store, DJ store, DJActions,
 * the pad router, ToneEngine) pull ~690 modules of the app. A record gesture touches none of
 * them: it goes registry -> voice pool -> record voice -> ring worklet -> scratch bus. Loading
 * that graph cost 18 s of the 20-25 s these tests took (SA-M7, profiled 2026-10-12: the offline
 * render itself is 0.1 s); stubbing it brings each to ~2 s. Use from a test file as
 *
 *   vi.mock('@/stores/useTransportStore', () => scratchRegistryStubs.transportStore);
 *
 * (factories only: vi.mock is hoisted above imports, so each factory loads this module lazily).
 */
export const scratchRegistryStubModules = {
  '@/stores/useTransportStore': () => ({ useTransportStore: { getState: () => ({ bpm: 125 }) } }),
  '@/stores/useDJStore': () => ({ useDJStore: { getState: () => ({ decks: { A: { effectiveBPM: 125 }, B: { effectiveBPM: 125 } } }) } }),
  '@/engine/dj/DJActions': () => ({}),
  '@/engine/dj/DJQuantizedFX': () => ({}),
  '@/engine/dj/DJBeatJump': () => ({}),
  '@/engine/dj/DJAutoSync': () => ({}),
  '@/hooks/drumpad/useMIDIPadRouting': () => ({ getDrumPadEngine: () => null, getNoteRepeatEngine: () => null }),
  '@engine/ToneEngine': () => ({ getToneEngine: () => ({}), getToneEngineIfActive: () => null }),
} as const;
