/**
 * Monique `.mlprog` program (XML): root `<PROJECT-1.0 ATTR="value" ...>` with one attribute per saved parameter, plus
 * `<LeftMorphData_n>` / `<RightMorphData_n>` children (the morph source snapshots).
 * Real files: third-party/monique-monosynth/resources/files/{A,B}/*.mlprog (143 programs) and FACTORTY DEFAULT.mlprog.
 *
 * Attribute names and bounds were read from third-party/monique-monosynth/src/core/monique_core_Datastructures.cpp:
 * `generate_param_name(NAME, id, "field")` builds `NAME_id_field` (OSC_, FLT_, ENV_, LFO_, MFO_, SD_ (id 2 = MASTER), VERB_,
 * CHR_, ARP_, EQ_); the MIN_MAX(min,max) and the init value of each member are the bounds and defaults used here.
 * Loading rule kept from read_parameter_from_file (monique_core_Parameters.h): an attribute that is absent takes the
 * parameter's init value, a present one is clamped to [min,max]. So the config always holds all 120 keys.
 *
 * Config shape: { monique: MoniqueConfig } (src/engine/monique/MoniqueSynth.ts, the 120 sound parameters of the WASM
 * wrapper's MoniqueParams enum; wiring in juce-wasm/monique/MoniqueSynth.cpp applyParameter). Not in the config and reported:
 * the *_mod modulation amounts, morph source snapshots, arp sequencer steps, per-input envelopes (ENV_100..), UI settings.
 */
import { childrenNamed, parseXml } from '../xml';
import { ParseError, baseNameOf, bytesToText, clampReported, type ParsedPreset } from '../types';

const FORMAT = 'Monique program';

interface Entry { attr: string; key: string; min: number; max: number; def: number; int: boolean }

const TABLE: Entry[] = [];
const e = (attr: string, key: string, min: number, max: number, def: number, int = false): void => {
  TABLE.push({ attr, key, min, max, def, int });
};

// SynthData (id 2 = MASTER)
e('SD_2_volume', 'volume', 0, 1, 0.9);
e('SD_2_glide', 'glide', 0, 1, 0.05);
e('SD_2_octave_offset', 'octaveOffset', -2, 2, 0, true);
e('SD_2_arp_note_offset', 'noteOffset', 0, 12, 0, true);
e('SD_2_sync', 'sync', 0, 1, 1);
for (let o = 0; o < 3; o++) {
  const n = o + 1;
  e(o === 0 ? 'OSC_0_wave' : `OSC_${o}_wave`, `osc${n}Wave`, 0, 3, 0);
  e(`OSC_${o}_octave`, `osc${n}Octave`, -36, 36, 0);
  e(`OSC_${o}_fm_power`, `osc${n}FmPower`, 0, 1, 0);
  // the master oscillator (OSC_0) names its sync "key-sync" and defaults to off; the others default to on
  e(o === 0 ? 'OSC_0_key-sync' : `OSC_${o}_sync`, `osc${n}Sync`, 0, 1, o === 0 ? 0 : 1);
}
e('OSC_0_fm_multi', 'fmFreq', 0, 1, 0);
e('OSC_0_fm_phase', 'fmShape', 0, 1, 0);
e('OSC_0_fm_swing', 'fmSwing', 0, 1, 0);
e('OSC_0_master_shift', 'masterShift', 0, 1, 0);
for (let f = 0; f < 3; f++) {
  const n = f + 1;
  e(`FLT_${f}_filter_type`, `filter${n}Type`, 1, 7, 1, true);
  e(`FLT_${f}_cutoff`, `filter${n}Cutoff`, 0, 1, 0.2);
  e(`FLT_${f}_resonance`, `filter${n}Resonance`, 0, 1, 0.3);
  e(`FLT_${f}_distortion`, `filter${n}Distortion`, 0, 1, 0);
  e(`FLT_${f}_output`, `filter${n}Output`, 0, 1, 0.75);
  e(`FLT_${f}_pan`, `filter${n}Pan`, -1, 1, 0);
  e(`FLT_${f}_adsr_lfo_mix`, `filter${n}ModMix`, -1, 1, -0.9);
}
for (let v = 0; v < 4; v++) {
  const n = v + 1;
  e(`ENV_${v}_attack`, `env${n}Attack`, 0, 1, 0.05);
  e(`ENV_${v}_decay`, `env${n}Decay`, 0, 1, 0.02);
  e(`ENV_${v}_sustain`, `env${n}Sustain`, 0, 1, 0.9);
  e(`ENV_${v}_retrigger`, `env${n}SusTime`, 0.004, 1, 1); // member sustain_time, saved as "retrigger"
  e(`ENV_${v}_release`, `env${n}Release`, 0, 1, 0.2);
  e(`ENV_${v}_shape`, `env${n}Shape`, -1, 1, 0);
}
for (let l = 0; l < 3; l++) {
  e(`LFO_${l}_speed`, `lfo${l + 1}Speed`, 0, 16, 4, true);
  e(`LFO_${l}_wave`, `lfo${l + 1}Wave`, 0, 1, 0);
  e(`LFO_${l}_phase`, `lfo${l + 1}Phase`, 0, 1, 0);
}
for (let m = 0; m < 4; m++) {
  e(`MFO_${m}_speed`, `mfo${m + 1}Speed`, 0, 16, 4, true);
  e(`MFO_${m}_wave`, `mfo${m + 1}Wave`, 0, 1, 0);
  e(`MFO_${m}_phase`, `mfo${m + 1}Phase`, 0, 1, 0);
}
for (let f = 0; f < 3; f++) {
  for (let i = 0; i < 3; i++) e(`FLT_${f}_input_sustain_${i}`, `filter${f + 1}Input${i}`, f === 0 ? 0 : -1, 1, 0);
}
e('SD_2_distortion', 'distortion', 0, 1, 0.6);
e('SD_2_shape', 'shape', 0, 1, 0.05);
e('SD_2_delay', 'delay', 0, 1, 0);
e('SD_2_delay_pan', 'delayPan', -1, 1, 0);
e('VERB_2_room', 'reverbRoom', 0, 1, 0.333);
e('VERB_2_dry-wet', 'reverbMix', 0, 1, 0.75);
e('CHR_2_modulation', 'chorusMod', 0, 1, 0.333);
e('SD_2_effect_bypass', 'effectBypass', 0, 1, 1);
for (let k = 0; k < 4; k++) e(`SD_2_morph_state_${k}`, `morph${k + 1}`, 0, 1, 0);
e('ARP_2_is_on', 'arpOn', 0, 1, 1);
e('ARP_2_is_seq', 'arpSequencer', 0, 1, 0);
e('ARP_2_speed_multi', 'arpSpeed', -15, 15, 0, true);
e('ARP_2_shuffle', 'arpShuffle', 0, 15, 0, true);
for (let b = 0; b < 7; b++) e(`EQ_2_velocity_${b}`, `eqBand${b + 1}`, 0, 1, 0.5);
e('EQ_2_mix', 'eqBypass', 0, 1, 1);

