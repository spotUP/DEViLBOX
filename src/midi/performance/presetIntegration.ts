/**
 * NKS Preset Integration
 *
 * Converts between DEViLBOX InstrumentConfig presets and NKS preset format.
 * Enables:
 * - Saving DEViLBOX presets as .nksf files for NI hardware
 * - Loading .nksf files as DEViLBOX instruments
 * - Bidirectional sync between preset systems
 */

import type { InstrumentConfig, SynthType } from '@typedefs/instrument';
import type { NKSPreset, NKSPresetMetadata, NKSParameter } from './types';
import { NKS_CONSTANTS } from './types';
import { getNKSParametersForSynth } from './synthParameterMaps';
import { writeNKSF, parseNKSF } from './NKSFileFormat';
import type { UserPreset, PresetCategory } from '@/stores/usePresetStore';
import {
  CATEGORY_TO_NKS_TYPE,
  getNKSTypeForSynth,
  nksTypeToCategory,
  validateCharacterTags,
  isValidNKSInstrumentType,
} from './nksTaxonomy';

/**
 * Map DEViLBOX preset category to NKS bank chain (uses official taxonomy)
 */
const CATEGORY_TO_BANK_CHAIN: Record<PresetCategory, string[]> = {
  Bass: CATEGORY_TO_NKS_TYPE.Bass.bankChain,
  Lead: CATEGORY_TO_NKS_TYPE.Lead.bankChain,
  Pad:  CATEGORY_TO_NKS_TYPE.Pad.bankChain,
  Drum: CATEGORY_TO_NKS_TYPE.Drum.bankChain,
  FX:   CATEGORY_TO_NKS_TYPE.FX.bankChain,
  User: CATEGORY_TO_NKS_TYPE.User.bankChain,
};

/**
 * Map NKS bank chain to DEViLBOX category (uses official taxonomy)
 */
function bankChainToCategory(bankChain: string[]): PresetCategory {
  // Check if any part of the bank chain matches an NKS type
  for (const part of bankChain) {
    if (isValidNKSInstrumentType(part)) {
      return nksTypeToCategory(part);
    }
  }

  // Fall back to keyword matching
  const combined = bankChain.join(' ').toLowerCase();
  if (combined.includes('bass')) return 'Bass';
  if (combined.includes('lead') || combined.includes('synth lead')) return 'Lead';
  if (combined.includes('pad') || combined.includes('ambient') || combined.includes('soundscape')) return 'Pad';
  if (combined.includes('drum') || combined.includes('perc')) return 'Drum';
  if (combined.includes('fx') || combined.includes('effect') || combined.includes('sound effect')) return 'FX';

  return 'User';
}

/**
 * Map NKS types/modes to DEViLBOX tags
 */
function nksTypesToTags(types?: string[][], modes?: string[]): string[] {
  const tags: string[] = [];

  if (types) {
    // types is [[type, subType], ...] - flatten to individual tags
    tags.push(...types.flat().filter(Boolean).map(t => t.toLowerCase()));
  }
  if (modes) {
    tags.push(...modes.map(m => m.toLowerCase()));
  }

  return [...new Set(tags)]; // Dedupe
}

/**
 * Map DEViLBOX tags to NKS types/modes (validated against official taxonomy)
 */
