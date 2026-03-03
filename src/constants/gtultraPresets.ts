/**
 * GTUltra SID Instrument Presets — Classic SID sounds for quick instrument creation.
 *
 * Each preset defines ADSR, waveform, and table pointer suggestions.
 * These are curated from classic C64 game soundtracks and well-known
 * SID composition techniques.
 *
 * ADSR values are raw SID register values (4-bit each):
 * - Attack:  0-15 (2ms to 8s)
 * - Decay:   0-15 (6ms to 24s)
 * - Sustain: 0-15 (volume level 0-15)
 * - Release: 0-15 (6ms to 24s)
 */

export interface GTSIDPreset {
  name: string;
  category: 'bass' | 'lead' | 'pad' | 'arp' | 'drum' | 'fx' | 'classic';
  description: string;
  ad: number;     // Attack/Decay byte (high nibble = A, low nibble = D)
  sr: number;     // Sustain/Release byte (high nibble = S, low nibble = R)
  waveform: number; // SID waveform bits (0x10=tri, 0x20=saw, 0x40=pulse, 0x80=noise)
  pulseWidth?: number; // 0-4095 (only for pulse wave)
  vibdelay?: number;
  gatetimer?: number;
  // Suggested table programs (indices into wave/pulse/filter tables)
  suggestedWaveTable?: number[];
  suggestedPulseTable?: number[];
  suggestedFilterTable?: number[];
}

