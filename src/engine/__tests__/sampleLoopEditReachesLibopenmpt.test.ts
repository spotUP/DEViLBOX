/**
 * A loop dragged in a sample editor reaches the libopenmpt song player (UI4b).
 *
 * A MOD plays through libopenmpt, which holds its own copy of the module (the OpenMPT soundlib); the
 * instrument store's edit used to reach only the keyboard voice. The store's updateInstrument now tells
 * the edit bridge, which writes the loop into the soundlib copy and hot-reloads the player with the
 * re-serialized module at the current position. Measured on the module bytes the player receives: the
 * MOD sample header of the edited sample carries the dragged loop, and every other sample header is
 * untouched. Real soundlib WASM, real store, real song.
 *
 * Fails on revert: without syncSampleEdit the player is never sent a module.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useInstrumentStore } from '@stores/useInstrumentStore';

const hotReload = vi.hoisted(() => vi.fn());
vi.mock('@engine/libopenmpt/LibopenmptEngine', () => ({
  LibopenmptEngine: { hasInstance: () => true, getInstance: () => ({ hotReload }) },
}));

const ROOT = resolve(__dirname, '../../..');

/** A MOD sample header: length, loop start and loop length in frames (the file stores words). */
function modSampleHeader(mod: Uint8Array, n: number): { length: number; loopStart: number; loopEnd: number } {
  const at = 20 + 30 * (n - 1) + 22;
  const word = (o: number) => ((mod[at + o] << 8) | mod[at + o + 1]) * 2;
  const loopLength = word(6);
  return { length: word(0), loopStart: word(4), loopEnd: word(4) + loopLength };
}

/** A one-channel-used MOD: sample 1 is four flat segments of SEG bytes, played once at C-2 on row 0 of a 64-row pattern. */
const SEG = 1000;
const LEVELS = [12, 38, 64, 89]; // int8, 0.1 .. 0.7 of full scale
function levelsMod(): ArrayBuffer {
  const mod = new Uint8Array(20 + 31 * 30 + 2 + 128 + 4 + 1024 + SEG * 4);
  const words = (SEG * 4) / 2;
  const h = 20;
  mod[h + 22] = words >> 8; mod[h + 23] = words & 0xff; mod[h + 25] = 64; mod[h + 28] = 0; mod[h + 29] = 1;
  for (let i = 1; i < 31; i++) mod[20 + 30 * i + 29] = 1; // loop length 1 word = no loop, as written by trackers
  mod[20 + 930] = 1; mod[20 + 931] = 127; // song length, restart
  mod.set(new TextEncoder().encode('M.K.'), 20 + 930 + 2 + 128);
  const pat = 20 + 930 + 2 + 128 + 4;
  mod[pat] = 0x01; mod[pat + 1] = 0xac; mod[pat + 2] = 0x10; // sample 1 at period 428 (C-2), row 0 channel 0
  const data = pat + 1024;
  LEVELS.forEach((lv, k) => mod.fill(lv, data + k * SEG, data + (k + 1) * SEG));
  return mod.buffer;
}

/** Render a module with libopenmpt itself (the same build the song player runs); mean absolute level per window. */
async function renderLibopenmpt(buf: ArrayBuffer, seconds: number): Promise<{ level: (from: number, to: number) => number }> {
  const workletPath: string = '../../../public/chiptune3/libopenmpt.worklet.js';
  const factory = (await import(/* @vite-ignore */ workletPath)).default as () => Promise<Record<string, any>>;
  const m = await factory();
  const bytes = new Uint8Array(buf);
  const ptr = m._malloc(bytes.length);
  m.HEAPU8.set(bytes, ptr);
  const handle = m._openmpt_module_create_from_memory2(ptr, bytes.length, 0, 0, 0, 0, 0, 0, 0);
  expect(handle).not.toBe(0);
  const rate = 44100;
  const L = m._malloc(4 * 4096);
  const R = m._malloc(4 * 4096);
  const abs: number[] = [];
  while (abs.length < rate * seconds) {
    const n = m._openmpt_module_read_float_stereo(handle, rate, 4096, L, R) as number;
    if (!n) break;
    const f = new Float32Array(m.HEAPU8.buffer, L, n);
    for (let i = 0; i < n; i++) abs.push(Math.abs(f[i]));
  }
  return {
    level: (from, to) => {
      const part = abs.slice(Math.round(from * rate), Math.round(to * rate));
      return part.reduce((a, b) => a + b, 0) / part.length;
    },
  };
}

