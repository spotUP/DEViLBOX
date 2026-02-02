/**
 * V2 Factory Presets
 * Extracted from Farbrausch V2 presets.v2b
 */
import type { InstrumentConfig } from '@typedefs/instrument';

export const V2_FACTORY_PRESETS: Omit<InstrumentConfig, 'id'>[] = [
  {
    "type": "synth",
    "name": "SP_TheProduct",
    "synthType": "V2",
    "v2Speech": {
      "text": "!DHAX_ !prAA_dAHkt",
      "speed": 64,
      "pitch": 40,
      "formantShift": 64
    },
    "effects": [],
    "volume": -10,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "SP_Demoscene",
    "synthType": "V2",
    "v2Speech": {
      "text": "!dEH_mOW_sIYn",
      "speed": 64,
      "pitch": 64,
      "formantShift": 64
    },
    "effects": [],
    "volume": -10,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "KY_Rhodesano0",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 3,
        "transpose": 0,
        "detune": 0,
        "color": 0,
        "level": 0
      },
      "osc2": {
        "mode": 5,
        "ringMod": false,
        "transpose": 0,
        "detune": 9,
        "color": 0,
        "level": 122
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 31,
        "detune": 29,
        "color": 72,
        "level": 0
      },
      "filter1": {
        "mode": 1,
        "cutoff": 99,
        "resonance": 0
      },
      "filter2": {
        "mode": 0,
        "cutoff": 94,
        "resonance": 99
      },
      "routing": {
        "mode": 1,
        "balance": 64
      },
      "envelope": {
        "attack": 13,
        "decay": 104,
        "sustain": 0,
        "release": 44
      },
      "envelope2": {
        "attack": 4,
        "decay": 93,
        "sustain": 0,
        "release": 64
      },
      "lfo1": {
        "rate": 74,
        "depth": 75
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "BA_AnaBass#005",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 12,
        "detune": 7,
        "color": 0,
        "level": 125
      },
      "osc2": {
        "mode": 2,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 64,
        "level": 125
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": -12,
        "detune": 0,
        "color": 0,
        "level": 125
      },
      "filter1": {
        "mode": 1,
        "cutoff": 52,
        "resonance": 91
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
        "release": 22
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
    "name": "LD_Transortion",
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
        "cutoff": 63,
        "resonance": 95
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
        "attack": 90,
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
    "name": "PA_Long Pad007",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 16,
        "color": 0,
        "level": 126
      },
      "osc2": {
        "mode": 1,
        "ringMod": false,
        "transpose": 0,
        "detune": -8,
        "color": 64,
        "level": 126
      },
      "osc3": {
        "mode": 1,
        "ringMod": false,
        "transpose": -12,
        "detune": 0,
        "color": 32,
        "level": 126
      },
      "filter1": {
        "mode": 4,
        "cutoff": 39,
        "resonance": 0
      },
      "filter2": {
        "mode": 1,
        "cutoff": 35,
        "resonance": 69
      },
      "routing": {
        "mode": 1,
        "balance": 64
      },
      "envelope": {
        "attack": 71,
        "decay": 94,
        "sustain": 96,
        "release": 106
      },
      "envelope2": {
        "attack": 114,
        "decay": 120,
        "sustain": 113,
        "release": 112
      },
      "lfo1": {
        "rate": 7,
        "depth": 126
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  },
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
    "name": "SY_His Shadow's Breath",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": -10,
        "color": 4,
        "level": 122
      },
      "osc2": {
        "mode": 4,
        "ringMod": false,
        "transpose": 45,
        "detune": 0,
        "color": 41,
        "level": 77
      },
      "osc3": {
        "mode": 1,
        "ringMod": false,
        "transpose": 12,
        "detune": 16,
        "color": 3,
        "level": 122
      },
      "filter1": {
        "mode": 5,
        "cutoff": 67,
        "resonance": 97
      },
      "filter2": {
        "mode": 2,
        "cutoff": 76,
        "resonance": 120
      },
      "routing": {
        "mode": 2,
        "balance": 64
      },
      "envelope": {
        "attack": 27,
        "decay": 64,
        "sustain": 122,
        "release": 30
      },
      "envelope2": {
        "attack": 0,
        "decay": 102,
        "sustain": 0,
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
    "name": "BA_Deepness001",
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
        "detune": 14,
        "color": 0,
        "level": 126
      },
      "osc3": {
        "mode": 1,
        "ringMod": false,
        "transpose": 0,
        "detune": -15,
        "color": 0,
        "level": 126
      },
      "filter1": {
        "mode": 1,
        "cutoff": 76,
        "resonance": 47
      },
      "filter2": {
        "mode": 1,
        "cutoff": 76,
        "resonance": 47
      },
      "routing": {
        "mode": 1,
        "balance": 42
      },
      "envelope": {
        "attack": 0,
        "decay": 14,
        "sustain": 115,
        "release": 54
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
    "name": "KY_Lullaby09",
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
        "cutoff": 80,
        "resonance": 44
      },
      "filter2": {
        "mode": 2,
        "cutoff": 115,
        "resonance": 108
      },
      "routing": {
        "mode": 2,
        "balance": 64
      },
      "envelope": {
        "attack": 0,
        "decay": 64,
        "sustain": 64,
        "release": 75
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
    "name": "LD_Morpher#072",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 2,
        "transpose": 0,
        "detune": -8,
        "color": 8,
        "level": 126
      },
      "osc2": {
        "mode": 1,
        "ringMod": false,
        "transpose": 0,
        "detune": 12,
        "color": 24,
        "level": 72
      },
      "osc3": {
        "mode": 1,
        "ringMod": false,
        "transpose": 0,
        "detune": -7,
        "color": 97,
        "level": 126
      },
      "filter1": {
        "mode": 2,
        "cutoff": 0,
        "resonance": 86
      },
      "filter2": {
        "mode": 2,
        "cutoff": 123,
        "resonance": 51
      },
      "routing": {
        "mode": 2,
        "balance": 63
      },
      "envelope": {
        "attack": 0,
        "decay": 25,
        "sustain": 126,
        "release": 7
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 64,
        "release": 64
      },
      "lfo1": {
        "rate": 24,
        "depth": 126
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "PA_Jarresque06",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": -8,
        "color": 1,
        "level": 124
      },
      "osc2": {
        "mode": 4,
        "ringMod": false,
        "transpose": 23,
        "detune": 0,
        "color": 98,
        "level": 49
      },
      "osc3": {
        "mode": 1,
        "ringMod": false,
        "transpose": 12,
        "detune": 10,
        "color": 6,
        "level": 124
      },
      "filter1": {
        "mode": 2,
        "cutoff": 68,
        "resonance": 0
      },
      "filter2": {
        "mode": 3,
        "cutoff": 120,
        "resonance": 0
      },
      "routing": {
        "mode": 2,
        "balance": 29
      },
      "envelope": {
        "attack": 75,
        "decay": 0,
        "sustain": 125,
        "release": 98
      },
      "envelope2": {
        "attack": 125,
        "decay": 125,
        "sustain": 125,
        "release": 125
      },
      "lfo1": {
        "rate": 10,
        "depth": 125
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
  },
  {
    "type": "synth",
    "name": "SY_Kicking Saw",
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
        "color": 0,
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
        "mode": 5,
        "cutoff": 68,
        "resonance": 98
      },
      "filter2": {
        "mode": 1,
        "cutoff": 62,
        "resonance": 105
      },
      "routing": {
        "mode": 1,
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
        "decay": 64,
        "sustain": 64,
        "release": 64
      },
      "lfo1": {
        "rate": 105,
        "depth": 32
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "BA_Hiphop BaZZ",
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
        "cutoff": 42,
        "resonance": 0
      },
      "filter2": {
        "mode": 2,
        "cutoff": 126,
        "resonance": 0
      },
      "routing": {
        "mode": 2,
        "balance": 64
      },
      "envelope": {
        "attack": 0,
        "decay": 12,
        "sustain": 64,
        "release": 22
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
    "name": "KY_Garage Organ",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 0,
        "color": 15,
        "level": 125
      },
      "osc2": {
        "mode": 3,
        "ringMod": false,
        "transpose": 48,
        "detune": 0,
        "color": 32,
        "level": 25
      },
      "osc3": {
        "mode": 3,
        "ringMod": false,
        "transpose": 24,
        "detune": 0,
        "color": 32,
        "level": 33
      },
      "filter1": {
        "mode": 1,
        "cutoff": 108,
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
        "decay": 49,
        "sustain": 108,
        "release": 37
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
    "name": "LD_Lonely Square Lead",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 0,
        "color": 0,
        "level": 97
      },
      "osc2": {
        "mode": 2,
        "ringMod": false,
        "transpose": 0,
        "detune": -9,
        "color": 64,
        "level": 66
      },
      "osc3": {
        "mode": 2,
        "ringMod": false,
        "transpose": 0,
        "detune": 6,
        "color": 64,
        "level": 47
      },
      "filter1": {
        "mode": 2,
        "cutoff": 66,
        "resonance": 35
      },
      "filter2": {
        "mode": 3,
        "cutoff": 98,
        "resonance": 10
      },
      "routing": {
        "mode": 2,
        "balance": 32
      },
      "envelope": {
        "attack": 0,
        "decay": 73,
        "sustain": 36,
        "release": 55
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 64,
        "release": 64
      },
      "lfo1": {
        "rate": 2,
        "depth": 126
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "PA_Strangeland",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 2,
        "transpose": -12,
        "detune": 0,
        "color": 2,
        "level": 126
      },
      "osc2": {
        "mode": 2,
        "ringMod": false,
        "transpose": 0,
        "detune": 5,
        "color": 123,
        "level": 126
      },
      "osc3": {
        "mode": 2,
        "ringMod": false,
        "transpose": 0,
        "detune": -9,
        "color": 24,
        "level": 126
      },
      "filter1": {
        "mode": 3,
        "cutoff": 117,
        "resonance": 14
      },
      "filter2": {
        "mode": 2,
        "cutoff": 91,
        "resonance": 15
      },
      "routing": {
        "mode": 2,
        "balance": 42
      },
      "envelope": {
        "attack": 10,
        "decay": 96,
        "sustain": 65,
        "release": 102
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 64,
        "release": 64
      },
      "lfo1": {
        "rate": 14,
        "depth": 126
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "SY_Old Saw Percs",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 0,
        "color": 9,
        "level": 126
      },
      "osc2": {
        "mode": 1,
        "ringMod": false,
        "transpose": 12,
        "detune": 23,
        "color": 0,
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
        "cutoff": 67,
        "resonance": 13
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
        "release": 68
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 64,
        "release": 64
      },
      "lfo1": {
        "rate": 50,
        "depth": 114
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "BA_SawBass#004",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 4,
        "color": 0,
        "level": 126
      },
      "osc2": {
        "mode": 1,
        "ringMod": false,
        "transpose": 0,
        "detune": -5,
        "color": 0,
        "level": 126
      },
      "osc3": {
        "mode": 1,
        "ringMod": false,
        "transpose": 12,
        "detune": 0,
        "color": 6,
        "level": 126
      },
      "filter1": {
        "mode": 1,
        "cutoff": 64,
        "resonance": 7
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
        "sustain": 90,
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
    "name": "KY_Glimpse Of a Clavi",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 2,
        "transpose": 0,
        "detune": 0,
        "color": 13,
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
        "cutoff": 82,
        "resonance": 102
      },
      "filter2": {
        "mode": 3,
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
        "release": 13
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
    "name": "LD_PWM Leade)",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 2,
        "transpose": 0,
        "detune": 0,
        "color": 64,
        "level": 125
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": -12,
        "detune": 7,
        "color": 4,
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
        "cutoff": 73,
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
        "attack": 60,
        "decay": 114,
        "sustain": 80,
        "release": 64
      },
      "envelope2": {
        "attack": 126,
        "decay": 126,
        "sustain": 126,
        "release": 0
      },
      "lfo1": {
        "rate": 77,
        "depth": 0
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "PA_LoFi Choir9",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": -20,
        "color": 0,
        "level": 126
      },
      "osc2": {
        "mode": 1,
        "ringMod": false,
        "transpose": 0,
        "detune": 10,
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
        "cutoff": 82,
        "resonance": 98
      },
      "filter2": {
        "mode": 3,
        "cutoff": 80,
        "resonance": 106
      },
      "routing": {
        "mode": 1,
        "balance": 64
      },
      "envelope": {
        "attack": 67,
        "decay": 64,
        "sustain": 64,
        "release": 87
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
    "name": "SY_Old SawsrnZ",
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
    "name": "BA_I like to move it",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": -13,
        "color": 0,
        "level": 126
      },
      "osc2": {
        "mode": 1,
        "ringMod": false,
        "transpose": 12,
        "detune": 20,
        "color": 32,
        "level": 126
      },
      "osc3": {
        "mode": 1,
        "ringMod": false,
        "transpose": -12,
        "detune": 0,
        "color": 32,
        "level": 126
      },
      "filter1": {
        "mode": 1,
        "cutoff": 66,
        "resonance": 58
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
        "release": 31
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
    "name": "KY_Doj's Organ",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 3,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 125
      },
      "osc2": {
        "mode": 3,
        "ringMod": false,
        "transpose": 12,
        "detune": 0,
        "color": 32,
        "level": 125
      },
      "osc3": {
        "mode": 3,
        "ringMod": false,
        "transpose": 36,
        "detune": 0,
        "color": 32,
        "level": 78
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
        "decay": 38,
        "sustain": 107,
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
    "name": "LD_Phunny #002",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 2,
        "transpose": 0,
        "detune": 0,
        "color": 26,
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
        "cutoff": 75,
        "resonance": 82
      },
      "filter2": {
        "mode": 1,
        "cutoff": 64,
        "resonance": 0
      },
      "routing": {
        "mode": 2,
        "balance": 26
      },
      "envelope": {
        "attack": 7,
        "decay": 37,
        "sustain": 64,
        "release": 53
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 64,
        "release": 64
      },
      "lfo1": {
        "rate": 73,
        "depth": 126
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "PA_Fairies#001",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": -8,
        "color": 1,
        "level": 63
      },
      "osc2": {
        "mode": 1,
        "ringMod": false,
        "transpose": 0,
        "detune": 8,
        "color": 0,
        "level": 63
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 121
      },
      "filter1": {
        "mode": 3,
        "cutoff": 42,
        "resonance": 101
      },
      "filter2": {
        "mode": 0,
        "cutoff": 108,
        "resonance": 0
      },
      "routing": {
        "mode": 0,
        "balance": 64
      },
      "envelope": {
        "attack": 72,
        "decay": 121,
        "sustain": 70,
        "release": 100
      },
      "envelope2": {
        "attack": 0,
        "decay": 125,
        "sustain": 56,
        "release": 108
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
    "name": "SY_Nastyn-303",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": -10,
        "color": 0,
        "level": 125
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 19,
        "color": 0,
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
        "cutoff": 49,
        "resonance": 114
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
        "release": 18
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 64,
        "release": 64
      },
      "lfo1": {
        "rate": 61,
        "depth": 82
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "BA_Squaredance",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 2,
        "transpose": 0,
        "detune": 0,
        "color": 64,
        "level": 126
      },
      "osc2": {
        "mode": 1,
        "ringMod": false,
        "transpose": 0,
        "detune": 9,
        "color": 65,
        "level": 126
      },
      "osc3": {
        "mode": 2,
        "ringMod": true,
        "transpose": 12,
        "detune": 0,
        "color": 64,
        "level": 22
      },
      "filter1": {
        "mode": 1,
        "cutoff": 57,
        "resonance": 63
      },
      "filter2": {
        "mode": 2,
        "cutoff": 60,
        "resonance": 31
      },
      "routing": {
        "mode": 0,
        "balance": 64
      },
      "envelope": {
        "attack": 0,
        "decay": 26,
        "sustain": 100,
        "release": 40
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
    "name": "KY_What They Called Pian",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 2,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 124
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 124
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 34,
        "level": 124
      },
      "filter1": {
        "mode": 1,
        "cutoff": 95,
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
        "decay": 79,
        "sustain": 64,
        "release": 69
      },
      "envelope2": {
        "attack": 96,
        "decay": 0,
        "sustain": 124,
        "release": 62
      },
      "lfo1": {
        "rate": 76,
        "depth": 0
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "LD_Debil? ICH?",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 2,
        "transpose": 0,
        "detune": 0,
        "color": 52,
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
        "mode": 5,
        "cutoff": 97,
        "resonance": 62
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
        "decay": 32,
        "sustain": 0,
        "release": 64
      },
      "lfo1": {
        "rate": 78,
        "depth": 113
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "SY_Formants From The Cry",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 0,
        "color": 17,
        "level": 126
      },
      "osc2": {
        "mode": 3,
        "ringMod": true,
        "transpose": 36,
        "detune": 4,
        "color": 112,
        "level": 76
      },
      "osc3": {
        "mode": 1,
        "ringMod": false,
        "transpose": 31,
        "detune": 0,
        "color": 22,
        "level": 27
      },
      "filter1": {
        "mode": 2,
        "cutoff": 81,
        "resonance": 83
      },
      "filter2": {
        "mode": 1,
        "cutoff": 73,
        "resonance": 104
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
    "name": "BA_You broke me!bass",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 0,
        "color": 2,
        "level": 11
      },
      "osc2": {
        "mode": 1,
        "ringMod": false,
        "transpose": 0,
        "detune": 2,
        "color": 0,
        "level": 10
      },
      "osc3": {
        "mode": 4,
        "ringMod": false,
        "transpose": 6,
        "detune": 0,
        "color": 53,
        "level": 38
      },
      "filter1": {
        "mode": 1,
        "cutoff": 78,
        "resonance": 30
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
        "rate": 25,
        "depth": 117
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
    "name": "LD_Slow Synthbrass",
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
        "detune": 9,
        "color": 0,
        "level": 126
      },
      "osc3": {
        "mode": 1,
        "ringMod": false,
        "transpose": 0,
        "detune": -9,
        "color": 0,
        "level": 126
      },
      "filter1": {
        "mode": 1,
        "cutoff": 74,
        "resonance": 24
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
        "attack": 45,
        "decay": 66,
        "sustain": 64,
        "release": 73
      },
      "envelope2": {
        "attack": 98,
        "decay": 91,
        "sustain": 121,
        "release": 72
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
    "name": "SY_Random Arp3",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 2,
        "transpose": 0,
        "detune": 0,
        "color": 63,
        "level": 126
      },
      "osc2": {
        "mode": 2,
        "ringMod": false,
        "transpose": 0,
        "detune": 11,
        "color": 18,
        "level": 98
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
        "cutoff": 66,
        "resonance": 83
      },
      "filter2": {
        "mode": 0,
        "cutoff": 58,
        "resonance": 0
      },
      "routing": {
        "mode": 0,
        "balance": 64
      },
      "envelope": {
        "attack": 4,
        "decay": 50,
        "sustain": 0,
        "release": 57
      },
      "envelope2": {
        "attack": 0,
        "decay": 26,
        "sustain": 0,
        "release": 31
      },
      "lfo1": {
        "rate": 64,
        "depth": 50
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "BA_Analog Mod Bass",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 2,
        "transpose": 0,
        "detune": 0,
        "color": 25,
        "level": 126
      },
      "osc2": {
        "mode": 1,
        "ringMod": false,
        "transpose": 12,
        "detune": 19,
        "color": 0,
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
        "cutoff": 39,
        "resonance": 105
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
        "attack": 32,
        "decay": 64,
        "sustain": 64,
        "release": 62
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 64,
        "release": 64
      },
      "lfo1": {
        "rate": 13,
        "depth": 97
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
    "name": "LD_Sweeping Dist",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 0,
        "color": 11,
        "level": 126
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": 38,
        "detune": 0,
        "color": 65,
        "level": 24
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
        "cutoff": 66,
        "resonance": 126
      },
      "filter2": {
        "mode": 0,
        "cutoff": 80,
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
        "rate": 13,
        "depth": 30
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "SY_Lofi Squares",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 3,
        "transpose": 10,
        "detune": 0,
        "color": 72,
        "level": 126
      },
      "osc2": {
        "mode": 3,
        "ringMod": true,
        "transpose": 12,
        "detune": -1,
        "color": 55,
        "level": 126
      },
      "osc3": {
        "mode": 2,
        "ringMod": false,
        "transpose": 4,
        "detune": 0,
        "color": 65,
        "level": 126
      },
      "filter1": {
        "mode": 1,
        "cutoff": 52,
        "resonance": 104
      },
      "filter2": {
        "mode": 2,
        "cutoff": 126,
        "resonance": 126
      },
      "routing": {
        "mode": 2,
        "balance": 64
      },
      "envelope": {
        "attack": 0,
        "decay": 41,
        "sustain": 43,
        "release": 8
      },
      "envelope2": {
        "attack": 0,
        "decay": 23,
        "sustain": 126,
        "release": 14
      },
      "lfo1": {
        "rate": 2,
        "depth": 126
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "BA_Not From This World",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 2,
        "transpose": 0,
        "detune": 2,
        "color": 52,
        "level": 126
      },
      "osc2": {
        "mode": 2,
        "ringMod": true,
        "transpose": 4,
        "detune": 13,
        "color": 23,
        "level": 126
      },
      "osc3": {
        "mode": 5,
        "ringMod": true,
        "transpose": -24,
        "detune": 3,
        "color": 56,
        "level": 126
      },
      "filter1": {
        "mode": 2,
        "cutoff": 50,
        "resonance": 53
      },
      "filter2": {
        "mode": 2,
        "cutoff": 78,
        "resonance": 82
      },
      "routing": {
        "mode": 2,
        "balance": 63
      },
      "envelope": {
        "attack": 0,
        "decay": 83,
        "sustain": 126,
        "release": 6
      },
      "envelope2": {
        "attack": 0,
        "decay": 41,
        "sustain": 126,
        "release": 10
      },
      "lfo1": {
        "rate": 9,
        "depth": 126
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
    "name": "LD_Mod Perc004",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 2,
        "transpose": 0,
        "detune": 0,
        "color": 10,
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
        "level": 125
      },
      "filter1": {
        "mode": 1,
        "cutoff": 60,
        "resonance": 110
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
        "attack": 13,
        "decay": 39,
        "sustain": 24,
        "release": 59
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 64,
        "release": 64
      },
      "lfo1": {
        "rate": 0,
        "depth": 126
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "SY_Nice Saws87",
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
        "detune": 13,
        "color": 0,
        "level": 126
      },
      "osc3": {
        "mode": 1,
        "ringMod": false,
        "transpose": 0,
        "detune": -13,
        "color": 0,
        "level": 126
      },
      "filter1": {
        "mode": 1,
        "cutoff": 126,
        "resonance": 107
      },
      "filter2": {
        "mode": 2,
        "cutoff": 113,
        "resonance": 65
      },
      "routing": {
        "mode": 2,
        "balance": 64
      },
      "envelope": {
        "attack": 0,
        "decay": 66,
        "sustain": 19,
        "release": 70
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 64,
        "release": 64
      },
      "lfo1": {
        "rate": 12,
        "depth": 102
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "BA_Roaar! 007",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 12,
        "detune": 0,
        "color": 0,
        "level": 126
      },
      "osc2": {
        "mode": 1,
        "ringMod": false,
        "transpose": 0,
        "detune": 3,
        "color": 126,
        "level": 126
      },
      "osc3": {
        "mode": 1,
        "ringMod": false,
        "transpose": -12,
        "detune": -7,
        "color": 126,
        "level": 26
      },
      "filter1": {
        "mode": 1,
        "cutoff": 62,
        "resonance": 75
      },
      "filter2": {
        "mode": 3,
        "cutoff": 41,
        "resonance": 15
      },
      "routing": {
        "mode": 1,
        "balance": 64
      },
      "envelope": {
        "attack": 20,
        "decay": 64,
        "sustain": 126,
        "release": 20
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
    "name": "LD_Whistlotronic",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 2,
        "transpose": 12,
        "detune": 0,
        "color": 66,
        "level": 127
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": 7,
        "detune": 0,
        "color": 32,
        "level": 126
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 4,
        "detune": 0,
        "color": 27,
        "level": 126
      },
      "filter1": {
        "mode": 2,
        "cutoff": 86,
        "resonance": 0
      },
      "filter2": {
        "mode": 2,
        "cutoff": 116,
        "resonance": 0
      },
      "routing": {
        "mode": 2,
        "balance": 21
      },
      "envelope": {
        "attack": 34,
        "decay": 64,
        "sustain": 53,
        "release": 44
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 64,
        "release": 64
      },
      "lfo1": {
        "rate": 99,
        "depth": 0
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "SY_Tech Arp100",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 2,
        "transpose": 0,
        "detune": 0,
        "color": 64,
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
        "cutoff": 13,
        "resonance": 32
      },
      "filter2": {
        "mode": 2,
        "cutoff": 29,
        "resonance": 104
      },
      "routing": {
        "mode": 2,
        "balance": 78
      },
      "envelope": {
        "attack": 0,
        "decay": 48,
        "sustain": 18,
        "release": 23
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 64,
        "release": 64
      },
      "lfo1": {
        "rate": 1,
        "depth": 126
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "BA_Mightyass1",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 9,
        "color": 0,
        "level": 126
      },
      "osc2": {
        "mode": 1,
        "ringMod": false,
        "transpose": -12,
        "detune": 0,
        "color": 32,
        "level": 126
      },
      "osc3": {
        "mode": 3,
        "ringMod": false,
        "transpose": 24,
        "detune": 0,
        "color": 32,
        "level": 47
      },
      "filter1": {
        "mode": 1,
        "cutoff": 25,
        "resonance": 69
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
        "decay": 105,
        "sustain": 6,
        "release": 81
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
  },
  {
    "type": "synth",
    "name": "LD_Farscape04",
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
        "mode": 4,
        "ringMod": false,
        "transpose": -44,
        "detune": -10,
        "color": 0,
        "level": 6
      },
      "osc3": {
        "mode": 3,
        "ringMod": false,
        "transpose": 0,
        "detune": 1,
        "color": 32,
        "level": 126
      },
      "filter1": {
        "mode": 1,
        "cutoff": 86,
        "resonance": 106
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
        "attack": 80,
        "decay": 64,
        "sustain": 112,
        "release": 94
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 64,
        "release": 64
      },
      "lfo1": {
        "rate": 27,
        "depth": 109
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "SY_Lethal PWM0",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 2,
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
        "cutoff": 80,
        "resonance": 0
      },
      "filter2": {
        "mode": 5,
        "cutoff": 114,
        "resonance": 91
      },
      "routing": {
        "mode": 1,
        "balance": 64
      },
      "envelope": {
        "attack": 0,
        "decay": 0,
        "sustain": 116,
        "release": 0
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 64,
        "release": 64
      },
      "lfo1": {
        "rate": 68,
        "depth": 34
      }
    },
    "effects": [],
    "volume": -12,
    "pan": 0
  },
  {
    "type": "synth",
    "name": "BA_Soaring#088",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": -4,
        "color": 126,
        "level": 126
      },
      "osc2": {
        "mode": 1,
        "ringMod": false,
        "transpose": 0,
        "detune": 10,
        "color": 0,
        "level": 126
      },
      "osc3": {
        "mode": 1,
        "ringMod": false,
        "transpose": 12,
        "detune": -11,
        "color": 0,
        "level": 126
      },
      "filter1": {
        "mode": 1,
        "cutoff": 33,
        "resonance": 51
      },
      "filter2": {
        "mode": 1,
        "cutoff": 77,
        "resonance": 115
      },
      "routing": {
        "mode": 1,
        "balance": 64
      },
      "envelope": {
        "attack": 0,
        "decay": 126,
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
        "rate": 8,
        "depth": 46
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
    "name": "SY_Disturbing7",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 0,
        "color": 0,
        "level": 122
      },
      "osc2": {
        "mode": 4,
        "ringMod": false,
        "transpose": 52,
        "detune": 0,
        "color": 32,
        "level": 0
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 122
      },
      "filter1": {
        "mode": 2,
        "cutoff": 89,
        "resonance": 89
      },
      "filter2": {
        "mode": 2,
        "cutoff": 78,
        "resonance": 0
      },
      "routing": {
        "mode": 0,
        "balance": 64
      },
      "envelope": {
        "attack": 0,
        "decay": 77,
        "sustain": 123,
        "release": 0
      },
      "envelope2": {
        "attack": 0,
        "decay": 106,
        "sustain": 0,
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
    "name": "BA_Bontempi002",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": -8,
        "color": 5,
        "level": 124
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 124
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
        "mode": 2,
        "cutoff": 45,
        "resonance": 0
      },
      "filter2": {
        "mode": 0,
        "cutoff": 47,
        "resonance": 0
      },
      "routing": {
        "mode": 1,
        "balance": 64
      },
      "envelope": {
        "attack": 0,
        "decay": 64,
        "sustain": 41,
        "release": 70
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 64,
        "release": 90
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
    "name": "SY_Screeeam!IKAAAA!!!",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 2,
        "transpose": 0,
        "detune": -17,
        "color": 63,
        "level": 55
      },
      "osc2": {
        "mode": 1,
        "ringMod": false,
        "transpose": 12,
        "detune": -43,
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
        "cutoff": 92,
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
        "attack": 14,
        "decay": 64,
        "sustain": 64,
        "release": 42
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 64,
        "release": 64
      },
      "lfo1": {
        "rate": 82,
        "depth": 87
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
    "name": "SY_Synth Jew's Harp",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 2,
        "transpose": 0,
        "detune": 0,
        "color": 5,
        "level": 123
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 123
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 123
      },
      "filter1": {
        "mode": 2,
        "cutoff": 9,
        "resonance": 113
      },
      "filter2": {
        "mode": 1,
        "cutoff": 81,
        "resonance": 0
      },
      "routing": {
        "mode": 1,
        "balance": 64
      },
      "envelope": {
        "attack": 0,
        "decay": 64,
        "sustain": 64,
        "release": 27
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
    "name": "SY_Cheap Arp08",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 0,
        "color": 0,
        "level": 124
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 14,
        "color": 0,
        "level": 124
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
        "mode": 1,
        "cutoff": 83,
        "resonance": 106
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
        "decay": 42,
        "sustain": 38,
        "release": 71
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
    "name": "SY_VeloFuzz001",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 1,
        "color": 0,
        "level": 126
      },
      "osc2": {
        "mode": 2,
        "ringMod": true,
        "transpose": 24,
        "detune": 14,
        "color": 63,
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
        "cutoff": 4,
        "resonance": 116
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
        "release": 40
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
    "name": "SY_yasgch #005",
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
        "transpose": 12,
        "detune": 9,
        "color": 0,
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
        "resonance": 59
      },
      "filter2": {
        "mode": 0,
        "cutoff": 59,
        "resonance": 0
      },
      "routing": {
        "mode": 0,
        "balance": 64
      },
      "envelope": {
        "attack": 0,
        "decay": 118,
        "sustain": 114,
        "release": 35
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
  },
  {
    "type": "synth",
    "name": "Init Patch #100",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 0,
        "color": 0,
        "level": 127
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "filter1": {
        "mode": 1,
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
        "decay": 64,
        "sustain": 127,
        "release": 80
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 127,
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
    "name": "Init Patch #101",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 0,
        "color": 0,
        "level": 127
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "filter1": {
        "mode": 1,
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
        "decay": 64,
        "sustain": 127,
        "release": 80
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 127,
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
    "name": "Init Patch #102",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 0,
        "color": 0,
        "level": 127
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "filter1": {
        "mode": 1,
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
        "decay": 64,
        "sustain": 127,
        "release": 80
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 127,
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
    "name": "Init Patch #103",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 0,
        "color": 0,
        "level": 127
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "filter1": {
        "mode": 1,
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
        "decay": 64,
        "sustain": 127,
        "release": 80
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 127,
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
    "name": "Init Patch #104",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 0,
        "color": 0,
        "level": 127
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "filter1": {
        "mode": 1,
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
        "decay": 64,
        "sustain": 127,
        "release": 80
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 127,
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
    "name": "Init Patch #105",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 0,
        "color": 0,
        "level": 127
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "filter1": {
        "mode": 1,
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
        "decay": 64,
        "sustain": 127,
        "release": 80
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 127,
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
    "name": "Init Patch #106",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 0,
        "color": 0,
        "level": 127
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "filter1": {
        "mode": 1,
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
        "decay": 64,
        "sustain": 127,
        "release": 80
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 127,
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
    "name": "Init Patch #107",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 0,
        "color": 0,
        "level": 127
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "filter1": {
        "mode": 1,
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
        "decay": 64,
        "sustain": 127,
        "release": 80
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 127,
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
    "name": "Init Patch #108",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 0,
        "color": 0,
        "level": 127
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "filter1": {
        "mode": 1,
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
        "decay": 64,
        "sustain": 127,
        "release": 80
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 127,
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
    "name": "Init Patch #109",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 0,
        "color": 0,
        "level": 127
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "filter1": {
        "mode": 1,
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
        "decay": 64,
        "sustain": 127,
        "release": 80
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 127,
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
    "name": "Init Patch #110",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 0,
        "color": 0,
        "level": 127
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "filter1": {
        "mode": 1,
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
        "decay": 64,
        "sustain": 127,
        "release": 80
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 127,
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
    "name": "Init Patch #111",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 0,
        "color": 0,
        "level": 127
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "filter1": {
        "mode": 1,
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
        "decay": 64,
        "sustain": 127,
        "release": 80
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 127,
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
    "name": "Init Patch #112",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 0,
        "color": 0,
        "level": 127
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "filter1": {
        "mode": 1,
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
        "decay": 64,
        "sustain": 127,
        "release": 80
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 127,
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
    "name": "Init Patch #113",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 0,
        "color": 0,
        "level": 127
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "filter1": {
        "mode": 1,
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
        "decay": 64,
        "sustain": 127,
        "release": 80
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 127,
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
    "name": "Init Patch #114",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 0,
        "color": 0,
        "level": 127
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "filter1": {
        "mode": 1,
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
        "decay": 64,
        "sustain": 127,
        "release": 80
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 127,
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
    "name": "Init Patch #115",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 0,
        "color": 0,
        "level": 127
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "filter1": {
        "mode": 1,
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
        "decay": 64,
        "sustain": 127,
        "release": 80
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 127,
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
    "name": "Init Patch #116",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 0,
        "color": 0,
        "level": 127
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "filter1": {
        "mode": 1,
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
        "decay": 64,
        "sustain": 127,
        "release": 80
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 127,
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
    "name": "Init Patch #117",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 0,
        "color": 0,
        "level": 127
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "filter1": {
        "mode": 1,
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
        "decay": 64,
        "sustain": 127,
        "release": 80
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 127,
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
    "name": "Init Patch #118",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 0,
        "color": 0,
        "level": 127
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "filter1": {
        "mode": 1,
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
        "decay": 64,
        "sustain": 127,
        "release": 80
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 127,
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
    "name": "Init Patch #119",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 0,
        "color": 0,
        "level": 127
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "filter1": {
        "mode": 1,
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
        "decay": 64,
        "sustain": 127,
        "release": 80
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 127,
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
    "name": "Init Patch #120",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 0,
        "color": 0,
        "level": 127
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "filter1": {
        "mode": 1,
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
        "decay": 64,
        "sustain": 127,
        "release": 80
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 127,
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
    "name": "Init Patch #121",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 0,
        "color": 0,
        "level": 127
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "filter1": {
        "mode": 1,
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
        "decay": 64,
        "sustain": 127,
        "release": 80
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 127,
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
    "name": "Init Patch #122",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 0,
        "color": 0,
        "level": 127
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "filter1": {
        "mode": 1,
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
        "decay": 64,
        "sustain": 127,
        "release": 80
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 127,
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
    "name": "Init Patch #123",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 0,
        "color": 0,
        "level": 127
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "filter1": {
        "mode": 1,
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
        "decay": 64,
        "sustain": 127,
        "release": 80
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 127,
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
    "name": "Init Patch #124",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 0,
        "color": 0,
        "level": 127
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "filter1": {
        "mode": 1,
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
        "decay": 64,
        "sustain": 127,
        "release": 80
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 127,
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
    "name": "Init Patch #125",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 0,
        "color": 0,
        "level": 127
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "filter1": {
        "mode": 1,
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
        "decay": 64,
        "sustain": 127,
        "release": 80
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 127,
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
    "name": "Init Patch #126",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 0,
        "color": 0,
        "level": 127
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "filter1": {
        "mode": 1,
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
        "decay": 64,
        "sustain": 127,
        "release": 80
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 127,
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
    "name": "Init Patch #127",
    "synthType": "V2",
    "v2": {
      "osc1": {
        "mode": 1,
        "transpose": 0,
        "detune": 0,
        "color": 0,
        "level": 127
      },
      "osc2": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "osc3": {
        "mode": 0,
        "ringMod": false,
        "transpose": 0,
        "detune": 0,
        "color": 32,
        "level": 127
      },
      "filter1": {
        "mode": 1,
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
        "decay": 64,
        "sustain": 127,
        "release": 80
      },
      "envelope2": {
        "attack": 0,
        "decay": 64,
        "sustain": 127,
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
  }
];
