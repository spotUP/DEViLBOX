/**
 * Helm `.helm` patch (JSON). Format: third-party/helm-master/src/common/load_save.cpp
 * (stateToJson / jsonToState: `synth_version`, `patch_name`, `folder_name`, `author`, `settings{name: value}`,
 * `settings.modulations[{source,destination,amount}]`). Parameter table and ranges: helm_common.cpp
 * ValueDetailsLookup (tables/helmParams.ts). Parameter ids follow HELM_PARAMETER_ORDER in src/lib/helmPresetLoader.ts,
 * which is reused here, not copied.
 *
 * Config shape: Helm is a VSTBridge synth with no named config object; its parameters are addressed by name
 * (`buildHelmParameterUpdates` maps name -> id). config = { parameters: { [helm parameter name]: value } }.
 */
import { HELM_PARAMETER_ORDER, buildHelmParameterUpdates } from '../../helmPresetLoader';
import { HELM_PARAM_RANGES } from '../tables/helmParams';
import {
  ParseError, baseNameOf, bytesToText, clampReported, extensionOf, isRecord, parseJsonObject, textToBytes,
  tryJsonObject, type ParsedPreset,
} from '../types';

const FORMAT = 'Helm preset';

/** Same ordering rule as load_save.cpp compareVersionStrings: numeric dotted components. */
function versionAtMost(version: string, limit: string): boolean {
  const a = version.split('.').map((s) => parseInt(s, 10) || 0);
  const b = limit.split('.').map((s) => parseInt(s, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return true;
}

export function sniff(bytes: Uint8Array, fileName: string): boolean {
  const data = tryJsonObject(bytes);
  if (!data) return false;
  const named = extensionOf(fileName) === '.helm';
  if ('preset_name' in data) return false; // Vital
  return ('patch_name' in data && isRecord(data.settings)) || (named && (isRecord(data.settings) || 'osc_1_waveform' in data));
}

export function parse(bytes: Uint8Array, fileName: string): ParsedPreset[] {
  const data = parseJsonObject(bytesToText(bytes, FORMAT), FORMAT);
  const warnings: string[] = [];
  const version = typeof data.synth_version === 'string' ? data.synth_version : '0.4.1';

  // load_save.cpp: files up to 0.4.1 hold the settings at the top level.
  let settings: Record<string, unknown>;
  if (versionAtMost(version, '0.4.1') && !isRecord(data.settings)) settings = data;
  else if (isRecord(data.settings)) settings = { ...data.settings };
  else throw new ParseError(FORMAT, 'no "settings" object');

  if (versionAtMost(version, '0.5.0') && typeof settings.osc_mix === 'number') {
    const mix = Math.min(1, Math.max(0, settings.osc_mix));
    settings.osc_1_volume = Math.sqrt(1 - mix);
    settings.osc_2_volume = Math.sqrt(mix);
    delete settings.osc_mix;
  }

  if (Array.isArray(settings.modulations) && settings.modulations.length > 0) {
    warnings.push(`${settings.modulations.length} modulation connection(s) not imported (the engine takes parameters only)`);
  }

  const parameters: Record<string, number> = {};
  const known = new Set<string>(HELM_PARAMETER_ORDER);
  for (const [key, raw] of Object.entries(settings)) {
    if (key === 'modulations') continue;
    const range = HELM_PARAM_RANGES[key];
    if (!known.has(key) || !range) {
      warnings.push(`${key}: unknown Helm parameter ignored`);
      continue;
    }
    if (typeof raw !== 'number') {
      warnings.push(`${key}: non-numeric value ignored`);
      continue;
    }
    const v = clampReported(key, raw, range[0], range[1], warnings);
    if (v !== null) parameters[key] = v;
  }
  if (Object.keys(parameters).length === 0) throw new ParseError(FORMAT, 'no known parameters in "settings"');

  const name = typeof data.patch_name === 'string' && data.patch_name ? data.patch_name : baseNameOf(fileName);
  return [{ name, synthType: 'Helm', config: { parameters }, warnings }];
}

export function serialize(config: Record<string, unknown>, name = 'Init'): Uint8Array {
  const parameters = (config.parameters ?? {}) as Record<string, number>;
  // Writes only what buildHelmParameterUpdates would accept back (known names, finite numbers).
  const settings: Record<string, number> = {};
  for (const u of buildHelmParameterUpdates({ settings: parameters })) {
    settings[HELM_PARAMETER_ORDER[u.paramId]] = u.value;
  }
  return textToBytes(JSON.stringify({
    synth_version: '0.9.0', patch_name: name, folder_name: '', author: '', settings: { ...settings, modulations: [] },
  }, null, 2));
}
