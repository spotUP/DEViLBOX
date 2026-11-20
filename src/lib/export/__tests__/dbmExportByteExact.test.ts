/** DigiBooster Pro export writes the loaded .dbm back byte for byte; a note edit changes only its own pattern bytes. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDigiBoosterProFile } from '@/lib/import/formats/DigiBoosterProParser';
import { exportDigiBoosterPro } from '../DigiBoosterProExporter';

const path = 'public/data/songs/digibooster-pro/invisibility.dbm';
const raw = new Uint8Array(readFileSync(path));
const load = () => parseDigiBoosterProFile(raw.slice(0), 'x')!;
const exp = async (s: ReturnType<typeof load>) => new Uint8Array(await (await exportDigiBoosterPro(s)).data.arrayBuffer());

describe('DigiBooster Pro export invisibility.dbm', () => {
  it('unedited export is byte-exact', async () => {
    const out = await exp(load());
    expect(out.length).toBe(raw.length);
    let diff = 0;
    for (let i = 0; i < raw.length; i++) if (out[i] !== raw[i]) diff++;
    expect(diff).toBe(0);
  });

  it('one note edit reloads as the edit and leaves everything outside PATT alone', async () => {
    const song = load();
    const before = load();
    let p = 0, ch = 0, r = 0;
    outer: for (p = 0; p < song.patterns.length; p++) for (ch = 0; ch < song.numChannels; ch++) {
      for (r = 0; r < song.patterns[p].length; r++) if (song.patterns[p].channels[ch].rows[r].note > 20 && song.patterns[p].channels[ch].rows[r].note < 90) break outer;
    }
    if (p === song.patterns.length) throw new Error('no note cell');
    const edited = song.patterns[p].channels[ch].rows[r].note - 1;
    song.patterns[p].channels[ch].rows[r].note = edited;
    const out = await exp(song);
    const pattAt = (b: Uint8Array) => b.findIndex((_, i) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]) === 'PATT' && i > 8);
    const a = pattAt(raw);
    expect(out.subarray(0, a)).toEqual(raw.subarray(0, a));
    const smpl = (b: Uint8Array) => b.length - 20000;
    expect(out.subarray(smpl(out))).toEqual(raw.subarray(smpl(raw)));
    const re = parseDigiBoosterProFile(out, 'x')!;
    before.patterns[p].channels[ch].rows[r].note = edited;
    for (let q = 0; q < re.patterns.length; q++) for (let c = 0; c < re.numChannels; c++) {
      expect(re.patterns[q].channels[c].rows.map((x) => x.note)).toEqual(before.patterns[q].channels[c].rows.map((x) => x.note));
    }
  });
});
