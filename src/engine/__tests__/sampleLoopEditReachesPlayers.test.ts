/**
 * A loop dragged in a sample editor is heard (UI4b, owner 2026-10-07: "i can drag them now the
 * visual loop points change but not the audio").
 *
 * The drag lands in the instrument store (useInstrumentStore.updateInstrument, the call every sample
 * editor makes). The players of that sample must follow, without a restart:
 *
 *  1. the keyboard voice: a Tone.Player in ToneEngine. Rendered offline with the real engine, a held
 *     note first loops the two low segments of a four-level sample, the loop is moved onto the top
 *     segment mid-note, and the output settles on that level;
 *  2. the libopenmpt song player: sampleLoopEditReachesLibopenmpt.test.ts.
 *
 * Fails on revert: before, the store only invalidated the engine's instrument, which cut a held note.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { installRealWebAudio, resolveWorkletsFromPublic, servePublicToFetch, audioLoadsSettled, realDelay } from '@/test/audio/realWebAudio';
import type { InstrumentConfig } from '@typedefs/instrument';

installRealWebAudio();
resolveWorkletsFromPublic();
servePublicToFetch();

// 8363 Hz is a MOD sample's rate: the loop is stored in frames at it (UI4c)
const RATE = 8363;
const SEG = 1000;
const LEVELS = [0.1, 0.3, 0.5, 0.7];

async function wavOfLevels(): Promise<ArrayBuffer> {
  const { createWavFile } = await import('@/lib/import/InstrumentConverter');
  const pcm = new Int16Array(SEG * LEVELS.length);
  LEVELS.forEach((lv, s) => pcm.fill(Math.round(lv * 32767), s * SEG, (s + 1) * SEG));
  return createWavFile(pcm, RATE);
}

function instrumentOf(wav: ArrayBuffer, id: number): InstrumentConfig {
  return {
    id, name: 'levels', type: 'sample', synthType: 'Sampler', volume: 0, pan: 0, effects: [], parameters: {},
    sample: {
      audioBuffer: wav, url: '', baseNote: 'C4', detune: 0, loop: true, loopType: 'forward',
      loopStart: 0, loopEnd: 2 * SEG, sampleRate: RATE, reverse: false, playbackRate: 1,
    },
  } as unknown as InstrumentConfig;
}

describe('a dragged loop reaches every player of the sample', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('a held keyboard note loops at the new points, rendered', async () => {
    const id = 1;
    const Tone = await import('tone');
    const ctx = new OfflineAudioContext(2, 44100 * 3, 44100);
    Tone.setContext(ctx as unknown as AudioContext);
    // ToneEngine opens its own AudioContext when it is built: hand it the offline one, so what it plays is rendered.
    const g = globalThis as unknown as Record<string, unknown>;
    const win = g.window as Record<string, unknown>;
    const RealContext = g.AudioContext;
    const OneOffline = function () { return ctx; } as unknown;
    g.AudioContext = OneOffline;
    win.AudioContext = OneOffline;
    const { useInstrumentStore } = await import('@stores/useInstrumentStore');
    const { getToneEngine } = await import('@engine/ToneEngine');
    const wav = await wavOfLevels();
    useInstrumentStore.setState({ instruments: [instrumentOf(wav, id)] });
    const engine = getToneEngine();
    const config = useInstrumentStore.getState().instruments[0];
    await engine.preloadInstruments([config]);
    await audioLoadsSettled();
    // An offline context reads 'suspended' until it renders; the key is pressed before the render starts.
    vi.spyOn(engine as unknown as { isContextActuallyRunning(): boolean }, 'isContextActuallyRunning').mockReturnValue(true);
    engine.triggerNoteAttack(id, 'C4', 0, 1, config);

    let dragFailure: unknown = null;
    // Stepped like the dub rigs: the worklets in the engine's graph need the main thread to answer
    // between blocks, so the render pauses every 50 ms of audio and yields.
    const STEP = 0.05;
    for (let k = 1; k < 3 / STEP; k++) {
      const t = +(k * STEP).toFixed(6);
      void ctx.suspend(t).then(async () => {
        if (Math.abs(t - 1.0) < 1e-6) {
          try {
            // what the pin drag performs: the loop start / end of the sample
            useInstrumentStore.getState().updateInstrument(id, { sample: { loopStart: 3 * SEG, loopEnd: 4 * SEG } });
          } catch (err) { dragFailure = err; }
        }
        await realDelay(5);
        // the last pause can land as the render ends
        await ctx.resume().catch(() => {});
      });
    }
    await realDelay(10);
    const out = await ctx.startRendering();
    g.AudioContext = RealContext;
    win.AudioContext = RealContext;
    expect(dragFailure).toBeNull();
    const mean = (from: number, to: number) => {
      const d = out.getChannelData(0);
      let s = 0;
      for (let i = Math.round(from * 44100); i < Math.round(to * 44100); i++) s += Math.abs(d[i]);
      return s / Math.round((to - from) * 44100);
    };
    const before = mean(0.5, 0.95);
    const after = mean(1.8, 2.9);
    expect(before).toBeGreaterThan(0.001); // the held note sounds at all
    expect(after).toBeGreaterThan(0.01); // and the moved loop is AUDIBLE, not an empty or out-of-range loop
    // low loop = mean of levels 0.1 and 0.3 (0.2); the moved loop is the 0.7 segment
    expect(after / before).toBeGreaterThan(2.5);
    expect(after / before).toBeLessThan(4.5);
  }, 60000);
});
