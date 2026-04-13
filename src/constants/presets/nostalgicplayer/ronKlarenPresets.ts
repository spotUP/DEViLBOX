/**
 * Ron Klaren synth presets — ADSR with 4 points, synth phasing, vibrato
 *
 * Each preset defines instrument parameters for rk_set_instrument_param().
 * type: 0=sample, 1=synthesis
 * ADSR has 4 stages (points 0-3), each with a target point (0-255) and increment speed.
 * Phase synthesis modulates waveform data at configurable speed/length.
 * Categories: bass, lead, pad, drum, fx, arpeggio
 */

export interface RonKlarenPreset {
  name: string;
  category: 'bass' | 'lead' | 'pad' | 'drum' | 'fx' | 'arpeggio';
  params: Record<string, number>;
}

export const RON_KLAREN_PRESETS: RonKlarenPreset[] = [
  // -- Bass -------------------------------------------------------------------
  {
    name: 'Punchy Sub Bass',
    category: 'bass',
    params: {
      type: 1,
      sampleNumber: 0,
      vibratoNumber: 0,
      phaseSpeed: 0,
      phaseLengthInWords: 16,
      vibratoSpeed: 0,
      vibratoDepth: 0,
      vibratoDelay: 0,
      adsrPoint0: 255,   // attack peak
      adsrIncrement0: 8, // fast attack
      adsrPoint1: 200,   // decay target
      adsrIncrement1: 4, // medium decay
      adsrPoint2: 200,   // sustain level
      adsrIncrement2: 0, // hold
      adsrPoint3: 0,     // release to zero
      adsrIncrement3: 3, // medium release
      phaseValue: 0,
      phaseDirection: 0,
      phasePosition: 0,
    },
  },
  {
    name: 'Phase Modulated Bass',
    category: 'bass',
    params: {
      type: 1,
      sampleNumber: 0,
      vibratoNumber: 0,
      phaseSpeed: 4,
      phaseLengthInWords: 32,
      vibratoSpeed: 0,
      vibratoDepth: 0,
      vibratoDelay: 0,
      adsrPoint0: 240,
      adsrIncrement0: 6,
      adsrPoint1: 180,
      adsrIncrement1: 3,
      adsrPoint2: 180,
      adsrIncrement2: 0,
      adsrPoint3: 0,
      adsrIncrement3: 2,
      phaseValue: 0,
      phaseDirection: 0,
      phasePosition: 0,
    },
  },

  // -- Lead -------------------------------------------------------------------
  {
    name: 'Bright Vibrato Lead',
    category: 'lead',
    params: {
      type: 1,
      sampleNumber: 0,
      vibratoNumber: 0,
      phaseSpeed: 0,
      phaseLengthInWords: 16,
      vibratoSpeed: 5,
      vibratoDepth: 8,
      vibratoDelay: 10,
      adsrPoint0: 255,
      adsrIncrement0: 10,
      adsrPoint1: 200,
      adsrIncrement1: 4,
      adsrPoint2: 200,
      adsrIncrement2: 0,
      adsrPoint3: 0,
      adsrIncrement3: 5,
      phaseValue: 0,
      phaseDirection: 0,
      phasePosition: 0,
    },
  },
  {
    name: 'Phase Sweep Lead',
    category: 'lead',
    params: {
      type: 1,
      sampleNumber: 0,
      vibratoNumber: 0,
      phaseSpeed: 6,
      phaseLengthInWords: 24,
      vibratoSpeed: 3,
      vibratoDepth: 5,
      vibratoDelay: 8,
      adsrPoint0: 250,
      adsrIncrement0: 12,
      adsrPoint1: 190,
      adsrIncrement1: 5,
      adsrPoint2: 190,
      adsrIncrement2: 0,
      adsrPoint3: 0,
      adsrIncrement3: 6,
      phaseValue: 0,
      phaseDirection: 1,
      phasePosition: 0,
    },
  },
  {
    name: 'Staccato Chip Lead',
    category: 'lead',
    params: {
      type: 1,
      sampleNumber: 0,
      vibratoNumber: 0,
      phaseSpeed: 2,
      phaseLengthInWords: 8,
      vibratoSpeed: 0,
      vibratoDepth: 0,
      vibratoDelay: 0,
      adsrPoint0: 255,
      adsrIncrement0: 15, // instant attack
      adsrPoint1: 160,
      adsrIncrement1: 8,  // fast decay
      adsrPoint2: 80,
      adsrIncrement2: 2,
      adsrPoint3: 0,
      adsrIncrement3: 10, // fast release
      phaseValue: 0,
      phaseDirection: 0,
      phasePosition: 0,
    },
  },

  // -- Pad --------------------------------------------------------------------
  {
    name: 'Slow Phase Pad',
    category: 'pad',
    params: {
      type: 1,
      sampleNumber: 0,
      vibratoNumber: 0,
      phaseSpeed: 1,
      phaseLengthInWords: 48,
      vibratoSpeed: 2,
      vibratoDepth: 3,
      vibratoDelay: 20,
      adsrPoint0: 200,
      adsrIncrement0: 1,  // very slow attack
      adsrPoint1: 160,
      adsrIncrement1: 1,
      adsrPoint2: 160,
      adsrIncrement2: 0,
      adsrPoint3: 0,
      adsrIncrement3: 1,  // very slow release
      phaseValue: 0,
      phaseDirection: 0,
      phasePosition: 0,
    },
  },
  {
    name: 'Warm Vibrato Pad',
    category: 'pad',
    params: {
      type: 1,
      sampleNumber: 0,
      vibratoNumber: 0,
      phaseSpeed: 0,
      phaseLengthInWords: 32,
      vibratoSpeed: 3,
      vibratoDepth: 4,
      vibratoDelay: 16,
      adsrPoint0: 180,
      adsrIncrement0: 2,
      adsrPoint1: 140,
      adsrIncrement1: 1,
      adsrPoint2: 140,
      adsrIncrement2: 0,
      adsrPoint3: 0,
      adsrIncrement3: 1,
      phaseValue: 0,
      phaseDirection: 0,
      phasePosition: 0,
    },
  },

  // -- Drum / Percussion ------------------------------------------------------
  {
    name: 'Synth Kick',
    category: 'drum',
    params: {
      type: 1,
      sampleNumber: 0,
      vibratoNumber: 0,
      phaseSpeed: 0,
      phaseLengthInWords: 8,
      vibratoSpeed: 0,
      vibratoDepth: 0,
      vibratoDelay: 0,
      adsrPoint0: 255,
      adsrIncrement0: 15, // instant attack
      adsrPoint1: 0,
      adsrIncrement1: 6,  // fast decay to zero
      adsrPoint2: 0,
      adsrIncrement2: 0,
      adsrPoint3: 0,
      adsrIncrement3: 15,
      phaseValue: 0,
      phaseDirection: 0,
      phasePosition: 0,
    },
  },
  {
    name: 'Phase Snare',
    category: 'drum',
    params: {
      type: 1,
      sampleNumber: 0,
      vibratoNumber: 0,
      phaseSpeed: 12,
      phaseLengthInWords: 4,
      vibratoSpeed: 0,
      vibratoDepth: 0,
      vibratoDelay: 0,
      adsrPoint0: 255,
      adsrIncrement0: 15,
      adsrPoint1: 80,
      adsrIncrement1: 8,
      adsrPoint2: 0,
      adsrIncrement2: 4,
      adsrPoint3: 0,
      adsrIncrement3: 15,
      phaseValue: 0,
      phaseDirection: 0,
      phasePosition: 0,
    },
  },

  // -- FX / SFX ---------------------------------------------------------------
  {
    name: 'Rising Phase FX',
    category: 'fx',
    params: {
      type: 1,
      sampleNumber: 0,
      vibratoNumber: 0,
      phaseSpeed: 8,
      phaseLengthInWords: 64,
      vibratoSpeed: 6,
      vibratoDepth: 12,
      vibratoDelay: 0,
      adsrPoint0: 200,
      adsrIncrement0: 2,
      adsrPoint1: 255,
      adsrIncrement1: 1,
      adsrPoint2: 100,
      adsrIncrement2: 1,
      adsrPoint3: 0,
      adsrIncrement3: 2,
      phaseValue: 0,
      phaseDirection: 0,
      phasePosition: 0,
    },
  },
  {
    name: 'Descending Wobble',
    category: 'fx',
    params: {
      type: 1,
      sampleNumber: 0,
      vibratoNumber: 0,
      phaseSpeed: 10,
      phaseLengthInWords: 32,
      vibratoSpeed: 8,
      vibratoDepth: 16,
      vibratoDelay: 0,
      adsrPoint0: 255,
      adsrIncrement0: 10,
      adsrPoint1: 200,
      adsrIncrement1: 3,
      adsrPoint2: 60,
      adsrIncrement2: 1,
      adsrPoint3: 0,
      adsrIncrement3: 4,
      phaseValue: 0,
      phaseDirection: 1,
      phasePosition: 0,
    },
  },

  // -- Arpeggio ---------------------------------------------------------------
  {
    name: 'Fast Chip Arp',
    category: 'arpeggio',
    params: {
      type: 1,
      sampleNumber: 0,
      vibratoNumber: 0,
      phaseSpeed: 3,
      phaseLengthInWords: 8,
      vibratoSpeed: 0,
      vibratoDepth: 0,
      vibratoDelay: 0,
      adsrPoint0: 255,
      adsrIncrement0: 15,
      adsrPoint1: 180,
      adsrIncrement1: 6,
      adsrPoint2: 180,
      adsrIncrement2: 0,
      adsrPoint3: 0,
      adsrIncrement3: 8,
      phaseValue: 0,
      phaseDirection: 0,
      phasePosition: 0,
    },
  },
];
