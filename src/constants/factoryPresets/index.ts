/**
 * Factory Presets - 36+ ready-to-use instrument presets
 * Organized by category: Bass, Leads, Pads, Drums, FX
 * Includes all TB-303 presets from tb303Presets.ts
 */

import type { InstrumentPreset } from '../../types/instrument';
import { TB303_PRESETS } from '../tb303Presets';
import { FURNACE_PRESETS } from '../furnacePresets';
import { DUB_SIREN_PRESETS } from '../dubSirenPresets';
import { SPACE_LASER_PRESETS } from '../spaceLaserPresets';
import { V2_PRESETS } from '../v2Presets';
import { SYNARE_PRESETS } from '../synarePresets';
import { DRUMNIBUS_PRESETS as DRUMNIBUS_KIT_PRESETS } from '../drumnibusPresets';
import { V2_FACTORY_PRESETS } from '../v2FactoryPresets';
import { SAM_PRESETS } from '../samPresets';
import { PINK_TROMBONE_FACTORY_PRESETS } from '../pinkTrombonePresets';
import { DECTALK_PRESETS } from '../dectalkPresets';
import { MAME_CHIP_PRESETS } from '../mameChipPresets';
import { DX7_FACTORY_PRESETS, OBXD_FACTORY_PRESETS } from '../jucePresets';
import { FURNACE_CHIP_PRESETS } from '../furnaceChipPresets';
import { SAMPLE_PACK_PRESETS, WAVETABLE_PACK_PRESETS } from '../samplePresets';
import { AMI_PRESETS } from '../amiPresets';
import { BUZZMACHINE_FACTORY_PRESETS } from '../buzzmachineFactoryPresets';
import { MAKK_FACTORY_PRESETS } from '../makkPresets';
import { HARMONIC_PRESETS } from '../harmonicPresets';
import { DJ_ONE_SHOT_PRESETS } from '../djOneShotPresets';
import { ZYNTHIAN_PRESETS } from '../zynthianPresets';
import { HIVELY_PRESETS } from '../hivelyPresets';

// Re-export all per-category preset arrays
export { BASS_PRESETS } from './bass';
export { LEAD_PRESETS } from './lead';
export { PAD_PRESETS } from './pad';
export { DRUM_PRESETS } from './drum';
export { CHIP_PRESETS } from './chip';
export { TR909_PRESETS } from './tr909';
export { TR808_PRESETS } from './tr808';
export { FX_PRESETS } from './fx';
export { WAM_PRESETS } from './wam';
export { TR505_PRESETS } from './tr505';
export { TR707_PRESETS } from './tr707';
export { DRUMNIBUS_PRESETS } from './drumnibus';
export { MAME_PRESETS } from './mame';
export { ORGAN_PRESETS } from './organ';
export { MODULE_PRESETS } from './module';

// Import them for use in aggregation below
import { BASS_PRESETS } from './bass';
import { LEAD_PRESETS } from './lead';
import { PAD_PRESETS } from './pad';
import { DRUM_PRESETS } from './drum';
import { CHIP_PRESETS } from './chip';
import { TR909_PRESETS } from './tr909';
import { TR808_PRESETS } from './tr808';
import { FX_PRESETS } from './fx';
import { WAM_PRESETS } from './wam';
import { TR505_PRESETS } from './tr505';
import { TR707_PRESETS } from './tr707';
import { DRUMNIBUS_PRESETS } from './drumnibus';
import { MAME_PRESETS } from './mame';
import { ORGAN_PRESETS } from './organ';
import { MODULE_PRESETS } from './module';

// ============================================================================
// COMBINED FACTORY PRESETS
// ============================================================================

