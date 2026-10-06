/**
 * The grid row shown while UADE plays a Sound Master module is the row whose
 * notes Paula is playing.
 *
 * The parser decodes the grid in player ticks (song.uadePlayerTickGrid): a row
 * is `speed` calls of the replayer's play routine from the first one, which
 * UADE runs from the eagleplayer's interrupt. The worklet posts that
 * interrupt count and UADEEngine maps it through playerTickGridPosition; this
 * runs the real worklet and WASM (workletHarness) and checks every note-on
 * Paula gets against the cell the mapping points at in that block.
 *
 * Note-on: the replayer writes every voice's sample pointer at the start of a
 * play call and its period at the end; a voice that starts a note gets its
 * pointer written twice before the period (soundMasterGridMatchesPlayer.test.ts).
 */
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { startWorklet, songBuffer, stereoOutputs } from './workletHarness';
import { parseSoundMasterFile } from '@/lib/import/formats/SoundMasterParser';
import { playerTickGridPosition, type TickGrid } from '@/lib/tracker/tickGridPosition';
import { uadePlayerHint } from '@/lib/import/uadePlayerHint';

interface Wasm {
  HEAPU8: Uint8Array;
  _malloc(n: number): number;
  _uade_wasm_enable_paula_log(on: number): void;
  _uade_wasm_get_paula_log(ptr: number, max: number): number;
}

async function playAndCompare(path: string, seconds: number): Promise<{ checked: number; wrong: string[]; lastRow: { pos: number; row: number } }> {
  const file = path.split('/').pop()!;
  const bytes = new Uint8Array(readFileSync(join(process.cwd(), path)));
  const song = await parseSoundMasterFile(bytes.slice().buffer as ArrayBuffer, file);
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
  const pointerWrites = [0, 0, 0, 0];
  const wrong: string[] = [];
  let checked = 0;
  let lastRow = { pos: -1, row: -1 };
  const blocks = Math.ceil((48000 * seconds) / 128);
  for (let b = 0; b < blocks; b++) {
    proc._lastChannelPost = -1; // open the 50 ms throttle: this block posts its position
    const before = posted.length;
    proc.process([], stereoOutputs(37));
    const n = wasm._uade_wasm_get_paula_log(logPtr, 512);
    const u32 = new Uint32Array(wasm.HEAPU8.buffer, logPtr, n * 3);
    const noteOns: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) {
      const w = u32[i * 3];
      const ch = w >>> 24, reg = (w >>> 16) & 0xff, value = w & 0xffff;
      if (ch > 3) continue;
      if (reg === 1) pointerWrites[ch]++;
      else if (reg === 3) {
        if (pointerWrites[ch] >= 2) noteOns.push([ch, value]);
        pointerWrites[ch] = 0;
      }
    }
    const pos = posted.slice(before).find((m) => m.type === 'position') as { playerTickCount?: number } | undefined;
    if (!pos) { expect(b, 'only the first block (throttle initialised there) posts nothing').toBe(0); continue; }
    const ticks = pos.playerTickCount ?? 0;
    if (ticks <= 0) continue;
    const { songPos, row } = playerTickGridPosition(ticks, grid);
    lastRow = { pos: songPos, row };
    const pattern = song.patterns[song.songPositions[songPos]];
    for (const [ch, period] of noteOns) {
      checked++;
      const cell = pattern.channels[ch].rows[row];
      if (cell.period !== period) {
        wrong.push(`t=${((b * 128) / 48000).toFixed(2)}s voice ${ch} period ${period}: grid shows pos ${songPos} row ${row} = note ${cell.note} period ${cell.period}`);
      }
    }
  }
  return { checked, wrong, lastRow };
}

describe('Sound Master playhead follows UADE', { timeout: 120_000 }, () => {
  it("rackney's island 4: every note Paula plays is on the row the grid shows at that moment", async () => {
    const r = await playAndCompare("public/data/songs/sound-master/rackney'sisland 4.sm", 20);
    expect(r.wrong.slice(0, 5)).toEqual([]);
    expect(r.checked).toBeGreaterThan(250);
    // 20 s at speed 3 = 1000 player ticks = row 333: pattern 20 (16 rows each), row 13 (+-1).
    expect(r.lastRow.pos).toBe(20);
    expect(Math.abs(r.lastRow.row - 13)).toBeLessThanOrEqual(1);
  });

  it('futureshock level 3 (Sound Master II v1, fixed tables): the rows line up', async () => {
    const r = await playAndCompare('public/data/songs/sound-master-ii-v1/futureshock-level 3.smpro', 15);
    expect(r.wrong.slice(0, 5)).toEqual([]);
    expect(r.checked).toBeGreaterThan(100);
  });
});
