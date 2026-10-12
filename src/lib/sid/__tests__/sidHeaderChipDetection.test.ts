/**
 * SID chip detection from the PSID/RSID header, on real HVSC files.
 *
 * Bug: secondSID / thirdSID were read from flags bits 6 / 7 (data[0x77] & 0x40 / 0x80),
 * which are the SECOND chip's MODEL bits, not its presence. Presence is the chip
 * address byte (0x7A second, v3+; 0x7B third, v4+; 0 = no chip). A 3SID tune whose
 * extra chips are 6581s (flags 0x0154) read as 2 chips; an 8580 3SID (flags 0x02A4)
 * read as "third chip without a second".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSIDHeader } from '../SIDHeaderParser';

const fixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, 'fixtures', name)));

describe('SID header chip detection (real HVSC files)', () => {
  it('a single 6581 tune is one 6581 chip (Rob Hubbard, Commando)', () => {
    const h = parseSIDHeader(fixture('Commando.sid'))!;
    expect(h.chipModel).toBe('6581');
    expect(h.clockSpeed).toBe('PAL');
    expect([h.chipCount, h.secondSID, h.thirdSID]).toEqual([1, false, false]);
    expect(h.chipModels).toEqual(['6581']);
  });

  it('a single 8580 RSID tune is one 8580 chip (LMan, Venus Falling SCC Extended)', () => {
    const h = parseSIDHeader(fixture('Venus_Falling_SCC_Extended.sid'))!;
    expect(h.format).toBe('RSID');
    expect(h.chipModel).toBe('8580');
    expect(h.chipCount).toBe(1);
  });

  it('a 2SID tune is two chips (Sparkster - Lakeside 2SID, second chip at $D500)', () => {
    const h = parseSIDHeader(fixture('Sparkster-Lakeside_2SID.sid'))!;
    expect([h.chipCount, h.secondSID, h.thirdSID]).toEqual([2, true, false]);
    expect(h.chipModels).toEqual(['6581', '6581']);
  });

  it('a 3SID tune on 6581s is three chips, not two (Devils ReSIDence 3SID)', () => {
    const h = parseSIDHeader(fixture('Devils_ReSIDence_3SID.sid'))!;
    expect([h.chipCount, h.secondSID, h.thirdSID]).toEqual([3, true, true]);
    expect(h.chipModels).toEqual(['6581', '6581', '6581']);
  });

  it('a 3SID tune on 8580s has a second chip (Arcade Memories 3SID)', () => {
    const h = parseSIDHeader(fixture('Arcade_Memories_3SID.sid'))!;
    expect(h.chipModel).toBe('8580');
    expect([h.chipCount, h.secondSID, h.thirdSID]).toEqual([3, true, true]);
    expect(h.chipModels).toEqual(['8580', '8580', '8580']);
  });
});