describe('a dragged loop reaches the libopenmpt song player', () => {
  beforeAll(() => {
    const wasmBinary = readFileSync(resolve(ROOT, 'public/openmpt/OpenMPTSoundlib.wasm'));
    (0, eval)(readFileSync(resolve(ROOT, 'public/openmpt/OpenMPTSoundlib.js'), 'utf8') + '\n;globalThis.__osl = createOpenMPTSoundlib;');
    const real = (globalThis as unknown as { __osl: (o: object) => Promise<unknown> }).__osl;
    (globalThis as unknown as Record<string, unknown>).createOpenMPTSoundlib = (o: object) => real({ ...o, wasmBinary });
    // The wrapper injects its glue with a <script> tag; the glue is already in place.
    vi.spyOn(document.head, 'appendChild').mockImplementation((node: Node) => {
      queueMicrotask(() => (node as HTMLScriptElement).onload?.(new Event('load')));
      return node;
    });
  });

  it('the module the player is hot-reloaded with carries the new loop, and nothing else moved', async () => {
    const { parseWithOpenMPT } = await import('@lib/import/wasm/OpenMPTConverter');
    const file = readFileSync(resolve(ROOT, 'public/data/songs/formats/a sleep so deep.mod'));
    const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
    const song = await parseWithOpenMPT(bytes, 'a sleep so deep.mod');
    useInstrumentStore.setState({ instruments: song.instruments });

    // the longest sample: room for a loop anywhere
    const original = new Uint8Array(bytes);
    const longest = Array.from({ length: 31 }, (_, i) => ({ n: i + 1, ...modSampleHeader(original, i + 1) }))
      .sort((a, b) => b.length - a.length)[0];
    expect(longest.length).toBeGreaterThan(2000);
    const loopStart = 400;
    const loopEnd = 1200;
    expect(modSampleHeader(original, longest.n).loopStart).not.toBe(loopStart);

    // what a loop-pin drag performs
    useInstrumentStore.getState().updateInstrument(longest.n, {
      sample: { loop: true, loopType: 'forward', loopStart, loopEnd },
    });

    await vi.waitFor(() => expect(hotReload).toHaveBeenCalled(), { timeout: 8000 });
    const sent = new Uint8Array(hotReload.mock.calls.at(-1)![0] as ArrayBuffer);
    expect(modSampleHeader(sent, longest.n)).toMatchObject({ loopStart, loopEnd });
    for (let n = 1; n <= 31; n++) {
      if (n === longest.n) continue;
      expect(modSampleHeader(sent, n), `sample ${n}`).toEqual(modSampleHeader(original, n));
    }
  }, 60000);

  // UI4c: a loop that is stored but empty, or past the sample's end, made the held note silent. The module the
  // player is hot-reloaded with is rendered by libopenmpt and the looped section must be AUDIBLE and be the sample's
  // own data at the dragged range.
  it('the song, rendered, sustains the dragged section of the sample and is silent without the loop', async () => {
    hotReload.mockClear();
    const { parseWithOpenMPT } = await import('@lib/import/wasm/OpenMPTConverter');
    const original = levelsMod();
    const song = await parseWithOpenMPT(original, 'levels.mod');
    useInstrumentStore.setState({ instruments: song.instruments });

    const plain = await renderLibopenmpt(original, 3);
    // the sample plays once (0.48 s at C-2); its last segment, as played, is the level the loop must hold
    const lastSegmentAsPlayed = plain.level(0.40, 0.46);
    expect(lastSegmentAsPlayed).toBeGreaterThan(0.01);
    expect(plain.level(1.5, 2.5)).toBeLessThan(lastSegmentAsPlayed * 0.05); // unlooped: the note has ended

    // what a loop-pin drag performs, in the sample's own frames (the sample is 4 x SEG)
    useInstrumentStore.getState().updateInstrument(1, {
      sample: { loop: true, loopType: 'forward', loopStart: 3 * SEG, loopEnd: 4 * SEG },
    });
    await vi.waitFor(() => expect(hotReload).toHaveBeenCalled(), { timeout: 8000 });
    const edited = await renderLibopenmpt(hotReload.mock.calls.at(-1)![0] as ArrayBuffer, 3);
    const held = edited.level(1.5, 2.5);
    expect(held).toBeGreaterThan(0.01);
    expect(held / lastSegmentAsPlayed).toBeGreaterThan(0.9);
    expect(held / lastSegmentAsPlayed).toBeLessThan(1.1);
    // and the section really is the top one: the same loop on the first segment is a different, lower level
    useInstrumentStore.getState().updateInstrument(1, {
      sample: { loop: true, loopType: 'forward', loopStart: 0, loopEnd: SEG },
    });
    await vi.waitFor(() => expect(hotReload.mock.calls.length).toBeGreaterThan(1), { timeout: 8000 });
    const low = await renderLibopenmpt(hotReload.mock.calls.at(-1)![0] as ArrayBuffer, 3);
    expect(low.level(1.5, 2.5) / held).toBeGreaterThan(0.1);
    expect(low.level(1.5, 2.5) / held).toBeLessThan(0.2);
  }, 60000);
});
