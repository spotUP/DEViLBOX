/**
 * David Whittaker frame skip: apb.dw skips frames (extra counter 5/6, delay counter), so a note's 50 Hz frame tick
 * is not a multiple of the song speed. The walk counts processed ticks (the ticks the player did not skip), and on
 * those every note gap is a whole number of song steps. Fails when the counter counts frames (82 of 130 gaps off).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { walkDavidWhittaker, DW_WALK } from '../formats/DavidWhittakerWasmExtractor';
import { parseDavidWhittakerFile } from '../formats/DavidWhittakerParser';
import { installDwNodeFetch } from './helpers/dwNodeFetch';

let restore = () => {};
beforeAll(() => { restore = installDwNodeFetch(); });
afterAll(() => restore());

describe('David Whittaker processed ticks (apb.dw)', () => {
  it('every gap between a voice\'s note starts is a multiple of the song speed in processed ticks', async () => {
    const f = readFileSync(resolve(process.cwd(), 'public/data/songs/formats/apb.dw'));
    const ab = f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer;
    const walk = await walkDavidWhittaker(ab.slice(0), 60_000, 0);
    expect(walk.speed).toBe(3);
    expect(walk.tickRate.num / walk.tickRate.den, 'the player skips frames').toBeLessThan(1);
    expect(walk.processedTicks).toBeLessThan(walk.ticks);
    let gaps = 0, frameOff = 0;
    for (let c = 0; c < walk.channels; c++) {
      const notes = walk.events.filter((e) => e.channel === c && e.kind === DW_WALK.note);
      for (let i = 1; i < notes.length; i++) {
        gaps++;
        expect((notes[i].ptick - notes[i - 1].ptick) % walk.speed, `voice ${c + 1} gap ${i}`).toBe(0);
        if ((notes[i].tick - notes[i - 1].tick) % walk.speed !== 0) frameOff++;
      }
    }
    expect(gaps).toBeGreaterThan(0);
    expect(frameOff, 'frame ticks alone do not line up on the step').toBeGreaterThan(0);
  });

  it('the grid tempo carries the skip: initialBPM = 125 * num / den, speed = the module\'s', async () => {
    const f = readFileSync(resolve(process.cwd(), 'public/data/songs/formats/apb.dw'));
    const ab = f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer;
    const walk = await walkDavidWhittaker(ab.slice(0), 60_000, 0);
    const song = await parseDavidWhittakerFile(ab.slice(0), 'apb.dw', 0, 0);
    expect(song.initialSpeed).toBe(walk.speed);
    expect(song.initialBPM).toBeCloseTo((125 * walk.tickRate.num) / walk.tickRate.den, 6);
    expect(song.initialBPM).not.toBe(125);
  });
});
