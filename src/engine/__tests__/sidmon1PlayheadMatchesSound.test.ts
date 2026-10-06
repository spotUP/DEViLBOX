/**
 * The note sounding while the playhead is on a row is the note in that row's
 * cell (owner, 2026-10-06: "the notes I hear don't match the grid").
 *
 * SidMon1Replayer reported no position, so the pattern editor's playhead ran
 * on the TypeScript scheduler: speed 6 at 125 BPM, 120 ms a row, while the
 * replayer takes (speed + 1) ticks of 20 ms a global row (anarchy.sid1: 3, so
 * 60 ms) and changes speed and pattern length inside the song. The playhead
 * crawled at half speed: on step 0 row 16 you heard step 0 row 32's note.
 *
 * Our replayer's real worklet and WASM run tick by tick; the playhead is the
 * 'position' message the engine turns into onPositionUpdate (what
 * NativeEngineRouting hands to the editor). At every tick where a voice takes
 * a row with a note, the playhead is on that row's step and row, and the
 * period the replayer sounds there is that cell's note.
 */
import { describe, it, expect } from 'vitest';
import { loadSharedWorkletScripts, startWorklet, songBuffer, stereoOutputs } from './workletHarness';
import { parseSidMon1File } from '@/lib/import/formats/SidMon1Parser';
import { SM1_DISPLAY_SHIFT } from '@/engine/uade/encoders/SidMon1Encoder';

interface Mod {
  _player_get_voice_rows_consumed(v: number): number;
  _player_get_paula_period(ch: number): number;
}

describe('SidMon1Replayer playhead', () => {
  it('is on the row whose note is sounding', async () => {
    loadSharedWorkletScripts();
    const buf = songBuffer('public/data/songs/formats/anarchy.sid1');
    const song = parseSidMon1File(buf.slice(0), 'anarchy.sid1');
    const layout = song.uadePatternLayout!;
    const cells: { step: number; row: number; note: number; bend: boolean }[][] = [[], [], [], []];
    song.patterns.forEach((pat, step) => {
      for (let v = 0; v < 4; v++) pat.channels[v].rows.forEach((c, row) => {
        if (layout.getCellFileOffset!(step, row, v) >= 0) cells[v].push({ step, row, note: c.note, bend: c.effTyp === 0x03 });
      });
    });

    const { proc, send, posted } = await startWorklet('sidmon1', 'SidMon1Replayer');
    await send({ type: 'loadModule', moduleData: buf.slice(0) });
    await send({ type: 'resume' });
    const m = proc.module as unknown as Mod;
    const outs = stereoOutputs(1, 64); // 15 blocks of 64 frames are exactly one 50 Hz tick

    // The playhead as the editor gets it: the last 'position' message.
    let playhead = { songPos: -1, row: -1 };
    let read = 0;
    const count = [0, 0, 0, 0];
    const semitone = (p: number): number => Math.round(12 * Math.log2(856 / p)) + 13 + SM1_DISPLAY_SHIFT;
    const wrong: string[] = [];
    let compared = 0;
    // The note of a row sounds from the tick the voice takes it to the tick it
    // takes the next one; arpeggio moves the period inside that span.
    const pending: ({ e: (typeof cells)[0][0]; at: number; sounded: Set<number> } | null)[] = [null, null, null, null];
    const judge = (v: number): void => {
      const p = pending[v];
      if (!p || p.e.bend) return;
      compared++;
      if (!p.sounded.has(p.e.note)) wrong.push(`t=${(p.at * 0.02).toFixed(2)}s voice ${v} step ${p.e.step} row ${p.e.row}: cell ${p.e.note}, sounding ${[...p.sounded].join('/')}`);
    };
    for (let tick = 0; tick < 1500; tick++) {
      for (let b = 0; b < 15; b++) proc.process([], outs);
      for (; read < posted.length; read++) {
        const p = posted[read] as { type?: string; position?: number; row?: number };
        if (p.type === 'position') playhead = { songPos: p.position!, row: p.row! };
      }
      for (let v = 0; v < 4; v++) {
        const n = m._player_get_voice_rows_consumed(v);
        if (n !== count[v]) {
          judge(v);
          count[v] = n;
          const e = cells[v][n - 1];
          pending[v] = e && e.note > 0 ? { e, at: tick, sounded: new Set() } : null;
          if (e && e.note > 0 && (playhead.songPos !== e.step || playhead.row !== e.row)) {
            wrong.push(`t=${(tick * 0.02).toFixed(2)}s voice ${v}: playhead on step ${playhead.songPos} row ${playhead.row}, the sounding note is step ${e.step} row ${e.row}'s`);
          }
        }
        pending[v]?.sounded.add(semitone(m._player_get_paula_period(v)));
      }
    }
    expect(compared, 'note rows compared').toBeGreaterThan(200);
    expect(wrong.slice(0, 10)).toEqual([]);

    // The editor's own timing for the song matches the replayer's: ticks per row.
    expect(song.initialSpeed).toBe(3);
  });
});