function tagsToNKSTypes(tags: string[]): { types: string[]; modes: string[] } {
  const types: string[] = [];
  // "modes" in NKS are actually Character tags
  const modes = validateCharacterTags(tags);

  // Check if any tags match official NKS instrument types
  for (const tag of tags) {
    if (isValidNKSInstrumentType(tag)) {
      types.push(tag);
    }
  }

  // If no types matched, try keyword inference
  if (types.length === 0) {
    const combined = tags.join(' ').toLowerCase();
    if (combined.includes('bass')) types.push('Bass');
    else if (combined.includes('lead')) types.push('Synth Lead');
    else if (combined.includes('pad')) types.push('Synth Pad');
    else if (combined.includes('drum') || combined.includes('perc')) types.push('Drums');
    else if (combined.includes('fx') || combined.includes('effect')) types.push('Sound Effects');
    else if (combined.includes('key') || combined.includes('piano')) types.push('Piano / Keys');
    else if (combined.includes('organ')) types.push('Organ');
    else if (combined.includes('vocal') || combined.includes('voice')) types.push('Vocal');
    else if (combined.includes('string')) types.push('Bowed Strings');
    else if (combined.includes('brass')) types.push('Brass');
  }

  return { types, modes };
}

/**
 * Extract NKS parameter values from InstrumentConfig
 */
function extractParameterValues(
  config: InstrumentConfig,
  parameters: NKSParameter[]
): Record<string, number> {
  const values: Record<string, number> = {};
  const synthType = config.synthType.toLowerCase();

  for (const param of parameters) {
    // Extract the config path from param.id (e.g., 'tb303.cutoff' -> 'cutoff')
    const paramPath = param.id.replace(`${synthType}.`, '').split('.');

    // Navigate to find the value in the config
    let value: unknown = config;

    // First, try synth-specific config (e.g., config.tb303.cutoff)
    const synthConfig = (config as unknown as Record<string, unknown>)[synthType];
    if (synthConfig && typeof synthConfig === 'object') {
      value = synthConfig;
    }

    for (const key of paramPath) {
      if (value && typeof value === 'object' && key in (value as Record<string, unknown>)) {
        value = (value as Record<string, unknown>)[key];
      } else {
        // Try alternative paths
        if (key === 'cutoff' && config.filter?.frequency !== undefined) {
          value = config.filter.frequency;
          break;
        }
        if (key === 'resonance' && config.filter?.Q !== undefined) {
          value = config.filter.Q;
          break;
        }
        if (key === 'attack' && config.envelope?.attack !== undefined) {
          value = config.envelope.attack;
          break;
        }
        if (key === 'decay' && config.envelope?.decay !== undefined) {
          value = config.envelope.decay;
          break;
        }
        if (key === 'sustain' && config.envelope?.sustain !== undefined) {
          value = config.envelope.sustain;
          break;
        }
        if (key === 'release' && config.envelope?.release !== undefined) {
          value = config.envelope.release;
          break;
        }
        value = undefined;
        break;
      }
    }

    // Convert value to normalized 0-1 range
    if (typeof value === 'number') {
      const normalized = (value - param.min) / (param.max - param.min);
      values[param.id] = Math.max(0, Math.min(1, normalized));
    } else if (typeof value === 'boolean') {
      values[param.id] = value ? 1 : 0;
    } else if (typeof value === 'string' && param.valueStrings) {
      const index = param.valueStrings.indexOf(value);
      if (index !== -1) {
        values[param.id] = index / Math.max(1, param.valueStrings.length - 1);
      } else {
        values[param.id] = param.defaultValue;
      }
    } else {
      // Use default value
      values[param.id] = param.defaultValue;
    }
  }

  return values;
}

/**
 * Convert DEViLBOX InstrumentConfig to NKS Preset
 */
