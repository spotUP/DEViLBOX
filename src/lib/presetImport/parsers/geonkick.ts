/**
 * Geonkick `.gkick` percussion preset (JSON): top-level `kick` block plus `osc0`..`osc8`.
 * The field set is the one src/engine/geonkick/GeonkickPresetLoader.ts reads (it mirrors upstream InstrumentState.cpp,
 * which is NOT vendored under third-party/ - only the dsp directory is - so the 82 shipped presets in
 * public/geonkick/presets are the real-file reference). Ranges follow the clamps GeonkickEngine.ts applies to its setters.
 *
 * Config shape (GeonkickConfig, src/types/instrument/exotic.ts): { geonkick: { name, preset } } where `preset` is the
 * cleaned `.gkick` object that applyGeonkickPreset consumes. Fields the loader does not read (compressor, sample,
 * channel/id metadata) are dropped and listed in warnings.
 */
import {
  ParseError, baseNameOf, bytesToText, clampReported, isRecord, parseJsonObject, textToBytes, tryJsonObject,
  type ParsedPreset,
} from '../types';

const FORMAT = 'Geonkick preset';
const OSC_COUNT = 9;

type Obj = Record<string, unknown>;

export function sniff(bytes: Uint8Array, _fileName: string): boolean {
  const d = tryJsonObject(bytes);
  if (!d) return false;
  return isRecord(d.kick) || Object.keys(d).some((k) => /^osc[0-8]$/.test(k));
}

function points(path: string, v: unknown, warnings: string[]): number[][] | undefined {
  if (!Array.isArray(v)) {
    if (v !== undefined) warnings.push(`${path}: not a point list, ignored`);
    return undefined;
  }
  const out: number[][] = [];
  for (const p of v) {
    if (!Array.isArray(p) || p.length < 2 || typeof p[0] !== 'number' || typeof p[1] !== 'number') {
      warnings.push(`${path}: malformed point skipped`);
      continue;
    }
    const x = clampReported(`${path}.x`, p[0], 0, 1, warnings);
    const y = clampReported(`${path}.y`, p[1], 0, 1, warnings);
    if (x !== null && y !== null) out.push([x, y]);
  }
  return out;
}

/** Copy `src[key]` (number) into `dst[key]` clamped; absent keys stay absent. */
function num(src: Obj, dst: Obj, key: string, path: string, min: number | null, max: number | null, warnings: string[], integer = false): void {
  const v = src[key];
  if (v === undefined) return;
  if (typeof v !== 'number') {
    warnings.push(`${path}.${key}: non-numeric value ignored`);
    return;
  }
  const c = clampReported(`${path}.${key}`, integer ? Math.round(v) : v, min, max, warnings);
  if (c !== null) dst[key] = c;
}

function bool(src: Obj, dst: Obj, key: string, path: string, warnings: string[]): void {
  const v = src[key];
  if (v === undefined) return;
  if (typeof v !== 'boolean') warnings.push(`${path}.${key}: not a boolean, ignored`);
  else dst[key] = v;
}

function warnUnknown(src: Obj, known: readonly string[], path: string, warnings: string[]): void {
  const extra = Object.keys(src).filter((k) => !known.includes(k));
  if (extra.length) warnings.push(`${path}: not carried over: ${extra.join(', ')}`);
}

function filter(src: unknown, path: string, warnings: string[]): Obj | undefined {
  if (!isRecord(src)) return undefined;
  const out: Obj = {};
  bool(src, out, 'enabled', path, warnings);
  num(src, out, 'type', path, 0, 2, warnings, true);
  num(src, out, 'cutoff', path, 20, 20000, warnings);
  num(src, out, 'factor', path, 0.1, 20, warnings);
  const env = points(`${path}.cutoff_env`, src.cutoff_env, warnings);
  if (env) out.cutoff_env = env;
  warnUnknown(src, ['enabled', 'type', 'cutoff', 'factor', 'cutoff_env'], path, warnings);
  return out;
}

function envelope(src: unknown, path: string, ampMax: number, warnings: string[]): Obj | undefined {
  if (!isRecord(src)) return undefined;
  const out: Obj = {};
  num(src, out, 'amplitude', path, 0, ampMax, warnings);
  const pts = points(`${path}.points`, src.points, warnings);
  if (pts) out.points = pts;
  warnUnknown(src, ['amplitude', 'points'], path, warnings);
  return out;
}

function oscillator(src: Obj, path: string, warnings: string[]): Obj {
  const out: Obj = {};
  bool(src, out, 'enabled', path, warnings);
  bool(src, out, 'is_fm', path, warnings);
  num(src, out, 'function', path, 0, 7, warnings, true);
  num(src, out, 'phase', path, 0, Math.PI * 2, warnings);
  num(src, out, 'seed', path, 0, null, warnings, true);
  const amp = envelope(src.ampl_env, `${path}.ampl_env`, 1, warnings);
  if (amp) out.ampl_env = amp;
  const freq = envelope(src.freq_env, `${path}.freq_env`, 20000, warnings);
  if (freq) out.freq_env = freq;
  const ps = envelope(src.pitchshift_env, `${path}.pitchshift_env`, 1e6, warnings);
  if (ps) out.pitchshift_env = ps;
  const f = filter(src.filter, `${path}.filter`, warnings);
  if (f) out.filter = f;
  warnUnknown(src, ['enabled', 'is_fm', 'function', 'phase', 'seed', 'ampl_env', 'freq_env', 'pitchshift_env', 'filter'], path, warnings);
  return out;
}

