import { describe, expect, it } from 'vitest';
import { pitchedNoiseNote } from '../banjoSong';

type Mod = Parameters<typeof pitchedNoiseNote>[0];
const note = (flags: string, nv: number) => pitchedNoiseNote({ chipFlags: [flags], tuning: 440 } as Mod, false, 0, 0)(nv);

describe('Banjo pitched noise divider follows the Furnace chip type (sms.cpp setFlags)', () => {
  it('SN94624 / SN76494 (chipType 8, 9; TI-99/4A songs) take the TI divider, not the Sega one', () => {
    for (const nv of [24, 36, 41, 48]) {
      expect(note('chipType=8\nclockSel=6\n', nv)).toBe(note('chipType=1\n', nv));
      expect(note('chipType=9\n', nv)).toBe(note('chipType=1\n', nv));
      // 64 / 60 is 112 cents: the TI song's periodic-noise bass is a semitone below the Sega mapping.
      expect(note('chipType=8\n', nv)).toBe(note('chipType=0\n', nv) - 1);
    }
  });
  it('Game Gear (chipType 3) keeps the Sega divider', () => {
    for (const nv of [24, 36, 48]) expect(note('chipType=3\n', nv)).toBe(note('', nv));
  });
});
