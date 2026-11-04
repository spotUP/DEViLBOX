/**
 * Reachability: a JayTrax file with several subsongs dropped on the product's top-level import
 * (parseModuleToSong with a requested subsong) lays out THAT subsong's grid from the carrier, reports the
 * subsong count through the shared model (song.fileSubsongs), and an edit in subsong 1 reaches exactly one
 * pattern-row byte in the export; the unedited export is byte-identical.
 *
 * No fixture in public/data/songs/formats holds more than one subsong (all five have S = 1), so the test
 * builds one from popcorn.jxs: a second 16564 byte subsong block is inserted whose channel 0 plays pattern 3
 * for 16 rows, and the header's subsong count is bumped.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('@lib/import/formats/JxsParser', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@lib/import/formats/JxsParser')>();
  return { ...mod, parseJxsFile: vi.fn(mod.parseJxsFile) };
});

import { parseModuleToSong } from '@/lib/import/parseModuleToSong';
import { parseJxsFile } from '@lib/import/formats/JxsParser';
import { exportJxs } from '@lib/export/JxsExporter';
import { jxsLayout, JXS_SUBSONG_BYTES } from '@lib/import/formats/jxsInstrument';
import { decodeJxsModule, jxsSubsongAudible } from '@lib/import/formats/jxsGrid';

const PATH = 'public/data/songs/formats/popcorn.jxs';

function twoSubsongs(raw: Uint8Array): Uint8Array {
  const lay = jxsLayout(raw)!;
  const at = lay.subsongOffset + JXS_SUBSONG_BYTES;           // end of subsong 0
  const block = raw.slice(lay.subsongOffset, at);
  const dv = new DataView(block.buffer);
  dv.setInt16(180, 3, true);                                  // channel 0, entry 0: pattern 3 ...
  dv.setInt16(182, 16, true);                                 // ... for 16 rows
  for (let k = 1; k < 256; k++) dv.setInt16(180 + 4 * k + 2, 0, true);   // channel 0 has no other entries
  const out = new Uint8Array(raw.length + block.length);
  out.set(raw.subarray(0, at), 0);
  out.set(block, at);
  out.set(raw.subarray(at), at + block.length);
  new DataView(out.buffer).setInt32(8, 2, true);
  return out;
}

describe('JayTrax subsongs', () => {
  it('top-level import lays out subsong 1, and an edit there writes exactly one pattern byte', async () => {
    const raw = new Uint8Array(readFileSync(PATH));
    const two = twoSubsongs(raw);
    const lay = jxsLayout(two)!;
    expect(lay.subsongs).toBe(2);

    const open = (n?: number) => parseModuleToSong(new File([new Uint8Array(two)], 'popcorn.jxs'), n);
    const s0 = await open(0);
    expect(s0.fileSubsongs).toEqual({ count: 2, current: 0, fileName: 'popcorn.jxs' });

    vi.mocked(parseJxsFile).mockClear();
    const s1 = await open(1);
    // Sentinel: the parser ran once and was asked for subsong 1.
    expect(vi.mocked(parseJxsFile)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(parseJxsFile).mock.calls[0][2]).toBe(1);
    expect(s1.fileSubsongs).toEqual({ count: 2, current: 1, fileName: 'popcorn.jxs' });
    expect(jxsSubsongAudible(two, 1)).toBe(true);
    expect(decodeJxsModule(two, 2)).toBeNull();

    // Subsong 1, channel 0 plays only 16 rows (pattern 3); subsong 0 plays its own order.
    const m1 = decodeJxsModule(two, 1)!;
    expect(m1.segments[0]).toEqual([{ start: 0, length: 16, pattern: 3 }]);
    expect(s1.patterns[0].channels[0].rows.slice(16).every((r) => r.note === 0)).toBe(true);
    for (let r = 0; r < 16; r++) {                       // rows 0..15 are pattern 3's, read straight from the file
      const raw = two[m1.patternOffset + (3 * 64 + r) * 5];
      expect(s1.patterns[0].channels[0].rows[r].note).toBe(raw === 0 ? 0 : raw - 47);
    }

    // Unedited export is byte-identical.
    const same = new Uint8Array(await (await exportJxs(s1)).data.arrayBuffer());
    expect(Buffer.from(same).equals(Buffer.from(two))).toBe(true);

    // One edit in subsong 1: row 0 of channel 0 gets note 30; only that pattern row's note byte changes.
    const row0 = s1.patterns[0].channels[0].rows[0];
    const newNote = row0.note === 30 ? 31 : 30;
    s1.patterns[0].channels[0].rows[0] = { ...row0, note: newNote };
    const edited = new Uint8Array(await (await exportJxs(s1)).data.arrayBuffer());
    const diff = [...edited].map((b, i) => (b !== two[i] ? i : -1)).filter((i) => i >= 0);
    expect(diff).toEqual([m1.patternOffset + 3 * 64 * 5]);
    expect(edited[diff[0]]).toBe(newNote + 47);
  });
});
