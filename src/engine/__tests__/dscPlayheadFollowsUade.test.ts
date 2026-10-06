/**
 * The grid row shown while UADE plays a Digital Sonix & Chrome song is the row
 * whose notes Paula is playing.
 *
 * Owner, 2026-10-06: the decoded grid was right but "missing notes, not synced"
 * against what was heard. The playhead of a UADE song comes from the worklet's
 * `position` message, whose tickCount is CIA-A Timer A; the score runs every
 * DTP_Interrupt player on Timer B, so for DSC tickCount stayed 0, the
 * subscription never anchored, and the grid ran on the TS scheduler's own
 * clock, started at the Play press. The worklet now also posts the player's
 * interrupt count (uade_wasm_get_player_tick_count) and a grid the parser
 * decoded in player ticks (song.uadePlayerTickGrid) follows it through
 * playerTickGridPosition - the mapping UADEEngine.subscribeToCoordinator uses.
 *
 * Runs the real worklet and WASM (workletHarness). The harness has no audio
 * clock, so the worklet's 50 ms post throttle is opened before every block:
 * every block posts the position message the app would get.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startWorklet, songBuffer, stereoOutputs } from './workletHarness';
import { parseDscFile } from '@/lib/import/formats/DigitalSonixChromeParser';
import { decodeDscModule, encodeDscModule } from '@/lib/import/formats/DigitalSonixChromeModule';
import { playerTickGridPosition, type TickGrid } from '@/lib/tracker/tickGridPosition';
import { periodToNote } from '@/lib/amiga/periodNotes';
import { uadePlayerHint } from '@/lib/import/uadePlayerHint';

const DIR = 'public/data/songs/digital-sonix-and-chrome/David Hanlon';

interface Wasm {
  HEAPU8: Uint8Array;
  _malloc(n: number): number;
  _uade_wasm_enable_paula_log(on: number): void;
  _uade_wasm_get_paula_log(ptr: number, max: number): number;
}

async function playAndCompare(file: string, subsong: number, seconds: number): Promise<{ checked: number; wrong: string[]; lastRowShown: number }> {
  const bytes = new Uint8Array(readFileSync(join(process.cwd(), DIR, file)));
  const song = parseDscFile(bytes.slice().buffer as ArrayBuffer, file, subsong);
  expect(song.uadePlayerTickGrid).toBe(true);
  const grid: TickGrid = {
    speed: song.initialSpeed, songPositions: song.songPositions,
    patternLengths: song.patterns.map((p) => p.length), loopFrom: song.restartPosition ?? 0,
  };

  const { proc, send, posted } = await startWorklet('uade', 'UADE', async (c) => (await import('@/engine/uade/UADEEngine')).uadeTransform(c));
  // What UADEEngine.loadTune sends for this song: no scan, the grid's subsong, pinned.
  await send({ type: 'load', buffer: songBuffer(join(DIR, file)), filenameHint: uadePlayerHint(file), skipScan: true, subsong, pinSubsong: !!song.uadeEditableSubsongs?.orders });
  const loaded = posted.find((m) => m.type === 'loaded') as { startSubsong?: number } | undefined;
  expect(loaded?.startSubsong, 'UADE plays the subsong the grid shows').toBe(subsong);
  await send({ type: 'play' });

  const wasm = proc._wasm as Wasm;
  wasm._uade_wasm_enable_paula_log(1);
  const logPtr = wasm._malloc(512 * 12);
  const armed = [false, false, false, false];
  const wrong: string[] = [];
  let checked = 0;
  let lastRowShown = -1;
  const blocks = Math.ceil((48000 * seconds) / 128);
  for (let b = 0; b < blocks; b++) {
    proc._lastChannelPost = -1; // open the 50 ms throttle: this block posts its position
    const before = posted.length;
    proc.process([], stereoOutputs(37));
    // Note-ons Paula received while rendering this block.
    const n = wasm._uade_wasm_get_paula_log(logPtr, 512);
    const u32 = new Uint32Array(wasm.HEAPU8.buffer, logPtr, n * 3);
    const noteOns: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) {
      const w = u32[i * 3];
      const ch = w >>> 24, reg = (w >>> 16) & 0xff, value = w & 0xffff;
      if (ch > 3) continue;
      if (reg === 0 || reg === 1) armed[ch] = true;
      else if (reg === 3 && armed[ch] && value >= 60 && value <= 7000) { armed[ch] = false; noteOns.push([ch, value]); }
    }
    // The position the app receives for this block, mapped as UADEEngine maps it.
    const pos = posted.slice(before).find((m) => m.type === 'position') as { playerTickCount?: number } | undefined;
    if (!pos) { expect(b, 'only the first block (throttle initialised there) posts nothing').toBe(0); continue; }
    const ticks = pos.playerTickCount ?? 0;
    if (ticks <= 0) continue;
    const { songPos, row } = playerTickGridPosition(ticks, grid);
    lastRowShown = songPos * 1000 + row;
    const pattern = song.patterns[song.songPositions[songPos]];
    for (const [ch, period] of noteOns) {
      checked++;
      const cell = pattern.channels[ch].rows[row];
      if (cell.note !== periodToNote(period) || cell.period !== period) {
        wrong.push(`t=${((b * 128) / 48000).toFixed(2)}s voice ${ch} period ${period}: grid shows pos ${songPos} row ${row} = note ${cell.note} period ${cell.period}`);
      }
    }
  }
  return { checked, wrong, lastRowShown };
}

describe('DSC playhead follows UADE', { timeout: 120_000 }, () => {
  it("ingame 1: every note Paula plays is on the row the grid shows at that moment", async () => {
    const r = await playAndCompare("dragon'sbreath ingame 1.dsc", 0, 30);
    expect(r.wrong.slice(0, 5)).toEqual([]);
    expect(r.checked).toBeGreaterThan(100);
    // 30 s at speed 5 = 1500 player ticks = row 300: position 4, row 44 (+-1 at the block edge).
    expect(r.lastRowShown).toBeGreaterThanOrEqual(4 * 1000 + 43);
    expect(r.lastRowShown).toBeLessThanOrEqual(4 * 1000 + 45);
  });

  it('fanfares subsong 2: UADE plays the grid subsong (no first-audible probe) and the rows line up', async () => {
    const r = await playAndCompare("dragon'sbreath fanfares.dsc", 2, 12);
    expect(r.wrong.slice(0, 5)).toEqual([]);
    expect(r.checked).toBeGreaterThan(40);
  });

  it("a subsong 0 that is silent at the start still plays subsong 0 when the grid shows it (the probe would pick another)", async () => {
    // fanfares with subsong 0's opening block (rows 0-63) silenced: subsong 0 is
    // then silent for its whole first 3 s, the first-audible probe's window.
    const m = decodeDscModule(new Uint8Array(readFileSync(join(process.cwd(), DIR, "dragon'sbreath fanfares.dsc"))));
    for (const t of m.tracks) t.fill(0xff, 0, 64);
    const bytes = encodeDscModule(m);
    const song = parseDscFile(bytes.slice().buffer as ArrayBuffer, 'silent start.dsc', 0);
    expect(song.uadeEditableSubsongs?.orders).toBeTruthy();
    const startOf = async (pinSubsong: boolean): Promise<number | undefined> => {
      const { send, posted } = await startWorklet('uade', 'UADE', async (c) => (await import('@/engine/uade/UADEEngine')).uadeTransform(c));
      await send({ type: 'load', buffer: bytes.slice().buffer, filenameHint: uadePlayerHint("dragon'sbreath fanfares.dsc"), skipScan: true, subsong: 0, pinSubsong });
      return (posted.find((msg) => msg.type === 'loaded') as { startSubsong?: number } | undefined)?.startSubsong;
    };
    expect(await startOf(false), 'unpinned, the probe moves off the silent subsong').not.toBe(0);
    expect(await startOf(!!song.uadeEditableSubsongs?.orders), 'pinned: the grid subsong').toBe(0);
  });
});
