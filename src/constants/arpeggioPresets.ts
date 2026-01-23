/**
 * Arpeggio Presets - Organized by Chip Era
 *
 * 40+ presets spanning classic video game and computer music eras:
 * - NES (Nintendo Entertainment System, 1983-1990s)
 * - C64/SID (Commodore 64 SID chip, 1982-1994)
 * - Gameboy (Nintendo Gameboy, 1989-2000s)
 * - Amiga (Amiga MOD scene, 1987-1995)
 * - Arcade (Various arcade machines, 1980s-1990s)
 * - Chords (Standard musical chord voicings)
 */

import type { ArpeggioStep, ArpeggioConfig, ArpeggioMode } from '@typedefs/instrument';

export interface ArpeggioPreset {
  id: string;
  name: string;
  era: 'NES' | 'C64' | 'Gameboy' | 'Amiga' | 'Arcade' | 'Chords';
  description: string;
  steps: ArpeggioStep[];
  speed: number;
  speedUnit: 'hz' | 'ticks' | 'division';
  mode: ArpeggioMode;
  swing?: number;
  tags: string[];
}

// Helper to create simple step arrays
const S = (offsets: number[]): ArpeggioStep[] =>
  offsets.map(noteOffset => ({ noteOffset }));

// Helper for steps with effects
const SE = (
  offsets: number[],
  options: Partial<ArpeggioStep>[] = []
): ArpeggioStep[] =>
  offsets.map((noteOffset, i) => ({
    noteOffset,
    ...options[i],
  }));

// =============================================================================
// NES ERA PRESETS - Fast, bright, 8-bit chiptune character
// =============================================================================
export const NES_PRESETS: ArpeggioPreset[] = [
  {
    id: 'nes-major',
    name: 'NES Major',
    era: 'NES',
    description: 'Classic major chord arpeggio, heard in countless NES titles',
    steps: S([0, 4, 7, 12]),
    speed: 20,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['bright', 'happy', 'classic'],
  },
  {
    id: 'nes-minor',
    name: 'NES Minor',
    era: 'NES',
    description: 'Minor chord with octave, moody NES sound',
    steps: S([0, 3, 7, 12]),
    speed: 20,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['dark', 'moody', 'classic'],
  },
  {
    id: 'nes-power',
    name: 'NES Power',
    era: 'NES',
    description: 'Power chord arpeggio for action sequences',
    steps: S([0, 7, 12]),
    speed: 25,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['aggressive', 'action', 'rock'],
  },
  {
    id: 'nes-rapid',
    name: 'NES Rapid',
    era: 'NES',
    description: 'Ultra-fast 2-note arpeggio for that classic NES shimmer',
    steps: S([0, 7]),
    speed: 40,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['fast', 'shimmer', 'lead'],
  },
  {
    id: 'nes-bounce',
    name: 'NES Bounce',
    era: 'NES',
    description: 'Bouncing ping-pong arpeggio like Mega Man',
    steps: S([0, 4, 7, 12]),
    speed: 18,
    speedUnit: 'hz',
    mode: 'pingpong',
    tags: ['bouncy', 'megaman', 'action'],
  },
  {
    id: 'nes-castlevania',
    name: 'Castlevania',
    era: 'NES',
    description: 'Minor with augmented 4th, gothic NES horror',
    steps: S([0, 3, 6, 10]),
    speed: 15,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['gothic', 'horror', 'dark'],
  },
  {
    id: 'nes-ducktales',
    name: 'DuckTales',
    era: 'NES',
    description: 'Wide major arpeggio, bouncy adventure feel',
    steps: S([0, 4, 7, 11, 14]),
    speed: 22,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['adventure', 'happy', 'bouncy'],
  },
  {
    id: 'nes-metroid',
    name: 'Metroid',
    era: 'NES',
    description: 'Sparse, atmospheric arpeggio with octaves',
    steps: S([0, 12, 7, 12]),
    speed: 12,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['atmospheric', 'sci-fi', 'sparse'],
  },
];

