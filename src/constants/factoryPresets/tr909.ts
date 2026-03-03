import type { InstrumentPreset } from '../../types/instrument';

// TR-909 PRESETS (11) - Authentic Roland TR-909 drum machine sounds
// Based on er-99 web emulator analysis with accurate synthesis parameters
// ============================================================================

export const TR909_PRESETS: InstrumentPreset['config'][] = [
  {
    type: 'synth' as const,
    name: '909 Kick',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'kick',
      kick: {
        pitch: 80,              // 909: 80Hz base frequency
        pitchDecay: 50,         // Legacy parameter
        tone: 50,               // Click/noise amount
        toneDecay: 20,          // 909: 20ms noise decay
        decay: 300,             // 909: 300ms body decay
        drive: 50,              // 909: moderate saturation
        envAmount: 2.5,         // 909: 2.5x pitch envelope multiplier
        envDuration: 50,        // 909: 50ms pitch envelope
        filterFreq: 3000,       // 909: 3000Hz lowpass
      },
    },
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '909 Snare',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'snare',
      snare: {
        pitch: 220,             // 909: 220Hz body frequency
        tone: 25,               // 909: 25% body/snap balance
        toneDecay: 250,         // 909: 250ms noise decay
        snappy: 70,             // Noise amount
        decay: 100,             // 909: 100ms body decay
        envAmount: 4.0,         // 909: 4.0x aggressive pitch envelope
        envDuration: 10,        // 909: 10ms very fast pitch drop
        filterType: 'notch',    // 909: notch filter characteristic
        filterFreq: 1000,       // 909: 1000Hz notch
      },
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '909 Clap',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'clap',
      clap: {
        tone: 55,               // ~2200Hz bandpass
        decay: 80,              // 909: 80ms overall decay
        toneDecay: 250,         // 909: 250ms individual burst decay
        spread: 10,             // 909: 10ms burst spacing (creates the clap texture)
        filterFreqs: [900, 1200], // 909: serial bandpass filters
        modulatorFreq: 40,      // 909: 40Hz sawtooth modulator
      },
    },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '909 Rim',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'rimshot',
      rimshot: {
        decay: 30,              // 909: 30ms (very short, punchy)
        filterFreqs: [220, 500, 950], // 909: parallel resonant bandpass
        filterQ: 10.5,          // 909: very high Q for metallic resonance
        saturation: 3.0,        // 909: heavy saturation for punch
      },
    },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '909 Low Tom',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'tom',
      tom: {
        pitch: 100,             // 909: 100Hz (with +100Hz offset)
        decay: 200,             // 909: 200ms
        tone: 5,                // 909: 5% noise
        toneDecay: 100,         // 909: 100ms noise decay
        envAmount: 2.0,         // 909: 2.0x pitch envelope
        envDuration: 100,       // 909: 100ms pitch envelope
      },
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '909 Mid Tom',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'tom',
      tom: {
        pitch: 200,             // 909: 200Hz (with -50Hz offset)
        decay: 200,             // 909: 200ms
        tone: 5,                // 909: 5% noise
        toneDecay: 100,         // 909: 100ms noise decay
        envAmount: 2.0,         // 909: 2.0x pitch envelope
        envDuration: 100,       // 909: 100ms pitch envelope
      },
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '909 Hi Tom',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'tom',
      tom: {
        pitch: 300,             // 909: 300Hz (with -80Hz offset)
        decay: 200,             // 909: 200ms
        tone: 5,                // 909: 5% noise
        toneDecay: 100,         // 909: 100ms noise decay
        envAmount: 2.0,         // 909: 2.0x pitch envelope
        envDuration: 100,       // 909: 100ms pitch envelope
      },
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '909 Closed Hat',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'hihat',
      hihat: {
        tone: 60,
        decay: 50,              // Short decay for closed
        metallic: 65,
      },
    },
    effects: [],
    volume: -12,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '909 Open Hat',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'hihat',
      hihat: {
        tone: 55,
        decay: 350,             // Longer decay for open
        metallic: 60,
      },
    },
    effects: [],
    volume: -12,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '909 Ride',
    synthType: 'MetalSynth',
    oscillator: { type: 'square', detune: 0, octave: 0 },
    envelope: { attack: 1, decay: 800, sustain: 0.1, release: 500 },
    filter: { type: 'highpass', frequency: 5000, Q: 1, rolloff: -12 },
    effects: [],
    volume: -14,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '909 Crash',
    synthType: 'MetalSynth',
    oscillator: { type: 'square', detune: 0, octave: 0 },
    envelope: { attack: 5, decay: 2000, sustain: 0.05, release: 1500 },
    filter: { type: 'highpass', frequency: 4000, Q: 1, rolloff: -12 },
    effects: [],
    volume: -14,
    pan: 0,
  },
];
