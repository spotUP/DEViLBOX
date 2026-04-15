/**
 * Unified preset loader — aggregates ALL preset sources into a searchable index.
 * Supports filtering by current synth type so the browser shows relevant presets first.
 */

import type { PresetIndex, PresetCollection, PresetMetadata, PresetCategory } from '../types/preset';
import type { SynthType } from '@typedefs/instrument/base';

// ── InstrumentPreset-format sources (full InstrumentConfig) ─────────────────
import { DECTALK_PRESETS } from '@constants/dectalkPresets';
import { SAM_PRESETS } from '@constants/samPresets';
import { V2_PRESETS } from '@constants/v2Presets';
import { TB303_PRESETS } from '@constants/tb303Presets';
import { DUB_SIREN_PRESETS } from '@constants/dubSirenPresets';
import { SYNARE_PRESETS } from '@constants/synarePresets';
import { WAVETABLE_PRESETS } from '@constants/wavetablePresets';
import { HARMONIC_PRESETS } from '@constants/harmonicPresets';
import { FURNACE_CHIP_PRESETS } from '@constants/furnaceChipPresets';
import { FURNACE_PRESETS } from '@constants/furnacePresets';
import { HIVELY_PRESETS } from '@constants/hivelyPresets';
import { OBXD_NATIVE_PRESETS } from '@constants/oberheimPresets';
import { PINK_TROMBONE_FACTORY_PRESETS } from '@constants/pinkTrombonePresets';
import { FX_PRESETS } from '@constants/fxPresets';
import { DX7_FACTORY_PRESETS } from '@constants/jucePresets';
import { ZYNTHIAN_PRESETS } from '@constants/zynthianPresets';
import { DJ_ONE_SHOT_PRESETS } from '@constants/djOneShotPresets';
import { DJ_PAD_PRESETS } from '@constants/djPadPresets';
import { SAMPLE_PACK_PRESETS } from '@constants/samplePresets';
import { SPACE_LASER_PRESETS } from '@constants/spaceLaserPresets';
import { AMI_PRESETS } from '@constants/amiPresets';
import { CMI_PRESETS } from '@constants/cmiPresets';
import { UADE_INSTRUMENT_PRESETS } from '@constants/uadeInstrumentPresets';
import { MAME_CHIP_PRESETS } from '@constants/mameChipPresets';
import { SID_PRESETS } from '@constants/gtultraPresets';
import { DRUMNIBUS_PRESETS } from '@constants/drumnibusPresets';
import { V2_SPEECH_PRESETS } from '@constants/v2FactoryPresets/speech';

// ── SynthPreset-format sources (synth-specific config only) ─────────────────
import { getPresetsForSynthType } from '@constants/synthPresets/allPresets';

// ── ROM word data from chip parameters ──────────────────────────────────────
import { CHIP_SYNTH_DEFS } from '@constants/chipParameters';

function getCategoryForSynthType(synthType: string): PresetCategory {
  const st = synthType.toLowerCase();
  if (st.includes('dectalk') || st.includes('sam') || st.includes('v2speech') || st.includes('votrax') || st.includes('tms5220') || st.includes('sp0250') || st.includes('mea8000') || st.includes('s14001a') || st.includes('vlm5030') || st.includes('hc55516') || st.includes('upd931')) return 'speech';
  if (st.includes('303') || st.includes('bass') || st.includes('dub') || st.includes('wobble')) return 'bass';
  if (st.includes('drum') || st.includes('808') || st.includes('909') || st.includes('kick') || st.includes('snare') || st.includes('hihat') || st.includes('synare') || st.includes('nibus')) return 'drums-perc';
  if (st.includes('furnace') || st.includes('chip') || st.includes('gb') || st.includes('nes') || st.includes('c64') || st.includes('sid') || st.includes('hively') || st.includes('amiga') || st.includes('mame')) return 'chip';
  if (st.includes('fx') || st.includes('reverb') || st.includes('delay') || st.includes('laser') || st.includes('space')) return 'fx';
  if (st.includes('organ') || st.includes('oberheim') || st.includes('string') || st.includes('vintage') || st.includes('cmi') || st.includes('fairlight')) return 'vintage';
  if (st.includes('lead') || st.includes('pluck') || st.includes('arpeggio') || st.includes('mono') || st.includes('fm') || st.includes('am')) return 'lead';
  if (st.includes('pad') || st.includes('atmos') || st.includes('ambient') || st.includes('poly') || st.includes('supersaw')) return 'modern';
  if (st.includes('wavetable') || st.includes('formant') || st.includes('pwm') || st.includes('modular') || st.includes('oidos') || st.includes('tunefish') || st.includes('wavesabre')) return 'modern';
  return 'modern';
}

