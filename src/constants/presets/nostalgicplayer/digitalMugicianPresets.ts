/**
 * Digital Mugician synth presets — 16 instrument effects, arpeggio, volume/pitch envelopes
 *
 * Each preset defines instrument parameters for dm_set_instrument_param().
 * Categories: bass, lead, pad, drum, fx, arpeggio
 *
 * Instrument effects (DmInstrumentEffect):
 *   0=None, 1=Filter, 2=Mixing, 3=ScrLeft, 4=ScrRight, 5=Upsample,
 *   6=Downsample, 7=Negate, 8=MadMix1, 9=Addition, 10=Filter2,
 *   11=Morphing, 12=MorphF, 13=Filter3, 14=Polygate, 15=Colgate
 *
 * Volume: 0-64. finetune: uint8. volumeLoop/pitchLoop: 0 or 1.
 * effectSpeed/effectIndex: uint8. delay: uint8.
 */

export interface DigitalMugicianPreset {
  name: string;
  category: 'bass' | 'lead' | 'pad' | 'drum' | 'fx' | 'arpeggio';
  params: Record<string, number>;
}

export const DIGITAL_MUGICIAN_PRESETS: DigitalMugicianPreset[] = [
  // -- Bass ------------------------------------------------------------------
  {
    name: 'Filter Sub Bass',
    category: 'bass',
    params: {
      waveformNumber: 0,
      loopLength: 64,
      finetune: 0,
      arpeggioNumber: 0,
      volume: 64,
      volumeSpeed: 2,
      volumeLoop: 1,
      pitch: 0,
      pitchSpeed: 0,
      pitchLoop: 0,
      delay: 0,
      effect: 1, // Filter
      effectSpeed: 3,
      effectIndex: 0,
    },
  },
  {
    name: 'Morphing Bass',
    category: 'bass',
    params: {
      waveformNumber: 0,
      loopLength: 64,
      finetune: 0,
      arpeggioNumber: 0,
      volume: 60,
      volumeSpeed: 3,
      volumeLoop: 1,
      pitch: 0,
      pitchSpeed: 1,
      pitchLoop: 0,
      delay: 0,
      effect: 11, // Morphing
      effectSpeed: 4,
      effectIndex: 1,
    },
  },
  {
    name: 'Negate Punch Bass',
    category: 'bass',
    params: {
      waveformNumber: 0,
      loopLength: 32,
      finetune: 0,
      arpeggioNumber: 0,
      volume: 62,
      volumeSpeed: 4,
      volumeLoop: 0,
      pitch: 0,
      pitchSpeed: 0,
      pitchLoop: 0,
      delay: 0,
      effect: 7, // Negate
      effectSpeed: 6,
      effectIndex: 0,
    },
  },

  // -- Lead ------------------------------------------------------------------
  {
    name: 'Filter Sweep Lead',
    category: 'lead',
    params: {
      waveformNumber: 0,
      loopLength: 32,
      finetune: 0,
      arpeggioNumber: 0,
      volume: 56,
      volumeSpeed: 2,
      volumeLoop: 1,
      pitch: 0,
      pitchSpeed: 2,
      pitchLoop: 1,
      delay: 0,
      effect: 10, // Filter2
      effectSpeed: 5,
      effectIndex: 0,
    },
  },
  {
    name: 'MadMix Lead',
    category: 'lead',
    params: {
      waveformNumber: 0,
      loopLength: 32,
      finetune: 0,
      arpeggioNumber: 0,
      volume: 58,
      volumeSpeed: 3,
      volumeLoop: 1,
      pitch: 0,
      pitchSpeed: 0,
      pitchLoop: 0,
      delay: 0,
      effect: 8, // MadMix1
      effectSpeed: 4,
      effectIndex: 1,
    },
  },
  {
    name: 'Scroll Lead',
    category: 'lead',
    params: {
      waveformNumber: 0,
      loopLength: 32,
      finetune: 0,
      arpeggioNumber: 0,
      volume: 54,
      volumeSpeed: 2,
      volumeLoop: 1,
      pitch: 0,
      pitchSpeed: 1,
      pitchLoop: 1,
      delay: 0,
      effect: 3, // ScrLeft
      effectSpeed: 6,
      effectIndex: 0,
    },
  },

  // -- Pad -------------------------------------------------------------------
  {
    name: 'MorphF Evolving Pad',
    category: 'pad',
    params: {
      waveformNumber: 0,
      loopLength: 128,
      finetune: 0,
      arpeggioNumber: 0,
      volume: 44,
      volumeSpeed: 1,
      volumeLoop: 1,
      pitch: 0,
      pitchSpeed: 0,
      pitchLoop: 0,
      delay: 4,
      effect: 12, // MorphF
      effectSpeed: 2,
      effectIndex: 1,
    },
  },
  {
    name: 'Filter3 Warm Pad',
    category: 'pad',
    params: {
      waveformNumber: 0,
      loopLength: 128,
      finetune: 0,
      arpeggioNumber: 0,
      volume: 42,
      volumeSpeed: 1,
      volumeLoop: 1,
      pitch: 0,
      pitchSpeed: 0,
      pitchLoop: 0,
      delay: 6,
      effect: 13, // Filter3
      effectSpeed: 1,
      effectIndex: 0,
    },
  },
  {
    name: 'Addition Texture Pad',
    category: 'pad',
    params: {
      waveformNumber: 0,
      loopLength: 64,
      finetune: 0,
      arpeggioNumber: 0,
      volume: 40,
      volumeSpeed: 1,
      volumeLoop: 1,
      pitch: 0,
      pitchSpeed: 0,
      pitchLoop: 0,
      delay: 8,
      effect: 9, // Addition
      effectSpeed: 2,
      effectIndex: 1,
    },
  },

  // -- Drum ------------------------------------------------------------------
  {
    name: 'Synth Kick',
    category: 'drum',
    params: {
      waveformNumber: 0,
      loopLength: 0,
      finetune: 0,
      arpeggioNumber: 0,
      volume: 64,
      volumeSpeed: 8,
      volumeLoop: 0,
      pitch: 12,
      pitchSpeed: 6,
      pitchLoop: 0,
      delay: 0,
      effect: 7, // Negate
      effectSpeed: 12,
      effectIndex: 0,
    },
  },
  {
    name: 'Mixing Snare',
    category: 'drum',
    params: {
      waveformNumber: 0,
      loopLength: 0,
      finetune: 0,
      arpeggioNumber: 0,
      volume: 60,
      volumeSpeed: 10,
      volumeLoop: 0,
      pitch: 0,
      pitchSpeed: 4,
      pitchLoop: 0,
      delay: 0,
      effect: 2, // Mixing
      effectSpeed: 16,
      effectIndex: 1,
    },
  },
  {
    name: 'Polygate Hat',
    category: 'drum',
    params: {
      waveformNumber: 0,
      loopLength: 0,
      finetune: 0,
      arpeggioNumber: 0,
      volume: 48,
      volumeSpeed: 12,
      volumeLoop: 0,
      pitch: 0,
      pitchSpeed: 0,
      pitchLoop: 0,
      delay: 0,
      effect: 14, // Polygate
      effectSpeed: 20,
      effectIndex: 0,
    },
  },

  // -- FX --------------------------------------------------------------------
  {
    name: 'Upsample Zap',
    category: 'fx',
    params: {
      waveformNumber: 0,
      loopLength: 32,
      finetune: 0,
      arpeggioNumber: 0,
      volume: 64,
      volumeSpeed: 6,
      volumeLoop: 0,
      pitch: 8,
      pitchSpeed: 8,
      pitchLoop: 0,
      delay: 0,
      effect: 5, // Upsample
      effectSpeed: 10,
      effectIndex: 0,
    },
  },
  {
    name: 'Downsample Sweep',
    category: 'fx',
    params: {
      waveformNumber: 0,
      loopLength: 64,
      finetune: 0,
      arpeggioNumber: 0,
      volume: 56,
      volumeSpeed: 3,
      volumeLoop: 0,
      pitch: 0,
      pitchSpeed: 4,
      pitchLoop: 0,
      delay: 0,
      effect: 6, // Downsample
      effectSpeed: 6,
      effectIndex: 0,
    },
  },
  {
    name: 'Colgate Glitch',
    category: 'fx',
    params: {
      waveformNumber: 0,
      loopLength: 32,
      finetune: 0,
      arpeggioNumber: 0,
      volume: 52,
      volumeSpeed: 4,
      volumeLoop: 1,
      pitch: 0,
      pitchSpeed: 2,
      pitchLoop: 1,
      delay: 0,
      effect: 15, // Colgate
      effectSpeed: 8,
      effectIndex: 0,
    },
  },

  // -- Arpeggio --------------------------------------------------------------
  {
    name: 'Clean Chip Arp',
    category: 'arpeggio',
    params: {
      waveformNumber: 0,
      loopLength: 32,
      finetune: 0,
      arpeggioNumber: 1,
      volume: 56,
      volumeSpeed: 2,
      volumeLoop: 1,
      pitch: 0,
      pitchSpeed: 0,
      pitchLoop: 0,
      delay: 0,
      effect: 0, // None
      effectSpeed: 0,
      effectIndex: 0,
    },
  },
  {
    name: 'ScrRight Arp',
    category: 'arpeggio',
    params: {
      waveformNumber: 0,
      loopLength: 32,
      finetune: 0,
      arpeggioNumber: 1,
      volume: 52,
      volumeSpeed: 3,
      volumeLoop: 1,
      pitch: 0,
      pitchSpeed: 0,
      pitchLoop: 0,
      delay: 0,
      effect: 4, // ScrRight
      effectSpeed: 4,
      effectIndex: 0,
    },
  },
  {
    name: 'Morphing Arp',
    category: 'arpeggio',
    params: {
      waveformNumber: 0,
      loopLength: 32,
      finetune: 0,
      arpeggioNumber: 1,
      volume: 50,
      volumeSpeed: 2,
      volumeLoop: 1,
      pitch: 0,
      pitchSpeed: 1,
      pitchLoop: 1,
      delay: 0,
      effect: 11, // Morphing
      effectSpeed: 3,
      effectIndex: 1,
    },
  },
];
