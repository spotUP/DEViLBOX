/**
 * Commands typed into a fresh song play (reported 2026-10-20: "basically no
 * commands work").
 *
 * A song that was never imported gets its libopenmpt module built at play
 * time (TrackerReplayer Phase 5.4). libopenmpt plays every command from that
 * module while the hybrid route plays the synth notes. The module used to be
 * created with the right pattern lengths and order list but no cells, so
 * Dxx, Bxx, Fxx and every other command typed before the first play never
 * reached playback. The builder now writes every cell.
 *
 * Measured on the XM the player receives, parsed back by the real soundlib.
 * Fails on revert: without the cell write the parsed pattern holds no D00.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EMPTY_CELL, type TrackerCell } from '@/types/tracker';

const ROOT = resolve(__dirname, '../../..');

const cell = (over: Partial<TrackerCell> = {}): TrackerCell => ({ ...EMPTY_CELL, ...over });

describe('a fresh song module carries the typed commands', () => {
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

  it('a D00, an F06 and a note typed before the first play are in the module', async () => {
    const rows = (n: number) => Array.from({ length: n }, () => cell());
    const ch0 = rows(16);
    const ch1 = rows(16);
    ch0[0] = cell({ note: 49, instrument: 1, effTyp: 15, eff: 0x06 }); // C-4, F06
    ch1[3] = cell({ effTyp: 13, eff: 0x00 });                           // D00 on row 3, channel 2
    const song = {
      numChannels: 2,
      patterns: [{ length: 16, channels: [{ rows: ch0 }, { rows: ch1 }] }, { length: 16, channels: [{ rows: rows(16) }, { rows: rows(16) }] }],
      songPositions: [0, 1],
    };

    const bridge = await import('@engine/libopenmpt/OpenMPTEditBridge');
    const data = await bridge.createModuleForSong(song, () => false);
    expect(data).not.toBeNull();
    expect(bridge.isActive()).toBe(true);

    const { parseWithOpenMPT } = await import('@lib/import/wasm/OpenMPTConverter');
    const back = await parseWithOpenMPT(data!, 'fresh.xm');
    const p0 = back.patterns[0];
    expect(p0.length).toBe(16);
    expect(p0.channels[1].rows[3]).toMatchObject({ effTyp: 13, eff: 0x00 });
    expect(p0.channels[0].rows[0]).toMatchObject({ note: 49, instrument: 1, effTyp: 15, eff: 0x06 });
    expect(back.songPositions).toEqual([0, 1]);
  }, 60000);

  it('a D00 typed in effect column 2 is in the module, with column 1 moved to the volume column', async () => {
    const rows = (n: number) => Array.from({ length: n }, () => cell());
    const ch0 = rows(16);
    // A04 in column 1, D00 in column 2: the break wins the command slot and
    // the volume slide goes to the volume column (0x64 = slide down 4).
    ch0[5] = cell({ effTyp: 10, eff: 0x04, effTyp2: 13, eff2: 0x00 });
    const song = {
      numChannels: 1,
      patterns: [{ length: 16, channels: [{ rows: ch0 }] }],
      songPositions: [0],
    };

    const bridge = await import('@engine/libopenmpt/OpenMPTEditBridge');
    const data = await bridge.createModuleForSong(song, () => false);
    const { parseWithOpenMPT } = await import('@lib/import/wasm/OpenMPTConverter');
    const back = await parseWithOpenMPT(data!, 'fresh.xm');
    const r = back.patterns[0].channels[0].rows[5];
    const effects = [[r.effTyp, r.eff], [r.effTyp2, r.eff2]];
    expect(effects).toContainEqual([13, 0x00]);
    expect(r.volume).toBe(0x64);
  }, 60000);
});