export function instrumentConfigToNKSPreset(
  config: InstrumentConfig,
  options?: {
    name?: string;
    author?: string;
    comment?: string;
    category?: PresetCategory;
    tags?: string[];
  }
): NKSPreset {
  const synthType = config.synthType;
  const parameters = getNKSParametersForSynth(synthType);
  const parameterValues = extractParameterValues(config, parameters);

  const { types, modes } = tagsToNKSTypes(options?.tags || []);
  const bankChain = options?.category
    ? CATEGORY_TO_BANK_CHAIN[options.category]
    : ['DEViLBOX', config.synthType];

  // Get NKS type info from taxonomy for this synth
  const nksInfo = getNKSTypeForSynth(synthType, options?.category);

  // Use explicit tags if provided, otherwise use taxonomy defaults
  const finalTypes = types.length > 0 ? types.map(t => [t]) : [[nksInfo.type]];
  const finalModes = modes.length > 0 ? modes : nksInfo.characters;

  const metadata: NKSPresetMetadata = {
    vendor: NKS_CONSTANTS.VENDOR_ID,
    uuid: NKS_CONSTANTS.PLUGIN_UUID,
    version: '1.0',
    name: options?.name || config.name,
    author: options?.author || 'DEViLBOX User',
    comment: options?.comment || `${synthType} preset for DEViLBOX`,
    deviceType: 'INST',
    bankChain,
    types: finalTypes,
    modes: finalModes,
    isUser: true,
  };

  // Store the full config as a JSON blob for roundtrip
  const configBlob = new TextEncoder().encode(JSON.stringify(config));

  return {
    metadata,
    parameters: parameterValues,
    blob: configBlob.buffer,
  };
}

/**
 * Convert NKS Preset to DEViLBOX InstrumentConfig
 */
export function nksPresetToInstrumentConfig(
  preset: NKSPreset,
  instrumentId: number,
  synthType?: SynthType
): InstrumentConfig {
  // First, try to restore from blob if it contains a full config
  if (preset.blob) {
    try {
      const blobText = new TextDecoder().decode(new Uint8Array(preset.blob));
      const storedConfig = JSON.parse(blobText) as Partial<InstrumentConfig>;

      // If we have a stored config, use it (but override the ID)
      if (storedConfig.synthType) {
        return {
          ...storedConfig,
          id: instrumentId,
          name: preset.metadata.name || storedConfig.name || 'NKS Preset',
        } as InstrumentConfig;
      }
    } catch {
      // Blob isn't a JSON config, continue with parameter reconstruction
    }
  }

  // Infer synth type from metadata if not provided
  const inferredSynthType: SynthType = synthType
    || inferSynthTypeFromMetadata(preset.metadata)
    || 'Synth'; // Default fallback

  // Get parameters for this synth type
  const parameters = getNKSParametersForSynth(inferredSynthType);

  // Build config from NKS parameters
  const config: InstrumentConfig = {
    id: instrumentId,
    name: preset.metadata.name || 'NKS Preset',
    type: 'synth',
    synthType: inferredSynthType,
    effects: [],
    volume: -6,
    pan: 0,
  };

  // Apply parameter values to config
  applyParametersToConfig(config, preset.parameters, parameters);

  return config;
}

/**
 * Infer synth type from NKS metadata
 */