export function parse(bytes: Uint8Array, fileName: string): ParsedPreset[] {
  const data = parseJsonObject(bytesToText(bytes, FORMAT), FORMAT);
  const hasOsc = Object.keys(data).some((k) => /^osc[0-8]$/.test(k));
  if (!isRecord(data.kick) && !hasOsc) throw new ParseError(FORMAT, 'neither a "kick" block nor oscN blocks');
  const warnings: string[] = [];
  const preset: Obj = {};

  if (isRecord(data.kick)) {
    const k = data.kick;
    const kick: Obj = {};
    if (typeof k.name === 'string') kick.name = k.name;
    num(k, kick, 'limiter', 'kick', 0, null, warnings);
    bool(k, kick, 'tuned_output', 'kick', warnings);
    if (Array.isArray(k.layers)) {
      kick.layers = k.layers.filter((g): g is number => {
        const ok = typeof g === 'number' && Number.isInteger(g) && g >= 0 && g <= 2;
        if (!ok) warnings.push(`kick.layers: invalid group ${JSON.stringify(g)} skipped`);
        return ok;
      });
    }
    if (Array.isArray(k.layers_amplitude)) {
      kick.layers_amplitude = k.layers_amplitude.slice(0, 3).map((a, i) =>
        (typeof a === 'number' ? clampReported(`kick.layers_amplitude[${i}]`, a, 0, 1, warnings) : null) ?? 1);
    }
    if (isRecord(k.ampl_env)) {
      const e = k.ampl_env;
      const ae: Obj = {};
      num(e, ae, 'length', 'kick.ampl_env', 50, 4000, warnings); // milliseconds (loader divides by 1000; engine clamps 0.05..4 s)
      num(e, ae, 'amplitude', 'kick.ampl_env', 0, 1.5, warnings);
      const pts = points('kick.ampl_env.points', e.points, warnings);
      if (pts) ae.points = pts;
      warnUnknown(e, ['length', 'amplitude', 'points'], 'kick.ampl_env', warnings);
      kick.ampl_env = ae;
    }
    const kf = filter(k.filter, 'kick.filter', warnings);
    if (kf) kick.filter = kf;
    if (isRecord(k.distortion)) {
      const d = k.distortion;
      const dd: Obj = {};
      bool(d, dd, 'enabled', 'kick.distortion', warnings);
      num(d, dd, 'drive', 'kick.distortion', 0, 10, warnings);
      num(d, dd, 'volume', 'kick.distortion', 0, 2, warnings);
      for (const env of ['drive_env', 'volume_env']) {
        const pts = points(`kick.distortion.${env}`, d[env], warnings);
        if (pts) dd[env] = pts;
      }
      warnUnknown(d, ['enabled', 'drive', 'volume', 'drive_env', 'volume_env', 'in_limiter'], 'kick.distortion', warnings);
      kick.distortion = dd;
    }
    warnUnknown(k, [
      'name', 'limiter', 'tuned_output', 'layers', 'layers_amplitude', 'ampl_env', 'filter', 'distortion',
      'PercussionAppVersion', 'id', 'channel', 'playing_key', 'mute', 'solo', 'midiChannel',
    ], 'kick', warnings);
    preset.kick = kick;
  }
  for (let i = 0; i < OSC_COUNT; i++) {
    const o = data[`osc${i}`];
    if (o === undefined) continue;
    if (!isRecord(o)) {
      warnings.push(`osc${i}: not an object, ignored`);
      continue;
    }
    preset[`osc${i}`] = oscillator(o, `osc${i}`, warnings);
  }
  const known = new Set(['kick', ...Array.from({ length: OSC_COUNT }, (_, i) => `osc${i}`)]);
  const extra = Object.keys(data).filter((k) => !known.has(k));
  if (extra.length) warnings.push(`top level: not carried over: ${extra.join(', ')}`);

  const kickName = isRecord(data.kick) && typeof data.kick.name === 'string' ? data.kick.name : '';
  const name = kickName || baseNameOf(fileName);
  return [{ name, synthType: 'Geonkick', config: { geonkick: { name, preset } }, warnings }];
}

export function serialize(config: Record<string, unknown>): Uint8Array {
  const g = config.geonkick;
  if (!isRecord(g) || !isRecord(g.preset)) throw new ParseError(FORMAT, 'config has no geonkick.preset');
  return textToBytes(JSON.stringify(g.preset, null, 2));
}
