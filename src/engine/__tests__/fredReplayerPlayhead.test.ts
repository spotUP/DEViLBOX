/**
 * Fred Editor: the playhead is the replayer's own line, not a timer.
 *
 * The replayer reported no position, so the pattern editor's row came from the
 * tracker scheduler on the song's nominal tempo while the worklet's audio (and
 * the scopes and meters fed from it) free-ran from whenever it was started:
 * "the scopes and notes are out of sync" (owner, bomb jack.fred). The replayer
 * now counts its lines (a line is TempoCur ticks; the grid's row,
 * fredEditorGrid.ts - whose rows are matched to UADE's note-ons in
 * fredEditorGridMatchesPlayer.test.ts) and the worklet posts the counter.
 * Here the counter is held to the grid's clock (row r starts at tick
 * r * initialSpeed) over the whole of bomb jack.fred.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, startWorklet, stereoOutputs, loadSharedWorkletScripts } from './workletHarness';
import { fredReplayerTransform } from '@/engine/fred-replayer/FredReplayerEngine';
import { parseFredEditorFile } from '@/lib/import/formats/FredEditorParser';

const FILE = join(ROOT, 'public/data/songs/formats/bomb jack.fred');
const bytes = new Uint8Array(readFileSync(FILE));
const FRAMES_PER_TICK = 960;   // 48 kHz / 50 Hz

interface Wasm { _fred_get_line(h: number): number }

describe('Fred Editor playhead', () => {
  it('the replayer reports the grid row it is on: its line counter is the grid clock', async () => {
    const song = await parseFredEditorFile(bytes.slice().buffer as ArrayBuffer, 'bomb jack.fred');
    const speed = song.initialSpeed;
    const rows = song.patterns.reduce((n, p) => n + p.length, 0);
    const tempoChanges = song.patterns.some((p) => p.channels.some((c) => c.rows.some((r) => r.effTyp === 0x0f)));
    expect(tempoChanges, 'no tempo command: the grid clock is row * initialSpeed').toBe(false);

    loadSharedWorkletScripts();
    const { proc, send, posted } = await startWorklet('fred-replayer', 'FredReplayer', fredReplayerTransform);
    await send({ type: 'loadModule', moduleData: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
    await send({ type: 'play' });
    const wasm = (proc as unknown as { module: Wasm }).module;
    const handle = (proc as unknown as { handle: number }).handle;
    const out = stereoOutputs(5);
    const blocks = Math.floor((rows * speed * FRAMES_PER_TICK) / 128);
    let frames = 0;
    const wrong: string[] = [];
    for (let b = 0; b < blocks; b++) {
      proc.process([], out);
      frames += 128;
      const ticks = Math.floor(frames / FRAMES_PER_TICK);
      // The counter advances when the last tick of a line has run.
      const expected = Math.floor(ticks / speed);
      const got = wasm._fred_get_line(handle);
      if (got !== expected && wrong.length < 5) wrong.push(`after ${ticks} ticks: replayer line ${got}, grid row ${expected}`);
    }
    expect(rows).toBeGreaterThan(300);
    expect(wrong).toEqual([]);
    const lines = posted.filter((p) => (p as { type?: string }).type === 'position').map((p) => (p as { line: number }).line);
    expect(lines.length, 'the worklet posts the line as it changes').toBeGreaterThan(rows - 5);
  }, 60000);
});
