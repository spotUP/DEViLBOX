// MDSDRV converter: header bytes, command encoding, and a decode round-trip.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFurnaceSong } from '../../import/formats/FurnaceSongParser';
import { arpTable, furnaceTickOf, furnaceToMds, Lossy, mdsPsgPitch, furnaceDacGain, furnaceDacTable, pcmDacAtt, pcmDacScale, pcmGain, portaEnvelope, psgEnvelope, pitchEnvelope, psgFix, vibratoEnvelope } from '../md/mdsSong';

const ROOT = join(__dirname, '../../../..');
const ARG1 = new Set([0xe1, 0xe2, 0xe4, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xeb, 0xf0, 0xf9, 0xfb]);

async function parse(name: string) {
  const fur = readFileSync(join(ROOT, 'public/data/songs/furnace/genesis', name));
  return parseFurnaceSong(fur.buffer.slice(fur.byteOffset, fur.byteOffset + fur.length));
}
async function convert(name: string) { return furnaceToMds(await parse(name)); }

/** Solar_Man (speed 5) with extra effects on channel 0, order 0, row 0 (a note, instrument 11, volume 116, 08 11). */
async function solarManRow0(fx: Array<{ type: number; value: number }>, vt?: [number, number]) {
  const m = await parse('Solar_Man.fur');
  if (vt) [m.subsongs[0].virtualTempo, m.subsongs[0].virtualTempoD] = vt;
  const cell = m.patterns.get(`0_0_${m.subsongs[0].orders[0][0]}`)!.rows[0]!;
  cell.effects = [...(cell.effects ?? []), ...fx];
  return furnaceToMds(m);
}

/** Test-only decoder: walks one pass of every track (subroutines followed, stops at the loop jump). */
function decode(seq: Uint8Array, rests = false, slurs = false, onlyCh = -1): { ch: number; tick: number; n: number; s?: 1; peg?: number }[] {
  const sd = seq.subarray(8);
  const w = (o: number) => (sd[o] << 8) | sd[o + 1];
  const bgm = (w(4) << 16) | w(6);
  const tbase = bgm + w(bgm);
  const out: { ch: number; tick: number; n: number; s?: 1; peg?: number }[] = [];
  for (let i = 0; i < sd[bgm + 3]; i++) {
    const ch = sd[bgm + 4 + i * 4];
    if (onlyCh >= 0 && ch !== onlyCh) continue;
    let tick = 0, trs = 0, slur = false, peg = 0, depth = 0;
    const walk = (p: number): boolean => {
      for (;;) {
        const c = sd[p++];
        if (c < 0x80) { if (rests) out.push({ ch, tick, n: -1 }); tick += c + 1; }
        else if (c === 0x81) tick += sd[p++] + 1;
        else if (c >= 0x82 && c < 0xe0) { out.push({ ch, tick, n: c - 0x82 + trs, ...(slurs && slur ? { s: 1 as const } : {}), ...(slurs ? { peg } : {}) }); slur = false; tick += sd[p++] + 1; }
        else if (c === 0xfe) { if (!walk(tbase + ((w(tbase + sd[p++] * 2) << 16) >> 16))) return false; }
        else if (c === 0xfb && depth > 1) { depth--; p++; } // inner counted loop (conductor): one pass
        else if (c === 0xfb || c === 0xff) return c === 0xff;
        else if (c === 0xe0) slur = true; // E0: the next note slurs (no key-on)
        else if (c === 0xfa) depth++;
        else if (c === 0xe4) trs = (sd[p++] << 24) >> 24;
        else if (c === 0xe8) peg = sd[p++]; // slurs: the E8 pitch envelope the note plays
        else if (ARG1.has(c)) p++;
        else throw new Error(`unknown command ${c?.toString(16)} on track ${i}`);
      }
    };
    walk(tbase + ((w(bgm + 6 + i * 4) << 16) >> 16)); // pos is a signed word: streams before the track table sit below tbase
  }
  return out;
}

const key = (k: { ch: number; tick: number; n: number }) => `${k.tick}:${k.ch}:${k.n}`;

