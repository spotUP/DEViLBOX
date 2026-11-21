// MDSDRV converter: header bytes, command encoding, and a decode round-trip.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFurnaceSong } from '../../import/formats/FurnaceSongParser';
import { furnaceToMds, mdsPsgPitch, portaEnvelope, psgFix, vibratoEnvelope } from '../md/mdsSong';

const ROOT = join(__dirname, '../../../..');
const ARG1 = new Set([0xe1, 0xe2, 0xe4, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xeb, 0xf0, 0xf9, 0xfb]);

async function parse(name: string) {
  const fur = readFileSync(join(ROOT, 'public/data/songs/furnace/genesis', name));
  return parseFurnaceSong(fur.buffer.slice(fur.byteOffset, fur.byteOffset + fur.length));
}
async function convert(name: string) { return furnaceToMds(await parse(name)); }

/** Solar_Man (speed 5) with extra effects on channel 0, order 0, row 0 (a note, instrument 11, volume 116, 08 11). */
async function solarManRow0(fx: Array<{ type: number; value: number }>) {
  const m = await parse('Solar_Man.fur');
  const cell = m.patterns.get(`0_0_${m.subsongs[0].orders[0][0]}`)!.rows[0]!;
  cell.effects = [...(cell.effects ?? []), ...fx];
  return furnaceToMds(m);
}

