/**
 * convertOdinPresets.ts - Convert the Odin2 factory soundbank (.odin files) to
 * src/constants/odin2Presets.ts, keyed for the Odin2 WASM wrapper.
 *
 * Usage: npx tsx tools/convertOdinPresets.ts
 *
 * .odin = JUCE ValueTree::writeToStream of an "Odin" tree. PARAM children carry the raw
 * plugin value (dB, Hz, seconds); the misc and osc subtrees carry the filter/osc type
 * and waveform selections. The wrapper (juce-wasm/odin2/Odin2WASM.cpp) is a reduced engine
 * with 119 parameters, so each plugin value is converted to the wrapper's unit and range.
 * Mod matrix, LFO routing, arpeggiator, step sequencer and wavedraw tables have no
 * wrapper counterpart and are dropped.
 *
 * Output keys are the wrapper parameter names with non-alphanumerics removed and camelCased
 * ("Osc1:Pulse Width" -> osc1PulseWidth). VSTBridgeSynth.applyConfig matches them against the
 * WASM parameter names. Only values that differ from the wrapper default are written, because
 * a preset is always applied to a freshly built synth.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface VT { type: string; props: Record<string, unknown>; children: VT[] }

/** Decode a JUCE ValueTree::writeToStream blob. */
export function parseOdin(buf: Buffer): VT {
  let p = 0;
  const str = () => { let e = p; while (buf[e] !== 0) e++; const s = buf.toString('utf8', p, e); p = e + 1; return s; };
  const cint = () => { const b = buf[p++]; const n = b & 0x7f; let v = 0; for (let i = 0; i < n; i++) v |= buf[p++] << (8 * i); return (b & 0x80) ? -v : v; };
  const vr = (): unknown => {
    const size = cint(); if (size === 0) return undefined;
    const t = buf[p++]; const end = p + size - 1; let v: unknown;
    if (t === 1) v = buf.readInt32LE(p);
    else if (t === 4) v = buf.readDoubleLE(p);
    else if (t === 5) v = buf.toString('utf8', p, end - 1);
    else if (t === 2) v = true;
    else if (t === 3) v = false;
    else v = undefined;
    p = end; return v;
  };
  const tree = (): VT => {
    const type = str(); const np = cint(); const props: Record<string, unknown> = {};
    for (let i = 0; i < np; i++) { const k = str(); props[k] = vr(); }
    const nc = cint(); const children: VT[] = [];
    for (let i = 0; i < nc; i++) children.push(tree());
    return { type, props, children };
  };
  return tree();
}

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
export const ODIN_BANK_DIR = join(ROOT, 'third-party/odin2-master/assets/Soundbanks/Factory Presets');
const WRAPPER_CPP = join(ROOT, 'juce-wasm/odin2/Odin2WASM.cpp');
const OUT_FILE = join(ROOT, 'src/constants/odin2Presets.ts');

// Enum constants used in the wrapper's PARAM_DEFAULTS table (GlobalIncludes.h values).
const ENUMS: Record<string, number> = { OSC_TYPE_ANALOG: 2, FILTER_TYPE_LP24: 2, FILTER_TYPE_NONE: 1 };

function cppBlock(src: string, name: string): string {
  const start = src.indexOf(`${name}[PARAM_COUNT] = {`);
  if (start < 0) throw new Error(`wrapper table ${name} not found`);
  return src.slice(src.indexOf('{', start) + 1, src.indexOf('\n};', start)).replace(/\/\/[^\n]*/g, '');
}

export interface WrapperParam { name: string; key: string; def: number; min: number; max: number }

/** Read the wrapper's own parameter tables so names, defaults and ranges have one source. */
export function readWrapperParams(): WrapperParam[] {
  const src = readFileSync(WRAPPER_CPP, 'utf8');
  const names = [...cppBlock(src, 'static const char* PARAM_NAMES').matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const nums = (table: string): number[] => cppBlock(src, `static const float ${table}`)
    .split(',').map((t) => t.trim()).filter(Boolean)
    .map((t) => ENUMS[t.replace('(float)', '')] ?? parseFloat(t.replace(/f$/, '')));
  const defs = nums('PARAM_DEFAULTS'), mins = nums('PARAM_MINS'), maxs = nums('PARAM_MAXS');
  if (![defs, mins, maxs].every((a) => a.length === names.length)) {
    throw new Error(`wrapper tables disagree: ${names.length} names, ${defs.length}/${mins.length}/${maxs.length}`);
  }
  return names.map((name, i) => ({ name, key: paramKey(name), def: defs[i], min: mins[i], max: maxs[i] }));
}

/** "Osc1:Pulse Width" -> "osc1PulseWidth" (VSTBridgeSynth.applyConfig normalises to lowercase alphanumerics). */
export function paramKey(name: string): string {
  const words = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  return words.map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() : w.charAt(0).toUpperCase()) + w.slice(1)).join('');
}