/** Conductor (dummy channel 0f) expanded to per-tick F9 values: intro plus `passes` loop passes (inner FA .. FB kk played kk times). */
function conductorTempos(seq: Uint8Array, passes: number): number[] {
  const sd = seq.subarray(8);
  const w = (o: number) => (sd[o] << 8) | sd[o + 1];
  const bgm = (w(4) << 16) | w(6), last = bgm + 4 + (sd[bgm + 3] - 1) * 4;
  expect(sd[last]).toBe(0x0f);
  const tempos: number[] = [];
  let stack: { at: number; left: number }[] = [], tempo = 0x7f;
  for (let p = bgm + w(bgm) + ((w(last + 2) << 16) >> 16); ;) {
    const c = sd[p++];
    if (c === 0xf9) tempo = sd[p++];
    else if (c < 0x80) for (let k = 0; k <= c; k++) tempos.push(tempo);
    else if (c === 0xfa) stack.push({ at: p, left: -1 });
    else if (c === 0xfb) {
      const top = stack[stack.length - 1], kk = sd[p++];
      if (kk === 0) { if (--passes <= 0) break; stack = [stack[0]]; p = stack[0].at; continue; } // outer loop end
      if (top.left < 0) top.left = kk;
      if (--top.left > 0) p = top.at; else stack.pop();
    } else if (c === 0xff) break;
    else throw new Error(`conductor command ${c.toString(16)}`);
  }
  return tempos;
}

describe('PSG period rounding', () => {
  it('psgFix makes the driver write the rounded Furnace period (highscorefollin PSG1 note 54: 76, not 75)', () => {
    expect(mdsPsgPitch(54 * 256)).toBe(75);
    expect(mdsPsgPitch(54 * 256 + psgFix(54))).toBe(76);
    expect(mdsPsgPitch(51 * 256 + psgFix(51))).toBe(90);
    for (let k = 9; k <= 84; k++) expect(mdsPsgPitch(k * 256 + psgFix(k)), `key ${k}`).toBe(Math.round(3579545 / (27.5 * 2 ** ((k + 3) / 12)) / 64));
  });
  it('newer_song_lol PSG1 04 55: psgFix keeps the vibrato nodes on the rounded Furnace period, not one period high', () => {
    const per = (nv: number) => Math.round(3579545 / (27.5 * 2 ** ((nv + 3) / 12)) / 64);
    const env = vibratoEnvelope(0, 5, 5);
    const nodes = Array.from({ length: env.length / 6 }, (_, i) => (((env[i * 6] << 8) | env[i * 6 + 1]) << 16) >> 16);
    // Old rule (smallest |detune| that hits the key's period) as the baseline: one PSG period high on many nodes.
    const edge = (k: number) => { for (let a = 0; a <= 128; a++) for (const d of a ? [-a, a] : [0]) if (mdsPsgPitch(k * 256 + d) === per(k)) return d; return 0; };
    const miss = (fix: (k: number) => number) => { let n = 0; for (let k = 24; k <= 72; k++) for (const w of nodes) if (mdsPsgPitch(k * 256 + fix(k) + w) !== per(k + w / 256)) n++; return n; };
    expect({ before: miss(edge), after: miss(psgFix) }).toEqual({ before: 810, after: 72 });
  });
});

