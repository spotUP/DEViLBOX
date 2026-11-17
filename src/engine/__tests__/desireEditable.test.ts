import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDesireFile } from '@/lib/import/formats/DesireParser';

const path = 'public/data/songs/desire/batmanreturns.dsr';
const load = () => { const b = readFileSync(path); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };

const run = async (edit: boolean) => {
  const { exportDesire } = await import('@/lib/export/DesireExporter');
  const song = parseDesireFile(load(), 'batmanreturns.dsr');
  const g = await import('@/lib/song/gridBaseline');
  g.setGridBaseline(g.baselineOf(song.patterns), g.extraBaselineOf(song.patterns));
  let off = -1;
  let note = 0;
  if (edit) {
    outer: for (let p = 0; p < song.patterns.length; p++) for (let c = 0; c < 4; c++) {
      const r = song.patterns[p].channels[c].rows.findIndex((x) => x.note > 0);
      if (r >= 0) {
        off = song.uadePatternLayout!.getCellFileOffset!(p, r, c);
        note = song.patterns[p].channels[c].rows[r].note + 1;
        song.patterns[p].channels[c].rows[r] = { ...song.patterns[p].channels[c].rows[r], note };
        break outer;
      }
    }
  }
  return { out: (await exportDesire(song)).data, off, note };
};

describe('Desire editable grid', () => {
  it('decodes the four voices of the first audible song into notes', () => {
    const song = parseDesireFile(load(), 'batmanreturns.dsr');
    expect(song.uadePatternLayout!.getCellFileOffset).toBeDefined();
    const notes = song.patterns.flatMap((p) => p.channels.flatMap((c) => c.rows.filter((r) => r.note > 0)));
    expect(notes.length).toBeGreaterThan(20);
    expect(song.patterns[0].channels.every((c) => c.rows.some((r) => r.note > 0))).toBe(true);
  });

  it('unedited export equals the original bytes', async () => {
    const { out } = await run(false);
    expect(Buffer.from(out).equals(Buffer.from(load()))).toBe(true);
  });

  it('a note edit changes exactly that byte and re-parses to the new note', async () => {
    const { out, off, note } = await run(true);
    const orig = new Uint8Array(load());
    const diff = [...out].map((v, i) => (v !== orig[i] ? i : -1)).filter((i) => i >= 0);
    expect(diff).toEqual([off]);
    const again = parseDesireFile(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer, 'batmanreturns.dsr');
    const all = again.patterns.flatMap((p, pi) => p.channels.flatMap((c, ci) => c.rows.map((r, ri) => ({ r, o: again.uadePatternLayout!.getCellFileOffset!(pi, ri, ci) }))));
    expect(all.find((x) => x.o === off)!.r.note).toBe(note);
  });

  it('grid note is the sounding pitch: stored byte + transpose - 24, i.e. note 22 (A-1, period 512) at pitch sum 46', async () => {
    const { periodToNote } = await import('@/lib/amiga/periodNotes');
    // player (asm 0x71e-0x76c): index = byte + 0x84 + instrument transpose + 2; period = table[index % 12 * 8] >> (index / 12) >> 1 = 8192 / 2^(index / 12)
    const periodOf = (sum: number) => Math.round(8192 / 2 ** ((sum + 2) / 12));
    expect(periodToNote(periodOf(46))).toBe(22) // period 512 -> nearest 508 = A-1;
    const song = parseDesireFile(load(), 'batmanreturns.dsr');
    const layout = song.uadePatternLayout!;
    let checked = 0;
    song.patterns.forEach((p, pi) => p.channels.forEach((c, ci) => c.rows.forEach((r, ri) => {
      if (r.note === 0) return;
      const stored = layout.decodeCell!(new Uint8Array([load().byteLength ? new Uint8Array(load())[layout.getCellFileOffset!(pi, ri, ci)] : 0])).note;
      const sum = stored + layout.noteOffset!(pi, ri, ci)! + 24;
      expect(r.note).toBe(periodToNote(periodOf(sum)));
      checked++;
    })));
    expect(checked).toBeGreaterThan(20);
  });

  it('a grid note edit reaches the module UADE is loaded with (editedModuleForPlay); unedited returns null', { timeout: 180000 }, async () => {
    const song = parseDesireFile(load(), 'batmanreturns.dsr');
    const g = await import('@/lib/song/gridBaseline');
    g.setGridBaseline(g.baselineOf(song.patterns), g.extraBaselineOf(song.patterns));
    const { editedModuleForPlay } = await import('@engine/replayer/editedModuleForPlay');
    const { WASM_ENGINES } = await import('@engine/replayer/wasmEngineRegistry');
    const desc = WASM_ENGINES.find((d) => d.key === 'UADEEditable')!;
    expect(await editedModuleForPlay(song, desc)).toBeNull();
    const row = song.patterns[0].channels[0].rows.findIndex((x) => x.note > 0);
    const off = song.uadePatternLayout!.getCellFileOffset!(0, row, 0);
    song.patterns[0].channels[0].rows[row].note += 2;
    const played = new Uint8Array((await editedModuleForPlay(song, desc)) as ArrayBuffer);
    const orig = new Uint8Array(load());
    const diff = [...played].map((v, i) => (v !== orig[i] ? i : -1)).filter((i) => i >= 0);
    expect(diff).toEqual([off]);
    expect(played[off]).toBe(orig[off] + 2);
  });
});
