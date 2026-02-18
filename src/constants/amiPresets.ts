/**
 * Amiga Sample Presets
 * Classic Amiga tracker sounds from ST-01 and ST-02 sample packs.
 * These are the legendary sounds used in countless demoscene and chiptune productions.
 */

import type { InstrumentPreset } from '@typedefs/instrument';

// Paths to Amiga sample packs
const ST01_BASE = '/data/samples/packs/st-01';
const ST02_BASE = '/data/samples/packs/st-02';

export const AMI_PRESETS: InstrumentPreset['config'][] = [
  // === DRUMS ===
  {
    name: 'Amiga Kick 1',
    type: 'synth',
    synthType: 'Sampler',
    volume: -6,
    pan: 0,
    effects: [],
    sample: {
      url: `${ST01_BASE}/BassDrum1.wav`,
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
    name: 'Amiga Kick 2',
    type: 'synth',
    synthType: 'Sampler',
    volume: -6,
    pan: 0,
    effects: [],
    sample: {
      url: `${ST01_BASE}/BassDrum2.wav`,
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
    name: 'Amiga Kick Deep',
    type: 'synth',
    synthType: 'Sampler',
    volume: -6,
    pan: 0,
    effects: [],
    sample: {
      url: `${ST01_BASE}/BassDrum4.wav`,
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
    name: 'Amiga Snare 1',
    type: 'synth',
    synthType: 'Sampler',
    volume: -8,
    pan: 0,
    effects: [],
    sample: {
      url: `${ST01_BASE}/Snare1.wav`,
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
    name: 'Amiga Snare 2',
    type: 'synth',
    synthType: 'Sampler',
    volume: -8,
    pan: 0,
    effects: [],
    sample: {
      url: `${ST01_BASE}/Snare2.wav`,
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
    name: 'Amiga Pop Snare',
    type: 'synth',
    synthType: 'Sampler',
    volume: -8,
    pan: 0,
    effects: [],
    sample: {
      url: `${ST01_BASE}/PopSnare1.wav`,
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
    name: 'Amiga HiHat',
    type: 'synth',
    synthType: 'Sampler',
    volume: -10,
    pan: 0,
    effects: [],
    sample: {
      url: `${ST01_BASE}/HiHat1.wav`,
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
    name: 'Amiga Closed Hat',
    type: 'synth',
    synthType: 'Sampler',
    volume: -10,
    pan: 0,
    effects: [],
    sample: {
      url: `${ST01_BASE}/CloseHiHat.wav`,
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
    name: 'Amiga Claps',
    type: 'synth',
    synthType: 'Sampler',
    volume: -8,
    pan: 0,
    effects: [],
    sample: {
      url: `${ST01_BASE}/Claps1.wav`,
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1
    }
  },

  // === BASS ===
  {
    name: 'Amiga Deep Bass',
    type: 'synth',
    synthType: 'Sampler',
    volume: -6,
    pan: 0,
    effects: [],
    sample: {
      url: `${ST01_BASE}/DeepBass.wav`,
      baseNote: 'C2',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1
    }
  },
  {
    name: 'Amiga Filter Bass',
    type: 'synth',
    synthType: 'Sampler',
    volume: -6,
    pan: 0,
    effects: [],
    sample: {
      url: `${ST01_BASE}/FilterBass.wav`,
      baseNote: 'C2',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1
    }
  },
  {
    name: 'Amiga Funk Bass',
    type: 'synth',
    synthType: 'Sampler',
    volume: -6,
    pan: 0,
    effects: [],
    sample: {
      url: `${ST01_BASE}/FunkBass.wav`,
      baseNote: 'C2',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1
    }
  },
  {
    name: 'Amiga Slap Bass',
    type: 'synth',
    synthType: 'Sampler',
    volume: -6,
    pan: 0,
    effects: [],
    sample: {
      url: `${ST01_BASE}/SlapBass.wav`,
      baseNote: 'C2',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1
    }
  },
  {
    name: 'Amiga Synthe Bass',
    type: 'synth',
    synthType: 'Sampler',
    volume: -6,
    pan: 0,
    effects: [],
    sample: {
      url: `${ST01_BASE}/SyntheBass.wav`,
      baseNote: 'C2',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1
    }
  },
  {
    name: 'Amiga Mini Moog Bass',
    type: 'synth',
    synthType: 'Sampler',
    volume: -6,
    pan: 0,
    effects: [],
    sample: {
      url: `${ST02_BASE}/MiniMoog.wav`,
      baseNote: 'C2',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1
    }
  },

  // === STRINGS/PADS ===
  {
    name: 'Amiga Strings 1',
    type: 'synth',
    synthType: 'Sampler',
    volume: -10,
    pan: 0,
    effects: [],
    sample: {
      url: `${ST01_BASE}/Strings1.wav`,
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
    name: 'Amiga Strings 2',
    type: 'synth',
    synthType: 'Sampler',
    volume: -10,
    pan: 0,
    effects: [],
    sample: {
      url: `${ST01_BASE}/Strings2.wav`,
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
    name: 'Amiga Rich String',
    type: 'synth',
    synthType: 'Sampler',
    volume: -10,
    pan: 0,
    effects: [],
    sample: {
      url: `${ST01_BASE}/RichString.wav`,
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
    name: 'Amiga Analog String',
    type: 'synth',
    synthType: 'Sampler',
    volume: -10,
    pan: 0,
    effects: [],
    sample: {
      url: `${ST01_BASE}/AnalogString.wav`,
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1
    }
  },

  // === LEADS ===
  {
    name: 'Amiga PolySync',
    type: 'synth',
    synthType: 'Sampler',
    volume: -10,
    pan: 0,
    effects: [],
    sample: {
      url: `${ST01_BASE}/PolySynth.wav`,
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
    name: 'Amiga Heavy Synth',
    type: 'synth',
    synthType: 'Sampler',
    volume: -10,
    pan: 0,
    effects: [],
    sample: {
      url: `${ST01_BASE}/HeavySynth.wav`,
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
    name: 'Amiga E-Piano',
    type: 'synth',
    synthType: 'Sampler',
    volume: -10,
    pan: 0,
    effects: [],
    sample: {
      url: `${ST01_BASE}/EPiano.wav`,
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
    name: 'Amiga Steinway',
    type: 'synth',
    synthType: 'Sampler',
    volume: -10,
    pan: 0,
    effects: [],
    sample: {
      url: `${ST01_BASE}/Steinway.wav`,
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
    name: 'Amiga Synth Piano',
    type: 'synth',
    synthType: 'Sampler',
    volume: -10,
    pan: 0,
    effects: [],
    sample: {
      url: `${ST01_BASE}/SynthPiano.wav`,
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
    name: 'Amiga Brass',
    type: 'synth',
    synthType: 'Sampler',
    volume: -10,
    pan: 0,
    effects: [],
    sample: {
      url: `${ST01_BASE}/HallBrass.wav`,
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
    name: 'Amiga Syn Brass',
    type: 'synth',
    synthType: 'Sampler',
    volume: -10,
    pan: 0,
    effects: [],
    sample: {
      url: `${ST01_BASE}/SynBrass.wav`,
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
    name: 'Amiga Organ',
    type: 'synth',
    synthType: 'Sampler',
    volume: -10,
    pan: 0,
    effects: [],
    sample: {
      url: `${ST01_BASE}/Organ.wav`,
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
    name: 'Amiga Marimba',
    type: 'synth',
    synthType: 'Sampler',
    volume: -12,
    pan: 0,
    effects: [],
    sample: {
      url: `${ST01_BASE}/Marimba.wav`,
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
    name: 'Amiga Dream Bells',
    type: 'synth',
    synthType: 'Sampler',
    volume: -12,
    pan: 0,
    effects: [],
    sample: {
      url: `${ST01_BASE}/DreamBells.wav`,
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
    name: 'Amiga Koto',
    type: 'synth',
    synthType: 'Sampler',
    volume: -10,
    pan: 0,
    effects: [],
    sample: {
      url: `${ST01_BASE}/Koto.wav`,
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
    name: 'Amiga Pan Flute',
    type: 'synth',
    synthType: 'Sampler',
    volume: -10,
    pan: 0,
    effects: [],
    sample: {
      url: `${ST01_BASE}/PanFlute.wav`,
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1
    }
  },

  // === SPECIAL/VOCALS ===
  {
    name: 'Amiga Voices',
    type: 'synth',
    synthType: 'Sampler',
    volume: -10,
    pan: 0,
    effects: [],
    sample: {
      url: `${ST01_BASE}/Voices.wav`,
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
    name: 'Kermit 1',
    type: 'synth',
    synthType: 'Sampler',
    volume: -10,
    pan: 0,
    effects: [],
    sample: {
      url: `${ST02_BASE}/kermie1.wav`,
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
    name: 'Kermit 2',
    type: 'synth',
    synthType: 'Sampler',
    volume: -10,
    pan: 0,
    effects: [],
    sample: {
      url: `${ST02_BASE}/kermie2.wav`,
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
    name: 'Kermit 3',
    type: 'synth',
    synthType: 'Sampler',
    volume: -10,
    pan: 0,
    effects: [],
    sample: {
      url: `${ST02_BASE}/kermie3.wav`,
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
    name: 'Kermit 5 Long',
    type: 'synth',
    synthType: 'Sampler',
    volume: -10,
    pan: 0,
    effects: [],
    sample: {
      url: `${ST02_BASE}/kermie5.wav`,
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1
    }
  },

  // === FX ===
  {
    name: 'Amiga Sweep',
    type: 'synth',
    synthType: 'Sampler',
    volume: -10,
    pan: 0,
    effects: [],
    sample: {
      url: `${ST01_BASE}/Sweep.wav`,
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
    name: 'Amiga Blast',
    type: 'synth',
    synthType: 'Sampler',
    volume: -10,
    pan: 0,
    effects: [],
    sample: {
      url: `${ST01_BASE}/Blast.wav`,
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
    name: 'Amiga Siren',
    type: 'synth',
    synthType: 'Sampler',
    volume: -10,
    pan: 0,
    effects: [],
    sample: {
      url: `${ST02_BASE}/Siren.wav`,
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1
    }
  },
];
