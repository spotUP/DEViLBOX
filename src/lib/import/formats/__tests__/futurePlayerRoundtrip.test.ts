/**
 * Regression: Future Player (.fp) voice data is a call-GRAPH over shared
 * command BLOCKS (subroutine bodies + top-level voice sequences), each a REAL
 * contiguous byte range ending at cmd 0 (end/return) or cmd 7 (jump). The
 * parser previously fabricated per-voice sizes (Math.max(nonEmpty*4, 64)) and
 * the encoderRoundtrip harness measured 0.0000.
 *
 * Fixed with the structural raw-block carrier: BFS-enumerate every reachable
 * block (deduped by code offset, sized by scanning to its terminator), carry
 * each block's original bytes + decoded baseline rows, re-emit verbatim when
 * unedited (byte-exact) and re-pack on edit. See variableBlockCarrier.testkit.ts
 * for the invariants; on revert of the carrier assertion 1 fails.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { parseFuturePlayerFile } from '../FuturePlayerParser';
import { FP_FX } from '../fpEffectGlyphs';
import { exportAsFuturePlayer } from '@/lib/export/FuturePlayerExporter';
import { describeVariableBlockCarrier } from './variableBlockCarrier.testkit';
import { walkFuturePlayer } from '../fpWalk';
import { FpHunkModule } from '../fpModuleGrow';

function parse(buffer: ArrayBuffer, filename: string): TrackerSong {
  return parseFuturePlayerFile(buffer, filename);
}

describeVariableBlockCarrier('futurePlayer', parse);

/**
 * Regression: the carrier addressed its blocks at (file length - code length) + pointer. A hunk file has
 * relocations after the code, so every address was too high by their size (hybris.fp: 2980 instead of 32)
 * and each "block" was other bytes of the file; a write back would have patched the wrong place.
 */
describe('futurePlayer carrier addresses', () => {
  for (const f of ['public/data/songs/formats/hybris.fp', 'public/data/songs/formats/imploder_drums.fp']) {
    it(`${f.split('/').pop()}: every carried block is the file's own bytes at its address, and starts at a stream the player runs`, () => {
      const bytes = readFileSync(join(process.cwd(), f));
      const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const song = parse(buf, f);
      const layout = song.uadeVariableLayout!;
      const file = new Uint8Array(buf);
      expect(layout.numFilePatterns).toBeGreaterThan(0);
      for (let i = 0; i < layout.numFilePatterns; i++) {
        const at = layout.filePatternAddrs[i], size = layout.filePatternSizes[i];
        expect(at + size, `block ${i} lies in the file`).toBeLessThanOrEqual(file.length);
        expect([...file.subarray(at, at + size)], `block ${i} at ${at}`).toEqual([...layout.blockRawBytes![i]]);
      }
      // voice 0's stream of subsong 0, found from the module's own tables: its file address is the code's start plus its pointer
      const view = new DataView(buf);
      const hunkCode = 20 + view.getUint32(8) * 4 + 8;
      const u32 = (o: number): number => view.getUint32(hunkCode + o);
      const seqData = u32(u32(u32(32) + 8) + 8);
      const idx = layout.filePatternAddrs.indexOf(hunkCode + seqData);
      expect(idx, 'the voice stream is a carried block at the file address its pointer names').toBeGreaterThanOrEqual(0);
      expect(layout.blockRawBytes![idx][0]).toBe(file[hunkCode + seqData]);
    });
  }
});

describe('Future Player removed notes (rest rewrite)', () => {
  it('removing notes exports them as rests: the notes are gone, the module keeps its length and every other note', async () => {
    const file = 'public/data/songs/formats/hybris.fp';
    const bytes = readFileSync(join(process.cwd(), file));
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const song = parse(buf, file);
    const isNote = (n: number | undefined): boolean => (n ?? 0) >= 1 && (n ?? 0) <= 96;
    const removed: Array<[number, number, number]> = [];
    let k = 0;
    song.patterns.slice(0, 3).forEach((p, pi) => p.channels.forEach((c, ci) => c.rows.forEach((r, ri) => { if (isNote(r.note) && k++ % 3 === 0) removed.push([pi, ci, ri]); })));
    expect(removed.length).toBeGreaterThan(2);
    const edited: TrackerSong = { ...song, patterns: structuredClone(song.patterns) };
    for (const [p, c, r] of removed) edited.patterns[p].channels[c].rows[r] = { ...edited.patterns[p].channels[c].rows[r], note: 0 };
    const res = await exportAsFuturePlayer(edited);
    const out = new Uint8Array(await res.data.arrayBuffer());
    expect(out.length).toBe(bytes.length);
    const back = parse(out.buffer.slice(0) as ArrayBuffer, file);
    for (const [p, c, r] of removed) expect(isNote(back.patterns[p].channels[c].rows[r].note), `pattern ${p} voice ${c} row ${r}`).toBe(false);
    const total = (s: TrackerSong): number => s.patterns.reduce((n, p) => n + p.channels.reduce((m, c) => m + c.rows.filter((r) => isNote(r.note)).length, 0), 0);
    expect(total(back)).toBeLessThan(total(song));
    expect(back.patterns.map((p) => p.length)).toEqual(song.patterns.map((p) => p.length));
  });
});

