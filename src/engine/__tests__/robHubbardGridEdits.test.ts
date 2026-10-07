/**
 * Rob Hubbard: an edit on the tick grid is written back into the module's command blocks (P11,
 * fix-all-open; same gap David Whittaker had). A note, an instrument (the sample-change command in
 * force) and a note-to-rest edit each change the bytes of the command the cell is drawn from, and
 * the export differs from the module in those bytes only. Re-importing shows the edits.
 * A note is named by the period it plays (the table entry scaled by its sample), so the edited
 * note's byte is the table index that period names, not the tracker note minus 25.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseRobHubbardFile, buildRobHubbardGrid } from '@/lib/import/formats/RobHubbardParser';
import { exportRobHubbard } from '@/lib/export/RobHubbardExporter';
import { rhNotePeriod, rhPeriodToNote } from '@/lib/import/formats/robHubbardGrid';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const SONGS = ['rob-hubbard/skateordie.rh', 'formats/centurion_battle.rh'];
type Rec = Record<string, number | undefined>;
const load = (n: string): Uint8Array => new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs', n)));
const ab = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

describe.each(SONGS)('Rob Hubbard grid edits reach the module: %s', (name) => {
  it('a note, an instrument and a note-to-rest edit change exactly their command bytes; re-import shows them', async () => {
    const orig = load(name);
    const song = await parseRobHubbardFile(ab(orig), name.split('/').pop()!) as TrackerSong;
    const grid = buildRobHubbardGrid(orig)!;
    expect(grid, 'the module has a grid').toBeTruthy();
    const cmdOff = (fp: number, cmd: number): number =>
      grid.filePatternAddrs[fp] + grid.blockRows[fp].slice(0, cmd).reduce((a, c) => a + (c.cutoff ?? 0), 0);

    // unedited: the module, byte for byte, no warnings
    const same = await exportRobHubbard(song);
    expect(new Uint8Array(await same.data.arrayBuffer())).toEqual(orig);
    expect(same.warnings).toEqual([]);

    // pick three note cells (distinct commands) on one voice with a sample change before them in the block
    type Pick = { p: number; row: number; fp: number; cmd: number; sc: number };
    const picks: Pick[] = [];
    const used = new Set<string>();
    outer: for (let ch = 0; ch < 4; ch++) for (let p = 0; p < grid.patterns.length; p++) for (let row = 0; row < 64; row++) {
      const s = grid.cellSources[p][ch][row];
      if (!s || grid.blockRows[s.fp][s.cmd].period! >= 0x80) continue;
      let sc = -1;
      for (let k = s.cmd - 1; k >= 0; k--) if (grid.blockRows[s.fp][k].period === 0x80) { sc = k; break; }
      const key = `${s.fp}:${s.cmd}`;
      if (sc < 0 || used.has(key) || picks.some((q) => q.fp === s.fp)) continue;
      used.add(key);
      picks.push({ p, row, fp: s.fp, cmd: s.cmd, sc });
      if (picks.length === 3) break outer;
    }
    expect(picks.length, 'the song has three independent note commands').toBe(3);
    const [pn, pi, pr] = picks;
    const ch = (pk: Pick): number => grid.cellSources[pk.p].findIndex((rows) => rows[pk.row]?.fp === pk.fp && rows[pk.row]?.cmd === pk.cmd);

    const edited = structuredClone(song.patterns);
    const cell = (pk: Pick): Rec => edited[pk.p].channels[ch(pk)].rows[pk.row] as unknown as Rec;
    // three table steps up the player's period table, on the sample the voice plays the note with
    const { periods, samples } = grid.walk.module;
    const pnSource = grid.cellSources[pn.p][ch(pn)][pn.row]!;
    const oldByte = orig[cmdOff(pn.fp, pn.cmd) + 1];
    const newByte = oldByte + 3;
    const rel = samples[pnSource.sample].relative;
    cell(pn).note = rhPeriodToNote(rhNotePeriod(orig, periods, newByte, rel));
    expect(cell(pn).note, 'the edited note is a different note').not.toBe(grid.patterns[pn.p].channels[ch(pn)].rows[pn.row].note);
    const oldIns = cell(pi).instrument!;
    cell(pi).instrument = oldIns === 1 ? 2 : 1; // samples the module has: index 0 and 1 are PCM in both songs
    cell(pr).note = 97;

    const r = await exportRobHubbard({ ...song, patterns: edited } as TrackerSong);
    expect(r.warnings, 'every edit is writable in place').toEqual([]);
    const bytes = new Uint8Array(await r.data.arrayBuffer());
    expect(bytes.length).toBe(orig.length);
    const diff: number[] = [];
    for (let i = 0; i < orig.length; i++) if (orig[i] !== bytes[i]) diff.push(i);
    const expected = [cmdOff(pn.fp, pn.cmd) + 1, cmdOff(pi.fp, pi.sc) + 1, cmdOff(pr.fp, pr.cmd), cmdOff(pr.fp, pr.cmd) + 1];
    // a rest keeps its duration: [dur, note] -> [-126, dur]; both bytes change unless equal
    for (const d of diff) expect(expected, `byte ${d} is one of the edited command bytes`).toContain(d);
    expect(bytes[cmdOff(pn.fp, pn.cmd) + 1]).toBe(newByte);
    expect(bytes[cmdOff(pi.fp, pi.sc) + 1]).toBe(cell(pi).instrument! - 1);
    expect(bytes[cmdOff(pr.fp, pr.cmd)]).toBe(0x82);
    expect(bytes[cmdOff(pr.fp, pr.cmd) + 1]).toBe(orig[cmdOff(pr.fp, pr.cmd)]);

    // re-import
    const again = await parseRobHubbardFile(ab(bytes), name.split('/').pop()!) as TrackerSong;
    const g2 = buildRobHubbardGrid(bytes)!;
    const at = (pk: Pick): Rec => again.patterns[pk.p].channels[ch(pk)].rows[pk.row] as unknown as Rec;
    expect(at(pn).note).toBe(cell(pn).note);
    expect(at(pi).instrument).toBe(cell(pi).instrument);
    // a rest is a note-off only where it stops a sounding voice (an earlier rest leaves the cell blank)
    expect([0, 97]).toContain(at(pr).note);
    expect(at(pr).note).not.toBe(grid.patterns[pr.p].channels[ch(pr)].rows[pr.row].note);
    expect(g2.blockRows.length).toBe(grid.blockRows.length);
  });

  it('a note on a blank row a note covers splits that command: the module grows, no warning, re-import shows the note', async () => {
    const orig = load(name);
    const song = await parseRobHubbardFile(ab(orig), name.split('/').pop()!) as TrackerSong;
    const grid = buildRobHubbardGrid(orig)!;
    // a blank continuation row straight after a note, so the note's duration covers it
    let at: { p: number; ch: number; row: number } | null = null;
    for (let p = 0; p < grid.patterns.length && !at; p++) for (let ch = 0; ch < 4 && !at; ch++) for (let row = 1; row < 64 && !at; row++) {
      const prev = grid.patterns[p].channels[ch].rows[row - 1];
      if (grid.cellSources[p][ch][row] === null && grid.patterns[p].channels[ch].rows[row].note === 0 && prev.note > 0 && prev.note < 97) at = { p, ch, row };
    }
    expect(at, 'the song has such a row').toBeTruthy();
    const edited = structuredClone(song.patterns);
    const target = edited[at!.p].channels[at!.ch].rows[at!.row] as unknown as Rec;
    target.note = grid.patterns[at!.p].channels[at!.ch].rows[at!.row - 1].note;
    target.instrument = grid.patterns[at!.p].channels[at!.ch].rows[at!.row - 1].instrument;
    const r = await exportRobHubbard({ ...song, patterns: edited } as TrackerSong);
    expect(r.warnings).toEqual([]);
    const bytes = new Uint8Array(await r.data.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(orig.length);
    const again = await parseRobHubbardFile(ab(bytes), name.split('/').pop()!) as TrackerSong;
    expect((again.patterns[at!.p].channels[at!.ch].rows[at!.row] as unknown as Rec).note).toBe(target.note);
  });
});