describe('PSG envelope rate', () => {
  // Solar_Man "Hi-Hat Open" volume macro, 26 ticks.
  const hat = [15, 15, 15, 14, 14, 13, 13, 12, 11, 11, 10, 10, 9, 9, 8, 7, 6, 6, 5, 5, 4, 3, 2, 1, 1, 0];
  const ins = { macros: [{ code: 0, type: 0, mode: 0, length: hat.length, data: hat, speed: 1, delay: 0, loop: -1, release: -1 }] } as unknown as Parameters<typeof psgEnvelope>[0];
  const frames = (env: number[]) => env.slice(0, -2).reduce((n, b) => n + (b >> 4), 0);
  it('a 56 Hz macro is resampled to NTSC frames (MDSDRV steps the envelope per VINT): 26 ticks play 28 frames, first node 3 frames at 15', () => {
    const env = psgEnvelope(ins, 184, new Lossy(), 56);
    expect(frames(env)).toBe(28);
    expect(env[0]).toBe(0x30);
    expect(env.slice(-2)).toEqual([0x01, 0x00]);
  });
  it('a per-hit phase starts the table on the Furnace tick the hit lands on (hit at driver frame f0 = Furnace tick k)', () => {
    expect(psgEnvelope(ins, 184, new Lossy(), 56, { f0: 0, k: 0 })[0]).toBe(0x40);
    expect(psgEnvelope(ins, 184, new Lossy(), 56, { f0: 11, k: 10 })[0]).toBe(0x30);
  });
  it('an on-frame (60 Hz) macro keeps one node per tick', () => {
    const env = psgEnvelope(ins, 184, new Lossy());
    expect(frames(env)).toBe(26);
    expect(env.slice(0, 4)).toEqual([0x30, 0x21, 0x22, 0x13]);
  });
});

describe('pitch macro rate', () => {
  // Absolute pitch macro 10 then 20 (1/128 semitone), 13 ticks each, looping from the start.
  const pm = { code: 4, type: 0, mode: 0, length: 2, data: [10, 20], speed: 13, delay: 0, loop: 0, release: -1 } as unknown as Parameters<typeof pitchEnvelope>[0];
  it('a 56 Hz macro is resampled to NTSC frames (@do_peg steps per VINT): 13 ticks play 14 frames', () => {
    expect(pitchEnvelope(pm, new Lossy(), 56)).toEqual([0, 20, 0, 13, 0, 40, 0, 13, 0x7f, 0]);
  });
  it('an on-frame (60 Hz) macro keeps one frame per tick', () => {
    expect(pitchEnvelope(pm, new Lossy())).toEqual([0, 20, 0, 12, 0, 40, 0, 12, 0x7f, 0]);
  });
});