const dbToLinear = (db: number): number => Math.pow(10, db / 20);

type Source = { params: Map<string, number>; misc: Record<string, unknown>; osc: Record<string, unknown> };
type Rule = (s: Source) => number | undefined;

const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : typeof v === 'string' && v !== '' && !isNaN(+v) ? +v : undefined);
const par = (id: string): Rule => (s) => s.params.get(id);
const parDb = (id: string): Rule => (s) => { const v = s.params.get(id); return v === undefined ? undefined : dbToLinear(v); };
const misc = (id: string): Rule => (s) => num(s.misc[id]);

function buildRules(): Record<string, Rule> {
  const r: Record<string, Rule> = {
    'Master:Gain': par('amp_gain'), 'Master:Pan': par('amp_pan'), 'Master:Glide': par('glide'),
    'Master:Velocity': par('amp_velocity'), 'Master:Unison Detune': par('unison_detune'),
    'Routing:F1 to Amp': par('fil1_to_amp'), 'Routing:F2 to Amp': par('fil2_to_amp'),
    'Filter2:Filter1': par('fil2_fil1'),
    'Distortion:On': misc('dist_on'), 'Distortion:Boost': par('dist_boost'), 'Distortion:Dry/Wet': par('dist_drywet'),
    'Delay:On': par('delay_on'), 'Delay:Time': par('delay_time'), 'Delay:Feedback': par('delay_feedback'),
    'Delay:HP': par('delay_hp'), 'Delay:Dry': par('delay_dry'), 'Delay:Wet': par('delay_wet'),
    'Phaser:On': par('phaser_on'), 'Phaser:Rate': par('phaser_rate'), 'Phaser:Mod': par('phaser_mod'),
    'Phaser:Feedback': par('phaser_feedback'), 'Phaser:Dry/Wet': par('phaser_drywet'),
    'Flanger:On': par('flanger_on'), 'Flanger:Rate': par('flanger_rate'), 'Flanger:Amount': par('flanger_amount'),
    'Flanger:Feedback': par('flanger_feedback'), 'Flanger:Dry/Wet': par('flanger_drywet'),
    'Chorus:On': par('chorus_on'), 'Chorus:Rate': par('chorus_rate'), 'Chorus:Amount': par('chorus_amount'),
    'Chorus:Feedback': par('chorus_feedback'), 'Chorus:Dry/Wet': par('chorus_drywet'),
  };
  for (let o = 1; o <= 3; o++) {
    const P = `Osc${o}`, id = `osc${o}`;
    // Plugin type 1 is "none"; the wrapper uses 0 for an unused oscillator.
    r[`${P}:Type`] = (s) => { const t = num(s.osc[`${id}_type`]); return t === 1 ? 0 : t; };
    r[`${P}:Vol`] = parDb(`${id}_vol`);
    r[`${P}:Octave`] = par(`${id}_oct`); r[`${P}:Semi`] = par(`${id}_semi`); r[`${P}:Fine`] = par(`${id}_fine`);
    // One wrapper Wave parameter: analog wave index, or 0-based wavetable index for wavetable and multi oscillators.
    r[`${P}:Wave`] = (s) => {
      const t = num(s.osc[`${id}_type`]);
      if (t === 2) return num(s.osc[`${id}_analog_wave`]);
      if (t === 3 || t === 4) { const w = num(s.osc[`${id}_wavetable`]); return w === undefined ? undefined : w - 1; }
      return 0;
    };
    r[`${P}:Pulse Width`] = par(`${id}_pulsewidth`); r[`${P}:Position`] = par(`${id}_position`);
    r[`${P}:FM Amt`] = par(`${id}_fm`); r[`${P}:Drift`] = par(`${id}_drift`);
    r[`${P}:Reset`] = par(`${id}_reset`);
    if (o > 1) r[`${P}:Sync`] = par(`${id}_sync`);
  }
  for (let f = 1; f <= 2; f++) {
    const P = `Filter${f}`, id = `fil${f}`;
    r[`${P}:Type`] = misc(`${id}_type`); r[`${P}:Frequency`] = par(`${id}_freq`); r[`${P}:Resonance`] = par(`${id}_res`);
    r[`${P}:Gain`] = parDb(`${id}_gain`); r[`${P}:Env Amt`] = par(`${id}_env`); r[`${P}:Saturation`] = par(`${id}_saturation`);
    r[`${P}:Velocity`] = par(`${id}_vel`); r[`${P}:Keyboard`] = par(`${id}_kbd`);
    for (let o = 1; o <= 3; o++) r[`${P}:Osc${o}`] = par(`${id}_osc${o}`);
  }
  for (let e = 1; e <= 3; e++) {
    for (const stage of ['Attack', 'Decay', 'Sustain', 'Release', 'Loop']) r[`Env${e}:${stage}`] = par(`env${e}_${stage.toLowerCase()}`);
  }
  return r;
}

