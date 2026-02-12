/**
 * NKS Official Tagging Taxonomy
 *
 * Complete Type, Sub-Type, and Character tag constants from the
 * Native Instruments NKS SDK specification (Section 6.2).
 *
 * IMPORTANT: NI's approval process rejects custom tags.
 * Only use values defined here when exporting .nksf files.
 */

// ============================================================================
// Instrument Types & Sub-Types
// ============================================================================

/** All valid NKS Instrument Types */
export const NKS_INSTRUMENT_TYPES = [
  'Bass',
  'Bowed Strings',
  'Brass',
  'Drums',
  'Flute',
  'Guitar',
  'Mallet Instruments',
  'Organ',
  'Percussion',
  'Piano / Keys',
  'Plucked Strings',
  'Reed Instruments',
  'Sound Effects',
  'Soundscapes',
  'Synth Lead',
  'Synth Misc',
  'Synth Pad',
  'Vocal',
] as const;

export type NKSInstrumentType = typeof NKS_INSTRUMENT_TYPES[number];

/** Sub-Types for each Instrument Type */
export const NKS_INSTRUMENT_SUBTYPES: Record<NKSInstrumentType, readonly string[]> = {
  'Bass': ['Fingered', 'Fretless', 'Line', 'Picked', 'Slapped', 'Synth', 'Upright'],
  'Bowed Strings': ['Cello', 'Double Bass', 'Ensemble', 'Synth', 'Viola', 'Violin'],
  'Brass': ['Ensemble', 'Flugelhorn', 'French Horn', 'Synth', 'Trombone', 'Trumpet', 'Tuba'],
  'Drums': [
    'Clap', 'China Cymbal', 'Clash Cymbal', 'Crash Cymbal', 'Drum Pattern',
    'Finger Cymbal', 'Hi-Hat', 'Hi-Hat Closed', 'Hi-Hat Open', 'Hi-Hat Pedal',
    'Kick', 'Ride Bell', 'Ride Cymbal', 'Shaker', 'Sliced Drum Loop',
    'Snare', 'Snare Brush', 'Snare Rimshot', 'Snare Roll', 'Snare Side Stick',
    'Sizzle Cymbal', 'Splash Cymbal', 'Tom',
  ],
  'Flute': ['Concert', 'Didgeridoo', 'Ocarina', 'Pan Pipe', 'Piccolo', 'Recorder', 'Shakuhachi', 'Synth', 'Whistle'],
  'Guitar': ['Acoustic', 'Classical', 'Dobro', 'Electric', 'Jazz', 'Lap', 'Lute', 'Pedal Steel', 'Slide'],
  'Mallet Instruments': ['Chime', 'Glockenspiel', 'Gong', 'Marimba', 'Other', 'Vibraphone', 'Xylophone'],
  'Organ': ['Accordion', 'Electric', 'Other', 'Pipe', 'Reed', 'Synth'],
  'Percussion': [
    'Agogo', 'Bell', 'Block', 'Bongo', 'Cajon', 'Castanets', 'Clave', 'Click',
    'Conga', 'Cowbell', 'Darabuka', 'Djembe', 'Frame Drum', 'Gong', 'Guiro',
    'Hand Drum', 'Kit', 'Loop', 'Mallet Drum', 'Other', 'Shaker', 'Small Metal',
    'Snap', 'Steel Drum', 'Tabla', 'Taiko', 'Talking Drum', 'Tambourine',
    'Timbale', 'Timpani', 'Triangle', 'Udu', 'Wood',
  ],
  'Piano / Keys': [
    'Clavinet', 'Celesta', 'Digital Piano', 'Electric Piano', 'Grand Piano',
    'Harpsichord', 'Other Piano / Keys', 'Toy Piano', 'Upright Piano',
  ],
  'Plucked Strings': ['Banjo', 'Harp', 'Koto', 'Mandolin', 'Other', 'Oud', 'Sitar', 'Ukulele'],
  'Reed Instruments': ['Bagpipes', 'Bassoon', 'Clarinet', 'Harmonica', 'Melodica', 'Oboe', 'Saxophone', 'Synth', 'Wind Ensemble'],
  'Sound Effects': [
    'Big & Bad', 'Distortion', 'Field Recording', 'Foley', 'Machines',
    'Metal', 'Nature', 'Noise', 'Orchestra', 'Other FX', 'Shots', 'Synth', 'Vinyl', 'Water',
  ],
  'Soundscapes': ['Ambivalent', 'Destructive', 'Gloomy', 'Heavenly', 'Hypnotizing', 'Insanity', 'Peaceful', 'Wind & Noise'],
  'Synth Lead': ['Classic Mono', 'Classic Poly', 'Other', 'Soft', 'Sync', 'Vox'],
  'Synth Misc': ['Classic', 'FX', 'Melodic Sequences', 'Other Sequences', 'Percussive', 'Sweeps & Swells'],
  'Synth Pad': ['Basic', 'Chime', 'Other'],
  'Vocal': ['Computer', 'Creature', 'Female Choir', 'Female Solo', 'Male Choir', 'Male Solo', 'Mixed Choir', 'Phoneme', 'Solo Voice', 'Synth Choir'],
};

