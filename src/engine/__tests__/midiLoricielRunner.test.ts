/**
 * MIDI Loriciel on the eagleplayer runner: the grid is what the player plays,
 * and a grid edit is played.
 *
 *  - The decoded schedule (MIDILoricielParser: one row per interrupt, one
 *    channel per Paula voice) is the player's: after every interrupt of
 *    Cartoons 2 the runner's Paula registers (period, volume, DMA per voice)
 *    are the ones the schedule says. Runner tick 1 is row 0.
 *  - The app's import (parseModuleToSong with the SMPL companion) gives that
 *    grid and routes the song to EaglePlayerEngine.
 *  - A grid edit through the store's edit path (sendCellEditsToEngine)
 *    re-encodes the MIDI file, makes it the song's module and reloads the
 *    runner with it; the runner then plays the edited pitch on that row.
 * Before 2026-10-06 the grid was carrier bytes (0 notes; UADE's scan drew
 * the grid) and an edit went nowhere the runner could hear.
 */
import { describe, it, expect, vi } from 'vitest';
import { startWorklet, songBuffer } from './workletHarness';
import { decodeMIDILoriciel, type LoricielVoiceState } from '@/lib/import/formats/MIDILoricielParser';

const loadTune = vi.fn(async () => undefined);
const play = vi.fn();
vi.mock('@/engine/eagleplayer/EaglePlayerEngine', () => ({
  EaglePlayerEngine: { hasInstance: () => true, getInstance: () => ({ loadTune, play }) },
}));

const DIR = 'public/data/songs/formats/Michel Winogradoff';
const TUNE = 'Cartoons 2';

/**
 * Run the real runner worklet on `module` and return each voice's Paula
 * registers at the end of every interrupt, indexed by the runner's tick.
 */
async function runnerStates(module: ArrayBuffer, bank: ArrayBuffer, ticks: number): Promise<LoricielVoiceState[][]> {
  const { proc, send, posted } = await startWorklet('eagleplayer', 'EaglePlayer');
  await send({
    type: 'loadModule', moduleData: module.slice(0), playerData: songBuffer('public/eagleplayer/players/MIDI-Loriciel'),
    moduleName: `MIDI.${TUNE}`, files: [{ name: `SMPL.${TUNE}`, data: bank.slice(0) }],
  });
  expect(posted.filter((m) => m.type === 'error')).toEqual([]);
  const m = (proc as unknown as { module: Record<string, (...a: number[]) => number> & { HEAPU8: Uint8Array } }).module;
  const out = m._malloc(32 * 2 * 4), st = m._malloc(16 * 4);
  const states: LoricielVoiceState[][] = [];
  let last = m._ep_wasm_player_ticks() >>> 0;
  let regs: number[] = [];
  // 32 frames per step: interrupts are ~370 frames apart, so the registers
  // read just before the tick count moves are the previous interrupt's end.
  for (let i = 0; i < 4_000_000 && states.length <= ticks; i++) {
    m._ep_wasm_render(out, 32);
    const t = m._ep_wasm_player_ticks() >>> 0;
    if (t !== last && regs.length) {
      states[last] = [0, 1, 2, 3].map((c) => ({ period: regs[c * 4], volume: regs[c * 4 + 1], dma: regs[c * 4 + 2] === 1, sample: -1 }));
      if (m._ep_wasm_song_ended()) break;
    }
    last = t;
    m._ep_wasm_voice_state(st);
    regs = [...new Uint32Array(m.HEAPU8.buffer, st, 16)];
  }
  m._free(out); m._free(st);
  return states;
}

/** Per voice: DMA, and period/volume while DMA is on - what Paula plays. */
const audible = (s: LoricielVoiceState[]) => s.map((v) => (v.dma ? [v.period, v.volume] : [0]));

describe('MIDI Loriciel on the eagleplayer runner', () => {
  it('the grid schedule is the runner\'s Paula at every interrupt', async () => {
    const module = songBuffer(`${DIR}/MIDI.${TUNE}`), bank = songBuffer(`${DIR}/SMPL.${TUNE}`);
    const dec = decodeMIDILoriciel(new Uint8Array(module), new Uint8Array(bank), true);
    const runner = await runnerStates(module, bank, dec.schedule.rows);
    let compared = 0;
    for (let row = 0; row < dec.schedule.rows - 1; row++) {
      const got = runner[row + 1];
      if (!got) break;
      expect(audible(got), `interrupt ${row}`).toEqual(audible(dec.schedule.states![row]));
      compared++;
    }
    expect(compared).toBeGreaterThan(dec.schedule.rows - 3);
  }, 60_000);

  it('an edit through the store path reloads the runner with a module that plays it', async () => {
    const module = songBuffer(`${DIR}/MIDI.${TUNE}`), bank = songBuffer(`${DIR}/SMPL.${TUNE}`);
    const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
    const song = await parseModuleToSong(new File([module], `MIDI.${TUNE}`), 0, undefined, undefined, new Map([[`SMPL.${TUNE}`, bank]]));
    expect(song.eaglePlayerId).toBe('MIDILoriciel');
    expect(song.numChannels).toBe(4);
    expect(song.initialSpeed).toBe(1);

    // The first note of the song, a tone up.
    const dec = decodeMIDILoriciel(new Uint8Array(module), new Uint8Array(bank));
    const first = dec.schedule.noteOns[0];
    const p = Math.floor(first.row / dec.rowsPerPattern), r = first.row % dec.rowsPerPattern;
    const cell = { ...song.patterns[p].channels[first.voice].rows[r] };
    expect(cell.note).toBeGreaterThan(0);
    cell.note += 2;

    const { sendCellEditsToEngine } = await import('@/engine/replayer/liveCellEdits');
    loadTune.mockClear();
    await sendCellEditsToEngine(song, [{ pattern: p, row: r, channel: first.voice, cell }]);
    expect(loadTune).toHaveBeenCalledTimes(1);
    const sent = (loadTune.mock.calls[0] as unknown as [ArrayBuffer, string])[0];
    expect((loadTune.mock.calls[0] as unknown as [ArrayBuffer, string])[1]).toBe('MIDILoriciel');
    expect(new Uint8Array(song.eaglePlayerFileData!)).toEqual(new Uint8Array(sent));

    const after = decodeMIDILoriciel(new Uint8Array(sent), new Uint8Array(bank), true);
    expect(after.grid[first.voice][first.row].note).toBe(cell.note);
    const runner = await runnerStates(sent, bank, first.row + 2);
    const v = runner[first.row + 1][first.voice];
    expect(v.dma).toBe(true);
    expect(v.period).toBe(after.schedule.states![first.row][first.voice].period);
    expect(v.period).not.toBe(dec.schedule.noteOns[0].period);
  }, 60_000);
});