describe('Future Player removed commands (no-op overwrite)', () => {
  it('clearing the transpose, portamento and arpeggio commands exports them as no-ops: none is shown, timing and length unchanged', async () => {
    const file = 'public/data/songs/formats/hybris.fp';
    const bytes = readFileSync(join(process.cwd(), file));
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const song = parse(buf, file);
    const removable = new Set<number>([FP_FX.portamento, FP_FX.arpTable, FP_FX.arpReset, FP_FX.transpose1, FP_FX.transpose2]);
    const slots = [['effTyp', 'eff'], ['effTyp2', 'eff2'], ['effTyp3', 'eff3'], ['effTyp4', 'eff4'], ['effTyp5', 'eff5']] as const;
    const shown = (s: TrackerSong): number => s.patterns.reduce((n, p) => n + p.channels.reduce((m, c) => m + c.rows.reduce((q, r) => q + slots.filter(([t]) => removable.has((r as unknown as Record<string, number>)[t] ?? 0)).length, 0), 0), 0);
    expect(shown(song), 'fixture shows removable commands').toBeGreaterThan(0);
    const edited: TrackerSong = { ...song, patterns: structuredClone(song.patterns) };
    for (const p of edited.patterns) for (const c of p.channels) c.rows.forEach((r, i) => {
      const row = { ...r } as unknown as Record<string, number>;
      for (const [t, v] of slots) if (removable.has(row[t] ?? 0)) { row[t] = 0; row[v] = 0; }
      c.rows[i] = row as unknown as typeof r;
    });
    const res = await exportAsFuturePlayer(edited);
    expect(res.warnings.filter((w) => /conflicts|not written/.test(w))).toEqual([]);
    const out = new Uint8Array(await res.data.arrayBuffer());
    expect(out.length).toBe(bytes.length);
    const back = parse(out.buffer.slice(0) as ArrayBuffer, file);
    expect(shown(back), 'no removable command is shown any more').toBe(0);
    expect(back.patterns.map((p) => p.length), 'timing unchanged').toEqual(song.patterns.map((p) => p.length));
  });
});