// ============================================================================
// Instrument Character Tags
// ============================================================================

export const NKS_INSTRUMENT_CHARACTERS = [
  'Acoustic', 'Additive', 'Airy', 'Analog', 'Arpeggiated',
  'Bright', 'Chord', 'Clean', 'Dark', 'Deep',
  'Digital', 'Dirty', 'Distorted', 'Dry', 'Electric',
  'Evolving', 'Filtered', 'FM', 'Glide / Pitch Mod', 'Granular',
  'Huge', 'Human', 'Layered', 'Lead', 'Lick',
  'Lo-Fi', 'Long Release', 'Melodic', 'Metallic', 'Mono Aftertouch',
  'Monophonic', 'Percussive', 'Physical Model', 'Poly Aftertouch', 'Processed',
  'Riser', 'Sample-based', 'Stabs & Hits', 'Sub', 'Surround',
  'Synthetic', 'Tempo-synced', 'Top', 'Vinyl', 'Vocoded', 'Wet',
] as const;

export type NKSInstrumentCharacter = typeof NKS_INSTRUMENT_CHARACTERS[number];

// ============================================================================
// Effect Types & Sub-Types
// ============================================================================

export const NKS_EFFECT_TYPES = [
  'Amps & Cabinets',
  'Audio Repair',
  'Character',
  'Delay',
  'Distortion',
  'Dynamics',
  'EQ',
  'Filter',
  'Mix Chain',
  'Modulation',
  'Multi FX',
  'Pitch',
  'Reverb',
  'Specialized',
  'Surround',
  'Utilities',
] as const;

export type NKSEffectType = typeof NKS_EFFECT_TYPES[number];

