/**
 * The real ToneEngine on its own OfflineAudioContext: one fresh engine per call, the instrument preloaded,
 * `play` schedules on it, the stereo render comes back.
 *
 * The context is a Tone.OfflineContext, not a bare OfflineAudioContext handed to Tone.setContext: Tone runs its
 * clock through the render only on its own offline context, and PolySynth schedules every future attack and
 * release on that clock (context.setTimeout). On a bare context those notes never start.
 */
import { vi } from 'vitest';
import { forgetAudioGlobals } from './forgetAudioGlobals';
import { installRealWebAudio, resolveWorkletsFromPublic, servePublicToFetch, audioLoadsSettled } from '@/test/audio/realWebAudio';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { ToneEngine } from '@engine/ToneEngine';

export type Stereo = [Float32Array, Float32Array];
export type PlayOnEngine = (engine: ToneEngine, cfg: InstrumentConfig, Tone: typeof import('tone')) => void | Promise<void>;

export async function renderOnEngine(config: InstrumentConfig, play: PlayOnEngine, secs: number, sampleRate: number): Promise<Stereo> {
  vi.resetModules();
  forgetAudioGlobals(); // a fresh engine on this render's OfflineAudioContext, not the previous render's
  installRealWebAudio(); resolveWorkletsFromPublic(); servePublicToFetch();
  const Tone = await import('tone');
  const ctx = new OfflineAudioContext(2, Math.ceil(sampleRate * secs), sampleRate);
  const offline = new Tone.OfflineContext(ctx as unknown as OfflineAudioContext);
  Tone.setContext(offline);
  const g = globalThis as unknown as Record<string, unknown>;
  const win = g.window as Record<string, unknown>;
  const Real = g.AudioContext;
  const One = function () { return ctx; } as unknown;
  g.AudioContext = One; win.AudioContext = One;
  try {
    const { useInstrumentStore } = await import('@stores/useInstrumentStore');
    const { getToneEngine } = await import('@engine/ToneEngine');
    useInstrumentStore.setState({ instruments: [config] });
    const engine = getToneEngine();
    // The engine constructor hands its native context (this render's ctx) to Tone.setContext, which wraps it in
    // a realtime clock. Put the offline context back before any instrument is built; getInstrument keeps it,
    // because its rawContext is still the engine's native context.
    Tone.setContext(offline);
    const cfg = useInstrumentStore.getState().instruments[0];
    await engine.preloadInstruments([cfg]);
    await audioLoadsSettled();
    vi.spyOn(engine as unknown as { isContextActuallyRunning(): boolean }, 'isContextActuallyRunning').mockReturnValue(true);
    await play(engine, cfg, Tone);
    const out = await offline.render(false);
    return [out.getChannelData(0).slice(), out.getChannelData(1).slice()];
  } finally {
    g.AudioContext = Real; win.AudioContext = Real;
  }
}
