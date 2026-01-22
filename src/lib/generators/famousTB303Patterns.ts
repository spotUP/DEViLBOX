/**
 * Famous TB-303 Patterns
 * Transcribed from ML-303 Pattern Charts
 */

import type { TB303Pattern } from './tb303PatternConverter';

export const FAMOUS_TB303_PATTERNS: TB303Pattern[] = [
  // Pattern 1: Fatboy Slim - Everybody needs a 303
  {
    name: 'Fatboy Slim - Everybody needs a 303',
    waveform: 'SQUARE',
    steps: [
      { note: 'D', octaveUp: false, octaveDown: false, accent: true, slide: true, gate: true, off: false },
      { note: 'D', octaveUp: false, octaveDown: false, accent: true, slide: false, gate: true, off: false },
      { note: 'C#', octaveUp: false, octaveDown: false, accent: true, slide: false, gate: true, off: false },
      { note: 'D', octaveUp: false, octaveDown: false, accent: true, slide: false, gate: true, off: false },
      { note: 'G', octaveUp: false, octaveDown: false, accent: true, slide: false, gate: true, off: false },
      { note: 'D', octaveUp: false, octaveDown: false, accent: true, slide: false, gate: true, off: false },
      { note: 'D', octaveUp: true, octaveDown: false, accent: true, slide: false, gate: true, off: false },
      { note: 'D', octaveUp: false, octaveDown: false, accent: true, slide: false, gate: true, off: false },
      { note: 'C#', octaveUp: true, octaveDown: false, accent: true, slide: false, gate: true, off: false },
      { note: 'D', octaveUp: false, octaveDown: false, accent: true, slide: false, gate: true, off: false },
      { note: 'F', octaveUp: true, octaveDown: false, accent: true, slide: false, gate: true, off: false },
      { note: 'D', octaveUp: false, octaveDown: false, accent: true, slide: false, gate: true, off: false },
      { note: 'A', octaveUp: false, octaveDown: false, accent: true, slide: false, gate: true, off: false },
      { note: 'C#', octaveUp: true, octaveDown: false, accent: true, slide: false, gate: true, off: false },
      { note: 'D', octaveUp: true, octaveDown: false, accent: true, slide: false, gate: true, off: false },
      { note: 'C#', octaveUp: true, octaveDown: false, accent: true, slide: false, gate: true, off: false },
    ],
  },

  // Pattern 2: Josh Wink - High State Of Consciousness
  {
    name: 'Josh Wink - High State Of Consciousness',
    waveform: 'SAW',
    steps: [
      { note: 'G', octaveUp: false, octaveDown: false, accent: false, slide: true, gate: true, off: false },
      { note: 'G', octaveUp: false, octaveDown: true, accent: false, slide: false, gate: true, off: false },
      { note: 'G', octaveUp: false, octaveDown: false, accent: false, slide: true, gate: true, off: false },
      { note: 'G', octaveUp: false, octaveDown: false, accent: false, slide: true, gate: true, off: false },
      { note: 'G', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'G', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'B', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'G', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'B', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'G', octaveUp: false, octaveDown: false, accent: false, slide: true, gate: true, off: false },
      { note: 'G', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'B', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'G', octaveUp: false, octaveDown: false, accent: false, slide: true, gate: true, off: false },
      { note: 'G', octaveUp: false, octaveDown: false, accent: false, slide: true, gate: true, off: false },
      { note: 'G', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'B', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
    ],
  },

  // Pattern 3: Christophe Just - I'm a disco dancer 1/2
  {
    name: "Christophe Just - I'm a disco dancer (Part 1)",
    waveform: 'SQUARE',
    steps: [
      { note: 'C', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'C#', octaveUp: true, octaveDown: false, accent: false, slide: true, gate: true, off: false },
      { note: 'C', octaveUp: true, octaveDown: false, accent: false, slide: true, gate: true, off: false },
      { note: 'C', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'E', octaveUp: true, octaveDown: false, accent: false, slide: true, gate: true, off: false },
      { note: 'E', octaveUp: false, octaveDown: false, accent: false, slide: true, gate: true, off: false },
      { note: 'E', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'D#', octaveUp: true, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'D#', octaveUp: true, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'C#', octaveUp: true, octaveDown: false, accent: false, slide: true, gate: true, off: false },
      { note: 'D#', octaveUp: false, octaveDown: false, accent: false, slide: true, gate: true, off: false },
      { note: 'D#', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'D#', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'D#', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'E', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'C', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
    ],
  },

  // Pattern 4: Christophe Just - I'm a disco dancer 2/2
  {
    name: "Christophe Just - I'm a disco dancer (Part 2)",
    waveform: 'SQUARE',
    steps: [
      { note: 'C#', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'C#', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'C', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'C', octaveUp: false, octaveDown: true, accent: false, slide: false, gate: true, off: false },
      { note: 'C#', octaveUp: true, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'C', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'F#', octaveUp: true, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'C', octaveUp: true, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'F#', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'C', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'C#', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'C#', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'C', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'C', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'C#', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'C#', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
    ],
  },

  // Pattern 5: Claustrophobic Sting - The Prodigy
  {
    name: 'Claustrophobic Sting - The Prodigy',
    waveform: 'SQUARE',
    steps: [
      { note: 'F', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: false, off: true },
      { note: 'F#', octaveUp: false, octaveDown: false, accent: false, slide: true, gate: true, off: false },
      { note: 'F#', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'F#', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'F#', octaveUp: true, octaveDown: false, accent: false, slide: true, gate: true, off: false },
      { note: 'C#', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'F#', octaveUp: true, octaveDown: false, accent: true, slide: false, gate: true, off: false },
      { note: 'F', octaveUp: true, octaveDown: false, accent: true, slide: false, gate: true, off: false },
    ],
  },

  // Pattern 6: Josh Wink - Are You There
  {
    name: 'Josh Wink - Are You There',
    waveform: 'SQUARE',
    steps: [
      { note: 'D#', octaveUp: true, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'D', octaveUp: true, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'C#', octaveUp: true, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'D', octaveUp: true, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'E', octaveUp: true, octaveDown: false, accent: false, slide: true, gate: true, off: false },
      { note: 'E', octaveUp: false, octaveDown: false, accent: false, slide: true, gate: true, off: false },
      { note: 'E', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'D#', octaveUp: true, octaveDown: false, accent: false, slide: true, gate: true, off: false },
      { note: 'C#', octaveUp: false, octaveDown: false, accent: false, slide: true, gate: true, off: false },
      { note: 'D#', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
    ],
  },

  // Pattern 7: Cut & Paste - Forget it 1/2
  {
    name: 'Cut & Paste - Forget it (Part 1)',
    waveform: 'SQUARE',
    steps: [
      { note: 'A#', octaveUp: false, octaveDown: true, accent: false, slide: true, gate: true, off: false },
      { note: 'A#', octaveUp: false, octaveDown: true, accent: false, slide: false, gate: true, off: false },
      { note: 'A#', octaveUp: false, octaveDown: false, accent: false, slide: true, gate: true, off: false },
      { note: 'A#', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'F', octaveUp: false, octaveDown: true, accent: false, slide: true, gate: true, off: false },
      { note: 'F', octaveUp: false, octaveDown: true, accent: false, slide: false, gate: true, off: false },
      { note: 'F', octaveUp: false, octaveDown: false, accent: false, slide: true, gate: true, off: false },
      { note: 'F', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'G#', octaveUp: false, octaveDown: false, accent: false, slide: true, gate: true, off: false },
      { note: 'G#', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'F', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'G#', octaveUp: false, octaveDown: false, accent: false, slide: true, gate: true, off: false },
      { note: 'G#', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'F', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'A#', octaveUp: false, octaveDown: false, accent: false, slide: true, gate: true, off: false },
      { note: 'A#', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
    ],
  },

  // Pattern 8: Cut & Paste - Forget it 2/2
  {
    name: 'Cut & Paste - Forget it (Part 2)',
    waveform: 'SQUARE',
    steps: [
      { note: 'A#', octaveUp: false, octaveDown: true, accent: false, slide: true, gate: true, off: false },
      { note: 'A#', octaveUp: false, octaveDown: true, accent: false, slide: false, gate: true, off: false },
      { note: 'A#', octaveUp: false, octaveDown: false, accent: false, slide: true, gate: true, off: false },
      { note: 'A#', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'A#', octaveUp: false, octaveDown: false, accent: false, slide: true, gate: true, off: false },
      { note: 'A#', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'D', octaveUp: false, octaveDown: false, accent: false, slide: true, gate: true, off: false },
      { note: 'D', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'D#', octaveUp: false, octaveDown: false, accent: false, slide: true, gate: true, off: false },
      { note: 'D#', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'E', octaveUp: false, octaveDown: false, accent: false, slide: true, gate: true, off: false },
      { note: 'E', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'F', octaveUp: false, octaveDown: false, accent: false, slide: true, gate: true, off: false },
      { note: 'F', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'F', octaveUp: false, octaveDown: true, accent: false, slide: true, gate: true, off: false },
      { note: 'F', octaveUp: false, octaveDown: true, accent: false, slide: true, gate: true, off: false },
    ],
  },

  // Pattern 9: Public Energy - Three o Three 1/2
  {
    name: 'Public Energy - Three o Three (Part 1)',
    waveform: 'SAW',
    bpm: 133,
    steps: [
      { note: null, octaveUp: false, octaveDown: false, accent: false, slide: false, gate: false, off: false },
      { note: 'A', octaveUp: false, octaveDown: false, accent: false, slide: true, gate: true, off: false },
      { note: 'A', octaveUp: false, octaveDown: false, accent: false, slide: true, gate: true, off: false },
      { note: 'A', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: null, octaveUp: false, octaveDown: false, accent: false, slide: false, gate: false, off: false },
      { note: null, octaveUp: false, octaveDown: false, accent: false, slide: false, gate: false, off: false },
      { note: 'C', octaveUp: false, octaveDown: false, accent: true, slide: false, gate: true, off: false },
      { note: null, octaveUp: false, octaveDown: false, accent: false, slide: false, gate: false, off: false },
      { note: 'A', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: null, octaveUp: false, octaveDown: false, accent: false, slide: false, gate: false, off: false },
      { note: 'A', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: null, octaveUp: false, octaveDown: false, accent: false, slide: false, gate: false, off: false },
      { note: 'A', octaveUp: true, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'D', octaveUp: true, octaveDown: false, accent: true, slide: false, gate: true, off: false },
      { note: 'E', octaveUp: true, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'G', octaveUp: true, octaveDown: false, accent: false, slide: false, gate: true, off: false },
    ],
  },

  // Pattern 10: 2/2 (continuation pattern)
  {
    name: 'Public Energy - Three o Three (Part 2)',
    waveform: 'SQUARE',
    steps: [
      { note: null, octaveUp: false, octaveDown: false, accent: false, slide: false, gate: false, off: false },
      { note: 'G', octaveUp: false, octaveDown: false, accent: true, slide: false, gate: true, off: false },
      { note: null, octaveUp: false, octaveDown: false, accent: false, slide: false, gate: false, off: false },
      { note: 'A#', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: null, octaveUp: false, octaveDown: false, accent: false, slide: false, gate: false, off: false },
      { note: null, octaveUp: false, octaveDown: false, accent: false, slide: false, gate: false, off: false },
      { note: null, octaveUp: false, octaveDown: false, accent: false, slide: false, gate: false, off: false },
      { note: 'A#', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: null, octaveUp: false, octaveDown: false, accent: false, slide: false, gate: false, off: false },
      { note: 'A#', octaveUp: true, octaveDown: false, accent: false, slide: true, gate: true, off: false },
      { note: 'A#', octaveUp: true, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'A#', octaveUp: true, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: 'G#', octaveUp: false, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: null, octaveUp: false, octaveDown: false, accent: false, slide: false, gate: false, off: false },
      { note: 'A#', octaveUp: true, octaveDown: false, accent: false, slide: false, gate: true, off: false },
      { note: null, octaveUp: false, octaveDown: false, accent: false, slide: false, gate: false, off: false },
    ],
  },
];
