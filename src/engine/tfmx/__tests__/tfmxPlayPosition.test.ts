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
          const at = tfmxGridPositionAt(layout, gridSteps, rowCount, gridSteps[p], offset);
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
    expect(tfmxGridPositionAt(layout, gridSteps, rowCount, -5, 0)).toBeNull();
    expect(tfmxGridPositionAt(layout, gridSteps, rowCount, gridSteps[0], 0x7fffffff)).toBeNull();
  });
});
