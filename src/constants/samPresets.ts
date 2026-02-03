import type { InstrumentConfig } from '@typedefs/instrument';

export const SAM_PRESETS: Omit<InstrumentConfig, 'id'>[] = [
  {
    type: 'synth',
    name: 'SAM_Classic',
    synthType: 'Sam',
    sam: {
      text: 'SAM IS BACK',
      pitch: 64,
      speed: 72,
      mouth: 128,
      throat: 128,
      singmode: false,
      phonetic: false
    },
    effects: [],
    volume: -10,
    pan: 0
  },
  {
    type: 'synth',
    name: 'SAM_C64',
    synthType: 'Sam',
    sam: {
      text: 'COMMODORE SIXTY FOUR',
      pitch: 64,
      speed: 64,
      mouth: 150,
      throat: 110,
      singmode: false,
      phonetic: false
    },
    effects: [],
    volume: -10,
    pan: 0
  },
  {
    type: 'synth',
    name: 'SAM_Robotic',
    synthType: 'Sam',
    sam: {
      text: 'EXTERMINATE',
      pitch: 40,
      speed: 80,
      mouth: 200,
      throat: 200,
      singmode: false,
      phonetic: false
    },
    effects: [],
    volume: -10,
    pan: 0
  },
  {
    type: 'synth',
    name: 'SAM_High',
    synthType: 'Sam',
    sam: {
      text: 'I HAVE A HIGH VOICE',
      pitch: 100,
      speed: 72,
      mouth: 128,
      throat: 128,
      singmode: false,
      phonetic: false
    },
    effects: [],
    volume: -10,
    pan: 0
  }
];