function inferSynthTypeFromMetadata(metadata: NKSPresetMetadata): SynthType | null {
  const bankChain = metadata.bankChain.join(' ').toLowerCase();
  const types = (metadata.types || []).flat().join(' ').toLowerCase();
  const comment = (metadata.comment || '').toLowerCase();
  const name = (metadata.name || '').toLowerCase();

  const combined = `${bankChain} ${types} ${comment} ${name}`;

  // Check for specific synth types (most specific first)
  if (combined.includes('tb303') || combined.includes('db303') || combined.includes('open303')) return 'TB303';
  if (combined.includes('tb808') || combined.includes('808') || combined.includes('drum machine')) return 'DrumMachine';
  if (combined.includes('dub siren') || combined.includes('dubsiren')) return 'DubSiren';
  if (combined.includes('space laser') || combined.includes('spacelaser')) return 'SpaceLaser';
  if (combined.includes('synare')) return 'Synare';
  if (combined.includes('dexed') || combined.includes('dx7')) return 'Dexed';
  if (combined.includes('obxd') || combined.includes('ob-x')) return 'OBXd';
  if (combined.includes('v2synth') || combined.includes('v2 synth')) return 'V2';
  if (combined.includes('vital')) return 'Vital';
  if (combined.includes('odin')) return 'Odin2';
  if (combined.includes('surge')) return 'Surge';
  if (combined.includes('tonewheel') || combined.includes('organ')) return 'TonewheelOrgan';
  if (combined.includes('melodica')) return 'Melodica';
  if (combined.includes('sam') && combined.includes('speech')) return 'Sam';
  if (combined.includes('supersaw')) return 'SuperSaw';
  if (combined.includes('wobble')) return 'WobbleBass';
  if (combined.includes('string machine')) return 'StringMachine';
  if (combined.includes('chip') && combined.includes('synth')) return 'ChipSynth';
  if (combined.includes('pwm')) return 'PWMSynth';
  if (combined.includes('formant')) return 'FormantSynth';
  if (combined.includes('granular')) return 'GranularSynth';
  if (combined.includes('wavetable')) return 'Wavetable';

  // Generic NKS type -> DEViLBOX synth type
  if (combined.includes('fm') || types.includes('fm')) return 'FMSynth';
  if (combined.includes('membrane') || combined.includes('kick')) return 'MembraneSynth';
  if (combined.includes('metal') || combined.includes('hihat') || combined.includes('cymbal')) return 'MetalSynth';
  if (combined.includes('pluck')) return 'PluckSynth';
  if (combined.includes('noise')) return 'NoiseSynth';
  if (combined.includes('duo')) return 'DuoSynth';
  if (combined.includes('am synth') || combined.includes('amsyn')) return 'AMSynth';
  if (types.includes('synth lead') && combined.includes('mono')) return 'MonoSynth';
  if (types.includes('synth lead')) return 'PolySynth';
  if (types.includes('synth pad')) return 'PolySynth';
  if (types.includes('bass')) return 'MonoSynth';

  return null;
}

/**
 * Apply NKS parameter values to InstrumentConfig
 */
function applyParametersToConfig(
  config: InstrumentConfig,
  values: Record<string, number>,
  parameters: NKSParameter[]
): void {
  const synthType = config.synthType.toLowerCase();

  // Create synth-specific config object if needed
  const synthConfig: Record<string, unknown> = {};

  for (const param of parameters) {
    const value = values[param.id];
    if (value === undefined) continue;

    // Denormalize value
    const denormalized = value * (param.max - param.min) + param.min;

    // Extract path from param ID
    const fullPath = param.id.replace(`${synthType}.`, '');
    const pathParts = fullPath.split('.');

    // Build nested structure
    let target: Record<string, unknown> = synthConfig;
    for (let i = 0; i < pathParts.length - 1; i++) {
      if (!(pathParts[i] in target)) {
        target[pathParts[i]] = {};
      }
      target = target[pathParts[i]] as Record<string, unknown>;
    }

    // Set the value
    const lastKey = pathParts[pathParts.length - 1];

    // Handle special type conversions
    if (param.valueStrings && param.valueStrings.length > 0) {
      const index = Math.round(value * (param.valueStrings.length - 1));
      target[lastKey] = param.valueStrings[Math.min(index, param.valueStrings.length - 1)];
    } else if (param.type === 2) { // BOOLEAN
      target[lastKey] = value >= 0.5;
    } else {
      target[lastKey] = denormalized;
    }

    // Also apply common parameters to standard config locations
    if (lastKey === 'cutoff' || lastKey === 'frequency') {
      if (!config.filter) config.filter = { type: 'lowpass', frequency: 1000, Q: 1, rolloff: -24 };
      config.filter.frequency = denormalized;
    }
    if (lastKey === 'resonance' || lastKey === 'Q') {
      if (!config.filter) config.filter = { type: 'lowpass', frequency: 1000, Q: 1, rolloff: -24 };
      config.filter.Q = denormalized;
    }
    if (lastKey === 'attack' && !fullPath.includes('filter')) {
      if (!config.envelope) config.envelope = { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.3 };
      config.envelope.attack = denormalized;
    }
    if (lastKey === 'decay' && !fullPath.includes('filter')) {
      if (!config.envelope) config.envelope = { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.3 };
      config.envelope.decay = denormalized;
    }
    if (lastKey === 'sustain' && !fullPath.includes('filter')) {
      if (!config.envelope) config.envelope = { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.3 };
      config.envelope.sustain = denormalized;
    }
    if (lastKey === 'release' && !fullPath.includes('filter')) {
      if (!config.envelope) config.envelope = { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.3 };
      config.envelope.release = denormalized;
    }
  }

  // Apply synth-specific config
  if (Object.keys(synthConfig).length > 0) {
    (config as unknown as Record<string, unknown>)[synthType] = synthConfig;
  }
}

