/**
 * The grid row shown while UADE plays a Tony Williams module is the row whose notes Paula is playing.
 *
 * Regression: the TW player steps on the 50 Hz vertical-blank interrupt, so CIA-A Timer A (update.tickCount)
 * stays 0. The parser did not set song.uadePlayerTickGrid, UADEEngine took the tickCount path, its
 * `tickCount <= 0` guard returned on every update, and the playhead ran off a different clock than the music
 * (the owner saw patterns offset from the sound). With the flag, UADEEngine maps the player-interrupt count
 * through playerTickGridPosition. This runs the real worklet and WASM (workletHarness) and checks every note-on
 * Paula gets against the cell the mapping points at in that block.
 */
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { drainPaulaLog, PaulaNoteOns, type PaulaLogHost } from './gridOracle';
import { startWorklet, songBuffer, stereoOutputs } from './workletHarness';
import { parseTonyWilliamsFile } from '@/lib/import/formats/TonyWilliamsParser';
import { playerTickGridPosition, type TickGrid } from '@/lib/tracker/tickGridPosition';
import { uadePlayerHint } from '@/lib/import/uadePlayerHint';

type Wasm = PaulaLogHost & {
  _malloc(n: number): number;
  _uade_wasm_enable_paula_log(on: number): void;
};

const PATH = 'public/data/songs/formats/future basketball main.tw';

describe('Tony Williams playhead follows UADE', { timeout: 120_000 }, () => {
  it('future basketball: every note Paula starts is on a note cell of the row the grid shows at that moment', async () => {
    const file = PATH.split('/').pop()!;
    const bytes = new Uint8Array(readFileSync(join(process.cwd(), PATH)));
    const song = await parseTonyWilliamsFile(bytes.slice().buffer as ArrayBuffer, file);
    expect(song.uadePlayerTickGrid).toBe(true);
    expect(song.initialSpeed).toBe(6);
    const grid: TickGrid = {
      speed: song.initialSpeed, songPositions: song.songPositions,
      patternLengths: song.patterns.map((p) => p.length), loopFrom: song.restartPosition ?? 0,
    };

    const { proc, send, posted } = await startWorklet('uade', 'UADE', async (c) => (await import('@/engine/uade/UADEEngine')).uadeTransform(c));
    await send({ type: 'load', buffer: songBuffer(PATH), filenameHint: uadePlayerHint(file), skipScan: true, subsong: 0, pinSubsong: false });
    await send({ type: 'play' });

    const wasm = proc._wasm as Wasm;
    wasm._uade_wasm_enable_paula_log(1);
    const logPtr = wasm._malloc(512 * 12);
    const noteRule = new PaulaNoteOns('armed');
    const wrong: string[] = [];
    let checked = 0;
    let timerATicks = 0;
    let lastRow = { pos: -1, row: -1 };
    const blocks = Math.ceil((48000 * 15) / 128);
    for (let b = 0; b < blocks; b++) {
      proc._lastChannelPost = -1; // open the 50 ms throttle: this block posts its position
      const before = posted.length;
      proc.process([], stereoOutputs(37));
      const noteOns: number[] = [];
      for (const w of drainPaulaLog(wasm, logPtr)) {
        if (noteRule.push(w) !== null) noteOns.push(w.voice);
      }
      const pos = posted.slice(before).find((m) => m.type === 'position') as { playerTickCount?: number; tickCount?: number } | undefined;
      if (!pos) continue;
      timerATicks = Math.max(timerATicks, pos.tickCount ?? 0);
      const ticks = pos.playerTickCount ?? 0;
      if (ticks <= 0) continue;
      const { songPos, row } = playerTickGridPosition(ticks, grid);
      lastRow = { pos: songPos, row };
      const pattern = song.patterns[song.songPositions[songPos]!]!;
      for (const ch of noteOns) {
        checked++;
        const cell = pattern.channels[ch]!.rows[row]!;
        if (!(cell.note > 0)) wrong.push(`t=${((b * 128) / 48000).toFixed(2)}s voice ${ch}: grid shows pos ${songPos} row ${row} with no note`);
      }
    }
    // The clock the old path used never moves for this player: that is why the flag is needed.
    expect(timerATicks).toBe(0);
    expect(wrong.slice(0, 5)).toEqual([]);
    expect(checked).toBeGreaterThan(100);
    // 15 s = 750 player ticks at speed 6 = row 124 = position 1 (64-row patterns), row 60 (+-1).
    expect(lastRow.pos).toBe(1);
    expect(Math.abs(lastRow.row - 60)).toBeLessThanOrEqual(1);
  });
});
