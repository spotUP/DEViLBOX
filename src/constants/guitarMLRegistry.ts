/**
 * GuitarML Model Registry
 *
 * Maps exactly to GuitarMLEngine.BUILT_IN_MODELS indices (0-36).
 * Each entry's `index` MUST match its position in BUILT_IN_MODELS.
 */

import type { NeuralModelInfo, EffectParameterSchema } from '@typedefs/pedalboard';
import { DEFAULT_PARAMETERS } from '@typedefs/pedalboard';

/**
 * Parameter schemas for different effect types
 */

// Overdrive/Distortion pedals - Drive, Tone, Level, Mix
const PEDAL_OVERDRIVE_SCHEMA: EffectParameterSchema = {
  drive: { ...DEFAULT_PARAMETERS.drive },
  tone: { ...DEFAULT_PARAMETERS.tone },
  level: { ...DEFAULT_PARAMETERS.level },
  dryWet: { ...DEFAULT_PARAMETERS.dryWet },
};

// Amplifier models - Drive, Presence, Level, Mix
const AMP_SCHEMA: EffectParameterSchema = {
  drive: { ...DEFAULT_PARAMETERS.drive },
  presence: { ...DEFAULT_PARAMETERS.presence },
  level: { ...DEFAULT_PARAMETERS.level },
  dryWet: { ...DEFAULT_PARAMETERS.dryWet },
};

// Bass amp with EQ - Drive, Bass, Mid, Treble, Presence, Level, Mix
const AMP_EQ_SCHEMA: EffectParameterSchema = {
  drive: { ...DEFAULT_PARAMETERS.drive },
  bass: { ...DEFAULT_PARAMETERS.bass },
  mid: { ...DEFAULT_PARAMETERS.mid },
  treble: { ...DEFAULT_PARAMETERS.treble },
  presence: { ...DEFAULT_PARAMETERS.presence },
  level: { ...DEFAULT_PARAMETERS.level },
  dryWet: { ...DEFAULT_PARAMETERS.dryWet },
};

/**
 * GuitarML Model Registry — 37 models matching GuitarMLEngine.BUILT_IN_MODELS exactly.
 *
 * index N must correspond to BUILT_IN_MODELS[N].
 */
