/**
 * MIDI Loriciel: the playhead row at time t is the row Paula plays at t.
 *
 * The runner worklet posts its tick count each render block; EaglePlayerEngine
 * maps it onto the grid with eaglePlayerGrid(song) + tickGridPosition. With
 * the parser's tick grid (row 0 at runner tick 1, one pass = the schedule's
 * interrupts) and speed = interrupts per row, every Paula note-on in the
 * first 30 s of Cartoons 2 happens while the playhead is on the row that
 * holds that note, on one of that voice's channels. Before 2026-10-06 the
 * grid had one row per interrupt and the map counted tick 0 as row 0.
 */
import { describe, it, expect } from 'vitest';
import { startWorklet, songBuffer, stereoOutputs } from './workletHarness';
import {
  decodeMIDILoriciel, parseMIDILoricielFile, loricielGridNote, LORICIEL_PERIODS, LORICIEL_PERIOD_MIN_INDEX,
} from '@/lib/import/formats/MIDILoricielParser';
import { eaglePlayerGrid } from '@/engine/eagleplayer/EaglePlayerEngine';
import { tickGridPosition } from '@/lib/tracker/tickGridPosition';

const DIR = 'public/data/songs/formats/Michel Winogradoff';
const TUNE = 'Cartoons 2';

describe('MIDI Loriciel playhead on the eagleplayer runner', () => {
  it('the playhead row at every Paula note-on is the row that holds the note', async () => {
    const module = songBuffer(`${DIR}/MIDI.${TUNE}`), bank = songBuffer(`${DIR}/SMPL.${TUNE}`);
    const song = parseMIDILoricielFile(module.slice(0), `MIDI.${TUNE}`, new Map([[`SMPL.${TUNE}`, bank]]));
    const dec = decodeMIDILoriciel(new Uint8Array(module), new Uint8Array(bank));
    const grid = eaglePlayerGrid(song);
    const { proc, send, posted } = await startWorklet('eagleplayer', 'EaglePlayer');
    await send({
      type: 'loadModule', moduleData: module.slice(0), playerData: songBuffer('public/eagleplayer/players/MIDI-Loriciel'),
      moduleName: `MIDI.${TUNE}`, files: [{ name: `SMPL.${TUNE}`, data: bank.slice(0) }],
    });
    await send({ type: 'play' });
    const m = (proc as unknown as { module: Record<string, (...a: number[]) => number> & { HEAPU8: Uint8Array } }).module;
    const st = m._malloc(16 * 4);
    const noteOfPeriod = new Map<number, number>();
    LORICIEL_PERIODS.forEach((p, i) => { if (!noteOfPeriod.has(p)) noteOfPeriod.set(p, loricielGridNote(i + LORICIEL_PERIOD_MIN_INDEX)); });
    const cellAt = (ch: number, pos: { songPos: number; row: number }) => song.patterns[song.songPositions[pos.songPos]].channels[ch].rows[pos.row];
    let prev: number[] = new Array(16).fill(0);
    let checked = 0;
    // The whole pass in 128-frame blocks, as the browser renders it.
    for (let block = 0; block < 48000 * 30 / 128; block++) {
      posted.length = 0;
      proc.process([], stereoOutputs(5));
      const pos = posted.filter((x) => (x as { type?: string }).type === 'position').pop() as { ticks: number } | undefined;
      m._ep_wasm_voice_state(st);
      const regs = [...new Uint32Array(m.HEAPU8.buffer, st, 16)];
      if (pos) {
        const at = tickGridPosition(pos.ticks, grid);
        for (let v = 0; v < 4; v++) {
          const [per, vol, dma] = [regs[v * 4], regs[v * 4 + 1], regs[v * 4 + 2]];
          const started = dma === 1 && (prev[v * 4 + 2] !== 1 || per !== prev[v * 4] || vol !== prev[v * 4 + 1]);
          if (!started) continue;
          const note = noteOfPeriod.get(per);
          const ok = dec.layout.channels.some((c, ch) => c.voice === v && cellAt(ch, at).note === note);
          expect(ok, `block ${block}: voice ${v} plays period ${per} (note ${note}) while the playhead is at position ${at.songPos} row ${at.row}`).toBe(true);
          checked++;
        }
      }
      prev = regs;
    }
    expect(checked).toBeGreaterThan(100);
  }, 60_000);

});
