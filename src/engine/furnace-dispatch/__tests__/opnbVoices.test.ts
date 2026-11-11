import { describe, it, expect } from 'vitest';
import { SYSTEM_PRESETS } from '@constants/systemPresets';
import {
  OPNB_VOICE_KINDS, opnbKindChannels, opnbFirstChannel, opnbPreviewChannel, opnbVoiceKindOfChannel,
  CHIPTYPE_OPNB, CHIPTYPE_OPNBB, isOpnbChipType,
} from '../opnbVoices';

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

describe('Neo Geo voice kinds follow the systemPresets channel layout', () => {
  it('YM2610: FM 0-3, SSG 4-6, ADPCM-A 7-12, ADPCM-B 13', () => {
    expect(opnbKindChannels(CHIPTYPE_OPNB, 1)).toEqual(range(0, 3));
    expect(opnbKindChannels(CHIPTYPE_OPNB, 6)).toEqual(range(4, 6));
    expect(opnbKindChannels(CHIPTYPE_OPNB, 37)).toEqual(range(7, 12));
    expect(opnbKindChannels(CHIPTYPE_OPNB, 38)).toEqual([13]);
  });
  it('YM2610B: FM 0-5, SSG 6-8, ADPCM-A 9-14, ADPCM-B 15', () => {
    expect(opnbKindChannels(CHIPTYPE_OPNBB, 1)).toEqual(range(0, 5));
    expect(opnbKindChannels(CHIPTYPE_OPNBB, 6)).toEqual(range(6, 8));
    expect(opnbKindChannels(CHIPTYPE_OPNBB, 37)).toEqual(range(9, 14));
    expect(opnbKindChannels(CHIPTYPE_OPNBB, 38)).toEqual([15]);
  });
  it('every chip channel belongs to exactly one kind, and preview channel is the first of its kind', () => {
    for (const [chip, id] of [[CHIPTYPE_OPNB, 'ym2610_full'], [CHIPTYPE_OPNBB, 'ym2610b']] as const) {
      const n = SYSTEM_PRESETS.find((p) => p.id === id)!.channelDefs.length;
      const all = OPNB_VOICE_KINDS.flatMap((k) => opnbKindChannels(chip, k.divInsType));
      expect(all.sort((a, b) => a - b)).toEqual(range(0, n - 1));
      for (const k of OPNB_VOICE_KINDS) {
        expect(opnbPreviewChannel(chip, k.divInsType)).toBe(opnbFirstChannel(chip, k.divInsType));
        for (const c of opnbKindChannels(chip, k.divInsType)) expect(opnbVoiceKindOfChannel(chip, c).id).toBe(k.id);
      }
    }
  });
  it('knows its chip types', () => {
    expect(isOpnbChipType(14)).toBe(true);
    expect(isOpnbChipType(0)).toBe(false);
  });
});