function createCollectionFromInstrumentPresets(
  name: string,
  presets: Array<any>,
  category?: PresetCategory,
): PresetCollection {
  if (!presets?.length) return { name, category: category || 'modern', presets: [] };

  const presetMetadata: PresetMetadata[] = presets.map((preset, idx) => {
    const synthType = preset.synthType || 'Unknown';
    const presetCategory = category || getCategoryForSynthType(synthType);
    return {
      id: `${name.toLowerCase().replace(/\s+/g, '-')}-${idx}`,
      name: preset.name || `Preset ${idx + 1}`,
      synthType,
      category: presetCategory,
      description: preset.description,
      tags: preset.tags || [],
      isFavorite: false,
      config: preset
    };
  });

  return { name, category: category || getCategoryForSynthType(presets[0]?.synthType || ''), presets: presetMetadata };
}

// Map SynthType → the InstrumentConfig property key for its sub-config
const SYNTH_CONFIG_KEY: Record<string, string> = {
  TB303: 'tb303', DubSiren: 'dubSiren', SpaceLaser: 'spaceLaser',
  SuperSaw: 'superSaw', PolySynth: 'polySynth', MonoSynth: 'monoSynth',
  FMSynth: 'fmSynth', ToneAM: 'toneAM', Organ: 'organ',
  DrumMachine: 'drumMachine', PWMSynth: 'pwmSynth', StringMachine: 'stringMachine',
  FormantSynth: 'formantSynth', WobbleBass: 'wobbleBass', HarmonicSynth: 'harmonicSynth',
  ChipSynth: 'chipSynth', Synare: 'synare', Wavetable: 'wavetable',
};

/**
 * Create PresetMetadata entries from SynthPreset-format presets.
 * These have `{ id, name, description, config: {...synth-specific...} }` and need wrapping
 * into InstrumentConfig format with the synth config nested under the correct key.
 */
function createCollectionFromSynthPresets(
  synthType: SynthType,
  displayName: string,
  category?: PresetCategory
): PresetCollection {
  const synthPresets = getPresetsForSynthType(synthType);
  if (!synthPresets?.length) return { name: displayName, category: category || 'modern', presets: [] };

  const configKey = SYNTH_CONFIG_KEY[synthType];
  const presetCategory = category || getCategoryForSynthType(synthType);
  const presetMetadata: PresetMetadata[] = synthPresets.map((sp, idx) => ({
    id: `synth-${synthType.toLowerCase()}-${idx}`,
    name: sp.name,
    synthType,
    category: presetCategory,
    description: sp.description,
    tags: [],
    isFavorite: false,
    config: {
      type: 'synth' as const,
      name: sp.name,
      synthType,
      // Nest synth-specific config under the correct key, or spread flat as fallback
      ...(configKey ? { [configKey]: sp.config } : sp.config),
      effects: [],
      volume: -10,
      pan: 0,
    }
  }));

  return { name: displayName, category: presetCategory, presets: presetMetadata };
}

/**
 * Generate ROM speech presets from MAME speech chip parameters.
 * Uses the merged romSpeech selector (phrases first, then words).
 */
