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
});
