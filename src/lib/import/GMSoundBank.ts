/**
 * GMSoundBank — General MIDI 2 sound bank for DEViLBOX
 *
 * Maps GM2 program numbers (0–127) to InstrumentConfig presets
 * using DEViLBOX's built-in synths as approximations.
 *
 * Reference: https://en.wikipedia.org/wiki/General_MIDI_Level_2
 */

import type { InstrumentConfig, OscillatorConfig, EnvelopeConfig, FilterConfig } from '@typedefs/instrument';

// ─── Shared building blocks ─────────────────────────────────────────────────

const osc = (type: OscillatorConfig['type'], octave = 0): OscillatorConfig =>
  ({ type, detune: 0, octave });

const env = (attack: number, decay: number, sustain: number, release: number): EnvelopeConfig =>
  ({ attack, decay, sustain, release });

const lpf = (frequency: number, Q = 1): FilterConfig =>
  ({ type: 'lowpass', frequency, Q, rolloff: -24 });

const BASE: Pick<InstrumentConfig, 'type' | 'effects' | 'volume' | 'pan'> = {
  type: 'synth',
  effects: [],
  volume: -6,
  pan: 0,
};

// ─── GM2 instrument names (programs 0–127) ──────────────────────────────────

export const GM2_NAMES: readonly string[] = [
  // Piano (0–7)
  'Acoustic Grand Piano', 'Bright Acoustic Piano', 'Electric Grand Piano',
  'Honky-tonk Piano', 'Rhodes Piano', 'Chorused Electric Piano',
  'Harpsichord', 'Clavinet',
  // Chromatic Percussion (8–15)
  'Celesta', 'Glockenspiel', 'Music Box', 'Vibraphone',
  'Marimba', 'Xylophone', 'Tubular Bells', 'Dulcimer',
  // Organ (16–23)
  'Hammond Organ', 'Percussive Organ', 'Rock Organ', 'Church Organ',
  'Reed Organ', 'French Accordion', 'Harmonica', 'Bandoneon',
  // Guitar (24–31)
  'Nylon String Guitar', 'Steel String Guitar', 'Jazz Guitar', 'Clean Electric Guitar',
  'Muted Electric Guitar', 'Overdriven Guitar', 'Distortion Guitar', 'Guitar Harmonics',
  // Bass (32–39)
  'Acoustic Bass', 'Finger Bass', 'Pick Bass', 'Fretless Bass',
  'Slap Bass 1', 'Slap Bass 2', 'Synth Bass 1', 'Synth Bass 2',
  // Strings (40–47)
  'Violin', 'Viola', 'Cello', 'Contrabass',
  'Tremolo Strings', 'Pizzicato Strings', 'Orchestral Harp', 'Timpani',
  // Ensemble (48–55)
  'String Ensemble 1', 'Slow String Ensemble', 'Synth Strings 1', 'Synth Strings 2',
  'Choir Aahs', 'Voice Oohs', 'Synth Choir', 'Orchestra Hit',
  // Brass (56–63)
  'Trumpet', 'Trombone', 'Tuba', 'Muted Trumpet',
  'French Horn', 'Brass Section', 'Synth Brass 1', 'Synth Brass 2',
  // Reed (64–71)
  'Soprano Sax', 'Alto Sax', 'Tenor Sax', 'Baritone Sax',
  'Oboe', 'English Horn', 'Bassoon', 'Clarinet',
  // Pipe (72–79)
  'Piccolo', 'Flute', 'Recorder', 'Pan Flute',
  'Blown Bottle', 'Shakuhachi', 'Whistle', 'Ocarina',
  // Synth Lead (80–87)
  'Lead 1 Square', 'Lead 2 Sawtooth', 'Lead 3 Calliope', 'Lead 4 Chiff',
  'Lead 5 Charang', 'Lead 6 Voice', 'Lead 7 Fifths', 'Lead 8 Bass+Lead',
  // Synth Pad (88–95)
  'Pad 1 New Age', 'Pad 2 Warm', 'Pad 3 Polysynth', 'Pad 4 Space Voice',
  'Pad 5 Bowed Glass', 'Pad 6 Metallic', 'Pad 7 Halo', 'Pad 8 Sweep',
  // Synth Effects (96–103)
  'FX 1 Ice Rain', 'FX 2 Soundtrack', 'FX 3 Crystal', 'FX 4 Atmosphere',
  'FX 5 Brightness', 'FX 6 Goblins', 'FX 7 Echo Drops', 'FX 8 Star Theme',
  // Ethnic (104–111)
  'Sitar', 'Banjo', 'Shamisen', 'Koto',
  'Kalimba', 'Bagpipe', 'Fiddle', 'Shanai',
  // Percussive (112–119)
  'Tinkle Bell', 'Agogo', 'Steel Drums', 'Woodblock',
  'Taiko Drum', 'Melodic Tom', 'Synth Drum', 'Reverse Cymbal',
  // Sound Effects (120–127)
  'Guitar Fret Noise', 'Breath Noise', 'Seashore', 'Bird Tweet',
  'Telephone Ring', 'Helicopter', 'Applause', 'Gun Shot',
] as const;

