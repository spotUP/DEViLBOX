import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseMultiMediaSoundFile } from '../MultiMediaSoundParser';
import { exportMultiMediaSound } from '@/lib/export/MultiMediaSoundExporter';
import { baselineOf, setGridBaseline } from '@/lib/song/gridBaseline';

const FIXTURE = 'public/data/songs/multimedia-sound/bottle popper.mms';

function load() {
  const raw = readFileSync(FIXTURE);
  const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
  return { raw, song: parseMultiMediaSoundFile(ab, 'bottle popper.mms') };
}

describe('MultiMedia Sound round trip', () => {
  it('exports the unedited song byte-identical', async () => {
    const { raw, song } = load();
    setGridBaseline(baselineOf(song.patterns));
    const r = await exportMultiMediaSound(song);
    expect(Buffer.from(r.data).equals(raw)).toBe(true);
  });

  it('writes one edited cell and nothing else', async () => {
    const { raw, song } = load();
    setGridBaseline(baselineOf(song.patterns));
    const layout = song.uadePatternLayout!;
    expect(layout.numPatterns).toBeGreaterThan(1);
    const cell = song.patterns[0].channels[1].rows[3];
    cell.note = 25; // C-2 = period 428
    cell.instrument = 17;
    cell.effTyp = 0xc;
    cell.eff = 0x20;
    const off = layout.patternDataFileOffset + 3 * 16 + 1 * 4;
    const r = await exportMultiMediaSound(song);
    expect(Array.from(r.data.subarray(off, off + 4))).toEqual([0x11, 0xac, 0x1c, 0x20]);
    const diff = raw.reduce((n, b, i) => n + (b !== r.data[i] ? 1 : 0), 0);
    expect(diff).toBeLessThanOrEqual(4);
    const again = parseMultiMediaSoundFile(r.data.buffer.slice(0) as ArrayBuffer, 'bottle popper.mms');
    const c2 = again.patterns[0].channels[1].rows[3];
    expect([c2.note, c2.instrument, c2.effTyp, c2.eff]).toEqual([25, 17, 0xc, 0x20]);
  });
});
