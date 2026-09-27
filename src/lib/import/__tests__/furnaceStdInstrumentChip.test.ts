/**
 * A DefleMask Genesis song's PSG instruments.
 *
 * Furnace's STD instrument type has no chip of its own in the importer's
 * type map, so every STD instrument became a generic Tone.js ChipSynth: its
 * preview played a square wave at +4 dB (peaking above full scale) instead of
 * the song's SN76489. The instrument now becomes the synth of the chip that
 * plays it — the chip Furnace itself previews it on.
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
});
