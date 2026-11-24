// Shared Audio-RAM budget: Breezy.fur is over until its samples are resampled, 64kb.fur fits as is.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseFurnaceSong, toSequencerSamples, buildFurnaceNativeData } from '@/lib/import/formats/FurnaceSongParser';
import { convertToInstrument } from '@/lib/import/InstrumentConverter';
import { furnaceMacrosForConverter } from '@/lib/import/parsers/FurnaceToSong';
import type { ParsedInstrument } from '@/types/tracker';
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
      ? module.instruments.map((i, n) => {
        // the browser's load path: INS2 macros through the FurnaceToSong mapper, then convertToInstrument
        const parsed = {
          id: n + 1, name: i.name, samples: [], fadeout: 0, volumeType: 'none', panningType: 'none',
          furnace: {
            chipType: i.type, synthType: 'ChipSynth', fm: i.fm, macros: furnaceMacrosForConverter(i.macros),
            wavetables: (i.wavetables || []).map((index, wi) => ({ id: wi, data: [], len: 0, max: 0, index })), amiga: i.amiga, chipConfig: { ...(i.snes ? { snes: i.snes } : {}) },
          },
        } as unknown as ParsedInstrument;
        return tadInstrumentFromFurnace(i.name, (convertToInstrument(parsed, n + 1, 'FUR') as unknown as Array<{ furnace?: object }>)[0]?.furnace ?? {});
      })
      : module.instruments.map((i) => tadInstrumentFromFurnace(i.name, i)),
    samples: toSequencerSamples(module), wavetables: module.wavetables,
  }], create as CreateTadCompiler, (f) => resolve('public/tad', f));
}

describe('TAD Audio-RAM budget', () => {
  it('Breezy.fur fits after resampling, 64kb.fur fits as is', async () => {
    const breezy = await build('Breezy.fur');
    expect(breezy.audioRam).not.toBeNull();
    expect(tadAudioRamBudget(breezy.audioRam!).over).toBe(false);
    expect(breezy.warnings.some((w) => w.includes('to fit the SNES Audio-RAM; pitch kept'))).toBe(true);
    const small = await build('64kb.fur');
    expect(small.audioRam).not.toBeNull();
    expect(tadAudioRamBudget(small.audioRam!).over).toBe(false);
    expect(small.warnings.some((w) => w.includes('to fit the SNES Audio-RAM'))).toBe(false);
    expect(TAD_DRIVER_BYTES).toBe(4584);
    expect(TAD_MAX_COMMON_DATA_BYTES).toBe(60568);
  }, 300000);

  it('live store instruments give the same Audio-RAM rows as the parser instruments', async () => {
    const parsed = await build('Breezy.fur');
    const live = await build('Breezy.fur', true);
    expect(live.audioRam).toEqual(parsed.audioRam);
    expect(tadAudioRamBudget(live.audioRam!).over).toBe(false);
    expect(tadAudioRamBudget((await build('64kb.fur', true)).audioRam!).over).toBe(false);
  }, 300000);
});
