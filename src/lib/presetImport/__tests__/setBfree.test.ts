import { describe, expect, it } from 'vitest';
import * as pgm from '../parsers/setBfree';
import { SETBFREE_LAYOUT } from '@/constants/synthLayouts/setbfree';
import { bytes, expectInsideLayout, expectParseError, filesIn, read } from './helpers';

const sample = `# comment
1 { name="Jazz 1 all", drawbars="888 0000 000", perc=on, percvol=soft, percspeed=fast, percharm=3rd,
    vibrato=c3, vibratoupper=on, overdrive=on, rotaryspeed=chorale, reverbmix=3 }
2 { name="U:Trumpet 8'", drawbarslower=00-6888-654, drawbarspedals=123456780, keysplitlower=60, bogus=1 }
2 { rotaryspeed=tremolo }
3 { drawbars=88 }
`;

describe('setBfree .pgm parser', () => {
  it('sniff accepts programme text and rejects other text', () => {
    expect(pgm.sniff(bytes(sample), 'x.pgm')).toBe(true);
    expect(pgm.sniff(bytes(sample), 'x.txt')).toBe(true);
    expect(pgm.sniff(bytes('<presets/>'), 'x.xml')).toBe(false);
  });

  it('parses programmes: drawbars, vibrato index, percussion words, merging of consecutive definitions, clamping, warnings', () => {
    const presets = pgm.parse(bytes(sample), 'x.pgm');
    expect(presets.map((p) => p.name)).toEqual(['Jazz 1 all', "U:Trumpet 8'", 'Program 3']);
    const a = presets[0].config.setbfree as Record<string, number>;
    expect([a.upper16, a.upper513, a.upper8, a.upper4]).toEqual([8, 8, 8, 0]);
    expect(a).toMatchObject({ percEnable: 1, percVolume: 1, percDecay: 1, percHarmonic: 1, vibratoType: 6, vibratoUpper: 1, overdriveEnable: 1, leslieSpeed: 1, reverbMix: 1 });
    expect(presets[0].warnings.join('\n')).toMatch(/reverbmix: 3 clamped to 1/);
    const b = presets[1].config.setbfree as Record<string, number>;
    expect([b.lower16, b.lower513, b.lower8, b.lower4, b.lower223, b.lower2, b.lower135, b.lower113, b.lower1]).toEqual([0, 0, 6, 8, 8, 8, 6, 5, 4]);
    expect(b.pedal16).toBe(1);
    expect(b.leslieSpeed).toBe(2); // merged from the second "2 { ... }" definition
    const w = presets[1].warnings.join('\n');
    expect(w).toMatch(/keysplitlower: valid setBfree property with no counterpart/);
    expect(w).toMatch(/bogus: unknown setBfree property/);
    expect(presets[2].warnings.join('\n')).toMatch(/drawbars=88: unrecognized value/);
  });

  it('a later definition of an earlier programme number replaces it', () => {
    const presets = pgm.parse(bytes('5 { name=a, perc=on }\n6 { name=b }\n5 { name=c }\n'), 'x.pgm');
    expect(presets.map((p) => p.name)).toEqual(['b', 'c']);
    expect((presets[1].config.setbfree as Record<string, number>).percEnable).toBeUndefined();
  });

  it('mapped values are inside the layout range', () => {
    const [p] = pgm.parse(bytes('1 { drawbars=876543210, drawbarslower=012345678, drawbarspedals=888888888, vibrato=v3, perc=off, rotaryspeed=stop, reverbmix=0.4 }'), 'x.pgm');
    expect(expectInsideLayout(p.config.setbfree as Record<string, number>, SETBFREE_LAYOUT)).toBeGreaterThan(20);
  });

  it('shipped default.pgm and popular.pgm parse (skipped when third-party/setBfree is absent)', () => {
    const files = filesIn('third-party/setBfree/pgm', '.pgm');
    if (files.length === 0) return;
    for (const f of files) {
      const presets = pgm.parse(read(f), f);
      expect(presets.length).toBeGreaterThan(20);
      for (const p of presets) {
        expect(p.warnings.filter((w) => /unknown|unrecognized/.test(w))).toEqual([]);
        expectInsideLayout(p.config.setbfree as Record<string, number>, SETBFREE_LAYOUT);
      }
    }
  });

  it('round trip serialize -> parse keeps the registration and switches', () => {
    const src = { upper16: 8, upper513: 4, upper8: 8, upper4: 0, upper223: 1, upper2: 2, upper135: 3, upper113: 4, upper1: 5, vibratoType: 3, percEnable: 1, percVolume: 0, percDecay: 1, percHarmonic: 0, leslieSpeed: 2, reverbMix: 0.25 };
    const [p] = pgm.parse(pgm.serialize({ setbfree: src }, 'My "Quoted" Name'), 'rt.pgm');
    expect(p.name).toBe('My "Quoted" Name');
    expect(p.config.setbfree).toMatchObject(src);
  });

  it('malformed input throws ParseError', () => {
    expectParseError(() => pgm.parse(bytes('1 { name="open'), 'a.pgm'));
    expectParseError(() => pgm.parse(bytes('1 { name }'), 'a.pgm'));
    expectParseError(() => pgm.parse(bytes('1 name=x'), 'a.pgm'));
    expectParseError(() => pgm.parse(bytes('999 { name=x }'), 'a.pgm'));
    expectParseError(() => pgm.parse(bytes('# only a comment\n'), 'a.pgm'));
    expectParseError(() => pgm.parse(bytes('1 { name=x'), 'a.pgm'));
    expectParseError(() => pgm.parse(new Uint8Array(0), 'a.pgm'));
    expectParseError(() => pgm.parse(bytes('1 { name=@ }'), 'a.pgm'));
  });
});