/** The mapping, exported so tests (and the registry step) can check it against the engine config. */
export const MONIQUE_ATTRIBUTES: ReadonlyArray<Readonly<Entry>> = TABLE;
const BY_ATTR = new Map(TABLE.map((t) => [t.attr, t]));

// Attributes with these prefixes are upstream parameters (generate_param_name families) that the 120-key config does not carry.
const KNOWN_FAMILY = /^(?:OSC|FLT|ENV|LFO|MFO|SD|VERB|CHR|ARP|EQ)_\d+_|^(?:left|right)_morph_source_\d+$/;

export function sniff(bytes: Uint8Array, fileName: string): boolean {
  const head = new TextDecoder('utf-8').decode(bytes.subarray(0, 400));
  return head.includes('<PROJECT-1.0') || (/\.mlprog$/i.test(fileName) && head.includes('<PROJECT'));
}

export function parse(bytes: Uint8Array, fileName: string): ParsedPreset[] {
  const root = parseXml(bytesToText(bytes, FORMAT), FORMAT);
  if (root.name !== 'PROJECT-1.0') throw new ParseError(FORMAT, `root element is <${root.name}>, expected <PROJECT-1.0>`);
  const warnings: string[] = [];
  const monique: Record<string, number> = {};
  let present = 0;

  for (const t of TABLE) {
    const raw = root.attrs[t.attr];
    if (raw === undefined) {
      monique[t.key] = t.def; // upstream: absent attribute = init value
      continue;
    }
    const x = Number(raw);
    if (raw.trim() === '' || Number.isNaN(x)) {
      warnings.push(`${t.attr}: "${raw}" is not a number, default used`);
      monique[t.key] = t.def;
      continue;
    }
    present++;
    let v = clampReported(t.attr, x, t.min, t.max, warnings) ?? t.def;
    if (t.int) v = Math.round(v);
    monique[t.key] = v;
  }

  const unknown: string[] = [];
  let unmapped = 0;
  for (const attr of Object.keys(root.attrs)) {
    if (BY_ATTR.has(attr)) continue;
    if (KNOWN_FAMILY.test(attr)) unmapped++;
    else unknown.push(attr);
  }
  if (unmapped) warnings.push(`${unmapped} attribute(s) (modulation amounts, morph/arp/UI data) have no counterpart in the app config, not imported`);
  for (const attr of unknown) warnings.push(`${attr}: unknown Monique attribute ignored`);
  const morph = childrenNamed(root, 'LeftMorphData_0').length + childrenNamed(root, 'RightMorphData_0').length;
  if (morph) warnings.push('morph source snapshots (LeftMorphData/RightMorphData) not imported');
  if (present === 0) throw new ParseError(FORMAT, 'no recognised parameter attributes');

  const leaf = baseNameOf(fileName);
  return [{ name: leaf, synthType: 'Monique', config: { monique }, warnings }];
}

export function serialize(config: Record<string, unknown>): Uint8Array {
  const cfg = (config.monique ?? {}) as Record<string, number>;
  const attrs = TABLE.filter((t) => typeof cfg[t.key] === 'number').map((t) => `${t.attr}="${cfg[t.key]}"`);
  return new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?>\n\n<PROJECT-1.0 ${attrs.join('\n             ')}/>\n`);
}