export const GUITARML_MODEL_REGISTRY: NeuralModelInfo[] = [
  // 0: TS9_DriveKnob.json
  {
    index: 0,
    name: 'Ibanez TS9',
    fullName: 'Ibanez TS9 Tube Screamer',
    category: 'overdrive',
    description: 'Iconic tube screamer overdrive with mid-hump character — conditioned drive knob',
    tags: ['tubescreamer', 'ts9', 'overdrive', 'classic', 'smooth', 'ibanez'],
    parameters: PEDAL_OVERDRIVE_SCHEMA,
    characteristics: {
      gain: 'medium',
      tone: 'neutral',
      character: ['warm', 'smooth', 'mid-focused', 'classic'],
    },
  },

  // 1: Ibanez_Mostortion_Clone_GainKnob.json
  {
    index: 1,
    name: 'Mostortion',
    fullName: 'Ibanez Mostortion Clone',
    category: 'distortion',
    description: 'Heavy distortion clone with conditioned gain knob',
    tags: ['mostortion', 'ibanez', 'distortion', 'clone', 'heavy'],
    parameters: PEDAL_OVERDRIVE_SCHEMA,
    characteristics: {
      gain: 'high',
      tone: 'neutral',
      character: ['heavy', 'saturated', 'aggressive'],
    },
  },

  // 2: Mooer_CaliMkIV_GainKnob.json
  {
    index: 2,
    name: 'CaliMkIV',
    fullName: 'Mooer CaliMkIV Gain Clone',
    category: 'distortion',
    description: 'Mesa Caliber MkIV-style amp pedal with conditioned gain knob',
    tags: ['cali', 'mesa', 'mooer', 'high-gain', 'pedal', 'clone'],
    parameters: PEDAL_OVERDRIVE_SCHEMA,
    characteristics: {
      gain: 'high',
      tone: 'neutral',
      character: ['tight', 'modern', 'high-gain', 'saturated'],
    },
  },

  // 3: BossMT2_PedalHighGain.json
  {
    index: 3,
    name: 'Boss MT-2',
    fullName: 'Boss MT-2 Metal Zone (High Gain)',
    category: 'distortion',
    description: 'Metal Zone fixed high-gain capture — extreme distortion with scooped character',
    tags: ['mt2', 'boss', 'metal', 'high-gain', 'extreme', 'scooped'],
    parameters: PEDAL_OVERDRIVE_SCHEMA,
    characteristics: {
      gain: 'extreme',
      tone: 'bright',
      character: ['heavy', 'scooped', 'metal', 'extreme'],
    },
  },

  // 4: ProcoRatPedal_HighGain.json
  {
    index: 4,
    name: 'ProCo RAT',
    fullName: 'ProCo RAT Distortion (High Gain)',
    category: 'distortion',
    description: 'Classic RAT distortion fixed high-gain capture',
    tags: ['rat', 'proco', 'distortion', 'high-gain', 'cutting'],
    parameters: PEDAL_OVERDRIVE_SCHEMA,
    characteristics: {
      gain: 'high',
      tone: 'bright',
      character: ['aggressive', 'cutting', 'saturated', 'raw'],
    },
  },

  // 5: MXR78_pedal_DistKnob.json
  {
    index: 5,
    name: 'MXR 78',
    fullName: 'MXR 78 Distortion+',
    category: 'distortion',
    description: 'MXR Distortion+ with conditioned dist knob — raw and edgy',
    tags: ['mxr', 'distortion', 'raw', 'simple', '78'],
    parameters: PEDAL_OVERDRIVE_SCHEMA,
    characteristics: {
      gain: 'high',
      tone: 'bright',
      character: ['raw', 'edgy', 'simple', 'aggressive'],
    },
  },

  // 6: Ibanez808TubeScreamer.json
  {
    index: 6,
    name: 'TS808',
    fullName: 'Ibanez TS808 Tube Screamer',
    category: 'overdrive',
    description: 'Legendary TS808 fixed capture — classic green overdrive warmth',
    tags: ['ts808', 'tubescreamer', 'overdrive', 'classic', 'warm', 'ibanez'],
    parameters: PEDAL_OVERDRIVE_SCHEMA,
    characteristics: {
      gain: 'medium',
      tone: 'neutral',
      character: ['warm', 'smooth', 'classic', 'mid-focused'],
    },
  },

  // 7: RevvG3_Pedal_GainKnob.json
  {
    index: 7,
    name: 'Revv G3',
    fullName: 'Revv G3 Pedal',
    category: 'distortion',
    description: 'Revv G3 high-gain pedal with conditioned gain knob',
    tags: ['revv', 'g3', 'high-gain', 'modern', 'distortion'],
    parameters: PEDAL_OVERDRIVE_SCHEMA,
    characteristics: {
      gain: 'extreme',
      tone: 'bright',
      character: ['modern', 'tight', 'high-gain', 'aggressive'],
    },
  },

  // 8: Jeckyl_and_Hyde_Distortion_DriveKnob.json
  {
    index: 8,
    name: 'Jekyll & Hyde',
    fullName: 'Way Huge Jekyll & Hyde Distortion',
    category: 'distortion',
    description: 'Dual overdrive/distortion with conditioned drive knob',
    tags: ['jekyll', 'hyde', 'way-huge', 'distortion', 'dual', 'overdrive'],
    parameters: PEDAL_OVERDRIVE_SCHEMA,
    characteristics: {
      gain: 'high',
      tone: 'bright',
      character: ['versatile', 'aggressive', 'dynamic', 'dual-mode'],
    },
  },

  // 9: Friedman_BEOD_Pedal_GainKnob.json
  {
    index: 9,
    name: 'Friedman BEOD',
    fullName: 'Friedman BE-OD Pedal',
    category: 'distortion',
    description: 'Friedman BE-OD high-gain pedal with conditioned gain knob',
    tags: ['friedman', 'beod', 'high-gain', 'boutique', 'modern'],
    parameters: PEDAL_OVERDRIVE_SCHEMA,
    characteristics: {
      gain: 'extreme',
      tone: 'bright',
      character: ['tight', 'modern', 'boutique', 'high-gain'],
    },
  },

  // 10: BlackstarHT40_AmpClean.json
  {
    index: 10,
    name: 'Blackstar HT40 Clean',
    fullName: 'Blackstar HT40 Amp (Clean)',
    category: 'amplifier',
    description: 'Blackstar HT40 clean channel — warm tube amp clean tones',
    tags: ['blackstar', 'ht40', 'amp', 'clean', 'tube', 'warm'],
    parameters: AMP_SCHEMA,
    characteristics: {
      gain: 'low',
      tone: 'neutral',
      character: ['clean', 'warm', 'tube', 'dynamic'],
    },
  },

  // 11: MesaMiniRec_HighGain_DirectOut.json
  {
    index: 11,
    name: 'Mesa Mini Rec',
    fullName: 'Mesa Mini Rectifier (High Gain)',
    category: 'amplifier',
    description: 'Mesa Boogie Mini Rectifier high-gain direct out — tight and crushing',
    tags: ['mesa', 'mini-rectifier', 'high-gain', 'metal', 'direct'],
    parameters: AMP_SCHEMA,
    characteristics: {
      gain: 'extreme',
      tone: 'dark',
      character: ['tight', 'crushing', 'modern', 'metal'],
    },
  },

  // 12: Splawn_OD_FractalFM3_HighGain.json
  {
    index: 12,
    name: 'Splawn OD',
    fullName: 'Splawn Overdrive (Fractal FM3, High Gain)',
    category: 'amplifier',
    description: 'Splawn Overdrive amp via Fractal FM3 capture — high-gain British bite',
    tags: ['splawn', 'overdrive', 'fractal', 'fm3', 'high-gain', 'british'],
    parameters: AMP_SCHEMA,
    characteristics: {
      gain: 'extreme',
      tone: 'bright',
      character: ['aggressive', 'british', 'high-gain', 'biting'],
    },
  },

  // 13: EthosLeadChan_GainKnob.json
  {
    index: 13,
    name: 'Ethos Lead',
    fullName: 'Ethos Lead Channel',
    category: 'amplifier',
    description: 'Ethos lead channel with conditioned gain knob — smooth high-gain',
    tags: ['ethos', 'lead', 'high-gain', 'smooth', 'amp'],
    parameters: AMP_SCHEMA,
    characteristics: {
      gain: 'high',
      tone: 'bright',
      character: ['smooth', 'singing', 'high-gain', 'responsive'],
    },
  },

  // 14: PrincetonAmp_Clean.json
  {
    index: 14,
    name: 'Princeton Clean',
    fullName: 'Princeton Amp Clean',
    category: 'amplifier',
    description: 'Fender Princeton-style amp clean capture — sparkle and clarity',
    tags: ['princeton', 'fender', 'clean', 'amp', 'sparkle', 'vintage'],
    parameters: AMP_SCHEMA,
    characteristics: {
      gain: 'low',
      tone: 'bright',
      character: ['clean', 'sparkle', 'vintage', 'dynamic'],
    },
  },

  // 15: DumbleKit_HighG_DirectOut.json
  {
    index: 15,
    name: 'Dumble High Gain',
    fullName: 'Dumble Kit (High Gain, Direct Out)',
    category: 'amplifier',
    description: 'Dumble-style amp kit high-gain direct out — legendary smooth high-gain',
    tags: ['dumble', 'high-gain', 'boutique', 'smooth', 'direct'],
    parameters: AMP_SCHEMA,
    characteristics: {
      gain: 'high',
      tone: 'neutral',
      character: ['smooth', 'rich', 'boutique', 'singing'],
    },
  },

  // 16: BlackstarHT40_GainKnob_SM57mic.json
  {
    index: 16,
    name: 'Blackstar HT40 Gain',
    fullName: 'Blackstar HT40 Gain (SM57)',
    category: 'amplifier',
    description: 'Blackstar HT40 overdrive channel with conditioned gain — miked with SM57',
    tags: ['blackstar', 'ht40', 'amp', 'gain', 'sm57', 'overdrive'],
    parameters: AMP_SCHEMA,
    characteristics: {
      gain: 'high',
      tone: 'bright',
      character: ['british', 'gain', 'dynamic', 'aggressive'],
    },
  },

  // 17: TRexMudhoney_plus_PorkLoin_HighGain.json
  {
    index: 17,
    name: 'Mudhoney + Pork Loin',
    fullName: 'T-Rex Mudhoney + Pork Loin (High Gain)',
    category: 'distortion',
    description: 'T-Rex Mudhoney stacked with Pork Loin — thick high-gain fuzz',
    tags: ['trex', 'mudhoney', 'pork-loin', 'fuzz', 'high-gain', 'stacked'],
    parameters: PEDAL_OVERDRIVE_SCHEMA,
    characteristics: {
      gain: 'extreme',
      tone: 'dark',
      character: ['thick', 'fuzzy', 'saturated', 'stacked'],
    },
  },

  // 18: PrinceOfToneClone_OD_Knob.json
  {
    index: 18,
    name: 'Prince Of Tone OD',
    fullName: 'Prince Of Tone Clone (OD)',
    category: 'overdrive',
    description: 'King of Tone-style overdrive with conditioned OD knob',
    tags: ['prince-of-tone', 'king-of-tone', 'overdrive', 'boutique', 'transparent'],
    parameters: PEDAL_OVERDRIVE_SCHEMA,
    characteristics: {
      gain: 'medium',
      tone: 'neutral',
      character: ['transparent', 'smooth', 'boutique', 'dynamic'],
    },
  },

  // 19: PorkLoinPedal_LowGain.json
  {
    index: 19,
    name: 'Pork Loin',
    fullName: 'Pork Loin Pedal (Low Gain)',
    category: 'overdrive',
    description: 'Way Huge Pork Loin low-gain capture — subtle vintage overdrive',
    tags: ['pork-loin', 'way-huge', 'overdrive', 'low-gain', 'vintage', 'subtle'],
    parameters: PEDAL_OVERDRIVE_SCHEMA,
    characteristics: {
      gain: 'low',
      tone: 'dark',
      character: ['vintage', 'warm', 'subtle', 'dynamic'],
    },
  },

  // 20: PrinceOfToneClone_Dist_Knob.json
  {
    index: 20,
    name: 'Prince Of Tone Dist',
    fullName: 'Prince Of Tone Clone (Dist)',
    category: 'distortion',
    description: 'King of Tone-style distortion channel with conditioned dist knob',
    tags: ['prince-of-tone', 'king-of-tone', 'distortion', 'boutique', 'crunch'],
    parameters: PEDAL_OVERDRIVE_SCHEMA,
    characteristics: {
      gain: 'high',
      tone: 'neutral',
      character: ['crunch', 'boutique', 'responsive', 'dynamic'],
    },
  },

  // 21: AguilarAgro_Bright_Bass.json
  {
    index: 21,
    name: 'Aguilar Agro Bright',
    fullName: 'Aguilar Agro Bass Distortion (Bright)',
    category: 'distortion',
    description: 'Aguilar Agro bass distortion bright mode — grindy and aggressive',
    tags: ['aguilar', 'agro', 'bass', 'distortion', 'bright', 'grindy'],
    parameters: AMP_EQ_SCHEMA,
    characteristics: {
      gain: 'high',
      tone: 'bright',
      character: ['bass', 'aggressive', 'grindy', 'bright'],
    },
  },

  // 22: AguilarAgro_Dark_Bass.json
  {
    index: 22,
    name: 'Aguilar Agro Dark',
    fullName: 'Aguilar Agro Bass Distortion (Dark)',
    category: 'distortion',
    description: 'Aguilar Agro bass distortion dark mode — deep and heavy',
    tags: ['aguilar', 'agro', 'bass', 'distortion', 'dark', 'heavy'],
    parameters: AMP_EQ_SCHEMA,
    characteristics: {
      gain: 'high',
      tone: 'dark',
      character: ['bass', 'heavy', 'dark', 'thick'],
    },
  },

  // 23: BadCat50_MedGain_PREAMP.json
  {
    index: 23,
    name: 'BadCat 50',
    fullName: 'BadCat 50 Preamp (Med Gain)',
    category: 'amplifier',
    description: 'BadCat 50 preamp medium-gain capture — refined boutique crunch',
    tags: ['badcat', 'preamp', 'medium-gain', 'boutique', 'crunch'],
    parameters: AMP_SCHEMA,
    characteristics: {
      gain: 'medium',
      tone: 'neutral',
      character: ['boutique', 'crunch', 'refined', 'dynamic'],
    },
  },

  // 24: ShiftTwin_Clean2_PREAMP.json
  {
    index: 24,
    name: 'ShiftTwin Clean',
    fullName: 'Shift Twin Preamp (Clean 2)',
    category: 'amplifier',
    description: 'Shift Twin preamp clean channel 2 — clear and open',
    tags: ['shifttwin', 'preamp', 'clean', 'clear', 'open'],
    parameters: AMP_SCHEMA,
    characteristics: {
      gain: 'low',
      tone: 'bright',
      character: ['clean', 'clear', 'open', 'sparkle'],
    },
  },

  // 25: Sovtek50_MedGain_DIRECT.json
  {
    index: 25,
    name: 'Sovtek 50 Med',
    fullName: 'Sovtek 50 Amp (Med Gain, Direct)',
    category: 'amplifier',
    description: 'Sovtek 50 medium-gain direct capture — dark and organic',
    tags: ['sovtek', 'amp', 'medium-gain', 'direct', 'dark', 'organic'],
    parameters: AMP_SCHEMA,
    characteristics: {
      gain: 'medium',
      tone: 'dark',
      character: ['organic', 'dark', 'raw', 'vintage'],
    },
  },

  // 26: ShiftTwin_StampedeDT_PREAMP.json
  {
    index: 26,
    name: 'ShiftTwin Stampede',
    fullName: 'Shift Twin Preamp (Stampede DT)',
    category: 'amplifier',
    description: 'Shift Twin Stampede DT preamp — aggressive and punchy',
    tags: ['shifttwin', 'stampede', 'preamp', 'aggressive', 'punchy'],
    parameters: AMP_SCHEMA,
    characteristics: {
      gain: 'high',
      tone: 'bright',
      character: ['aggressive', 'punchy', 'biting', 'tight'],
    },
  },

  // 27: Sovtek50_DodFX56B_DIRECT.json
  {
    index: 27,
    name: 'Sovtek + DOD',
    fullName: 'Sovtek 50 + DOD FX56B Direct',
    category: 'amplifier',
    description: 'Sovtek 50 amp with DOD FX56B stacked — raw and gnarly',
    tags: ['sovtek', 'dod', 'fx56b', 'stacked', 'raw', 'direct'],
    parameters: AMP_SCHEMA,
    characteristics: {
      gain: 'high',
      tone: 'dark',
      character: ['raw', 'gnarly', 'stacked', 'vintage'],
    },
  },

  // 28: ENGL_E645_Clean_EdoardoNapoli.json
  {
    index: 28,
    name: 'ENGL E645 Clean',
    fullName: 'ENGL E645 Amp (Clean)',
    category: 'amplifier',
    description: 'ENGL E645 clean channel — articulate and transparent',
    tags: ['engl', 'e645', 'clean', 'articulate', 'transparent', 'german'],
    parameters: AMP_SCHEMA,
    characteristics: {
      gain: 'low',
      tone: 'neutral',
      character: ['clean', 'articulate', 'transparent', 'german'],
    },
  },

  // 29: Filmosound_with_cab.json
  {
    index: 29,
    name: 'Filmosound',
    fullName: 'Bell & Howell Filmosound (with Cab)',
    category: 'amplifier',
    description: 'Vintage projector amp with cabinet IR — lo-fi and unique',
    tags: ['filmosound', 'vintage', 'lo-fi', 'projector', 'cabinet', 'unique'],
    parameters: AMP_SCHEMA,
    characteristics: {
      gain: 'low',
      tone: 'dark',
      character: ['vintage', 'lo-fi', 'unique', 'warm'],
    },
  },

  // 30: ENGL_E430_Clean_EdoardoNapoli.json
  {
    index: 30,
    name: 'ENGL E430 Clean',
    fullName: 'ENGL E430 Preamp (Clean)',
    category: 'amplifier',
    description: 'ENGL E430 preamp clean channel — tight and professional',
    tags: ['engl', 'e430', 'preamp', 'clean', 'tight', 'german'],
    parameters: AMP_SCHEMA,
    characteristics: {
      gain: 'low',
      tone: 'neutral',
      character: ['clean', 'tight', 'professional', 'german'],
    },
  },

  // 31: ElCoyote_Trainwreck_Crunch.json
  {
    index: 31,
    name: 'El Coyote Crunch',
    fullName: 'El Coyote Trainwreck Crunch',
    category: 'amplifier',
    description: 'Trainwreck-style amp crunch capture — raw and musical',
    tags: ['trainwreck', 'crunch', 'raw', 'musical', 'vintage'],
    parameters: AMP_SCHEMA,
    characteristics: {
      gain: 'medium',
      tone: 'bright',
      character: ['crunch', 'raw', 'musical', 'responsive'],
    },
  },

  // 32: Supro_Bold_DriveKnob.json
  {
    index: 32,
    name: 'Supro Bold',
    fullName: 'Supro Bold Amp',
    category: 'amplifier',
    description: 'Supro Bold amp with conditioned drive knob — vintage blues and rock',
    tags: ['supro', 'bold', 'amp', 'vintage', 'blues', 'rock'],
    parameters: AMP_SCHEMA,
    characteristics: {
      gain: 'medium',
      tone: 'neutral',
      character: ['vintage', 'blues', 'warm', 'responsive'],
    },
  },

  // 33: GoatPedal_HighGain.json
  {
    index: 33,
    name: 'Goat Pedal',
    fullName: 'Goat Pedal (High Gain)',
    category: 'distortion',
    description: 'Goat high-gain pedal capture — heavy and abrasive',
    tags: ['goat', 'high-gain', 'heavy', 'pedal', 'abrasive'],
    parameters: PEDAL_OVERDRIVE_SCHEMA,
    characteristics: {
      gain: 'extreme',
      tone: 'neutral',
      character: ['heavy', 'abrasive', 'saturated', 'extreme'],
    },
  },

  // 34: ProteinBlue_pedal_DriveKnob.json
  {
    index: 34,
    name: 'Protein Blue',
    fullName: 'Protein Blue Pedal',
    category: 'overdrive',
    description: 'Protein Blue overdrive with conditioned drive knob — musical and responsive',
    tags: ['protein-blue', 'overdrive', 'drive', 'musical', 'boutique'],
    parameters: PEDAL_OVERDRIVE_SCHEMA,
    characteristics: {
      gain: 'medium',
      tone: 'bright',
      character: ['musical', 'responsive', 'boutique', 'dynamic'],
    },
  },

  // 35: LittleBigMuff_HighGainPedal.json
  {
    index: 35,
    name: 'Little Big Muff',
    fullName: 'Little Big Muff (High Gain)',
    category: 'distortion',
    description: 'Little Big Muff Pi high-gain capture — thick sustaining fuzz',
    tags: ['muff', 'big-muff', 'fuzz', 'high-gain', 'sustain', 'thick'],
    parameters: PEDAL_OVERDRIVE_SCHEMA,
    characteristics: {
      gain: 'extreme',
      tone: 'dark',
      character: ['thick', 'fuzzy', 'sustaining', 'vintage'],
    },
  },

  // 36: BigMuff_V6_T3_S5.json
  {
    index: 36,
    name: 'Big Muff V6',
    fullName: 'Electro-Harmonix Big Muff V6',
    category: 'distortion',
    description: 'Big Muff Pi Version 6 — creamy sustain and woolly fuzz character',
    tags: ['big-muff', 'v6', 'fuzz', 'sustain', 'ehx', 'vintage'],
    parameters: PEDAL_OVERDRIVE_SCHEMA,
    characteristics: {
      gain: 'extreme',
      tone: 'dark',
      character: ['woolly', 'sustaining', 'vintage', 'creamy'],
    },
  },
];