export const FACTORY_PRESETS: InstrumentPreset['config'][] = [
  ...BASS_PRESETS,
  ...LEAD_PRESETS,
  ...PAD_PRESETS,
  ...DRUM_PRESETS,
  ...MAME_PRESETS,
  ...MAME_CHIP_PRESETS,
  ...ORGAN_PRESETS,
  ...MODULE_PRESETS,
  ...TR808_PRESETS,
  ...TR909_PRESETS,
  ...TR707_PRESETS,
  ...TR505_PRESETS,
  ...CHIP_PRESETS,
  ...FURNACE_PRESETS,
  ...FURNACE_CHIP_PRESETS,
  ...FX_PRESETS,
  ...WAM_PRESETS,
  // DUB_SIREN_PRESETS already included via BASS_PRESETS
  ...SPACE_LASER_PRESETS,
  ...V2_PRESETS,
  ...V2_FACTORY_PRESETS,
  ...SAM_PRESETS,
  ...PINK_TROMBONE_FACTORY_PRESETS,
  ...DECTALK_PRESETS,
  ...DRUMNIBUS_PRESETS,
  ...DRUMNIBUS_KIT_PRESETS,
  ...DX7_FACTORY_PRESETS,
  ...OBXD_FACTORY_PRESETS,
  ...SAMPLE_PACK_PRESETS,
  ...WAVETABLE_PACK_PRESETS,
  ...BUZZMACHINE_FACTORY_PRESETS,
  ...MAKK_FACTORY_PRESETS,
  ...DJ_ONE_SHOT_PRESETS,
  ...ZYNTHIAN_PRESETS,
  ...HIVELY_PRESETS,
  // Player Init
  {
    type: 'synth' as const,
    name: 'Sample Player',
    synthType: 'Player' as const,
    volume: -6,
    pan: 0,
    effects: [],
  },
  // === Init presets for synths without dedicated presets ===
  { type: 'synth' as const, name: 'Tonewheel Organ Init', synthType: 'TonewheelOrgan' as const, volume: -8, pan: 0, effects: [] },
  { type: 'synth' as const, name: 'Melodica Init', synthType: 'Melodica' as const, volume: -8, pan: 0, effects: [] },
  { type: 'synth' as const, name: 'Modular Synth Init', synthType: 'ModularSynth' as const, volume: -8, pan: 0, effects: [] },
  { type: 'synth' as const, name: 'SunVox Init', synthType: 'SunVoxSynth' as const, volume: -8, pan: 0, effects: [] },
  // WAM plugins
  { type: 'synth' as const, name: 'WAM Synth101 Init', synthType: 'WAMSynth101' as const, volume: -8, pan: 0, effects: [] },
  { type: 'synth' as const, name: 'WAM OBXd Init', synthType: 'WAMOBXd' as const, volume: -8, pan: 0, effects: [] },
  { type: 'synth' as const, name: 'WAM TinySynth Init', synthType: 'WAMTinySynth' as const, volume: -8, pan: 0, effects: [] },
  { type: 'synth' as const, name: 'WAM Faust Flute Init', synthType: 'WAMFaustFlute' as const, volume: -8, pan: 0, effects: [] },
  // External plugin bridges
  { type: 'synth' as const, name: 'DX7 Init', synthType: 'DX7' as const, volume: -8, pan: 0, effects: [] },
  { type: 'synth' as const, name: 'OBXf Init', synthType: 'OBXf' as const, volume: -8, pan: 0, effects: [] },
  { type: 'synth' as const, name: 'D50 Init', synthType: 'D50' as const, volume: -8, pan: 0, effects: [] },
  { type: 'synth' as const, name: 'Surge Init', synthType: 'Surge' as const, volume: -8, pan: 0, effects: [] },
  { type: 'synth' as const, name: 'Vital Init', synthType: 'Vital' as const, volume: -8, pan: 0, effects: [] },
  { type: 'synth' as const, name: 'Helm Init', synthType: 'Helm' as const, volume: -8, pan: 0, effects: [] },
  { type: 'synth' as const, name: 'Odin2 Init', synthType: 'Odin2' as const, volume: -8, pan: 0, effects: [] },
  { type: 'synth' as const, name: 'Amsynth Init', synthType: 'Amsynth' as const, volume: -8, pan: 0, effects: [] },
  { type: 'synth' as const, name: 'Monique Init', synthType: 'Monique' as const, volume: -8, pan: 0, effects: [] },
  { type: 'synth' as const, name: 'VL-1 Piano', synthType: 'VL1' as const, volume: -6, pan: 0, effects: [] },
  { type: 'synth' as const, name: 'Sorcer Init', synthType: 'Sorcer' as const, volume: -8, pan: 0, effects: [] },
  { type: 'synth' as const, name: 'SuperCollider Init', synthType: 'SuperCollider' as const, volume: -8, pan: 0, effects: [] },
  { type: 'synth' as const, name: 'VFX Init', synthType: 'VFX' as const, volume: -8, pan: 0, effects: [] },
];

