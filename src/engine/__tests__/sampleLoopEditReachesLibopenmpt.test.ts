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
});