export const NKS_EFFECT_SUBTYPES: Record<NKSEffectType, readonly string[]> = {
  'Amps & Cabinets': ['Bass', 'Clean', 'Crunch', 'High Gain', 'Multi FX'],
  'Audio Repair': ['Clicks & Pops', 'Noise Reduction', 'Post-Production', 'Removal', 'Restoration'],
  'Character': ['Enhancer', 'Exciter', 'Sub-Bass', 'Tape', 'Vinyl'],
  'Delay': ['Analog', 'Creative', 'Digital', 'Modulated', 'Multi-Tap', 'Tape'],
  'Distortion': ['Bitcrusher', 'Distortion', 'Feedback', 'Fuzz', 'Multiband', 'Overdrive', 'Saturation', 'Speaker', 'Tube', 'Waveshaper'],
  'Dynamics': ['Compressor', 'De-Esser', 'Expander', 'Gate', 'Levelling', 'Limiter', 'Multiband', 'Transient Shaper'],
  'EQ': ['Classic', 'Dynamic', 'Graphic', 'Linear Phase', 'Modern', 'Tilt'],
  'Filter': ['Bandpass', 'Comb', 'Envelope', 'Filterbank', 'Formant', 'High-Pass', 'Low-Pass', 'Modulated', 'Multimode', 'Notch', 'Wah-Wah'],
  'Mix Chain': ['Channel Strip', 'Mastering', 'Mixing'],
  'Modulation': ['AM', 'Chorus', 'Doubler', 'Flanger', 'Frequency Shift', 'Panner', 'Phaser', 'Ring Mod', 'Rotator', 'Tremolo'],
  'Multi FX': [
    'Clean', 'Colored', 'Complex', 'Creative', 'Dissonant', 'Distorted', 'Evolving',
    'Mash-Up', 'Mixing', 'Modulated', 'Pitched', 'Plucks', 'Re-Sample', 'Rhythmic', 'Spacious',
  ],
  'Pitch': ['Doubler', 'Granular', 'Harmonizer', 'Micro Shift', 'Pitch Correction', 'Pitch Shift', 'Resonator', 'Vocoder'],
  'Reverb': ['Ambience', 'Chamber', 'Creative', 'Gated', 'Hall', 'Plate', 'Post-Production', 'Room', 'Spring', 'Studio'],
  'Specialized': ['Resample', 'Spectral'],
  'Surround': [],
  'Utilities': ['Analysis & Metering', 'Gain', 'Imaging', 'Modulator', 'Phase Correction', 'Signal Generator', 'Tuner'],
};

export const NKS_EFFECT_CHARACTERS = [
  'Bass', 'Drums', 'Guitar', 'Keys', 'Mastering',
  'Mixbus', 'Pads', 'Piano', 'Plucks', 'Special FX',
  'Strings', 'Synth', 'Vocal',
] as const;

export type NKSEffectCharacter = typeof NKS_EFFECT_CHARACTERS[number];

// ============================================================================
// Validation
// ============================================================================

const instrumentTypeSet = new Set<string>(NKS_INSTRUMENT_TYPES);
const instrumentCharacterSet = new Set<string>(NKS_INSTRUMENT_CHARACTERS);
const effectTypeSet = new Set<string>(NKS_EFFECT_TYPES);
const effectCharacterSet = new Set<string>(NKS_EFFECT_CHARACTERS);

export function isValidNKSInstrumentType(type: string): type is NKSInstrumentType {
  return instrumentTypeSet.has(type);
}

export function isValidNKSInstrumentSubType(type: NKSInstrumentType, subType: string): boolean {
  return NKS_INSTRUMENT_SUBTYPES[type]?.includes(subType) ?? false;
}

export function isValidNKSCharacter(character: string): boolean {
  return instrumentCharacterSet.has(character);
}

export function isValidNKSEffectType(type: string): type is NKSEffectType {
  return effectTypeSet.has(type);
}

export function isValidNKSEffectCharacter(character: string): boolean {
  return effectCharacterSet.has(character);
}

// ============================================================================
// DEViLBOX SynthType -> NKS Type/Sub-Type/Character Defaults
// ============================================================================

import type { SynthType } from '@typedefs/instrument';

export interface NKSTypeMapping {
  type: NKSInstrumentType;
  subType?: string;
  characters?: string[];
}

/**
 * Default NKS type mapping for DEViLBOX synth types.
 * Used when exporting presets without explicit tagging.
 */
