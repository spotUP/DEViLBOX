/**
 * Activision Pro: the playhead is the replayer's own step, and a grid edit
 * is the note the running replayer plays.
 *
 * The grid has one row per step (activisionProGrid.ts, matched to UADE in
 * activisionProGridMatchesUade.test.ts). The WASM replayer counts its steps
 * (avp_get_step) and the worklet posts the counter. Here the counter is held
 * to the walk's own step clock over 30 s of the real song, and an edited
 * event's note is read back from the voice when the replayer reaches the row.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, startWorklet, stereoOutputs, loadSharedWorkletScripts } from './workletHarness';
import { activisionProTransform } from '@/engine/activisionpro/ActivisionProEngine';
import { decodeActivisionProModule } from '@/lib/import/formats/ActivisionProModule';
import {
  walkActivisionPro, avpStepTicks, applyActivisionProGridEdits, AVP_PERIODS, AVP_ROWS_PER_PATTERN,
} from '@/lib/import/formats/activisionProGrid';
import { periodToNote } from '@/lib/amiga/periodNotes';

const bytes = new Uint8Array(readFileSync(join(ROOT, 'public/data/songs/activision-pro/gettysburg.avp')));
const FRAMES_PER_TICK = 960;   // 48 kHz / 50 Hz

interface Wasm {
  _avp_get_step(h: number): number;
  _avp_get_voice_period(h: number, v: number): number;
}
const buf = (b: Uint8Array): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

async function start() {
  loadSharedWorkletScripts();
  const w = await startWorklet('activisionpro', 'ActivisionPro', activisionProTransform);
  await w.send({ type: 'loadModule', moduleData: buf(bytes) });
  await w.send({ type: 'play' });
  const wasm = (w.proc as unknown as { module: Wasm }).module;
  const handle = (w.proc as unknown as { handle: number }).handle;
  return { ...w, wasm, handle };
}

describe('Activision Pro playhead and edits', () => {
  const m = decodeActivisionProModule(bytes)!;
  const walk = walkActivisionPro(m, 0);
  const ticks = avpStepTicks(m, 0, walk.rows);

  it('the replayer reports the grid row it is on: its step counter is the walk\'s step clock', async () => {
    const { proc, wasm, handle, posted } = await start();
    const out = stereoOutputs(5);
    let frames = 0, checked = 0;
    const wrong: string[] = [];
    for (let block = 0; block < 11250; block++) {
      proc.process([], out);
      frames += 128;
      const done = Math.floor(frames / FRAMES_PER_TICK);
      let expected = 0;
      while (expected + 1 < ticks.length && ticks[expected + 1] < done) expected++;
      const got = wasm._avp_get_step(handle);
      checked++;
      if (got !== expected && wrong.length < 5) wrong.push(`after ${frames} frames: replayer step ${got}, walk ${expected}`);
    }
    expect(checked).toBeGreaterThan(10000);
    expect(wrong).toEqual([]);
    const reported = posted.filter((p) => (p as { type?: string }).type === 'position').map((p) => (p as { step: number }).step);
    expect(reported.length, 'the worklet posts the step as it changes').toBeGreaterThan(300);
    expect(reported[reported.length - 1]).toBeGreaterThan(500);
  }, 60000);

  // A held-note event on voice 1, well after the first steps.
  const at = walk.starts[1].find((e, r) => !!e && r >= 30 && e.retrigger && e.cell.note > 0)!;
  const edited = { ...at.cell, note: at.cell.note + 2 };
  const patch = (b: Uint8Array) => applyActivisionProGridEdits(b, [{
    pattern: Math.floor(at.step / AVP_ROWS_PER_PATTERN), row: at.step % AVP_ROWS_PER_PATTERN, channel: 1, cell: edited,
  }]);

  it('a note edit changes the event\'s note byte and nothing else', () => {
    const next = patch(bytes);
    expect(next).not.toBe(bytes);
    const diff = Array.from(next).map((b, i) => (b !== bytes[i] ? i : -1)).filter((i) => i >= 0);
    expect(diff.length, 'one note byte').toBe(1);
    const again = walkActivisionPro(decodeActivisionProModule(next)!, 0);
    const shown = again.starts[1][at.step]!.cell;
    expect(shown.note).toBe(at.cell.note + 2);
    expect(shown.instrument).toBe(at.cell.instrument);
    expect(again.rows).toBe(walk.rows);
  });

  it('an edit the module cannot hold (a note outside the table range, an instrument that grows the event) leaves it as it was', () => {
    const plain = walk.starts[1].find((e) => !!e && e.event.ops.length === 0 && e.cell.note > 0)!;
    const grows = applyActivisionProGridEdits(bytes, [{
      pattern: Math.floor(plain.step / AVP_ROWS_PER_PATTERN), row: plain.step % AVP_ROWS_PER_PATTERN, channel: 1,
      cell: { ...plain.cell, instrument: 3 },
    }]);
    expect(grows, 'a byte more in the track').toBe(bytes);
    const cant = applyActivisionProGridEdits(bytes, [{
      pattern: Math.floor(at.step / AVP_ROWS_PER_PATTERN), row: at.step % AVP_ROWS_PER_PATTERN, channel: 1,
      cell: { ...at.cell, note: 120 },
    }]);
    expect(cant).toBe(bytes);
  });

  it('the running replayer plays the edited note on its row, and keeps its place', async () => {
    const next = patch(bytes);
    const { proc, send, wasm, handle } = await start();
    const out = stereoOutputs(5);
    let swapped = false, atSwap = -1, afterSwap = -1, played = 0;
    for (let block = 0; block < 20000 && played === 0; block++) {
      proc.process([], out);
      const step = wasm._avp_get_step(handle);
      if (!swapped && step >= 4) {
        atSwap = step;
        await send({ type: 'replaceModule', moduleData: buf(next) });
        swapped = true;
        afterSwap = wasm._avp_get_step(handle);
      }
      if (swapped && step === at.step) played = wasm._avp_get_voice_period(handle, 1);
    }
    expect(atSwap).toBeGreaterThanOrEqual(4);
    expect(at.step, 'the edited row is ahead of the swap').toBeGreaterThan(atSwap);
    expect(afterSwap, 'the swap keeps the replayer on its step').toBe(atSwap);
    expect(periodToNote(played)).toBe(at.cell.note + 2);
    expect(AVP_PERIODS).toContain(played);
  }, 60000);
});
