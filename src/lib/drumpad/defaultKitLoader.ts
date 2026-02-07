/**
 * Drum Kit Loader - Create instruments from presets or sample packs
 */

import type { InstrumentConfig } from '@typedefs/instrument';
import type { SamplePack, SampleCategory } from '@typedefs/samplePack';

/**
 * Sample kit preset - Predefined drum kit mappings
 */
export interface KitPreset {
  id: string;
  name: string;
  description: string;
  mappings: Array<{ name: string; path: string }>;
}

/**
 * Source type for kit loading
 */
export type KitSourceType = 'preset' | 'samplepack';

/**
 * Kit source - Can be either a preset or a sample pack
 */
export interface KitSource {
  type: KitSourceType;
  id: string;
  name: string;
  description: string;
}

/**
 * Legowelt Drumnibus - Electro Kit
 */
const DRUMNIBUS_ELECTRO_KIT: KitPreset = {
  id: 'drumnibus-electro',
  name: 'Drumnibus Electro',
  description: 'Legowelt synthetic electro drums',
  mappings: [
    { name: 'Kick', path: '/data/samples/packs/drumnibus/kicks/BD_808A1200.wav' },
    { name: 'Snare', path: '/data/samples/packs/drumnibus/snares/SD_808A1200.wav' },
    { name: 'Clap', path: '/data/samples/packs/drumnibus/percussion/CLAP_Magnotron.wav' },
    { name: 'Rim', path: '/data/samples/packs/drumnibus/percussion/RIM_Magnotron.wav' },
    { name: 'Cl Hat', path: '/data/samples/packs/drumnibus/hihats/CH_Digidap.wav' },
    { name: 'Op Hat', path: '/data/samples/packs/drumnibus/hihats/OH_Digidap.wav' },
    { name: 'Lo Tom', path: '/data/samples/packs/drumnibus/percussion/TOM_digger.wav' },
    { name: 'Mid Tom', path: '/data/samples/packs/drumnibus/percussion/TOM_Juxtapos.wav' },
    { name: 'Hi Tom', path: '/data/samples/packs/drumnibus/percussion/TOM_DraconisDS92high.wav' },
    { name: 'Crash', path: '/data/samples/packs/drumnibus/hihats/CYM_Magnotron.wav' },
    { name: 'Ride', path: '/data/samples/packs/drumnibus/hihats/CYM_Ruflex.wav' },
    { name: 'Clave', path: '/data/samples/packs/drumnibus/percussion/CLAVE_Simple.wav' },
    { name: 'Cowbell', path: '/data/samples/packs/drumnibus/percussion/COW_Syntique.wav' },
    { name: 'Shaker', path: '/data/samples/packs/drumnibus/percussion/SHAKE_AnalogShaker1.wav' },
    { name: 'Conga', path: '/data/samples/packs/drumnibus/percussion/CONGA_Syntique.wav' },
    { name: 'Tamb', path: '/data/samples/packs/drumnibus/percussion/TAMB_Tamb&Shaker.wav' },
  ],
};

/**
 * Drumnibus - 808 Style Kit
 */
const DRUMNIBUS_808_KIT: KitPreset = {
  id: 'drumnibus-808',
  name: 'Drumnibus 808',
  description: 'Classic 808-style drum sounds',
  mappings: [
    { name: 'BD', path: '/data/samples/packs/drumnibus/kicks/BD_808A1200.wav' },
    { name: 'SD', path: '/data/samples/packs/drumnibus/snares/SD_808A1200.wav' },
    { name: 'LT', path: '/data/samples/packs/drumnibus/percussion/TOM_digger.wav' },
    { name: 'MT', path: '/data/samples/packs/drumnibus/percussion/TOM_Juxtapos.wav' },
    { name: 'HT', path: '/data/samples/packs/drumnibus/percussion/TOM_DraconisDS92high.wav' },
    { name: 'RS', path: '/data/samples/packs/drumnibus/percussion/RIM_Magnotron.wav' },
    { name: 'CP', path: '/data/samples/packs/drumnibus/percussion/CLAP_Magnotron.wav' },
    { name: 'CH', path: '/data/samples/packs/drumnibus/hihats/CH_Digidap.wav' },
    { name: 'OH', path: '/data/samples/packs/drumnibus/hihats/OH_Digidap.wav' },
    { name: 'CY', path: '/data/samples/packs/drumnibus/hihats/CYM_Magnotron.wav' },
    { name: 'CB', path: '/data/samples/packs/drumnibus/percussion/COW_Syntique.wav' },
    { name: 'CL', path: '/data/samples/packs/drumnibus/percussion/CLAVE_Simple.wav' },
    { name: 'MA', path: '/data/samples/packs/drumnibus/percussion/SHAKE_AnalogShaker1.wav' },
    { name: 'Conga Lo', path: '/data/samples/packs/drumnibus/percussion/CONGA_Syntique.wav' },
    { name: 'Conga Hi', path: '/data/samples/packs/drumnibus/percussion/CONGA_Syntique.wav' },
    { name: 'Accent', path: '/data/samples/packs/drumnibus/percussion/TAMB_Tamb&Shaker.wav' },
  ],
};