export const SYNTH_TYPE_TO_NKS: Partial<Record<SynthType, NKSTypeMapping>> = {
  // Acid / Bass synths
  TB303:          { type: 'Bass', subType: 'Synth', characters: ['Analog', 'Monophonic'] },
  Buzz3o3DF:      { type: 'Bass', subType: 'Synth', characters: ['Analog', 'Monophonic'] },

  // FM synths
  FMSynth:        { type: 'Synth Lead', subType: 'Classic Poly', characters: ['FM', 'Digital'] },
  Dexed:          { type: 'Synth Lead', subType: 'Classic Poly', characters: ['FM', 'Digital'] },
  DexedBridge:    { type: 'Synth Lead', subType: 'Classic Poly', characters: ['FM', 'Digital'] },

  // Classic synths
  MonoSynth:      { type: 'Synth Lead', subType: 'Classic Mono', characters: ['Analog', 'Monophonic'] },
  PolySynth:      { type: 'Synth Lead', subType: 'Classic Poly', characters: ['Analog'] },
  AMSynth:        { type: 'Synth Lead', subType: 'Classic Poly', characters: ['Analog'] },
  DuoSynth:       { type: 'Synth Lead', subType: 'Classic Poly', characters: ['Analog', 'Layered'] },
  Synth:          { type: 'Synth Lead', subType: 'Classic Poly', characters: ['Digital'] },

  // Subtractive / analog modeling
  OBXd:           { type: 'Synth Lead', subType: 'Classic Poly', characters: ['Analog', 'Huge'] },
  V2:             { type: 'Synth Lead', subType: 'Classic Poly', characters: ['Analog', 'Digital'] },
  V2Speech:       { type: 'Vocal', subType: 'Computer', characters: ['Synthetic', 'Digital'] },

  // Wavetable / digital
  Wavetable:      { type: 'Synth Lead', subType: 'Classic Poly', characters: ['Digital'] },
  Vital:          { type: 'Synth Lead', subType: 'Classic Poly', characters: ['Digital'] },
  Odin2:          { type: 'Synth Lead', subType: 'Classic Poly', characters: ['Analog', 'Digital'] },
  Surge:          { type: 'Synth Lead', subType: 'Classic Poly', characters: ['Digital'] },
  Monique:        { type: 'Synth Lead', subType: 'Classic Mono', characters: ['Analog', 'Monophonic'] },

  // Special synths
  DubSiren:       { type: 'Sound Effects', subType: 'Synth', characters: ['Analog', 'Dirty'] },
  SpaceLaser:     { type: 'Sound Effects', subType: 'Synth', characters: ['Digital', 'Percussive'] },
  Synare:         { type: 'Drums', subType: 'Tom', characters: ['Analog', 'Percussive'] },
  GranularSynth:  { type: 'Synth Misc', subType: 'Sweeps & Swells', characters: ['Granular', 'Evolving'] },
  FormantSynth:   { type: 'Vocal', subType: 'Synth Choir', characters: ['Synthetic', 'Human'] },
  Sam:            { type: 'Vocal', subType: 'Computer', characters: ['Digital', 'Synthetic'] },
  PWMSynth:       { type: 'Synth Lead', subType: 'Classic Mono', characters: ['Analog', 'Monophonic'] },
  SuperSaw:       { type: 'Synth Lead', subType: 'Classic Poly', characters: ['Huge', 'Bright'] },
  WobbleBass:     { type: 'Bass', subType: 'Synth', characters: ['Digital', 'Filtered'] },
  StringMachine:  { type: 'Synth Pad', subType: 'Basic', characters: ['Analog', 'Layered'] },
  ChipSynth:      { type: 'Synth Misc', subType: 'Classic', characters: ['Digital', 'Lo-Fi'] },

  // Drum / percussion synths
  MembraneSynth:  { type: 'Drums', subType: 'Kick', characters: ['Analog', 'Percussive'] },
  MetalSynth:     { type: 'Drums', subType: 'Hi-Hat', characters: ['Metallic', 'Percussive'] },
  NoiseSynth:     { type: 'Sound Effects', subType: 'Noise', characters: ['Synthetic'] },
  DrumMachine:    { type: 'Drums', subType: 'Kit', characters: ['Analog', 'Percussive'] },
  DrumKit:        { type: 'Drums', subType: 'Kit', characters: ['Sample-based'] },

  // Tonewheel / keys
  TonewheelOrgan: { type: 'Organ', subType: 'Electric', characters: ['Electric', 'Analog'] },
  Organ:          { type: 'Organ', subType: 'Electric', characters: ['Electric'] },

  // String / acoustic
  PluckSynth:     { type: 'Plucked Strings', subType: 'Other', characters: ['Physical Model', 'Percussive'] },
  Melodica:       { type: 'Reed Instruments', subType: 'Melodica', characters: ['Acoustic', 'Airy'] },

  // WAM
  WAM:            { type: 'Synth Lead', subType: 'Other', characters: ['Digital'] },
};

