/**
 * cinter3SynthCore.ts — the Cinter *3* synth voice (the ORIGINAL Cinter).
 *
 * Cinter 3 instruments were baked by Cinter3.lua, an all-FLOAT reference synth
 * (Math.sin sine table, float pitch/mod decay accumulation). That differs from the
 * fixed-point Amiga Cinter 4 player (cinter4SynthCore.ts) by rounding — audibly so
 * on decay + modulation heavy instruments. A v3 Cinter .mod carries its
 * Cinter3.lua-rendered samples baked in, so to reproduce the original sound of a v3
 * instrument DEViLBOX must synthesize it the Cinter 3 way, not the Cinter 4 way.
 *
 * Verified byte-for-byte against the baked sample PCM of real v3 Cinter mods via
 * tools/cinter-audit/mod-synth-parity.mts (CurtCool-BackInSpace: 13/15 instruments
 * within 3 LSB; ties-or-beats the fixed-point synth on every instrument).
 *
 * 1:1 port of Cinter3.lua note:singlesample (Reference Code/Cinter/Cinter3.lua
 * lines 116-227). Words are the 9 stored synth words (same layout as Cinter 4);
 * the pitch/mod/decay values are v3-curve outputs (pitch = param·512, decay =
 * exp(−2e-6·param²)·65536).
 */

import type { Cinter4SynthWords } from '../../lib/import/formats/cinter4Params';

/** signed 16-bit (Lua bit.band(-x,65535) reads back as a signed .w) */
const s16 = (v: number): number => (v << 16) >> 16;

// Cinter3.lua sintab: floor(0.5 + 16384·sin(floor(i/4)/16384 · 2π)) — Math.sin.
function sintab(i: number): number {
  return Math.floor(0.5 + 16384 * Math.sin((Math.floor(i / 4) / 16384) * (2 * Math.PI)));
}
function distort(val: number, shift: number): number {
  while (shift > 0) { val = sintab(val); shift -= 1; }
  return val;
}

/**
 * Render a Cinter 3 instrument's PCM from its 9 stored synth words, exactly as
 * Cinter3.lua does (float pipeline). Returns signed 8-bit PCM (`length` bytes).
 */
export function renderCinter3SampleFromWords(
  w: Cinter4SynthWords,
  length: number,
  _repeatStart: number | null = null,
): Int8Array {
  let mpitch = w.mpitch & 0xffff;
  let bpitch = w.bpitch & 0xffff;
  let mod = w.mod & 0xffff;
  // A neutral decay (multiplier == 65536, i.e. no decay) is stored masked to 0.
  // Cinter3.lua keeps the unmasked 65536; reconstruct it (word 0 → ×1) or the
  // pitch/mod would be multiplied by 0 and the voice would go silent.
  const unmask = (word: number): number => ((word & 0xffff) === 0 ? 65536 : word & 0xffff);
  const mpitchdecay = unmask(w.mpitchdecay);
  const bpitchdecay = unmask(w.bpitchdecay);
  const moddecay = unmask(w.moddecay);
  const attack = -s16(w.attack & 0xffff); // stored word = −envfun → attack = envfun
  const decay = w.decay & 0xffff;
  const dist = w.dist & 0xffff;
  const mdist = (dist >> 12) & 0xf;
  const bdist = (dist >> 8) & 0xf;
  const vpower = (dist >> 4) & 0xf;
  const fdist = dist & 0xf;

  let amp = 0;
  let attacking = true;
  const out = new Int8Array(length);
  // Cinter3 sampledata starts {0,0}; out[i>=2] = singlesample(i-2).
  for (let idx = 2; idx < length; idx++) {
    const samindex = idx - 2;
    const mpl = Math.floor(mpitch * 16384) / 65536;
    const bpl = Math.floor(bpitch * 16384) / 65536;
    const modl = Math.floor(mod * 16384) / 65536;
    const mval = distort(sintab(samindex * mpl), mdist);
    let val = distort(sintab(samindex * bpl + mval * modl), bdist);
    let p = vpower;
    while (p >= 0) { val = (val * amp) / 32768; p -= 1; }
    val = Math.min(Math.floor(distort(val, fdist) / 128), 127);
    out[idx] = (s16(val) << 24) >> 24;

    mpitch = Math.floor(mpitch * mpitchdecay) / 65536;
    bpitch = Math.floor(bpitch * bpitchdecay) / 65536;
    mod = Math.floor(mod * moddecay) / 65536;
    if (attacking) {
      amp += attack;
      if (amp > 32767) { amp = 32767; attacking = false; }
    } else {
      amp -= decay;
      if (amp < 0) amp = 0;
    }
  }
  return out;
}