/**
 * Available kit presets
 */
export const AVAILABLE_KIT_PRESETS: KitPreset[] = [
  DRUMNIBUS_ELECTRO_KIT,
  DRUMNIBUS_808_KIT,
];

/**
 * Get kit preset by ID
 */
export function getKitPreset(kitId: string): KitPreset | undefined {
  return AVAILABLE_KIT_PRESETS.find(kit => kit.id === kitId);
}

/**
 * Convert kit preset to kit sources list
 */
export function getPresetKitSources(): KitSource[] {
  return AVAILABLE_KIT_PRESETS.map(preset => ({
    type: 'preset',
    id: preset.id,
    name: preset.name,
    description: preset.description,
  }));
}

/**
 * Convert sample packs to kit sources list
 */
export function getSamplePackKitSources(samplePacks: SamplePack[]): KitSource[] {
  return samplePacks.map(pack => ({
    type: 'samplepack',
    id: pack.id,
    name: pack.name,
    description: pack.description,
  }));
}

/**
 * Get all available kit sources (presets + sample packs)
 */
export function getAllKitSources(samplePacks: SamplePack[]): KitSource[] {
  return [
    ...getPresetKitSources(),
    ...getSamplePackKitSources(samplePacks),
  ];
}

/**
 * Create instrument config from sample URL (without ID - will be assigned by store)
 */
function createInstrumentFromSample(
  name: string,
  url: string
): Partial<InstrumentConfig> {
  return {
    name,
    type: 'sample',
    synthType: 'Sampler',
    sample: {
      url,
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -6,
    pan: 0,
  };
}

/**
 * Create instruments from kit preset
 * Returns partial instrument configs (without ID, will be assigned by caller)
 */
export function createInstrumentsFromPreset(
  kitId: string
): Array<{ name: string; url: string }> {
  const kit = getKitPreset(kitId);
  if (!kit) {
    throw new Error(`Kit preset not found: ${kitId}`);
  }

  return kit.mappings.map(mapping => ({
    name: mapping.name,
    url: mapping.path,
  }));
}

/**
 * Create instruments from sample pack
 * Returns samples from all categories, up to maxSamples
 */
export function createInstrumentsFromSamplePack(
  samplePack: SamplePack,
  maxSamples = 16
): Array<{ name: string; url: string }> {
  const result: Array<{ name: string; url: string }> = [];

  // Priority order for categories (drums first)
  const categoryPriority: SampleCategory[] = [
    'kicks',
    'snares',
    'hihats',
    'claps',
    'percussion',
    'fx',
    'bass',
    'leads',
    'pads',
    'loops',
    'vocals',
    'other',
  ];

  // Collect samples by priority
  for (const category of categoryPriority) {
    if (result.length >= maxSamples) break;

    const samples = samplePack.samples[category] || [];
    for (const sample of samples) {
      if (result.length >= maxSamples) break;
      result.push({
        name: sample.name,
        url: sample.url,
      });
    }
  }

  return result;
}

/**
 * Load kit from source and create instruments in the instrument store
 * Returns the created instrument IDs
 */
export function loadKitSource(
  source: KitSource,
  samplePacks: SamplePack[],
  createInstrument: (config: Partial<InstrumentConfig>) => number
): number[] {
  const createdIds: number[] = [];

  let samples: Array<{ name: string; url: string }> = [];

  if (source.type === 'preset') {
    samples = createInstrumentsFromPreset(source.id);
  } else if (source.type === 'samplepack') {
    const pack = samplePacks.find(p => p.id === source.id);
    if (!pack) {
      throw new Error(`Sample pack not found: ${source.id}`);
    }
    samples = createInstrumentsFromSamplePack(pack);
  }

  // Create instruments and collect their IDs
  for (const sample of samples) {
    const instrumentConfig = createInstrumentFromSample(sample.name, sample.url);
    const newId = createInstrument(instrumentConfig);
    createdIds.push(newId);
  }

  console.log(`[KitLoader] Created ${createdIds.length} instruments from ${source.type}: ${source.name}`);
  return createdIds;
}
