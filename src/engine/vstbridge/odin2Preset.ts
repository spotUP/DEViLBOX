/**
 * Odin2 preset loading: the single path every preset source uses (bundled pick, file import,
 * default on a new instrument). A preset is the plugin's own .odin state; the WASM wrapper hands it
 * to OdinAudioProcessor::setStateInformation through the VSTBridge extension command 'loadPreset'
 * (juce-wasm/odin2/Odin2WASM.cpp handleCommand), so the mod matrix, arpeggiator, step sequencer and
 * the oscillator/filter type selections all load.
 */
import { ODIN2_PRESETS, type Odin2PresetEntry } from '@constants/odin2PresetIndex';

/** Bundled preset a new Odin2 instrument starts on (factory Bass, [XR]). */
export const DEFAULT_ODIN2_PRESET_ID = 'factory/Bass/Growly FM Bass';

/** Key in InstrumentConfig.parameters that holds the bundled preset id. */
export const ODIN2_PRESET_PARAM_KEY = 'odin2Preset';

export function findOdin2Preset(id: string): Odin2PresetEntry | undefined {
  return ODIN2_PRESETS.find((p) => p.id === id);
}

/** Minimal surface of VSTBridgeSynth the loader needs. */
export interface Odin2CommandTarget {
  sendCommand(commandType: string, data?: Uint8Array): Promise<boolean>;
}

/** Fetch a bundled preset file (lazy: only when picked). */
export async function fetchBundledOdin2Preset(entry: Odin2PresetEntry): Promise<Uint8Array> {
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

/** Send .odin bytes to the synth. Resolves true when the WASM accepted the state. */
export function loadOdin2PresetBytes(synth: Odin2CommandTarget, bytes: Uint8Array): Promise<boolean> {
  return synth.sendCommand('loadPreset', bytes);
}

/** Bundled preset by id: fetch, then the shared load path. */
export async function loadBundledOdin2Preset(synth: Odin2CommandTarget, id: string): Promise<boolean> {
  const entry = findOdin2Preset(id);
  if (!entry) return false;
  return loadOdin2PresetBytes(synth, await fetchBundledOdin2Preset(entry));
}

/** Oscillator, filter and wave selectors live in the ValueTree, not in the parameter list. */
export type Odin2SelectorTree = 'osc' | 'misc';

/** Set one ValueTree selector ("osc.osc1_type=3"); the engine switches the DSP like the plugin GUI does. */
export function setOdin2Selector(synth: Odin2CommandTarget, tree: Odin2SelectorTree, property: string, value: number): Promise<boolean> {
  return synth.sendCommand('setValueTreeProperty', new TextEncoder().encode(`${tree}.${property}=${value}`));
}
