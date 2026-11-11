import { describe, it, expect } from 'vitest';
import { SYSTEM_PRESETS, DivChanType } from '@constants/systemPresets';
import {
  CHIP_SPECS, chipLayout, chipChannelsOfKind, kindOfChipChannel, checkNoteVoiceKind,
} from '../chipVoiceKinds';
import { DIV_INS_FM, DIV_INS_AY, DIV_INS_ADPCMA, DIV_INS_ADPCMB, DIV_INS_OPL, DIV_INS_MULTIPCM } from '@lib/export/FurnaceInstrumentEncoder';

const NOTE = 61;
const inst = (synthType: string, divInsType?: number) => ({ synthType, furnace: { divInsType } }) as never;

describe('chip voice kinds, read from the channel layout', () => {
  it('every chip spec covers every channel of its layout with exactly one kind', () => {
    for (const spec of CHIP_SPECS) {
      const layout = chipLayout(spec);
      layout.forEach((_, i) => {
        const owners = spec.kinds.filter((k) => k.takes(layout[i]));
        expect(owners.length, `${spec.synthType} channel ${i}`).toBe(1);
        expect(kindOfChipChannel(spec, i)).toBe(owners[0]);
      });
    }
  });

  it('every covered chip is a mixed-kind preset', () => {
    for (const spec of CHIP_SPECS) {
      const preset = SYSTEM_PRESETS.find((p) => p.id === spec.presetId)!;
      expect(new Set(preset.channelDefs.map((d) => d.type)).size, spec.presetId).toBeGreaterThan(1);
    }
  });

  it('the Neo Geo layouts: YM2610 has FM 0-3, SSG 4-6, ADPCM-A 7-12, ADPCM-B 13', () => {
    const spec = CHIP_SPECS.find((s) => s.synthType === 'FurnaceOPNB')!;
    const of = (id: string) => chipChannelsOfKind(spec, spec.kinds.find((k) => k.id === id)!);
    expect(of('fm')).toEqual([0, 1, 2, 3]);
    expect(of('ssg')).toEqual([4, 5, 6]);
    expect(of('adpcma')).toEqual([7, 8, 9, 10, 11, 12]);
    expect(of('adpcmb')).toEqual([13]);
  });
});

describe('checkNoteVoiceKind', () => {
  // [chip, instrument type, a channel that refuses it, a channel that takes it]
  const cases: Array<[string, number, number, number]> = [
    ['FurnaceOPNB', DIV_INS_FM, 4, 0],
    ['FurnaceOPNB', DIV_INS_AY, 0, 5],
    ['FurnaceOPNB', DIV_INS_ADPCMA, 0, 8],
    ['FurnaceOPNB', DIV_INS_ADPCMB, 7, 13],
    ['FurnaceOPNBB', DIV_INS_FM, 6, 5],
    ['FurnaceOPNBB', DIV_INS_ADPCMA, 3, 10],
    ['FurnaceOPNA', DIV_INS_FM, 6, 2],
    ['FurnaceOPNA', DIV_INS_AY, 0, 7],
    ['FurnaceOPNA', DIV_INS_ADPCMA, 0, 10],
    ['FurnaceOPNA', DIV_INS_ADPCMB, 0, 15],
    ['FurnaceOPN2203', DIV_INS_FM, 3, 1],
    ['FurnaceOPN2203', DIV_INS_AY, 0, 4],
    ['FurnaceY8950', DIV_INS_OPL, 9, 4],
    ['FurnaceY8950', DIV_INS_ADPCMB, 0, 9],
    ['FurnaceOPL4', DIV_INS_OPL, 18, 3],
    ['FurnaceOPL4', DIV_INS_MULTIPCM, 0, 20],
  ];
  it.each(cases)('%s instrument type %i: refused on channel %i, written on channel %i', (synth, type, bad, good) => {
    const refused = checkNoteVoiceKind(inst(synth, type), bad, NOTE);
    expect(refused.ok).toBe(false);
    expect(checkNoteVoiceKind(inst(synth, type), good, NOTE)).toEqual({ ok: true });
  });

  it('the error names the instrument kind and the channels that take it, 1-based and 0-based', () => {
    const r = checkNoteVoiceKind(inst('FurnaceOPNB', DIV_INS_FM), 4, NOTE);
    expect(r).toMatchObject({ ok: false });
    const text = (r as { error: string }).error;
    expect(text).toContain('Channel 5 (index 4) plays SSG');
    expect(text).toContain('FM voice');
    expect(text).toContain('channels 1, 2, 3, 4 (indexes 0, 1, 2, 3)');
  });

  it('a sample instrument plays on an ADPCM channel but an FM instrument does not', () => {
    expect(checkNoteVoiceKind(inst('FurnaceOPNB', 4), 8, NOTE)).toEqual({ ok: true });
    expect(checkNoteVoiceKind(inst('FurnaceOPNB', 4), 13, NOTE)).toEqual({ ok: true });
  });

  it('an instrument with no kind set is the chip FM voice', () => {
    expect(checkNoteVoiceKind(inst('FurnaceOPNB'), 4, NOTE).ok).toBe(false);
    expect(checkNoteVoiceKind(inst('FurnaceOPNB'), 0, NOTE).ok).toBe(true);
  });

  it('an old import with only raw instrument bytes cannot be classified and passes', () => {
    const old = { synthType: 'FurnaceOPNB', furnace: { rawBinaryData: new Uint8Array(4) } } as never;
    expect(checkNoteVoiceKind(old, 4, NOTE)).toEqual({ ok: true });
  });

  it('a tracker channel past the chip width wraps onto the chip channel it plays on', () => {
    expect(checkNoteVoiceKind(inst('FurnaceOPNB', DIV_INS_FM), 14 + 4, NOTE).ok).toBe(false);
    expect(checkNoteVoiceKind(inst('FurnaceOPNB', DIV_INS_FM), 14 + 1, NOTE).ok).toBe(true);
  });

  it('a non-Furnace instrument, note-off, an empty note, no instrument and a live voice pass', () => {
    expect(checkNoteVoiceKind({ synthType: 'Synth' } as never, 4, NOTE).ok).toBe(true);
    expect(checkNoteVoiceKind({ synthType: 'FurnaceOPN' } as never, 4, NOTE).ok).toBe(true);
    expect(checkNoteVoiceKind(inst('FurnaceOPNB', DIV_INS_FM), 4, 97).ok).toBe(true);
    expect(checkNoteVoiceKind(inst('FurnaceOPNB', DIV_INS_FM), 4, 0).ok).toBe(true);
    expect(checkNoteVoiceKind(undefined, 4, NOTE).ok).toBe(true);
    expect(checkNoteVoiceKind(inst('FurnaceOPNB', DIV_INS_FM), 100, NOTE).ok).toBe(true);
  });

  it('the count of mixed-kind presets is measured from the table', () => {
    const mixed = SYSTEM_PRESETS.filter((p) => new Set(p.channelDefs.map((d) => d.type)).size > 1);
    expect(mixed.length).toBe(38);
    expect(DivChanType.PCM).toBeDefined();
  });
});
