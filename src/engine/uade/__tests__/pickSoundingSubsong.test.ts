/**
 * The reference render's empty-subsong rule (eco.gray, FredGray: subsong 0 ends
 * at once). The ADF glue steps on by the same one-second rule, so both must
 * land on the first subsong that lasts a second.
 */
import { describe, expect, it } from 'vitest';
import { pickSoundingSubsong } from '../../../../tools/uade-audit/uadeRenderCore';

const frames: Record<number, number> = { 0: 0, 1: 44099, 2: 441000, 3: 441000 };
const render = (s: number) => ({ s, frames: frames[s] });

describe('pickSoundingSubsong', () => {
  it('skips subsongs that end inside the first second', () => {
    expect(pickSoundingSubsong(0, 3, 44100, render)?.s).toBe(2);
  });
  it('honours a minimum above 0', () => {
    expect(pickSoundingSubsong(3, 3, 44100, render)?.s).toBe(3);
  });
  it('returns undefined when no subsong lasts a second', () => {
    expect(pickSoundingSubsong(0, 1, 44100, render)).toBeUndefined();
  });
});
