import type { DrumKitKeyMapping, InstrumentPreset } from '@typedefs/instrument';

// Helper to create a mapping
const map = (note: number, name: string, path: string): DrumKitKeyMapping => ({
  id: `map-${note}-${Date.now()}-${Math.random()}`,
  noteStart: note,
  noteEnd: note,
  sampleId: name,
  sampleName: name,
  sampleUrl: `data/samples/packs/drumnibus/${path}`,
  pitchOffset: 0,
  fineTune: 0,
  volumeOffset: 0,
  panOffset: 0,
});

// Helper to create a kit preset
const createKit = (name: string, mappings: DrumKitKeyMapping[]): InstrumentPreset['config'] => ({
  type: 'synth',
  name,
  // description field removed as it's not in InstrumentConfig
  synthType: 'DrumKit',
  drumKit: {
    keymap: mappings,
    polyphony: 'poly',
    maxVoices: 8,
    noteCut: true,
  },
  effects: [],
  volume: -6,
  pan: 0,
});

// Kit 1: Analog Style (Drumnibus selections)
const ANALOG_KIT_MAP: DrumKitKeyMapping[] = [
  map(36, 'Kick', 'kicks/BD_808A1200.wav'),
  map(38, 'Snare', 'snares/SD_Analog Noise1.wav'),
  map(39, 'Clap', 'percussion/CLAP_Juxtapos.wav'),
  map(42, 'Closed Hat', 'hihats/CH_AnalogHihat1.wav'),
  map(46, 'Open Hat', 'hihats/OH_AnalogOpenhatwav.wav'),
  map(41, 'Tom Low', 'percussion/TOM_Warped.wav'),
  map(45, 'Tom Mid', 'percussion/TOM_Stofelectro1.wav'),
  map(49, 'Crash', 'hihats/CYM_Synthique.wav'),
  map(51, 'Ride', 'hihats/CYM_Magnotron.wav'),
  map(60, 'FX', 'fx/FX_AnalogFX1.wav'),
];

// Kit 2: Digital/Glitch Style
const DIGITAL_KIT_MAP: DrumKitKeyMapping[] = [
  map(36, 'Kick', 'kicks/BD_Digidap.wav'),
  map(38, 'Snare', 'snares/SD_Digidap.wav'),
  map(39, 'Clap', 'percussion/CLAP_Punchtron.wav'),
  map(42, 'Closed Hat', 'hihats/CH_Digidap.wav'),
  map(46, 'Open Hat', 'hihats/OH_Digidap.wav'),
  map(41, 'Tom', 'percussion/TOM_Punchtron.wav'),
  map(49, 'Crash', 'hihats/CYM_Punchtron.wav'),
  map(60, 'Zap', 'fx/FX_Digidap2.wav'),
];

// Kit 3: LoFi/Human Style
const LOFI_KIT_MAP: DrumKitKeyMapping[] = [
  map(36, 'Kick', 'kicks/BD_LofiHuman.wav'),
  map(38, 'Snare', 'snares/SD_LofiHuman.wav'),
  map(39, 'Clap', 'percussion/CLAP_LofiHuman.wav'),
  map(42, 'Closed Hat', 'hihats/CH_LofiHuman.wav'),
  map(46, 'Open Hat', 'hihats/OH_LofiHuman.wav'),
  map(41, 'Tom', 'percussion/TOM_LofiHuman.wav'),
  map(60, 'Vocal FX', 'fx/FX_LofiHuman.wav'),
];

// Kit 4: Heavy Techno
const TECHNO_KIT_MAP: DrumKitKeyMapping[] = [
  map(36, 'Kick', 'kicks/BD_Pziforze.wav'),
  map(38, 'Snare', 'snares/SD_Wolf 3.wav'),
  map(39, 'Clap', 'percussion/CLAP_Magnotron.wav'),
  map(42, 'Closed Hat', 'hihats/CH_Magnotron.wav'),
  map(46, 'Open Hat', 'hihats/OH_Magnotron.wav'),
  map(41, 'Tom Low', 'percussion/TOM_Magnotron.wav'),
  map(49, 'Crash', 'hihats/CYM_Magnotron.wav'),
  map(60, 'Rumble FX', 'fx/FX_Magstorm1.wav'),
];

export const DRUMNIBUS_PRESETS = [
  createKit('Drumnibus Analog', ANALOG_KIT_MAP),
  createKit('Drumnibus Digital', DIGITAL_KIT_MAP),
  createKit('Drumnibus LoFi', LOFI_KIT_MAP),
  createKit('Drumnibus Techno', TECHNO_KIT_MAP),
];
