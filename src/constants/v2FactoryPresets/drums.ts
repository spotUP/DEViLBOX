/** Drums presets */
import type { InstrumentPreset } from '@typedefs/instrument';

export const V2_DRUMS_PRESETS: InstrumentPreset['config'][] = [
  {
    "type": "synth",
    "name": "DR_Dry BD #001",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 3,
        "transpose": 0,
        "detune": 0,
        "color": 22,
        "level": 122
      },
      "osc2": {
        "mode": 3,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 122
      },
      "osc3": {
        "mode": 4,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 0
      },
      "filter1": {
        "mode": 1,
        "cutoff": 122,
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
        "decay": 61,
        "sustain": 5,
        "release": 45
      },
      "envelope2": {
        "attack": 0,
        "decay": 35,
        "sustain": 0,
        "release": 33
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
    "name": "DR_808 SD #001",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 3,
        "transpose": 8,
        "detune": 0,
        "color": 0,
        "level": 126
      },
      "osc2": {
        "mode": 3,
        "ringMod": false,
        "transpose": 20,
        "detune": 0,
        "color": 32,
        "level": 73
      },
      "osc3": {
        "mode": 4,
        "ringMod": false,
        "transpose": 48,
        "detune": 0,
        "color": 51,
        "level": 126
      },
      "filter1": {
        "mode": 0,
        "cutoff": 66,
        "resonance": 107
      },
      "filter2": {
        "mode": 0,
        "cutoff": 54,
        "resonance": 106
      },
      "routing": {
        "mode": 2,
        "balance": 64
      },
      "envelope": {
        "attack": 0,
        "decay": 35,
        "sustain": 0,
        "release": 29
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
    "name": "DR_70s Woodblock",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 3,
        "transpose": 12,
        "detune": 0,
        "color": 32,
        "level": 125
      },
      "osc2": {
        "mode": 3,
        "ringMod": false,
        "transpose": 12,
        "detune": 21,
        "color": 32,
        "level": 125
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
        "mode": 0,
        "cutoff": 125,
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
        "decay": 21,
        "sustain": 0,
        "release": 25
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
    "name": "DR_808 Ridesecken",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 2,
        "transpose": -4,
        "detune": 0,
        "color": 64,
        "level": 126
      },
      "osc2": {
        "mode": 2,
        "ringMod": false,
        "transpose": 4,
        "detune": 0,
        "color": 64,
        "level": 126
      },
      "osc3": {
        "mode": 4,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 126
      },
      "filter1": {
        "mode": 3,
        "cutoff": 126,
        "resonance": 0
      },
      "filter2": {
        "mode": 2,
        "cutoff": 104,
        "resonance": 95
      },
      "routing": {
        "mode": 1,
        "balance": 64
      },
      "envelope": {
        "attack": 0,
        "decay": 26,
        "sustain": 57,
        "release": 100
      },
      "envelope2": {
        "attack": 0,
        "decay": 90,
        "sustain": 0,
        "release": 95
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
    "name": "DR_Industrial VeloHammer",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 4,
        "transpose": 0,
        "detune": 0,
        "color": 15,
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
        "mode": 2,
        "cutoff": 61,
        "resonance": 113
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
        "decay": 55,
        "sustain": 0,
        "release": 64
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
    "name": "DR_Biiiig Drumdamm",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 3,
        "transpose": 0,
        "detune": 0,
        "color": 0,
        "level": 126
      },
      "osc2": {
        "mode": 3,
        "ringMod": false,
        "transpose": 0,
        "detune": 9,
        "color": 32,
        "level": 126
      },
      "osc3": {
        "mode": 4,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 0,
        "level": 0
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
        "release": 81
      },
      "envelope2": {
        "attack": 0,
        "decay": 57,
        "sustain": 0,
        "release": 52
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
    "name": "DR_Airy HH003",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 4,
        "transpose": 35,
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
        "mode": 3,
        "cutoff": 115,
        "resonance": 8
      },
      "filter2": {
        "mode": 1,
        "cutoff": 116,
        "resonance": 24
      },
      "routing": {
        "mode": 1,
        "balance": 64
      },
      "envelope": {
        "attack": 0,
        "decay": 55,
        "sustain": 24,
        "release": 37
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 64,
        "release": 64
      },
      "lfo1": {
        "rate": 97,
        "depth": 0
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "DR_HighSnare02",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 3,
        "transpose": 3,
        "detune": 0,
        "color": 0,
        "level": 68
      },
      "osc2": {
        "mode": 3,
        "ringMod": false,
        "transpose": 10,
        "detune": 0,
        "color": 32,
        "level": 64
      },
      "osc3": {
        "mode": 4,
        "ringMod": false,
        "transpose": 44,
        "detune": 0,
        "color": 23,
        "level": 0
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
        "decay": 51,
        "sustain": 0,
        "release": 30
      },
      "envelope2": {
        "attack": 0,
        "decay": 107,
        "sustain": 0,
        "release": 64
      },
      "lfo1": {
        "rate": 93,
        "depth": 25
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "DR_808 BD 2000",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 3,
        "transpose": -3,
        "detune": 0,
        "color": 0,
        "level": 126
      },
      "osc2": {
        "mode": 3,
        "ringMod": false,
        "transpose": -3,
        "detune": 0,
        "color": 96,
        "level": 126
      },
      "osc3": {
        "mode": 4,
        "ringMod": false,
        "transpose": 21,
        "detune": 0,
        "color": 36,
        "level": 0
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
        "decay": 69,
        "sustain": 0,
        "release": 55
      },
      "envelope2": {
        "attack": 0,
        "decay": 32,
        "sustain": 0,
        "release": 31
      },
      "lfo1": {
        "rate": 126,
        "depth": 126
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "DR_Big Dist Kick",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 3,
        "transpose": -2,
        "detune": 0,
        "color": 0,
        "level": 126
      },
      "osc2": {
        "mode": 3,
        "ringMod": false,
        "transpose": -2,
        "detune": 0,
        "color": 9,
        "level": 126
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 17,
        "detune": 0,
        "color": 73,
        "level": 40
      },
      "filter1": {
        "mode": 1,
        "cutoff": 65,
        "resonance": 98
      },
      "filter2": {
        "mode": 3,
        "cutoff": 0,
        "resonance": 73
      },
      "routing": {
        "mode": 1,
        "balance": 64
      },
      "envelope": {
        "attack": 0,
        "decay": 5,
        "sustain": 126,
        "release": 3
      },
      "envelope2": {
        "attack": 0,
        "decay": 50,
        "sustain": 35,
        "release": 13
      },
      "lfo1": {
        "rate": 126,
        "depth": 126
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "DR_808 Rim#003",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 3,
        "transpose": 8,
        "detune": 0,
        "color": 6,
        "level": 126
      },
      "osc2": {
        "mode": 3,
        "ringMod": false,
        "transpose": 20,
        "detune": 0,
        "color": 32,
        "level": 126
      },
      "osc3": {
        "mode": 4,
        "ringMod": false,
        "transpose": 38,
        "detune": 0,
        "color": 0,
        "level": 121
      },
      "filter1": {
        "mode": 0,
        "cutoff": 73,
        "resonance": 117
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
        "decay": 11,
        "sustain": 0,
        "release": 0
      },
      "envelope2": {
        "attack": 0,
        "decay": 6,
        "sustain": 0,
        "release": 0
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
    "name": "DR_Noiseh #004",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 4,
        "transpose": 5,
        "detune": 0,
        "color": 0,
        "level": 126
      },
      "osc2": {
        "mode": 4,
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
        "mode": 2,
        "cutoff": 67,
        "resonance": 83
      },
      "filter2": {
        "mode": 2,
        "cutoff": 86,
        "resonance": 66
      },
      "routing": {
        "mode": 0,
        "balance": 64
      },
      "envelope": {
        "attack": 0,
        "decay": 64,
        "sustain": 113,
        "release": 26
      },
      "envelope2": {
        "attack": 0,
        "decay": 25,
        "sustain": 20,
        "release": 121
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
    "name": "DR_FlangeHats2",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 2,
        "transpose": -9,
        "detune": 0,
        "color": 113,
        "level": 39
      },
      "osc2": {
        "mode": 2,
        "ringMod": false,
        "transpose": -7,
        "detune": 14,
        "color": 25,
        "level": 47
      },
      "osc3": {
        "mode": 4,
        "ringMod": false,
        "transpose": 44,
        "detune": 0,
        "color": 82,
        "level": 126
      },
      "filter1": {
        "mode": 3,
        "cutoff": 102,
        "resonance": 106
      },
      "filter2": {
        "mode": 3,
        "cutoff": 126,
        "resonance": 0
      },
      "routing": {
        "mode": 1,
        "balance": 64
      },
      "envelope": {
        "attack": 0,
        "decay": 27,
        "sustain": 0,
        "release": 44
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
    "name": "DR_Big Kick075",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 3,
        "transpose": -2,
        "detune": 0,
        "color": 0,
        "level": 126
      },
      "osc2": {
        "mode": 3,
        "ringMod": false,
        "transpose": -2,
        "detune": 0,
        "color": 9,
        "level": 126
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 17,
        "detune": 0,
        "color": 73,
        "level": 40
      },
      "filter1": {
        "mode": 1,
        "cutoff": 65,
        "resonance": 98
      },
      "filter2": {
        "mode": 3,
        "cutoff": 0,
        "resonance": 73
      },
      "routing": {
        "mode": 1,
        "balance": 64
      },
      "envelope": {
        "attack": 0,
        "decay": 5,
        "sustain": 126,
        "release": 3
      },
      "envelope2": {
        "attack": 0,
        "decay": 50,
        "sustain": 35,
        "release": 13
      },
      "lfo1": {
        "rate": 126,
        "depth": 126
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "DR_70s Snaree",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 3,
        "transpose": 0,
        "detune": 0,
        "color": 0,
        "level": 124
      },
      "osc2": {
        "mode": 4,
        "ringMod": false,
        "transpose": 25,
        "detune": 0,
        "color": 102,
        "level": 108
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 124
      },
      "filter1": {
        "mode": 0,
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
        "decay": 39,
        "sustain": 0,
        "release": 0
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
    "name": "DR_808 HHs 104",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 2,
        "transpose": 4,
        "detune": 0,
        "color": 64,
        "level": 126
      },
      "osc2": {
        "mode": 2,
        "ringMod": false,
        "transpose": 10,
        "detune": 0,
        "color": 64,
        "level": 126
      },
      "osc3": {
        "mode": 4,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 24,
        "level": 126
      },
      "filter1": {
        "mode": 3,
        "cutoff": 126,
        "resonance": 0
      },
      "filter2": {
        "mode": 3,
        "cutoff": 104,
        "resonance": 94
      },
      "routing": {
        "mode": 1,
        "balance": 64
      },
      "envelope": {
        "attack": 0,
        "decay": 0,
        "sustain": 0,
        "release": 0
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
    "name": "DR_Hefty Snare",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 3,
        "transpose": -54,
        "detune": 3,
        "color": 70,
        "level": 126
      },
      "osc2": {
        "mode": 4,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 126
      },
      "osc3": {
        "mode": 4,
        "ringMod": false,
        "transpose": 62,
        "detune": 0,
        "color": 65,
        "level": 126
      },
      "filter1": {
        "mode": 1,
        "cutoff": 122,
        "resonance": 11
      },
      "filter2": {
        "mode": 3,
        "cutoff": 41,
        "resonance": 42
      },
      "routing": {
        "mode": 1,
        "balance": 64
      },
      "envelope": {
        "attack": 0,
        "decay": 98,
        "sustain": 126,
        "release": 47
      },
      "envelope2": {
        "attack": 0,
        "decay": 54,
        "sustain": 0,
        "release": 0
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
    "name": "DR_70s Synth Kick",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": -3,
        "detune": 0,
        "color": 61,
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
        "mode": 0,
        "cutoff": 27,
        "resonance": 56
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
        "decay": 51,
        "sustain": 0,
        "release": 30
      },
      "envelope2": {
        "attack": 0,
        "decay": 34,
        "sustain": 0,
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
    "name": "DR_808 Hihats 2",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 2,
        "transpose": -10,
        "detune": 0,
        "color": 64,
        "level": 126
      },
      "osc2": {
        "mode": 2,
        "ringMod": false,
        "transpose": 8,
        "detune": 0,
        "color": 64,
        "level": 126
      },
      "osc3": {
        "mode": 4,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 126
      },
      "filter1": {
        "mode": 3,
        "cutoff": 126,
        "resonance": 91
      },
      "filter2": {
        "mode": 2,
        "cutoff": 108,
        "resonance": 94
      },
      "routing": {
        "mode": 1,
        "balance": 64
      },
      "envelope": {
        "attack": 0,
        "decay": 0,
        "sustain": 0,
        "release": 9
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
    "name": "DR_808 BD 1001",
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
        "cutoff": 26,
        "resonance": 126
      },
      "filter2": {
        "mode": 2,
        "cutoff": 25,
        "resonance": 126
      },
      "routing": {
        "mode": 1,
        "balance": 64
      },
      "envelope": {
        "attack": 0,
        "decay": 61,
        "sustain": 0,
        "release": 45
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
    "name": "DR_DistKick 13",
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
        "mode": 3,
        "ringMod": false,
        "transpose": 0,
        "detune": 7,
        "color": 32,
        "level": 125
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
        "mode": 1,
        "cutoff": 125,
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
        "release": 60
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 64,
        "release": 64
      },
      "lfo1": {
        "rate": 76,
        "depth": 104
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "DR_DistKick 28",
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
        "mode": 3,
        "ringMod": false,
        "transpose": 0,
        "detune": 9,
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
        "decay": 70,
        "sustain": 0,
        "release": 92
      },
      "envelope2": {
        "attack": 0,
        "decay": 37,
        "sustain": 0,
        "release": 40
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
    "name": "DR_DistSnare11",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 3,
        "transpose": 8,
        "detune": 0,
        "color": 32,
        "level": 0
      },
      "osc2": {
        "mode": 3,
        "ringMod": false,
        "transpose": 8,
        "detune": 36,
        "color": 32,
        "level": 0
      },
      "osc3": {
        "mode": 4,
        "ringMod": false,
        "transpose": 35,
        "detune": 0,
        "color": 70,
        "level": 124
      },
      "filter1": {
        "mode": 5,
        "cutoff": 73,
        "resonance": 115
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
        "decay": 56,
        "sustain": 0,
        "release": 65
      },
      "envelope2": {
        "attack": 0,
        "decay": 15,
        "sustain": 0,
        "release": 0
      },
      "lfo1": {
        "rate": 64,
        "depth": 105
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "DR_Flanged 808 Ride",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 2,
        "transpose": 0,
        "detune": 0,
        "color": 63,
        "level": 14
      },
      "osc2": {
        "mode": 2,
        "ringMod": false,
        "transpose": 10,
        "detune": 0,
        "color": 64,
        "level": 18
      },
      "osc3": {
        "mode": 4,
        "ringMod": false,
        "transpose": 50,
        "detune": 0,
        "color": 66,
        "level": 123
      },
      "filter1": {
        "mode": 3,
        "cutoff": 124,
        "resonance": 0
      },
      "filter2": {
        "mode": 2,
        "cutoff": 104,
        "resonance": 100
      },
      "routing": {
        "mode": 1,
        "balance": 64
      },
      "envelope": {
        "attack": 0,
        "decay": 54,
        "sustain": 0,
        "release": 75
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 123,
        "release": 80
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
    "name": "DR_Flanged 808 HHs + Dis",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 2,
        "transpose": -9,
        "detune": 0,
        "color": 113,
        "level": 39
      },
      "osc2": {
        "mode": 2,
        "ringMod": false,
        "transpose": -7,
        "detune": 14,
        "color": 25,
        "level": 47
      },
      "osc3": {
        "mode": 4,
        "ringMod": false,
        "transpose": 44,
        "detune": 0,
        "color": 82,
        "level": 126
      },
      "filter1": {
        "mode": 3,
        "cutoff": 102,
        "resonance": 106
      },
      "filter2": {
        "mode": 3,
        "cutoff": 126,
        "resonance": 0
      },
      "routing": {
        "mode": 1,
        "balance": 64
      },
      "envelope": {
        "attack": 0,
        "decay": 27,
        "sustain": 0,
        "release": 44
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
    "name": "DR_Kick 1 #000",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 3,
        "transpose": -7,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "osc2": {
        "mode": 3,
        "ringMod": false,
        "transpose": -7,
        "detune": 9,
        "color": 32,
        "level": 127
      },
      "osc3": {
        "mode": 4,
        "ringMod": false,
        "transpose": 29,
        "detune": 0,
        "color": 64,
        "level": 0
      },
      "filter1": {
        "mode": 0,
        "cutoff": 127,
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
        "decay": 47,
        "sustain": 0,
        "release": 43
      },
      "envelope2": {
        "attack": 0,
        "decay": 46,
        "sustain": 1,
        "release": 75
      },
      "lfo1": {
        "rate": 90,
        "depth": 107
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "DR_Kick 2000",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 3,
        "transpose": 4,
        "detune": -64,
        "color": 0,
        "level": 126
      },
      "osc2": {
        "mode": 4,
        "ringMod": false,
        "transpose": -1,
        "detune": -13,
        "color": 32,
        "level": 91
      },
      "osc3": {
        "mode": 4,
        "ringMod": false,
        "transpose": -11,
        "detune": 44,
        "color": 0,
        "level": 34
      },
      "filter1": {
        "mode": 1,
        "cutoff": 68,
        "resonance": 0
      },
      "filter2": {
        "mode": 2,
        "cutoff": 84,
        "resonance": 63
      },
      "routing": {
        "mode": 2,
        "balance": 15
      },
      "envelope": {
        "attack": 0,
        "decay": 0,
        "sustain": 65,
        "release": 64
      },
      "envelope2": {
        "attack": 0,
        "decay": 63,
        "sustain": 99,
        "release": 76
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
    "name": "DR_March Snare",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 3,
        "transpose": 0,
        "detune": 6,
        "color": 0,
        "level": 126
      },
      "osc2": {
        "mode": 3,
        "ringMod": false,
        "transpose": 12,
        "detune": 1,
        "color": 32,
        "level": 73
      },
      "osc3": {
        "mode": 4,
        "ringMod": false,
        "transpose": 48,
        "detune": 0,
        "color": 51,
        "level": 126
      },
      "filter1": {
        "mode": 0,
        "cutoff": 66,
        "resonance": 107
      },
      "filter2": {
        "mode": 0,
        "cutoff": 54,
        "resonance": 106
      },
      "routing": {
        "mode": 2,
        "balance": 64
      },
      "envelope": {
        "attack": 0,
        "decay": 35,
        "sustain": 0,
        "release": 29
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
    "name": "DR_Nice Synth HH",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 4,
        "transpose": 53,
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
        "mode": 3,
        "cutoff": 121,
        "resonance": 121
      },
      "filter2": {
        "mode": 1,
        "cutoff": 117,
        "resonance": 114
      },
      "routing": {
        "mode": 2,
        "balance": 64
      },
      "envelope": {
        "attack": 0,
        "decay": 20,
        "sustain": 20,
        "release": 8
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
    "name": "DR_Noisy Crash",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 4,
        "transpose": 62,
        "detune": 62,
        "color": 106,
        "level": 126
      },
      "osc2": {
        "mode": 4,
        "ringMod": false,
        "transpose": 62,
        "detune": 50,
        "color": 51,
        "level": 126
      },
      "osc3": {
        "mode": 4,
        "ringMod": false,
        "transpose": 62,
        "detune": 26,
        "color": 108,
        "level": 126
      },
      "filter1": {
        "mode": 3,
        "cutoff": 126,
        "resonance": 55
      },
      "filter2": {
        "mode": 1,
        "cutoff": 126,
        "resonance": 0
      },
      "routing": {
        "mode": 1,
        "balance": 64
      },
      "envelope": {
        "attack": 0,
        "decay": 47,
        "sustain": 21,
        "release": 77
      },
      "envelope2": {
        "attack": 0,
        "decay": 113,
        "sustain": 70,
        "release": 124
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
    "name": "DR_Noisy Open HH",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 4,
        "transpose": 36,
        "detune": 0,
        "color": 82,
        "level": 126
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": 9,
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
        "mode": 3,
        "cutoff": 112,
        "resonance": 106
      },
      "filter2": {
        "mode": 0,
        "cutoff": 104,
        "resonance": 0
      },
      "routing": {
        "mode": 0,
        "balance": 64
      },
      "envelope": {
        "attack": 0,
        "decay": 44,
        "sustain": 0,
        "release": 32
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
    "name": "DR_Pop BD #003",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 3,
        "transpose": 0,
        "detune": 0,
        "color": 0,
        "level": 121
      },
      "osc2": {
        "mode": 3,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 122
      },
      "osc3": {
        "mode": 4,
        "ringMod": false,
        "transpose": 36,
        "detune": 0,
        "color": 90,
        "level": 0
      },
      "filter1": {
        "mode": 1,
        "cutoff": 121,
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
        "decay": 61,
        "sustain": 0,
        "release": 52
      },
      "envelope2": {
        "attack": 0,
        "decay": 23,
        "sustain": 0,
        "release": 0
      },
      "lfo1": {
        "rate": 80,
        "depth": 84
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "DR_Snappy Snare",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": -10,
        "detune": 0,
        "color": 72,
        "level": 126
      },
      "osc2": {
        "mode": 5,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 64,
        "level": 38
      },
      "osc3": {
        "mode": 4,
        "ringMod": false,
        "transpose": 33,
        "detune": 0,
        "color": 76,
        "level": 126
      },
      "filter1": {
        "mode": 3,
        "cutoff": 53,
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
        "decay": 45,
        "sustain": 0,
        "release": 19
      },
      "envelope2": {
        "attack": 0,
        "decay": 18,
        "sustain": 0,
        "release": 0
      },
      "lfo1": {
        "rate": 105,
        "depth": 11
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "DR_Ver|bt Snare",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 4,
        "transpose": 0,
        "detune": 0,
        "color": 60,
        "level": 126
      },
      "osc2": {
        "mode": 3,
        "ringMod": false,
        "transpose": 0,
        "detune": -21,
        "color": 126,
        "level": 88
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
        "cutoff": 82,
        "resonance": 126
      },
      "filter2": {
        "mode": 1,
        "cutoff": 22,
        "resonance": 126
      },
      "routing": {
        "mode": 2,
        "balance": 17
      },
      "envelope": {
        "attack": 0,
        "decay": 0,
        "sustain": 126,
        "release": 14
      },
      "envelope2": {
        "attack": 0,
        "decay": 83,
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
  }
];