/** Test-only decoder: walks one pass of every track (subroutines followed, stops at the loop jump). */
function decode(seq: Uint8Array, rests = false): { ch: number; tick: number; n: number }[] {
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
        if (c < 0x80) { if (rests) out.push({ ch, tick, n: -1 }); tick += c + 1; }
        else if (c === 0x81) tick += sd[p++] + 1;
        else if (c >= 0x82 && c < 0xe0) { out.push({ ch, tick, n: c - 0x82 + trs }); tick += sd[p++] + 1; }
        else if (c === 0xfe) { if (!walk(tbase + ((w(tbase + sd[p++] * 2) << 16) >> 16))) return false; }
        else if (c === 0xfb || c === 0xff) return c === 0xff;
        else if (c === 0xfa || c === 0xe0) continue;
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

describe('PSG period rounding', () => {
  it('psgFix makes the driver write the rounded Furnace period (highscorefollin PSG1 note 54: 76, not 75)', () => {
    expect(mdsPsgPitch(54 * 256)).toBe(75);
    expect(mdsPsgPitch(54 * 256 + psgFix(54))).toBe(76);
    expect(mdsPsgPitch(51 * 256 + psgFix(51))).toBe(90);
    for (let k = 9; k <= 84; k++) expect(mdsPsgPitch(k * 256 + psgFix(k)), `key ${k}`).toBe(Math.round(3579545 / (27.5 * 2 ** ((k + 3) / 12)) / 64));
  });
});

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
  it('portaEnvelope: Furnace linear-period 03xx step as one pitch-envelope node per tick, relative to the target (exact bytes)', () => {
    // nv 48 -> 50, xx 3: four ticks of -386, -256, -122, 0 (1/256 semitone), a held 0 node (len 255), jump to it.
    expect(Buffer.from(portaEnvelope(48, 50, 3)).toString('hex')).toBe('fe7e0000ff000000ff860000000000000000' + '00ff7f04');
  });
  it('portaEnvelope: linear-pitch 03xx steps xx * pitchSlideSpeed / 128 semitone per tick, one node per frame at tpf ticks per frame', () => {
    // RubyIllusions / djtBMX (linearPitch 2, pitchSlideSpeed 4): nv 48 -> 50, step 12/128 semitone = 22 ticks; node = 2 * (cur - dest).
    const one = Buffer.from(portaEnvelope(48, 50, 3, true, 12)).toString('hex');
    expect(one.slice(0, 8)).toBe('fe180000');
    expect(one.slice(-4)).toBe('7f16'); // 22 stepping nodes, then the held target node
    const two = Buffer.from(portaEnvelope(48, 50, 3, true, 12, 2)).toString('hex'); // F9 ff: two sequence ticks per frame
    expect(two.slice(0, 8)).toBe('fe300000');
    expect(two.slice(-4)).toBe('7f0b');
  });
  it('Fancy_Promenard: PSG 03xx tone portamento is emitted as slur + per-slide pitch envelope (E0 E8 xx), not the E7 glide', async () => {
    const hex = Buffer.from((await convert('Fancy_Promenard.fur')).seq).toString('hex');
    expect(hex).toMatch(/e0e8[0-9a-f]{2}/);
    expect(hex).not.toMatch(/e0e7/);
  });
  it('Puyopuyo: a pitch macro of n one-tick steps writes node length 0 (the driver holds length+1 ticks, mdsdrv.68k @do_peg)', async () => {
    // ins 2 pitch macro -117,-84,-50,0 (1/128 semitone) = -234,-168,-100,0 in 1/256 semitone; measured in MAME: nodes 2 ticks apart before the fix, 1 tick (Furnace) after.
    const hex = Buffer.from((await convert('Puyopuyo~n_DopplegangerArle-TsuuStyle.fur')).seq).toString('hex');
    expect(hex).toContain('ff160000ff580000ff9c000000000' + '0ff7f03');
  });
  it('golden_shit: linear-pitch 02xx is an extended pitch envelope (slide node, then hold at the clamp), measured 1:1 in MAME', async () => {
    // 02 c0, pitchSlideSpeed 4, tpf 1: delta 2 * -768 = 0xfa00 per frame, 14 frames (len 0d), next node 1 holds at the key-0 limit 0xa800.
    const hex = Buffer.from((await convert('golden_shit.fur')).seq).toString('hex');
    expect(hex).toContain('0000fa000d01a800');
  });
  it('golden_shit: FM voice operators keep Furnace register order (+0,+4,+8,+C), as Furnace genesis.cpp and MDSDRV write them', async () => {
    // FM2 voice, from Furnace's own VGM: DT/MUL 02 04 05 02, KS/AR 1b 1a 8d 18 (the [0,2,1,3] remap wrote 02 05 04 02 / 1b 8d 1a 18).
    const hex = Buffer.from((await convert('golden_shit.fur')).seq).toString('hex');
    expect(hex).toContain('020405021b1a8d18');
    expect(hex).not.toContain('020504021b8d1a18');
  });
  it('vibratoEnvelope: 04 47 is 16 one-frame nodes of 2 * ((7 * vibTable[pos] * 15) >> 4) / 15, first node at pos 4, looping to node 0', () => {
    const env = vibratoEnvelope(0, 4, 7);
    expect(env.length).toBe(16 * 6);
    expect(env.slice(0, 6)).toEqual([0x00, 0x2a, 0, 0, 0, 1]); // vibTable[4] = 48: (7*48*15)>>4 = 315, /15 = 21
    expect(env.slice(15 * 6)).toEqual([0, 0, 0, 0, 0, 0]); // pos 64 = 0, next 0
    expect(env.slice(7 * 6, 7 * 6 + 2)).toEqual([0, 0]); // node 7 = pos 32: vibTable 0
    expect(env.slice(11 * 6, 11 * 6 + 2)).toEqual([0xff, 0x92]); // node 11 = pos 48: vibTable -127, (7*-127*15)>>4 = -834, /15 = -55
  });
  it('highscorefollin: mid-note 04 66 on FM2 (order 0 row 32) is an E8 extended vibrato envelope from pos 0, not lossy', async () => {
    const s = await convert('highscorefollin.fur');
    expect(Buffer.from(s.seq).toString('hex')).toContain(Buffer.from(vibratoEnvelope(0, 6, 6)).toString('hex'));
    expect(s.lossy.some((l) => l.startsWith('effect 04'))).toBe(false);
  });
  it('0Axy: volume slides down one step per tick, row tick included, one E2 per changed tick (Solar_Man FM1, 0A 04)', async () => {
    const s = await solarManRow0([{ type: 0x0a, value: 0x04 }]);
    const hex = Buffer.from(s.seq).toString('hex');
    expect(hex).toContain('e20d8100e20e8100e20f8100e2108100'); // ticks 1..4: volume 114..111 = E2 127-v as ties
    expect(s.lossy.some((l) => l.startsWith('effect 0A'))).toBe(false);
  });
  it('ECxx: key-off xx ticks after the row starts (Solar_Man FM1, EC 02)', async () => {
    const s = await solarManRow0([{ type: 0xec, value: 0x02 }]);
    const ch0 = decode(s.seq, true).filter((e) => e.ch === 0);
    expect(ch0[0]).toMatchObject({ tick: 0, n: s.keyOns[0].note });
    expect(ch0[1]).toEqual({ ch: 0, tick: 2, n: -1 });
    expect(s.lossy.some((l) => l.startsWith('effect EC'))).toBe(false);
  });
  it('EDxx: the row plays xx ticks late (Solar_Man FM1, ED 02)', async () => {
    const base = await solarManRow0([]);
    const s = await solarManRow0([{ type: 0xed, value: 0x02 }]);
    const first = (k: { ch: number; tick: number }[]) => k.find((e) => e.ch === 0)!;
    expect(first(base.keyOns).tick).toBe(0);
    expect(first(s.keyOns).tick).toBe(2);
    expect(first(decode(s.seq)).tick).toBe(2);
    expect(s.lossy.some((l) => l.startsWith('effect ED'))).toBe(false);
  });
  it('portaEnvelope FM: 03 70 takes three steps of 182 Hz then holds the target, 03 20 three steps of 104 Hz (Furnace Fancy_Promenard FM4)', () => {
    const hz = (hex: string) => { // nodes of 4 bytes: signed 1/256 semitone, 0, length
      const b = Buffer.from(hex, 'hex'); const out: number[] = [];
      for (let i = 0; b[i] !== 0x7f; i += 4) out.push(b.readInt16BE(i) / 256);
      return out;
    };
    const a = hz(Buffer.from(portaEnvelope(79, 83, 0x70, true)).toString('hex')).map((st) => 1975.08 * 2 ** (st / 12));
    [1749, 1931, 1975, 1975].forEach((f, i) => expect(Math.abs(a[i] - f)).toBeLessThan(3));
    const b = hz(Buffer.from(portaEnvelope(86, 88, 0x20, true)).toString('hex')).map((st) => 2636.69 * 2 ** (st / 12));
    [2451, 2555, 2637, 2637].forEach((f, i) => expect(Math.abs(b[i] - f)).toBeLessThan(3));
  });
  it('highscorefollin: a dummy-channel 0f conductor dithers F9 7f/80 so 60 Hz ticks stay within a frame of Furnace time, per pass', async () => {
    // Measured in MAME: one F9 7f (59.92 Hz) left every FM channel 40 ms late at 31.6 s (701 cents at note edges from 19.5 s).
    const sd = (await convert('highscorefollin.fur')).seq.subarray(8);
    const w = (o: number) => (sd[o] << 8) | sd[o + 1];
    const bgm = (w(4) << 16) | w(6), n = sd[bgm + 3], last = bgm + 4 + (n - 1) * 4;
    expect(sd[last]).toBe(0x0f);
    let p = bgm + w(bgm) + w(last + 2), tempo = 0x7f, ticks = 0, frames = 0, worst = 0;
    const spans: number[] = [];
    for (let c = sd[p++]; c !== 0xff; c = sd[p++]) {
      if (c === 0xf9) tempo = sd[p++];
      else if (c < 0x80) for (let k = 0; k <= c; k++) { ticks++; frames += 128 / (tempo + 1); worst = Math.max(worst, Math.abs(frames - ticks * 59.922743 / 60)); }
      else if (c === 0xfa || c === 0xfb) { spans.push(frames - ticks * 59.922743 / 60); ticks = frames = 0; if (c === 0xfb) p++; }
      else throw new Error(`conductor command ${c.toString(16)}`);
    }
    expect(worst).toBeLessThan(0.5);
    spans.forEach((e) => expect(Math.abs(e)).toBeLessThan(0.01)); // intro and loop body each balanced: no drift across loop passes
  });
  it('Solar_Man: unhandled vibrato direction (E3 01/02), 05xy, E1xy and E2xy flag lossy through the generic effect flag; E3 00 does not', async () => {
    for (const [type, value, flag] of [[0xe3, 1, 'effect E3'], [0xe3, 2, 'effect E3'], [0x05, 0x01, 'effect 05'], [0xe1, 0x13, 'effect E1'], [0xe2, 0x13, 'effect E2']] as const) {
      expect((await solarManRow0([{ type, value }])).lossy.some((l) => l.startsWith(flag))).toBe(true);
    }
    expect((await solarManRow0([{ type: 0xe3, value: 0 }])).lossy.some((l) => l.startsWith('effect E3'))).toBe(false);
  });
  it('Solar_Man: 0D with no value (order 12 row 31) jumps to row 0, not row -1, so order 13 keys on at tick 4000 (measured 1:1 in MAME)', async () => {
    const s = await convert('Solar_Man.fur');
    expect(s.keyOns.some((k) => k.tick === 4000)).toBe(true);
    expect(s.keyOns.some((k) => k.tick === 4005)).toBe(false);
  });
  it('highscorefollin: the FM6 drum kit map plays MDSDRV PCM (F0 header per sample, signed 8-bit blob at rate 8)', async () => {
    const s = await convert('highscorefollin.fur');
    expect(s.keyOns.some((k) => k.ch === 5)).toBe(true);
    // Kit map C-3 / C#-3 -> bassdrum_thud (5569 @ 22050 Hz) / JK_SNR_01 (6993 @ 26633 Hz), resampled to 17520 Hz, 32-byte aligned.
    expect(s.pcm.length).toBe(Math.ceil((4424 + 32) / 32) * 32 + 4600 + 32);
    expect([...s.seq].some((b, i) => b === 0xf0 && i > 0)).toBe(true);
    // MAME phase 1q: 160 of 160 Furnace 0x95 starts in 40 s get a z_pcm1_key_on request, median +8 ms, so PCM is not lossy.
    expect(s.lossy.some((l) => l.startsWith('FM6'))).toBe(false);
  });
});