/**
 * Convert DEViLBOX UserPreset to NKS Preset
 */
export function userPresetToNKSPreset(userPreset: UserPreset): NKSPreset {
  // Create a temporary InstrumentConfig with id=0
  const tempConfig: InstrumentConfig = {
    id: 0,
    ...userPreset.config,
  };

  return instrumentConfigToNKSPreset(tempConfig, {
    name: userPreset.name,
    category: userPreset.category,
    tags: userPreset.tags,
  });
}

/**
 * Convert NKS Preset to DEViLBOX UserPreset
 */
export function nksPresetToUserPreset(
  nksPreset: NKSPreset,
  synthType?: SynthType
): Omit<UserPreset, 'id' | 'createdAt' | 'updatedAt'> {
  const config = nksPresetToInstrumentConfig(nksPreset, 0, synthType);
  const { id: _id, ...configWithoutId } = config;

  return {
    name: nksPreset.metadata.name || 'NKS Preset',
    category: bankChainToCategory(nksPreset.metadata.bankChain),
    synthType: config.synthType,
    tags: nksTypesToTags(nksPreset.metadata.types, nksPreset.metadata.modes),
    config: configWithoutId,
  };
}

/**
 * Export preset as .nksf file download
 */
export function downloadAsNKSF(
  config: InstrumentConfig,
  options?: {
    name?: string;
    author?: string;
    comment?: string;
    category?: PresetCategory;
    tags?: string[];
  }
): void {
  const nksPreset = instrumentConfigToNKSPreset(config, options);
  const buffer = writeNKSF(nksPreset);

  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);

  const filename = `${options?.name || config.name || 'preset'}.nksf`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

/**
 * Import .nksf file as InstrumentConfig
 */
export async function importNKSFFile(
  file: File,
  instrumentId: number,
  synthType?: SynthType
): Promise<InstrumentConfig> {
  const buffer = await file.arrayBuffer();
  const nksPreset = await parseNKSF(buffer);
  return nksPresetToInstrumentConfig(nksPreset, instrumentId, synthType);
}

/**
 * Batch export presets to NKS format
 */
export function batchExportToNKS(
  presets: UserPreset[],
  author?: string
): { filename: string; buffer: ArrayBuffer }[] {
  return presets.map(preset => {
    const nksPreset = userPresetToNKSPreset(preset);
    if (author) {
      nksPreset.metadata.author = author;
    }

    return {
      filename: `${preset.name}.nksf`,
      buffer: writeNKSF(nksPreset),
    };
  });
}

/**
 * Batch import .nksf files
 */
export async function batchImportNKSF(
  files: File[]
): Promise<Omit<UserPreset, 'id' | 'createdAt' | 'updatedAt'>[]> {
  const results: Omit<UserPreset, 'id' | 'createdAt' | 'updatedAt'>[] = [];

  for (const file of files) {
    try {
      const buffer = await file.arrayBuffer();
      const nksPreset = await parseNKSF(buffer);
      results.push(nksPresetToUserPreset(nksPreset));
    } catch (error) {
      console.error(`[NKS] Failed to import ${file.name}:`, error);
    }
  }

  return results;
}
