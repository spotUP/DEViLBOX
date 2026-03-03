/** Effects presets */
import type { InstrumentPreset } from '@typedefs/instrument';

export const V2_EFFECTS_PRESETS: InstrumentPreset['config'][] = [
  {
    "type": "synth",
    "name": "FX_Morseh #000",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 3,
        "transpose": 0,
        "detune": 0,
        "color": 64,
        "level": 126
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": -6,
        "detune": 0,
        "color": 62,
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
        "cutoff": 126,
        "resonance": 0
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
        "attack": 0,
        "decay": 64,
        "sustain": 64,
        "release": 64
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 64,
        "release": 64
      },
      "lfo1": {
        "rate": 94,
        "depth": 108
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "FX_Marsian Pan Flute",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 2,
        "transpose": 0,
        "detune": 28,
        "color": 64,
        "level": 126
      },
      "osc2": {
        "mode": 2,
        "ringMod": false,
        "transpose": 0,
        "detune": -27,
        "color": 64,
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
        "mode": 2,
        "cutoff": 18,
        "resonance": 118
      },
      "filter2": {
        "mode": 1,
        "cutoff": 100,
        "resonance": 70
      },
      "routing": {
        "mode": 1,
        "balance": 64
      },
      "envelope": {
        "attack": 0,
        "decay": 64,
        "sustain": 64,
        "release": 64
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 64,
        "release": 64
      },
      "lfo1": {
        "rate": 37,
        "depth": 126
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "FX_Electrons68",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 3,
        "transpose": 0,
        "detune": 0,
        "color": 0,
        "level": 125
      },
      "osc2": {
        "mode": 1,
        "ringMod": true,
        "transpose": 0,
        "detune": -19,
        "color": 32,
        "level": 125
      },
      "osc3": {
        "mode": 3,
        "ringMod": true,
        "transpose": 31,
        "detune": 0,
        "color": 114,
        "level": 125
      },
      "filter1": {
        "mode": 2,
        "cutoff": 67,
        "resonance": 95
      },
      "filter2": {
        "mode": 3,
        "cutoff": 60,
        "resonance": 89
      },
      "routing": {
        "mode": 1,
        "balance": 64
      },
      "envelope": {
        "attack": 10,
        "decay": 64,
        "sustain": 64,
        "release": 64
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 64,
        "release": 64
      },
      "lfo1": {
        "rate": 91,
        "depth": 125
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "FX_Powerbeam15",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 3,
        "transpose": -45,
        "detune": 0,
        "color": 0,
        "level": 124
      },
      "osc2": {
        "mode": 3,
        "ringMod": true,
        "transpose": -38,
        "detune": 0,
        "color": 32,
        "level": 124
      },
      "osc3": {
        "mode": 5,
        "ringMod": false,
        "transpose": -2,
        "detune": 0,
        "color": 67,
        "level": 124
      },
      "filter1": {
        "mode": 1,
        "cutoff": 124,
        "resonance": 0
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
        "attack": 0,
        "decay": 125,
        "sustain": 0,
        "release": 2
      },
      "envelope2": {
        "attack": 0,
        "decay": 125,
        "sustain": 0,
        "release": 0
      },
      "lfo1": {
        "rate": 94,
        "depth": 125
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "FX_Rave Siren",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 2,
        "transpose": 8,
        "detune": 4,
        "color": 69,
        "level": 126
      },
      "osc2": {
        "mode": 2,
        "ringMod": false,
        "transpose": 8,
        "detune": 0,
        "color": 53,
        "level": 107
      },
      "osc3": {
        "mode": 2,
        "ringMod": false,
        "transpose": -4,
        "detune": 5,
        "color": 69,
        "level": 126
      },
      "filter1": {
        "mode": 3,
        "cutoff": 58,
        "resonance": 95
      },
      "filter2": {
        "mode": 2,
        "cutoff": 100,
        "resonance": 90
      },
      "routing": {
        "mode": 1,
        "balance": 64
      },
      "envelope": {
        "attack": 0,
        "decay": 13,
        "sustain": 28,
        "release": 86
      },
      "envelope2": {
        "attack": 0,
        "decay": 72,
        "sustain": 58,
        "release": 73
      },
      "lfo1": {
        "rate": 104,
        "depth": 0
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "FX_Random Zaps",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 3,
        "transpose": 0,
        "detune": 0,
        "color": 64,
        "level": 126
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": 24,
        "detune": 0,
        "color": 64,
        "level": 0
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 44,
        "detune": 0,
        "color": 53,
        "level": 126
      },
      "filter1": {
        "mode": 3,
        "cutoff": 80,
        "resonance": 51
      },
      "filter2": {
        "mode": 1,
        "cutoff": 93,
        "resonance": 0
      },
      "routing": {
        "mode": 1,
        "balance": 64
      },
      "envelope": {
        "attack": 0,
        "decay": 0,
        "sustain": 126,
        "release": 0
      },
      "envelope2": {
        "attack": 0,
        "decay": 0,
        "sustain": 46,
        "release": 3
      },
      "lfo1": {
        "rate": 22,
        "depth": 126
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "FX_Tag You're Its",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 3,
        "transpose": -6,
        "detune": 0,
        "color": 60,
        "level": 126
      },
      "osc2": {
        "mode": 4,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 61,
        "level": 126
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 0,
        "level": 126
      },
      "filter1": {
        "mode": 5,
        "cutoff": 106,
        "resonance": 126
      },
      "filter2": {
        "mode": 3,
        "cutoff": 95,
        "resonance": 126
      },
      "routing": {
        "mode": 2,
        "balance": 64
      },
      "envelope": {
        "attack": 0,
        "decay": 0,
        "sustain": 126,
        "release": 10
      },
      "envelope2": {
        "attack": 0,
        "decay": 35,
        "sustain": 64,
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
    "name": "FX_Whistling Wind",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 4,
        "transpose": 31,
        "detune": 0,
        "color": 61,
        "level": 126
      },
      "osc2": {
        "mode": 4,
        "ringMod": false,
        "transpose": -10,
        "detune": -13,
        "color": 23,
        "level": 126
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 24,
        "detune": -5,
        "color": 96,
        "level": 126
      },
      "filter1": {
        "mode": 4,
        "cutoff": 62,
        "resonance": 40
      },
      "filter2": {
        "mode": 1,
        "cutoff": 80,
        "resonance": 53
      },
      "routing": {
        "mode": 1,
        "balance": 64
      },
      "envelope": {
        "attack": 46,
        "decay": 78,
        "sustain": 126,
        "release": 66
      },
      "envelope2": {
        "attack": 0,
        "decay": 0,
        "sustain": 11,
        "release": 4
      },
      "lfo1": {
        "rate": 5,
        "depth": 126
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "FX_XPlosion007",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 4,
        "transpose": 0,
        "detune": 0,
        "color": 0,
        "level": 126
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": -46,
        "detune": 0,
        "color": 65,
        "level": 126
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": -11,
        "detune": 0,
        "color": 32,
        "level": 14
      },
      "filter1": {
        "mode": 1,
        "cutoff": 92,
        "resonance": 0
      },
      "filter2": {
        "mode": 1,
        "cutoff": 25,
        "resonance": 10
      },
      "routing": {
        "mode": 1,
        "balance": 64
      },
      "envelope": {
        "attack": 0,
        "decay": 96,
        "sustain": 0,
        "release": 96
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 64,
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
    "name": "FX_Hell's Bell",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 3,
        "transpose": -2,
        "detune": 0,
        "color": 91,
        "level": 28
      },
      "osc2": {
        "mode": 5,
        "ringMod": false,
        "transpose": 23,
        "detune": 50,
        "color": 30,
        "level": 126
      },
      "osc3": {
        "mode": 3,
        "ringMod": true,
        "transpose": -64,
        "detune": 0,
        "color": 102,
        "level": 24
      },
      "filter1": {
        "mode": 1,
        "cutoff": 80,
        "resonance": 106
      },
      "filter2": {
        "mode": 3,
        "cutoff": 37,
        "resonance": 77
      },
      "routing": {
        "mode": 1,
        "balance": 64
      },
      "envelope": {
        "attack": 0,
        "decay": 65,
        "sustain": 126,
        "release": 77
      },
      "envelope2": {
        "attack": 0,
        "decay": 46,
        "sustain": 15,
        "release": 13
      },
      "lfo1": {
        "rate": 28,
        "depth": 52
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  }
];