// ============================================================================
// DEViLBOX Category <-> NKS Type mapping
// ============================================================================

import type { PresetCategory } from '@/stores/usePresetStore';

/**
 * Map DEViLBOX preset categories to official NKS bank chain + type.
 */
export const CATEGORY_TO_NKS_TYPE: Record<PresetCategory, { bankChain: string[]; type: NKSInstrumentType }> = {
  Bass: { bankChain: ['DEViLBOX', 'Bass'], type: 'Bass' },
  Lead: { bankChain: ['DEViLBOX', 'Lead'], type: 'Synth Lead' },
  Pad:  { bankChain: ['DEViLBOX', 'Pad'],  type: 'Synth Pad' },
  Drum: { bankChain: ['DEViLBOX', 'Drum'], type: 'Drums' },
  FX:   { bankChain: ['DEViLBOX', 'FX'],   type: 'Sound Effects' },
  User: { bankChain: ['DEViLBOX', 'User'], type: 'Synth Misc' },
};

/**
 * Map NKS Type back to the closest DEViLBOX category.
 */
export function nksTypeToCategory(nksType: string): PresetCategory {
  const lower = nksType.toLowerCase();
  if (lower.includes('bass')) return 'Bass';
  if (lower.includes('lead') || lower === 'synth lead') return 'Lead';
  if (lower.includes('pad') || lower === 'synth pad' || lower === 'soundscapes') return 'Pad';
  if (lower.includes('drum') || lower.includes('percussion')) return 'Drum';
  if (lower.includes('effect') || lower.includes('sound effects')) return 'FX';
  return 'User';
}

/**
 * Get NKS type info for a synth, with fallback to category-based default.
 */
export function getNKSTypeForSynth(
  synthType: SynthType,
  category?: PresetCategory,
): NKSTypeMapping {
  // Check synth-specific mapping first
  const specific = SYNTH_TYPE_TO_NKS[synthType];
  if (specific) return specific;

  // Chip synths default to Synth Misc
  const st = synthType as string;
  if (st.startsWith('Furnace') || st.startsWith('MAME') || st.startsWith('Buzz')) {
    return { type: 'Synth Misc', subType: 'Classic', characters: ['Digital', 'Lo-Fi'] };
  }

  // VSTBridge synths default to Synth Lead
  if (st.includes('Bridge') || st.includes('VST')) {
    return { type: 'Synth Lead', subType: 'Other', characters: ['Digital'] };
  }

  // Fall back to category
  if (category) {
    const catInfo = CATEGORY_TO_NKS_TYPE[category];
    return { type: catInfo.type };
  }

  return { type: 'Synth Misc' };
}

/**
 * Convert freeform tags to validated NKS character tags.
 * Returns only tags that are in the official NKS character list.
 */
export function validateCharacterTags(tags: string[]): string[] {
  return tags.filter(tag =>
    NKS_INSTRUMENT_CHARACTERS.some(
      c => c.toLowerCase() === tag.toLowerCase()
    )
  ).map(tag =>
    // Normalize to official capitalization
    NKS_INSTRUMENT_CHARACTERS.find(
      c => c.toLowerCase() === tag.toLowerCase()
    ) || tag
  );
}
