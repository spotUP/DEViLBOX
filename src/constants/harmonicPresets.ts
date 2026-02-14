/**
 * HarmonicSynth Presets
 * Additive synthesis presets exploring spectral shaping and harmonic content
 */

import type { HarmonicSynthConfig } from '@typedefs/instrument';
import type { SynthPreset } from './synthPresets';

/** Sawtooth harmonic series: 1/n */
const SAW_HARMONICS = Array.from({ length: 32 }, (_, i) => 1 / (i + 1));

/** Square wave harmonic series: odd harmonics only, 1/n */
const SQUARE_HARMONICS = Array.from({ length: 32 }, (_, i) =>
  (i + 1) % 2 === 1 ? 1 / (i + 1) : 0
);

/** Triangle wave harmonic series: odd harmonics only, 1/n² */
const TRIANGLE_HARMONICS = Array.from({ length: 32 }, (_, i) =>
  (i + 1) % 2 === 1 ? 1 / Math.pow(i + 1, 2) : 0
);

/** Sine wave: fundamental only */
const SINE_HARMONICS = Array.from({ length: 32 }, (_, i) => i === 0 ? 1 : 0);

/** Organ-like: fundamental + odd harmonics */
const ORGAN_HARMONICS = Array.from({ length: 32 }, (_, i) => {
  const n = i + 1;
  if (n % 2 === 0) return 0;
  // Drawbar-style: 8', 4', 2⅔', 2', 1⅗'
  if (n === 1) return 1.0;      // 8' fundamental
  if (n === 3) return 0.8;      // 4' + 2⅔' (3rd harmonic)
  if (n === 5) return 0.6;      // 2' + 1⅗' (5th harmonic)
  if (n === 7) return 0.4;      // 7th
  if (n === 9) return 0.3;      // 9th
  return 0.2 / n;
});

/** Bright formant: emphasis on harmonics 4-8 */
const FORMANT_HARMONICS = Array.from({ length: 32 }, (_, i) => {
  const n = i + 1;
  if (n >= 4 && n <= 8) return 1.0 - (Math.abs(n - 6) * 0.15);
  return 0.3 / n;
});

/** Bell-like: initial harmonics strong, then rapid decay */
const BELL_HARMONICS = Array.from({ length: 32 }, (_, i) => {
  const n = i + 1;
  return Math.exp(-n * 0.3);
});

/** Metallic: inharmonic-ish ratios (simulate stretched partials) */
const METALLIC_HARMONICS = Array.from({ length: 32 }, (_, i) => {
  const n = i + 1;
  // Emphasize non-integer ratios by boosting certain harmonics
  const boost = (n % 3 === 0 || n % 7 === 0) ? 1.5 : 1.0;
  return (1 / n) * boost * Math.exp(-n * 0.1);
});

/** Glass/crystal: even harmonics emphasized */
const GLASS_HARMONICS = Array.from({ length: 32 }, (_, i) => {
  const n = i + 1;
  return (n % 2 === 0) ? 1 / Math.sqrt(n) : 0.3 / n;
});

/** Nasal/reedy: strong 3rd and 5th harmonics */
const REED_HARMONICS = Array.from({ length: 32 }, (_, i) => {
  const n = i + 1;
  if (n === 1) return 1.0;
  if (n === 3) return 0.9;
  if (n === 5) return 0.7;
  if (n === 7) return 0.5;
  return 0.3 / n;
});

/** Filtered saw: low-pass filtered sawtooth */
const FILTERED_SAW_HARMONICS = Array.from({ length: 32 }, (_, i) => {
  const n = i + 1;
  return (1 / n) * Math.exp(-n * 0.15);
});

