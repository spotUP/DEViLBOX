/**
 * Chip Parameter Metadata for MAME Chip Synths
 *
 * Defines the parameter layout, ranges, types, and display formatting
 * for every MAME chip synth in the system. Used by the unified instrument
 * editor to dynamically build parameter UIs.
 *
 * IMPORTANT: The `key` field in each ChipParameterDef must exactly match
 * the string keys used in each synth's setParam() paramMap.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChipParamType = 'knob' | 'select' | 'toggle' | 'text';

export interface ChipParameterDef {
  key: string;
  label: string;
  group: string;
  type: ChipParamType;
  min?: number;
  max?: number;
  step?: number;
  default: number;
  defaultText?: string;        // Default text value (for 'text' type)
  placeholder?: string;        // Placeholder text (for 'text' type)
  unit?: string;
  formatValue?: string; // 'percent' | 'hz' | 'int' | 'db' | 'seconds' - resolved in component
  options?: { value: number; label: string }[];
  logarithmic?: boolean;
  bipolar?: boolean;
}

export interface RomConfig {
  requiredZip: string;    // Display text for expected ROM file
  bankCount: number;      // Number of individual ROM banks
  romType: string;        // Identifier for ToneEngine dispatch ('rsa', 'swp30', etc.)
}

export interface ChipSynthDef {
  synthType: string;
  name: string;
  subtitle: string;
  color: string;
  parameters: ChipParameterDef[];
  presetCount: number;
  presetNames?: string[];
  operatorCount?: number;
  operatorParams?: ChipParameterDef[];
  romConfig?: RomConfig;
}

// ---------------------------------------------------------------------------
// Definitions
// ---------------------------------------------------------------------------

export const CHIP_SYNTH_DEFS: Record<string, ChipSynthDef> = {

  // =========================================================================
  // MAMEAstrocade - Bally Astrocade Custom I/O (1977)
  // =========================================================================
  MAMEAstrocade: {
    synthType: 'MAMEAstrocade',
    name: 'Astrocade',
    subtitle: 'Bally Astrocade Custom I/O (1977)',
    color: '#a855f7',
    presetCount: 8,
    presetNames: [
      'Clean Square', 'Vibrato Square', 'Wide Vibrato', 'Fast Vibrato',
      'Noise+Tone', 'Noise Modulated', 'Arcade Siren', 'Pure Noise',
    ],
    parameters: [
      { key: 'volume', label: 'Volume', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
      { key: 'vibrato_speed', label: 'Vibrato Speed', group: 'Vibrato', type: 'select', min: 0, max: 3, default: 0, formatValue: 'int', options: [
        { value: 0, label: 'Fastest' }, { value: 1, label: 'Fast' }, { value: 2, label: 'Slow' }, { value: 3, label: 'Slowest' },
      ]},
      { key: 'vibrato_depth', label: 'Vibrato Depth', group: 'Vibrato', type: 'knob', min: 0, max: 63, step: 1, default: 0, formatValue: 'int' },
      { key: 'noise_am', label: 'Noise AM', group: 'Noise', type: 'toggle', min: 0, max: 1, default: 0 },
      { key: 'noise_mod', label: 'Noise Mod', group: 'Noise', type: 'toggle', min: 0, max: 1, default: 0 },
      { key: 'noise_vol', label: 'Noise Volume', group: 'Noise', type: 'knob', min: 0, max: 255, step: 1, default: 0, formatValue: 'int' },
      { key: 'master_freq', label: 'Master Freq', group: 'Oscillator', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.5, formatValue: 'percent' },
      { key: 'stereo_width', label: 'Stereo Width', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.5, formatValue: 'percent' },
    ],
  },

  // =========================================================================
  // MAMESN76477 - TI Complex Sound Generator (1978)
  // =========================================================================
  MAMESN76477: {
    synthType: 'MAMESN76477',
    name: 'SN76477',
    subtitle: 'TI Complex Sound Generator (1978)',
    color: '#ef4444',
    presetCount: 5,
    presetNames: ['UFO', 'Laser', 'Explosion', 'Siren', 'Engine'],
    parameters: [
      { key: 'vco_freq', label: 'VCO Freq', group: 'VCO', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.5, formatValue: 'percent' },
      { key: 'slf_freq', label: 'SLF Freq', group: 'SLF', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.5, formatValue: 'percent' },
      { key: 'noise_freq', label: 'Noise Freq', group: 'Noise', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.5, formatValue: 'percent' },
      { key: 'vco_duty_cycle', label: 'VCO Duty', group: 'VCO', type: 'knob', min: 0.18, max: 1.0, step: 0.01, default: 0.5, formatValue: 'percent' },
      { key: 'mixer_mode', label: 'Mixer Mode', group: 'Mixer', type: 'select', min: 0, max: 7, default: 0, formatValue: 'int', options: [
        { value: 0, label: 'VCO' }, { value: 1, label: 'SLF' }, { value: 2, label: 'Noise' },
        { value: 3, label: 'VCO+Noise' }, { value: 4, label: 'SLF+Noise' },
        { value: 5, label: 'SLF+VCO+Noise' }, { value: 6, label: 'SLF+VCO' }, { value: 7, label: 'Inhibit' },
      ]},
      { key: 'envelope_mode', label: 'Envelope Mode', group: 'Envelope', type: 'select', min: 0, max: 3, default: 0, formatValue: 'int', options: [
        { value: 0, label: 'VCO' }, { value: 1, label: 'One-Shot' }, { value: 2, label: 'Mixer Only' }, { value: 3, label: 'VCO Alt' },
      ]},
      { key: 'attack_time', label: 'Attack', group: 'Envelope', type: 'knob', min: 0.001, max: 10, step: 0.001, default: 0.1, unit: 's', formatValue: 'seconds', logarithmic: true },
      { key: 'decay_time', label: 'Decay', group: 'Envelope', type: 'knob', min: 0.001, max: 10, step: 0.001, default: 0.5, unit: 's', formatValue: 'seconds', logarithmic: true },
      { key: 'one_shot_time', label: 'One-Shot', group: 'Envelope', type: 'knob', min: 0.001, max: 10, step: 0.001, default: 0.2, unit: 's', formatValue: 'seconds', logarithmic: true },
      { key: 'noise_filter_freq', label: 'Noise Filter', group: 'Noise', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.5, formatValue: 'percent' },
      { key: 'amplitude', label: 'Amplitude', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
      { key: 'vco_mode', label: 'VCO Mode', group: 'VCO', type: 'select', min: 0, max: 1, default: 0, formatValue: 'int', options: [
        { value: 0, label: 'External' }, { value: 1, label: 'SLF Modulates' },
      ]},
      { key: 'enable', label: 'Enable', group: 'Output', type: 'toggle', min: 0, max: 1, default: 0 },
    ],
  },

  // =========================================================================
  // MAMEASC - Apple Sound Chip (1987)
  // =========================================================================
  MAMEASC: {
    synthType: 'MAMEASC',
    name: 'ASC',
    subtitle: 'Apple Sound Chip (1987)',
    color: '#10b981',
    presetCount: 8,
    presetNames: [
      'Sine Pad', 'Triangle Lead', 'Saw Bass', 'Square Retro',
      'Pulse Nasal', 'Organ', 'Piano', 'Strings',
    ],
    parameters: [
      { key: 'volume', label: 'Volume', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
      { key: 'waveform', label: 'Waveform', group: 'Oscillator', type: 'select', min: 0, max: 7, default: 0, formatValue: 'int', options: [
        { value: 0, label: 'Sine' }, { value: 1, label: 'Saw' }, { value: 2, label: 'Square' },
        { value: 3, label: 'Triangle' }, { value: 4, label: 'Noise' }, { value: 5, label: 'Pulse 25%' },
        { value: 6, label: 'Organ' }, { value: 7, label: 'Random' },
      ]},
      { key: 'attack', label: 'Attack', group: 'Envelope', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.01, formatValue: 'percent' },
      { key: 'decay', label: 'Decay', group: 'Envelope', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.3, formatValue: 'percent' },
      { key: 'sustain', label: 'Sustain', group: 'Envelope', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.7, formatValue: 'percent' },
      { key: 'release', label: 'Release', group: 'Envelope', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.3, formatValue: 'percent' },
      { key: 'stereo_width', label: 'Stereo Width', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.5, formatValue: 'percent' },
      { key: 'detune', label: 'Detune', group: 'Oscillator', type: 'knob', min: 0, max: 1, step: 0.01, default: 0, formatValue: 'percent' },
    ],
  },

  // =========================================================================
  // MAMEES5503 - Ensoniq DOC 32-Voice Wavetable (1986)
  // =========================================================================
  MAMEES5503: {
    synthType: 'MAMEES5503',
    name: 'ES5503',
    subtitle: 'Ensoniq DOC 32-Voice Wavetable (1986)',
    color: '#3b82f6',
    presetCount: 0,
    romConfig: {
      requiredZip: 'es5503.zip (Ensoniq Mirage wavetable ROM)',
      bankCount: 1,
      romType: 'es5503',
    },
    parameters: [
      { key: 'waveform', label: 'Waveform', group: 'Oscillator', type: 'select', min: 0, max: 7, default: 0, formatValue: 'int', options: [
        { value: 0, label: 'Sine' }, { value: 1, label: 'Saw' }, { value: 2, label: 'Square' },
        { value: 3, label: 'Triangle' }, { value: 4, label: 'Noise' }, { value: 5, label: 'Pulse 25%' },
        { value: 6, label: 'Pulse 12%' }, { value: 7, label: 'Organ' },
      ]},
      { key: 'wave_size', label: 'Wave Size', group: 'Oscillator', type: 'select', min: 0, max: 7, default: 2, formatValue: 'int', options: [
        { value: 0, label: '256' }, { value: 1, label: '512' }, { value: 2, label: '1024' },
        { value: 3, label: '2048' }, { value: 4, label: '4096' }, { value: 5, label: '8192' },
        { value: 6, label: '16384' }, { value: 7, label: '32768' },
      ]},
      { key: 'resolution', label: 'Resolution', group: 'Oscillator', type: 'select', min: 0, max: 7, default: 7, formatValue: 'int', options: [
        { value: 0, label: 'Coarse' }, { value: 1, label: '1' }, { value: 2, label: '2' },
        { value: 3, label: '3' }, { value: 4, label: '4' }, { value: 5, label: '5' },
        { value: 6, label: '6' }, { value: 7, label: 'Fine' },
      ]},
      { key: 'osc_mode', label: 'Osc Mode', group: 'Oscillator', type: 'select', min: 0, max: 3, default: 0, formatValue: 'int', options: [
        { value: 0, label: 'Free Run' }, { value: 1, label: 'One Shot' },
        { value: 2, label: 'Sync/AM' }, { value: 3, label: 'Swap' },
      ]},
      { key: 'volume', label: 'Volume', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
      { key: 'num_oscillators', label: 'Oscillators', group: 'Oscillator', type: 'knob', min: 1, max: 32, step: 1, default: 8, formatValue: 'int' },
      { key: 'attack_time', label: 'Attack', group: 'Envelope', type: 'knob', min: 0.001, max: 5, step: 0.001, default: 0.01, unit: 's', formatValue: 'seconds', logarithmic: true },
      { key: 'release_time', label: 'Release', group: 'Envelope', type: 'knob', min: 0.001, max: 5, step: 0.001, default: 0.3, unit: 's', formatValue: 'seconds', logarithmic: true },
    ],
  },

  // =========================================================================
  // MAMEMEA8000 - Philips MEA8000 LPC Speech
  // =========================================================================
  MAMEMEA8000: {
    synthType: 'MAMEMEA8000',
    name: 'MEA8000',
    subtitle: 'Philips MEA8000 LPC Speech Synthesizer',
    color: '#f59e0b',
    presetCount: 8,
    presetNames: ['AH', 'EE', 'IH', 'OH', 'OO', 'AE', 'UH', 'ER'],
    parameters: [
      { key: 'speechText', label: 'Speech Text', group: 'Speech', type: 'text', default: 0, defaultText: 'HELLO WORLD', placeholder: 'Type text and press Speak' },
      { key: 'volume', label: 'Volume', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
      { key: 'noise_mode', label: 'Noise Mode', group: 'Excitation', type: 'toggle', min: 0, max: 1, default: 0 },
      { key: 'f1_index', label: 'F1 Index', group: 'Formants', type: 'knob', min: 0, max: 7, step: 1, default: 3, formatValue: 'int' },
      { key: 'f2_index', label: 'F2 Index', group: 'Formants', type: 'knob', min: 0, max: 7, step: 1, default: 4, formatValue: 'int' },
      { key: 'f3_index', label: 'F3 Index', group: 'Formants', type: 'knob', min: 0, max: 7, step: 1, default: 5, formatValue: 'int' },
      { key: 'bw_index', label: 'Bandwidth', group: 'Formants', type: 'select', min: 0, max: 3, default: 0, formatValue: 'int', options: [
        { value: 0, label: 'Wide (726Hz)' }, { value: 1, label: 'Medium (309Hz)' },
        { value: 2, label: 'Narrow (125Hz)' }, { value: 3, label: 'V.Narrow (50Hz)' },
      ]},
      { key: 'amplitude', label: 'Amplitude', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
      { key: 'stereo_width', label: 'Stereo Width', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.5, formatValue: 'percent' },
      { key: 'interp_time', label: 'Interp Time', group: 'Formants', type: 'knob', min: 0.1, max: 10, step: 0.1, default: 1.0, unit: 's', formatValue: 'seconds', logarithmic: true },
    ],
  },

  // =========================================================================
  // MAMEMSM5232 - OKI MSM5232 8-Voice Organ
  // =========================================================================
  MAMEMSM5232: {
    synthType: 'MAMEMSM5232',
    name: 'MSM5232',
    subtitle: 'OKI MSM5232 8-Voice Organ',
    color: '#8b5cf6',
    presetCount: 8,
    presetNames: [
      'Full Organ', "Flute 8'", "Principal 16'", 'Piccolo',
      'Percussive', 'Strings', 'Noise Perc', "Bass 16'",
    ],
    parameters: [
      { key: 'volume', label: 'Volume', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
      { key: 'feet_mix', label: 'Feet Mix', group: 'Voicing', type: 'select', min: 0, max: 3, default: 0, formatValue: 'int', options: [
        { value: 0, label: 'All Feet' }, { value: 1, label: "8'+16'" },
        { value: 2, label: "8' Only" }, { value: 3, label: "16' Only" },
      ]},
      { key: 'attack_rate', label: 'Attack Rate', group: 'Envelope', type: 'knob', min: 0, max: 7, step: 1, default: 4, formatValue: 'int' },
      { key: 'decay_rate', label: 'Decay Rate', group: 'Envelope', type: 'knob', min: 0, max: 15, step: 1, default: 8, formatValue: 'int' },
      { key: 'noise_enable', label: 'Noise', group: 'Voicing', type: 'toggle', min: 0, max: 1, default: 0 },
      { key: 'stereo_width', label: 'Stereo Width', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.5, formatValue: 'percent' },
      { key: 'reverb', label: 'Reverb', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0, formatValue: 'percent' },
      { key: 'arm_mode', label: 'ARM Mode', group: 'Voicing', type: 'toggle', min: 0, max: 1, default: 0 },
    ],
  },

  // =========================================================================
  // MAMESNKWave - SNK Programmable Waveform
  // =========================================================================
  MAMESNKWave: {
    synthType: 'MAMESNKWave',
    name: 'SNK Wave',
    subtitle: 'SNK Programmable Waveform Generator',
    color: '#06b6d4',
    presetCount: 8,
    presetNames: [
      'Sine', 'Sawtooth', 'Square', 'Triangle',
      'Pulse 25%', 'Organ', 'Buzz', 'Soft Bell',
    ],
    parameters: [
      { key: 'volume', label: 'Volume', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
      { key: 'waveform', label: 'Waveform', group: 'Oscillator', type: 'select', min: 0, max: 7, default: 0, formatValue: 'int', options: [
        { value: 0, label: 'Sine' }, { value: 1, label: 'Saw' }, { value: 2, label: 'Square' },
        { value: 3, label: 'Triangle' }, { value: 4, label: 'Pulse 25%' }, { value: 5, label: 'Organ' },
        { value: 6, label: 'Buzz' }, { value: 7, label: 'Soft Bell' },
      ]},
      { key: 'stereo_width', label: 'Stereo Width', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.5, formatValue: 'percent' },
      { key: 'detune', label: 'Detune', group: 'Oscillator', type: 'knob', min: 0, max: 1, step: 0.01, default: 0, formatValue: 'percent' },
    ],
  },

  // =========================================================================
  // MAMESP0250 - GI SP0250 Speech
  // =========================================================================
  MAMESP0250: {
    synthType: 'MAMESP0250',
    name: 'SP0250',
    subtitle: 'GI SP0250 Digital LPC Speech Synthesizer',
    color: '#f97316',
    presetCount: 8,
    presetNames: ['AH', 'EE', 'IH', 'OH', 'OO', 'NN', 'ZZ', 'HH'],
    parameters: [
      { key: 'speechText', label: 'Speech Text', group: 'Speech', type: 'text', default: 0, defaultText: 'HELLO WORLD', placeholder: 'Type text and press Speak' },
      { key: 'volume', label: 'Volume', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
      { key: 'vowel', label: 'Vowel', group: 'Formants', type: 'select', min: 0, max: 7, default: 0, formatValue: 'int', options: [
        { value: 0, label: 'AH' }, { value: 1, label: 'EE' }, { value: 2, label: 'IH' },
        { value: 3, label: 'OH' }, { value: 4, label: 'OO' }, { value: 5, label: 'NN' },
        { value: 6, label: 'ZZ' }, { value: 7, label: 'HH' },
      ]},
      { key: 'voiced', label: 'Voiced', group: 'Excitation', type: 'toggle', min: 0, max: 1, default: 1 },
      { key: 'brightness', label: 'Brightness', group: 'Formants', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.5, formatValue: 'percent' },
      { key: 'stereo_width', label: 'Stereo Width', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.5, formatValue: 'percent' },
      { key: 'filter_mix', label: 'Filter Mix', group: 'Formants', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.5, formatValue: 'percent' },
    ],
  },

  // =========================================================================
  // MAMETMS36XX - TI TMS36XX Organ
  // =========================================================================
  MAMETMS36XX: {
    synthType: 'MAMETMS36XX',
    name: 'TMS36XX',
    subtitle: 'TI TMS36XX Tone Matrix Organ',
    color: '#84cc16',
    presetCount: 8,
    presetNames: [
      'Full Organ', "Flute 8'", 'Principal', 'Mixture',
      'Foundation', 'Bright', 'Diapason', 'Percussive',
    ],
    parameters: [
      { key: 'volume', label: 'Volume', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
      { key: 'stop_enable', label: 'Stop Enable', group: 'Voicing', type: 'knob', min: 0, max: 63, step: 1, default: 63, formatValue: 'int' },
      { key: 'decay_rate', label: 'Decay Rate', group: 'Envelope', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.5, formatValue: 'percent' },
      { key: 'octave', label: 'Octave', group: 'Oscillator', type: 'knob', min: -2, max: 2, step: 1, default: 0, formatValue: 'int', bipolar: true },
      { key: 'stereo_width', label: 'Stereo Width', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.5, formatValue: 'percent' },
      { key: 'detune', label: 'Detune', group: 'Oscillator', type: 'knob', min: 0, max: 1, step: 0.01, default: 0, formatValue: 'percent' },
    ],
  },

  // =========================================================================
  // MAMEVotrax - SC-01 Formant Speech (64 phonemes)
  // =========================================================================
  MAMEVotrax: {
    synthType: 'MAMEVotrax',
    name: 'Votrax SC-01',
    subtitle: 'Votrax SC-01 Formant Speech (64 Phonemes)',
    color: '#ec4899',
    presetCount: 8,
    presetNames: ['AH', 'EE', 'OH', 'OO', 'SH', 'ZH', 'NG', 'PA'],
    parameters: [
      { key: 'speechText', label: 'Speech Text', group: 'Speech', type: 'text', default: 0, defaultText: 'HELLO WORLD', placeholder: 'Type text and press Speak' },
      { key: 'volume', label: 'Volume', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
      { key: 'phoneme', label: 'Phoneme', group: 'Speech', type: 'knob', min: 0, max: 63, step: 1, default: 0, formatValue: 'int' },
      { key: 'inflection', label: 'Inflection', group: 'Speech', type: 'select', min: 0, max: 3, default: 0, formatValue: 'int', options: [
        { value: 0, label: 'Normal' }, { value: 1, label: 'Rising' },
        { value: 2, label: 'Falling' }, { value: 3, label: 'Emphasis' },
      ]},
      { key: 'f1_override', label: 'F1 Override', group: 'Formants', type: 'knob', min: -1, max: 15, step: 1, default: -1, formatValue: 'int' },
      { key: 'f2_override', label: 'F2 Override', group: 'Formants', type: 'knob', min: -1, max: 15, step: 1, default: -1, formatValue: 'int' },
      { key: 'f3_override', label: 'F3 Override', group: 'Formants', type: 'knob', min: -1, max: 15, step: 1, default: -1, formatValue: 'int' },
      { key: 'stereo_width', label: 'Stereo Width', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.5, formatValue: 'percent' },
    ],
  },

  // =========================================================================
  // MAMEYMOPQ - Yamaha YM3806 4-Op FM
  // =========================================================================
  MAMEYMOPQ: {
    synthType: 'MAMEYMOPQ',
    name: 'YM3806 OPQ',
    subtitle: 'Yamaha YM3806 4-Operator FM Synthesizer',
    color: '#3b82f6',
    presetCount: 8,
    presetNames: ['E.Piano', 'Brass', 'Strings', 'Bass', 'Organ', 'Lead', 'Pad', 'Bell'],
    operatorCount: 4,
    parameters: [
      { key: 'algorithm', label: 'Algorithm', group: 'FM', type: 'select', min: 0, max: 7, default: 0, formatValue: 'int', options: [
        { value: 0, label: 'Serial' }, { value: 1, label: '(1+2)->3->4' },
        { value: 2, label: '(1+(2->3))->4' }, { value: 3, label: '((1->2)+3)->4' },
        { value: 4, label: 'Dual Serial' }, { value: 5, label: 'Branching' },
        { value: 6, label: '(1->2)+3+4' }, { value: 7, label: 'All Carriers' },
      ]},
      { key: 'feedback', label: 'Feedback', group: 'FM', type: 'knob', min: 0, max: 7, step: 1, default: 0, formatValue: 'int' },
      { key: 'lfo_rate', label: 'LFO Rate', group: 'LFO', type: 'knob', min: 0, max: 7, step: 1, default: 0, formatValue: 'int' },
      { key: 'lfo_pm_sens', label: 'LFO PM Sens', group: 'LFO', type: 'knob', min: 0, max: 7, step: 1, default: 0, formatValue: 'int' },
      { key: 'lfo_am_sens', label: 'LFO AM Sens', group: 'LFO', type: 'knob', min: 0, max: 3, step: 1, default: 0, formatValue: 'int' },
      { key: 'reverb', label: 'Reverb', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0, formatValue: 'percent' },
      { key: 'volume', label: 'Volume', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
    ],
    operatorParams: [
      { key: 'total_level', label: 'Total Level', group: 'Operator', type: 'knob', min: 0, max: 127, step: 1, default: 0, formatValue: 'int' },
      { key: 'attack_rate', label: 'Attack Rate', group: 'Operator', type: 'knob', min: 0, max: 31, step: 1, default: 31, formatValue: 'int' },
      { key: 'decay_rate', label: 'Decay Rate', group: 'Operator', type: 'knob', min: 0, max: 31, step: 1, default: 0, formatValue: 'int' },
      { key: 'sustain_rate', label: 'Sustain Rate', group: 'Operator', type: 'knob', min: 0, max: 31, step: 1, default: 0, formatValue: 'int' },
      { key: 'sustain_level', label: 'Sustain Level', group: 'Operator', type: 'knob', min: 0, max: 15, step: 1, default: 0, formatValue: 'int' },
      { key: 'release_rate', label: 'Release Rate', group: 'Operator', type: 'knob', min: 0, max: 15, step: 1, default: 7, formatValue: 'int' },
      { key: 'multiple', label: 'Multiple', group: 'Operator', type: 'knob', min: 0, max: 15, step: 1, default: 1, formatValue: 'int' },
      { key: 'detune', label: 'Detune', group: 'Operator', type: 'knob', min: 0, max: 7, step: 1, default: 0, formatValue: 'int' },
      { key: 'waveform', label: 'Waveform', group: 'Operator', type: 'select', min: 0, max: 1, default: 0, formatValue: 'int', options: [
        { value: 0, label: 'Sine' }, { value: 1, label: 'Half Sine' },
      ]},
      { key: 'ksr', label: 'Key Scale Rate', group: 'Operator', type: 'knob', min: 0, max: 3, step: 1, default: 0, formatValue: 'int' },
      { key: 'am_enable', label: 'AM Enable', group: 'Operator', type: 'toggle', min: 0, max: 1, default: 0 },
    ],
  },

  // =========================================================================
  // MAMETIA - Atari 2600 TIA
  // =========================================================================
  MAMETIA: {
    synthType: 'MAMETIA',
    name: 'TIA',
    subtitle: 'Atari 2600 Television Interface Adaptor',
    color: '#f59e0b',
    presetCount: 8,
    presetNames: [
      'Constant', 'Poly4 Buzz', 'Div31 Rumble', 'Poly5+4 Noise',
      'Pure Square', 'Pure Alt', 'Div31 Bass', 'Engine Rumble',
    ],
    parameters: [
      { key: 'volume', label: 'Volume', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
      { key: 'audc_mode', label: 'AUDC Mode', group: 'Oscillator', type: 'knob', min: 0, max: 15, step: 1, default: 4, formatValue: 'int' },
      { key: 'audf_fine', label: 'Freq Fine', group: 'Oscillator', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.5, formatValue: 'percent' },
      { key: 'stereo_width', label: 'Stereo Width', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.5, formatValue: 'percent' },
      { key: 'detune', label: 'Detune', group: 'Oscillator', type: 'knob', min: 0, max: 1, step: 0.01, default: 0, formatValue: 'percent' },
      { key: 'poly_reset', label: 'Poly Reset', group: 'Oscillator', type: 'toggle', min: 0, max: 1, default: 0 },
    ],
  },

  // =========================================================================
  // MAMEUPD931 - NEC uPD931 Casio Keyboard Voice
  // =========================================================================
  MAMEUPD931: {
    synthType: 'MAMEUPD931',
    name: 'uPD931',
    subtitle: 'NEC uPD931 Casio Keyboard Voice (1981)',
    color: '#14b8a6',
    presetCount: 8,
    presetNames: ['Organ', 'Piano', 'Strings', 'Brass', 'Reed', 'Bell', 'Bass', 'Synth Lead'],
    parameters: [
      { key: 'volume', label: 'Volume', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
      { key: 'wave_a', label: 'Wave A', group: 'Oscillator', type: 'select', min: 0, max: 7, default: 0, formatValue: 'int', options: [
        { value: 0, label: 'Sine' }, { value: 1, label: 'Saw' }, { value: 2, label: 'Square' },
        { value: 3, label: 'Triangle' }, { value: 4, label: 'Pulse 25%' }, { value: 5, label: 'Pulse 12%' },
        { value: 6, label: 'Organ' }, { value: 7, label: 'Noise' },
      ]},
      { key: 'wave_b', label: 'Wave B', group: 'Oscillator', type: 'select', min: 0, max: 7, default: 1, formatValue: 'int', options: [
        { value: 0, label: 'Sine' }, { value: 1, label: 'Saw' }, { value: 2, label: 'Square' },
        { value: 3, label: 'Triangle' }, { value: 4, label: 'Pulse 25%' }, { value: 5, label: 'Pulse 12%' },
        { value: 6, label: 'Organ' }, { value: 7, label: 'Noise' },
      ]},
      { key: 'mirror', label: 'Mirror', group: 'Oscillator', type: 'toggle', min: 0, max: 1, default: 0 },
      { key: 'invert', label: 'Invert', group: 'Oscillator', type: 'toggle', min: 0, max: 1, default: 0 },
      { key: 'mode_a', label: 'Mode A', group: 'Oscillator', type: 'select', min: 0, max: 3, default: 0, formatValue: 'int', options: [
        { value: 0, label: 'Always' }, { value: 1, label: 'Alternating' },
        { value: 2, label: 'Attack Only' }, { value: 3, label: 'Sustain Only' },
      ]},
      { key: 'mode_b', label: 'Mode B', group: 'Oscillator', type: 'select', min: 0, max: 3, default: 0, formatValue: 'int', options: [
        { value: 0, label: 'Always' }, { value: 1, label: 'Alternating' },
        { value: 2, label: 'Attack Only' }, { value: 3, label: 'Sustain Only' },
      ]},
      { key: 'key_scaling', label: 'Key Scaling', group: 'Oscillator', type: 'knob', min: 0, max: 1, step: 0.01, default: 0, formatValue: 'percent' },
    ],
  },

  // =========================================================================
  // MAMEUPD933 - NEC uPD933 CZ Phase Distortion
  // =========================================================================
  MAMEUPD933: {
    synthType: 'MAMEUPD933',
    name: 'uPD933',
    subtitle: 'NEC uPD933 CZ Phase Distortion Synthesis',
    color: '#6366f1',
    presetCount: 8,
    presetNames: ['Brass', 'Strings', 'E.Piano', 'Bass', 'Organ', 'Pad', 'Lead', 'Bell'],
    parameters: [
      { key: 'volume', label: 'Volume', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
      { key: 'waveform1', label: 'Waveform 1', group: 'Oscillator', type: 'select', min: 0, max: 7, default: 0, formatValue: 'int', options: [
        { value: 0, label: 'Sawtooth' }, { value: 1, label: 'Square' }, { value: 2, label: 'Pulse' },
        { value: 3, label: 'Silent' }, { value: 4, label: 'Double Sine' }, { value: 5, label: 'Saw+Pulse' },
        { value: 6, label: 'Resonance' }, { value: 7, label: 'Double Pulse' },
      ]},
      { key: 'waveform2', label: 'Waveform 2', group: 'Oscillator', type: 'select', min: 0, max: 7, default: 0, formatValue: 'int', options: [
        { value: 0, label: 'Sawtooth' }, { value: 1, label: 'Square' }, { value: 2, label: 'Pulse' },
        { value: 3, label: 'Silent' }, { value: 4, label: 'Double Sine' }, { value: 5, label: 'Saw+Pulse' },
        { value: 6, label: 'Resonance' }, { value: 7, label: 'Double Pulse' },
      ]},
      { key: 'window', label: 'Window', group: 'Oscillator', type: 'select', min: 0, max: 3, default: 0, formatValue: 'int', options: [
        { value: 0, label: 'None' }, { value: 1, label: 'Half' },
        { value: 2, label: 'Rise' }, { value: 3, label: 'Fall' },
      ]},
      { key: 'dcw_depth', label: 'DCW Depth', group: 'Envelope', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.5, formatValue: 'percent' },
      { key: 'dca_rate', label: 'DCA Rate', group: 'Envelope', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.5, formatValue: 'percent' },
      { key: 'dcw_rate', label: 'DCW Rate', group: 'Envelope', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.5, formatValue: 'percent' },
      { key: 'dco_rate', label: 'DCO Rate', group: 'Envelope', type: 'knob', min: 0, max: 1, step: 0.01, default: 0, formatValue: 'percent' },
      { key: 'dco_depth', label: 'DCO Depth', group: 'Envelope', type: 'knob', min: 0, max: 1, step: 0.01, default: 0, formatValue: 'percent' },
      { key: 'ring_mod', label: 'Ring Mod', group: 'Oscillator', type: 'toggle', min: 0, max: 1, default: 0 },
      { key: 'stereo_width', label: 'Stereo Width', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.5, formatValue: 'percent' },
    ],
  },

  // =========================================================================
  // MAMETMS5220 - TI TMS5220 Speak & Spell
  // =========================================================================
  MAMETMS5220: {
    synthType: 'MAMETMS5220',
    name: 'TMS5220',
    subtitle: 'TI TMS5220 LPC Speech (Speak & Spell)',
    color: '#d946ef',
    presetCount: 8,
    presetNames: ['AH', 'EE', 'IH', 'OH', 'OO', 'AE', 'UH', 'SH'],
    romConfig: {
      requiredZip: '.vsm files (TI Speak & Spell speech ROM)',
      bankCount: 2,
      romType: 'tms5220',
    },
    parameters: [
      { key: 'speechText', label: 'Speech Text', group: 'Speech', type: 'text', default: 0, defaultText: 'HELLO WORLD', placeholder: 'Type text and press Speak' },
      { key: 'volume', label: 'Volume', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
      { key: 'chirp_type', label: 'Chirp Type', group: 'Excitation', type: 'select', min: 0, max: 2, default: 0, formatValue: 'int', options: [
        { value: 0, label: 'TMS5220' }, { value: 1, label: 'TMS5200' }, { value: 2, label: 'TI99' },
      ]},
      { key: 'k1_index', label: 'K1 Index', group: 'Formants', type: 'knob', min: 0, max: 31, step: 1, default: 15, formatValue: 'int' },
      { key: 'k2_index', label: 'K2 Index', group: 'Formants', type: 'knob', min: 0, max: 31, step: 1, default: 15, formatValue: 'int' },
      { key: 'k3_index', label: 'K3 Index', group: 'Formants', type: 'knob', min: 0, max: 31, step: 1, default: 15, formatValue: 'int' },
      { key: 'energy_index', label: 'Energy', group: 'Excitation', type: 'knob', min: 0, max: 15, step: 1, default: 10, formatValue: 'int' },
      { key: 'pitch_index', label: 'Pitch', group: 'Excitation', type: 'knob', min: 0, max: 63, step: 1, default: 32, formatValue: 'int' },
      { key: 'noise_mode', label: 'Noise Mode', group: 'Excitation', type: 'toggle', min: 0, max: 1, default: 0 },
      { key: 'stereo_width', label: 'Stereo Width', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.5, formatValue: 'percent' },
      { key: 'brightness', label: 'Brightness', group: 'Formants', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.5, formatValue: 'percent' },
    ],
  },

  // =========================================================================
  // MAMEYMF271 - Yamaha OPX 4-Op FM+PCM
  // =========================================================================
  MAMEYMF271: {
    synthType: 'MAMEYMF271',
    name: 'YMF271 OPX',
    subtitle: 'Yamaha OPX 4-Operator FM+PCM Synthesizer',
    color: '#2563eb',
    presetCount: 8,
    presetNames: ['E.Piano', 'Brass', 'Strings', 'Bass', 'Organ', 'Lead', 'Pad', 'Bell'],
    parameters: [
      { key: 'volume', label: 'Volume', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
      { key: 'algorithm', label: 'Algorithm', group: 'FM', type: 'knob', min: 0, max: 15, step: 1, default: 0, formatValue: 'int' },
      { key: 'feedback', label: 'Feedback', group: 'FM', type: 'knob', min: 0, max: 7, step: 1, default: 0, formatValue: 'int' },
      { key: 'waveform', label: 'Waveform', group: 'FM', type: 'knob', min: 0, max: 7, step: 1, default: 0, formatValue: 'int' },
      { key: 'tl', label: 'Total Level', group: 'Operator', type: 'knob', min: 0, max: 127, step: 1, default: 0, formatValue: 'int' },
      { key: 'ar', label: 'Attack Rate', group: 'Envelope', type: 'knob', min: 0, max: 31, step: 1, default: 31, formatValue: 'int' },
      { key: 'd1r', label: 'Decay 1 Rate', group: 'Envelope', type: 'knob', min: 0, max: 31, step: 1, default: 0, formatValue: 'int' },
      { key: 'd2r', label: 'Decay 2 Rate', group: 'Envelope', type: 'knob', min: 0, max: 31, step: 1, default: 0, formatValue: 'int' },
      { key: 'rr', label: 'Release Rate', group: 'Envelope', type: 'knob', min: 0, max: 15, step: 1, default: 7, formatValue: 'int' },
      { key: 'd1l', label: 'Decay 1 Level', group: 'Envelope', type: 'knob', min: 0, max: 15, step: 1, default: 0, formatValue: 'int' },
      { key: 'multiple', label: 'Multiple', group: 'FM', type: 'knob', min: 0, max: 15, step: 1, default: 1, formatValue: 'int' },
      { key: 'detune', label: 'Detune', group: 'FM', type: 'knob', min: 0, max: 7, step: 1, default: 0, formatValue: 'int' },
      { key: 'lfo_freq', label: 'LFO Freq', group: 'LFO', type: 'knob', min: 0, max: 7, step: 1, default: 0, formatValue: 'int' },
      { key: 'lfo_wave', label: 'LFO Wave', group: 'LFO', type: 'knob', min: 0, max: 3, step: 1, default: 0, formatValue: 'int' },
      { key: 'pms', label: 'Pitch Mod Sens', group: 'LFO', type: 'knob', min: 0, max: 7, step: 1, default: 0, formatValue: 'int' },
      { key: 'ams', label: 'Amp Mod Sens', group: 'LFO', type: 'knob', min: 0, max: 3, step: 1, default: 0, formatValue: 'int' },
    ],
  },

  // =========================================================================
  // MAMETR707 - Roland TR-707 Drum Machine
  // =========================================================================
  MAMETR707: {
    synthType: 'MAMETR707',
    name: 'TR-707',
    subtitle: 'Roland TR-707 Drum Machine (1984)',
    color: '#dc2626',
    presetCount: 0,
    romConfig: {
      requiredZip: 'tr707.zip (Roland TR-707 voice ROMs)',
      bankCount: 3,
      romType: 'tr707',
    },
    parameters: [
      { key: 'volume', label: 'Volume', group: 'Master', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
      { key: 'bass', label: 'Bass', group: 'Levels', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
      { key: 'snare', label: 'Snare', group: 'Levels', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
      { key: 'low_tom', label: 'Low Tom', group: 'Levels', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
      { key: 'mid_tom', label: 'Mid Tom', group: 'Levels', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
      { key: 'hi_tom', label: 'Hi Tom', group: 'Levels', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
      { key: 'rimshot', label: 'Rimshot', group: 'Levels', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
      { key: 'handclap', label: 'Handclap', group: 'Levels', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
      { key: 'hihat', label: 'Hi-Hat', group: 'Levels', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
      { key: 'crash', label: 'Crash', group: 'Levels', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
      { key: 'ride', label: 'Ride', group: 'Levels', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
      { key: 'accent', label: 'Accent', group: 'Master', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.5, formatValue: 'percent' },
      { key: 'decay', label: 'Decay', group: 'Master', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.5, formatValue: 'percent' },
    ],
  },

  // =========================================================================
  // MAMEVASynth - Virtual Analog Modeling
  // =========================================================================
  MAMEVASynth: {
    synthType: 'MAMEVASynth',
    name: 'VA Synth',
    subtitle: 'Virtual Analog Subtractive Synthesizer',
    color: '#7c3aed',
    presetCount: 8,
    presetNames: ['Bass', 'Lead', 'Pad', 'Brass', 'Strings', 'Pluck', 'Keys', 'FX'],
    parameters: [
      { key: 'volume', label: 'Volume', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
      { key: 'osc1_wave', label: 'Osc 1 Wave', group: 'Oscillator', type: 'select', min: 0, max: 3, default: 0, formatValue: 'int', options: [
        { value: 0, label: 'Saw' }, { value: 1, label: 'Square' },
        { value: 2, label: 'Triangle' }, { value: 3, label: 'Noise' },
      ]},
      { key: 'osc2_wave', label: 'Osc 2 Wave', group: 'Oscillator', type: 'select', min: 0, max: 3, default: 0, formatValue: 'int', options: [
        { value: 0, label: 'Saw' }, { value: 1, label: 'Square' },
        { value: 2, label: 'Triangle' }, { value: 3, label: 'Noise' },
      ]},
      { key: 'osc_mix', label: 'Osc Mix', group: 'Oscillator', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.5, formatValue: 'percent' },
      { key: 'osc2_detune', label: 'Osc 2 Detune', group: 'Oscillator', type: 'knob', min: 0, max: 1, step: 0.01, default: 0, formatValue: 'percent' },
      { key: 'filter_cutoff', label: 'Filter Cutoff', group: 'Filter', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
      { key: 'filter_res', label: 'Filter Res', group: 'Filter', type: 'knob', min: 0, max: 1, step: 0.01, default: 0, formatValue: 'percent' },
      { key: 'filter_env_depth', label: 'Filter Env', group: 'Filter', type: 'knob', min: 0, max: 1, step: 0.01, default: 0, formatValue: 'percent' },
    ],
  },

  // =========================================================================
  // CEM3394 - Curtis Electromusic Analog Voice
  // =========================================================================
  CEM3394: {
    synthType: 'CEM3394',
    name: 'CEM3394',
    subtitle: 'Curtis Electromusic Analog Synth Voice (1984)',
    color: '#f43f5e',
    presetCount: 0,
    parameters: [
      { key: 'volume', label: 'Volume', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
      { key: 'vco_frequency', label: 'VCO Freq', group: 'VCO', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.5, formatValue: 'percent' },
      { key: 'modulation', label: 'Modulation', group: 'VCO', type: 'knob', min: 0, max: 1, step: 0.01, default: 0, formatValue: 'percent' },
      { key: 'wave_select', label: 'Wave Select', group: 'VCO', type: 'knob', min: 0, max: 7, step: 1, default: 2, formatValue: 'int' },
      { key: 'pulse_width', label: 'Pulse Width', group: 'VCO', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.5, formatValue: 'percent' },
      { key: 'mixer_balance', label: 'Mixer Balance', group: 'Mixer', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.5, formatValue: 'percent' },
      { key: 'resonance', label: 'Resonance', group: 'Filter', type: 'knob', min: 0, max: 1, step: 0.01, default: 0, formatValue: 'percent' },
      { key: 'cutoff', label: 'Cutoff', group: 'Filter', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
    ],
  },

  // =========================================================================
  // SCSP - Sega Saturn Sound Processor
  // =========================================================================
  SCSP: {
    synthType: 'SCSP',
    name: 'SCSP',
    subtitle: 'Sega Saturn YMF292-F Sound Processor',
    color: '#475569',
    presetCount: 0,
    parameters: [
      { key: 'volume', label: 'Volume', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
    ],
  },

  // =========================================================================
  // PCM / ROM-based chips (minimal controls)
  // =========================================================================

  // MAMEAICA - Sega Dreamcast AICA
  MAMEAICA: {
    synthType: 'MAMEAICA',
    name: 'AICA',
    subtitle: 'Sega Dreamcast Sound Processor',
    color: '#0ea5e9',
    presetCount: 0,
    parameters: [
      { key: 'volume', label: 'Volume', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
    ],
  },

  // MAMEICS2115 - ICS WaveFront
  MAMEICS2115: {
    synthType: 'MAMEICS2115',
    name: 'ICS2115',
    subtitle: 'ICS WaveFront 32-Voice Synthesizer',
    color: '#64748b',
    presetCount: 0,
    romConfig: {
      requiredZip: 'ics2115.zip (ICS WaveFront wavetable ROM)',
      bankCount: 1,
      romType: 'ics2115',
    },
    parameters: [
      { key: 'volume', label: 'Volume', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
      { key: 'active_osc', label: 'Active Voices', group: 'Oscillator', type: 'knob', min: 1, max: 32, step: 1, default: 8, formatValue: 'int' },
    ],
  },

  // MAMEK054539 - Konami K054539
  MAMEK054539: {
    synthType: 'MAMEK054539',
    name: 'K054539',
    subtitle: 'Konami K054539 PCM/ADPCM (8-Channel)',
    color: '#78716c',
    presetCount: 0,
    romConfig: {
      requiredZip: 'k054539.zip (Konami PCM sample ROM)',
      bankCount: 1,
      romType: 'k054539',
    },
    parameters: [
      { key: 'volume', label: 'Volume', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
      { key: 'reverb_enable', label: 'Reverb', group: 'Effects', type: 'toggle', min: 0, max: 1, default: 0 },
    ],
  },

  // MAMEC352 - Namco C352
  MAMEC352: {
    synthType: 'MAMEC352',
    name: 'C352',
    subtitle: 'Namco C352 32-Voice PCM',
    color: '#94a3b8',
    presetCount: 0,
    romConfig: {
      requiredZip: 'c352.zip (Namco C352 sample ROM)',
      bankCount: 1,
      romType: 'c352',
    },
    parameters: [
      { key: 'volume', label: 'Volume', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
    ],
  },

  // MAMERF5C400 - Ricoh RF5C400
  MAMERF5C400: {
    synthType: 'MAMERF5C400',
    name: 'RF5C400',
    subtitle: 'Ricoh RF5C400 32-Voice PCM',
    color: '#6b7280',
    presetCount: 0,
    romConfig: {
      requiredZip: 'rf5c400.zip (Ricoh RF5C400 sample ROM)',
      bankCount: 1,
      romType: 'rf5c400',
    },
    parameters: [
      { key: 'volume', label: 'Volume', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
    ],
  },

  // =========================================================================
  // CZ-101 - Casio Phase Distortion Synthesizer
  // =========================================================================
  CZ101: {
    synthType: 'CZ101',
    name: 'CZ-101',
    subtitle: 'Casio Phase Distortion Synthesizer (1984)',
    color: '#8b5cf6',
    presetCount: 4,
    presetNames: ['Brass 1', 'E.Piano', 'Synth Bass', 'Pad'],
    parameters: [
      { key: 'volume', label: 'Volume', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
    ],
  },

  // =========================================================================
  // ROM-dependent synths (minimal controls + ROM upload)
  // MAMEVFX and MAMEDOC are NOT here - they route to MAMEControls with
  // voice matrices and register views.
  // =========================================================================

  MAMERSA: {
    synthType: 'MAMERSA',
    name: 'Roland D-50',
    subtitle: 'Roland SA Linear Arithmetic (requires ROM)',
    color: '#6b7280',
    presetCount: 0,
    parameters: [
      { key: 'volume', label: 'Volume', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
    ],
    romConfig: {
      requiredZip: 'mks20.zip (Roland D-50 / MKS-20 ROMs: IC5, IC6, IC7)',
      bankCount: 3,
      romType: 'rsa',
    },
  },

  MAMESWP30: {
    synthType: 'MAMESWP30',
    name: 'Yamaha MU-2000',
    subtitle: 'SWP30 Wavetable (requires ROM)',
    color: '#6b7280',
    presetCount: 0,
    parameters: [
      { key: 'volume', label: 'Volume', group: 'Output', type: 'knob', min: 0, max: 1, step: 0.01, default: 0.8, formatValue: 'percent' },
    ],
    romConfig: {
      requiredZip: 'mu100.zip (Yamaha MU-100/MU-2000 wave ROM)',
      bankCount: 1,
      romType: 'swp30',
    },
  },
};

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Check if a SynthType string corresponds to a MAME chip synth
 * (or other chip synth like CEM3394, SCSP) with parameter metadata.
 */
export function isMAMEChipType(synthType: string): boolean {
  return synthType in CHIP_SYNTH_DEFS;
}

/**
 * Get the full chip synth definition for a given SynthType.
 * Returns undefined if the type is not a known chip synth.
 */
export function getChipSynthDef(synthType: string): ChipSynthDef | undefined {
  return CHIP_SYNTH_DEFS[synthType];
}
