/**
 * Delta Music 2.0 synth presets — 5-point volume/vibrato envelopes, pitch bend,
 * waveform tables
 *
 * Each preset defines instrument parameters for dm2_set_instrument_param().
 * Volume envelope: 5 stages (volSpeed/volLevel/volSustain 0-4)
 * Vibrato envelope: 5 stages (vibSpeed/vibDelay/vibSustain 0-4)
 * pitchBend: int16 pitch bend amount
 * All uint8 params are 0-255 range.
 * Categories: bass, lead, pad, drum, fx, arpeggio
 */

export interface DeltaMusic2Preset {
  name: string;
  category: 'bass' | 'lead' | 'pad' | 'drum' | 'fx' | 'arpeggio';
  params: Record<string, number>;
}

export const DELTA_MUSIC_2_PRESETS: DeltaMusic2Preset[] = [
  // -- Bass -------------------------------------------------------------------
  {
    name: 'Punchy Sub Bass',
    category: 'bass',
    params: {
      pitchBend: 0,
      // Volume envelope: fast attack, slight decay, solid sustain
      volSpeed0: 8, volLevel0: 64, volSustain0: 2,
      volSpeed1: 4, volLevel1: 50, volSustain1: 30,
      volSpeed2: 2, volLevel2: 50, volSustain2: 0,
      volSpeed3: 4, volLevel3: 0,  volSustain3: 0,
      volSpeed4: 0, volLevel4: 0,  volSustain4: 0,
      // No vibrato
      vibSpeed0: 0, vibDelay0: 0, vibSustain0: 0,
      vibSpeed1: 0, vibDelay1: 0, vibSustain1: 0,
      vibSpeed2: 0, vibDelay2: 0, vibSustain2: 0,
      vibSpeed3: 0, vibDelay3: 0, vibSustain3: 0,
      vibSpeed4: 0, vibDelay4: 0, vibSustain4: 0,
    },
  },
  {
    name: 'Bend Down Bass',
    category: 'bass',
    params: {
      pitchBend: -20,
      volSpeed0: 10, volLevel0: 60, volSustain0: 2,
      volSpeed1: 3,  volLevel1: 48, volSustain1: 20,
      volSpeed2: 2,  volLevel2: 48, volSustain2: 0,
      volSpeed3: 3,  volLevel3: 0,  volSustain3: 0,
      volSpeed4: 0,  volLevel4: 0,  volSustain4: 0,
      vibSpeed0: 0, vibDelay0: 0, vibSustain0: 0,
      vibSpeed1: 0, vibDelay1: 0, vibSustain1: 0,
      vibSpeed2: 0, vibDelay2: 0, vibSustain2: 0,
      vibSpeed3: 0, vibDelay3: 0, vibSustain3: 0,
      vibSpeed4: 0, vibDelay4: 0, vibSustain4: 0,
    },
  },

  // -- Lead -------------------------------------------------------------------
  {
    name: 'Vibrato Chip Lead',
    category: 'lead',
    params: {
      pitchBend: 0,
      volSpeed0: 12, volLevel0: 60, volSustain0: 1,
      volSpeed1: 4,  volLevel1: 52, volSustain1: 40,
      volSpeed2: 2,  volLevel2: 52, volSustain2: 0,
      volSpeed3: 6,  volLevel3: 0,  volSustain3: 0,
      volSpeed4: 0,  volLevel4: 0,  volSustain4: 0,
      // Delayed vibrato
      vibSpeed0: 0, vibDelay0: 12, vibSustain0: 0,
      vibSpeed1: 3, vibDelay1: 0,  vibSustain1: 20,
      vibSpeed2: 3, vibDelay2: 0,  vibSustain2: 0,
      vibSpeed3: 0, vibDelay3: 0,  vibSustain3: 0,
      vibSpeed4: 0, vibDelay4: 0,  vibSustain4: 0,
    },
  },
  {
    name: 'Bright Staccato Lead',
    category: 'lead',
    params: {
      pitchBend: 0,
      volSpeed0: 16, volLevel0: 64, volSustain0: 1,
      volSpeed1: 8,  volLevel1: 40, volSustain1: 8,
      volSpeed2: 6,  volLevel2: 20, volSustain2: 4,
      volSpeed3: 10, volLevel3: 0,  volSustain3: 0,
      volSpeed4: 0,  volLevel4: 0,  volSustain4: 0,
      vibSpeed0: 0, vibDelay0: 0, vibSustain0: 0,
      vibSpeed1: 0, vibDelay1: 0, vibSustain1: 0,
      vibSpeed2: 0, vibDelay2: 0, vibSustain2: 0,
      vibSpeed3: 0, vibDelay3: 0, vibSustain3: 0,
      vibSpeed4: 0, vibDelay4: 0, vibSustain4: 0,
    },
  },
  {
    name: 'Pitch Rise Lead',
    category: 'lead',
    params: {
      pitchBend: 15,
      volSpeed0: 10, volLevel0: 58, volSustain0: 2,
      volSpeed1: 3,  volLevel1: 50, volSustain1: 30,
      volSpeed2: 2,  volLevel2: 50, volSustain2: 0,
      volSpeed3: 5,  volLevel3: 0,  volSustain3: 0,
      volSpeed4: 0,  volLevel4: 0,  volSustain4: 0,
      vibSpeed0: 0, vibDelay0: 8,  vibSustain0: 0,
      vibSpeed1: 4, vibDelay1: 0,  vibSustain1: 15,
      vibSpeed2: 4, vibDelay2: 0,  vibSustain2: 0,
      vibSpeed3: 0, vibDelay3: 0,  vibSustain3: 0,
      vibSpeed4: 0, vibDelay4: 0,  vibSustain4: 0,
    },
  },

  // -- Pad --------------------------------------------------------------------
  {
    name: 'Slow Evolving Pad',
    category: 'pad',
    params: {
      pitchBend: 0,
      // Slow 5-stage volume envelope
      volSpeed0: 1, volLevel0: 30, volSustain0: 10,
      volSpeed1: 1, volLevel1: 44, volSustain1: 20,
      volSpeed2: 1, volLevel2: 40, volSustain2: 30,
      volSpeed3: 1, volLevel3: 20, volSustain3: 15,
      volSpeed4: 1, volLevel4: 0,  volSustain4: 0,
      // Gentle vibrato building in
      vibSpeed0: 0, vibDelay0: 20, vibSustain0: 0,
      vibSpeed1: 1, vibDelay1: 0,  vibSustain1: 30,
      vibSpeed2: 2, vibDelay2: 0,  vibSustain2: 20,
      vibSpeed3: 2, vibDelay3: 0,  vibSustain3: 0,
      vibSpeed4: 0, vibDelay4: 0,  vibSustain4: 0,
    },
  },
  {
    name: 'Tremolo Pad',
    category: 'pad',
    params: {
      pitchBend: 0,
      // Volume tremolo via staged envelope cycling
      volSpeed0: 2, volLevel0: 48, volSustain0: 8,
      volSpeed1: 2, volLevel1: 32, volSustain1: 8,
      volSpeed2: 2, volLevel2: 48, volSustain2: 8,
      volSpeed3: 2, volLevel3: 32, volSustain3: 8,
      volSpeed4: 1, volLevel4: 0,  volSustain4: 0,
      vibSpeed0: 0, vibDelay0: 10, vibSustain0: 0,
      vibSpeed1: 2, vibDelay1: 0,  vibSustain1: 40,
      vibSpeed2: 2, vibDelay2: 0,  vibSustain2: 0,
      vibSpeed3: 0, vibDelay3: 0,  vibSustain3: 0,
      vibSpeed4: 0, vibDelay4: 0,  vibSustain4: 0,
    },
  },

  // -- Drum / Percussion ------------------------------------------------------
  {
    name: 'Synth Kick',
    category: 'drum',
    params: {
      pitchBend: -40,
      volSpeed0: 16, volLevel0: 64, volSustain0: 1,
      volSpeed1: 10, volLevel1: 0,  volSustain1: 0,
      volSpeed2: 0,  volLevel2: 0,  volSustain2: 0,
      volSpeed3: 0,  volLevel3: 0,  volSustain3: 0,
      volSpeed4: 0,  volLevel4: 0,  volSustain4: 0,
      vibSpeed0: 0, vibDelay0: 0, vibSustain0: 0,
      vibSpeed1: 0, vibDelay1: 0, vibSustain1: 0,
      vibSpeed2: 0, vibDelay2: 0, vibSustain2: 0,
      vibSpeed3: 0, vibDelay3: 0, vibSustain3: 0,
      vibSpeed4: 0, vibDelay4: 0, vibSustain4: 0,
    },
  },
  {
    name: 'Vibrato Snare',
    category: 'drum',
    params: {
      pitchBend: 10,
      volSpeed0: 16, volLevel0: 60, volSustain0: 1,
      volSpeed1: 6,  volLevel1: 30, volSustain1: 4,
      volSpeed2: 8,  volLevel2: 0,  volSustain2: 0,
      volSpeed3: 0,  volLevel3: 0,  volSustain3: 0,
      volSpeed4: 0,  volLevel4: 0,  volSustain4: 0,
      vibSpeed0: 8, vibDelay0: 0, vibSustain0: 3,
      vibSpeed1: 4, vibDelay1: 0, vibSustain1: 2,
      vibSpeed2: 0, vibDelay2: 0, vibSustain2: 0,
      vibSpeed3: 0, vibDelay3: 0, vibSustain3: 0,
      vibSpeed4: 0, vibDelay4: 0, vibSustain4: 0,
    },
  },

  // -- FX / SFX ---------------------------------------------------------------
  {
    name: 'Dive Bomb FX',
    category: 'fx',
    params: {
      pitchBend: -60,
      volSpeed0: 12, volLevel0: 56, volSustain0: 2,
      volSpeed1: 2,  volLevel1: 40, volSustain1: 20,
      volSpeed2: 3,  volLevel2: 0,  volSustain2: 0,
      volSpeed3: 0,  volLevel3: 0,  volSustain3: 0,
      volSpeed4: 0,  volLevel4: 0,  volSustain4: 0,
      vibSpeed0: 6, vibDelay0: 0, vibSustain0: 10,
      vibSpeed1: 8, vibDelay1: 0, vibSustain1: 10,
      vibSpeed2: 0, vibDelay2: 0, vibSustain2: 0,
      vibSpeed3: 0, vibDelay3: 0, vibSustain3: 0,
      vibSpeed4: 0, vibDelay4: 0, vibSustain4: 0,
    },
  },
  {
    name: 'Rising Wobble FX',
    category: 'fx',
    params: {
      pitchBend: 30,
      volSpeed0: 4, volLevel0: 48, volSustain0: 4,
      volSpeed1: 2, volLevel1: 56, volSustain1: 10,
      volSpeed2: 2, volLevel2: 40, volSustain2: 8,
      volSpeed3: 3, volLevel3: 0,  volSustain3: 0,
      volSpeed4: 0, volLevel4: 0,  volSustain4: 0,
      // Intensifying vibrato
      vibSpeed0: 2,  vibDelay0: 0, vibSustain0: 6,
      vibSpeed1: 4,  vibDelay1: 0, vibSustain1: 8,
      vibSpeed2: 8,  vibDelay2: 0, vibSustain2: 6,
      vibSpeed3: 12, vibDelay3: 0, vibSustain3: 4,
      vibSpeed4: 0,  vibDelay4: 0, vibSustain4: 0,
    },
  },

  // -- Arpeggio ---------------------------------------------------------------
  {
    name: 'Clean Chip Arp',
    category: 'arpeggio',
    params: {
      pitchBend: 0,
      volSpeed0: 14, volLevel0: 56, volSustain0: 1,
      volSpeed1: 4,  volLevel1: 48, volSustain1: 30,
      volSpeed2: 2,  volLevel2: 48, volSustain2: 0,
      volSpeed3: 6,  volLevel3: 0,  volSustain3: 0,
      volSpeed4: 0,  volLevel4: 0,  volSustain4: 0,
      vibSpeed0: 0, vibDelay0: 0, vibSustain0: 0,
      vibSpeed1: 0, vibDelay1: 0, vibSustain1: 0,
      vibSpeed2: 0, vibDelay2: 0, vibSustain2: 0,
      vibSpeed3: 0, vibDelay3: 0, vibSustain3: 0,
      vibSpeed4: 0, vibDelay4: 0, vibSustain4: 0,
    },
  },
  {
    name: 'Vibrato Arp',
    category: 'arpeggio',
    params: {
      pitchBend: 0,
      volSpeed0: 12, volLevel0: 52, volSustain0: 1,
      volSpeed1: 3,  volLevel1: 44, volSustain1: 25,
      volSpeed2: 2,  volLevel2: 44, volSustain2: 0,
      volSpeed3: 5,  volLevel3: 0,  volSustain3: 0,
      volSpeed4: 0,  volLevel4: 0,  volSustain4: 0,
      vibSpeed0: 0, vibDelay0: 6, vibSustain0: 0,
      vibSpeed1: 3, vibDelay1: 0, vibSustain1: 20,
      vibSpeed2: 3, vibDelay2: 0, vibSustain2: 0,
      vibSpeed3: 0, vibDelay3: 0, vibSustain3: 0,
      vibSpeed4: 0, vibDelay4: 0, vibSustain4: 0,
    },
  },
];