// ─── Family presets ──────────────────────────────────────────────────────────

/** Piano family (0–7): PolySynth with triangle oscillator, piano-like ADSR */
function pianoPreset(program: number, id: number): InstrumentConfig {
  return {
    ...BASE, id,
    name: GM2_NAMES[program],
    synthType: 'PolySynth',
    oscillator: osc(program < 4 ? 'triangle' : 'sine'),
    envelope: env(2, 1500, 30, 500),
    filter: lpf(4000, 0.5),
  };
}

/** Chromatic percussion (8–15): AMSynth — bell/mallet character */
function chromaticPercPreset(program: number, id: number): InstrumentConfig {
  return {
    ...BASE, id,
    name: GM2_NAMES[program],
    synthType: 'AMSynth',
    oscillator: osc('sine'),
    envelope: env(1, 400, 0, 200),
  };
}

/** Organ (16–23): Organ synth — sustained, organ-like */
function organPreset(program: number, id: number): InstrumentConfig {
  return {
    ...BASE, id,
    name: GM2_NAMES[program],
    synthType: 'Organ',
    oscillator: osc(program === 18 ? 'square' : 'sine'), // Rock Organ → square
    envelope: env(10, 100, 100, 100),
  };
}

/** Guitar (24–31): PolySynth with sawtooth, plucky envelope */
function guitarPreset(program: number, id: number): InstrumentConfig {
  const isDistorted = program === 29 || program === 30; // Overdriven / Distortion Guitar
  return {
    ...BASE, id,
    name: GM2_NAMES[program],
    synthType: 'PolySynth',
    oscillator: osc(isDistorted ? 'square' : 'sawtooth'),
    envelope: env(1, isDistorted ? 600 : 350, 10, 200),
    filter: lpf(isDistorted ? 1500 : 3500),
  };
}

/** Bass (32–39): MonoSynth at octave -1, tight envelope */
function bassPreset(program: number, id: number): InstrumentConfig {
  const isSynth = program >= 38; // Synth Bass 1 & 2
  return {
    ...BASE, id,
    name: GM2_NAMES[program],
    synthType: 'MonoSynth',
    oscillator: osc(isSynth ? 'square' : 'sawtooth', -1),
    envelope: env(5, isSynth ? 400 : 200, 20, 100),
    filter: lpf(isSynth ? 800 : 1500, isSynth ? 4 : 1),
    monophonic: true,
  };
}

/** Strings (40–47): StringMachine with slow attack */
function stringsPreset(program: number, id: number): InstrumentConfig {
  const isPizz = program === 45; // Pizzicato
  const isHarp = program === 46;
  const isTimp = program === 47;
  if (isPizz || isHarp) {
    return {
      ...BASE, id,
      name: GM2_NAMES[program],
      synthType: 'PolySynth',
      oscillator: osc('triangle'),
      envelope: env(1, 400, 0, 200),
    };
  }
  if (isTimp) {
    return {
      ...BASE, id,
      name: GM2_NAMES[program],
      synthType: 'MembraneSynth',
      envelope: env(1, 500, 0, 200),
    };
  }
  return {
    ...BASE, id,
    name: GM2_NAMES[program],
    synthType: 'StringMachine',
    oscillator: osc('sawtooth'),
    envelope: env(program === 44 ? 5 : 60, 2000, 80, 600), // Tremolo fast, others slow
  };
}

/** Ensemble (48–55): PolySynth pads, slow attack */
function ensemblePreset(program: number, id: number): InstrumentConfig {
  const isOrchHit = program === 55;
  return {
    ...BASE, id,
    name: GM2_NAMES[program],
    synthType: 'PolySynth',
    oscillator: osc(isOrchHit ? 'square' : 'sine'),
    envelope: env(isOrchHit ? 1 : 80, isOrchHit ? 200 : 3000, isOrchHit ? 0 : 70, 800),
    filter: lpf(2000, 0.5),
  };
}

/** Brass (56–63): PolySynth with square wave, punchy attack */
function brassPreset(program: number, id: number): InstrumentConfig {
  const isSynth = program >= 62; // Synth Brass
  return {
    ...BASE, id,
    name: GM2_NAMES[program],
    synthType: 'PolySynth',
    oscillator: osc(isSynth ? 'sawtooth' : 'square'),
    envelope: env(isSynth ? 5 : 15, 500, 60, 200),
    filter: lpf(isSynth ? 2000 : 3000),
  };
}

/** Reed (64–71): PolySynth with sawtooth */
function reedPreset(program: number, id: number): InstrumentConfig {
  return {
    ...BASE, id,
    name: GM2_NAMES[program],
    synthType: 'PolySynth',
    oscillator: osc('sawtooth'),
    envelope: env(20, 1000, 70, 300),
    filter: lpf(2500, 2),
  };
}