export const HARMONIC_PRESETS: SynthPreset[] = [
  {
    id: 'harmonic-pure-sine',
    name: 'Pure Sine',
    description: 'Clean sine wave - fundamental only',
    category: 'pad',
    config: {
      harmonics: SINE_HARMONICS,
      spectralTilt: 0,
      evenOddBalance: 0,
      filter: { type: 'lowpass', cutoff: 12000, resonance: 0.5 },
      envelope: { attack: 50, decay: 200, sustain: 80, release: 300 },
      lfo: { rate: 2, depth: 0, target: 'pitch' },
      maxVoices: 8,
    } as Partial<HarmonicSynthConfig>,
  },
  {
    id: 'harmonic-bright-saw',
    name: 'Bright Saw',
    description: 'Classic sawtooth with all harmonics',
    category: 'lead',
    config: {
      harmonics: SAW_HARMONICS,
      spectralTilt: 20,
      evenOddBalance: 0,
      filter: { type: 'lowpass', cutoff: 8000, resonance: 2 },
      envelope: { attack: 5, decay: 150, sustain: 70, release: 200 },
      lfo: { rate: 5, depth: 15, target: 'filter' },
      maxVoices: 6,
    } as Partial<HarmonicSynthConfig>,
  },
  {
    id: 'harmonic-warm-square',
    name: 'Warm Square',
    description: 'Square wave - odd harmonics only',
    category: 'bass',
    config: {
      harmonics: SQUARE_HARMONICS,
      spectralTilt: -10,
      evenOddBalance: -100,
      filter: { type: 'lowpass', cutoff: 2000, resonance: 1 },
      envelope: { attack: 10, decay: 200, sustain: 90, release: 150 },
      lfo: { rate: 1.5, depth: 0, target: 'pitch' },
      maxVoices: 8,
    } as Partial<HarmonicSynthConfig>,
  },
  {
    id: 'harmonic-mellow-triangle',
    name: 'Mellow Triangle',
    description: 'Soft triangle wave with gentle attack',
    category: 'pad',
    config: {
      harmonics: TRIANGLE_HARMONICS,
      spectralTilt: -20,
      evenOddBalance: -80,
      filter: { type: 'lowpass', cutoff: 5000, resonance: 0.5 },
      envelope: { attack: 100, decay: 300, sustain: 85, release: 400 },
      lfo: { rate: 0.5, depth: 5, target: 'pitch' },
      maxVoices: 8,
    } as Partial<HarmonicSynthConfig>,
  },
  {
    id: 'harmonic-church-organ',
    name: 'Church Organ',
    description: 'Classic drawbar organ sound',
    category: 'key',
    config: {
      harmonics: ORGAN_HARMONICS,
      spectralTilt: 0,
      evenOddBalance: -60,
      filter: { type: 'lowpass', cutoff: 10000, resonance: 1 },
      envelope: { attack: 20, decay: 100, sustain: 95, release: 100 },
      lfo: { rate: 6, depth: 3, target: 'pitch' },
      maxVoices: 8,
    } as Partial<HarmonicSynthConfig>,
  },
  {
    id: 'harmonic-vocal-formant',
    name: 'Vocal Formant',
    description: 'Human voice-like formant emphasis',
    category: 'lead',
    config: {
      harmonics: FORMANT_HARMONICS,
      spectralTilt: 0,
      evenOddBalance: 20,
      filter: { type: 'bandpass', cutoff: 1500, resonance: 8 },
      envelope: { attack: 30, decay: 250, sustain: 60, release: 200 },
      lfo: { rate: 4, depth: 40, target: 'filter' },
      maxVoices: 6,
    } as Partial<HarmonicSynthConfig>,
  },
  {
    id: 'harmonic-bell',
    name: 'Spectral Bell',
    description: 'Bell-like with exponential harmonic decay',
    category: 'fx',
    config: {
      harmonics: BELL_HARMONICS,
      spectralTilt: -30,
      evenOddBalance: 30,
      filter: { type: 'highpass', cutoff: 200, resonance: 2 },
      envelope: { attack: 1, decay: 2000, sustain: 10, release: 1500 },
      lfo: { rate: 0.3, depth: 0, target: 'pitch' },
      maxVoices: 6,
    } as Partial<HarmonicSynthConfig>,
  },
  {
    id: 'harmonic-metallic-pad',
    name: 'Metallic Pad',
    description: 'Shimmering pad with inharmonic partials',
    category: 'pad',
    config: {
      harmonics: METALLIC_HARMONICS,
      spectralTilt: 10,
      evenOddBalance: 0,
      filter: { type: 'lowpass', cutoff: 6000, resonance: 3 },
      envelope: { attack: 200, decay: 400, sustain: 75, release: 600 },
      lfo: { rate: 1.2, depth: 20, target: 'spectral' },
      maxVoices: 8,
    } as Partial<HarmonicSynthConfig>,
  },
  {
    id: 'harmonic-glass',
    name: 'Glass Chimes',
    description: 'Crystalline sound with even harmonic emphasis',
    category: 'fx',
    config: {
      harmonics: GLASS_HARMONICS,
      spectralTilt: 15,
      evenOddBalance: 100,
      filter: { type: 'highpass', cutoff: 400, resonance: 4 },
      envelope: { attack: 5, decay: 1500, sustain: 20, release: 1000 },
      lfo: { rate: 0.8, depth: 10, target: 'filter' },
      maxVoices: 6,
    } as Partial<HarmonicSynthConfig>,
  },
  {
    id: 'harmonic-reed',
    name: 'Nasal Reed',
    description: 'Clarinet/oboe-like timbre',
    category: 'lead',
    config: {
      harmonics: REED_HARMONICS,
      spectralTilt: -5,
      evenOddBalance: -70,
      filter: { type: 'bandpass', cutoff: 2500, resonance: 6 },
      envelope: { attack: 15, decay: 200, sustain: 75, release: 150 },
      lfo: { rate: 5.5, depth: 5, target: 'pitch' },
      maxVoices: 6,
    } as Partial<HarmonicSynthConfig>,
  },
  {
    id: 'harmonic-pluck',
    name: 'Plucked String',
    description: 'Fast attack with filtered saw harmonics',
    category: 'pluck',
    config: {
      harmonics: FILTERED_SAW_HARMONICS,
      spectralTilt: -25,
      evenOddBalance: 0,
      filter: { type: 'lowpass', cutoff: 4000, resonance: 2 },
      envelope: { attack: 2, decay: 800, sustain: 10, release: 200 },
      lfo: { rate: 0, depth: 0, target: 'pitch' },
      maxVoices: 8,
    } as Partial<HarmonicSynthConfig>,
  },
  {
    id: 'harmonic-phase-pad',
    name: 'Phasing Pad',
    description: 'Evolving pad with spectral LFO modulation',
    category: 'pad',
    config: {
      harmonics: SAW_HARMONICS,
      spectralTilt: -15,
      evenOddBalance: 0,
      filter: { type: 'lowpass', cutoff: 7000, resonance: 1.5 },
      envelope: { attack: 300, decay: 500, sustain: 80, release: 800 },
      lfo: { rate: 0.25, depth: 80, target: 'spectral' },
      maxVoices: 8,
    } as Partial<HarmonicSynthConfig>,
  },
  {
    id: 'harmonic-dark-bass',
    name: 'Dark Bass',
    description: 'Deep bass with strong fundamental',
    category: 'bass',
    config: {
      harmonics: Array.from({ length: 32 }, (_, i) => Math.exp(-i * 0.8)),
      spectralTilt: -50,
      evenOddBalance: 0,
      filter: { type: 'lowpass', cutoff: 800, resonance: 4 },
      envelope: { attack: 5, decay: 150, sustain: 90, release: 100 },
      lfo: { rate: 0, depth: 0, target: 'pitch' },
      maxVoices: 6,
    } as Partial<HarmonicSynthConfig>,
  },
  {
    id: 'harmonic-bright-lead',
    name: 'Bright Lead',
    description: 'Cutting lead with boosted high harmonics',
    category: 'lead',
    config: {
      harmonics: Array.from({ length: 32 }, (_, i) => {
        const n = i + 1;
        return n <= 16 ? 1 / Math.sqrt(n) : 0.8 / n;
      }),
      spectralTilt: 40,
      evenOddBalance: 0,
      filter: { type: 'lowpass', cutoff: 12000, resonance: 3 },
      envelope: { attack: 3, decay: 100, sustain: 80, release: 150 },
      lfo: { rate: 6, depth: 25, target: 'filter' },
      maxVoices: 4,
    } as Partial<HarmonicSynthConfig>,
  },
  {
    id: 'harmonic-string-ensemble',
    name: 'String Ensemble',
    description: 'Lush string section with slow attack',
    category: 'string',
    config: {
      harmonics: Array.from({ length: 32 }, (_, i) => {
        const n = i + 1;
        return (1 / n) * Math.exp(-n * 0.12);
      }),
      spectralTilt: -8,
      evenOddBalance: 15,
      filter: { type: 'lowpass', cutoff: 6000, resonance: 1 },
      envelope: { attack: 250, decay: 400, sustain: 85, release: 700 },
      lfo: { rate: 2, depth: 12, target: 'pitch' },
      maxVoices: 8,
    } as Partial<HarmonicSynthConfig>,
  },
  {
    id: 'harmonic-hollow',
    name: 'Hollow Pipe',
    description: 'Missing even harmonics for hollow sound',
    category: 'key',
    config: {
      harmonics: Array.from({ length: 32 }, (_, i) => {
        const n = i + 1;
        if (n % 2 === 0) return 0;
        return 1 / Math.pow(n, 1.5);
      }),
      spectralTilt: -30,
      evenOddBalance: -100,
      filter: { type: 'bandpass', cutoff: 1200, resonance: 5 },
      envelope: { attack: 40, decay: 300, sustain: 70, release: 250 },
      lfo: { rate: 3, depth: 8, target: 'filter' },
      maxVoices: 6,
    } as Partial<HarmonicSynthConfig>,
  },
  {
    id: 'harmonic-choir',
    name: 'Synth Choir',
    description: 'Choir-like vowel formants',
    category: 'pad',
    config: {
      harmonics: Array.from({ length: 32 }, (_, i) => {
        const n = i + 1;
        // Emphasize formant regions (vowel "ah")
        if (n >= 3 && n <= 5) return 0.9;
        if (n >= 8 && n <= 12) return 0.7;
        return 0.3 / n;
      }),
      spectralTilt: 0,
      evenOddBalance: 0,
      filter: { type: 'bandpass', cutoff: 1800, resonance: 7 },
      envelope: { attack: 150, decay: 350, sustain: 80, release: 500 },
      lfo: { rate: 0.4, depth: 30, target: 'filter' },
      maxVoices: 8,
    } as Partial<HarmonicSynthConfig>,
  },
  {
    id: 'harmonic-saw-bass',
    name: 'Analog Saw Bass',
    description: 'Classic analog bass with saw wave',
    category: 'bass',
    config: {
      harmonics: SAW_HARMONICS,
      spectralTilt: -10,
      evenOddBalance: 0,
      filter: { type: 'lowpass', cutoff: 1500, resonance: 8 },
      envelope: { attack: 5, decay: 120, sustain: 70, release: 80 },
      lfo: { rate: 0, depth: 0, target: 'pitch' },
      maxVoices: 4,
    } as Partial<HarmonicSynthConfig>,
  },
  {
    id: 'harmonic-sweeping-lead',
    name: 'Sweeping Lead',
    description: 'Lead with dynamic filter modulation',
    category: 'lead',
    config: {
      harmonics: SAW_HARMONICS,
      spectralTilt: 10,
      evenOddBalance: 0,
      filter: { type: 'lowpass', cutoff: 3000, resonance: 12 },
      envelope: { attack: 10, decay: 200, sustain: 65, release: 180 },
      lfo: { rate: 3.5, depth: 60, target: 'filter' },
      maxVoices: 4,
    } as Partial<HarmonicSynthConfig>,
  },
  {
    id: 'harmonic-ethereal',
    name: 'Ethereal Shimmer',
    description: 'Dreamy pad with spectral morphing',
    category: 'pad',
    config: {
      harmonics: Array.from({ length: 32 }, (_, i) => {
        const n = i + 1;
        return Math.sin(n * Math.PI / 8) * (1 / n);
      }),
      spectralTilt: 5,
      evenOddBalance: 50,
      filter: { type: 'lowpass', cutoff: 9000, resonance: 2 },
      envelope: { attack: 400, decay: 600, sustain: 75, release: 1000 },
      lfo: { rate: 0.15, depth: 90, target: 'spectral' },
      maxVoices: 8,
    } as Partial<HarmonicSynthConfig>,
  },
];
