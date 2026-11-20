// MDSDRV converter: header bytes, command encoding, and a decode round-trip.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFurnaceSong } from '../../import/formats/FurnaceSongParser';
import { furnaceToMds } from '../md/mdsSong';

const ROOT = join(__dirname, '../../../..');
const ARG1 = new Set([0xe1, 0xe2, 0xe4, 0xe6, 0xe8, 0xe9, 0xea, 0xeb, 0xf9, 0xfb]);

async function convert(name: string) {
  const fur = readFileSync(join(ROOT, 'public/data/songs/furnace/genesis', name));
  return furnaceToMds(await parseFurnaceSong(fur.buffer.slice(fur.byteOffset, fur.byteOffset + fur.length)));
}

/** Test-only decoder: walks one pass of every track (subroutines followed, stops at the loop jump). */
function decode(seq: Uint8Array): { ch: number; tick: number; n: number }[] {
  const sd = seq.subarray(8);
  const w = (o: number) => (sd[o] << 8) | sd[o + 1];
  const bgm = (w(4) << 16) | w(6);
  const tbase = bgm + w(bgm);
  const out: { ch: number; tick: number; n: number }[] = [];
  for (let i = 0; i < sd[bgm + 3]; i++) {
    const ch = sd[bgm + 4 + i * 4];
    let tick = 0, trs = 0;
    const walk = (p: number): boolean => {
      for (;;) {
        const c = sd[p++];
        if (c < 0x80) tick += c + 1;
        else if (c === 0x81) tick += sd[p++] + 1;
        else if (c >= 0x82 && c < 0xe0) { out.push({ ch, tick, n: c - 0x82 + trs }); tick += sd[p++] + 1; }
        else if (c === 0xfe) { if (!walk(tbase + ((w(tbase + sd[p++] * 2) << 16) >> 16))) return false; }
        else if (c === 0xfb || c === 0xff) return c === 0xff;
        else if (c === 0xfa) continue;
        else if (c === 0xe4) trs = (sd[p++] << 24) >> 24;
        else if (ARG1.has(c)) p++;
        else throw new Error(`unknown command ${c.toString(16)} on track ${i}`);
      }
    };
    walk(tbase + w(bgm + 6 + i * 4));
  }
  return out;
}

const key = (k: { ch: number; tick: number; n: number }) => `${k.tick}:${k.ch}:${k.n}`;

describe('furnaceToMds', () => {
  for (const name of ['Fancy_Promenard.fur', 'Puyopuyo~n_DopplegangerArle-TsuuStyle.fur']) {
    it(`${name}: header, frame-tick command, decode round-trip`, async () => {
      const s = await convert(name);
      expect([...s.seq.subarray(0, 8)]).toEqual([0x10, 0x01, 0x1f, 0x00, 0x00, 0x03, 0x00, 0x02]);
      expect([...s.seq.subarray(8, 12)]).toEqual([0, 0, 0, 8]); // pcm_tab at sdtop+8
      expect(s.seq.length % 2).toBe(0);
      const want = s.keyOns.map((k) => ({ ...k, note: k.ch === 9 && k.note + 60 > 153 ? 119 : Math.max(0, Math.min(0xdf - 0x82, k.note)) })) // noise above 153: snNoLowPeriods period 1 = key 119 via E4 transpose
        .map((k) => key({ ch: k.ch, tick: k.tick, n: k.note })).sort();
      const got = decode(s.seq).map(key).sort();
      expect(want.length).toBeGreaterThan(50);
      expect(got).toEqual(want);
    });
  }

  it('Fancy_Promenard: PSG1 and PSG2 keys write the period Furnace writes, PSG volume is the raw attenuation', async () => {
    const s = await convert('Fancy_Promenard.fur');
    // PSG3 carries the noise rate here (period 1), so only PSG1 and PSG2 are tone channels. MDSDRV mds_psg_freq_tab; Furnace 0.6.8.3 sms.cpp: period = clock / (27.5 Hz * 2^((note+3)/12)) / toneDivider 64, note = Furnace note value.
    const TAB = [1710, 1614, 1524, 1438, 1357, 1281, 1209, 1141, 1077, 1017, 960, 906];
    const tones = decode(s.seq).filter((k) => (k.ch === 6 || k.ch === 7) && k.n >= 12);
    expect(tones.length).toBeGreaterThan(50);
    // The key is the Furnace note value itself, so the period check below is against Furnace's note.
    expect(new Set(tones.map((k) => k.n))).toEqual(new Set(s.keyOns.filter((k) => (k.ch === 6 || k.ch === 7) && k.note >= 12).map((k) => k.note)));
    for (const { n } of tones) {
      const fur = Math.round(3579545 / (27.5 * 2 ** ((n + 3) / 12)) / 64);
      expect(Math.abs((TAB[n % 12] >> Math.floor(n / 12)) - fur)).toBeLessThanOrEqual(1);
    }
    // Volume 12 must be E2 $8c (attenuation 3, added to the envelope like VOL_SCALE_LOG), not the MML scale.
    const hex = Buffer.from(s.seq).toString('hex');
    expect(hex).toContain('e28c');
  });
});
