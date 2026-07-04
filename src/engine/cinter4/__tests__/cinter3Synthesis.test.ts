/**
 * Cinter 3 instruments synthesize with the FLOAT Cinter3.lua synth, not the
 * fixed-point Cinter 4 player.
 *
 * A v3 Cinter .mod carries its Cinter3.lua-rendered samples baked in. The original
 * Cinter 3 synth is all-float (float pitch/mod-decay accumulation, Math.sin sine),
 * which differs from the fixed-point Amiga Cinter 4 synth by rounding — audibly on
 * decay + modulation heavy instruments. So `renderCinterVoice` must route v3 to the
 * float synth. This test pins that against the real baked PCM of a v3 song: the v3
 * float path reproduces MORE instruments byte-exact than the v4 fixed path.
 *
 * Ground truth = the baked sample PCM in CurtCool-BackInSpace.mod (rendered by the
 * original Cinter 3 tool). Words come from the paired .cinter4.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { renderCinterVoice } from '@/engine/cinter4/cinter4Instrument';
import { renderCinter3SampleFromWords } from '@/engine/cinter4/cinter3SynthCore';
import type { Cinter4SynthWords } from '@/lib/import/formats/cinter4Params';

const FX = resolve(__dirname, '../../../lib/export/__tests__/fixtures/cinter4');
const read = (name: string) => new Uint8Array(readFileSync(resolve(FX, name)));

/** Parse .cinter4 generated instruments → { length words, 9 synth words }. */
function parseCinterGen(b: Uint8Array) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let o = 0;
  const u = () => { const v = dv.getUint16(o, false); o += 2; return v; };
  const i = () => { const v = dv.getInt16(o, false); o += 2; return v; };
  const first = dv.getInt16(0, false);
  const nRaw = first < 0 ? -first : 0;
  o = first < 0 ? 2 : 0;
  for (let r = 0; r < nRaw; r++) { u(); u(); }
  const nGen = i() + 1;
  const gen: { lenBytes: number; words: Cinter4SynthWords }[] = [];
  for (let k = 0; k < nGen; k++) {
    if (o + 22 > b.length) break;
    const L = u(); u();
    const words: Cinter4SynthWords = {
      mpitch: u(), mod: u(), bpitch: u(), attack: u(), dist: u(),
      decay: u(), mpitchdecay: u(), moddecay: u(), bpitchdecay: u(),
    };
    gen.push({ lenBytes: L * 2, words });
  }
  return gen;
}

/** Parse .mod baked sample PCM for Cinter-named samples. */
function parseModBaked(b: Uint8Array) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const meta: { name: string; len: number }[] = [];
  for (let k = 0; k < 31; k++) {
    const o = 20 + k * 30;
    const name = Buffer.from(b.slice(o, o + 22)).toString('latin1').replace(/\0+$/, '');
    meta.push({ name, len: dv.getUint16(o + 22, false) * 2 });
  }
  let maxPat = 0;
  for (let k = 0; k < 128; k++) maxPat = Math.max(maxPat, b[952 + k]);
  let off = 1084 + (maxPat + 1) * 1024;
  const out: { name: string; len: number; pcm: Int8Array | null }[] = [];
  for (let k = 0; k < 31; k++) {
    const { name, len } = meta[k];
    let pcm: Int8Array | null = null;
    if (len > 0) { pcm = new Int8Array(b.buffer, b.byteOffset + off, len); off += len; }
    out.push({ name, len, pcm });
  }
  return out.filter((s) => s.pcm && s.name.length >= 21 && /^[0-9a-zA-Z][0-9Xx]{20}/.test(s.name));
}

const maxDiff = (a: Int8Array, b: Int8Array, n: number) => {
  let m = 0;
  for (let k = 0; k < n; k++) { const d = Math.abs(a[k] - b[k]); if (d > m) m = d; }
  return m;
};

describe('Cinter 3 instruments use the float Cinter3.lua synth', () => {
  const gen = parseCinterGen(read('CurtCool-BackInSpace.golden.cinter4'));
  const baked = parseModBaked(read('CurtCool-BackInSpace.mod'));

  // Join each instrument to its length-matched baked sample (best of v3/v4 render).
  const pairs = (() => {
    const used = new Set<number>();
    const out: { words: Cinter4SynthWords; lenBytes: number; pcm: Int8Array }[] = [];
    for (const g of gen) {
      const r3 = renderCinterVoice(g.words, g.lenBytes, null, 3);
      const r4 = renderCinterVoice(g.words, g.lenBytes, null, 4);
      let mi = -1, best = Infinity;
      for (let k = 0; k < baked.length; k++) {
        if (used.has(k) || baked[k].len !== g.lenBytes) continue;
        const m = Math.min(
          maxDiff(r3, baked[k].pcm!, Math.min(g.lenBytes, 1500)),
          maxDiff(r4, baked[k].pcm!, Math.min(g.lenBytes, 1500)),
        );
        if (m < best) { best = m; mi = k; }
      }
      if (mi < 0) continue;
      used.add(mi);
      out.push({ words: g.words, lenBytes: g.lenBytes, pcm: baked[mi].pcm! });
    }
    return out;
  })();

  it('pairs every generated instrument to a baked sample', () => {
    expect(pairs.length).toBe(gen.length);
    expect(pairs.length).toBeGreaterThanOrEqual(15);
  });

  it('reproduces MORE instruments byte-exact with the v3 float synth than v4 fixed', () => {
    let v3exact = 0, v4exact = 0;
    for (const p of pairs) {
      if (maxDiff(renderCinterVoice(p.words, p.lenBytes, null, 3), p.pcm, p.lenBytes) === 0) v3exact++;
      if (maxDiff(renderCinterVoice(p.words, p.lenBytes, null, 4), p.pcm, p.lenBytes) === 0) v4exact++;
    }
    // Measured: v3 float 13/15 byte-exact, v4 fixed 8/15. Routing v3 through the
    // fixed synth (the bug this guards) drops the exact count.
    expect(v3exact).toBeGreaterThanOrEqual(12);
    expect(v3exact).toBeGreaterThan(v4exact);
  });

  it('does not silence a voice whose decay word is the masked-neutral 0', () => {
    // decayfun3(0) == 65536, stored masked to 0; the float synth must treat word 0
    // as ×1 (unmask), else pitch is multiplied by 0 and the voice goes silent.
    const words: Cinter4SynthWords = {
      mpitch: 0x2000, mod: 0, bpitch: 0x1000, attack: (65536 - 10000) & 0xffff,
      dist: 0, decay: 5, mpitchdecay: 0, moddecay: 0, bpitchdecay: 0, // all-neutral decays
    };
    const pcm = renderCinter3SampleFromWords(words, 2000, null);
    expect(pcm.some((v) => v !== 0)).toBe(true);
  });
});