describe('virtual tempo', () => {
  // Furnace runs macros and per-tick effects at s.hz; virtual tempo only moves the row counter (playback.cpp tempoAccum).
  it('Solar_Man at 180/150: PSG envelopes stay resampled from s.hz (56 Hz), the same bytes as without virtual tempo', async () => {
    const m = await parse('Solar_Man.fur');
    const envs = m.instruments.map((ins) => Buffer.from(psgEnvelope(ins, m.version, new Lossy(), m.subsongs[0].hz)).toString('hex'));
    const base = Buffer.from(furnaceToMds(m).seq).toString('hex');
    const used = envs.filter((e) => e.length > 6 && base.includes(e));
    expect(used.length).toBeGreaterThan(0);
    m.subsongs[0].virtualTempo = 180; m.subsongs[0].virtualTempoD = 150;
    const vt = Buffer.from(furnaceToMds(m).seq).toString('hex');
    for (const e of used) expect(vt).toContain(e);
  });
  it('arp mtab holds count sequence ticks: at 72 Hz rows on a 60 Hz engine (spt 1.2) one-tick steps hold 1,1,2,1,1 ticks', () => {
    const am = { code: 1, type: 0, mode: 0, length: 5, data: [0, 12, 7, 0, 12], speed: 1, delay: 0, loop: -1, release: -1 } as unknown as Parameters<typeof arpTable>[0];
    const holds = (t: number[]) => t.filter((_, i) => i % 4 === 3 && i < t.length - 2);
    expect(holds(arpTable(am, new Lossy(), undefined, 1.2)!)).toEqual([0, 0, 1, 0, 0]);
    expect(holds(arpTable(am, new Lossy())!)).toEqual([0, 0, 0, 0, 0]);
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
  it('highscorefollin: a noise arp in PSG3-rate mode steps the PSG3 period like Furnace easy noise (crash 8,6,5,4,3)', async () => {
    // Measured 34.13 s: Furnace crash (arp -5,-3,-2,-1,0, note 70) writes PSG3 periods 8,6,5,4,3; the table's `16 tt` sets t_trs.
    const s = await convert('highscorefollin.fur');
    const sd = s.seq.subarray(8), w = (o: number) => (sd[o] << 8) | sd[o + 1];
    const bgm = (w(4) << 16) | w(6), tbase = bgm + w(bgm), TAB = [1710, 1614, 1524, 1438, 1357, 1281, 1209, 1141, 1077, 1017, 960, 906];
    const periods = new Set<string>();
    const walk = (p: number, mt: number): void => { // every track, subroutines followed: note byte + table tt -> PSG3 period
      for (;;) {
        const c = sd[p++];
        if (c === 0xeb) mt = sd[p++];
        else if (c >= 0x82 && c < 0xe0) {
          p++;
          if (!mt) continue;
          const ks: number[] = [];
          for (let q = tbase + ((w(tbase + (mt - 1) * 2) << 16) >> 16); sd[q] === 0x16; q += 4) ks.push(c - 0x82 + ((sd[q + 1] << 24) >> 24));
          periods.add(ks.map((k) => TAB[k % 12] >> Math.floor(k / 12)).join(','));
        } else if (c === 0xfe) walk(tbase + ((w(tbase + sd[p++] * 2) << 16) >> 16), mt);
        else if (c === 0xfb || c === 0xff) return;
        else if (c === 0x81 || ARG1.has(c)) p++;
      }
    };
    for (let i = 0; i < sd[bgm + 3]; i++) walk(tbase + w(bgm + 6 + i * 4), 0);
    expect([...periods]).toContain('8,6,5,4,3');
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
  it('highscorefollin FM3 order 8 row 64: instrument 21 (alg 3, TL 13 23 21 16, kvs 1 2 1 0) restates KVS with EE so TL matches Furnace 16 23 24 16 at attenuation 3', async () => {
    // MDSDRV adds the volume to carriers only (op 3 for alg 3). Furnace KVS scales ops 0 and 2 (kvs 1) and leaves op 3 (kvs 0) alone.
    const m = await parse('highscorefollin.fur');
    expect(m.instruments[21].fm!.operators.map((o) => [o.tl, o.kvs])).toEqual([[13, 1], [23, 2], [21, 1], [16, 0]]);
    const hex = Buffer.from(furnaceToMds(m).seq).toString('hex');
    expect(hex).toContain('ee0010ee0218ee030d'); // op0 13+3, op2 21+3, op3 16-3 (driver adds 3 back)
  });
  it('Solar_Man FM6: the Snare (sample instrument with no SM feature) plays sample 0 like Furnace (DivInstrumentAmiga initSample 0), so order 0 row 4 keys on', async () => {
    const m = await parse('Solar_Man.fur');
    expect(m.instruments[4].amiga).toBeUndefined();
    const ticks = furnaceToMds(m).keyOns.filter((k) => k.ch === 5).map((k) => k.tick);
    expect(ticks.slice(0, 4)).toEqual([0, 10, 20, 35]); // rows 0, 2, 4 (Snare), 7 at speed 5
  });
  it('highscorefollin (Furnace version < 224): FM operators parse without the v224 block byte, so the Wurlitzer voice writes TL 1e 1c 10 16 like Furnace', async () => {
    // Raw FM feature: f4 47 00 20 | 52 1e df 07 ... The extra block byte read shifted every operator one byte (TL 5f 5f 19 19, -14 dB on FM1).
    const m = await parse('highscorefollin.fur');
    expect(m.instruments[3].fm!.operators.map((o) => o.tl)).toEqual([0x1e, 0x1c, 0x10, 0x16]);
    expect(Buffer.from(furnaceToMds(m).seq).toString('hex')).toContain('1e1c1016');
  });
  it('highscorefollin: FM4 03 08 on a row without a note (order 0 row 62) ends there, so the E3 + 01 04 at row 64 keys on and slides (measured 1:1 in MAME)', async () => {
    // Furnace: 03xx with no note ports to the playing note, reaches it on the first tick, targetResetsSlides drops it. Before the fix the
    // porta leaked into row 64: no key-on, a 03 slide from D#3. The row must convert exactly as if the 03 08 were not there.
    const m = await parse('highscorefollin.fur');
    const row62 = m.patterns.get(`0_3_${m.subsongs[0].orders[3][0]}`)!.rows[62]!;
    expect(row62.effects).toEqual([{ type: 3, value: 8 }]);
    const row64 = m.patterns.get(`0_3_${m.subsongs[0].orders[3][0]}`)!.rows[64]!;
    const hex = () => Buffer.from(furnaceToMds(m).seq).toString('hex');
    // Both with the row 64 01 04 (01xx ends a porta) and without it (the no-note 03xx ends on its own).
    for (const fx64 of [row64.effects, []]) {
      row64.effects = fx64; row62.effects = [{ type: 3, value: 8 }];
      const withPorta = hex();
      row62.effects = [];
      expect(withPorta).toBe(hex());
    }
  });
  it('Fancy_Promenard PSG: 03xx after a note-off is a plain note-on (Furnace playback.cpp keeps doNote), so it converts as if the 03 were not there', async () => {
    // PSG = the last four channels (PSG3 tone, noise excluded). Before the fix the PSG export slid from the last key even with the channel keyed off; FM already required a sounding channel.
    const m = await parse('Fancy_Promenard.fur');
    const sub = m.subsongs[0];
    let hit: { rows: NonNullable<ReturnType<typeof m.patterns.get>>['rows']; r: number } | null = null;
    for (let ch = sub.orders.length - 4; ch < sub.orders.length - 1; ch++) for (const p of new Set(sub.orders[ch])) {
      const rows = m.patterns.get(`0_${ch}_${p}`)?.rows;
      if (!hit && rows) for (let r = 1; r < rows.length; r++) {
        const c = rows[r], b = rows[r - 1];
        if (c && !(c.note === 0 && c.octave === 0) && c.note < 100 && c.effects?.some((e) => e.type === 3 && e.value > 0) && (!b || b.note < 100)) { hit = { rows, r }; break; }
      }
    }
    expect(hit).not.toBeNull();
    const { rows, r } = hit!;
    rows[r - 1] = { ...(rows[r - 1] ?? rows[r]!), note: 100, octave: 0, effects: [] };
    const fx = rows[r]!.effects, hex = () => Buffer.from(furnaceToMds(m).seq).toString('hex');
    const withPorta = hex();
    rows[r]!.effects = fx.filter((e) => e.type !== 3);
    expect(withPorta).toBe(hex());
  });
  it('vibratoEnvelope: 04 47 is 16 one-frame nodes of 2 * ((7 * vibTable[pos] * 15) >> 4) / 15, first node at pos 4, looping to node 0', () => {
    const env = vibratoEnvelope(0, 4, 7);
    expect(env.length).toBe(16 * 6);
    expect(env.slice(0, 6)).toEqual([0x00, 0x2a, 0, 0, 0, 1]); // vibTable[4] = 48: (7*48*15)>>4 = 315, /15 = 21
    expect(env.slice(15 * 6)).toEqual([0, 0, 0, 0, 0, 0]); // pos 64 = 0, next 0
    expect(env.slice(7 * 6, 7 * 6 + 2)).toEqual([0, 0]); // node 7 = pos 32: vibTable 0
    expect(env.slice(11 * 6, 11 * 6 + 2)).toEqual([0xff, 0x92]); // node 11 = pos 48: vibTable -127, (7*-127*15)>>4 = -834, /15 = -55
  });
  it('newer_song_lol: per-tick 03xx-under-04xy slides push stream data past 32 KiB, so streams split around the track table (pos is a signed word in 0(tbase,pos))', async () => {
    const s = await convert('newer_song_lol.fur'), sd = s.seq.subarray(8), w = (o: number) => (sd[o] << 8) | sd[o + 1];
    const bgm = w(6), tbase = bgm + w(bgm), n = sd[bgm + 3];
    const pos = Array.from({ length: n }, (_, i) => { const v = w(bgm + 4 + i * 4 + 2); return v >= 0x8000 ? v - 0x10000 : v; });
    expect(tbase & 1).toBe(0);
    expect(sd.length - (bgm + 4 + n * 4)).toBeGreaterThan(0x8000); // more stream data than one signed half fits
    expect(Math.min(...pos)).toBeGreaterThanOrEqual(-0x8000);
    expect(sd.length - tbase).toBeLessThanOrEqual(0x8000);
  });
  it('04xy: a 03xx note on a keyed-on channel keeps the vibrato phase (playback.cpp doNote=false), newer_song_lol FM1 row 2', async () => {
    // 180/150 at 60 Hz: 72 Hz sequence ticks, driver tempo round(72 * 128 / NTSC) - 1, fpf = tpf * 5/6 Furnace ticks per frame.
    const fpf = Math.round(72 * 128 / 59.922743) / 128 * 5 / 6;
    const hex = Buffer.from((await convert('newer_song_lol.fur')).seq).toString('hex');
    // Row 1 (sequence tick 6 = Furnace tick 5) starts 04 44; row 2 (tick 12 = Furnace tick 10) is a note with 03 44 on the sounding note:
    // the phase runs on from pos (10 - 5) * 4 = 20 instead of restarting at 0.
    expect(hex).toContain(Buffer.from(vibratoEnvelope(8, 4, 4, 15, fpf)).toString('hex'));
  });
  it('03xx under 04xy on an arp-macro instrument: the slide transpose rides in the slur note\'s own mtab, since `16 tt` and E4 both set t_trs (newer_song_lol PSG1 order 0 row 31)', async () => {
    // SustainedSquare (ins 2) arp [1, 0, ...] still steps when row 31 slides 03 12 under 04 44; a plain E4 would be overwritten next tick.
    const hex = Buffer.from((await convert('newer_song_lol.fur')).seq).toString('hex');
    expect(hex).toMatch(/16fe81..16ff81..160081/); // arp 0 + slide transpose -2, -1, 0 per sequence tick
  });
  it('newer_song_lol PSG1: a note under a 03xx still in flight retargets the slide, and 03xx onto the reached note is no key-on (both slur, playback.cpp inPorta)', async () => {
    // Order 4 row 9 (tick 1590) slides 03 12; row 10 (tick 1596) is a plain note before the target: Furnace keeps sliding (measured 940 -> 1107 Hz).
    // Order 3 row 49 (tick 1446) is 03 12 onto the note already playing: no NOTE_ON, so the arp macro does not restart (was a -100 cent dip).
    const d = decode((await convert('newer_song_lol.fur')).seq, false, true, 6);
    expect(d.find((e) => e.tick === 1590)).toMatchObject({ s: 1 });
    expect(d.find((e) => e.tick === 1596)).toMatchObject({ s: 1 });
    expect(d.find((e) => e.tick === 1446)).toMatchObject({ s: 1 });
    // The retarget keeps doNote, so Furnace resets the 04 44 vibrato phase (playback.cpp commit note on): same E8 item as the
    // order 4 row 0 note (tick 1536, 04 44 from pos 0). Was mid-phase, half a cycle off (22.33 s 51.6 cents high).
    expect(d.find((e) => e.tick === 1596)!.peg).toBe(d.find((e) => e.tick === 1536)!.peg);
  });
  it('decode walks every track of newer_song_lol to its end (streams placed before the track table have a negative pos)', async () => {
    const d = decode((await convert('newer_song_lol.fur')).seq);
    expect(new Set(d.map((e) => e.ch)).size).toBeGreaterThanOrEqual(8);
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
  it('180/150: virtual ticks 4 and 5 of a row share Furnace engine tick 4 (0,1,2,3,4,4), rows on engine tick 5r', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 11, 12].map((t) => furnaceTickOf(t, 5 / 6))).toEqual([0, 1, 2, 3, 4, 4, 5, 9, 10]);
  });
  it('EDxx/ECxx count Furnace engine ticks under virtual tempo: at 180/150 (1.2 sequence ticks per engine tick) ED 03 and EC 03 land on tick 4', async () => {
    const d = await solarManRow0([{ type: 0xed, value: 0x03 }], [180, 150]);
    expect(d.keyOns.find((e) => e.ch === 0)!.tick).toBe(4);
    const c = await solarManRow0([{ type: 0xec, value: 0x03 }], [180, 150]);
    expect(decode(c.seq, true).filter((e) => e.ch === 0)[1]).toEqual({ ch: 0, tick: 4, n: -1 });
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
  it('newer_song_lol 180/150: the conductor runs Furnace ticks 1,1,1,1,2 per frame, every tick on its Furnace frame in NTSC time (one F9 drifted 1.203125 ticks/frame)', async () => {
    const tempos = conductorTempos((await convert('newer_song_lol.fur')).seq, 1);
    // mdsdrv.68k: counter += tempo + 1 per frame, a tick per 128; the last tick of a frame sets the next frame's tempo.
    const n = Math.min(tempos.length, 40 * 72);
    // Every Furnace frame's ticks play on one driver frame (no split pair), within a frame of Furnace time.
    const at = new Map<number, number>();
    let c = 0, g = 0, t = 0, worst = 0, split = 0;
    while (t < n) {
      c += (t ? tempos[t - 1] : 0x7f) + 1; let k = c >> 7; c &= 127;
      for (; k > 0 && t < n; k--, t++) {
        const f = furnaceTickOf(t, 5 / 6);
        if ((at.get(f) ?? g) !== g) split++;
        at.set(f, g); worst = Math.max(worst, Math.abs(g / 59.922743 - f / 60) * 60);
      }
      g++;
    }
    expect(split).toBe(0);
    expect(worst).toBeLessThan(1.5);
  });
  it('newer_song_lol: loop passes 2 and 3 keep Furnace frame time (one 6399-tick body = 5332.5 Furnace frames drifted 0.41 NTSC frames per pass)', async () => {
    const tempos = conductorTempos((await convert('newer_song_lol.fur')).seq, 3);
    const n = 3 + 3 * 6399;
    expect(tempos.length).toBeGreaterThanOrEqual(n);
    let c = 0, g = 0, t = 0, worst = 0;
    while (t < n) {
      c += (t ? tempos[t - 1] : 0x7f) + 1; let k = c >> 7; c &= 127;
      for (; k > 0 && t < n; k--, t++) worst = Math.max(worst, Math.abs(g / 59.922743 - furnaceTickOf(t, 5 / 6) / 60) * 60);
      g++;
    }
    expect(worst).toBeLessThan(0.75);
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

  describe('FM6 DAC volume', () => {
    it('driver PCM step times the baked residual writes Furnace (data8 * dacVolTable[vol]) >> 7 within 1 LSB for every sample and volume', () => {
      expect(pcmDacAtt(127)).toBe(0);
      expect(pcmGain(pcmDacAtt(0))).toBe(0);
      expect([furnaceDacTable(127), furnaceDacTable(120), furnaceDacTable(124), furnaceDacTable(0)]).toEqual([128, 69, 98, 0]);
      for (let v = 1; v <= 127; v++) {
        const sc = pcmDacScale(v), g = Math.round(pcmGain(pcmDacAtt(v)) * 256);
        expect(sc).toBeLessThanOrEqual(1); // never clips
        for (let s = -128; s < 128; s++) {
          const baked = Math.max(-128, Math.min(127, Math.round(s * sc)));
          // mdsdrv.68k volume table: high byte of (byte - 128) * gain
          expect(Math.abs(((baked * g) >> 8) - ((s * furnaceDacTable(v)) >> 7))).toBeLessThanOrEqual(1);
        }
      }
      expect(Math.abs(20 * Math.log10(pcmGain(pcmDacAtt(120)) * pcmDacScale(120)) - 20 * Math.log10(furnaceDacGain(120)))).toBeLessThan(0.15);
    });
    it('Solar_Man: the vol 120 and vol 127 Bass Drum hits get separate PCM copies (F0 headers), each scaled for its volume', async () => {
      const m = await parse('Solar_Man.fur');
      const scaled = furnaceToMds(m).pcm.length;
      m.compatFlags.noOPN2Vol = true; // every hit at full volume: one copy per (sample, freq note)
      const flat = furnaceToMds(m).pcm.length;
      expect(scaled).toBeGreaterThan(flat); // Bass Drum 120/124/127 and Tom 124/127 each have their own copy
    });
  });
});

