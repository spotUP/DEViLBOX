/**
 * Tunefish 4 program text (`programN.txt`): line 1 = program name, then one `Key;value` line per engine parameter.
 * Real files: third-party/tunefish/patches/tf4programs/ (92 files, 112 parameters each). Key names and order:
 * TF_NAMES[] in third-party/tunefish/src/tunefish4/Source/synth/tf4.hpp (tables/tunefishParams.ts, generated); all values
 * are normalised 0..1 (eTfSynthProgram stores them as the engine's own params).
 *
 * Config shape: { tunefish: TunefishInstrumentConfig } for the 54 keys the app config carries (TUNEFISH_CONFIG_PARAM in
 * src/types/tunefishInstrument.ts), plus `native.values` = all 112 engine parameters in index order (what
 * TunefishSynth.setParameters takes), so the envelopes, LFOs and modulation matrix that the config cannot hold still arrive.
 */
import { TUNEFISH_PARAMS } from '../tables/tunefishParams';
import { ParseError, baseNameOf, bytesToText, clampReported, textToBytes, type ParsedPreset } from '../types';

const FORMAT = 'Tunefish program';
const BY_NAME = new Map(TUNEFISH_PARAMS.map((p, i) => [p[0], i]));

export function sniff(bytes: Uint8Array, _fileName: string): boolean {
  if (bytes.length < 16 || bytes.length > 64 * 1024) return false;
  const lines = new TextDecoder('utf-8').decode(bytes).split(/\r?\n/);
  if (lines.length < 3 || lines[0].includes(';')) return false;
  return /^Gain;-?[0-9.]+$/.test(lines[1].trim());
}

export function parse(bytes: Uint8Array, fileName: string): ParsedPreset[] {
  const lines = bytesToText(bytes, FORMAT).split(/\r?\n/);
  if (lines.length < 2 || lines[0].includes(';')) throw new ParseError(FORMAT, 'first line must be the program name');
  const warnings: string[] = [];
  const values: number[] = new Array(TUNEFISH_PARAMS.length).fill(NaN);
  const tunefish: Record<string, number> = {};
  let set = 0;

  for (let ln = 1; ln < lines.length; ln++) {
    const line = lines[ln].trim();
    if (!line) continue;
    const semi = line.indexOf(';');
    if (semi < 0) {
      warnings.push(`line ${ln + 1}: no ";" separator, ignored`);
      continue;
    }
    const key = line.slice(0, semi).trim();
    const idx = BY_NAME.get(key);
    if (idx === undefined) {
      warnings.push(`${key}: unknown Tunefish parameter ignored`);
      continue;
    }
    const raw = Number(line.slice(semi + 1).trim());
    if (Number.isNaN(raw)) {
      warnings.push(`${key}: "${line.slice(semi + 1).trim()}" is not a number, ignored`);
      continue;
    }
    const v = clampReported(key, raw, 0, 1, warnings);
    if (v === null) continue;
    values[idx] = v;
    const cfgKey = TUNEFISH_PARAMS[idx][1];
    if (cfgKey) tunefish[cfgKey] = v;
    set++;
  }
  if (set === 0) throw new ParseError(FORMAT, 'no "Key;value" lines');
  const missing = values.filter((v) => Number.isNaN(v)).length;
  if (missing > 0) {
    warnings.push(`${missing} parameter(s) absent from the file; native.values holds 0 for them`);
    for (let i = 0; i < values.length; i++) if (Number.isNaN(values[i])) values[i] = 0;
  }
  const name = lines[0].trim() || baseNameOf(fileName);
  return [{ name, synthType: 'TunefishSynth', config: { tunefish }, native: { values }, warnings }];
}

/** Writes the full 112-line program from `native.values` when given, else from config.tunefish (absent keys 0). */
export function serialize(config: Record<string, unknown>, name = 'Init', native?: { values: number[] }): Uint8Array {
  const cfg = (config.tunefish ?? {}) as Record<string, number>;
  const rows = TUNEFISH_PARAMS.map(([key, cfgKey], i) => `${key};${native?.values[i] ?? (cfgKey && typeof cfg[cfgKey] === 'number' ? cfg[cfgKey] : 0)}`);
  return textToBytes([name, ...rows].join('\n') + '\n');
}