// =============================================================================
// C64/SID ERA PRESETS - Warm, rich, 3-voice SID chip character
// =============================================================================
export const C64_PRESETS: ArpeggioPreset[] = [
  {
    id: 'c64-galway',
    name: 'Martin Galway',
    era: 'C64',
    description: 'Fast ping-pong arp in the style of Martin Galway',
    steps: S([0, 3, 7, 12, 15]),
    speed: 25,
    speedUnit: 'hz',
    mode: 'pingpong',
    tags: ['galway', 'fast', 'melodic'],
  },
  {
    id: 'c64-hubbard',
    name: 'Rob Hubbard',
    era: 'C64',
    description: 'Wide-ranging arpeggio typical of Rob Hubbard compositions',
    steps: S([0, 7, 12, 19, 24]),
    speed: 18,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['hubbard', 'wide', 'epic'],
  },
  {
    id: 'c64-commando',
    name: 'Commando',
    era: 'C64',
    description: 'Military-style minor arpeggio from Commando',
    steps: S([0, 3, 7, 10]),
    speed: 20,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['military', 'action', 'dark'],
  },
  {
    id: 'c64-monty',
    name: 'Monty on the Run',
    era: 'C64',
    description: 'Bright major 7th arpeggio, Hubbard\'s signature sound',
    steps: S([0, 4, 7, 11]),
    speed: 22,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['hubbard', 'bright', 'classic'],
  },
  {
    id: 'c64-sanxion',
    name: 'Sanxion',
    era: 'C64',
    description: 'Hypnotic minor 9th pattern from Sanxion loader',
    steps: S([0, 3, 7, 10, 14]),
    speed: 16,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['hypnotic', 'minor', 'loader'],
  },
  {
    id: 'c64-thing',
    name: 'Thing on a Spring',
    era: 'C64',
    description: 'Bouncy diminished pattern',
    steps: S([0, 3, 6, 9, 12]),
    speed: 24,
    speedUnit: 'hz',
    mode: 'pingpong',
    tags: ['bouncy', 'diminished', 'quirky'],
  },
  {
    id: 'c64-delta',
    name: 'Delta',
    era: 'C64',
    description: 'Driving power chord arps from Delta',
    steps: S([0, 7, 12, 7]),
    speed: 30,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['driving', 'power', 'shooter'],
  },
  {
    id: 'c64-cybernoid',
    name: 'Cybernoid',
    era: 'C64',
    description: 'Complex minor with chromatic descent',
    steps: S([0, 3, 7, 6, 5, 4, 3, 2]),
    speed: 20,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['chromatic', 'complex', 'jeroen'],
  },
  {
    id: 'c64-wizball',
    name: 'Wizball',
    era: 'C64',
    description: 'Ethereal major with extension',
    steps: S([0, 4, 7, 11, 14, 11, 7, 4]),
    speed: 18,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['ethereal', 'galway', 'smooth'],
  },
  {
    id: 'c64-bass',
    name: 'SID Bass',
    era: 'C64',
    description: 'Classic SID bass with octave bounce',
    steps: S([0, 12, 7, 12]),
    speed: 15,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['bass', 'octave', 'classic'],
  },
];

// =============================================================================
// GAMEBOY ERA PRESETS - Clean, precise, limited but creative
// =============================================================================
export const GAMEBOY_PRESETS: ArpeggioPreset[] = [
  {
    id: 'gb-tetris',
    name: 'Tetris',
    era: 'Gameboy',
    description: 'Russian-flavored minor pattern from Tetris',
    steps: S([0, 3, 7, 10]),
    speed: 15,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['tetris', 'russian', 'classic'],
  },
  {
    id: 'gb-pokemon',
    name: 'Pokemon',
    era: 'Gameboy',
    description: 'Bright, adventurous major arpeggio',
    steps: S([0, 4, 7, 12]),
    speed: 18,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['pokemon', 'bright', 'adventure'],
  },
  {
    id: 'gb-zelda',
    name: 'Zelda',
    era: 'Gameboy',
    description: 'Heroic suspended 4th resolving to major',
    steps: S([0, 5, 7, 12]),
    speed: 16,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['zelda', 'heroic', 'adventure'],
  },
  {
    id: 'gb-kirby',
    name: 'Kirby',
    era: 'Gameboy',
    description: 'Cute, bouncy major with 6th',
    steps: S([0, 4, 7, 9]),
    speed: 20,
    speedUnit: 'hz',
    mode: 'pingpong',
    tags: ['kirby', 'cute', 'bouncy'],
  },
  {
    id: 'gb-lsdj',
    name: 'LSDJ Wave',
    era: 'Gameboy',
    description: 'Modern LSDJ tracker style wide arp',
    steps: S([0, 7, 14, 19]),
    speed: 24,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['lsdj', 'modern', 'wide'],
  },
  {
    id: 'gb-battle',
    name: 'GB Battle',
    era: 'Gameboy',
    description: 'Tense diminished arpeggio for battles',
    steps: S([0, 3, 6, 9]),
    speed: 22,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['battle', 'tense', 'diminished'],
  },
];

