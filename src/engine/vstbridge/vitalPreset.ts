/**
 * Vital preset loading: the single path every preset source uses (bundled pick, file import,
 * default on a new instrument). A preset is the .vital JSON; the WASM wrapper applies the whole
 * state (controls, modulation routing, wavetables, LFO shapes) through the VSTBridge
 * extension command 'loadPreset' (juce-wasm/vital/VitalWASM.cpp handleCommand).
 */
import { VITAL_PRESETS, type VitalPresetEntry } from '@constants/vitalPresetIndex';

/** Bundled preset a new Vital instrument starts on (Bass, CC0, abstractionmage/Vital-Presets). */
export const DEFAULT_VITAL_PRESET_ID = 'abstractionmage/Curious Bass';

/** Key in InstrumentConfig.parameters that holds the bundled preset id. */
export const VITAL_PRESET_PARAM_KEY = 'vitalPreset';

export function findVitalPreset(id: string): VitalPresetEntry | undefined {
  return VITAL_PRESETS.find((p) => p.id === id);
}

/** Minimal surface of VSTBridgeSynth the loader needs. */
export interface VitalCommandTarget {
  sendCommand(commandType: string, data?: Uint8Array): Promise<boolean>;
}

/** Fetch a bundled preset file (lazy: only when picked). */
export async function fetchBundledVitalPreset(entry: VitalPresetEntry): Promise<Uint8Array> {
  const res = await fetch(encodeURI(entry.path));
  // A missing bank is a 404, or index.html with 200 behind a dev-server SPA fallback.
  const isHtml = (res.headers.get('content-type') ?? '').includes('text/html');
  if (!res.ok || isHtml) {
    throw new Error(
      'the preset bank is not installed. Run "npm run presets:sync" (the devilbox-presets repository clones into public/data/presets).',
    );
  }
  return new Uint8Array(await res.arrayBuffer());
}

/** Send preset JSON bytes to the synth. Resolves true when the WASM accepted the preset. */
export function loadVitalPresetBytes(synth: VitalCommandTarget, bytes: Uint8Array): Promise<boolean> {
  return synth.sendCommand('loadPreset', bytes);
}

/** Bundled preset by id: fetch, then the shared load path. */
export async function loadBundledVitalPreset(synth: VitalCommandTarget, id: string): Promise<boolean> {
  const entry = findVitalPreset(id);
  if (!entry) return false;
  return loadVitalPresetBytes(synth, await fetchBundledVitalPreset(entry));
}

/** Numeric control values of a .vital file (for UI display only; the WASM applies the real state). */
export function vitalPresetControlValues(bytes: Uint8Array): Record<string, number> {
  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
  const settings = (parsed as { settings?: Record<string, unknown> } | null)?.settings;
  const out: Record<string, number> = {};
  if (settings && typeof settings === 'object') {
    for (const [k, v] of Object.entries(settings)) if (typeof v === 'number') out[k] = v;
  }
  return out;
}
