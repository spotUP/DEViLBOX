/**
 * TB303 Devil Fish + Neural Model Presets
 *
 * Curated presets showcasing Devil Fish mod capabilities and neural models
 */

export interface TB303Preset {
  name: string;
  description: string;
  category: 'classic' | 'devilfish' | 'neural' | 'hybrid';

  // Basic TB303 parameters
  cutoff: number;
  resonance: number;
  envMod: number;
  decay: number;
  accent: number;
  overdrive: number;

  // Devil Fish parameters
  devilFish: {
    enabled: boolean;
    normalDecay?: number;
    accentDecay?: number;
    vegDecay?: number;
    vegSustain?: number;
    softAttack?: number;
    filterTracking?: number;
    filterFM?: number;
    sweepSpeed?: 'fast' | 'normal' | 'slow';
    muffler?: 'off' | 'soft' | 'hard';
    highResonance?: boolean;
    accentSweepEnabled?: boolean;
  };

  // Neural overdrive
  neural: {
    enabled: boolean;
    modelIndex?: number;
    drive?: number;
    dryWet?: number;
  };
}

export const DEVIL_FISH_PRESETS: TB303Preset[] = [
  // ============================================================================
  // CLASSIC 303 SOUNDS (Devil Fish disabled)
  // ============================================================================
  {
    name: 'Classic Acid',
    description: 'Traditional TB-303 acid sound with moderate resonance',
    category: 'classic',
    cutoff: 800,
    resonance: 65,
    envMod: 60,
    decay: 200,
    accent: 70,
    overdrive: 0,
    devilFish: { enabled: false },
    neural: { enabled: false },
  },
  {
    name: 'Squelchy Bass',
    description: 'High resonance, low cutoff for that classic squelch',
    category: 'classic',
    cutoff: 350,
    resonance: 85,
    envMod: 75,
    decay: 300,
    accent: 80,
    overdrive: 15,
    devilFish: { enabled: false },
    neural: { enabled: false },
  },
  {
    name: 'Warm Sub',
    description: 'Low cutoff, low resonance for deep sub bass',
    category: 'classic',
    cutoff: 250,
    resonance: 20,
    envMod: 30,
    decay: 150,
    accent: 50,
    overdrive: 0,
    devilFish: { enabled: false },
    neural: { enabled: false },
  },

  // ============================================================================
  // DEVIL FISH SOUNDS (Devil Fish enabled, neural disabled)
  // ============================================================================
  {
    name: 'Infinite Drone',
    description: 'VEG sustain at 100% for infinite notes',
    category: 'devilfish',
    cutoff: 600,
    resonance: 45,
    envMod: 50,
    decay: 200,
    accent: 60,
    overdrive: 0,
    devilFish: {
      enabled: true,
      normalDecay: 500,
      accentDecay: 300,
      vegDecay: 1000,
      vegSustain: 100, // Infinite notes!
      softAttack: 10,
      filterTracking: 0,
      filterFM: 0,
      sweepSpeed: 'normal',
      muffler: 'off',
      highResonance: false,
      accentSweepEnabled: false,
    },
    neural: { enabled: false },
  },
  {
    name: 'Screaming Lead',
    description: 'High resonance mode for self-oscillating screams',
    category: 'devilfish',
    cutoff: 1200,
    resonance: 95,
    envMod: 80,
    decay: 400,
    accent: 85,
    overdrive: 20,
    devilFish: {
      enabled: true,
      normalDecay: 600,
      accentDecay: 200,
      vegDecay: 800,
      vegSustain: 30,
      softAttack: 3,
      filterTracking: 50,
      filterFM: 15,
      sweepSpeed: 'fast',
      muffler: 'soft',
      highResonance: true, // Self-oscillation!
      accentSweepEnabled: true,
    },
    neural: { enabled: false },
  },
  {
    name: 'Punchy Pluck',
    description: 'Muffler adds buzz, fast accent sweep for punch',
    category: 'devilfish',
    cutoff: 900,
    resonance: 70,
    envMod: 65,
    decay: 150,
    accent: 75,
    overdrive: 10,
    devilFish: {
      enabled: true,
      normalDecay: 120,
      accentDecay: 80,
      vegDecay: 200,
      vegSustain: 0,
      softAttack: 3,
      filterTracking: 0,
      filterFM: 0,
      sweepSpeed: 'fast',
      muffler: 'hard', // Adds buzz!
      highResonance: false,
      accentSweepEnabled: true,
    },
    neural: { enabled: false },
  },
  {
    name: 'Tracking Melody',
    description: 'Filter follows note pitch for melodic playing',
    category: 'devilfish',
    cutoff: 500,
    resonance: 55,
    envMod: 40,
    decay: 250,
    accent: 60,
    overdrive: 0,
    devilFish: {
      enabled: true,
      normalDecay: 300,
      accentDecay: 250,
      vegDecay: 500,
      vegSustain: 20,
      softAttack: 5,
      filterTracking: 100, // 1:1 tracking!
      filterFM: 0,
      sweepSpeed: 'normal',
      muffler: 'off',
      highResonance: false,
      accentSweepEnabled: false,
    },
    neural: { enabled: false },
  },
  {
    name: 'FM Madness',
    description: 'Audio-rate filter modulation for crazy FM sounds',
    category: 'devilfish',
    cutoff: 1000,
    resonance: 75,
    envMod: 70,
    decay: 350,
    accent: 80,
    overdrive: 15,
    devilFish: {
      enabled: true,
      normalDecay: 400,
      accentDecay: 300,
      vegDecay: 600,
      vegSustain: 0,
      softAttack: 3,
      filterTracking: 0,
      filterFM: 80, // Audio-rate FM!
      sweepSpeed: 'normal',
      muffler: 'off',
      highResonance: false,
      accentSweepEnabled: false,
    },
    neural: { enabled: false },
  },

  // ============================================================================
  // NEURAL SOUNDS (Devil Fish disabled, neural enabled)
  // ============================================================================
  {
    name: 'Tube Screamer Drive',
    description: 'Classic TS9 overdrive warmth',
    category: 'neural',
    cutoff: 800,
    resonance: 60,
    envMod: 55,
    decay: 200,
    accent: 65,
    overdrive: 70, // Drive amount
    devilFish: { enabled: false },
    neural: {
      enabled: true,
      modelIndex: 0, // TS9
      drive: 70,
      dryWet: 100,
    },
  },
  {
    name: 'Metal Distortion',
    description: 'Boss MT2 high-gain distortion',
    category: 'neural',
    cutoff: 1000,
    resonance: 75,
    envMod: 70,
    decay: 250,
    accent: 80,
    overdrive: 85,
    devilFish: { enabled: false },
    neural: {
      enabled: true,
      modelIndex: 3, // Boss MT2
      drive: 85,
      dryWet: 100,
    },
  },
  {
    name: 'Bass Grind',
    description: 'Aguilar Agro bass distortion',
    category: 'neural',
    cutoff: 600,
    resonance: 50,
    envMod: 45,
    decay: 200,
    accent: 70,
    overdrive: 75,
    devilFish: { enabled: false },
    neural: {
      enabled: true,
      modelIndex: 21, // Aguilar Agro Bright
      drive: 75,
      dryWet: 100,
    },
  },

  // ============================================================================
  // HYBRID SOUNDS (Devil Fish + Neural)
  // ============================================================================
  {
    name: 'Infinite TS9',
    description: 'Infinite sustain with tube screamer warmth',
    category: 'hybrid',
    cutoff: 700,
    resonance: 55,
    envMod: 50,
    decay: 300,
    accent: 65,
    overdrive: 65,
    devilFish: {
      enabled: true,
      normalDecay: 400,
      accentDecay: 300,
      vegDecay: 1000,
      vegSustain: 100, // Infinite!
      softAttack: 8,
      filterTracking: 0,
      filterFM: 0,
      sweepSpeed: 'normal',
      muffler: 'off',
      highResonance: false,
      accentSweepEnabled: false,
    },
    neural: {
      enabled: true,
      modelIndex: 0, // TS9
      drive: 65,
      dryWet: 100,
    },
  },
  {
    name: 'Screaming Metal',
    description: 'Self-oscillating filter through metal distortion',
    category: 'hybrid',
    cutoff: 1200,
    resonance: 95,
    envMod: 85,
    decay: 400,
    accent: 90,
    overdrive: 80,
    devilFish: {
      enabled: true,
      normalDecay: 600,
      accentDecay: 200,
      vegDecay: 800,
      vegSustain: 20,
      softAttack: 3,
      filterTracking: 40,
      filterFM: 20,
      sweepSpeed: 'fast',
      muffler: 'soft',
      highResonance: true, // Self-oscillation!
      accentSweepEnabled: true,
    },
    neural: {
      enabled: true,
      modelIndex: 3, // Boss MT2
      drive: 80,
      dryWet: 100,
    },
  },
  {
    name: 'Tracking Bass Grind',
    description: 'Melodic filter tracking with bass distortion',
    category: 'hybrid',
    cutoff: 500,
    resonance: 60,
    envMod: 45,
    decay: 250,
    accent: 70,
    overdrive: 70,
    devilFish: {
      enabled: true,
      normalDecay: 300,
      accentDecay: 250,
      vegDecay: 500,
      vegSustain: 25,
      softAttack: 5,
      filterTracking: 100, // 1:1 tracking
      filterFM: 0,
      sweepSpeed: 'normal',
      muffler: 'off',
      highResonance: false,
      accentSweepEnabled: false,
    },
    neural: {
      enabled: true,
      modelIndex: 21, // Aguilar Agro
      drive: 70,
      dryWet: 100,
    },
  },
  {
    name: 'FM Fuzz',
    description: 'Audio-rate FM through fuzz pedal',
    category: 'hybrid',
    cutoff: 950,
    resonance: 80,
    envMod: 75,
    decay: 350,
    accent: 85,
    overdrive: 75,
    devilFish: {
      enabled: true,
      normalDecay: 400,
      accentDecay: 300,
      vegDecay: 600,
      vegSustain: 0,
      softAttack: 3,
      filterTracking: 0,
      filterFM: 70, // Audio-rate FM!
      sweepSpeed: 'normal',
      muffler: 'hard',
      highResonance: false,
      accentSweepEnabled: true,
    },
    neural: {
      enabled: true,
      modelIndex: 35, // Big Muff
      drive: 75,
      dryWet: 100,
    },
  },
];

/**
 * Get preset by name
 */
export function getPresetByName(name: string): TB303Preset | undefined {
  return DEVIL_FISH_PRESETS.find(p => p.name === name);
}

/**
 * Get presets by category
 */
export function getPresetsByCategory(category: TB303Preset['category']): TB303Preset[] {
  return DEVIL_FISH_PRESETS.filter(p => p.category === category);
}

/**
 * Get all preset names
 */
export function getAllPresetNames(): string[] {
  return DEVIL_FISH_PRESETS.map(p => p.name);
}
