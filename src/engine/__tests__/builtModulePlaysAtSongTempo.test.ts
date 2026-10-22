/**
 * An imported MIDI plays at its own tempo (reported 2026-10-21: "the tempo is
 * too fast in the midis i try").
 *
 * A song of Tone synths is sequenced by libopenmpt through a module built at
 * play time (createModuleForSong, TrackerReplayer Phase 5.4). The builder
 * never set the initial speed or tempo, so the module played at the XM
 * default of 125 BPM: fade_away.mid (75 BPM) ran 125/75 = 1.67 times fast.
 *
 * Driven from the MIDI file through the song loader, then measured on the
 * module the player receives, parsed back by the real soundlib.
 * Fails on revert: without the tempo write the module reads back 125 BPM.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../..');

async function moduleTempoOf(name: string): Promise<{ bpm: number; speed: number }> {
  const buf = readFileSync(resolve(ROOT, 'public/data/songs/midi', name));
  const { parseMIDIFile } = await import('@lib/import/parsers/MidiToSong');
  const song = await parseMIDIFile(new File([buf], name));
  const bridge = await import('@engine/libopenmpt/OpenMPTEditBridge');
  const data = await bridge.createModuleForSong(song, () => false);
  expect(data).not.toBeNull();
  const { parseWithOpenMPT } = await import('@lib/import/wasm/OpenMPTConverter');
  const back = await parseWithOpenMPT(data!, 'built.xm');
  return { bpm: back.initialBPM, speed: back.initialSpeed };
}

describe('a built module plays at the song tempo', () => {
  beforeAll(() => {
    const wasmBinary = readFileSync(resolve(ROOT, 'public/openmpt/OpenMPTSoundlib.wasm'));
    (0, eval)(readFileSync(resolve(ROOT, 'public/openmpt/OpenMPTSoundlib.js'), 'utf8') + '\n;globalThis.__osl = createOpenMPTSoundlib;');
    const real = (globalThis as unknown as { __osl: (o: object) => Promise<unknown> }).__osl;
    (globalThis as unknown as Record<string, unknown>).createOpenMPTSoundlib = (o: object) => real({ ...o, wasmBinary });
    vi.spyOn(document.head, 'appendChild').mockImplementation((node: Node) => {
      queueMicrotask(() => (node as HTMLScriptElement).onload?.(new Event('load')));
      return node;
    });
  });

  it('fade_away.mid (75 BPM) builds a 75 BPM, speed 6 module', async () => {
    expect(await moduleTempoOf('fade_away.mid')).toEqual({ bpm: 75, speed: 6 });
  }, 60000);

  it('queen_majesty.mid (78.01 BPM) builds a 78 BPM module: XM stores whole BPM', async () => {
    expect((await moduleTempoOf('queen_majesty.mid')).bpm).toBe(78);
  }, 60000);
});
