/**
 * PreTracker: the pattern editor's playhead is the replayer's own order
 * position and row. The engine had the WASM getters but reported nothing, so
 * the grid followed the TypeScript scheduler while the audio free-ran; the
 * worklet now posts 'position' when either moves.
 *
 * Oracle: the replayer's per-channel envelope phase. A channel enters the
 * attack phase (1) exactly when its row's cell holds a note; the reported
 * position and row at that moment must be a grid cell with a note on that
 * channel,.
 */
import { describe, it, expect } from 'vitest';
import { loadSharedWorkletScripts, startWorklet, songBuffer, stereoOutputs } from './workletHarness';
import { preTrackerTransform } from '@/engine/pretracker/PreTrackerEngine';
import { parsePreTrackerFile } from '@/lib/import/formats/PreTrackerParser';

const FILE = 'public/data/songs/pretracker/the little things.prt';
const ATTACK = 1;
const NOTE_OFF = 73;   // PreTracker's key-off, as the parser stores it

interface Mod {
  _player_get_channel_adsr_phase(ch: number): number;
}

describe('PreTracker playhead follows the grid row', () => {
  it('a channel starts a note on the grid row the replayer reports, never on an empty cell', async () => {
    loadSharedWorkletScripts();
    const buf = songBuffer(FILE);
    const song = await parsePreTrackerFile(buf.slice(0), 'the little things.prt');
    const { proc, send, posted } = await startWorklet('pretracker', 'PreTracker', preTrackerTransform, 'Pretracker');
    await send({ type: 'loadModule', moduleData: buf.slice(0) });
    const m = (proc as unknown as { module: Mod }).module;
    const outs = stereoOutputs(5);

    let read = 0;
    let head = { songPos: -1, row: -1 };
    const phase = [0, 0, 0, 0];
    const started = new Set<string>();
    const wrong: string[] = [];
    let maxPos = 0;
    for (let block = 0; block < 12000; block++) {
      proc.process([], outs);
      for (; read < posted.length; read++) {
        const p = posted[read] as { type?: string; songPos?: number; row?: number };
        if (p.type === 'position') head = { songPos: p.songPos!, row: p.row! };
      }
      maxPos = Math.max(maxPos, head.songPos);
      for (let ch = 0; ch < 4; ch++) {
        const ph = m._player_get_channel_adsr_phase(ch);
        if (ph === ATTACK && phase[ch] !== ATTACK) {
          const cell = song.patterns[head.songPos]?.channels[ch].rows[head.row];
          if (!cell || cell.note <= 0 || cell.note === NOTE_OFF) {
            if (wrong.length < 5) wrong.push(`block ${block} channel ${ch}: attack on pattern ${head.songPos} row ${head.row}, cell note ${cell?.note}`);
          }
          started.add(`${head.songPos}:${head.row}:${ch}`);
        }
        phase[ch] = ph;
      }
    }
    expect(maxPos, 'the playhead crosses pattern boundaries').toBeGreaterThan(0);
    expect(wrong).toEqual([]);
    // A note that continues a held one (same instrument, no new attack) is
    // legitimately silent in the phase, so the check is one-way: no attack on
    // an empty cell. The song must still have started many notes.
    expect(started.size, 'channels start notes').toBeGreaterThan(40);
  }, 60000);
});
