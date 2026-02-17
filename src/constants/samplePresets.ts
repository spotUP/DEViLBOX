/**
 * Sample & Wavetable Presets
 * Factory presets utilizing external sample packs and extracted wavetables.
 */

import type { InstrumentPreset } from '@typedefs/instrument';

// Paths to sample assets
const CASIO_BASE = '/data/samples/packs/casio-mt40/leads';
const DRUMNIBUS_BASE = '/data/samples/packs/drumnibus';

export const SAMPLE_PACK_PRESETS: InstrumentPreset['config'][] = [
  // === CASIO MT-40 LEADS (Single Sample Players) ===
  {
    name: 'MT-40 Accordion',
    type: 'synth',
    synthType: 'Sampler',
    volume: -10,
    pan: 0,
    effects: [],
    sample: { 
      url: `${CASIO_BASE}/accordion.wav`, 
      baseNote: 'C4', 
      detune: 0, 
      loop: false, 
      loopStart: 0, 
      loopEnd: 0, 
      reverse: false, 
      playbackRate: 1 
    }
  },
  {
    name: 'MT-40 Brass',
    type: 'synth',
    synthType: 'Sampler',
    volume: -10,
    pan: 0,
    effects: [],
    sample: { 
      url: `${CASIO_BASE}/brass.wav`, 
      baseNote: 'C4',
      detune: 0, 
      loop: false, 
      loopStart: 0, 
      loopEnd: 0, 
      reverse: false, 
      playbackRate: 1
    }
  },
  {
    name: 'MT-40 Clarinet',
    type: 'synth',
    synthType: 'Sampler',
    volume: -10,
    pan: 0,
    effects: [],
    sample: { 
      url: `${CASIO_BASE}/clarinet.wav`, 
      baseNote: 'C4',
      detune: 0, 
      loop: false, 
      loopStart: 0, 
      loopEnd: 0, 
      reverse: false, 
      playbackRate: 1
    }
  },
  {
    name: 'MT-40 Elec Piano',
    type: 'synth',
    synthType: 'Sampler',
    volume: -10,
    pan: 0,
    effects: [],
    sample: { 
      url: `${CASIO_BASE}/elec piano.wav`, 
      baseNote: 'C4',
      detune: 0, 
      loop: false, 
      loopStart: 0, 
      loopEnd: 0, 
      reverse: false, 
      playbackRate: 1
    }
  },
  {
    name: 'MT-40 Flute',
    type: 'synth',
    synthType: 'Sampler',
    volume: -10,
    pan: 0,
    effects: [],
    sample: { 
      url: `${CASIO_BASE}/flute.wav`, 
      baseNote: 'C4',
      detune: 0, 
      loop: false, 
      loopStart: 0, 
      loopEnd: 0, 
      reverse: false, 
      playbackRate: 1
    }
  },
  {
    name: 'MT-40 Harpsichord',
    type: 'synth',
    synthType: 'Sampler',
    volume: -10,
    pan: 0,
    effects: [],
    sample: { 
      url: `${CASIO_BASE}/harpsichord.wav`, 
      baseNote: 'C4',
      detune: 0, 
      loop: false, 
      loopStart: 0, 
      loopEnd: 0, 
      reverse: false, 
      playbackRate: 1
    }
  },
  {
    name: 'MT-40 Pipe Organ',
    type: 'synth',
    synthType: 'Sampler',
    volume: -10,
    pan: 0,
    effects: [],
    sample: { 
      url: `${CASIO_BASE}/pipe-organ.wav`, 
      baseNote: 'C4',
      detune: 0, 
      loop: false, 
      loopStart: 0, 
      loopEnd: 0, 
      reverse: false, 
      playbackRate: 1
    }
  },
  {
    name: 'MT-40 Trumpet',
    type: 'synth',
    synthType: 'Sampler',
    volume: -10,
    pan: 0,
    effects: [],
    sample: { 
      url: `${CASIO_BASE}/trumpet.wav`, 
      baseNote: 'C4',
      detune: 0, 
      loop: false, 
      loopStart: 0, 
      loopEnd: 0, 
      reverse: false, 
      playbackRate: 1
    }
  },
  {
    name: 'MT-40 Violin',
    type: 'synth',
    synthType: 'Sampler',
    volume: -10,
    pan: 0,
    effects: [],
    sample: { 
      url: `${CASIO_BASE}/violin.wav`, 
      baseNote: 'C4',
      detune: 0, 
      loop: false, 
      loopStart: 0, 
      loopEnd: 0, 
      reverse: false, 
      playbackRate: 1
    }
  },
  {
    name: 'MT-40 Celesta',
    type: 'synth',
    synthType: 'Sampler',
    volume: -12,
    pan: 0,
    effects: [],
    sample: { 
      url: `${CASIO_BASE}/celesta.wav`, 
      baseNote: 'C4',
      detune: 0, 
      loop: false, 
      loopStart: 0, 
      loopEnd: 0, 
      reverse: false, 
      playbackRate: 1
    }
  },
  {
    name: 'MT-40 Funny Fuzz',
    type: 'synth',
    synthType: 'Sampler',
    volume: -10,
    pan: 0,
    effects: [],
    sample: { 
      url: `${CASIO_BASE}/funny fuzz.wav`, 
      baseNote: 'C4',
      detune: 0, 
      loop: false, 
      loopStart: 0, 
      loopEnd: 0, 
      reverse: false, 
      playbackRate: 1
    }
  },
  {
    name: 'MT-40 Xylophone',
    type: 'synth',
    synthType: 'Sampler',
    volume: -10,
    pan: 0,
    effects: [],
    sample: { 
      url: `${CASIO_BASE}/xylophone.wav`, 
      baseNote: 'C4',
      detune: 0, 
      loop: false, 
      loopStart: 0, 
      loopEnd: 0, 
      reverse: false, 
      playbackRate: 1
    }
  },
  {
    name: 'MT-40 Gloken',
    type: 'synth',
    synthType: 'Sampler',
    volume: -12,
    pan: 0,
    effects: [],
    sample: { 
      url: `${CASIO_BASE}/glocken.wav`, 
      baseNote: 'C4',
      detune: 0, 
      loop: false, 
      loopStart: 0, 
      loopEnd: 0, 
      reverse: false, 
      playbackRate: 1
    }
  },
  {
    name: 'MT-40 Folk Flute',
    type: 'synth',
    synthType: 'Sampler',
    volume: -10,
    pan: 0,
    effects: [],
    sample: { 
      url: `${CASIO_BASE}/folk flute.wav`, 
      baseNote: 'C4',
      detune: 0, 
      loop: false, 
      loopStart: 0, 
      loopEnd: 0, 
      reverse: false, 
      playbackRate: 1
    }
  },
  {
    name: 'MT-40 ST Ensemble',
    type: 'synth',
    synthType: 'Sampler',
    volume: -12,
    pan: 0,
    effects: [],
    sample: { 
      url: `${CASIO_BASE}/st ensemble.wav`, 
      baseNote: 'C4',
      detune: 0, 
      loop: false, 
      loopStart: 0, 
      loopEnd: 0, 
      reverse: false, 
      playbackRate: 1
    }
  },
  {
    name: 'MT-40 Synth Fuzz',
    type: 'synth',
    synthType: 'Sampler',
    volume: -10,
    pan: 0,
    effects: [],
    sample: { 
      url: `${CASIO_BASE}/synth fuzz.wav`, 
      baseNote: 'C4',
      detune: 0, 
      loop: false, 
      loopStart: 0, 
      loopEnd: 0, 
      reverse: false, 
      playbackRate: 1
    }
  },

  // === DRUMNIBUS DRUMS ===
  {
    name: 'Drumnibus Kick 1',
    type: 'synth',
    synthType: 'Sampler',
    volume: -6,
    pan: 0,
    effects: [],
    sample: { 
      url: `${DRUMNIBUS_BASE}/kicks/BD_808A1200.wav`, 
      baseNote: 'C4',
      detune: 0, 
      loop: false, 
      loopStart: 0, 
      loopEnd: 0, 
      reverse: false, 
      playbackRate: 1
    }
  },
  {
    name: 'Drumnibus Snare Analog',
    type: 'synth',
    synthType: 'Sampler',
    volume: -8,
    pan: 0,
    effects: [],
    sample: { 
      url: `${DRUMNIBUS_BASE}/snares/SD_Analog_Noise1.wav`, 
      baseNote: 'C4',
      detune: 0, 
      loop: false, 
      loopStart: 0, 
      loopEnd: 0, 
      reverse: false, 
      playbackRate: 1
    }
  },
  {
    name: 'Drumnibus Snare Wolf',
    type: 'synth',
    synthType: 'Sampler',
    volume: -8,
    pan: 0,
    effects: [],
    sample: { 
      url: `${DRUMNIBUS_BASE}/snares/SD_Wolf1.wav`, 
      baseNote: 'C4',
      detune: 0, 
      loop: false, 
      loopStart: 0, 
      loopEnd: 0, 
      reverse: false, 
      playbackRate: 1
    }
  },
  {
    name: 'Drumnibus Percussion Tom',
    type: 'synth',
    synthType: 'Sampler',
    volume: -8,
    pan: 0,
    effects: [],
    sample: { 
      url: `${DRUMNIBUS_BASE}/percussion/TOM_Magnotron.wav`, 
      baseNote: 'C4',
      detune: 0, 
      loop: false, 
      loopStart: 0, 
      loopEnd: 0, 
      reverse: false, 
      playbackRate: 1
    }
  },
  {
    name: 'Drumnibus HiHat Digidap',
    type: 'synth',
    synthType: 'Sampler',
    volume: -12,
    pan: 0,
    effects: [],
    sample: { 
      url: `${DRUMNIBUS_BASE}/hihats/CH_Digidap.wav`, 
      baseNote: 'C4',
      detune: 0, 
      loop: false, 
      loopStart: 0, 
      loopEnd: 0, 
      reverse: false, 
      playbackRate: 1
    }
  },

  // === PLAYER PRESETS (Single Shot) ===
  {
    name: 'Player Analog Kick',
    type: 'synth',
    synthType: 'Player',
    volume: -6,
    pan: 0,
    effects: [],
    parameters: { sampleUrl: `${DRUMNIBUS_BASE}/kicks/BD_808A1200.wav` }
  },
  {
    name: 'Player Analog Snare',
    type: 'synth',
    synthType: 'Player',
    volume: -8,
    pan: 0,
    effects: [],
    parameters: { sampleUrl: `${DRUMNIBUS_BASE}/snares/SD_Analog_Noise1.wav` }
  },
  {
    name: 'Player Sci-Fi FX',
    type: 'synth',
    synthType: 'Player',
    volume: -10,
    pan: 0,
    effects: [],
    parameters: { sampleUrl: `${DRUMNIBUS_BASE}/fx/FX_AnalogFX1.wav` }
  },

    // === GRANULAR PRESETS ===

    {

      name: 'Granular Casio Flute',

      type: 'synth',

      synthType: 'GranularSynth',

      volume: -10,

      pan: 0,

      effects: [],

      granular: {

        sampleUrl: `${CASIO_BASE}/flute.wav`,

        grainSize: 100,

        grainOverlap: 50,

        detune: 10,

        randomPitch: 20,

        density: 8,

        scanSpeed: 10,

        playbackRate: 1,

        randomPosition: 0,

        scanPosition: 0,

        reverse: false,

        envelope: { attack: 10, release: 50 },

        filter: { type: 'lowpass', cutoff: 20000, resonance: 0 }

      }

    },

    {

      name: 'Granular Drumnibus Texture',

      type: 'synth',

      synthType: 'GranularSynth',

      volume: -12,

      pan: 0,

      effects: [],

      granular: {

        sampleUrl: `${DRUMNIBUS_BASE}/fx/FX_Blarper.wav`,

        grainSize: 200,

        grainOverlap: 10,

        detune: -5,

        randomPosition: 30,

        density: 12,

        scanSpeed: 5,

        playbackRate: 1,

        randomPitch: 0,

        scanPosition: 0,

        reverse: false,

        envelope: { attack: 10, release: 50 },

        filter: { type: 'lowpass', cutoff: 20000, resonance: 0 }

      }

    },

  

    // === MULTI-SAMPLE INSTRUMENTS ===

    {

      name: 'MT-40 Full Lead Set',

      type: 'synth',

      synthType: 'Sampler',

      volume: -10,

      pan: 0,

      effects: [],

      sample: {

        url: '',

        baseNote: 'C4',

        detune: 0,

        loop: false,

        loopStart: 0,

        loopEnd: 0,

        reverse: false,

        playbackRate: 1,

        multiMap: {

          'C2': `${CASIO_BASE}/bass.wav`,

          'C3': `${CASIO_BASE}/cello.wav`,

          'C4': `${CASIO_BASE}/elec piano.wav`,

          'C5': `${CASIO_BASE}/glocken.wav`,

          'C6': `${CASIO_BASE}/funny fuzz.wav`,

        }

      }

    },

  ];

  

  export const WAVETABLE_PACK_PRESETS: InstrumentPreset['config'][] = [

  
  {
    name: 'Wavetable Bell',
    type: 'synth',
    synthType: 'Wavetable',
    volume: -12,
    pan: 0,
    effects: [],
    wavetable: {
      wavetableId: 'bell-32x32',
      morphPosition: 0,
      morphModSource: 'none',
      morphModAmount: 0,
      morphLFORate: 0,
      unison: { voices: 1, detune: 0, stereoSpread: 0 },
      envelope: { attack: 10, decay: 1000, sustain: 0, release: 100 },
      filter: { type: 'lowpass', cutoff: 12000, resonance: 10, envelopeAmount: 0 },
      filterEnvelope: { attack: 0, decay: 0, sustain: 100, release: 0 }
    }
  },
  {
    name: 'Wavetable Brass',
    type: 'synth',
    synthType: 'Wavetable',
    volume: -10,
    pan: 0,
    effects: [],
    wavetable: {
      wavetableId: 'brass-32x32',
      morphPosition: 0,
      morphModSource: 'none',
      morphModAmount: 0,
      morphLFORate: 0,
      unison: { voices: 2, detune: 10, stereoSpread: 50 },
      envelope: { attack: 50, decay: 500, sustain: 50, release: 200 },
      filter: { type: 'lowpass', cutoff: 8000, resonance: 20, envelopeAmount: 30 },
      filterEnvelope: { attack: 100, decay: 300, sustain: 0, release: 100 }
    }
  },
  {
    name: 'Wavetable Choir',
    type: 'synth',
    synthType: 'Wavetable',
    volume: -10,
    pan: 0,
    effects: [],
    wavetable: {
      wavetableId: 'choir-32x32',
      morphPosition: 0,
      morphModSource: 'none',
      morphModAmount: 0,
      morphLFORate: 0,
      unison: { voices: 4, detune: 15, stereoSpread: 80 },
      envelope: { attack: 200, decay: 500, sustain: 100, release: 500 },
      filter: { type: 'lowpass', cutoff: 4000, resonance: 5, envelopeAmount: 0 },
      filterEnvelope: { attack: 0, decay: 0, sustain: 100, release: 0 }
    }
  },
  {
    name: 'Wavetable Heavy Bass',
    type: 'synth',
    synthType: 'Wavetable',
    volume: -8,
    pan: 0,
    effects: [],
    wavetable: {
      wavetableId: 'm4-bass01',
      morphPosition: 0,
      morphModSource: 'envelope',
      morphModAmount: 50,
      morphLFORate: 0,
      unison: { voices: 2, detune: 15, stereoSpread: 40 },
      envelope: { attack: 5, decay: 400, sustain: 20, release: 150 },
      filter: { type: 'lowpass', cutoff: 2000, resonance: 40, envelopeAmount: 60 },
      filterEnvelope: { attack: 10, decay: 300, sustain: 0, release: 100 }
    }
  }
];
