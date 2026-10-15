/**
 * Vital `.vital` preset (JSON). Format: third-party/vital-main/src/common/load_save.cpp
 * (stateToJson: `synth_version`, `preset_name`, `author`, `comments`, `preset_style`, `macro1..4`,
 * `settings{control: value, sample, modulations[], wavetables[], lfos[]}`). Parameter ranges: synth_parameters.cpp
 * (tables/vitalParams.ts, generated; bounds that are C++ constant expressions are left open on that side).
 *
 * Config shape: Vital is a VSTBridge synth addressed by parameter name (VitalControls.tsx looks names up in the WASM
 * metadata). config = { parameters: { [vital control name]: value } }. Wavetables, LFO line shapes, the sample and
 * modulation routings cannot be loaded by the WASM today (VitalWASM.cpp handleCommand returns false) and are reported.
 */
import { VITAL_PARAM_RANGES } from '../tables/vitalParams';
import {
  ParseError, baseNameOf, bytesToText, clampReported, extensionOf, isRecord, parseJsonObject, textToBytes,
  tryJsonObject, type ParsedPreset,
} from '../types';

const FORMAT = 'Vital preset';
/** settings entries that are structures, not controls. */
const STRUCTURES = new Set(['sample', 'modulations', 'wavetables', 'lfos']);

export function sniff(bytes: Uint8Array, fileName: string): boolean {
  const data = tryJsonObject(bytes);
  if (!data || !isRecord(data.settings)) return false;
  return 'preset_name' in data || extensionOf(fileName) === '.vital';
}

export function parse(bytes: Uint8Array, fileName: string): ParsedPreset[] {
  const data = parseJsonObject(bytesToText(bytes, FORMAT), FORMAT);
  if (!isRecord(data.settings)) throw new ParseError(FORMAT, 'no "settings" object');
  const warnings: string[] = [];
  const parameters: Record<string, number> = {};

  for (const [key, raw] of Object.entries(data.settings)) {
    if (STRUCTURES.has(key)) {
      if (key === 'modulations') {
        const used = Array.isArray(raw)
          ? raw.filter((m) => isRecord(m) && typeof m.source === 'string' && m.source !== '' && m.destination !== '').length
          : 0;
        if (used > 0) warnings.push(`${used} modulation routing(s) not imported (WASM has no routing loader)`);
      } else if (key === 'wavetables' || key === 'lfos' || key === 'sample') {
        warnings.push(`${key}: not imported (WASM has no ${key} loader)`);
      } else {
        warnings.push(`${key}: not imported`);
      }
      continue;
    }
    const range = VITAL_PARAM_RANGES[key];
    if (!range) {
      warnings.push(`${key}: unknown Vital control ignored`);
      continue;
    }
    if (typeof raw !== 'number') {
      warnings.push(`${key}: non-numeric value ignored`);
      continue;
    }
    const v = clampReported(key, raw, range[0], range[1], warnings);
    if (v !== null) parameters[key] = v;
  }
  if (Object.keys(parameters).length === 0) throw new ParseError(FORMAT, 'no known controls in "settings"');

  const name = typeof data.preset_name === 'string' && data.preset_name ? data.preset_name : baseNameOf(fileName);
  return [{ name, synthType: 'Vital', config: { parameters }, warnings }];
}

export function serialize(config: Record<string, unknown>, name = 'Init'): Uint8Array {
  const parameters = (config.parameters ?? {}) as Record<string, number>;
  const settings: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parameters)) if (k in VITAL_PARAM_RANGES && Number.isFinite(v)) settings[k] = v;
  settings.modulations = [];
  return textToBytes(JSON.stringify({
    synth_version: '1.5.5', preset_name: name, author: '', comments: '', preset_style: '', settings,
  }, null, 2));
}
