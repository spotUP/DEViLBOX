/**
 * SidMon 1: every non-empty grid cell carries the stored 5 bytes in period/pan/cutoff/resonance, and the
 * layout's encodeCell returns them unconditionally (the GlueMon bug class, 8d9c49ca8). The live chip-RAM
 * write (UADEChipEditor.patchPatternCell) and the exporter (SidMon1Exporter) both go through layout.writeCell,
 * which compares the cell with what the module row shows (track transpose included). A grid edit copies the
 * cell with its carriers, so this guards that the edit survives and an unedited cell writes its original bytes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSidMon1File } from '@/lib/import/formats/SidMon1Parser';
import { exportSidMon1 } from '@/lib/export/SidMon1Exporter';
import { sm1IndexToXM } from '@/engine/uade/encoders/SidMon1Encoder';

const NAME = 'myfunnymazea.sid';
const raw = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/sidmon-1', NAME)));
// myfunnymazea has no effect rows; anarchy.sid1 has 324 bend rows (3xx), no speed rows: speed is written on a blank note row.
const NAME2 = 'anarchy.sid1';
const raw2 = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/formats', NAME2)));
const load = () => parseSidMon1File(raw.slice().buffer as ArrayBuffer, NAME);

describe('SidMon 1 cell edits reach the bytes', () => {
  it('note and instrument edits (cell copied with its carriers) are written; an unedited cell is not', async () => {
    const song = load();
    const layout = song.uadePatternLayout!;
    // A cell showing a note whose module row is the first one that cell maps to.
    let hit: { p: number; r: number; ch: number } | null = null;
    for (let p = 0; p < song.patterns.length && !hit; p++) {
      for (let ch = 0; ch < 4 && !hit; ch++) {
        const rows = song.patterns[p].channels[ch].rows;
        const r = rows.findIndex((x) => x.note > 20 && x.note < 80 && x.period !== undefined);
        if (r >= 0 && layout.getCellFileOffset!(p, r, ch) >= 0) hit = { p, r, ch };
      }
    }
    expect(hit).not.toBeNull();
    const { p, r, ch } = hit!;
    const cell = song.patterns[p].channels[ch].rows[r];
    const off = layout.getCellFileOffset!(p, r, ch);
    expect(cell.pan).toBeDefined(); // the carriers are present: the shortcut shape this guards

    // Unedited: writes the original bytes.
    const same = layout.writeCell!(p, r, ch, { ...cell });
    expect(Array.from(same[0].bytes)).toEqual(Array.from(raw.slice(off, off + 5)));

    // Note edit, instrument edit.
    const noteRun = layout.writeCell!(p, r, ch, { ...cell, note: cell.note + 2 });
    expect(noteRun[0].offset).toBe(off);
    expect(noteRun[0].bytes[0]).toBe(raw[off] + 2);
    expect(noteRun[0].bytes[1]).toBe(raw[off + 1]);
    const insRun = layout.writeCell!(p, r, ch, { ...cell, instrument: (cell.instrument % 9) + 1 });
    expect(insRun[0].bytes[1]).toBe((cell.instrument % 9) + 1);
    expect(insRun[0].bytes[0]).toBe(raw[off]);

    // Decoded back: the edited layout shows the edited note (per-position transpose included).
    const edited = new Uint8Array(raw);
    edited.set(noteRun[0].bytes, off);
    const back = parseSidMon1File(edited.buffer as ArrayBuffer, NAME);
    expect(back.patterns[p].channels[ch].rows[r].note).toBe(cell.note + 2);
    expect(sm1IndexToXM(1)).toBeGreaterThan(0);

    // Export path: the same edit through the exporter changes exactly that cell byte.
    song.patterns[p].channels[ch].rows[r] = { ...cell, note: cell.note + 2 };
    const out = new Uint8Array(await (await exportSidMon1(song)).data.arrayBuffer());
    const diff = out.reduce<number[]>((l, v, k) => (v !== raw[k] ? [...l, k] : l), []);
    expect(diff).toEqual([off]);
    expect(out[off]).toBe(raw[off] + 2);
  });

  it('effect edits (speed Fxx, bend 3xx, clear) reach the stored param/effect bytes; unwritable ones are left', async () => {
    const song = parseSidMon1File(raw2.slice().buffer as ArrayBuffer, NAME2);
    const layout = song.uadePatternLayout!;
    const find = (typ: number) => {
      for (let p = 0; p < song.patterns.length; p++) {
        for (let ch = 0; ch < 4; ch++) {
          const rows = song.patterns[p].channels[ch].rows;
          const r = rows.findIndex((x, k) => x.effTyp === typ && layout.getCellFileOffset!(p, k, ch) >= 0);
          if (r >= 0) return { p, r, ch };
        }
      }
      return null;
    };
    const blank = (() => {
      for (let p = 0; p < song.patterns.length; p++) for (let ch = 0; ch < 4; ch++) {
        const rows = song.patterns[p].channels[ch].rows;
        const r = rows.findIndex((x, k) => x.note > 0 && x.effTyp === 0 && raw2[layout.getCellFileOffset!(p, k, ch) + 2] === 0 && layout.getCellFileOffset!(p, k, ch) >= 0);
        if (r >= 0) return { p, r, ch };
      }
      return null;
    })();
    const bend = find(0x03);
    const speed = find(0x0F);
    // Every effect type the parser shows that this song uses; a song without one is a failure, not a skip.
    expect(bend ?? speed).not.toBeNull();
    expect(blank).not.toBeNull();
    const run = (h: { p: number; r: number; ch: number }, patch: Partial<typeof song.patterns[0]['channels'][0]['rows'][0]>) => {
      const cell = song.patterns[h.p].channels[h.ch].rows[h.r];
      const off = layout.getCellFileOffset!(h.p, h.r, h.ch);
      return { off, bytes: layout.writeCell!(h.p, h.r, h.ch, { ...cell, ...patch })[0].bytes };
    };
    if (bend) {
      const cell = song.patterns[bend.p].channels[bend.ch].rows[bend.r];
      const a = run(bend, { eff: (cell.eff + 1) & 0xFF });
      expect(a.bytes[3]).toBe((raw2[a.off + 3] + 1) & 0xFF);
      expect(a.bytes[2]).toBe(raw2[a.off + 2]); // the target note stays
      const c = run(bend, { effTyp: 0, eff: 0 });
      expect([c.bytes[2], c.bytes[3]]).toEqual([0, 0]);
      const toSpeed = run(bend, { effTyp: 0x0F, eff: 5 });
      expect([toSpeed.bytes[2], toSpeed.bytes[3]]).toEqual([2, 5]);
    }
    if (speed) {
      const a = run(speed, { eff: 7 });
      expect([a.bytes[2], a.bytes[3]]).toEqual([2, 7]);
      const c = run(speed, { effTyp: 0, eff: 0 });
      expect([c.bytes[2], c.bytes[3]]).toEqual([0, 0]);
      // 3xx cannot be derived (target note): the effect byte is kept.
      const nb = run(speed, { effTyp: 0x03, eff: 4 });
      expect(Array.from(nb.bytes)).toEqual(Array.from(raw.slice(nb.off, nb.off + 5)));
    }
    // A blank note row gets a speed effect; reparsed it shows F07.
    const b = run(blank!, { effTyp: 0x0F, eff: 7 });
    expect([b.bytes[2], b.bytes[3]]).toEqual([2, 7]);
    const edited = new Uint8Array(raw2);
    edited.set(b.bytes, b.off);
    const back = parseSidMon1File(edited.buffer as ArrayBuffer, NAME2);
    expect(back.patterns[blank!.p].channels[blank!.ch].rows[blank!.r]).toMatchObject({ effTyp: 0x0F, eff: 7 });
    // Export: the edit changes exactly the effect and param bytes.
    song.patterns[blank!.p].channels[blank!.ch].rows[blank!.r] = { ...song.patterns[blank!.p].channels[blank!.ch].rows[blank!.r], effTyp: 0x0F, eff: 7 };
    const out = new Uint8Array(await (await exportSidMon1(song)).data.arrayBuffer());
    const diff = out.reduce<number[]>((l, v, k) => (v !== raw2[k] ? [...l, k] : l), []);
    expect(diff.every((k) => k === b.off + 2 || k === b.off + 3)).toBe(true);
    expect(out[b.off + 2]).toBe(2);
  });
});
