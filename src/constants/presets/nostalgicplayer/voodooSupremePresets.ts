/**
 * Voodoo Supreme synth presets — 4 waveform synthesis modes
 *
 * Voodoo Supreme instruments are waveform-based with limited per-instrument params.
 * The synthesis is driven by waveform table commands in the song data, so presets
 * focus on the waveform-level params exposed via vs_set_instrument_param().
 *
 * Note: Voodoo has very few settable params (sampleLength only for waveforms).
 * The real sound design happens via the 4 synthesis modes set in the track data:
 *   - Ring modulation (frequency-based)
 *   - XOR ring modulation
 *   - Morphing between waveforms
 *   - Frequency-mapped sample playback
 *
 * These presets serve as waveform length templates for different use cases.
 * Categories: bass, lead, pad, drum, fx
 */

export interface VoodooSupremePreset {
  name: string;
  category: 'bass' | 'lead' | 'pad' | 'drum' | 'fx';
  description: string;
  params: Record<string, number>;
}

export const VOODOO_SUPREME_PRESETS: VoodooSupremePreset[] = [
  // -- Bass -------------------------------------------------------------------
  {
    name: 'Ring Mod Bass',
    category: 'bass',
    description: 'Short waveform for ring modulation bass tones',
    params: {
      sampleLength: 32,
    },
  },
  {
    name: 'Deep Morph Bass',
    category: 'bass',
    description: 'Full-length waveform for morphing bass sweeps',
    params: {
      sampleLength: 64,
    },
  },

  // -- Lead -------------------------------------------------------------------
  {
    name: 'XOR Ring Lead',
    category: 'lead',
    description: 'Medium waveform for harsh XOR ring modulation leads',
    params: {
      sampleLength: 32,
    },
  },
  {
    name: 'Morph Glide Lead',
    category: 'lead',
    description: 'Long waveform for smooth morphing lead tones',
    params: {
      sampleLength: 48,
    },
  },
  {
    name: 'Freq Map Lead',
    category: 'lead',
    description: 'Short waveform for frequency-mapped pitch tracking',
    params: {
      sampleLength: 16,
    },
  },

  // -- Pad --------------------------------------------------------------------
  {
    name: 'Slow Morph Pad',
    category: 'pad',
    description: 'Full-length waveform for slow timbral morphing',
    params: {
      sampleLength: 64,
    },
  },
  {
    name: 'Ring Shimmer Pad',
    category: 'pad',
    description: 'Medium waveform for shimmering ring modulation textures',
    params: {
      sampleLength: 48,
    },
  },

  // -- Drum / Percussion ------------------------------------------------------
  {
    name: 'Ring Kick',
    category: 'drum',
    description: 'Tiny waveform for ring mod percussive thumps',
    params: {
      sampleLength: 8,
    },
  },
  {
    name: 'XOR Noise Hit',
    category: 'drum',
    description: 'Very short waveform for XOR ring mod noise bursts',
    params: {
      sampleLength: 4,
    },
  },

  // -- FX / SFX ---------------------------------------------------------------
  {
    name: 'Morph Sweep FX',
    category: 'fx',
    description: 'Full waveform for dramatic morphing transitions',
    params: {
      sampleLength: 64,
    },
  },
  {
    name: 'Ring Zap FX',
    category: 'fx',
    description: 'Short waveform for metallic ring modulation zaps',
    params: {
      sampleLength: 16,
    },
  },
  {
    name: 'Freq Map Texture',
    category: 'fx',
    description: 'Medium waveform for evolving frequency-mapped textures',
    params: {
      sampleLength: 32,
    },
  },
];