// =============================================================================
// AMIGA ERA PRESETS - MOD tracker scene, sample-based roots
// =============================================================================
export const AMIGA_PRESETS: ArpeggioPreset[] = [
  {
    id: 'amiga-dominator',
    name: 'Dominator',
    era: 'Amiga',
    description: 'Hard minor arp from the demoscene',
    steps: S([0, 3, 7, 12, 15]),
    speed: 8,
    speedUnit: 'ticks',
    mode: 'loop',
    tags: ['demo', 'hard', 'minor'],
  },
  {
    id: 'amiga-purple',
    name: 'Purple Motion',
    era: 'Amiga',
    description: 'Dreamy major 7th in the style of Future Crew',
    steps: S([0, 4, 7, 11, 14]),
    speed: 6,
    speedUnit: 'ticks',
    mode: 'loop',
    tags: ['dreamy', 'futurecrew', 'major7'],
  },
  {
    id: 'amiga-skaven',
    name: 'Skaven',
    era: 'Amiga',
    description: 'Melodic minor with chromatic passing tone',
    steps: S([0, 3, 5, 7, 10]),
    speed: 6,
    speedUnit: 'ticks',
    mode: 'loop',
    tags: ['melodic', 'futurecrew', 'chromatic'],
  },
  {
    id: 'amiga-unreal',
    name: 'Unreal',
    era: 'Amiga',
    description: 'Sci-fi suspended pattern from Unreal',
    steps: S([0, 5, 7, 12]),
    speed: 8,
    speedUnit: 'ticks',
    mode: 'loop',
    tags: ['scifi', 'suspended', 'epic'],
  },
  {
    id: 'amiga-2nd',
    name: 'Second Reality',
    era: 'Amiga',
    description: 'Epic wide arpeggio spanning 2 octaves',
    steps: S([0, 7, 12, 16, 19, 24]),
    speed: 6,
    speedUnit: 'ticks',
    mode: 'loop',
    tags: ['epic', 'wide', 'demo'],
  },
  {
    id: 'amiga-elysium',
    name: 'Elysium',
    era: 'Amiga',
    description: 'Smooth ping-pong major 9th',
    steps: S([0, 4, 7, 11, 14]),
    speed: 8,
    speedUnit: 'ticks',
    mode: 'pingpong',
    tags: ['smooth', 'major9', 'chill'],
  },
  {
    id: 'amiga-bass',
    name: 'MOD Bass',
    era: 'Amiga',
    description: 'Classic tracker bass arpeggio',
    steps: S([0, 12, 19, 12]),
    speed: 4,
    speedUnit: 'ticks',
    mode: 'loop',
    tags: ['bass', 'tracker', 'classic'],
  },
  {
    id: 'amiga-chip',
    name: 'Chip Lead',
    era: 'Amiga',
    description: 'Fast chip-style lead arpeggio',
    steps: S([0, 4, 7]),
    speed: 3,
    speedUnit: 'ticks',
    mode: 'loop',
    tags: ['chip', 'fast', 'lead'],
  },
];

// =============================================================================
// ARCADE ERA PRESETS - Bold, attention-grabbing, coin-op character
// =============================================================================
export const ARCADE_PRESETS: ArpeggioPreset[] = [
  {
    id: 'arcade-boss',
    name: 'Boss Fight',
    era: 'Arcade',
    description: 'Intense diminished arpeggio for boss battles',
    steps: SE(
      [0, 3, 6, 9, 12],
      [{ effect: 'accent' }, {}, {}, {}, { effect: 'accent' }]
    ),
    speed: 20,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['boss', 'intense', 'diminished'],
  },
  {
    id: 'arcade-victory',
    name: 'Victory',
    era: 'Arcade',
    description: 'Triumphant major ascending fanfare',
    steps: S([0, 4, 7, 12, 16, 19, 24]),
    speed: 25,
    speedUnit: 'hz',
    mode: 'oneshot',
    tags: ['victory', 'ascending', 'happy'],
  },
  {
    id: 'arcade-tension',
    name: 'Tension',
    era: 'Arcade',
    description: 'Building tension with chromatic rise',
    steps: S([0, 1, 2, 3, 4, 5, 6]),
    speed: 15,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['tension', 'chromatic', 'building'],
  },
  {
    id: 'arcade-hero',
    name: 'Hero Theme',
    era: 'Arcade',
    description: 'Heroic major with octave leap',
    steps: S([0, 4, 7, 12, 7, 4]),
    speed: 18,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['hero', 'major', 'bold'],
  },
  {
    id: 'arcade-shmup',
    name: 'Shmup Lead',
    era: 'Arcade',
    description: 'Fast shoot-em-up style lead',
    steps: S([0, 7, 12]),
    speed: 30,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['shmup', 'fast', 'lead'],
  },
  {
    id: 'arcade-gameover',
    name: 'Game Over',
    era: 'Arcade',
    description: 'Descending minor for game over',
    steps: S([12, 10, 7, 3, 0]),
    speed: 12,
    speedUnit: 'hz',
    mode: 'oneshot',
    tags: ['gameover', 'descending', 'sad'],
  },
];

