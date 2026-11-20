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

/** Walk PATT: every packed cell with its row and the absolute offsets of its note and effect-1 command bytes. */
function walkCells(b: Uint8Array) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const cells: { pat: number; row: number; ch: number; mask: number; note?: number; c1?: number; c2?: number }[] = [];
  let pos = 8, pattStart = 0, pattEnd = 0;
  while (pos + 8 <= b.length) {
    const id = String.fromCharCode(b[pos], b[pos + 1], b[pos + 2], b[pos + 3]);
    const len = dv.getUint32(pos + 4, false);
    if (id === 'PATT') {
      pattStart = pos; pattEnd = pos + 8 + len;
      let q = pos + 8;
      for (let p = 0; q + 6 <= pattEnd; p++) {
        const size = dv.getUint32(q + 2, false);
        let i = q + 6, row = 0;
        while (i < q + 6 + size) {
          const ch = b[i++];
          if (ch === 0) { row++; continue; }
          const mask = b[i++];
          const c: (typeof cells)[number] = { pat: p, row, ch: ch - 1, mask };
          if (mask & 1) c.note = i++;
          if (mask & 2) i++;
          if (mask & 4) c.c2 = i++;
          if (mask & 8) i++;
          if (mask & 0x10) c.c1 = i++;
          if (mask & 0x20) i++;
          cells.push(c);
        }
        q += 6 + size;
      }
    }
    pos += 8 + len;
  }
  return { cells, pattStart, pattEnd };
}

describe('DigiBooster Pro export keeps every effect in an edited pattern', () => {
  it('echo (31-35) and unmapped effects survive a one-cell edit; PATT differs only at the edited note', async () => {
    // No echo-effect .dbm is shipped: turn plain Set Volume (12) cells of the real song into 31..35, 18 and 30 (same byte length).
    const src = raw.slice();
    const { cells, pattStart, pattEnd } = walkCells(src);
    const fx = cells.flatMap((c) => (c.c1 !== undefined && (c.mask & 0x30) === 0x30 && src[c.c1] === 12 ? [{ pat: c.pat, at: c.c1 }] : c.c2 !== undefined && (c.mask & 0x0C) === 0x0C && src[c.c2] === 12 ? [{ pat: c.pat, at: c.c2 }] : []));
    const pat = fx[0].pat;
    const inPat = fx.filter((c) => c.pat === pat);
    const cmds = [31, 32, 33, 34, 35, 18, 30];
    expect(inPat.length).toBeGreaterThanOrEqual(cmds.length);
    cmds.forEach((cmd, k) => { src[inPat[k].at] = cmd; src[inPat[k].at + 1] = 0x21 + k; });

    const target = walkCells(src).cells.find((c) => c.pat === pat && c.note !== undefined && (src[c.note] & 0x0F) > 0 && src[c.note] < 0x7F)!;
    const song = parseDigiBoosterProFile(src.slice(0), 'x')!;
    const row = song.patterns[pat].channels[target.ch].rows[target.row];
    row.note -= 1;
    const out = await exp(song);

    const want = src.slice();
    want[target.note!] -= 1;
    expect(out.length).toBe(want.length);
    const diffs: number[] = [];
    for (let i = 0; i < want.length; i++) if (out[i] !== want[i]) diffs.push(i);
    expect(diffs.filter((i) => i >= pattStart && i < pattEnd).length).toBe(0);
    expect(diffs).toEqual([]);
  });
});

describe('DigiBooster Pro export keeps lossy-mapped effect values in an edited pattern', () => {
  // Same-length rewrite of Set Volume cells to (cmd, param), one note edit, whole export must equal the source but that byte.
  const cases: [string, [number, number][]][] = [
    ['volume slide with both nibbles (cmds 10, 5, 6)', [[10, 0x35], [5, 0x24], [6, 0x13]]],
    ['global volume above 64 (cmd 16)', [[16, 65], [16, 100], [16, 255]]],
    ['explicit cmd 0 / param 0', [[0, 0]]],
  ];
  for (const [name, rewrites] of cases) {
    it(name, async () => {
      const src = raw.slice();
      const { cells } = walkCells(src);
      const fx = cells.flatMap((c) => (c.c1 !== undefined && (c.mask & 0x30) === 0x30 && src[c.c1] === 12 ? [{ pat: c.pat, at: c.c1 }] : c.c2 !== undefined && (c.mask & 0x0C) === 0x0C && src[c.c2] === 12 ? [{ pat: c.pat, at: c.c2 }] : []));
      const pat = fx[0].pat;
      const inPat = fx.filter((c) => c.pat === pat);
      expect(inPat.length).toBeGreaterThanOrEqual(rewrites.length);
      rewrites.forEach(([cmd, param], k) => { src[inPat[k].at] = cmd; src[inPat[k].at + 1] = param; });
      const target = walkCells(src).cells.find((c) => c.pat === pat && c.note !== undefined && (src[c.note] & 0x0F) > 0 && src[c.note] < 0x7F)!;
      const song = parseDigiBoosterProFile(src.slice(0), 'x')!;
      song.patterns[pat].channels[target.ch].rows[target.row].note -= 1;
      const out = await exp(song);
      const want = src.slice();
      want[target.note!] -= 1;
      expect(out.length).toBe(want.length);
      expect(Array.from(out.keys()).filter((i) => out[i] !== want[i])).toEqual([]);
    });
  }
});
