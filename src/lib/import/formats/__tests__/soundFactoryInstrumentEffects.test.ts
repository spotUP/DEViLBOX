/**
 * Sound Factory instrument effects (goldrunner.psf): parse exposes the DefineInstr flags and parameters in
 * metadata; an edit goes through exportSoundFactory (the product's export entry point) into the record bytes,
 * and a reparse shows the new values with every other byte untouched. The sentinel proves the patch ran.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { parseSoundFactoryWithEffects } from '../SoundFactoryParser';
import { exportSoundFactory } from '@/lib/export/SoundFactoryExporter';
import { SF_FLAG, SF_INSTR_HEADER_SIZE, sfInstrumentPatchStats, type SfInstrParams } from '../soundFactoryInstrumentParams';

const bytes = new Uint8Array(readFileSync('public/data/songs/formats/goldrunner.psf'));
const paramsOf = (song: { instruments: Array<{ metadata?: { soundFactoryInstrument?: { params: Record<string, number>; recordOffset: number } } }> }, i: number) =>
  song.instruments[i].metadata!.soundFactoryInstrument!;

describe('Sound Factory instrument effects', () => {
  it('shows the record flags and parameters, and an edit reaches the exported record bytes', async () => {
    const song = parseSoundFactoryWithEffects(bytes, 'goldrunner.psf')!.song;
    const m = paramsOf(song, 1);
    expect(m.params.effectByte).toBe(0x52); // vibrato, portamento, tremolo
    expect(m.params.portamentoStep).toBe(8);
    expect(m.params.portamentoSpeed).toBe(3);
    expect(m.params.vibratoDelay).toBe(23);
    expect(m.params.vibratoSpeed).toBe(1);
    expect(m.params.vibratoStep).toBe(2);
    expect(m.params.vibratoAmount).toBe(2);
    expect(bytes[m.recordOffset + 4]).toBe(0x52);

    const before = sfInstrumentPatchStats.bytes;
    const p = m.params as unknown as SfInstrParams;
    p.vibratoSpeed = 9;
    p.effectByte &= ~SF_FLAG.tremolo;
    const out = new Uint8Array(await (await exportSoundFactory(song)).data.arrayBuffer());
    expect(sfInstrumentPatchStats.bytes - before).toBe(2); // sentinel: the patch ran and changed exactly two bytes

    expect(out.length).toBe(bytes.length);
    const diff: number[] = [];
    bytes.forEach((b, i) => { if (out[i] !== b) diff.push(i); });
    expect(diff).toEqual([m.recordOffset + 4, m.recordOffset + 13]);
    const re = paramsOf(parseSoundFactoryWithEffects(out, 'goldrunner.psf')!.song, 1);
    expect(re.params.vibratoSpeed).toBe(9);
    expect(re.params.effectByte).toBe(0x12);
    expect(SF_INSTR_HEADER_SIZE).toBe(34);
  });
});
