/**
 * Rob Hubbard: the grid row shown while UADE plays the module is the row whose notes Paula is
 * playing (plan fix-all-open G10 "report position so the playhead follows").
 *
 * The parser's grid is in player interrupts (song.uadePlayerTickGrid, `initialSpeed` interrupts a
 * row, row 0 on the first). The worklet posts UADE's interrupt count and UADEEngine maps it through
 * playerTickGridPosition; this runs the real worklet and WASM (workletHarness) and checks every
 * note-on Paula makes against the cell the mapping points at: the cell must hold the note the
 * period names (robHubbardGridIsPlayersWalk.test.ts holds the grid to Paula's notes themselves).
 */
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { drainPaulaLog, PaulaNoteOns, type PaulaLogHost } from './gridOracle';
import { startWorklet, songBuffer, stereoOutputs } from './workletHarness';
import { parseRobHubbardFile } from '@/lib/import/formats/RobHubbardParser';
import { rhPeriodToNote } from '@/lib/import/formats/robHubbardGrid';
import { playerTickGridPosition, type TickGrid } from '@/lib/tracker/tickGridPosition';
import { uadePlayerHint } from '@/lib/import/uadePlayerHint';

type Wasm = PaulaLogHost & {
  _malloc(n: number): number;
  _uade_wasm_enable_paula_log(on: number): void;
};

async function playAndCompare(path: string, seconds: number): Promise<{ checked: number; wrong: string[]; lastRow: { pos: number; row: number } }> {
  const file = path.split('/').pop()!;
  const bytes = new Uint8Array(readFileSync(join(process.cwd(), path)));
  const song = await parseRobHubbardFile(bytes.slice().buffer as ArrayBuffer, file);
  expect(song.uadePlayerTickGrid).toBe(true);
  const grid: TickGrid = {
    speed: song.initialSpeed, songPositions: song.songPositions,
    patternLengths: song.patterns.map((p) => p.length), loopFrom: song.restartPosition ?? 0,
  };

  const { proc, send, posted } = await startWorklet('uade', 'UADE', async (c) => (await import('@/engine/uade/UADEEngine')).uadeTransform(c));
  await send({ type: 'load', buffer: songBuffer(path), filenameHint: uadePlayerHint(file), skipScan: true, subsong: 0, pinSubsong: false });
  await send({ type: 'play' });

  const wasm = proc._wasm as Wasm;
  wasm._uade_wasm_enable_paula_log(1);
  const logPtr = wasm._malloc(512 * 12);
  const noteRule = new PaulaNoteOns('armed');
  const wrong: string[] = [];
  let checked = 0;
  let lastRow = { pos: -1, row: -1 };
  const blocks = Math.ceil((48000 * seconds) / 128);
  for (let b = 0; b < blocks; b++) {
    proc._lastChannelPost = -1; // open the 50 ms throttle: this block posts its position
    const before = posted.length;
    proc.process([], stereoOutputs(37));
    const noteOns: Array<[number, number]> = [];
    for (const w of drainPaulaLog(wasm, logPtr)) {
      const period = noteRule.push(w);
      if (period !== null) noteOns.push([w.voice, period]);
    }
    const pos = posted.slice(before).find((m) => m.type === 'position') as { playerTickCount?: number } | undefined;
    if (!pos) { expect(b, 'only the first block (throttle initialised there) posts nothing').toBe(0); continue; }
    const ticks = pos.playerTickCount ?? 0;
    if (ticks <= 0) continue;
    const { songPos, row } = playerTickGridPosition(ticks, grid);
    lastRow = { pos: songPos, row };
    const pattern = song.patterns[song.songPositions[songPos]];
    for (const [ch, period] of noteOns) {
      if (ch > 3 || period === 150) continue; // 150: the init write of every voice
      checked++;
      const cell = pattern.channels[ch].rows[row];
      if (cell.note !== rhPeriodToNote(period)) {
        wrong.push(`t=${((b * 128) / 48000).toFixed(2)}s voice ${ch} period ${period}: grid shows pos ${songPos} row ${row} = note ${cell.note}`);
      }
    }
  }
  return { checked, wrong, lastRow };
}

describe('Rob Hubbard playhead follows UADE', { timeout: 120_000 }, () => {
  it('skateordie: every note Paula plays is on the row the grid shows at that moment', async () => {
    const r = await playAndCompare('public/data/songs/rob-hubbard/skateordie.rh', 20);
    expect(r.wrong.slice(0, 5)).toEqual([]);
    expect(r.checked).toBeGreaterThan(100);
    // 20 s of 50 Hz interrupts = 1000, speed 5: row 200 = pattern 3 (64 rows each), row 8 (+-1).
    expect(r.lastRow.pos).toBe(3);
    expect(Math.abs(r.lastRow.row - 8)).toBeLessThanOrEqual(2);
  });

  it('centurion_battle: the rows line up through the song end', async () => {
    const r = await playAndCompare('public/data/songs/formats/centurion_battle.rh', 5);
    expect(r.wrong.slice(0, 5)).toEqual([]);
    expect(r.checked).toBeGreaterThan(20);
  });
});