// =============================================================================
// CHORD PRESETS - Standard musical chord voicings
// =============================================================================
export const CHORD_PRESETS: ArpeggioPreset[] = [
  // Major family
  {
    id: 'chord-major',
    name: 'Major',
    era: 'Chords',
    description: 'Basic major triad',
    steps: S([0, 4, 7]),
    speed: 15,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['major', 'basic', 'triad'],
  },
  {
    id: 'chord-major7',
    name: 'Major 7th',
    era: 'Chords',
    description: 'Major seventh chord',
    steps: S([0, 4, 7, 11]),
    speed: 15,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['major', 'jazz', '7th'],
  },
  {
    id: 'chord-major9',
    name: 'Major 9th',
    era: 'Chords',
    description: 'Major ninth chord',
    steps: S([0, 4, 7, 11, 14]),
    speed: 15,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['major', 'jazz', '9th'],
  },
  {
    id: 'chord-major69',
    name: 'Major 6/9',
    era: 'Chords',
    description: 'Major 6/9 chord, smooth jazz voicing',
    steps: S([0, 4, 7, 9, 14]),
    speed: 15,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['major', 'jazz', 'smooth'],
  },
  {
    id: 'chord-add9',
    name: 'Add9',
    era: 'Chords',
    description: 'Major add9, modern pop sound',
    steps: S([0, 4, 7, 14]),
    speed: 15,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['major', 'pop', 'add9'],
  },

  // Minor family
  {
    id: 'chord-minor',
    name: 'Minor',
    era: 'Chords',
    description: 'Basic minor triad',
    steps: S([0, 3, 7]),
    speed: 15,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['minor', 'basic', 'triad'],
  },
  {
    id: 'chord-minor7',
    name: 'Minor 7th',
    era: 'Chords',
    description: 'Minor seventh chord',
    steps: S([0, 3, 7, 10]),
    speed: 15,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['minor', 'jazz', '7th'],
  },
  {
    id: 'chord-minor9',
    name: 'Minor 9th',
    era: 'Chords',
    description: 'Minor ninth chord',
    steps: S([0, 3, 7, 10, 14]),
    speed: 15,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['minor', 'jazz', '9th'],
  },
  {
    id: 'chord-minor11',
    name: 'Minor 11th',
    era: 'Chords',
    description: 'Minor 11th chord, rich voicing',
    steps: S([0, 3, 7, 10, 14, 17]),
    speed: 12,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['minor', 'jazz', '11th'],
  },

  // Dominant family
  {
    id: 'chord-dom7',
    name: 'Dom 7th',
    era: 'Chords',
    description: 'Dominant seventh chord',
    steps: S([0, 4, 7, 10]),
    speed: 15,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['dominant', 'blues', '7th'],
  },
  {
    id: 'chord-dom9',
    name: 'Dom 9th',
    era: 'Chords',
    description: 'Dominant ninth chord',
    steps: S([0, 4, 7, 10, 14]),
    speed: 15,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['dominant', 'funk', '9th'],
  },
  {
    id: 'chord-dom7sharp9',
    name: 'Dom 7#9',
    era: 'Chords',
    description: 'Hendrix chord',
    steps: S([0, 4, 7, 10, 15]),
    speed: 15,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['dominant', 'hendrix', 'rock'],
  },

  // Suspended chords
  {
    id: 'chord-sus2',
    name: 'Sus2',
    era: 'Chords',
    description: 'Suspended 2nd chord',
    steps: S([0, 2, 7]),
    speed: 15,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['suspended', 'open', 'ambient'],
  },
  {
    id: 'chord-sus4',
    name: 'Sus4',
    era: 'Chords',
    description: 'Suspended 4th chord',
    steps: S([0, 5, 7]),
    speed: 15,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['suspended', 'classic', 'rock'],
  },
  {
    id: 'chord-7sus4',
    name: '7Sus4',
    era: 'Chords',
    description: '7th suspended 4th',
    steps: S([0, 5, 7, 10]),
    speed: 15,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['suspended', 'funk', 'soul'],
  },

  // Diminished/Augmented
  {
    id: 'chord-dim',
    name: 'Diminished',
    era: 'Chords',
    description: 'Diminished triad',
    steps: S([0, 3, 6]),
    speed: 15,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['diminished', 'tension', 'dark'],
  },
  {
    id: 'chord-dim7',
    name: 'Dim 7th',
    era: 'Chords',
    description: 'Full diminished 7th (symmetrical)',
    steps: S([0, 3, 6, 9]),
    speed: 15,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['diminished', 'symmetrical', 'dark'],
  },
  {
    id: 'chord-aug',
    name: 'Augmented',
    era: 'Chords',
    description: 'Augmented triad',
    steps: S([0, 4, 8]),
    speed: 15,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['augmented', 'tension', 'dreamy'],
  },

  // Power chords
  {
    id: 'chord-power',
    name: 'Power',
    era: 'Chords',
    description: 'Power chord (root + fifth)',
    steps: S([0, 7]),
    speed: 20,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['power', 'rock', 'metal'],
  },
  {
    id: 'chord-power-oct',
    name: 'Power Octave',
    era: 'Chords',
    description: 'Power chord with octave',
    steps: S([0, 7, 12]),
    speed: 20,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['power', 'rock', 'metal'],
  },
  {
    id: 'chord-octave',
    name: 'Octave',
    era: 'Chords',
    description: 'Simple octave',
    steps: S([0, 12]),
    speed: 25,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['octave', 'simple', 'clean'],
  },
  {
    id: 'chord-2oct',
    name: '2 Octaves',
    era: 'Chords',
    description: 'Two octave span',
    steps: S([0, 12, 24]),
    speed: 20,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['octave', 'wide', 'epic'],
  },

  // Exotic/Modern
  {
    id: 'chord-quartal',
    name: 'Quartal',
    era: 'Chords',
    description: 'Stacked fourths (quartal harmony)',
    steps: S([0, 5, 10, 15]),
    speed: 12,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['quartal', 'modern', 'jazz'],
  },
  {
    id: 'chord-wholetone',
    name: 'Whole Tone',
    era: 'Chords',
    description: 'Whole tone scale arpeggio',
    steps: S([0, 2, 4, 6, 8, 10]),
    speed: 18,
    speedUnit: 'hz',
    mode: 'loop',
    tags: ['wholetone', 'dreamy', 'impressionist'],
  },
];

