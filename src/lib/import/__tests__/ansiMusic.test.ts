import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scanAnsiMusicBlocks, interpretPlay } from '../formats/ansiMusic';

const DIR = resolve(__dirname, 'fixtures/ansi-music');

interface Vec {
  name: string;
  input_hex: string;
  text_hex: string;
  events: { hz: number; ms: number; gate: number; rest: boolean }[];
}
const spec = JSON.parse(readFileSync(resolve(DIR, 'vectors.json'), 'utf8')) as {
  tolerance_ms: number;
  vectors: Vec[];
};

const fromHex = (h: string): Uint8Array => Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16));
const toHex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

describe('ANSI music golden vectors (scan + interpret)', () => {
  it('has 34 vectors', () => expect(spec.vectors.length).toBe(34));
  for (const v of spec.vectors) {
    it(v.name, () => {
      const scan = scanAnsiMusicBlocks(fromHex(v.input_hex));
      const events = scan.blocks.filter((b) => !b.smile).flatMap((b) => interpretPlay(b.payload));
      expect(events.length).toBe(v.events.length);
      v.events.forEach((e, k) => {
        expect(events[k].hz).toBe(e.hz);
        expect(events[k].rest).toBe(e.rest);
        expect(Math.abs(events[k].ms - e.ms)).toBeLessThanOrEqual(spec.tolerance_ms);
        expect(Math.abs(events[k].gate - e.gate)).toBeLessThanOrEqual(spec.tolerance_ms);
      });
      expect(toHex(scan.text)).toBe(v.text_hex);
    });
  }
});

describe('ANSI music real fixtures', () => {
  const scan = (f: string) => scanAnsiMusicBlocks(new Uint8Array(readFileSync(resolve(DIR, f))));
  it('MUSIC_pavt199.ANS: 1 block', () => expect(scan('MUSIC_pavt199.ANS').blocks.length).toBe(1));
  it('!ANSIMUS.ANS: 4 blocks', () => expect(scan('!ANSIMUS.ANS').blocks.length).toBe(4));
  it('RELIGIOU.MUS: 52 blocks, none void, all play', () => {
    const s = scan('RELIGIOU.MUS');
    expect(s.blocks.length).toBe(52);
    expect(s.blocks.every((b) => !b.smile && interpretPlay(b.payload).length > 0)).toBe(true);
  });
  it('ANSIPL20_INTRO.ANS: 23 blocks, 22 SMILE', () => {
    const s = scan('ANSIPL20_INTRO.ANS');
    expect(s.blocks.length).toBe(23);
    expect(s.blocks.filter((b) => b.smile).length).toBe(22);
  });
});
