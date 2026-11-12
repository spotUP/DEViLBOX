/**
 * MCMD info bits 6 (portamento) and 7 (alternative frequency sequence) shown as effects (HC_FX ids), real song
 * ep-trmonsterbusiness.mcmd. The parameter is the info byte of the row before (mcmd.c step_voice).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMcmdFile, encodeMcmdCell } from '../formats/MCMDParser';
import { HC_FX, commandStreamEffectToString } from '../formats/commandStreamEffectGlyphs';
import { patchModuleByLayout } from '@lib/export/layoutPatch';
import { setGridBaseline, baselineOf } from '@/lib/song/gridBaseline';

const file = readFileSync(join(__dirname, '../../../../public/data/songs/formats/ep-trmonsterbusiness.mcmd'));
const orig = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
const rowsOf = (song: ReturnType<typeof parseMcmdFile>) =>
  song.patterns.flatMap((p, pi) => p.channels.flatMap((c, ch) => c.rows.map((cell, row) => ({ cell, pi, ch, row }))));

describe('MCMD effects shown (ep-trmonsterbusiness.mcmd)', () => {
  const song = parseMcmdFile(orig, 'x.mcmd');
  const layout = song.uadePatternLayout!;
  const cells = rowsOf(song);
  const bytes = new Uint8Array(orig);
  const offOf = (c: { pi: number; ch: number; row: number }) => layout.getCellFileOffset!(c.pi, c.row, c.ch);

  it('the song has 172 note rows and none sets info bit 6 or 7, so the unedited grid shows no effect', () => {
    const noteRows = cells.filter((c) => offOf(c) >= 0 && (bytes[offOf(c)] & 0x7f) > 1);
    expect(noteRows.length).toBe(172);
    expect(noteRows.filter((c) => bytes[offOf(c) + 1] & 0xC0).length).toBe(0);
    expect(cells.every((c) => c.cell.effTyp === 0 && c.cell.effTyp2 === 0)).toBe(true);
  });

  it('encode over the stored bytes is the identity for every row', () => {
    let rows = 0;
    for (const c of cells) {
      const off = offOf(c);
      if (off < 0) continue;
      const stored = bytes.subarray(off, off + 2);
      expect(Array.from(encodeMcmdCell(c.cell, stored))).toEqual(Array.from(stored));
      rows++;
    }
    expect(rows).toBe(1024);
  });

  describe('with info bits set on two real note rows', () => {
    const notes = cells.filter((c) => c.row >= 1 && offOf(c) >= 0 && (bytes[offOf(c)] & 0x7f) > 1);
    const [a, b] = [notes[0], notes[notes.length - 1]];
    const patched = new Uint8Array(orig.slice(0));
    patched[offOf(a) + 1] |= 0x40; patched[offOf(a) - 1] = 0x12;
    patched[offOf(b) + 1] |= 0xC0; patched[offOf(b) - 1] = 0x34;
    const pbuf = patched.buffer as ArrayBuffer;
    const ps = parseMcmdFile(pbuf, 'x.mcmd');
    const pc = rowsOf(ps);
    const at = (c: { pi: number; ch: number; row: number }) => pc.find((x) => x.pi === c.pi && x.ch === c.ch && x.row === c.row)!.cell;

    it('shows portamento, and portamento plus frequency sequence, with the row before as the value', () => {
      const withFx = pc.filter((c) => c.cell.effTyp !== 0);
      console.log('mcmd effect cells shown', withFx.length, 'of', pc.length);
      expect(commandStreamEffectToString(at(a).effTyp, at(a).eff)).toBe('P12');
      expect(at(a).effTyp2).toBe(0);
      expect([at(b).effTyp, at(b).effTyp2]).toEqual([HC_FX.portamento, HC_FX.altSequence]);
      expect([at(b).eff, at(b).eff2]).toEqual([0x34, 0x34]);
    });

    it('encode over stored stays identical, and an edited value is written to the parameter byte only', () => {
      const pl = ps.uadePatternLayout!;
      for (const c of pc) {
        const off = pl.getCellFileOffset!(c.pi, c.row, c.ch);
        if (off < 0) continue;
        const stored = patched.subarray(off, off + 2);
        expect(Array.from(encodeMcmdCell(c.cell, stored))).toEqual(Array.from(stored));
      }
      setGridBaseline(baselineOf(ps.patterns));
      const edited = structuredClone(ps.patterns);
      edited[a.pi].channels[a.ch].rows[a.row].eff = 0x2A;
      const out = patchModuleByLayout(pbuf, pl, edited).bytes;
      expect(out[offOf(a) - 1]).toBe(0x2A);
      expect(out[offOf(a)]).toBe(patched[offOf(a)]);
      expect(out[offOf(a) + 1]).toBe(patched[offOf(a) + 1]);
      setGridBaseline(null);
    });
  });
});