// =============================================================================
// COMBINED EXPORTS
// =============================================================================

export const ALL_PRESETS: ArpeggioPreset[] = [
  ...NES_PRESETS,
  ...C64_PRESETS,
  ...GAMEBOY_PRESETS,
  ...AMIGA_PRESETS,
  ...ARCADE_PRESETS,
  ...CHORD_PRESETS,
];

export const PRESETS_BY_ERA: Record<string, ArpeggioPreset[]> = {
  NES: NES_PRESETS,
  C64: C64_PRESETS,
  Gameboy: GAMEBOY_PRESETS,
  Amiga: AMIGA_PRESETS,
  Arcade: ARCADE_PRESETS,
  Chords: CHORD_PRESETS,
};

export const ERAS = ['NES', 'C64', 'Gameboy', 'Amiga', 'Arcade', 'Chords'] as const;

/**
 * Get a preset by ID
 */
export function getPresetById(id: string): ArpeggioPreset | undefined {
  return ALL_PRESETS.find(preset => preset.id === id);
}

/**
 * Search presets by tag
 */
export function searchPresetsByTag(tag: string): ArpeggioPreset[] {
  return ALL_PRESETS.filter(preset =>
    preset.tags.some(t => t.toLowerCase().includes(tag.toLowerCase()))
  );
}

/**
 * Convert preset to ArpeggioConfig
 */
export function presetToConfig(preset: ArpeggioPreset): ArpeggioConfig {
  return {
    enabled: true,
    speed: preset.speed,
    speedUnit: preset.speedUnit,
    steps: [...preset.steps],
    mode: preset.mode,
    swing: preset.swing ?? 0,
  };
}
