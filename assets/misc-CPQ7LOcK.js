import { dbToGain, PolySynth, Synth } from "./vendor-tone-48TQc1H3.js";
import { aT as SynthRegistry, bt as DubSirenSynth, y as DEFAULT_DUB_SIREN, bu as SpaceLaserSynth, x as DEFAULT_SPACE_LASER, bv as V2Synth, bw as V2SpeechSynth, bx as SAMSynth, t as DEFAULT_SAM, by as DECtalkSynth, bz as DEFAULT_DECTALK, bA as SynareSynth, w as DEFAULT_SYNARE, bB as CZ101Synth, bC as CEM3394Synth, bD as SCSPSynth, bE as VFXSynth, bF as D50Synth, bj as ES5503Synth, bG as RdPianoSynth, bH as MU2000Synth, r as DEFAULT_DRUMKIT, bI as DrumKitSynth, bJ as WavetableSynth } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
const VOLUME_OFFSETS = {
  DubSiren: 13,
  SpaceLaser: 24,
  V2: 0,
  V2Speech: 0,
  Sam: 16,
  DECtalk: 10,
  PinkTrombone: 6,
  Synare: 7,
  CZ101: 0,
  CEM3394: 19,
  SCSP: 15,
  MAMEVFX: 0,
  VFX: 0,
  D50: 0,
  MAMEDOC: 0,
  MAMERSA: 0,
  MAMESWP30: 0,
  DrumKit: 0,
  Wavetable: 5,
  SuperSaw: 9,
  PolySynth: 8,
  Organ: 3,
  DrumMachine: 18,
  ChipSynth: 5,
  PWMSynth: 9,
  StringMachine: 11,
  FormantSynth: 9,
  WobbleBass: 13,
  ChiptuneModule: -6
};
function getNormalizedVolume(synthType, configVolume) {
  return (configVolume ?? -12) + (VOLUME_OFFSETS[synthType] ?? 0);
}
const speechAndSpecialDescs = [
  {
    id: "DubSiren",
    name: "Dub Siren",
    category: "native",
    loadMode: "lazy",
    volumeOffsetDb: 13,
    create: (config) => {
      const synth = new DubSirenSynth(config.dubSiren || DEFAULT_DUB_SIREN);
      synth.volume.value = getNormalizedVolume("DubSiren", config.volume);
      return synth;
    },
    onTriggerRelease: (synth, _note, time) => {
      synth.triggerRelease(time);
      return true;
    }
  },
  {
    id: "SpaceLaser",
    name: "Space Laser",
    category: "native",
    loadMode: "lazy",
    volumeOffsetDb: 24,
    create: (config) => {
      const synth = new SpaceLaserSynth(config.spaceLaser || DEFAULT_SPACE_LASER);
      synth.volume.value = getNormalizedVolume("SpaceLaser", config.volume);
      return synth;
    },
    onTriggerRelease: (synth, _note, time) => {
      synth.triggerRelease(time);
      return true;
    }
  },
  {
    id: "V2",
    name: "Farbrausch V2",
    category: "wasm",
    loadMode: "lazy",
    sharedInstance: true,
    useSynthBus: true,
    volumeOffsetDb: 0,
    create: (config) => {
      const synth = new V2Synth(config.v2 || void 0);
      synth.output.gain.value = dbToGain(getNormalizedVolume("V2", config.volume));
      return synth;
    },
    onTriggerRelease: (synth, _note, time) => {
      synth.triggerRelease(time);
      return true;
    }
  },
  {
    id: "V2Speech",
    name: "V2 Speech",
    category: "wasm",
    loadMode: "lazy",
    sharedInstance: true,
    useSynthBus: true,
    volumeOffsetDb: 0,
    create: (config) => {
      const synth = new V2SpeechSynth(config.v2Speech || void 0);
      synth.output.gain.value = dbToGain(getNormalizedVolume("V2", config.volume));
      return synth;
    },
    onTriggerRelease: (synth, _note, time) => {
      synth.triggerRelease(time);
      return true;
    }
  },
  {
    id: "Sam",
    name: "SAM Speech",
    category: "wasm",
    loadMode: "lazy",
    sharedInstance: true,
    useSynthBus: true,
    volumeOffsetDb: 16,
    create: (config) => {
      const synth = new SAMSynth(config.sam || DEFAULT_SAM);
      synth.output.gain.value = dbToGain(getNormalizedVolume("Sam", config.volume));
      return synth;
    },
    onTriggerRelease: (synth, _note, time) => {
      synth.triggerRelease(time);
      return true;
    }
  },
  {
    id: "DECtalk",
    name: "DECtalk Speech",
    category: "wasm",
    loadMode: "lazy",
    sharedInstance: true,
    useSynthBus: true,
    volumeOffsetDb: 16,
    create: (config) => {
      const synth = new DECtalkSynth(config.dectalk || DEFAULT_DECTALK);
      synth.output.gain.value = dbToGain(getNormalizedVolume("DECtalk", config.volume));
      return synth;
    },
    onTriggerRelease: (synth, _note, time) => {
      synth.triggerRelease(time);
      return true;
    }
  },
  {
    id: "Synare",
    name: "Synare 3",
    category: "native",
    loadMode: "lazy",
    volumeOffsetDb: 7,
    create: (config) => {
      const synth = new SynareSynth(config.synare || DEFAULT_SYNARE);
      synth.volume.value = getNormalizedVolume("Synare", config.volume);
      return synth;
    },
    onTriggerRelease: (synth, _note, time) => {
      synth.triggerRelease(time);
      return true;
    }
  }
];
const juceWasmDescs = [
  {
    id: "CZ101",
    name: "Casio CZ-101",
    category: "wasm",
    loadMode: "lazy",
    sharedInstance: true,
    useSynthBus: true,
    volumeOffsetDb: 0,
    create: (config) => {
      const synth = new CZ101Synth();
      void synth.init();
      synth.output.gain.value = dbToGain(getNormalizedVolume("CZ101", config.volume));
      return synth;
    },
    onTriggerRelease: (synth, _note, time) => {
      synth.triggerRelease(time);
      return true;
    }
  },
  {
    id: "CEM3394",
    name: "Curtis CEM3394",
    category: "wasm",
    loadMode: "lazy",
    sharedInstance: true,
    useSynthBus: true,
    volumeOffsetDb: 19,
    create: (config) => {
      const synth = new CEM3394Synth();
      synth.output.gain.value = dbToGain(getNormalizedVolume("CEM3394", config.volume));
      return synth;
    },
    onTriggerRelease: (synth, _note, time) => {
      synth.triggerRelease(time);
      return true;
    }
  },
  {
    id: "SCSP",
    name: "Sega Saturn SCSP",
    category: "wasm",
    loadMode: "lazy",
    sharedInstance: true,
    useSynthBus: true,
    volumeOffsetDb: 15,
    create: (config) => {
      const synth = new SCSPSynth();
      synth.output.gain.value = dbToGain(getNormalizedVolume("SCSP", config.volume));
      return synth;
    },
    onTriggerRelease: (synth, _note, time) => {
      synth.triggerRelease(time);
      return true;
    }
  }
];
const mameComplexDescs = [
  {
    id: "MAMEVFX",
    name: "Ensoniq VFX",
    category: "wasm",
    loadMode: "lazy",
    sharedInstance: true,
    useSynthBus: true,
    volumeOffsetDb: 0,
    create: (config) => {
      const synth = new VFXSynth();
      void synth.init();
      synth.output.gain.value = dbToGain(getNormalizedVolume("MAMEVFX", config.volume));
      return synth;
    },
    onTriggerRelease: (synth, _note, time) => {
      synth.triggerRelease(time);
      return true;
    }
  },
  {
    id: "VFX",
    name: "Ensoniq VFX",
    category: "wasm",
    loadMode: "lazy",
    sharedInstance: true,
    useSynthBus: true,
    volumeOffsetDb: 0,
    create: (config) => {
      const synth = new VFXSynth();
      void synth.init();
      synth.output.gain.value = dbToGain(getNormalizedVolume("MAMEVFX", config.volume));
      return synth;
    },
    onTriggerRelease: (synth, _note, time) => {
      synth.triggerRelease(time);
      return true;
    }
  },
  {
    id: "D50",
    name: "Roland D-50",
    category: "wasm",
    loadMode: "lazy",
    sharedInstance: true,
    useSynthBus: true,
    volumeOffsetDb: 0,
    create: (config) => {
      const synth = new D50Synth();
      void synth.init();
      synth.output.gain.value = dbToGain(getNormalizedVolume("MAMERSA", config.volume));
      return synth;
    },
    onTriggerRelease: (synth, _note, time) => {
      synth.triggerRelease(time);
      return true;
    }
  },
  {
    id: "MAMEDOC",
    name: "Ensoniq ESQ-1 (DOC)",
    category: "wasm",
    loadMode: "lazy",
    sharedInstance: true,
    useSynthBus: true,
    volumeOffsetDb: 62,
    // Same as MAMEES5503: ES5503Synth native output is very quiet
    create: (config) => {
      const synth = new ES5503Synth();
      synth.output.gain.value = Math.pow(10, ((config.volume ?? -12) + 62) / 20);
      return synth;
    },
    onTriggerRelease: (synth, _note, time) => {
      synth.triggerRelease(time);
      return true;
    }
  },
  {
    id: "MAMERSA",
    name: "Roland SA Digital Piano",
    category: "wasm",
    loadMode: "lazy",
    sharedInstance: true,
    useSynthBus: true,
    volumeOffsetDb: 0,
    create: (config) => {
      const synth = new RdPianoSynth(config.rdpiano || {});
      synth.output.gain.value = dbToGain(getNormalizedVolume("MAMERSA", config.volume));
      return synth;
    },
    onTriggerRelease: (synth, _note, time) => {
      synth.triggerRelease(time);
      return true;
    }
  },
  {
    id: "MAMESWP30",
    name: "Yamaha MU-2000",
    category: "wasm",
    loadMode: "lazy",
    sharedInstance: true,
    useSynthBus: true,
    volumeOffsetDb: 0,
    create: (config) => {
      const synth = new MU2000Synth();
      void synth.init();
      synth.output.gain.value = dbToGain(getNormalizedVolume("MAMESWP30", config.volume));
      return synth;
    },
    onTriggerRelease: (synth, _note, time) => {
      synth.triggerRelease(time);
      return true;
    }
  }
];
const specialDescs = [
  {
    id: "DrumKit",
    name: "Drum Kit",
    category: "native",
    loadMode: "lazy",
    volumeOffsetDb: 0,
    controlsComponent: "DrumKitControls",
    create: (config) => {
      const kitConfig = config.drumKit || DEFAULT_DRUMKIT;
      const synth = new DrumKitSynth(kitConfig);
      return synth;
    },
    onTriggerRelease: (synth, _note, time) => {
      synth.triggerRelease(time);
      return true;
    }
  },
  {
    id: "Wavetable",
    name: "Wavetable",
    category: "native",
    loadMode: "lazy",
    volumeOffsetDb: 5,
    create: (config) => {
      const synth = new WavetableSynth(config);
      return synth;
    }
  },
  {
    id: "ChiptuneModule",
    name: "Chiptune Module",
    category: "native",
    loadMode: "lazy",
    volumeOffsetDb: -6,
    create: (config) => {
      var _a;
      const synth = new PolySynth(Synth, {
        oscillator: { type: ((_a = config.oscillator) == null ? void 0 : _a.type) || "sawtooth" },
        volume: getNormalizedVolume("ChiptuneModule", config.volume)
      });
      return synth;
    }
  }
];
SynthRegistry.register(speechAndSpecialDescs);
SynthRegistry.register(juceWasmDescs);
SynthRegistry.register(mameComplexDescs);
SynthRegistry.register(specialDescs);
