/**
 * Cinter synthesis lock-test: render each .cinter4 instrument's STORED WORDS via
 * cinter4SynthCore.ts and byte-compare against the baked sample PCM in the paired
 * Cinter .mod (the real Amiga-Cinter render = ground truth). No emulator needed.
 * Join is by sample LENGTH (CinterConvert preserves it; the .cinter4 packs
 * instruments raw-first while the .mod keeps original interleaved slots).
 *
 *   npx tsx tools/cinter-audit/mod-synth-parity.mts <base.cinter4> <base.mod> [3|4]
 *
 * The trailing 3|4 picks the synth (default 4). Most historical Cinter mods are v3,
 * baked by the float Cinter3.lua synth — pass 3 to validate those (renderCinterVoice
 * routes v3 → cinter3SynthCore). e.g. CurtCool-BackInSpace with `3`: 13/15 byte-exact.
 *
 * maxDiff==0 = byte-exact to the reference render; <=3 = ~1 LSB rounding. A residual
 * of LARGE diffs remains on a minority of instruments (e.g. much of JazzCat) under
 * BOTH synths — likely baked by yet another Cinter build; correlates with heavy
 * distortion+mod+decay. Validated pairs live in src/lib/export/__tests__/fixtures/cinter4/.
 */
import { readFileSync } from 'node:fs';
import { renderCinterVoice } from '../../src/engine/cinter4/cinter4Instrument.ts';
import type { Cinter4SynthWords, Cinter4Version } from '../../src/lib/import/formats/cinter4Params.ts';

const [cinterPath, modPath, verArg] = process.argv.slice(2);
// Version selects the synth: 3 = float Cinter3.lua (original v3 mods), 4 = fixed-point
// Amiga (default). Most historical Cinter mods are v3 — pass 3 to validate those.
const version: Cinter4Version = verArg === '3' ? 3 : 4;

function parseCinter(bytes: Uint8Array) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 0;
  const u16 = () => { const v = dv.getUint16(off, false); off += 2; return v; };
  const i16 = () => { const v = dv.getInt16(off, false); off += 2; return v; };
  const first = dv.getInt16(0, false);
  const nRaw = first < 0 ? -first : 0;
  off = first < 0 ? 2 : 0;
  for (let r = 0; r < nRaw; r++) { u16(); u16(); }
  const nGen = i16() + 1;
  const gen: { idx: number; lengthWords: number; words: Cinter4SynthWords }[] = [];
  for (let i = 0; i < nGen; i++) {
    if (off + 22 > bytes.length) break;
    const length = u16(); u16();
    const words: Cinter4SynthWords = {
      mpitch: u16(), mod: u16(), bpitch: u16(), attack: u16(), dist: u16(),
      decay: u16(), mpitchdecay: u16(), moddecay: u16(), bpitchdecay: u16(),
    };
    gen.push({ idx: i, lengthWords: length, words });
  }
  return { nRaw, gen };
}

function parseMod(bytes: Uint8Array) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const meta = [] as { name: string; lenBytes: number; isCinter: boolean }[];
  for (let i = 0; i < 31; i++) {
    const o = 20 + i * 30;
    const name = Buffer.from(bytes.slice(o, o + 22)).toString('latin1').replace(/\0+$/, '');
    const lenBytes = dv.getUint16(o + 22, false) * 2;
    // Cinter param name: >=21 chars, chars 1..20 are digits or X
    const isCinter = name.length >= 21 && /^[0-9a-zA-Z]([0-9Xx]{20})/.test(name);
    meta.push({ name, lenBytes, isCinter });
  }
  let maxPat = 0;
  for (let i = 0; i < 128; i++) maxPat = Math.max(maxPat, bytes[952 + i]);
  let dataOff = 1084 + (maxPat + 1) * 1024;
  const out = [] as { name: string; lenBytes: number; isCinter: boolean; pcm: Int8Array | null }[];
  for (let i = 0; i < 31; i++) {
    const m = meta[i];
    let pcm: Int8Array | null = null;
    if (m.lenBytes > 0) { pcm = new Int8Array(bytes.buffer, bytes.byteOffset + dataOff, m.lenBytes); dataOff += m.lenBytes; }
    out.push({ ...m, pcm });
  }
  return out;
}

const cin = parseCinter(new Uint8Array(readFileSync(cinterPath)));
const mod = parseMod(new Uint8Array(readFileSync(modPath)));
const modBaked = mod.filter((s) => s.pcm && s.isCinter);
const usedMod = new Set<number>();

console.log(`nRaw=${cin.nRaw} generated=${cin.gen.length} modBakedCinter=${modBaked.length}`);
let worst = 0, checked = 0, exact = 0, near = 0;
for (const g of cin.gen) {
  const lenBytes = g.lengthWords * 2;
  const ts = renderCinterVoice(g.words, lenBytes, null, version);
  // Best-match among unused baked samples of equal length (resolves same-length collisions).
  let mi = -1, maxDiff = 0, sumDiff = 0, nz = 0, bestMax = Infinity;
  for (let k = 0; k < modBaked.length; k++) {
    if (usedMod.has(k) || modBaked[k].lenBytes !== lenBytes) continue;
    const pcm = modBaked[k].pcm!; let mx = 0;
    for (let i = 0; i < lenBytes; i++) { const d = Math.abs(ts[i] - pcm[i]); if (d > mx) mx = d; }
    if (mx < bestMax) { bestMax = mx; mi = k; }
  }
  if (mi < 0) { console.log(`  gen#${g.idx} len=${lenBytes}: no length-matched baked .mod cinter sample`); continue; }
  usedMod.add(mi);
  const slot = modBaked[mi];
  for (let i = 0; i < lenBytes; i++) { const d = Math.abs(ts[i] - slot.pcm![i]); if (d) { sumDiff += d; nz++; } if (d > maxDiff) maxDiff = d; }
  checked++;
  if (maxDiff === 0) exact++;
  if (maxDiff <= 3) near++;
  worst = Math.max(worst, maxDiff);
  const flag = maxDiff > 4 ? '  <-- LARGE' : (maxDiff === 0 ? '  exact' : '  ~sine');
  console.log(`  len=${String(lenBytes).padStart(6)} "${slot.name}" maxDiff=${String(maxDiff).padStart(3)} meanDiff=${nz ? (sumDiff / lenBytes).toFixed(3) : '0'} diff=${nz}/${lenBytes}${flag}`);
}
console.log(`\nSUMMARY ${modPath.split('/').pop()}: checked=${checked} exact=${exact} within3LSB=${near} worstMaxDiff=${worst}`);
