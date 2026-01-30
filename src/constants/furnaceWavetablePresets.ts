/**
 * Furnace Wavetable Presets
 * Converted from Furnace Tracker wavetable files (.fuw)
 * Original files: furnace-master/wavetables/
 */

export interface FurnaceWavetablePreset {
  id: string;
  name: string;
  category: '32x16' | '32x32' | '128x256';
  len: number;
  max: number;
  data: number[];
}

export const FURNACE_WAVETABLE_PRESETS: FurnaceWavetablePreset[] = [
  // ============ 32x16 Wavetables (4-bit, for GB/N163/WonderSwan) ============
  {
    id: '32x16FunkyLead',
    name: 'Funky Lead',
    category: '32x16',
    len: 32,
    max: 15,
    data: [8,15,14,11,9,6,4,4,6,7,6,4,3,3,4,6,8,9,11,12,12,11,9,8,9,11,11,9,6,4,1,0],
  },
  {
    id: '32x16NamcoBass',
    name: 'Namco Bass',
    category: '32x16',
    len: 32,
    max: 15,
    data: [7,10,12,13,14,13,12,10,7,4,2,1,0,1,2,4,7,11,13,14,13,11,7,3,1,0,1,3,7,14,7,0],
  },
  {
    id: '32x16ataribass',
    name: 'Atari Bass',
    category: '32x16',
    len: 32,
    max: 15,
    data: [15,15,0,0,15,15,0,0,0,0,15,15,15,15,0,0,15,15,15,15,15,15,0,0,0,0,0,0,0,0,0,0],
  },
  {
    id: '32x16brass',
    name: 'Brass',
    category: '32x16',
    len: 32,
    max: 15,
    data: [15,14,13,12,11,8,6,2,4,3,7,9,9,7,5,0,15,15,13,13,13,11,11,8,8,0,0,0,0,0,0,0],
  },
  {
    id: '32x16clarinet',
    name: 'Clarinet',
    category: '32x16',
    len: 32,
    max: 15,
    data: [12,14,15,15,15,15,15,15,15,15,15,15,15,15,14,12,3,1,0,0,0,0,0,0,0,0,0,0,0,0,1,3],
  },
  {
    id: '32x16distortedsquare',
    name: 'Distorted Square',
    category: '32x16',
    len: 32,
    max: 15,
    data: [14,12,10,11,14,9,10,13,9,14,10,15,13,7,14,6,5,1,6,0,3,2,4,5,0,3,2,4,2,3,6,1],
  },
  {
    id: '32x16eguitar',
    name: 'E-Guitar',
    category: '32x16',
    len: 32,
    max: 15,
    data: [0,12,9,6,13,2,9,12,4,3,4,12,10,8,8,1,2,0,9,10,10,12,0,0,5,3,0,15,0,0,10,10],
  },
  {
    id: '32x16flute',
    name: 'Flute',
    category: '32x16',
    len: 32,
    max: 15,
    data: [12,14,15,15,14,14,14,15,13,14,15,15,14,13,11,9,6,4,2,0,0,2,2,2,1,1,1,1,0,1,2,4],
  },
  {
    id: '32x16guitar',
    name: 'Guitar',
    category: '32x16',
    len: 32,
    max: 15,
    data: [9,15,15,14,15,15,15,15,15,15,15,13,5,1,1,3,7,7,5,4,2,1,0,4,8,7,4,1,2,3,5,6],
  },
  {
    id: '32x16opllpiano',
    name: 'OPLL Piano',
    category: '32x16',
    len: 32,
    max: 15,
    data: [7,13,15,15,15,15,14,11,10,12,15,14,8,3,2,4,7,11,13,13,10,4,0,2,5,5,3,1,0,0,0,1],
  },
  {
    id: '32x16opllvibra',
    name: 'OPLL Vibraphone',
    category: '32x16',
    len: 32,
    max: 15,
    data: [5,14,12,9,8,15,15,15,14,15,12,13,15,15,11,4,7,11,9,1,0,2,4,1,1,0,0,0,4,7,4,1],
  },
  {
    id: '32x16reedorgan',
    name: 'Reed Organ',
    category: '32x16',
    len: 32,
    max: 15,
    data: [8,12,10,11,10,12,12,13,12,15,14,13,12,13,13,9,6,2,2,3,2,1,0,3,2,3,3,5,4,5,3,7],
  },
  {
    id: '32x16saw',
    name: 'Saw',
    category: '32x16',
    len: 32,
    max: 15,
    data: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15],
  },
  {
    id: '32x16saw2',
    name: 'Saw 2',
    category: '32x16',
    len: 32,
    max: 15,
    data: [15,14,13,12,11,10,9,8,15,14,13,12,11,10,9,8,12,14,12,10,8,6,5,4,3,3,2,2,1,1,0,0],
  },
  {
    id: '32x16sax',
    name: 'Sax',
    category: '32x16',
    len: 32,
    max: 15,
    data: [0,1,2,3,4,5,0,0,0,0,0,0,0,0,0,0,0,0,1,2,3,4,5,0,15,10,11,12,13,14,15,15],
  },
  {
    id: '32x16slapbass',
    name: 'Slap Bass',
    category: '32x16',
    len: 32,
    max: 15,
    data: [8,13,15,15,13,11,8,7,6,8,10,14,15,12,4,0,8,15,12,3,0,2,5,8,9,9,7,5,2,0,0,3],
  },
  {
    id: '32x16synthbass',
    name: 'Synth Bass',
    category: '32x16',
    len: 32,
    max: 15,
    data: [10,9,9,8,5,7,7,5,4,4,5,7,8,9,10,10,10,9,7,6,8,10,12,12,12,11,8,4,3,2,3,1],
  },
  {
    id: '32x16synthbrass',
    name: 'Synth Brass',
    category: '32x16',
    len: 32,
    max: 15,
    data: [2,15,5,0,0,9,15,13,11,9,12,14,15,7,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  },
  {
    id: '32x16trumpet',
    name: 'Trumpet',
    category: '32x16',
    len: 32,
    max: 15,
    data: [7,15,13,12,10,10,9,9,9,8,8,8,8,8,8,8,8,8,8,8,8,8,7,7,7,6,5,5,3,2,0,0],
  },
  {
    id: '32x16voice',
    name: 'Voice',
    category: '32x16',
    len: 32,
    max: 15,
    data: [7,8,9,10,10,11,11,12,12,12,12,12,12,12,12,12,11,11,10,10,9,8,7,2,1,0,0,0,0,0,1,2],
  },

  // ============ 32x32 Wavetables (5-bit, for PCE/VB) ============
  {
    id: '32x32KeygenBass',
    name: 'Keygen Bass',
    category: '32x32',
    len: 32,
    max: 31,
    data: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,21,23,25,27,29,30,31,31,31,31,31,31,31,31,31],
  },
  {
    id: '32x32accordion',
    name: 'Accordion',
    category: '32x32',
    len: 32,
    max: 31,
    data: [0,8,1,13,20,23,20,17,23,17,9,9,18,17,16,26,31,26,27,24,20,14,5,12,10,18,11,15,21,12,5,11],
  },
  {
    id: '32x32accordion2',
    name: 'Accordion 2',
    category: '32x32',
    len: 32,
    max: 31,
    data: [16,17,21,22,22,22,20,19,13,12,11,10,10,13,15,17,27,27,31,31,31,29,25,23,9,7,3,1,0,2,4,6],
  },
  {
    id: '32x32acousticguitar',
    name: 'Acoustic Guitar',
    category: '32x32',
    len: 32,
    max: 31,
    data: [2,18,26,28,29,28,28,28,29,31,31,27,14,2,1,0,1,2,2,0,1,1,1,1,1,1,1,0,0,0,0,0],
  },
  {
    id: '32x32agogo',
    name: 'Agogo',
    category: '32x32',
    len: 32,
    max: 31,
    data: [16,8,6,31,13,16,16,14,25,21,8,12,28,18,18,12,16,16,23,0,13,16,20,16,6,12,18,17,8,15,15,26],
  },
  {
    id: '32x32ataribass',
    name: 'Atari Bass',
    category: '32x32',
    len: 32,
    max: 31,
    data: [31,31,31,31,31,31,31,31,0,0,0,0,0,0,0,0,31,31,31,0,0,0,31,31,31,31,31,0,0,0,0,0],
  },
  {
    id: '32x32bass2',
    name: 'Bass 2',
    category: '32x32',
    len: 32,
    max: 31,
    data: [15,25,31,31,26,18,12,7,4,3,3,3,4,6,8,12,15,19,23,26,28,29,29,29,28,26,22,16,8,2,0,5],
  },
  {
    id: '32x32bass3',
    name: 'Bass 3',
    category: '32x32',
    len: 32,
    max: 31,
    data: [15,15,12,7,2,0,2,7,15,24,29,31,29,24,19,16,15,16,17,18,17,17,16,15,15,15,15,14,14,13,14,15],
  },
  {
    id: '32x32bell',
    name: 'Bell',
    category: '32x32',
    len: 32,
    max: 31,
    data: [16,31,30,16,26,25,13,28,31,15,0,0,8,4,10,26,13,4,20,30,29,30,30,19,1,9,23,9,5,11,0,0],
  },
  {
    id: '32x32brass',
    name: 'Brass',
    category: '32x32',
    len: 32,
    max: 31,
    data: [31,31,29,27,25,23,21,19,16,14,12,10,8,6,4,2,28,26,23,21,19,17,14,12,22,20,17,15,13,11,9,6],
  },
  {
    id: '32x32brass2',
    name: 'Brass 2',
    category: '32x32',
    len: 32,
    max: 31,
    data: [16,18,21,24,27,29,30,31,31,31,30,29,27,24,21,18,0,2,4,6,8,10,12,14,16,17,19,21,23,25,27,29],
  },
  {
    id: '32x32chime',
    name: 'Chime',
    category: '32x32',
    len: 32,
    max: 31,
    data: [15,27,23,17,23,27,21,15,23,30,26,17,21,23,15,6,15,24,15,7,9,13,4,0,7,15,9,3,7,13,7,3],
  },
  {
    id: '32x32choir',
    name: 'Choir',
    category: '32x32',
    len: 32,
    max: 31,
    data: [0,3,8,13,22,26,30,31,31,30,28,24,20,18,17,16,15,15,15,15,16,16,16,16,15,14,12,10,8,5,2,0],
  },
  {
    id: '32x32clarinet',
    name: 'Clarinet',
    category: '32x32',
    len: 32,
    max: 31,
    data: [20,31,29,26,26,28,30,31,31,30,28,26,25,27,30,31,15,0,4,6,6,4,2,0,0,1,3,5,6,6,2,2],
  },
  {
    id: '32x32clarinet2',
    name: 'Clarinet 2',
    category: '32x32',
    len: 32,
    max: 31,
    data: [21,27,30,28,24,22,24,26,24,22,19,18,19,26,23,19,12,6,0,1,4,8,7,5,7,10,13,11,9,7,5,10],
  },
  {
    id: '32x32distortedpulse',
    name: 'Distorted Pulse',
    category: '32x32',
    len: 32,
    max: 31,
    data: [31,31,31,31,0,0,0,0,16,16,16,16,0,0,0,0,8,8,8,8,0,0,0,0,3,3,3,3,0,0,0,0],
  },
  {
    id: '32x32distortedpulse2',
    name: 'Distorted Pulse 2',
    category: '32x32',
    len: 32,
    max: 31,
    data: [3,25,13,15,18,16,17,15,15,15,17,15,12,11,6,15,27,0,13,15,18,3,8,15,15,20,17,15,12,31,29,15],
  },
  {
    id: '32x32distortedsaw',
    name: 'Distorted Saw',
    category: '32x32',
    len: 32,
    max: 31,
    data: [0,7,10,10,14,14,17,17,21,21,25,25,27,27,29,29,29,29,31,31,31,31,31,5,8,11,14,16,18,20,22,0],
  },
  {
    id: '32x32ebass',
    name: 'E-Bass',
    category: '32x32',
    len: 32,
    max: 31,
    data: [17,21,31,28,23,27,30,13,0,8,11,10,7,8,14,21,27,27,26,25,31,19,0,2,0,0,0,8,15,18,18,16],
  },
  {
    id: '32x32eguitar',
    name: 'E-Guitar',
    category: '32x32',
    len: 32,
    max: 31,
    data: [3,9,16,23,28,31,31,29,26,23,25,27,28,29,28,22,8,0,12,28,0,14,2,0,1,31,30,4,3,1,0,0],
  },
  {
    id: '32x32eguitar2',
    name: 'E-Guitar 2',
    category: '32x32',
    len: 32,
    max: 31,
    data: [16,27,31,28,31,25,16,0,3,0,11,7,5,16,18,17,23,23,30,31,29,30,0,12,3,4,4,8,11,10,20,21],
  },
  {
    id: '32x32englishhorn',
    name: 'English Horn',
    category: '32x32',
    len: 32,
    max: 31,
    data: [16,22,31,22,15,9,15,9,15,13,11,8,6,4,3,2,1,1,0,0,0,0,0,0,1,1,2,3,4,6,8,11],
  },
  {
    id: '32x32fantasia',
    name: 'Fantasia',
    category: '32x32',
    len: 32,
    max: 31,
    data: [0,6,14,15,14,8,5,7,15,15,21,26,27,26,21,15,17,23,29,31,31,28,22,12,11,15,19,20,19,17,6,1],
  },
  {
    id: '32x32filteredsaw',
    name: 'Filtered Saw',
    category: '32x32',
    len: 32,
    max: 31,
    data: [16,18,20,21,23,25,26,28,29,30,31,31,31,31,30,26,19,9,3,1,0,0,1,2,3,4,6,7,9,11,12,14],
  },
  {
    id: '32x32filteredsquare',
    name: 'Filtered Square',
    category: '32x32',
    len: 32,
    max: 31,
    data: [20,24,27,28,29,30,31,31,31,31,30,29,28,27,24,20,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  },
  {
    id: '32x32flute',
    name: 'Flute',
    category: '32x32',
    len: 32,
    max: 31,
    data: [16,19,23,27,30,31,31,31,29,25,21,17,12,8,6,4,3,3,3,3,3,3,3,3,4,5,6,7,8,9,11,13],
  },
  {
    id: '32x32frenchhorn',
    name: 'French Horn',
    category: '32x32',
    len: 32,
    max: 31,
    data: [16,22,27,29,30,31,31,26,22,16,14,9,4,5,8,15,19,20,18,16,14,10,8,8,8,8,9,13,14,13,13,13],
  },
  {
    id: '32x32frenchhorn2',
    name: 'French Horn 2',
    category: '32x32',
    len: 32,
    max: 31,
    data: [29,31,29,27,24,22,18,11,2,0,2,4,8,13,16,17,18,17,16,13,8,4,2,0,2,11,18,22,24,27,29,31],
  },
  {
    id: '32x32glockenspiel',
    name: 'Glockenspiel',
    category: '32x32',
    len: 33,
    max: 31,
    data: [16,29,24,17,24,29,20,16,24,31,26,16,20,22,15,5,16,26,15,11,15,15,5,0,7,15,11,2,7,15,7,2,16],
  },
  {
    id: '32x32hardslap',
    name: 'Hard Slap',
    category: '32x32',
    len: 32,
    max: 31,
    data: [18,30,21,16,15,17,22,31,2,11,29,0,20,10,15,31,6,21,30,0,7,11,12,8,1,11,30,16,1,31,18,4],
  },
  {
    id: '32x32jazzguitar',
    name: 'Jazz Guitar',
    category: '32x32',
    len: 32,
    max: 31,
    data: [0,2,3,2,1,0,0,2,11,19,24,29,30,30,29,28,27,28,30,31,30,25,17,13,13,15,16,17,16,13,7,0],
  },
  {
    id: '32x32lead',
    name: 'Lead',
    category: '32x32',
    len: 32,
    max: 31,
    data: [31,23,18,14,11,9,7,5,4,3,2,1,1,0,0,0,0,0,0,1,1,2,3,4,5,7,9,11,14,18,23,31],
  },
  {
    id: '32x32lead2',
    name: 'Lead 2',
    category: '32x32',
    len: 32,
    max: 31,
    data: [11,20,26,30,31,31,30,22,12,0,1,1,1,17,16,16,16,16,30,31,30,0,5,8,18,20,21,22,20,19,15,11],
  },
  {
    id: '32x32mutetrumpet',
    name: 'Mute Trumpet',
    category: '32x32',
    len: 32,
    max: 31,
    data: [31,29,20,15,12,11,12,12,13,13,13,14,14,15,16,15,15,15,14,14,15,15,16,16,16,16,16,16,17,17,17,24],
  },
  {
    id: '32x32oboe',
    name: 'Oboe',
    category: '32x32',
    len: 32,
    max: 31,
    data: [21,31,14,0,1,8,14,18,20,22,22,22,21,20,18,17,15,13,12,11,10,9,9,10,12,15,20,27,31,30,13,1],
  },
  {
    id: '32x32octavelead',
    name: 'Octave Lead',
    category: '32x32',
    len: 32,
    max: 31,
    data: [6,11,15,19,23,27,29,31,13,14,15,16,17,18,18,0,3,6,9,12,14,16,17,18,0,0,0,0,0,0,0,0],
  },
  {
    id: '32x32octavesaw',
    name: 'Octave Saw',
    category: '32x32',
    len: 32,
    max: 31,
    data: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,0,2,4,6,8,10,12,14,16,18,20,22,24,26,28,30],
  },
  {
    id: '32x32organ',
    name: 'Organ',
    category: '32x32',
    len: 32,
    max: 31,
    data: [23,31,31,28,27,26,19,15,19,23,17,10,9,11,8,10,20,29,28,22,19,17,9,5,8,13,8,3,2,6,5,9],
  },
  {
    id: '32x32organ2',
    name: 'Organ 2',
    category: '32x32',
    len: 32,
    max: 31,
    data: [16,19,26,30,31,27,23,14,10,6,8,9,9,8,13,14,18,17,20,22,26,24,24,19,18,13,12,9,5,2,5,8],
  },
  {
    id: '32x32organ3',
    name: 'Organ 3',
    category: '32x32',
    len: 32,
    max: 31,
    data: [16,31,31,24,22,24,20,15,16,18,17,17,22,22,11,6,16,25,21,11,10,15,16,14,16,17,12,8,10,9,0,0],
  },
  {
    id: '32x32piano',
    name: 'Piano',
    category: '32x32',
    len: 32,
    max: 31,
    data: [18,30,31,29,31,30,30,31,31,31,31,26,10,2,2,6,14,14,10,8,5,3,1,9,17,15,8,2,4,7,10,13],
  },
  {
    id: '32x32piano2',
    name: 'Piano 2',
    category: '32x32',
    len: 32,
    max: 31,
    data: [14,27,31,31,31,31,28,22,21,24,31,29,16,7,5,8,15,22,26,26,21,8,0,4,10,11,6,2,0,1,0,2],
  },
  {
    id: '32x32reedorgan',
    name: 'Reed Organ',
    category: '32x32',
    len: 32,
    max: 31,
    data: [16,22,31,22,15,8,0,8,16,22,31,22,15,8,16,22,15,13,16,18,16,16,16,16,16,16,31,31,31,31,31,31],
  },
  {
    id: '32x32sam',
    name: 'SAM',
    category: '32x32',
    len: 32,
    max: 31,
    data: [5,10,15,10,10,15,15,26,31,31,31,26,21,15,10,10,10,10,15,21,26,26,26,26,21,26,21,21,10,5,0,0],
  },
  {
    id: '32x32saw2',
    name: 'Saw 2',
    category: '32x32',
    len: 32,
    max: 31,
    data: [15,31,30,25,23,20,19,17,17,16,15,15,15,14,14,14,14,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13],
  },
  {
    id: '32x32sax',
    name: 'Sax',
    category: '32x32',
    len: 32,
    max: 31,
    data: [0,16,22,27,29,31,29,27,22,16,9,5,2,0,2,5,9,16,24,29,31,29,24,16,7,2,0,2,7,16,31,16],
  },
  {
    id: '32x32strings',
    name: 'Strings',
    category: '32x32',
    len: 32,
    max: 31,
    data: [5,31,10,0,0,18,31,26,23,19,25,28,31,14,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  },
  {
    id: '32x32strings2',
    name: 'Strings 2',
    category: '32x32',
    len: 32,
    max: 31,
    data: [21,26,26,21,16,16,16,24,29,31,29,21,15,12,12,16,19,19,15,7,2,0,2,7,16,16,10,5,5,10,16,16],
  },
  {
    id: '32x32synthbass',
    name: 'Synth Bass',
    category: '32x32',
    len: 32,
    max: 31,
    data: [0,0,0,0,0,15,15,0,0,15,15,31,31,31,31,31,31,0,7,7,7,7,7,7,0,23,23,23,23,23,23,0],
  },
  {
    id: '32x32synthbell',
    name: 'Synth Bell',
    category: '32x32',
    len: 32,
    max: 31,
    data: [16,31,26,31,19,12,16,19,11,0,6,0,29,18,4,28,19,0,7,0,15,19,16,12,23,31,27,31,4,14,28,5],
  },
  {
    id: '32x32synthlead',
    name: 'Synth Lead',
    category: '32x32',
    len: 32,
    max: 31,
    data: [0,0,0,0,3,26,1,0,1,28,0,29,0,18,5,4,0,0,3,0,31,0,20,31,5,2,0,20,27,31,0,16],
  },
  {
    id: '32x32synthlead2',
    name: 'Synth Lead 2',
    category: '32x32',
    len: 32,
    max: 31,
    data: [16,16,15,0,16,31,31,31,16,16,15,0,15,15,15,0,0,0,0,15,0,0,15,15,15,15,0,0,0,15,0,0],
  },
  {
    id: '32x32synthpiano',
    name: 'Synth Piano',
    category: '32x32',
    len: 32,
    max: 31,
    data: [14,7,8,8,7,3,2,5,3,4,13,25,31,31,31,30,25,14,14,18,22,17,9,9,8,9,15,25,30,29,23,5],
  },
  {
    id: '32x32synthstrings',
    name: 'Synth Strings',
    category: '32x32',
    len: 32,
    max: 31,
    data: [17,26,31,31,27,22,17,14,13,16,21,28,31,25,8,1,16,31,24,7,0,5,11,17,19,18,15,10,4,1,1,7],
  },
  {
    id: '32x32trumpet',
    name: 'Trumpet',
    category: '32x32',
    len: 32,
    max: 31,
    data: [15,31,26,24,21,20,19,19,18,17,17,17,17,16,17,16,16,16,16,16,16,16,15,14,14,12,11,10,7,4,1,0],
  },
  {
    id: '32x32tuba',
    name: 'Tuba',
    category: '32x32',
    len: 32,
    max: 31,
    data: [19,28,31,30,26,22,19,17,16,15,14,14,15,15,15,16,17,17,18,18,18,18,18,17,16,14,11,8,4,1,0,7],
  },
  {
    id: '32x32vibraphone',
    name: 'Vibraphone',
    category: '32x32',
    len: 32,
    max: 31,
    data: [10,28,25,18,17,30,31,31,29,31,25,26,30,31,22,9,15,22,19,2,1,5,9,2,3,1,0,0,8,15,8,3],
  },
  {
    id: '32x32voice',
    name: 'Voice',
    category: '32x32',
    len: 32,
    max: 31,
    data: [16,25,28,31,28,25,12,8,8,13,19,29,31,29,24,19,9,8,3,2,1,1,0,1,0,0,2,1,5,5,8,14],
  },
  {
    id: '32x32voice2',
    name: 'Voice 2',
    category: '32x32',
    len: 32,
    max: 31,
    data: [0,6,8,17,19,21,21,19,16,12,10,12,20,26,29,30,29,21,13,0,1,1,2,2,16,31,30,30,28,16,8,2],
  },

  // ============ 128x256 Wavetables (8-bit, for Lynx/advanced chips) ============
  {
    id: '128x256bass',
    name: 'Bass',
    category: '128x256',
    len: 128,
    max: 255,
    data: [0,1,5,17,41,76,120,164,201,227,242,249,251,252,253,254,255,255,255,255,255,255,255,255,255,255,255,255,254,253,252,251,250,248,244,240,236,232,228,224,222,220,218,217,216,215,214,213,212,210,207,204,199,194,189,184,178,172,166,160,154,148,144,140,136,133,131,129,127,125,123,122,121,120,119,118,117,114,111,107,102,97,90,83,76,70,64,58,52,46,42,39,37,35,34,33,32,31,30,29,28,25,22,17,13,9,5,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  },
  {
    id: '128x256chime',
    name: 'Chime',
    category: '128x256',
    len: 128,
    max: 255,
    data: [128,154,184,203,201,192,190,187,181,176,172,167,164,161,160,161,165,174,188,210,235,252,255,254,253,253,252,250,249,248,246,245,244,244,246,248,252,255,251,233,210,212,223,224,225,230,233,235,237,239,240,240,239,236,230,217,192,151,110,101,118,122,123,130,136,140,144,148,151,151,150,145,136,118,91,55,23,13,20,25,24,28,33,35,38,41,44,44,44,41,35,26,13,2,2,12,9,5,5,4,2,1,1,0,0,0,0,0,1,3,9,25,57,92,95,80,77,76,69,64,61,57,54,52,52,53,58,67],
  },
  {
    id: '128x256lead',
    name: 'Lead',
    category: '128x256',
    len: 128,
    max: 255,
    data: [96,159,151,135,187,216,196,170,210,251,206,157,149,151,191,242,206,206,248,206,168,164,166,208,247,200,156,186,218,207,179,212,255,241,241,255,255,255,255,255,248,241,248,255,255,255,232,195,217,212,179,221,250,242,223,163,105,134,164,126,94,110,150,123,102,153,132,104,144,161,128,90,120,149,91,31,13,4,34,76,42,37,60,22,0,0,0,7,13,6,0,0,0,0,0,14,14,0,43,75,48,37,68,98,54,8,47,88,91,87,49,6,49,49,13,64,103,105,98,49,4,44,84,58,38,67,119,104],
  },
];

/**
 * Get wavetable preset by ID
 */
export function getFurnaceWavetable(id: string): FurnaceWavetablePreset | undefined {
  return FURNACE_WAVETABLE_PRESETS.find(p => p.id === id);
}

/**
 * Get all wavetables in a category
 */
export function getFurnaceWavetablesByCategory(category: '32x16' | '32x32' | '128x256'): FurnaceWavetablePreset[] {
  return FURNACE_WAVETABLE_PRESETS.filter(p => p.category === category);
}

/**
 * Convert Furnace wavetable to chip-compatible format
 * Scales data to fit target bit depth
 */
export function convertWavetableForChip(wave: FurnaceWavetablePreset, targetMax: number): number[] {
  if (wave.max === targetMax) return wave.data;
  const scale = targetMax / wave.max;
  return wave.data.map(v => Math.round(Math.max(0, Math.min(targetMax, v * scale))));
}

/**
 * Resample wavetable to target length using linear interpolation
 */
export function resampleWavetable(data: number[], targetLen: number): number[] {
  if (data.length === targetLen) return data;
  const result: number[] = [];
  const ratio = data.length / targetLen;
  for (let i = 0; i < targetLen; i++) {
    const srcPos = i * ratio;
    const srcIndex = Math.floor(srcPos);
    const frac = srcPos - srcIndex;
    const a = data[srcIndex];
    const b = data[(srcIndex + 1) % data.length];
    result.push(Math.round(a + (b - a) * frac));
  }
  return result;
}

/**
 * Get wavetable data ready for a specific chip type
 */
export function getWavetableForChip(
  wavetableId: string,
  chipType: 'gb' | 'pce' | 'n163' | 'scc' | 'swan' | 'vb' | 'lynx'
): number[] | null {
  const wave = getFurnaceWavetable(wavetableId);
  if (!wave) return null;

  // Chip-specific conversions
  switch (chipType) {
    case 'gb': // Game Boy: 32 samples, 4-bit (0-15)
      return convertWavetableForChip(wave, 15);

    case 'pce': // PC Engine: 32 samples, 5-bit (0-31)
    case 'vb': // Virtual Boy: 32 samples, 6-bit (0-63 but stored as 5-bit)
      return wave.max === 31 ? wave.data : convertWavetableForChip(wave, 31);

    case 'n163': // Namco 163: variable length, 4-bit (0-15)
    case 'swan': // WonderSwan: 32 samples, 4-bit (0-15)
      return convertWavetableForChip(wave, 15);

    case 'scc': // Konami SCC: 32 samples, 8-bit signed (-128 to 127)
      // Convert unsigned to signed
      const scaled = convertWavetableForChip(wave, 255);
      return scaled.map(v => v - 128);

    case 'lynx': // Atari Lynx: variable length, 8-bit (0-255)
      return convertWavetableForChip(wave, 255);

    default:
      return wave.data;
  }
}
