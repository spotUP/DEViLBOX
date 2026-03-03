/** Speech presets */
import type { InstrumentPreset } from '@typedefs/instrument';

export const V2_SPEECH_PRESETS: InstrumentPreset['config'][] = [
  {
    "type": "synth",
    "name": "SP_TheProduct",
    "synthType": "V2",
    "v2Speech": {
      "text": "!DHAX_ !prAA_dAHkt",
      "speed": 64,
      "pitch": 40,
      "formantShift": 64,
      "singMode": true
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
      "formantShift": 64,
      "singMode": true
    },
    "effects": [],
    "volume": -10,
    "pan": 0
  }
];
