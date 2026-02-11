/**
 * Curated registry of publicly hosted WAM 2.0 plugins.
 * All URLs verified as live and accessible.
 *
 * Instrument plugins generate sound from MIDI notes directly.
 * Effect plugins process audio — when loaded as an instrument, an internal
 * tone generator feeds audio through the effect so you can play and hear it.
 *
 * Sources:
 *   - mainline.i3s.unice.fr/wam2 (WIMMICS / Université Côte d'Azur)
 *   - webaudiomodules.com/community (WAM Community / Sequencer Party)
 *   - github.com/webaudiomodules
 */

const WAM_HOST = 'https://mainline.i3s.unice.fr/wam2/packages';

export interface WAMPluginEntry {
  name: string;
  url: string;
  type: 'instrument' | 'effect' | 'utility';
  category: string;
  description: string;
}

export const WAM_SYNTH_PLUGINS: WAMPluginEntry[] = [
  // ── INSTRUMENTS / SYNTHESIZERS ────────────────────────────────────────
  {
    name: 'OB-Xd',
    url: `${WAM_HOST}/obxd/index.js`,
    type: 'instrument',
    category: 'Synthesizer',
    description: 'Oberheim OB-X virtual analog synth (WASM)',
  },
  {
    name: 'Synth-101',
    url: `${WAM_HOST}/synth101/dist/index.js`,
    type: 'instrument',
    category: 'Synthesizer',
    description: 'Roland SH-101 monophonic synthesizer',
  },
  {
    name: 'TinySynth',
    url: `${WAM_HOST}/tinySynth/src/index.js`,
    type: 'instrument',
    category: 'Synthesizer',
    description: 'GM-mapped multi-timbral synth',
  },
  {
    name: 'Faust Flute',
    url: `${WAM_HOST}/faustFlute/index.js`,
    type: 'instrument',
    category: 'Synthesizer',
    description: 'Physical modelling flute (Faust DSP)',
  },

  // ── EFFECTS: DISTORTION / OVERDRIVE ──────────────────────────────────
  {
    name: 'Big Muff',
    url: `${WAM_HOST}/BigMuff/index.js`,
    type: 'effect',
    category: 'Distortion',
    description: 'Electro-Harmonix Big Muff Pi fuzz',
  },
  {
    name: 'TS-9 Overdrive',
    url: `${WAM_HOST}/TS9_OverdriveFaustGenerated/index.js`,
    type: 'effect',
    category: 'Distortion',
    description: 'Ibanez Tube Screamer overdrive (Faust)',
  },
  {
    name: 'Disto Machine',
    url: `${WAM_HOST}/disto_machine/src/index.js`,
    type: 'effect',
    category: 'Amp Simulator',
    description: 'Multi-mode distortion with cabinet sim',
  },
  {
    name: 'QuadraFuzz',
    url: `${WAM_HOST}/quadrafuzz/dist/index.js`,
    type: 'effect',
    category: 'Distortion',
    description: '4-band multiband distortion/fuzz',
  },

  // ── EFFECTS: AMP SIMULATOR ───────────────────────────────────────────
  {
    name: 'Vox Amp 30',
    url: `${WAM_HOST}/GuitarAmpSim60s/index.js`,
    type: 'effect',
    category: 'Amp Simulator',
    description: '1960s guitar amp simulator with cabinet',
  },

  // ── EFFECTS: MODULATION ──────────────────────────────────────────────
  {
    name: 'Stone Phaser',
    url: `${WAM_HOST}/StonePhaserStereo/index.js`,
    type: 'effect',
    category: 'Modulation',
    description: 'Stereo phaser effect (Faust DSP)',
  },

  // ── EFFECTS: DELAY ───────────────────────────────────────────────────
  {
    name: 'Ping Pong Delay',
    url: `${WAM_HOST}/pingpongdelay/dist/index.js`,
    type: 'effect',
    category: 'Delay',
    description: 'Stereo ping-pong delay',
  },
  {
    name: 'Faust Delay',
    url: `${WAM_HOST}/faustPingPongDelay/plugin/index.js`,
    type: 'effect',
    category: 'Delay',
    description: 'Ping-pong delay (Faust DSP)',
  },

  // ── EFFECTS: PITCH ───────────────────────────────────────────────────
  {
    name: 'Csound Pitch Shifter',
    url: `${WAM_HOST}/csoundPitchShifter/dist/index.js`,
    type: 'effect',
    category: 'Pitch',
    description: 'Pitch shifter powered by Csound',
  },

  // ── EFFECTS: EQ / FILTER ─────────────────────────────────────────────
  {
    name: 'Graphic Equalizer',
    url: `${WAM_HOST}/graphicEqualizer/src/index.js`,
    type: 'effect',
    category: 'EQ & Filter',
    description: 'Multi-band graphic equalizer',
  },

  // ── EFFECTS: MULTI-FX ────────────────────────────────────────────────
  {
    name: 'Pedalboard',
    url: `${WAM_HOST}/pedalboard/dist/index.js`,
    type: 'effect',
    category: 'Multi-FX',
    description: 'Drag-and-drop guitar pedalboard',
  },
];
