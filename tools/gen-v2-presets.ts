#!/usr/bin/env npx tsx
import { readFileSync } from 'fs';
import { parseV2M, patchBytesToConfig } from '../src/lib/import/V2MParser';
import type { V2InstrumentConfig } from '../src/types/v2Instrument';

const OSC_MODE_NUM: Record<string, number> = { off: 0, saw: 1, pulse: 2, sin: 3, noise: 4, fm: 5, auxA: 6, auxB: 7 };
const FILTER_MODE_NUM: Record<string, number> = { off: 0, low: 1, band: 2, high: 3, notch: 4, all: 5, moogL: 6, moogH: 7 };
const DIST_MODE_NUM: Record<string, number> = { off: 0, overdrive: 1, clip: 2, bitcrush: 3, decimate: 4, lpf: 5, bpf: 6, hpf: 7, notch: 8, allpass: 9, moogL: 10 };
const MOD_SOURCE_NUM: Record<string, number> = { velocity: 0, modulation: 1, breath: 2, ctl3: 3, ctl4: 4, ctl5: 5, ctl6: 6, volume: 7, ampEG: 8, eg2: 9, lfo1: 10, lfo2: 11, note: 12 };
const KEY_SYNC_NUM: Record<string, number> = { none: 0, osc: 1, full: 2 };
function toSigned(v: number): number { return v - 64; }
function lfoModeNum(m: string): number { return m === 'saw' ? 0 : m === 'tri' ? 1 : m === 'pulse' ? 2 : m === 'sin' ? 3 : 4; }
function lfoPolarityNum(p: string): number { return p === 'positive' ? 0 : p === 'negative' ? 1 : 2; }
function compModeNum(m: string): number { return m === 'off' ? 0 : m === 'peak' ? 1 : 2; }
function describePatch(inst: V2InstrumentConfig): string {
  const p: string[] = [];
  if (inst.osc1.mode !== 'off') p.push(inst.osc1.mode);
  if (inst.osc2.mode !== 'off') p.push(`+${inst.osc2.mode}`);
  if (inst.osc3.mode !== 'off') p.push(`+${inst.osc3.mode}`);
  if (inst.filter1.mode !== 'off') p.push(`${inst.filter1.mode}@${inst.filter1.cutoff}`);
  if (inst.voiceDistortion.mode !== 'off') p.push(`dist:${inst.voiceDistortion.mode}`);
  return p.join(' ');
}
function namePatch(prefix: string, inst: V2InstrumentConfig): string {
  const oscModes = [inst.osc1.mode, inst.osc2.mode, inst.osc3.mode].filter(m => m !== 'off');
  const N = oscModes.includes('noise'), FM = oscModes.includes('fm'), S = oscModes.includes('saw');
  const P = oscModes.includes('pulse'), Si = oscModes.includes('sin');
  const ae = inst.ampEnvelope, dist = inst.voiceDistortion.mode !== 'off', C = inst.chorusFlanger.modDepth > 20;
  const FS = inst.modMatrix.some(m => m.source === 'eg2' && (m.dest === 21 || m.dest === 24));
  const PS = inst.modMatrix.some(m => m.source === 'eg2' && (m.dest === 4 || m.dest === 10 || m.dest === 16));
  const f1 = inst.filter1, hp = f1.mode === 'high', bp = f1.mode === 'band', lp = f1.mode === 'low';
  const lo = f1.cutoff < 50, hc = f1.cutoff > 100, hr = f1.resonance > 60;
  const la = ae.attack > 50, sd = ae.decay < 40, ns = ae.sustain < 20;
  const vsd = ae.decay < 15 && ae.sustain < 10;
  const perc = sd && ns && !la, sus = ae.sustain > 80;
  // --- PERCUSSION (filter-type-aware) ---
  if (perc) {
    if ((hp || (bp && hc)) && (N || P) && vsd) return `${prefix} Hihat`;
    if (hp && N) return `${prefix} Cymbal`;
    if (Si && PS && ae.decay < 20) return `${prefix} Kick`;
    if (Si && N && PS) return `${prefix} Kick`;
    if (N && (bp || lp) && !hp && Si) return `${prefix} Snare`;
    if (N && !S && !P && !Si && hp) return `${prefix} Cymbal`;
    if (N && !S && !P && !Si) return `${prefix} Noise Hit`;
    if (PS) return `${prefix} Zap`;
    if (N && dist) return `${prefix} Clap`;
    if (FM) return `${prefix} FM Stab`;
    if (dist) return `${prefix} Dist Stab`;
    if (S) return `${prefix} Saw Stab`;
    if (P) return `${prefix} Stab`;
    return `${prefix} Percussion`;
  }
  // --- PADS ---
  if (la) { if (S && C) return `${prefix} Chorus Pad`; if (S) return `${prefix} Saw Pad`; if (Si) return `${prefix} Sine Pad`; if (N) return `${prefix} Noise Pad`; return `${prefix} Pad`; }
  // --- FM ---
  if (FM) return lo ? `${prefix} FM Bass` : dist ? `${prefix} FM Dist` : `${prefix} FM Tone`;
  // --- BASS ---
  if (lo && !la) {
    if (N && dist) return `${prefix} Dist Bass`;
    if (S && FS) return `${prefix} Sweep Bass`; if (S) return `${prefix} Saw Bass`;
    if (P && FS) return `${prefix} Pulse Sweep`; if (P) return `${prefix} Pulse Bass`;
    if (Si && N) return `${prefix} Noise Bass`; if (Si) return `${prefix} Sub Bass`;
    if (N) return `${prefix} Noise Bass`;
    return `${prefix} Bass`;
  }
  // --- FILTER SWEEP ---
  if (FS && !sus) return S ? `${prefix} Saw Sweep` : P ? `${prefix} Pulse Sweep` : `${prefix} Filter Sweep`;
  // --- DISTORTED ---
  if (dist && !sus) return S ? `${prefix} Dist Lead` : `${prefix} Dist Synth`;
  // --- SUSTAINED ---
  if (sus) { if (S && P && C) return `${prefix} Chorus Lead`; if (S && P) return `${prefix} Synth Lead`; if (S && C) return `${prefix} Chorus Saw`; if (S && hr) return `${prefix} Reso Lead`; if (S) return `${prefix} Saw Lead`; if (P) return `${prefix} Pulse Lead`; if (Si && N && dist) return `${prefix} Dist Noise`; if (Si) return `${prefix} Sine Lead`; if (N) return `${prefix} Noise Lead`; return `${prefix} Lead`; }
  // --- DECAYING ---
  if (S && hr) return `${prefix} Reso Saw`; if (S && C) return `${prefix} Chorus Saw`; if (S) return `${prefix} Saw Synth`;
  if (P) return `${prefix} Pulse Synth`; if (Si && N) return `${prefix} Noise Tone`; if (Si) return `${prefix} Sine Synth`; if (N) return `${prefix} Noise`;
  return `${prefix} Synth`;
}
const files = [
  { path: 'src/engine/v2/v2m/pzero_new.v2m', prefix: 'PZero' },
  { path: 'src/engine/v2/v2m/v2_zeitmaschine_new.v2m', prefix: 'Zeit' },
];
const presets: { name: string; inst: V2InstrumentConfig; desc: string }[] = [];
const usedNames = new Map<string, number>();
for (const file of files) {
  const buf = readFileSync(file.path);
  const v2m = parseV2M(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  for (let i = 0; i < v2m.patches.length; i++) {
    const inst = patchBytesToConfig(v2m.patches[i]);
    if (inst.osc1.mode === 'off' && inst.osc2.mode === 'off' && inst.osc3.mode === 'off') continue;
    let name = namePatch(file.prefix, inst);
    const count = usedNames.get(name) ?? 0; usedNames.set(name, count + 1);
    if (count > 0) name = `${name} ${count + 1}`;
    presets.push({ name, inst, desc: describePatch(inst) });
  }
}
let out = `import type { InstrumentPreset } from '@typedefs/instrument';\nimport { DEFAULT_V2 } from '@typedefs/instrument';\n\n// Real V2 patches from Farbrausch V2M demos. All params preserved.\n\n`;
for (const p of presets) {
  const inst = p.inst, v = inst.voice;
  const vn = 'V2_' + p.name.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  out += `// ${p.desc}\nexport const ${vn}: InstrumentPreset['config'] = {\n  type: 'synth',\n  name: '${p.name}',\n  synthType: 'V2',\n  v2: {\n    ...DEFAULT_V2,\n`;
  // Voice
  const vf: string[] = [];
  if (v.panning !== 64) vf.push(`panning: ${toSigned(v.panning)}`);
  if (v.transpose !== 64) vf.push(`transpose: ${toSigned(v.transpose)}`);
  if (v.maxPoly !== 1) vf.push(`maxPoly: ${v.maxPoly}`);
  if (v.boost !== 0) vf.push(`boost: ${v.boost}`);
  if (v.reverb !== 0) vf.push(`reverb: ${v.reverb}`);
  if (v.delay !== 0) vf.push(`delay: ${v.delay}`);
  if (v.auxASend !== 0) vf.push(`auxASend: ${v.auxASend}`);
  if (v.auxBSend !== 0) vf.push(`auxBSend: ${v.auxBSend}`);
  if (v.auxARecv !== 0) vf.push(`auxARecv: ${v.auxARecv}`);
  if (v.auxBRecv !== 0) vf.push(`auxBRecv: ${v.auxBRecv}`);
  if (v.keySync !== 'none') vf.push(`keySync: ${KEY_SYNC_NUM[v.keySync]}`);
  if (v.fxRoute === 'chorusThenDist') vf.push(`fxRoute: 1`);
  if (vf.length > 0) out += `    voice: { ${vf.join(', ')} },\n`;
  // Oscs
  out += `    osc1: { mode: ${OSC_MODE_NUM[inst.osc1.mode]}${inst.osc1.ringmod ? ', ringMod: true' : ''}, transpose: ${toSigned(inst.osc1.transpose)}, detune: ${toSigned(inst.osc1.detune)}, color: ${inst.osc1.color}, level: ${inst.osc1.volume} },\n`;
  if (inst.osc2.mode !== 'off') out += `    osc2: { mode: ${OSC_MODE_NUM[inst.osc2.mode]}, ringMod: ${inst.osc2.ringmod}, transpose: ${toSigned(inst.osc2.transpose)}, detune: ${toSigned(inst.osc2.detune)}, color: ${inst.osc2.color}, level: ${inst.osc2.volume} },\n`;
  if (inst.osc3.mode !== 'off') out += `    osc3: { mode: ${OSC_MODE_NUM[inst.osc3.mode]}, ringMod: ${inst.osc3.ringmod}, transpose: ${toSigned(inst.osc3.transpose)}, detune: ${toSigned(inst.osc3.detune)}, color: ${inst.osc3.color}, level: ${inst.osc3.volume} },\n`;
  // Filters
  out += `    filter1: { mode: ${FILTER_MODE_NUM[inst.filter1.mode]}, cutoff: ${inst.filter1.cutoff}, resonance: ${inst.filter1.resonance} },\n`;
  if (inst.filter2.mode !== 'off') out += `    filter2: { mode: ${FILTER_MODE_NUM[inst.filter2.mode]}, cutoff: ${inst.filter2.cutoff}, resonance: ${inst.filter2.resonance} },\n`;
  if (inst.filterRouting !== 'single') out += `    routing: { mode: ${inst.filterRouting === 'serial' ? 1 : 2}, balance: ${inst.filterBalance} },\n`;
  // Envelopes
  const ae = inst.ampEnvelope, me = inst.modEnvelope;
  const aeX: string[] = []; if (ae.sustainTime !== 64) aeX.push(`sustainTime: ${ae.sustainTime}`); if (ae.amplify !== 0) aeX.push(`amplify: ${ae.amplify}`);
  out += `    envelope: { attack: ${ae.attack}, decay: ${ae.decay}, sustain: ${ae.sustain}, release: ${ae.release}${aeX.length ? ', ' + aeX.join(', ') : ''} },\n`;
  const meX: string[] = []; if (me.sustainTime !== 64) meX.push(`sustainTime: ${me.sustainTime}`); if (me.amplify !== 64) meX.push(`amplify: ${me.amplify}`);
  if (me.attack !== 0 || me.decay !== 64 || me.sustain !== 127 || me.release !== 32 || meX.length)
    out += `    envelope2: { attack: ${me.attack}, decay: ${me.decay}, sustain: ${me.sustain}, release: ${me.release}${meX.length ? ', ' + meX.join(', ') : ''} },\n`;
  // Distortion
  if (inst.voiceDistortion.mode !== 'off') out += `    voiceDistortion: { mode: ${DIST_MODE_NUM[inst.voiceDistortion.mode]}, inGain: ${inst.voiceDistortion.inGain}, param1: ${inst.voiceDistortion.param1}, param2: ${inst.voiceDistortion.param2} },\n`;
  if (inst.channelDistortion.mode !== 'off') out += `    channelDistortion: { mode: ${DIST_MODE_NUM[inst.channelDistortion.mode]}, inGain: ${inst.channelDistortion.inGain}, param1: ${inst.channelDistortion.param1}, param2: ${inst.channelDistortion.param2} },\n`;
  // LFOs
  if (inst.lfo1.amplify > 0 || inst.lfo1.rate !== 64) out += `    lfo1: { rate: ${inst.lfo1.rate}, depth: ${inst.lfo1.amplify} },\n`;
  if (inst.lfo2.amplify !== 127 || inst.lfo2.rate !== 64) out += `    lfo2: { mode: ${lfoModeNum(inst.lfo2.mode)}, keySync: ${inst.lfo2.keySync}, envMode: ${inst.lfo2.envMode}, rate: ${inst.lfo2.rate}, phase: ${inst.lfo2.phase}, polarity: ${lfoPolarityNum(inst.lfo2.polarity)}, amplify: ${inst.lfo2.amplify} },\n`;
  // Chorus
  const cf = inst.chorusFlanger;
  if (cf.modDepth > 0 || cf.amount !== 64) out += `    chorusFlanger: { amount: ${cf.amount}, feedback: ${cf.feedback}, delayL: ${cf.delayL}, delayR: ${cf.delayR}, modRate: ${cf.modRate}, modDepth: ${cf.modDepth}, modPhase: ${cf.modPhase} },\n`;
  // Comp
  if (inst.compressor.mode !== 'off') out += `    compressor: { mode: ${compModeNum(inst.compressor.mode)}, stereoLink: ${inst.compressor.stereoLink}, autoGain: ${inst.compressor.autoGain}, lookahead: ${inst.compressor.lookahead}, threshold: ${inst.compressor.threshold}, ratio: ${inst.compressor.ratio}, attack: ${inst.compressor.attack}, release: ${inst.compressor.release}, outGain: ${inst.compressor.outGain} },\n`;
  // Mod matrix
  if (inst.modMatrix.length > 0) { out += `    modMatrix: [\n`; for (const m of inst.modMatrix) out += `      { source: ${MOD_SOURCE_NUM[m.source] ?? 0}, amount: ${m.amount}, dest: ${m.dest} },\n`; out += `    ],\n`; }
  out += `  },\n  effects: [],\n  volume: -6,\n  pan: 0,\n};\n\n`;
}
// Exports for drum.ts
const kickIdx = presets.findIndex(p => p.name.includes('Kick'));
const hitIdx = presets.findIndex(p => p.name.includes('Noise Hit'));
const stabIdx = presets.findIndex(p => p.name.includes('Pulse Stab'));
if (kickIdx >= 0) { const vn = 'V2_' + presets[kickIdx].name.toUpperCase().replace(/[^A-Z0-9]+/g, '_'); out += `export const V2_PRESET_KICK = ${vn};\n`; }
if (hitIdx >= 0) { const vn = 'V2_' + presets[hitIdx].name.toUpperCase().replace(/[^A-Z0-9]+/g, '_'); out += `export const V2_PRESET_SNARE = ${vn};\n`; }
if (stabIdx >= 0) { const vn = 'V2_' + presets[stabIdx].name.toUpperCase().replace(/[^A-Z0-9]+/g, '_'); out += `export const V2_PRESET_HAT = ${vn};\n`; }
out += `\nexport const V2_PRESETS: InstrumentPreset['config'][] = [\n`;
for (const p of presets) { const vn = 'V2_' + p.name.toUpperCase().replace(/[^A-Z0-9]+/g, '_'); out += `  ${vn},\n`; }
out += `  { name: 'V2 Speech', type: 'synth' as const, synthType: 'V2Speech' as const, volume: -6, pan: 0, effects: [], parameters: { text: 'Ready' } },\n];\n`;
process.stdout.write(out);