describe('Future Player: a note typed into the New Song template', { timeout: 60000 }, () => {
  const file = 'public/templates/futurePlayer.fp';
  const bytes = readFileSync(join(process.cwd(), file));
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const song = parse(buf, file);

  // Like a real song the template starts over at the end: the walker must take that restart as the loop point, so one
  // pass is every row once, from row 0, and the grid is not a row longer with the first row played again at its end.
  it('loops back to row 0, and one pass is each row once', () => {
    const walk = walkFuturePlayer(FpHunkModule.parse(new Uint8Array(buf)).code, 0)!;
    expect(walk.stop).toBe('loop');
    expect(walk.loopRow).toBe(0);
    expect(walk.rows).toBe(1024);
    expect(song.patterns.reduce((n, p) => n + p.length, 0)).toBe(1024);
  });

  // The template keeps the source song's rests: voices 0 and 1 rest one row at a time, voice 2 rests 32 rows at a time,
  // voice 3 has no command stream at all (its start pointer is 0). A note replaces the rest that starts on its row.
  it.each([
    [0, [0, 1, 2]],
    [4, [0, 1]],
  ])('is written on row %i of voices %j and the reloaded grid shows it there', async (row, voices) => {
    const edited: TrackerSong = { ...song, patterns: structuredClone(song.patterns) };
    for (const ch of edited.patterns[0].channels) expect(ch.rows.every((c) => !c.note), 'template has no notes').toBe(true);
    const note = 37;
    for (const v of voices) edited.patterns[0].channels[v].rows[row] = { ...edited.patterns[0].channels[v].rows[row], note, instrument: 1 };
    const res = await exportAsFuturePlayer(edited);
    expect(res.warnings, res.warnings.join(' ; ')).toEqual([]);
    const out = new Uint8Array(await res.data.arrayBuffer());
    const back = parse(out.buffer.slice(0) as ArrayBuffer, file);
    for (const v of voices) expect(back.patterns[0].channels[v].rows[row].note, `voice ${v}`).toBe(note);
  });

  // The rest of voice 2 lasts 32 rows (a split: rest up to the note, the note over the remaining rows); voice 3 has no
  // command stream (a new one is allocated and entered in the song data). Both grow the module.
  const typed = async (voice: number, rows: number[]) => {
    const edited: TrackerSong = { ...song, patterns: structuredClone(song.patterns) };
    for (const r of rows) edited.patterns[0].channels[voice].rows[r] = { ...edited.patterns[0].channels[voice].rows[r], note: 37, instrument: 1 };
    const res = await exportAsFuturePlayer(edited);
    const out = new Uint8Array(await res.data.arrayBuffer());
    return { res, out, back: parse(out.buffer.slice(0) as ArrayBuffer, file) };
  };
  /**
   * Every cell of every position but the typed ones equals the template's; on the typed voice in pattern 0 a release
   * (note-off) may appear where a typed note ends. A typed note changes only the row it was typed on.
   */
  const othersUnchanged = (back: TrackerSong, rows: number[], voice: number) => {
    expect(back.patterns.length, 'pattern layout unchanged').toBe(song.patterns.length);
    const typedRows = new Set(rows);
    const keys = ['note', 'instrument', 'volume', 'effTyp', 'eff', 'effTyp2', 'eff2', 'effTyp3', 'eff3', 'effTyp4', 'eff4', 'effTyp5', 'eff5'] as const;
    back.patterns.forEach((bp, p) => {
      expect(bp.length, `pattern ${p} length`).toBe(song.patterns[p].length);
      bp.channels.forEach((ch, v) => ch.rows.forEach((c, r) => {
        if (p === 0 && v === voice && typedRows.has(r)) return;
        const was = song.patterns[p].channels[v].rows[r] as unknown as Record<string, number | undefined>;
        const now = c as unknown as Record<string, number | undefined>;
        const release = p === 0 && v === voice && (now.note ?? 0) === 97 && (was.note ?? 0) === 0 && r > Math.min(...rows);
        const pick = (cell: Record<string, number | undefined>) => keys.map((k) => (k === 'note' && release ? 0 : cell[k] ?? 0));
        expect([p, v, r, ...pick(now)]).toEqual([p, v, r, ...pick(was)]);
      }));
    });
  };

  it.each([[4], [0, 4], [4, 9]])('a note inside the 32-row rest of voice 2 (rows %j) splits the rest', async (...rows) => {
    const { res, out, back } = await typed(2, rows);
    expect(res.warnings, res.warnings.join(' ; ')).toEqual([]);
    expect(out.length, 'the stream grew').toBeGreaterThan(bytes.length);
    for (const r of rows) expect(back.patterns[0].channels[2].rows[r].note, `row ${r}`).toBe(37);
    expect(back.patterns[0].channels[2].rows[rows[0] + 2]?.note ?? 0, 'the rows after it stay blank or release').toSatisfy((n: number) => n === 0 || n === 97);
    othersUnchanged(back, rows, 2);
  });

  it.each([[0], [4], [0, 4]])('a note on voice 3, which has no command stream (rows %j), gets a new one', async (...rows) => {
    const { res, out, back } = await typed(3, rows);
    expect(res.warnings, res.warnings.join(' ; ')).toEqual([]);
    expect(out.length).toBeGreaterThan(bytes.length);
    for (const r of rows) expect(back.patterns[0].channels[3].rows[r].note, `row ${r}`).toBe(37);
    othersUnchanged(back, rows, 3);
    expect(back.patterns.length, 'pattern layout unchanged').toBe(song.patterns.length);
  });

  it('refuses with a warning, not a broken file, when the module cannot grow', async () => {
    const odd: TrackerSong = { ...song, futurePlayerFileData: new Uint8Array(bytes.slice(0, 40)).buffer };
    const edited: TrackerSong = { ...odd, patterns: structuredClone(song.patterns) };
    edited.patterns[0].channels[2].rows[4] = { ...edited.patterns[0].channels[2].rows[4], note: 37, instrument: 1 };
    const res = await exportAsFuturePlayer(edited).catch((e: unknown) => e);
    const msg = res instanceof Error ? res.message : (res as { warnings: string[] }).warnings.join(' ');
    expect(msg.length).toBeGreaterThan(0);
  });
});