function createRomWordCollection(
  synthType: string,
  displayName: string
): PresetCollection {
  const chipParams = (CHIP_SYNTH_DEFS as Record<string, any>)[synthType];
  if (!chipParams?.parameters) return { name: displayName, category: 'speech', presets: [] };

  const romSpeechParam = chipParams.parameters.find((p: any) => p.key === 'romSpeech');
  if (!romSpeechParam?.options) return { name: displayName, category: 'speech', presets: [] };

  const presets: PresetMetadata[] = [];

  for (const opt of romSpeechParam.options) {
    const isPhrase = (opt.label as string).startsWith('▸');
    const cleanLabel = isPhrase ? (opt.label as string).replace('▸ ', '') : opt.label;
    presets.push({
      id: `rom-${synthType.toLowerCase()}-${isPhrase ? 'phrase' : 'word'}-${opt.value}`,
      name: isPhrase ? `[Phrase] ${cleanLabel}` : `${cleanLabel}`,
      synthType,
      category: 'speech',
      description: `${chipParams.name} ROM ${isPhrase ? 'phrase' : 'word'}`,
      tags: isPhrase ? ['rom', 'speech', 'phrase'] : ['rom', 'speech'],
      isFavorite: false,
      config: {
        type: 'synth' as const,
        name: `${chipParams.shortName || chipParams.name} ${cleanLabel}`,
        synthType: synthType as SynthType,
        parameters: { mode: 1, romSpeech: opt.value, volume: 0.8 },
        effects: [],
        volume: -10,
        pan: 0,
      }
    });
  }

  return { name: displayName, category: 'speech', presets };
}

export function buildPresetIndex(): PresetIndex {
  const speech: PresetCollection[] = [
    createCollectionFromInstrumentPresets('DECtalk', DECTALK_PRESETS, 'speech'),
    createCollectionFromInstrumentPresets('SAM', SAM_PRESETS, 'speech'),
    createCollectionFromInstrumentPresets('V2 Speech', V2_PRESETS, 'speech'),
    createCollectionFromInstrumentPresets('V2 Speech Factory', V2_SPEECH_PRESETS, 'speech'),
    // MAME speech chip ROM words
    createRomWordCollection('MAMES14001A', 'Berzerk (S14001A)'),
    createRomWordCollection('MAMEVLM5030', 'Track & Field (VLM5030)'),
    createRomWordCollection('MAMEHC55516', 'Sinistar (HC55516)'),
  ];

  const bass: PresetCollection[] = [
    createCollectionFromInstrumentPresets('TB-303', TB303_PRESETS, 'bass'),
    createCollectionFromInstrumentPresets('DubSiren', DUB_SIREN_PRESETS, 'bass'),
    createCollectionFromSynthPresets('DubSiren', 'Dub Siren Synth', 'bass'),
    createCollectionFromSynthPresets('TB303', 'TB-303 Synth', 'bass'),
    createCollectionFromSynthPresets('WobbleBass', 'Wobble Bass', 'bass'),
  ];

  const drums: PresetCollection[] = [
    createCollectionFromInstrumentPresets('Synare', SYNARE_PRESETS, 'drums-perc'),
    createCollectionFromInstrumentPresets('DrumNibus', DRUMNIBUS_PRESETS, 'drums-perc'),
    createCollectionFromInstrumentPresets('DJ Pads', DJ_PAD_PRESETS, 'drums-perc'),
    createCollectionFromSynthPresets('DrumMachine', 'Drum Machine', 'drums-perc'),
    createCollectionFromSynthPresets('Synare', 'Synare Synth', 'drums-perc'),
  ];

  const lead: PresetCollection[] = [
    createCollectionFromSynthPresets('MonoSynth', 'Mono Synth', 'lead'),
    createCollectionFromSynthPresets('FMSynth', 'FM Synth', 'lead'),
    createCollectionFromSynthPresets('ToneAM', 'AM Synth', 'lead'),
  ];

  const chip: PresetCollection[] = [
    createCollectionFromInstrumentPresets('Furnace Chips', FURNACE_CHIP_PRESETS, 'chip'),
    createCollectionFromInstrumentPresets('Furnace', FURNACE_PRESETS, 'chip'),
    createCollectionFromInstrumentPresets('Hively', HIVELY_PRESETS, 'chip'),
    createCollectionFromInstrumentPresets('Amiga', AMI_PRESETS, 'chip'),
    ...Object.entries(UADE_INSTRUMENT_PRESETS).map(([key, presets]) =>
      createCollectionFromInstrumentPresets(`UADE ${key}`, presets as any[], 'chip')
    ),
    createCollectionFromInstrumentPresets('MAME', MAME_CHIP_PRESETS, 'chip'),
    createCollectionFromInstrumentPresets('SID Chips', SID_PRESETS, 'chip'),
    createCollectionFromSynthPresets('ChipSynth', 'ChipSynth', 'chip'),
  ];

  const fx: PresetCollection[] = [
    createCollectionFromInstrumentPresets('Effects', FX_PRESETS, 'fx'),
    createCollectionFromInstrumentPresets('Space Laser', SPACE_LASER_PRESETS, 'fx'),
    createCollectionFromInstrumentPresets('DJ One-Shots', DJ_ONE_SHOT_PRESETS, 'fx'),
    createCollectionFromSynthPresets('SpaceLaser', 'Space Laser Synth', 'fx'),
  ];

  const vintage: PresetCollection[] = [
    createCollectionFromInstrumentPresets('Oberheim OB-Xd', OBXD_NATIVE_PRESETS as any[], 'vintage'),
    createCollectionFromInstrumentPresets('CMI Fairlight', CMI_PRESETS, 'vintage'),
    createCollectionFromSynthPresets('Organ', 'Organ', 'vintage'),
    createCollectionFromSynthPresets('StringMachine', 'String Machine', 'vintage'),
  ];

  const modern: PresetCollection[] = [
    createCollectionFromInstrumentPresets('Wavetable', WAVETABLE_PRESETS, 'modern'),
    createCollectionFromInstrumentPresets('Harmonic', HARMONIC_PRESETS, 'modern'),
    createCollectionFromInstrumentPresets('Pink Trombone', PINK_TROMBONE_FACTORY_PRESETS, 'modern'),
    createCollectionFromInstrumentPresets('DX7', DX7_FACTORY_PRESETS, 'modern'),
    createCollectionFromInstrumentPresets('Zynthian', ZYNTHIAN_PRESETS, 'modern'),
    createCollectionFromInstrumentPresets('Sample Packs', SAMPLE_PACK_PRESETS, 'modern'),
    createCollectionFromSynthPresets('SuperSaw', 'SuperSaw', 'modern'),
    createCollectionFromSynthPresets('PolySynth', 'Poly Synth', 'modern'),
    createCollectionFromSynthPresets('PWMSynth', 'PWM Synth', 'modern'),
    createCollectionFromSynthPresets('FormantSynth', 'Formant Synth', 'modern'),
    createCollectionFromSynthPresets('HarmonicSynth', 'Harmonic Synth', 'modern'),
    createCollectionFromSynthPresets('Wavetable', 'Wavetable Synth', 'modern'),
    createCollectionFromSynthPresets('OidosSynth', 'Oidos', 'modern'),
    createCollectionFromSynthPresets('TunefishSynth', 'Tunefish', 'modern'),
    createCollectionFromSynthPresets('WaveSabreSynth', 'WaveSabre', 'modern'),
    createCollectionFromSynthPresets('V2', 'V2 Synth', 'modern'),
  ];

  const other: PresetCollection[] = [];

  return { speech, bass, lead, drums, chip, fx, vintage, modern, other };
}

