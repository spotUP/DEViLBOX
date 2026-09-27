/**
 * A DefleMask Genesis song's PSG instruments.
 *
 * Furnace's STD instrument type has no chip of its own in the importer's
 * type map, so every STD instrument became a generic Tone.js ChipSynth: its
 * preview played a square wave at +4 dB (peaking above full scale) instead of
 * the song's SN76489. Its "Legacy Samples" instrument (a sample type whose
 * samples belong to the module) became a Sampler with no sample, and
 * previewed as silence. Each instrument now becomes the synth of the chip
 * that plays it, on the channel Furnace itself previews it on.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { installFurnaceFileOpsWasm, readSong } from './furnaceFileOpsWasmHarness';

describe('importing a DefleMask Genesis song', { timeout: 60000 }, () => {
  beforeAll(installFurnaceFileOpsWasm);

  it('makes its STD instruments SN76489 instruments, not generic ChipSynths', async () => {
    const { parseFurnaceFile } = await import('../parsers/FurnaceToSong');
    const song = await parseFurnaceFile(readSong('deflemask/220hertz/Andrew_haggles.dmf'), 'Andrew_haggles.dmf');
    const byName = Object.fromEntries(song.instruments.map((i) => [i.name, i.synthType]));
    expect(byName['Ins 4']).toBe('FurnacePSG');
    expect(byName['Ins 5']).toBe('FurnacePSG');
    expect(byName['Church Organ']).toBe('FurnaceOPN');         // FM stays FM
    expect(song.instruments.some((i) => i.synthType === 'ChipSynth')).toBe(false);
  });

  it('plays its "Legacy Samples" instrument on the YM2612 DAC, not as a Sampler with no sample', async () => {
    const { parseFurnaceFile } = await import('../parsers/FurnaceToSong');
    const song = await parseFurnaceFile(readSong('deflemask/220hertz/Andrew_haggles.dmf'), 'Andrew_haggles.dmf');
    const legacy = song.instruments.find((i) => i.name === 'Legacy Samples')!;
    expect(legacy.synthType).toBe('FurnaceOPN');
    expect(legacy.furnace?.previewChannel).toBe(5);             // FM6, the DAC channel
    // The PSG instruments preview on the SN76489's first channel.
    expect(song.instruments.find((i) => i.name === 'Ins 4')!.furnace?.previewChannel).toBeUndefined();
  });
});
