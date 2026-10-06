/**
 * The SidMon 1 grid is what the replayer plays (owner, 2026-10-06).
 *
 * The parser read the song as `tracks[step * 4 + channel]` with a fixed 16
 * rows per pattern, and its pattern pointers were one entry off. The replayer
 * walks per-voice track lists (`tracksPtr[v] + step`) and lets a row last
 * `speed + 1` global rows, so the grid showed other notes than the ones that
 * sounded, on other rows.
 *
 * The real WASM replayer is stepped one tick at a time. Every pattern row a
 * voice consumes is compared, in order, with the grid cell the parser put at
 * that step / row / voice: same module row, and the note the voice sounded
 * (note + track transpose) is the note the cell shows. A row the player
 * consumes that has no cell, or a cell for a row it never plays, fails.
 */
import { describe, it, expect } from 'vitest';
import { loadSharedWorkletScripts, startWorklet, songBuffer } from '@/engine/__tests__/workletHarness';
import { parseSidMon1File } from '../SidMon1Parser';
import { sm1IndexToXM } from '@/engine/uade/encoders/SidMon1Encoder';

const SONG = 'public/data/songs/formats/anarchy.sid1';
interface Mod {
  _malloc(n: number): number;
  _player_render(ptr: number, frames: number): number;
  _player_get_voice_consumed(v: number): number;
  _player_get_voice_rows_consumed(v: number): number;
  _player_get_voice_note(v: number): number;
  _player_is_finished(): number;
}

describe('SidMon 1 grid against the replayer', () => {
  it('every row the replayer consumes is the cell the grid shows, with the note it plays', async () => {
    loadSharedWorkletScripts();
    const buf = songBuffer(SONG);
    const song = parseSidMon1File(buf.slice(0), 'anarchy.sid1');
    const layout = song.uadePatternLayout!;

    // What the grid says each voice consumes, in order.
    const expected: { row: number; note: number; step: number; g: number }[][] = [[], [], [], []];
    song.patterns.forEach((pat, step) => {
      for (let v = 0; v < 4; v++) {
        pat.channels[v].rows.forEach((cell, g) => {
          const off = layout.getCellFileOffset!(step, g, v);
          if (off < 0) return;
          expected[v].push({ row: (off - layout.patternDataFileOffset) / 5, note: cell.note, step, g });
        });
      }
    });
    expect(expected.every((e) => e.length > 0)).toBe(true);

    const { proc, send } = await startWorklet('sidmon1', 'SidMon1Replayer');
    await send({ type: 'loadModule', moduleData: buf.slice(0) });
    await send({ type: 'resume' });
    const m = proc.module as unknown as Mod;
    const out = m._malloc(960 * 2 * 4);

    const seen: { row: number; note: number }[][] = [[], [], [], []];
    const count = [0, 0, 0, 0];
    let lastNote = [0, 0, 0, 0];
    for (let tick = 0; tick < 40000 && !m._player_is_finished(); tick++) {
      m._player_render(out, 960); // exactly one 50 Hz tick
      for (let v = 0; v < 4; v++) {
        const n = m._player_get_voice_rows_consumed(v);
        if (n === count[v]) continue;
        count[v] = n;
        const row = m._player_get_voice_consumed(v);
        const note = m._player_get_voice_note(v);
        // a note-on moved lastNote; the displayed pitch must equal it
        seen[v].push({ row, note: note !== lastNote[v] ? sm1IndexToXM(note) : -1 });
        lastNote[v] = note;
      }
    }

    let compared = 0;
    for (let v = 0; v < 4; v++) {
      const n = Math.min(seen[v].length, expected[v].length);
      expect(n, `voice ${v} consumed rows`).toBeGreaterThan(10);
      // the replayer's rows, in order, are the grid's rows, in order
      expect(seen[v].slice(0, n).map((s) => s.row), `voice ${v} rows`).toEqual(expected[v].slice(0, n).map((e) => e.row));
      // and where a note-on sounded, the grid shows that note
      seen[v].slice(0, n).forEach((s, i) => {
        if (s.note > 0) compared++;
        if (s.note > 0) expect(s.note, `voice ${v} step ${expected[v][i].step} row ${expected[v][i].g}`).toBe(expected[v][i].note);
      });
      // every row of the song was consumed (the walk covers the whole song)
      expect(seen[v].length).toBe(expected[v].length);
    }
    expect(compared, 'note-ons compared with their cells').toBeGreaterThan(50);
  }, 120000);
});
