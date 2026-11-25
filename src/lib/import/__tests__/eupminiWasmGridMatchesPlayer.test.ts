/**
 * The Euphony grid (eup_grid.cpp walking the .eup event stream) is the music the vendored EUPPlayer plays:
 * every note the player sends to its device (recording device, eup_oracle_run) is a grid cell with the same
 * tick, track and pitch, and every grid note is played. A save with no edit is byte-exact, and an edited,
 * cleared or inserted note is what the player plays after save. Real songs from public/data/songs/euphony.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { eupGrid, eupEdited, eupPlayed, eupBarCells } from '@/engine/eupmini/eupminiEditWasm';
import { parseEupFile } from '@/lib/import/formats/EupminiParser';

const SONGS = ['Mondschein/Mondschein.eup', 'Requiem/REQUIEM.eup', 'Schumann - Traumerei/Traumerei.eup'];
const load = (name: string) => new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/euphony', name)));

/** Multiset of "tick:track:midi" for every grid note. */
function gridNotes(grid: Awaited<ReturnType<typeof eupGrid>>): string[] {
  const out: string[] = [];
  grid.bars.forEach((bar) => bar.forEach((row) => row.forEach((c, ch) => {
    if (c.offset >= 0) out.push(`${c.tick}:${grid.tracks[ch]}:${c.note + 11}`);
  })));
  return out.sort();
}
const playedNotes = (log: number[][]) => log.map(([t, tr, n]) => `${t}:${tr}:${n}`).sort();

/** The parsed song's patterns as plain rows the save takes, mutable. */
async function patternsOf(name: string, bytes: Uint8Array) {
  const song = await parseEupFile(name, bytes.slice().buffer);
  return song.patterns.map((p) => ({ channels: p.channels.map((c) => ({ rows: c.rows.map((r) => ({ note: r.note })) })) }));
}

describe('EUP wasm grid matches the vendored EUPPlayer', () => {
  for (const name of SONGS) {
    it(`${name}: every played note is a grid note at its tick and track, and back`, async () => {
      const bytes = load(name);
      const grid = await eupGrid(bytes);
      const played = await eupPlayed(bytes);
      expect(played.length).toBeGreaterThan(50);
      expect(playedNotes(played)).toEqual(gridNotes(grid));
    });

    it(`${name}: save with no edit is byte-exact`, async () => {
      const bytes = load(name);
      const { data, warnings } = await eupEdited(bytes, await patternsOf(name, bytes));
      expect(warnings).toEqual([]);
      expect(Buffer.compare(Buffer.from(data), Buffer.from(bytes))).toBe(0);
    });
  }

  it('edited, cleared and inserted notes are what the player plays after save', async () => {
    const name = 'Requiem/REQUIEM.eup';
    const bytes = load(name);
    const grid = await eupGrid(bytes);
    const pats = await patternsOf(name, bytes);
    // first two notes of the song: raise one, clear the other; add a note on an empty row of bar 1
    const filled: Array<[number, number, number]> = [];
    grid.bars.forEach((bar, b) => bar.forEach((row, r) => row.forEach((c, ch) => { if (c.offset >= 0) filled.push([b, r, ch]); })));
    const [eb, er, ec] = filled[0];
    const [cb, cr, cc] = filled[1];
    const raised = grid.bars[eb][er][ec].note + 2;
    pats[eb].channels[ec].rows[er].note = raised;
    pats[cb].channels[cc].rows[cr].note = 0;
    const ir = grid.bars[1].findIndex((row) => row[0].offset < 0);
    expect(ir).toBeGreaterThanOrEqual(0);
    pats[1].channels[0].rows[ir].note = 49;  // C-4 tracker note

    const { data, warnings } = await eupEdited(bytes, pats);
    expect(warnings).toEqual([]);
    expect(data.length).toBe(bytes.length + 12);
    const after = await eupGrid(data);
    expect(after.bars[eb][er][ec].note).toBe(raised);
    expect(after.bars[cb][cr][cc].offset).toBe(-1);
    expect(eupBarCells(after.bars[1])[ir][0].note).toBe(49);
    // the player plays the edited grid exactly
    const played = await eupPlayed(data);
    expect(playedNotes(played)).toEqual(gridNotes(after));
    expect(played.length).toBe((await eupPlayed(bytes)).length);  // one cleared, one inserted
    expect(played.some(([, tr, n]) => tr === grid.tracks[0] && n === 49 + 11)).toBe(true);
  });
});
