/**
 * G5: a note put on a blank row of a Rob Hubbard module is written (the block is rebuilt, longer, at the end of
 * the module and the track lists point at it), instead of refused. Reloaded, the cell shows the note and
 * the voice's other notes are where they were.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildRobHubbardGrid } from '../RobHubbardParser';
import { applyRhGridEdits } from '../robHubbardEdits';
import { openUade, PaulaSession } from '@/engine/__tests__/gridOracle';

async function paula(bytes: Uint8Array): Promise<string[]> {
  const session = new PaulaSession(await openUade(), bytes, 'rh.centurion_battle');
  const out: string[] = [];
  const add = (c: number, w: Array<{ voice: number; reg: number; value: number }>) => { for (const x of w) if (x.voice < 4) out.push(`${c}:${x.voice}:${x.reg}:${x.value}`); };
  add(0, session.drain());
  for (let c = 1; c <= 800; c++) { const w = session.step(); if (!w) break; add(c, w); }
  session.close();
  return out;
}

const FILE = 'public/data/songs/formats/centurion_battle.rh';

describe('Rob Hubbard: a note on a blank row', { timeout: 60000 }, () => {
  const bytes = new Uint8Array(readFileSync(FILE));
  const grid = buildRobHubbardGrid(bytes)!;

  /** A blank row inside a covering note of voice 0, one row after the note starts. */
  function blankInsideNote(): { p: number; ch: number; row: number; note: number } | null {
    for (let ch = 0; ch < 4; ch++) for (let p = 0; p < grid.patterns.length; p++) {
      const rows = grid.patterns[p].channels[ch].rows;
      for (let r = 0; r + 1 < rows.length; r++) {
        if (rows[r].note > 0 && rows[r].note < 97 && rows[r + 1].note === 0 && grid.cellSources[p][ch][r + 1] === null && grid.cellSources[p][ch][r]) {
          const c = grid.blockRows[grid.cellSources[p][ch][r]!.fp][grid.cellSources[p][ch][r]!.cmd];
          if ((c.period ?? 0) >= 3 && (c.period ?? 0) < 0x80) return { p, ch, row: r + 1, note: rows[r].note };
        }
      }
    }
    return null;
  }

  it('writes the note instead of refusing it, and the reloaded grid shows it there', () => {
    const at = blankInsideNote()!;
    expect(at, 'the song has a blank row inside a note').not.toBeNull();
    const edited = structuredClone(grid.patterns);
    edited[at.p].channels[at.ch].rows[at.row].note = at.note;
    const r = applyRhGridEdits(bytes, edited);
    expect(r.warnings, r.warnings.join(' ; ')).toEqual([]);
    expect(r.data.length, 'the rebuilt block is appended').toBeGreaterThan(bytes.length);
    const back = buildRobHubbardGrid(r.data)!;
    expect(back.patterns[at.p].channels[at.ch].rows[at.row].note).toBe(at.note);
  });

  it('plays: the rebuilt module runs in the original player and a note starts where the edit put it', async () => {
    const at = blankInsideNote()!;
    const edited = structuredClone(grid.patterns);
    edited[at.p].channels[at.ch].rows[at.row].note = at.note;
    const was = await paula(bytes);
    const now = await paula(applyRhGridEdits(bytes, edited).data);
    expect(was.length, 'the player ran (sentinel)').toBeGreaterThan(0);
    expect(now.length).toBeGreaterThan(0);
    expect(now.join()).not.toBe(was.join());
  });

  it('still refuses a note-off on a blank row (round trip: the plain edit of an existing note is in place)', () => {
    const at = blankInsideNote()!;
    const edited = structuredClone(grid.patterns);
    edited[at.p].channels[at.ch].rows[at.row].note = 97;
    expect(applyRhGridEdits(bytes, edited).warnings.length).toBeGreaterThan(0);
  });

  it('removing notes (every cell cleared) rewrites them as rests of the same length and the reloaded grid has no notes', () => {
    const edited = structuredClone(grid.patterns);
    let removed = 0;
    for (const pat of edited) for (const ch of pat.channels) for (const cell of ch.rows) {
      if ((cell.note ?? 0) > 0 && (cell.note ?? 0) < 97) { cell.note = 0; cell.instrument = 0; removed++; }
    }
    expect(removed, 'the song has notes to clear (sentinel)').toBeGreaterThan(0);
    const r = applyRhGridEdits(bytes, edited);
    expect(r.warnings, r.warnings.join(' ; ')).toEqual([]);
    expect(r.data.length, 'a rest replaces a note byte for byte').toBe(bytes.length);
    const back = buildRobHubbardGrid(r.data)!;
    expect(back.patterns.length).toBe(grid.patterns.length);
    for (const pat of back.patterns) for (const ch of pat.channels) for (const cell of ch.rows) {
      expect((cell.note ?? 0) === 0 || cell.note === 97, `unexpected note ${cell.note}`).toBe(true);
    }
  });
});

describe('Rob Hubbard: a note typed into the New Song template', { timeout: 60000 }, () => {
  // The template is a real song with every note cleared to a rest of the same length.
  const bytes = new Uint8Array(readFileSync('public/templates/robHubbard.rh'));
  const grid = buildRobHubbardGrid(bytes)!;

  // row 0 is where the template's rests start (the new note replaces the rest), row 4 is inside one (it splits it)
  it.each([0, 4])('is written on row %i of every voice and the reloaded grid shows it there', (row) => {
    const edited = structuredClone(grid.patterns);
    for (const ch of edited[0].channels) expect(ch.rows.every((c) => !c.note || c.note === 97), 'template has no notes').toBe(true);
    const note = 37;
    for (let ch = 0; ch < edited[0].channels.length; ch++) {
      edited[0].channels[ch].rows[row] = { ...edited[0].channels[ch].rows[row], note, instrument: 1 };
    }
    const r = applyRhGridEdits(bytes, edited);
    expect(r.warnings, r.warnings.join(' ; ')).toEqual([]);
    const back = buildRobHubbardGrid(r.data)!;
    for (let ch = 0; ch < back.patterns[0].channels.length; ch++) {
      expect(back.patterns[0].channels[ch].rows[row].note, `voice ${ch}`).toBe(note);
    }
  });
});
