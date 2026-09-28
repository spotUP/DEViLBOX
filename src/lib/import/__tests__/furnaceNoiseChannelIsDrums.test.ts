/**
 * A chip's noise channel is its drum channel.
 *
 * In a Furnace or DefleMask song the instrument on the noise channel is
 * usually a generic STD instrument that states nothing, and the channel
 * name is empty, so the channel's role came from note statistics - which
 * cannot tell a noise hit from a tone. The chip's own channel definition
 * says which channel is noise; the importer now carries it
 * (channelMeta.furnaceType) and the channel profile reads it.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { installFurnaceFileOpsWasm, readSong } from './furnaceFileOpsWasmHarness';
import { DivChanType } from '@/constants/systemPresets';

describe('a DefleMask Genesis song\'s noise channel', { timeout: 60000 }, () => {
  beforeAll(installFurnaceFileOpsWasm);

  it('is typed on import and profiles as drums', async () => {
    const { parseFurnaceFile } = await import('../parsers/FurnaceToSong');
    const song = await parseFurnaceFile(readSong('deflemask/220hertz/Andrew_haggles.dmf'), 'Andrew_haggles.dmf');
    const types = song.patterns[0].channels.map((c) => c.channelMeta?.furnaceType);
    // YM2612: six FM channels; SN76489: three pulse + one noise.
    expect(types).toEqual([0, 0, 0, 0, 0, 0, 1, 1, 1, 2]);

    const noiseCh = types.indexOf(DivChanType.NOISE);
    const pattern = song.patterns.find((p) => p.channels[noiseCh].rows.some((r) => r.note >= 1 && r.note <= 96))!;
    expect(pattern, 'a pattern where the noise channel plays').toBeDefined();

    const { getChannelProfiles } = await import('@/engine/dub/channelProfiles');
    const instruments = new Map(song.instruments.map((i) => [i.id, i]));
    const profiles = getChannelProfiles(pattern, pattern.channels.map(() => ''), 4, 16, instruments);
    expect(profiles.get(noiseCh)?.instrumentFamily.value).toBe('drums');
  });
});