export const SID_PRESETS: GTSIDPreset[] = [
  // ── Bass ──
  {
    name: 'Classic Bass',
    category: 'bass',
    description: 'Punchy sawtooth bass, staple of C64 game music',
    ad: 0x09, sr: 0x00,
    waveform: 0x21, // saw + gate
  },
  {
    name: 'Sub Bass',
    category: 'bass',
    description: 'Deep triangle bass for low-end rumble',
    ad: 0x0A, sr: 0x00,
    waveform: 0x11, // tri + gate
  },
  {
    name: 'Acid Bass',
    category: 'bass',
    description: 'Pulse wave with filter sweep — acid house feel',
    ad: 0x08, sr: 0x00,
    waveform: 0x41, // pulse + gate
    pulseWidth: 2048,
  },
  {
    name: 'Hubbard Bass',
    category: 'bass',
    description: 'Rob Hubbard style — saw attack into pulse sustain',
    ad: 0x09, sr: 0xA0,
    waveform: 0x21, // saw → pulse (via wavetable)
  },
  {
    name: 'Galway Bass',
    category: 'bass',
    description: 'Martin Galway style — short punchy bass',
    ad: 0x07, sr: 0x00,
    waveform: 0x21,
  },

  // ── Lead ──
  {
    name: 'Classic Lead',
    category: 'lead',
    description: 'Bright sawtooth lead for melodies',
    ad: 0x0A, sr: 0x9A,
    waveform: 0x21,
  },
  {
    name: 'Pulse Lead',
    category: 'lead',
    description: 'Warm pulse wave lead with medium sustain',
    ad: 0x09, sr: 0xA9,
    waveform: 0x41,
    pulseWidth: 1024,
  },
  {
    name: 'PWM Lead',
    category: 'lead',
    description: 'Pulse width modulation lead — rich and animated',
    ad: 0x09, sr: 0xA9,
    waveform: 0x41,
    pulseWidth: 2048,
  },
  {
    name: 'Triangle Lead',
    category: 'lead',
    description: 'Pure triangle wave — flute-like tone',
    ad: 0x2A, sr: 0xAA,
    waveform: 0x11,
  },
  {
    name: 'Sync Lead',
    category: 'lead',
    description: 'Hard sync sawtooth — metallic bite',
    ad: 0x09, sr: 0xA9,
    waveform: 0x23, // saw + sync + gate
  },
  {
    name: 'Ring Mod Lead',
    category: 'lead',
    description: 'Ring modulated triangle — bell-like overtones',
    ad: 0x2A, sr: 0x8A,
    waveform: 0x15, // tri + ring + gate
  },

  // ── Pad / Atmosphere ──
  {
    name: 'Soft Pad',
    category: 'pad',
    description: 'Slow attack triangle pad for ambience',
    ad: 0x8C, sr: 0x8C,
    waveform: 0x11,
  },
  {
    name: 'Pulse Pad',
    category: 'pad',
    description: 'Wide pulse pad with slow release',
    ad: 0x6B, sr: 0x9B,
    waveform: 0x41,
    pulseWidth: 3072,
  },
  {
    name: 'Saw Pad',
    category: 'pad',
    description: 'Sawtooth pad — full and bright',
    ad: 0x6B, sr: 0x8B,
    waveform: 0x21,
  },

  // ── Arpeggio ──
  {
    name: 'Fast Arp',
    category: 'arp',
    description: 'Quick arpeggio pulse for chip-tune feel',
    ad: 0x08, sr: 0x80,
    waveform: 0x41,
    pulseWidth: 2048,
    gatetimer: 2,
  },
  {
    name: 'Saw Arp',
    category: 'arp',
    description: 'Sawtooth arpeggio — classic chiptune chord',
    ad: 0x09, sr: 0x00,
    waveform: 0x21,
    gatetimer: 2,
  },

  // ── Drums / Percussion ──
  {
    name: 'Snare',
    category: 'drum',
    description: 'Noise-based snare drum',
    ad: 0x00, sr: 0x00,
    waveform: 0x81, // noise + gate
  },
  {
    name: 'Kick',
    category: 'drum',
    description: 'Triangle kick with pitch sweep (via wavetable)',
    ad: 0x09, sr: 0x00,
    waveform: 0x11,
  },
  {
    name: 'Hi-Hat',
    category: 'drum',
    description: 'Short noise burst for hi-hat',
    ad: 0x00, sr: 0x00,
    waveform: 0x81,
    gatetimer: 1,
  },
  {
    name: 'Tom',
    category: 'drum',
    description: 'Triangle tom with medium decay',
    ad: 0x07, sr: 0x00,
    waveform: 0x11,
  },

  // ── FX ──
  {
    name: 'Laser',
    category: 'fx',
    description: 'Descending pitch sweep — pew pew!',
    ad: 0x00, sr: 0x00,
    waveform: 0x41,
    pulseWidth: 2048,
  },
  {
    name: 'Explosion',
    category: 'fx',
    description: 'Long noise decay for explosions',
    ad: 0x0D, sr: 0x00,
    waveform: 0x81,
  },
  {
    name: 'Alarm',
    category: 'fx',
    description: 'Alternating frequency alarm tone',
    ad: 0x09, sr: 0xF0,
    waveform: 0x41,
    pulseWidth: 1024,
  },

  // ── Classic C64 Sounds ──
  {
    name: 'Commando',
    category: 'classic',
    description: 'Rob Hubbard Commando-style lead',
    ad: 0x09, sr: 0x00,
    waveform: 0x41,
    pulseWidth: 1536,
  },
  {
    name: 'Monty Bass',
    category: 'classic',
    description: 'Monty on the Run bass line style',
    ad: 0x09, sr: 0x00,
    waveform: 0x21,
  },
  {
    name: 'Last Ninja',
    category: 'classic',
    description: 'Ben Daglish Last Ninja style melody',
    ad: 0x0A, sr: 0x9A,
    waveform: 0x41,
    pulseWidth: 2048,
  },
  {
    name: 'Forbidden Forest',
    category: 'classic',
    description: 'Paul Norman atmospheric pad',
    ad: 0x6B, sr: 0x8B,
    waveform: 0x11,
  },
  {
    name: 'Ocean Loader',
    category: 'classic',
    description: 'Martin Galway Ocean loader style',
    ad: 0x09, sr: 0xA0,
    waveform: 0x41,
    pulseWidth: 2560,
  },
];

/**
 * Get presets by category
 */
export function getPresetsByCategory(category: GTSIDPreset['category']): GTSIDPreset[] {
  return SID_PRESETS.filter(p => p.category === category);
}

/**
 * Get all unique categories
 */
export function getPresetCategories(): GTSIDPreset['category'][] {
  return [...new Set(SID_PRESETS.map(p => p.category))];
}

/**
 * Apply a preset to the current instrument via engine
 */
export function applyPresetToInstrument(
  preset: GTSIDPreset,
  _instrumentIndex: number,
  _engine: { setPatternCell: (p: number, r: number, c: number, v: number) => void } | null
): { ad: number; sr: number; firstwave: number; name: string } {
  return {
    ad: preset.ad,
    sr: preset.sr,
    firstwave: preset.waveform,
    name: preset.name,
  };
}
