/** UltraTracker (.ult) re-pack: unedited export is the loaded module; pattern, order and sample edits reparse to the edited values; unrepresentable effects warn. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseULTFile } from '@/lib/import/formats/ULTParser';
import { createWavFile } from '@/lib/import/InstrumentConverter';
import { baselineOf, setGridBaseline } from '@/lib/song/gridBaseline';
import { exportULT } from '../ULTExporter';

const FIXTURE = join(process.cwd(), 'public/data/songs/ultra-tracker/seasons.ult');
const ab = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
const load = async () => {
  const b = readFileSync(FIXTURE);
  const song = await parseULTFile(ab(b), 'seasons.ult');
  setGridBaseline(baselineOf(song.patterns));
  return { b, song };
};

describe('ULTExporter', () => {
  it('unedited export is the loaded module', async () => {
    const { b, song } = await load();
    expect(Buffer.from((await exportULT(song)).data).equals(b)).toBe(true);
  });

  it('pattern, order and sample edits are re-packed and reparse to the edit; untouched rows keep their cells', async () => {
    const { song } = await load();
    const before = song.patterns.map((p) => p.channels.map((c) => c.rows.map((r) => [r.note, r.instrument, r.effTyp, r.eff])));
    for (let r = 0; r < 64; r++) song.patterns[1].channels[r % 4].rows[r] = { ...song.patterns[1].channels[r % 4].rows[r], note: 30 + (r % 12), instrument: 2, effTyp: 0x0C, eff: 32, effTyp2: 0, eff2: 0 };
    song.songPositions = [1, 0, 1];
    const k = song.instruments.findIndex((i) => i.sample);
    const inst = song.instruments[k];
    const pcm = new Int16Array(300).map((_, i) => ((i * 7) % 200 - 100) * 256);
    inst.sample!.audioBuffer = createWavFile(pcm, 8363);
    inst.name = 'edited';
    const out = await exportULT(song);
    const re = await parseULTFile(ab(out.data), 'x.ult');
    expect(re.songPositions).toEqual([1, 0, 1]);
    for (let r = 0; r < 64; r++) {
      const g = re.patterns[1].channels[r % 4].rows[r];
      expect([g.note, g.instrument, g.effTyp, g.eff]).toEqual([30 + (r % 12), 2, 0x0C, 32]);
    }
    expect(re.patterns[0].channels.map((c) => c.rows.map((x) => [x.note, x.instrument, x.effTyp, x.eff]))).toEqual(before[0]);
    expect(re.instruments[k].name).toBe('edited');
  });

  it('an effect this version cannot hold is dropped with a warning', async () => {
    const { song } = await load();
    song.patterns[0].channels[0].rows[3] = { ...song.patterns[0].channels[0].rows[3], effTyp: 0x10, eff: 5 };
    const out = await exportULT(song);
    expect(out.warnings.join('\n')).toContain('cannot be written');
  });
});
