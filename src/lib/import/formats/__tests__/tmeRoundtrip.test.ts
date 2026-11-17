/**
 * The Musical Enlightenment (.tme): the parser builds the real grid (one pattern per position, 4 voices x 32 rows of
 * 6-byte steps), and the exporter writes edited cells back so the nuade replayer plays them.
 * Fixture: public/data/songs/the-musical-enlightenment/64 conversion.tme (22112 bytes).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseTMEFile } from '../TMEParser';
import { exportTME } from '@/lib/export/TMEExporter';
import { baselineOf, setGridBaseline } from '@/lib/song/gridBaseline';
import { getCellFileOffset } from '@/engine/uade/UADEPatternEncoder';

const FIXTURE = join(process.cwd(), 'public/data/songs/the-musical-enlightenment/64 conversion.tme');

function load(): { ab: ArrayBuffer; raw: Uint8Array } {
  const b = readFileSync(FIXTURE);
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  return { ab, raw: new Uint8Array(ab) };
}

describe('TME parser and exporter', () => {
  it('unedited export equals the input byte for byte', async () => {
    const { ab, raw } = load();
    expect(raw.length).toBe(22112);
    const song = parseTMEFile(ab, '64 conversion.tme');
    const out = await exportTME(song);
    expect(out.data.length).toBe(raw.length);
    expect(Buffer.from(out.data).equals(Buffer.from(raw))).toBe(true);
  });

  it('shows real notes (note byte 1 = grid note 13) and the names the module stores', () => {
    const { ab, raw } = load();
    const song = parseTMEFile(ab, '64 conversion.tme');
    const layout = song.uadePatternLayout!;
    expect(layout.formatId).toBe('tme');
    expect(layout.numPatterns).toBe(0x60);
    expect(song.instruments.some(i => i.name.length > 0)).toBe(true);
    let checked = 0;
    for (let p = 0; p < layout.numPatterns; p++) for (let c = 0; c < 4; c++) for (let r = 0; r < 32; r++) {
      const off = getCellFileOffset(layout, p, r, c);
      const nb = raw[off] & 0x7f;
      const cell = song.patterns[p].channels[c].rows[r];
      if (nb === 0) expect(cell.note).toBe(0);
      else if (nb < 0x7e) {
        const abs = (raw[off + 4] & 0x04) !== 0;
        const tr = abs ? 0 : (raw[0x1aaa + p * 12 + c * 3 + 2] << 24) >> 24;
        expect(cell.note).toBe(Math.min(96, Math.max(1, nb + 12 + tr)));
      }
      else expect(cell.note).toBe(97);
      checked++;
    }
    expect(checked).toBe(0x60 * 128);
  });

  it('a note edit changes only the note byte of its step (and shared copies)', async () => {
    const { ab, raw } = load();
    const song = parseTMEFile(ab, '64 conversion.tme');
    const layout = song.uadePatternLayout!;
    let p = -1, r = -1, c = -1;
    outer: for (let pp = 0; pp < layout.numPatterns; pp++) for (let cc = 0; cc < 4; cc++) for (let rr = 0; rr < 32; rr++) {
      const n = song.patterns[pp].channels[cc].rows[rr].note;
      if (n >= 13 && n < 90) { p = pp; c = cc; r = rr; break outer; }
    }
    expect(p).toBeGreaterThanOrEqual(0);
    setGridBaseline(baselineOf(song.patterns));
    const cell = song.patterns[p].channels[c].rows[r];
    const edited = cell.note + 2;
    cell.note = edited;
    const out = await exportTME(song);
    const diff: number[] = [];
    for (let i = 0; i < raw.length; i++) if (raw[i] !== out.data[i]) diff.push(i);
    expect(diff.length).toBeGreaterThan(0);
    const stepOff = getCellFileOffset(layout, p, r, c);
    expect(diff).toContain(stepOff);
    for (const d of diff) expect(((d - layout.patternDataFileOffset) % 6)).toBe(0); // only note bytes
    const again = parseTMEFile(out.data.buffer.slice(out.data.byteOffset, out.data.byteOffset + out.data.byteLength) as ArrayBuffer, 'x.tme');
    setGridBaseline(null);
    expect(again.patterns[p].channels[c].rows[r].note).toBe(edited);
  });
});
