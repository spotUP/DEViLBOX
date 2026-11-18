/** Scream Tracker Music Interface Kit (.stx) re-pack: unedited export is the loaded module; pattern, order and sample edits reparse to the edited values. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSTXFile } from '@/lib/import/formats/STXParser';
import { createWavFile } from '@/lib/import/InstrumentConverter';
import { baselineOf, setGridBaseline } from '@/lib/song/gridBaseline';
import { exportSTX } from '../STXExporter';

const FIXTURE = join(process.cwd(), 'public/data/songs/formats/futurebrain.stx');
const ab = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
const load = () => {
  const b = readFileSync(FIXTURE);
  const song = parseSTXFile(ab(b), 'futurebrain.stx');
  setGridBaseline(baselineOf(song.patterns));
  return { b, song };
};

describe('STXExporter', () => {
  it('unedited export is the loaded module', async () => {
    const { b, song } = load();
    expect(Buffer.from((await exportSTX(song)).data).equals(b)).toBe(true);
  });

  it('pattern cells, song order and sample PCM/loop/volume/name edits are re-packed and reparse to the edit', async () => {
    const { song } = load();
    const before = song.patterns.map((p) => p.channels.map((c) => c.rows.map((r) => [r.note, r.instrument, r.volume])));
    for (let r = 0; r < 64; r++) song.patterns[1].channels[r % 4].rows[r] = { ...song.patterns[1].channels[r % 4].rows[r], note: 30 + (r % 12), instrument: 2, volume: 40, effTyp: 0x0F, eff: 3 };
    song.songPositions = [1, 0, 1];
    const k = song.instruments.findIndex((i) => i.sample);
    const k2 = song.instruments.findIndex((i, n) => n > k && i.sample);
    const inst = song.instruments[k];
    const pcm = new Int16Array(300).map((_, i) => ((i * 7) % 200 - 100) * 256);
    inst.sample!.audioBuffer = createWavFile(pcm, 8363);
    inst.sample!.loop = true; inst.sample!.loopStart = 10; inst.sample!.loopEnd = 200;
    inst.metadata!.modPlayback!.defaultVolume = 33;
    inst.name = 'edited';
    const out = await exportSTX(song);
    const re = parseSTXFile(ab(out.data), 'x.stx');
    expect(re.songPositions).toEqual([1, 0, 1]);
    for (let r = 0; r < 64; r++) {
      const g = re.patterns[1].channels[r % 4].rows[r];
      expect([g.note, g.instrument, g.volume, g.effTyp, g.eff]).toEqual([30 + (r % 12), 2, 40, 0x0F, 3]);
    }
    expect(re.patterns[0].channels.map((c) => c.rows.map((x) => [x.note, x.instrument, x.volume]))).toEqual(before[0]);
    const ri = re.instruments[k];
    expect(ri.name).toBe('edited');
    expect(ri.sample!.loop).toBe(true);
    expect([ri.sample!.loopStart, ri.sample!.loopEnd]).toEqual([10, 200]);
    expect(ri.metadata!.modPlayback!.defaultVolume).toBe(33);
    const w = new DataView(ri.sample!.audioBuffer!);
    expect((w.byteLength - 44 - 68) / 2).toBe(300);
    expect(w.getInt16(44 + 5 * 2, true)).toBe(pcm[5]);
    expect(re.instruments[k2].sample!.audioBuffer!.byteLength).toBe(song.instruments[k2].sample!.audioBuffer!.byteLength);
  });
});
