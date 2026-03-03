/** Brass presets */
import type { InstrumentPreset } from '@typedefs/instrument';

export const V2_BRASS_PRESETS: InstrumentPreset['config'][] = [
  {
    "type": "synth",
    "name": "BR_French HornZ",
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
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 126
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 126
      },
      "filter1": {
        "mode": 1,
        "cutoff": 31,
        "resonance": 50
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
        "attack": 10,
        "decay": 64,
        "sustain": 64,
        "release": 64
      },
      "envelope2": {
        "attack": 60,
        "decay": 64,
        "sustain": 126,
        "release": 64
      },
      "lfo1": {
        "rate": 64,
        "depth": 0
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "BR_Trombrato02",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 14,
        "color": 0,
        "level": 121
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": -15,
        "color": 0,
        "level": 82
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 12,
        "detune": 2,
        "color": 0,
        "level": 76
      },
      "filter1": {
        "mode": 1,
        "cutoff": 70,
        "resonance": 0
      },
      "filter2": {
        "mode": 1,
        "cutoff": 70,
        "resonance": 23
      },
      "routing": {
        "mode": 1,
        "balance": 64
      },
      "envelope": {
        "attack": 46,
        "decay": 64,
        "sustain": 121,
        "release": 20
      },
      "envelope2": {
        "attack": 94,
        "decay": 125,
        "sustain": 125,
        "release": 26
      },
      "lfo1": {
        "rate": 0,
        "depth": 17
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  }
];
