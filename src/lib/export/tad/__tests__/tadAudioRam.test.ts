// Shared Audio-RAM budget: Breezy.fur is over, 64kb.fur fits.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseFurnaceSong, convertFurnaceToDevilbox, toSequencerSamples, buildFurnaceNativeData } from '@/lib/import/formats/FurnaceSongParser';
import { buildTadProject, tadInstrumentFromFurnace } from '../tadProjectBuilder';
import { tadAudioRamBudget, TAD_DRIVER_BYTES, TAD_MAX_COMMON_DATA_BYTES } from '../tadAudioRam';
import type { CreateTadCompiler } from '../tadCompilerWasm';

const DIR = resolve(__dirname, '../../../../../public/data/songs/furnace/snes');
async function build(file: string, live = false) {
  const buf = readFileSync(resolve(DIR, file));
  const module = await parseFurnaceSong(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  // @ts-expect-error generated JS module
  const { default: create } = await import('../../../../../public/tad/tad-compiler.js');
  return buildTadProject([{
    title: module.name || file, native: buildFurnaceNativeData(module),
    // live = the instruments as the store holds them after import (what the export dialog reads)
    instruments: live
      ? convertFurnaceToDevilbox(module).instruments.map((i) => tadInstrumentFromFurnace(i.name, (i as { furnace?: object }).furnace ?? {}))
      : module.instruments.map((i) => tadInstrumentFromFurnace(i.name, i)),
    samples: toSequencerSamples(module), wavetables: module.wavetables,
  }], create as CreateTadCompiler, (f) => resolve('public/tad', f));
}

describe('TAD Audio-RAM budget', () => {
  it('Breezy.fur is over, 64kb.fur fits', async () => {
    const breezy = await build('Breezy.fur');
    expect(breezy.audioRam).not.toBeNull();
    const b = tadAudioRamBudget(breezy.audioRam!);
    expect(b.over).toBe(true);
    expect(b.overBytes).toBeGreaterThan(0);
    expect(breezy.warnings.some((w) => w.includes('Over the SNES Audio-RAM budget'))).toBe(true);
    const small = await build('64kb.fur');
    expect(small.audioRam).not.toBeNull();
    expect(tadAudioRamBudget(small.audioRam!).over).toBe(false);
    expect(TAD_DRIVER_BYTES).toBe(4584);
    expect(TAD_MAX_COMMON_DATA_BYTES).toBe(60568);
  }, 300000);

  it('live store instruments give the same Audio-RAM rows as the parser instruments', async () => {
    const parsed = await build('Breezy.fur');
    const live = await build('Breezy.fur', true);
    expect(live.audioRam).toEqual(parsed.audioRam);
    expect(tadAudioRamBudget(live.audioRam!).over).toBe(true);
    expect(tadAudioRamBudget((await build('64kb.fur', true)).audioRam!).over).toBe(false);
  }, 300000);
});