// Preset categories for browsing
export const PRESET_CATEGORIES = {
  Bass: BASS_PRESETS,
  Leads: LEAD_PRESETS,
  Pads: PAD_PRESETS,
  Drums: DRUM_PRESETS,
  MAME: [...MAME_PRESETS, ...MAME_CHIP_PRESETS],
  Keys: ORGAN_PRESETS,
  Module: MODULE_PRESETS,
  'TR-808': TR808_PRESETS,
  'TR-909': TR909_PRESETS,
  'TR-707': TR707_PRESETS,
  'TR-505': TR505_PRESETS,
  Chip: CHIP_PRESETS,
  Furnace: [...FURNACE_PRESETS, ...FURNACE_CHIP_PRESETS],
  FX: FX_PRESETS,
  WAM: WAM_PRESETS,
  Dub: [...DUB_SIREN_PRESETS, ...SPACE_LASER_PRESETS, ...V2_PRESETS, ...V2_FACTORY_PRESETS, ...SYNARE_PRESETS],
  DubSiren: DUB_SIREN_PRESETS,
  SpaceLaser: SPACE_LASER_PRESETS,
  V2: [...V2_PRESETS, ...V2_FACTORY_PRESETS],
  Sam: SAM_PRESETS,
  Synare: SYNARE_PRESETS,
  Drumnibus: [...DRUMNIBUS_KIT_PRESETS, ...DRUMNIBUS_PRESETS],
  DX7: DX7_FACTORY_PRESETS,
  OBXd: OBXD_FACTORY_PRESETS,
  Samples: SAMPLE_PACK_PRESETS,
  Wavetables: WAVETABLE_PACK_PRESETS,
  Amiga: AMI_PRESETS,
  Buzz: BUZZMACHINE_FACTORY_PRESETS,
  Makk: MAKK_FACTORY_PRESETS,
  Harmonic: HARMONIC_PRESETS,
  'DJ FX': DJ_ONE_SHOT_PRESETS,
};

export type PresetCategory = keyof typeof PRESET_CATEGORIES;

// Curated "showcase" presets — the most impressive sound for each synth type.
// These are picked to immediately demonstrate each synth's character when browsed.
const SHOWCASE_PRESETS: Record<string, string> = {
  Synth: 'Supersaw Lead',
  MonoSynth: 'Acid Lead',
  FMSynth: 'FM Electric Piano',
  DuoSynth: 'Duo Saw Lead',
  PluckSynth: 'Trance Pluck',
  NoiseSynth: 'Riser',
  HarmonicSynth: 'Spectral Bell',
  SpaceLaser: 'Cosmic Burst',
  DubSiren: 'Code Red',
  PolySynth: 'Poly Brass',
  SuperSaw: 'Supersaw Lead',
  PWMSynth: 'PWM Solo Lead',
  StringMachine: 'Solina Ensemble',
  GranularSynth: 'Granular Cloud',
  FormantSynth: 'Robot Talk',
  Wavetable: 'Wavetable Evolving Pad',
  FurnaceOPN: 'Genesis Lead',
  FurnaceOPM: 'OPM Synth Lead',
  FurnaceNES: 'NES Pulse Lead',
  FurnaceSID6581: '6581 Pulse Lead',
  FurnaceGB: 'GB Pulse',
  FurnaceOPLL: 'OPLL Organ',
  ChipSynth: 'C64 Minor Arp',
};

/**
 * Get the first available factory preset for a given synth type.
 * Used to auto-initialize new instruments with musically useful settings
 * so they produce sound immediately (e.g. V2 needs patch data, MAME chips need _program).
 */
export function getFirstPresetForSynthType(synthType: string): InstrumentPreset['config'] | null {
  // Check curated showcase presets first — hand-picked to make each synth shine
  const showcaseName = SHOWCASE_PRESETS[synthType];
  if (showcaseName) {
    const showcase = FACTORY_PRESETS.find(p => p.synthType === synthType && p.name === showcaseName);
    if (showcase) return showcase;
  }

  // Search category-specific collections (preferred: sustaining/melodic presets)
  const categoryPresets = PRESET_CATEGORIES[synthType as keyof typeof PRESET_CATEGORIES];
  if (categoryPresets && categoryPresets.length > 0) {
    return categoryPresets[0];
  }

  // Fall back to main factory presets array
  const fromFactory = FACTORY_PRESETS.find(p => p.synthType === synthType);
  if (fromFactory) return fromFactory;

  // Check collections not included in FACTORY_PRESETS
  const fromTB303 = TB303_PRESETS.find(p => p.synthType === synthType);
  if (fromTB303) return fromTB303 as InstrumentPreset['config'];

  const fromSynare = SYNARE_PRESETS.find(p => p.synthType === synthType);
  if (fromSynare) return fromSynare as InstrumentPreset['config'];

  return null;
}
