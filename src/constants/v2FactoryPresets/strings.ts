/** Strings presets */
import type { InstrumentPreset } from '@typedefs/instrument';

export const V2_STRINGS_PRESETS: InstrumentPreset['config'][] = [
  {
    "type": "synth",
    "name": "ST_JarreStrings",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 12,
        "color": 1,
        "level": 125
      },
      "osc2": {
        "mode": 2,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 61,
        "level": 34
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 125
      },
      "filter1": {
        "mode": 5,
        "cutoff": 74,
        "resonance": 42
      },
      "filter2": {
        "mode": 0,
        "cutoff": 64,
        "resonance": 0
      },
      "routing": {
        "mode": 0,
        "balance": 64
      },
      "envelope": {
        "attack": 26,
        "decay": 64,
        "sustain": 64,
        "release": 49
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 64,
        "release": 64
      },
      "lfo1": {
        "rate": 78,
        "depth": 2
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "ST_Awaych #000",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 0,
        "color": 0,
        "level": 126
      },
      "osc2": {
        "mode": 1,
        "ringMod": false,
        "transpose": 0,
        "detune": -11,
        "color": 0,
        "level": 126
      },
      "osc3": {
        "mode": 1,
        "ringMod": false,
        "transpose": 0,
        "detune": 12,
        "color": 0,
        "level": 126
      },
      "filter1": {
        "mode": 2,
        "cutoff": 86,
        "resonance": 70
      },
      "filter2": {
        "mode": 0,
        "cutoff": 64,
        "resonance": 0
      },
      "routing": {
        "mode": 0,
        "balance": 64
      },
      "envelope": {
        "attack": 86,
        "decay": 114,
        "sustain": 109,
        "release": 87
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 64,
        "release": 64
      },
      "lfo1": {
        "rate": 74,
        "depth": 23
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  }
];