export function getAllPresets(index: PresetIndex): PresetMetadata[] {
  const all: PresetMetadata[] = [];
  for (const category of Object.values(index)) {
    for (const collection of category) {
      all.push(...collection.presets);
    }
  }
  return all;
}

/** Filter presets to those matching a specific synth type */
export function filterBySynthType(presets: PresetMetadata[], synthType: string): PresetMetadata[] {
  return presets.filter(p => p.synthType === synthType);
}

export function searchPresets(presets: PresetMetadata[], query: string): PresetMetadata[] {
  const q = query.toLowerCase().trim();
  if (!q) return presets;
  return presets.filter(preset => {
    const nameMatch = preset.name.toLowerCase().includes(q);
    const tagsMatch = preset.tags?.some(tag => tag.toLowerCase().includes(q));
    const descMatch = preset.description?.toLowerCase().includes(q);
    const typeMatch = preset.synthType.toLowerCase().includes(q);
    return nameMatch || tagsMatch || descMatch || typeMatch;
  });
}

export function filterByCategory(presets: PresetMetadata[], category: PresetCategory | 'all'): PresetMetadata[] {
  if (category === 'all') return presets;
  return presets.filter(p => p.category === category);
}

export function sortPresets(presets: PresetMetadata[], sortBy: 'name' | 'category' | 'synth'): PresetMetadata[] {
  const sorted = [...presets];
  switch (sortBy) {
    case 'name':
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case 'category':
      return sorted.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    case 'synth':
      return sorted.sort((a, b) => a.synthType.localeCompare(b.synthType) || a.name.localeCompare(b.name));
    default:
      return sorted;
  }
}
