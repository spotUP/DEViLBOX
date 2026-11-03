/**
 * Owner 2026-11-03: "tfmx pattern scroll is broken it scrolls too fast and stops scrolling after a while in
 * turrican bonus".
 *
 * Cause: the grid row was guessed from elapsed time (a 20 ms jiffy against a timing table built from voice 0's
 * waits only, ignoring tempo and loops), so it ran ahead and then stuck on the table's last entry.
 *
 * Now the native decoder reports the trackstep it plays and the mdat offset of the pattern command it is on
 * (TFMXDecoder::getPlayPosition), and tfmxGridPositionAt maps that to the grid cell holding that command.
 * This pins the mapping on the real song: every command cell the grid shows is found again at its own pattern
 * and row when the decoder reports its step and offset.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseTFMXFile } from '@/lib/import/formats/TFMXParser';
import { tfmxGridPositionAt } from '@/engine/tfmx/tfmxPlayPosition';

const bytes = readFileSync('public/data/songs/formats/mdat.turrican_bonus');
const song = parseTFMXFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, 'mdat.turrican_bonus');

describe('TFMX: the grid follows the decoder position (mdat.turrican_bonus)', () => {
  it('every grid command cell is found at its own pattern and row from the step and offset the decoder reports', () => {
    const layout = song.uadePatternLayout!;
    const native = song.tfmxNative!;
    const gridSteps = native.gridSteps;
    const rowCount = (p: number) => song.patterns[p]?.length ?? 0;
    expect(gridSteps.length).toBe(song.patterns.length);
    expect(new Set(gridSteps).size, 'one grid pattern per trackstep').toBe(gridSteps.length);

    let checked = 0;
    let lastPattern = -1;
    for (let p = 0; p < song.patterns.length; p++) {
      expect(gridSteps[p], `grid pattern ${p} shows a trackstep`).toBeGreaterThanOrEqual(0);
      for (let row = 0; row < rowCount(p); row++) {
        for (let ch = 0; ch < layout.numChannels; ch++) {
          const offset = layout.getCellFileOffset!(p, row, ch);
          if (offset < 0) continue;
          // the step the grid pattern stands for really plays this command on this voice (independent of gridSteps' own order)
          const step = native.tracksteps.find((t) => t.stepIndex === gridSteps[p])!;
          const voice = step.voices[ch];
          expect(native.patterns[voice.patternNum]?.some((c) => c.fileOffset === offset), `step ${gridSteps[p]} voice ${ch} plays offset ${offset}`).toBe(true);
          const at = tfmxGridPositionAt(layout, gridSteps, native.gridRowTicks, rowCount, gridSteps[p], offset, -1);
          expect(at, `pattern ${p} row ${row} voice ${ch}`).toEqual({ pattern: p, row });
          checked++;
          lastPattern = p;
        }
      }
    }
    // the scroll reaches the song's last grid pattern (it used to stop part way)
    expect(lastPattern).toBe(song.patterns.length - 1);
    expect(checked).toBeGreaterThan(song.patterns.length);
  });

  it('a step the grid does not show, or an offset that is no command of it, holds the grid still', () => {
    const layout = song.uadePatternLayout!;
    const gridSteps = song.tfmxNative!.gridSteps;
    const rowCount = (p: number) => song.patterns[p]?.length ?? 0;
    expect(tfmxGridPositionAt(layout, gridSteps, song.tfmxNative!.gridRowTicks, rowCount, -5, 0, -1)).toBeNull();
    expect(tfmxGridPositionAt(layout, gridSteps, song.tfmxNative!.gridRowTicks, rowCount, gridSteps[0], 0x7fffffff, -1)).toBeNull();
  });

  // Owner 2026-11-03: "whould the individual channels scroll separately in tfmx or why is it acting weird?"
  // Rows were command indexes per voice, so row N was a different moment on each voice and one cursor
  // could only be right for one voice. Rows are now pattern ticks: a command sits on the tick it plays.
  it('a grid row is the same pattern tick on every voice: each command sits on the tick the decoder plays it', () => {
    const layout = song.uadePatternLayout!;
    const native = song.tfmxNative!;
    const buf = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // Decoder rule, written out here (Chris/Pattern.cpp): Note+wait 0x7F..0xBF holds ee + 1 ticks, F3 holds bb + 1.
    const holds = (o: number) => (buf[o] >= 0x7f && buf[o] < 0xc0 ? buf[o + 3] + 1 : buf[o] === 0xf3 ? buf[o + 1] + 1 : 0);
    let compared = 0;
    for (let p = 0; p < song.patterns.length; p++) {
      const ticks = native.gridRowTicks[p];
      expect(ticks.length).toBe(song.patterns[p].length);
      for (let r = 1; r < ticks.length; r++) expect(ticks[r]).toBeGreaterThanOrEqual(ticks[r - 1]);
      const step = native.tracksteps.find((t) => t.stepIndex === native.gridSteps[p])!;
      for (let ch = 0; ch < layout.numChannels; ch++) {
        const voice = step.voices[ch];
        if (!voice || voice.isStop || voice.isHold) continue;
        let tick = 0;
        let row = 0;
        for (const cmd of native.patterns[voice.patternNum] ?? []) {
          while (row < ticks.length && layout.getCellFileOffset!(p, row, ch) !== cmd.fileOffset) row++;
          expect(row, `step ${step.stepIndex} voice ${ch} shows offset ${cmd.fileOffset}`).toBeLessThan(ticks.length);
          expect(ticks[row], `step ${step.stepIndex} voice ${ch} offset ${cmd.fileOffset}`).toBe(tick);
          tick += holds(cmd.fileOffset);
          compared++;
        }
      }
    }
    expect(compared).toBeGreaterThan(song.patterns.length * 4);
  });

  it('while a voice waits on a note, the cursor moves down the ticks of that wait', () => {
    const layout = song.uadePatternLayout!;
    const native = song.tfmxNative!;
    const rowCount = (p: number) => song.patterns[p]?.length ?? 0;
    let checked = 0;
    for (let p = 0; p < song.patterns.length && checked < 50; p++) {
      const ticks = native.gridRowTicks[p];
      for (let row = 0; row < ticks.length; row++) {
        const offset = layout.getCellFileOffset!(p, row, 0);
        if (offset < 0) continue;
        let next = row + 1;
        while (next < ticks.length && layout.getCellFileOffset!(p, next, 0) < 0) next++;
        const duration = next < ticks.length ? ticks[next] - ticks[row] : 0;
        if (duration < 3) continue;
        // decoder wait counts down duration - 1 .. 0 while the voice holds this command
        for (let wait = duration - 1; wait >= 0; wait--) {
          const at = tfmxGridPositionAt(layout, native.gridSteps, native.gridRowTicks, rowCount, native.gridSteps[p], offset, wait)!;
          expect(at.pattern).toBe(p);
          expect(ticks[at.row], `pattern ${p} row ${row} wait ${wait}`).toBe(ticks[row] + duration - 1 - wait);
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });
});