export interface Odin2PresetData { name: string; category: string; params: Record<string, number> }

const round = (v: number): number => Number(v.toPrecision(4));

/** Strip author tags such as " [tx]" or " [RM]" from a file name. */
export function displayName(file: string): string {
  return basename(file, '.odin').replace(/\s*\[[^\]]*\]\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

export function listOdinFiles(dir = ODIN_BANK_DIR): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir).sort()) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...listOdinFiles(p));
    else if (f.endsWith('.odin')) out.push(p);
  }
  return out;
}

export function convertOdinFile(file: string, wrapper: WrapperParam[], rules: Record<string, Rule>): Odin2PresetData {
  const tree = parseOdin(readFileSync(file));
  const src: Source = { params: new Map(), misc: {}, osc: {} };
  for (const c of tree.children) {
    if (c.type === 'PARAM') src.params.set(c.props.id as string, c.props.value as number);
    else if (c.type === 'misc') src.misc = c.props;
    else if (c.type === 'osc') src.osc = c.props;
  }
  const params: Record<string, number> = {};
  for (const wp of wrapper) {
    const rule = rules[wp.name];
    if (!rule) continue;
    const raw = rule(src);
    if (raw === undefined || !isFinite(raw)) continue;
    const v = round(Math.min(wp.max, Math.max(wp.min, raw)));
    if (v !== round(wp.def)) params[wp.key] = v;
  }
  const rel = file.slice(ODIN_BANK_DIR.length + 1).split('/');
  return { name: displayName(file), category: rel.length > 1 ? rel[0] : 'Uncategorized', params };
}

export function convertOdinBank(): Odin2PresetData[] {
  const wrapper = readWrapperParams();
  const rules = buildRules();
  const known = new Set(wrapper.map((w) => w.name));
  for (const name of Object.keys(rules)) if (!known.has(name)) throw new Error(`rule for unknown wrapper parameter ${name}`);
  const files = listOdinFiles();
  const presets = files.map((f) => convertOdinFile(f, wrapper, rules));
  // Two files that differ only by author tag keep the tag, so every name stays unique within a category.
  const count = new Map<string, number>();
  for (const p of presets) count.set(`${p.category}/${p.name}`, (count.get(`${p.category}/${p.name}`) ?? 0) + 1);
  presets.forEach((p, i) => { if ((count.get(`${p.category}/${p.name}`) ?? 0) > 1) p.name = basename(files[i], '.odin'); });
  return presets;
}

function main(): void {
  const presets = convertOdinBank();
  const seen = new Set<string>();
  for (const p of presets) {
    const id = `${p.category}/${p.name}`;
    if (seen.has(id)) throw new Error(`duplicate preset ${id}`);
    seen.add(id);
  }
  const lines = presets.map((p) => `  ${JSON.stringify(p)},`);
  const header = `/**
 * Odin2 factory presets (GPL v3, The Wave Warden), converted from the plugin's .odin soundbank.
 * GENERATED by tools/convertOdinPresets.ts - do not edit by hand.
 *
 * params holds only values that differ from the wrapper default, keyed by wrapper parameter name
 * (see paramKey in the converter). Applied by VSTBridgeSynth.applyConfig via the 'odin2' config key.
 */
export interface Odin2PresetData { name: string; category: string; params: Record<string, number> }

export const ODIN2_PRESETS: readonly Odin2PresetData[] = [
`;
  writeFileSync(OUT_FILE, `${header}${lines.join('\n')}\n];\n`);
  console.log(`wrote ${presets.length} presets to ${OUT_FILE}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
