/**
 * G5 / SidMon 1.0: a note typed on a grid cell inside a long row is written into the module (the covering row is split and a new
 * row inserted behind it) and the ORIGINAL SidMon 1 player (UADE) plays it:
 *   - the exported module is longer by the one row (plus alignment) and every pattern start behind it moved;
 *   - voices other than the edited one play exactly the same Paula writes for the whole render;
 *   - the edited voice plays the original until the new row, then something else (the new note);
 *   - reloaded, the grid shows the note on the cell and nothing else moved.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSidMon1File } from '@/lib/import/formats/SidMon1Parser';
import { exportSidMon1 } from '@/lib/export/SidMon1Exporter';
import { paulaEventStream, eventsOfVoice } from './gridOracle';

vi.mock('@/engine/ToneEngine', () => ({ getToneEngine: () => new Proxy({}, { get: () => () => Promise.resolve() }) }));

const FILE = 'public/data/songs/sidmon-1/myfunnymazea.sid';

describe('SidMon 1.0 note on a blank row', { timeout: 120000 }, () => {
  it('splits the covering row: other voices play unchanged, the edited voice plays the note from its row on', async () => {
    const raw = readFileSync(FILE);
    const bytes = new Uint8Array(raw);
    const ab = () => bytes.slice().buffer as ArrayBuffer;
    const song = parseSidMon1File(ab(), 'myfunnymazea.sid');
    const original = song.patterns.flatMap((pat) => pat.channels.flatMap((c) => c.rows.map((cell) => ({ note: cell.note, instrument: cell.instrument }))));
    // The first cell of a voice that is blank because a long row covers it, with a note two rows above it.
    let at: { p: number; ch: number; r: number } | null = null;
    outer: for (let p = 0; p < 2; p++) for (let ch = 0; ch < 4; ch++) {
      const rows = song.patterns[p].channels[ch].rows;
      for (let r = 2; r < rows.length; r++) if (rows[r].note === 0 && rows[r - 1].note === 0 && rows[r - 2].note > 0) { at = { p, ch, r }; break outer; }
    }
    expect(at, 'a blank cell inside a long row').not.toBeNull();
    const cell = song.patterns[at!.p].channels[at!.ch].rows[at!.r];
    const above = song.patterns[at!.p].channels[at!.ch].rows[at!.r - 2];
    song.patterns[at!.p].channels[at!.ch].rows[at!.r] = { ...cell, note: above.note + 2, instrument: above.instrument };

    const out = await exportSidMon1(song);
    expect(out.warnings.join('|')).not.toMatch(/no module row|not written/);
    const grown = new Uint8Array(await out.data.arrayBuffer());
    expect(grown.length - bytes.length).toBeGreaterThanOrEqual(4);
    expect(grown.length - bytes.length).toBeLessThanOrEqual(6);

    const back = parseSidMon1File(grown.slice().buffer as ArrayBuffer, 'myfunnymazea.sid');
    expect(back.patterns.length).toBe(song.patterns.length);
    // Reloaded, the grid is the original grid plus the note: on the edited cell, and on every other cell that plays the same
    // pattern run (a pattern is shared by steps; G17), and nowhere else.
    const flat = (patterns: typeof song.patterns) => patterns.flatMap((pat, p) => pat.channels.flatMap((c, ch) => c.rows.map((cell, r) => ({ k: `${p}:${ch}:${r}`, note: cell.note, instrument: cell.instrument }))));
    const changed = flat(back.patterns).filter((c, i) => c.note !== original[i].note || c.instrument !== original[i].instrument);
    expect(changed.some((c) => c.k === `${at!.p}:${at!.ch}:${at!.r}`)).toBe(true);
    for (const c of changed) { expect(c.note).toBe(above.note + 2); expect(c.instrument).toBe(above.instrument); }

    const was = await paulaEventStream(bytes, 'myfunnymazea.sid');
    const now = await paulaEventStream(grown, 'myfunnymazea.sid');
    expect(was.length, 'the player ran (sentinel)').toBeGreaterThan(50);
    for (let v = 0; v < 4; v++) {
      // The sample pointers (registers 0 and 1) move with the module, which grew by a row; length, period and volume must not.
      const timing = (e: string) => { const r = e.split(':')[1]; return r !== '0' && r !== '1'; };
      const a = eventsOfVoice(was, v).filter(timing), b = eventsOfVoice(now, v).filter(timing);
      if (v !== at!.ch) expect(b, `voice ${v} unchanged`).toEqual(a);
      else expect(b.join() === a.join(), 'the edited voice plays the new note').toBe(false);
    }
  });
});
