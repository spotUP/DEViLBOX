/**
 * amsynth presets: `.amSynthPreset` / `Preset::toString` (single) and `.bank` / `PresetController::savePresets` (bank).
 * Format read from third-party/amsynth-master/src/core/synth/{Preset.cpp,PresetController.cpp}:
 *   bank:   line "amSynth", then per preset "<preset> <name> NAME" and "<parameter> NAME VALUE" lines, terminated by "EOF"
 *   single: "amSynth1.0preset", "<preset> <name> NAME", "<parameter> NAME VALUE" lines (token stream; the name runs to
 *           the first "<parameter>" token, words joined by one space)
 * Parameter table and ranges: Parameter.cpp ParameterSpecs (tables/amsynthParams.ts, generated); values are the
 * engine's real values, the same unit AMSynthConfig uses (src/engine/amsynth/AMSynthSynth.ts).
 *
 * Config shape: { amsynth: AMSynthConfig }.
 */
import { AMSYNTH_PARAMS } from '../tables/amsynthParams';
import { ParseError, baseNameOf, bytesToText, clampReported, textToBytes, type ParsedPreset } from '../types';

const FORMAT = 'amsynth preset';
const BY_UPSTREAM = new Map(AMSYNTH_PARAMS.map((p) => [p[0], p]));
const PRESET_PREFIX = '<preset> <name> ';
const PARAM_PREFIX = '<parameter> ';

function head(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes.subarray(0, 24));
}

export function sniff(bytes: Uint8Array, _fileName: string): boolean {
  const h = head(bytes);
  return h.startsWith('amSynth1.0preset') || h.startsWith('amSynth\n') || h.startsWith('amSynth\r\n');
}

interface Raw { name: string; values: Array<[string, string]> }

function readRaw(text: string): Raw[] {
  const firstEol = text.search(/\r?\n/);
  const header = (firstEol < 0 ? text : text.slice(0, firstEol)).trim();
  const out: Raw[] = [];

  if (header === 'amSynth') {
    let cur: Raw | null = null;
    for (const line of text.slice(firstEol + 1).split(/\r?\n/)) {
      if (line.startsWith(PRESET_PREFIX)) {
        cur = { name: line.slice(PRESET_PREFIX.length).trim(), values: [] };
        out.push(cur);
      } else if (line.startsWith(PARAM_PREFIX)) {
        if (!cur) throw new ParseError(FORMAT, '<parameter> line before any <preset>');
        const rest = line.slice(PARAM_PREFIX.length);
        const sep = rest.indexOf(' ');
        if (sep > 0) cur.values.push([rest.slice(0, sep), rest.slice(sep + 1).trim()]);
      }
    }
    return out;
  }

  if (header === 'amSynth1.0preset') {
    const tokens = text.slice(firstEol + 1).split(/\s+/).filter(Boolean);
    let i = 0;
    if (tokens[i++] !== '<preset>' || tokens[i++] !== '<name>') throw new ParseError(FORMAT, 'missing "<preset> <name>"');
    const words: string[] = [];
    while (i < tokens.length && tokens[i] !== '<parameter>') words.push(tokens[i++]);
    const cur: Raw = { name: words.join(' '), values: [] };
    while (i < tokens.length && tokens[i] === '<parameter>') {
      const name = tokens[i + 1];
      const value = tokens[i + 2];
      if (name === undefined || value === undefined) throw new ParseError(FORMAT, 'truncated <parameter> entry');
      cur.values.push([name, value]);
      i += 3;
    }
    return [cur];
  }
  throw new ParseError(FORMAT, 'not an amSynth bank or preset (bad header line)');
}

export function parse(bytes: Uint8Array, fileName: string): ParsedPreset[] {
  const raw = readRaw(bytesToText(bytes, FORMAT));
  if (raw.length === 0) throw new ParseError(FORMAT, 'no presets in file');
  return raw.filter((r) => r.name !== 'unused').map((r, n) => {
    const warnings: string[] = [];
    const amsynth: Record<string, number> = {};
    for (const [upstream, text] of r.values) {
      if (upstream === 'unused') continue; // Preset::fromString skips it too
      const spec = BY_UPSTREAM.get(upstream);
      if (!spec) {
        warnings.push(`${upstream}: unknown amsynth parameter ignored`);
        continue;
      }
      const value = Number(text);
      if (text === '' || Number.isNaN(value)) {
        warnings.push(`${upstream}: "${text}" is not a number, ignored`);
        continue;
      }
      const v = clampReported(upstream, value, spec[2], spec[3], warnings);
      if (v !== null) amsynth[spec[1]] = v;
    }
    if (Object.keys(amsynth).length === 0) throw new ParseError(FORMAT, `preset "${r.name}" has no parameters`);
    return { name: r.name || `${baseNameOf(fileName)} ${n + 1}`, synthType: 'Amsynth', config: { amsynth }, warnings };
  });
}

/** One bank file holding every given preset (config = { amsynth }). */
export function serialize(config: Record<string, unknown>, name = 'Init'): Uint8Array {
  return serializeBank([{ name, config }]);
}

export function serializeBank(presets: ReadonlyArray<{ name: string; config: Record<string, unknown> }>): Uint8Array {
  const lines = ['amSynth'];
  for (const p of presets) {
    const cfg = (p.config.amsynth ?? {}) as Record<string, number>;
    lines.push(`${PRESET_PREFIX}${p.name}`);
    for (const [upstream, key] of AMSYNTH_PARAMS) {
      const v = cfg[key];
      if (typeof v === 'number' && Number.isFinite(v)) lines.push(`${PARAM_PREFIX}${upstream} ${v}`);
    }
  }
  lines.push('EOF');
  return textToBytes(lines.join('\n') + '\n');
}
