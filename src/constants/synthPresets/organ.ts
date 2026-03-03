import type { SynthPreset } from './types';
import type { OrganConfig } from '../../types/instrument';

export const ORGAN_PRESETS: SynthPreset[] = [
  {
    id: 'organ-rock',
    name: 'Rock Organ',
    description: 'Classic rock 888000000',
    category: 'key',
    config: {
      drawbars: [8, 8, 8, 0, 0, 0, 0, 0, 0],
      percussion: { enabled: false, volume: 50, decay: 'fast', harmonic: 'third' },
      keyClick: 30,
      rotary: { enabled: true, speed: 'slow' },
    } as Partial<OrganConfig>,
  },
  {
    id: 'organ-gospel',
    name: 'Gospel Full',
    description: 'Full gospel drawbars',
    category: 'key',
    config: {
      drawbars: [8, 8, 8, 8, 8, 8, 8, 8, 8],
      percussion: { enabled: true, volume: 70, decay: 'fast', harmonic: 'third' },
      keyClick: 50,
      rotary: { enabled: true, speed: 'fast' },
    } as Partial<OrganConfig>,
  },
  {
    id: 'organ-jazz',
    name: 'Jazz Combo',
    description: 'Smooth jazz setting',
    category: 'key',
    config: {
      drawbars: [8, 0, 8, 0, 0, 0, 0, 0, 0],
      percussion: { enabled: true, volume: 60, decay: 'slow', harmonic: 'second' },
      keyClick: 20,
      rotary: { enabled: true, speed: 'slow' },
    } as Partial<OrganConfig>,
  },
  {
    id: 'organ-blues',
    name: 'Blues Grind',
    description: 'Gritty blues tone',
    category: 'key',
    config: {
      drawbars: [8, 8, 6, 4, 0, 0, 0, 0, 0],
      percussion: { enabled: false, volume: 50, decay: 'fast', harmonic: 'third' },
      keyClick: 40,
      rotary: { enabled: true, speed: 'fast' },
    } as Partial<OrganConfig>,
  },
  {
    id: 'organ-theatre',
    name: 'Theatre Organ',
    description: 'Big Wurlitzer style',
    category: 'key',
    config: {
      drawbars: [6, 8, 8, 6, 4, 6, 4, 4, 4],
      percussion: { enabled: false, volume: 50, decay: 'fast', harmonic: 'third' },
      keyClick: 10,
      rotary: { enabled: false, speed: 'slow' },
    } as Partial<OrganConfig>,
  },
  {
    id: 'organ-ballad',
    name: 'Ballad',
    description: 'Soft romantic setting',
    category: 'key',
    config: {
      drawbars: [0, 0, 8, 8, 0, 0, 0, 0, 0],
      percussion: { enabled: true, volume: 40, decay: 'slow', harmonic: 'second' },
      keyClick: 15,
      rotary: { enabled: true, speed: 'slow' },
    } as Partial<OrganConfig>,
  },
  {
    id: 'organ-ska',
    name: 'Ska Bubble',
    description: 'Bouncy ska/reggae',
    category: 'key',
    config: {
      drawbars: [8, 6, 8, 0, 0, 0, 0, 0, 0],
      percussion: { enabled: true, volume: 80, decay: 'fast', harmonic: 'third' },
      keyClick: 60,
      rotary: { enabled: false, speed: 'slow' },
    } as Partial<OrganConfig>,
  },
  {
    id: 'organ-prog',
    name: 'Prog Rock',
    description: 'ELP/Yes style',
    category: 'key',
    config: {
      drawbars: [8, 8, 8, 8, 0, 0, 0, 0, 8],
      percussion: { enabled: true, volume: 60, decay: 'fast', harmonic: 'third' },
      keyClick: 35,
      rotary: { enabled: true, speed: 'fast' },
    } as Partial<OrganConfig>,
  },
  {
    id: 'organ-church',
    name: 'Church',
    description: 'Pipe organ style',
    category: 'key',
    config: {
      drawbars: [8, 4, 8, 4, 8, 4, 4, 4, 4],
      percussion: { enabled: false, volume: 50, decay: 'fast', harmonic: 'third' },
      keyClick: 5,
      rotary: { enabled: false, speed: 'slow' },
    } as Partial<OrganConfig>,
  },
  {
    id: 'organ-funk',
    name: 'Funk Clavinet',
    description: 'Clavinet-ish funk',
    category: 'key',
    config: {
      drawbars: [0, 0, 8, 8, 8, 0, 0, 0, 0],
      percussion: { enabled: true, volume: 90, decay: 'fast', harmonic: 'second' },
      keyClick: 70,
      rotary: { enabled: false, speed: 'slow' },
    } as Partial<OrganConfig>,
  },
  {
    id: 'organ-soul',
    name: 'Soul',
    description: 'Motown soul organ',
    category: 'key',
    config: {
      drawbars: [8, 8, 4, 0, 0, 0, 0, 0, 0],
      percussion: { enabled: true, volume: 50, decay: 'fast', harmonic: 'third' },
      keyClick: 25,
      rotary: { enabled: true, speed: 'slow' },
    } as Partial<OrganConfig>,
  },
  {
    id: 'organ-booker-t',
    name: 'Booker T',
    description: 'Green Onions style',
    category: 'key',
    config: {
      drawbars: [8, 8, 8, 0, 0, 0, 0, 0, 0],
      percussion: { enabled: false, volume: 50, decay: 'fast', harmonic: 'third' },
      keyClick: 45,
      rotary: { enabled: true, speed: 'slow' },
    } as Partial<OrganConfig>,
  },
  {
    id: 'organ-deep-purple',
    name: 'Deep Purple',
    description: 'Jon Lord style',
    category: 'key',
    config: {
      drawbars: [8, 8, 8, 8, 0, 0, 0, 4, 0],
      percussion: { enabled: true, volume: 65, decay: 'fast', harmonic: 'third' },
      keyClick: 55,
      rotary: { enabled: true, speed: 'fast' },
    } as Partial<OrganConfig>,
  },
  {
    id: 'organ-whiter-shade',
    name: 'Whiter Shade',
    description: 'Procol Harum style',
    category: 'key',
    config: {
      drawbars: [8, 8, 8, 0, 0, 4, 0, 4, 0],
      percussion: { enabled: false, volume: 50, decay: 'fast', harmonic: 'third' },
      keyClick: 20,
      rotary: { enabled: true, speed: 'slow' },
    } as Partial<OrganConfig>,
  },
  {
    id: 'organ-doors',
    name: 'The Doors',
    description: 'Ray Manzarek style',
    category: 'key',
    config: {
      drawbars: [8, 8, 8, 6, 0, 0, 0, 0, 0],
      percussion: { enabled: true, volume: 55, decay: 'fast', harmonic: 'second' },
      keyClick: 40,
      rotary: { enabled: true, speed: 'slow' },
    } as Partial<OrganConfig>,
  },
  {
    id: 'organ-purdie',
    name: 'Purdie Shuffle',
    description: 'R&B shuffle organ',
    category: 'key',
    config: {
      drawbars: [8, 6, 8, 4, 0, 0, 0, 0, 0],
      percussion: { enabled: true, volume: 60, decay: 'fast', harmonic: 'third' },
      keyClick: 35,
      rotary: { enabled: true, speed: 'fast' },
    } as Partial<OrganConfig>,
  },
  {
    id: 'organ-leslie-slow',
    name: 'Leslie Slow',
    description: 'Gentle Leslie rotation',
    category: 'key',
    config: {
      drawbars: [8, 8, 6, 0, 0, 0, 0, 0, 0],
      percussion: { enabled: false, volume: 50, decay: 'fast', harmonic: 'third' },
      keyClick: 25,
      vibrato: { type: 'C3', depth: 60 },
      rotary: { enabled: true, speed: 'slow' },
    } as Partial<OrganConfig>,
  },
  {
    id: 'organ-leslie-fast',
    name: 'Leslie Fast',
    description: 'Spinning Leslie effect',
    category: 'key',
    config: {
      drawbars: [8, 8, 8, 0, 0, 0, 0, 0, 0],
      percussion: { enabled: false, volume: 50, decay: 'fast', harmonic: 'third' },
      keyClick: 30,
      vibrato: { type: 'C3', depth: 70 },
      rotary: { enabled: true, speed: 'fast' },
    } as Partial<OrganConfig>,
  },
  {
    id: 'organ-flute',
    name: 'Flute Stop',
    description: '8ft flute only',
    category: 'key',
    config: {
      drawbars: [0, 0, 8, 0, 0, 0, 0, 0, 0],
      percussion: { enabled: false, volume: 50, decay: 'fast', harmonic: 'third' },
      keyClick: 10,
      rotary: { enabled: true, speed: 'slow' },
    } as Partial<OrganConfig>,
  },
  {
    id: 'organ-full-stop',
    name: 'Full Stops',
    description: 'All harmonics equal',
    category: 'key',
    config: {
      drawbars: [8, 8, 8, 8, 8, 8, 8, 8, 8],
      percussion: { enabled: false, volume: 50, decay: 'fast', harmonic: 'third' },
      keyClick: 40,
      rotary: { enabled: true, speed: 'slow' },
    } as Partial<OrganConfig>,
  },
];

// ============================================
// DRUM MACHINE PRESETS (808/909)
// ============================================