/** Pipe/Flute (72–79): PolySynth with sine, fluty */
function pipePreset(program: number, id: number): InstrumentConfig {
  return {
    ...BASE, id,
    name: GM2_NAMES[program],
    synthType: 'PolySynth',
    oscillator: osc(program < 74 ? 'sine' : 'triangle'), // Piccolo/Flute=sine, rest=triangle
    envelope: env(30, 2000, 80, 400),
    filter: lpf(5000),
  };
}

/** Synth Lead (80–87): FMSynth — punchy leads */
function synthLeadPreset(program: number, id: number): InstrumentConfig {
  const isSaw = program === 81;
  return {
    ...BASE, id,
    name: GM2_NAMES[program],
    synthType: 'FMSynth',
    oscillator: osc(isSaw ? 'sawtooth' : 'sine'),
    envelope: env(1, 500, 50, 200),
  };
}

/** Synth Pad (88–95): PolySynth pads, very slow attack */
function synthPadPreset(program: number, id: number): InstrumentConfig {
  return {
    ...BASE, id,
    name: GM2_NAMES[program],
    synthType: 'PolySynth',
    oscillator: osc(program >= 91 ? 'triangle' : 'sine'), // Space Voice (91) onward = triangle
    envelope: env(200, 3000, 80, 1500),
    filter: lpf(1500, 0.5),
  };
}

/** Synth FX (96–103): FMSynth atmospheric */
function synthFXPreset(program: number, id: number): InstrumentConfig {
  return {
    ...BASE, id,
    name: GM2_NAMES[program],
    synthType: 'FMSynth',
    oscillator: osc('sine'),
    envelope: env(100, 2000, 50, 1000),
  };
}

/** Ethnic (104–111): PolySynth, plucked/bowed */
function ethnicPreset(program: number, id: number): InstrumentConfig {
  const isSustained = program === 109 || program === 110; // Bagpipe, Fiddle — sustained character
  return {
    ...BASE, id,
    name: GM2_NAMES[program],
    synthType: 'PolySynth',
    oscillator: osc('triangle'),
    envelope: env(isSustained ? 30 : 1, isSustained ? 1500 : 500, isSustained ? 50 : 0, 200),
    filter: lpf(3000),
  };
}

/** Percussive (112–119): MetalSynth for bells/metallic, MembraneSynth for drums */
function percussivePreset(program: number, id: number): InstrumentConfig {
  const isDrum = program >= 116; // Taiko, Melodic Tom, Synth Drum, Reverse Cymbal
  return {
    ...BASE, id,
    name: GM2_NAMES[program],
    synthType: isDrum ? 'MembraneSynth' : 'MetalSynth',
    envelope: env(1, isDrum ? 400 : 200, 0, isDrum ? 300 : 100),
  };
}

/** Sound FX (120–127): FMSynth noise/FX */
function soundFXPreset(program: number, id: number): InstrumentConfig {
  return {
    ...BASE, id,
    name: GM2_NAMES[program],
    synthType: 'FMSynth',
    oscillator: osc('sine'),
    envelope: env(50, 1000, 30, 500),
  };
}

/** Percussion channel (MIDI ch 9): DrumMachine */
function percussionPreset(id: number): InstrumentConfig {
  return {
    ...BASE, id,
    name: 'GM Drums',
    synthType: 'DrumMachine',
  };
}

// ─── Main lookup ─────────────────────────────────────────────────────────────

/**
 * Create an InstrumentConfig for a GM2 program number.
 *
 * @param program  GM program number 0–127
 * @param id       1-based instrument slot number for the DEViLBOX tracker
 * @param isPercussion  true if this is MIDI channel 10 (drums)
 */
export function gmProgramToInstrument(
  program: number,
  id: number,
  isPercussion: boolean,
): InstrumentConfig {
  if (isPercussion) return percussionPreset(id);

  const p = Math.max(0, Math.min(127, program));

  if (p < 8)   return pianoPreset(p, id);
  if (p < 16)  return chromaticPercPreset(p, id);
  if (p < 24)  return organPreset(p, id);
  if (p < 32)  return guitarPreset(p, id);
  if (p < 40)  return bassPreset(p, id);
  if (p < 48)  return stringsPreset(p, id);
  if (p < 56)  return ensemblePreset(p, id);
  if (p < 64)  return brassPreset(p, id);
  if (p < 72)  return reedPreset(p, id);
  if (p < 80)  return pipePreset(p, id);
  if (p < 88)  return synthLeadPreset(p, id);
  if (p < 96)  return synthPadPreset(p, id);
  if (p < 104) return synthFXPreset(p, id);
  if (p < 112) return ethnicPreset(p, id);
  if (p < 120) return percussivePreset(p, id);
  return soundFXPreset(p, id);
}
