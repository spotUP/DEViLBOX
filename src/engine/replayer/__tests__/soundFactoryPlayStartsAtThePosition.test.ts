/**
 * Play / Play Pattern on a Sound Factory song starts at the replayer position, not at position 01 (goldrunner, 2026-11-05).
 *
 * Wired: the transport start (startNativeEngines, as TrackerReplayer.play calls it) hands the SoundFactory2 engine the
 * grid row's tick through the descriptor's startAt seam before play(); sentinel = the mock engine's seekTick/play calls.
 * Behaviour: the real SoundFactory2.wasm, seeked with sf_seek_tick to that tick, plays tick N next, and the sequencer
 * state equals playing there from the top (the first notes after the seek come out of the same voices as a full run).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseSoundFactoryWithEffects } from '@/lib/import/formats/SoundFactoryParser';

const ROOT = resolve(__dirname, '../../../..');
const file = new Uint8Array(readFileSync(resolve(ROOT, 'public/data/songs/formats/goldrunner.psf')));

const calls = vi.hoisted(() => [] as string[]);
const engine = vi.hoisted(() => ({
  ready: async () => {},
  loadTune: async () => {},
  setMuteMask: () => {},
  seekTick: (tick: number) => { calls.push(`seek:${tick}`); },
  play: () => { calls.push('play'); },
  output: { context: { sampleRate: 48000 } },
}));
vi.mock('@/engine/soundfactory/SoundFactory2Engine', () => ({
  SoundFactory2Engine: { hasInstance: () => true, getInstance: () => engine },
}));
vi.mock('@/engine/ToneEngine', () => {
  const t = { releaseAll: vi.fn(), getInstrument: vi.fn(), setBPM: vi.fn() };
  return { getToneEngine: () => t };
});

async function loadModule(): Promise<any> {
  const src = readFileSync(resolve(ROOT, 'public/soundfactory/SoundFactory2.js'), 'utf8');
  const factory = new Function('self', `${src}\n;return createSoundFactory;`)({ location: { href: 'file:///sf/' } });
  return factory({ wasmBinary: readFileSync(resolve(ROOT, 'public/soundfactory/SoundFactory2.wasm')) });
}

describe('Sound Factory transport start', () => {
  const song = parseSoundFactoryWithEffects(file, 'goldrunner.psf')!.song;

  it('the registry seam turns the grid position into the engine tick and seeks the engine with it', async () => {
    // startNativeEngines (NativeEngineRouting) calls exactly this pair before play() for a start away from 0/0; its own
    // module graph does not load under vitest (same 30 s hang as uadePlayStartsAtThePosition), so the seam is driven here.
    const { WASM_ENGINES } = await import('@/engine/replayer/wasmEngineRegistry');
    const desc = WASM_ENGINES.find((d) => d.key === 'SoundFactory2Replayer')!;
    expect(desc.startAt).toBeTypeOf('function');
    const tick = desc.startTargetOf!(song as never, 6, 3);
    expect(tick).toBe((6 * 64 + 3) * song.initialSpeed);
    calls.length = 0;
    desc.startAt!(engine as never, tick!);
    expect(calls).toEqual([`seek:${tick}`]);
  });

  it('the replayer plays the asked tick next, with the state of playing there from the top', async () => {
    const step = song.initialSpeed;
    const target = 6 * 64 * step; // position 6 row 0 as the grid shows it
    const m = await loadModule();
    const data = m._malloc(file.length);
    m.HEAPU8.set(file, data);
    const mk = () => {
      const h = m._sf_create(data, file.length, 44100);
      m._sf_select_subsong(h, 0);
      return h;
    };
    const N = 128;
    const bufs = [0, 1, 2, 3].map(() => m._malloc(N * 4));
    const render = (h: number) => {
      m._sf_render_multi(h, bufs[0], bufs[1], bufs[2], bufs[3], N);
      return bufs.map((b) => Array.from(new Float32Array(m.HEAPF32.buffer, b, N)));
    };
    const ticks = (h: number) => m._sf_get_play_tick(h);

    const seeked = mk();
    expect(m._sf_seek_tick(seeked, target)).toBe(target);
    render(seeked);
    expect(ticks(seeked)).toBe(target);          // position 6 row 0
    expect(Math.floor(ticks(seeked) / step / 64)).toBe(6);

    // Reference: play from the top to the same tick (render until it fires), then compare the sequencer's tick.
    const full = mk();
    let guard = 0;
    while (ticks(full) < target && guard++ < 2_000_000) render(full);
    expect(ticks(full)).toBe(target);
    // Same tick fired, and the voices the sequencer set up are the same ones: every channel that sounds in the
    // reference at this tick sounds in the seeked run, and none that is silent there sounds.
    const a = render(seeked), b = render(full);
    const active = (r: number[][]) => r.map((c) => c.some((v) => v !== 0));
    expect(active(a)).toEqual(active(b));
    m._sf_destroy(seeked); m._sf_destroy(full);
  });
});