/**
 * Helper functions for working with the model registry
 */

export function getModelByIndex(index: number): NeuralModelInfo | undefined {
  return GUITARML_MODEL_REGISTRY[index];
}

export function getModelsByCategory(category: string): NeuralModelInfo[] {
  return GUITARML_MODEL_REGISTRY.filter(model => model.category === category);
}

export function searchModels(query: string): NeuralModelInfo[] {
  const lowerQuery = query.toLowerCase();
  return GUITARML_MODEL_REGISTRY.filter(model =>
    model.name.toLowerCase().includes(lowerQuery) ||
    model.fullName.toLowerCase().includes(lowerQuery) ||
    model.description.toLowerCase().includes(lowerQuery) ||
    model.tags.some(tag => tag.includes(lowerQuery))
  );
}

export function getModelCategories(): string[] {
  const categories = new Set(GUITARML_MODEL_REGISTRY.map(model => model.category));
  return Array.from(categories).sort();
}

/**
 * Map GuitarML model characteristics to sensible default parameters (0-100 scale).
 * Used when first adding a neural effect so each model starts with its own character.
 */
export function getModelCharacteristicDefaults(gain: string, tone: string): Record<string, number> {
  const driveMap: Record<string, number> = { low: 30, medium: 50, high: 65, extreme: 75 };
  const drive = driveMap[gain] ?? 50;
  const treble = tone === 'bright' ? 60 : tone === 'dark' ? 40 : 50;
  const bass   = tone === 'dark'   ? 60 : tone === 'bright' ? 40 : 50;
  return { drive, level: 70, treble, bass };
}
