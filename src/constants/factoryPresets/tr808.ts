import type { InstrumentPreset } from '../../types/instrument';

// - Maracas: Highpass filtered white noise
// - Cymbal: 6-oscillator bank with 3-band filtering
// ============================================================================

export const TR808_PRESETS: InstrumentPreset['config'][] = [
  {
    type: 'synth' as const,
    name: '808 Kick',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'kick',
      machineType: '808',
      kick: {
        pitch: 48,              // 808: 48Hz base frequency
        pitchDecay: 110,        // 808: 110ms attack phase
        tone: 50,               // Filter cutoff control (200-300Hz)
        toneDecay: 20,          // Click decay
        decay: 200,             // 808: 50-300ms (user controlled)
        drive: 60,              // 808: soft clipping at 0.6 drive
        envAmount: 2.0,         // 808: pitch sweeps from ~98Hz to 48Hz
        envDuration: 110,       // 808: 110ms attack for pitch envelope
        filterFreq: 250,        // 808: ~200-300Hz lowpass (tone controlled)
      },
    },
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '808 Snare',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'snare',
      machineType: '808',
      snare: {
        pitch: 238,             // 808: 238Hz low oscillator
        pitchHigh: 476,         // 808: 476Hz high oscillator (harmonic)
        tone: 50,               // Snappy parameter controls noise/body mix
        toneDecay: 75,          // 808: 75ms noise decay
        snappy: 50,             // Noise amount (controlled by snappy knob)
        decay: 100,             // 808: ~100ms amplitude decay
        envAmount: 1.0,         // 808: no pitch envelope (flat)
        envDuration: 100,       // 808: 100ms
        filterType: 'highpass', // 808: highpass on noise
        filterFreq: 1300,       // 808: 800-1800Hz highpass (tone controlled)
      },
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '808 Clap',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'clap',
      machineType: '808',
      clap: {
        tone: 50,               // 808: 1000Hz bandpass
        decay: 115,             // 808: 115ms reverb tail decay
        toneDecay: 200,         // 808: sawtooth envelope repeating
        spread: 100,            // 808: 100ms sawtooth spacing (creates reverb)
        filterFreqs: [1000, 1000], // 808: single 1000Hz bandpass
        modulatorFreq: 10,      // Slower modulation than 909
      },
    },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '808 Rimshot',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'rimshot',
      machineType: '808',
      rimshot: {
        decay: 40,              // 808: 40ms
        filterFreqs: [480, 1750, 2450], // 808: different from 909
        filterQ: 5,             // 808: lower Q than 909
        saturation: 2.5,        // 808: swing VCA distortion
      },
    },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '808 Clave',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'clave',
      machineType: '808',
      clave: {
        decay: 40,              // 808: 40ms
        pitch: 2450,            // 808: 2450Hz triangle
        pitchSecondary: 1750,   // 808: 1750Hz sine
        filterFreq: 2450,       // 808: 2450Hz bandpass
      },
    },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '808 Cowbell',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'cowbell',
      machineType: '808',
      cowbell: {
        decay: 400,             // 808: 15ms short + 400ms exponential tail
        filterFreq: 2640,       // 808: 2640Hz bandpass
      },
    },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '808 Maracas',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'maracas',
      machineType: '808',
      maracas: {
        decay: 30,              // 808: 30ms quick shake
        filterFreq: 5000,       // 808: 5000Hz highpass
      },
    },
    effects: [],
    volume: -12,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '808 Low Tom',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'tom',
      machineType: '808',
      tom: {
        pitch: 90,              // 808: 80-100Hz range
        decay: 200,             // 808: 180-200ms
        tone: 20,               // 808: pink noise at 0.2 amplitude
        toneDecay: 155,         // 808: 100-155ms noise decay
        envAmount: 1.0,         // 808: minimal pitch sweep
        envDuration: 100,       // 808: 100ms
      },
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '808 Mid Tom',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'tom',
      machineType: '808',
      tom: {
        pitch: 140,             // 808: 120-160Hz range
        decay: 190,             // 808: slightly shorter
        tone: 20,               // 808: pink noise
        toneDecay: 130,         // 808: noise decay
        envAmount: 1.0,         // 808: minimal pitch sweep
        envDuration: 100,       // 808: 100ms
      },
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '808 Hi Tom',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'tom',
      machineType: '808',
      tom: {
        pitch: 190,             // 808: 165-220Hz range
        decay: 180,             // 808: 180ms
        tone: 20,               // 808: pink noise
        toneDecay: 100,         // 808: noise decay
        envAmount: 1.0,         // 808: minimal pitch sweep
        envDuration: 100,       // 808: 100ms
      },
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '808 Low Conga',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'conga',
      machineType: '808',
      conga: {
        pitch: 190,             // 808: 165-220Hz range
        decay: 180,             // 808: 180ms
        tuning: 50,             // Mid-range tuning
      },
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '808 Mid Conga',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'conga',
      machineType: '808',
      conga: {
        pitch: 280,             // 808: 250-310Hz range
        decay: 180,             // 808: 180ms
        tuning: 50,             // Mid-range tuning
      },
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '808 Hi Conga',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'conga',
      machineType: '808',
      conga: {
        pitch: 410,             // 808: 370-455Hz range
        decay: 180,             // 808: 180ms
        tuning: 50,             // Mid-range tuning
      },
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '808 Closed Hat',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'hihat',
      machineType: '808',
      hihat: {
        tone: 50,               // Dark/bright balance
        decay: 50,              // 808: 50ms (closed - muted)
        metallic: 50,           // 6-oscillator metallic character
      },
    },
    effects: [],
    volume: -12,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '808 Open Hat',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'hihat',
      machineType: '808',
      hihat: {
        tone: 50,               // Dark/bright balance
        decay: 270,             // 808: 90-450ms (decay × 3.6 + 90)
        metallic: 50,           // 6-oscillator metallic character
      },
    },
    effects: [],
    volume: -12,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '808 Cymbal',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'cymbal',
      machineType: '808',
      cymbal: {
        tone: 50,               // Low/high band balance
        decay: 3000,            // 808: 700-6800ms variable
      },
    },
    effects: [],
    volume: -14,
    pan: 0,
  },
];
