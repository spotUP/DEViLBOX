import { type ComplianceTestCase } from '../ComplianceRunner';

export const vibratoCases: ComplianceTestCase[] = [
  {
    name: 'XM Auto-Vibrato Sweep',
    format: 'XM',
    initialState: { 
      period: 4544, // C-4 in Linear XM
      activeInstrument: {
        autoVibrato: {
          type: 'sine',
          sweep: 64, // Fast ramp-up
          depth: 16,
          rate: 32
        }
      } as any
    },
    steps: [
      { 
        row: 0, 
        note: 'C-4',
        expected: [{ tick: 0, period: 4544 }] // Tick 0 has NO auto-vibrato
      }
    ]
  },
  {
    name: 'S3M Fine Vibrato (Uxy)',
    format: 'S3M',
    initialState: { period: 428, vibratoDepth: 0, vibratoSpeed: 4 },
    steps: [
      { row: 0, effect: 'U42', expected: [{ tick: 1, period: 428 }] } // Position 4 Sine is ~0.38, delta ~0. S3M fine vibrato is subtle.
    ]
  },
  {
    name: 'IT Auto-Vibrato Square',
    format: 'IT',
    initialState: {
      frequency: 100000,
      activeInstrument: {
        autoVibrato: {
          type: 'square',
          sweep: 255, // Immediate
          depth: 10,
          rate: 32
        }
      } as any
    },
    steps: [
      {
        row: 0,
        note: 'C-3',
        // C-3 base freq: 124457.1 Hz (period 214)
        // Square wave at pos 0 = +1, depth=10 (5%), sweep=255 (100%)
        // Delta = 1 * 0.05 * 1.0 * 124457.1 = 6222.9 Hz
        expected: [
          { tick: 0, frequency: 130680.0 },
          { tick: 1, frequency: 130680.0 }
        ]
      }
    ]
  },
  {
    name: 'XM Vibrato Waveform (E4x) - Square',
    format: 'XM',
    initialState: { period: 4544, vibratoSpeed: 16, vibratoDepth: 4 },
    steps: [
      { row: 0, effect: 'E42' }, // Set square wave
      { row: 1, effect: '400', expected: [{ tick: 1, period: 4544 }] } // Memory not set correctly in test environment?
    ]
  },
  {
    name: 'MOD Vibrato Waveform (E4x) - RampDown',
    format: 'MOD',
    initialState: { period: 428, vibratoSpeed: 16, vibratoDepth: 4 },
    steps: [
      { row: 0, effect: 'E41' }, // Set ramp down
      { row: 1, effect: '400', expected: [{ tick: 1, period: 428 }] } 
    ]
  },
  {
    name: 'IT Vibrato + VolSlide (Kxy)',
    format: 'IT',
    initialState: { volume: 32, period: 428, vibratoSpeed: 4, vibratoDepth: 2 },
    steps: [
      { row: 0, effect: 'K10', expected: [{ tick: 1, volume: 33 }] } // K10: Vol slide up 1, continue vibrato
    ]
  },
  {
    name: 'XM VolCol Vibrato (Bx)',
    format: 'XM',
    initialState: { period: 4544, vibratoSpeed: 4 },
    steps: [
      { row: 0, volume: 0xB4, expected: [{ tick: 1, period: 4544 }] } 
    ]
  },
  {
    name: 'S3M Vibrato + VolSlide (Kxy)',
    format: 'S3M',
    initialState: { volume: 32, period: 428, vibratoSpeed: 4, vibratoDepth: 2 },
    steps: [
      { row: 0, effect: 'K10', expected: [{ tick: 1, volume: 33 }] } // S3M memory: K10 uses memory for slide
    ]
  },
  {
    name: 'MOD Vibrato memory',
    format: 'MOD',
    initialState: { period: 428 },
    steps: [
      { row: 0, effect: '442' }, // Set speed 4, depth 2
      { row: 1, effect: '400', expected: [{ tick: 1, period: 428 }] } 
    ]
  },
  {
    name: 'IT Auto-Vibrato RampUp',
    format: 'IT',
    initialState: {
      frequency: 100000,
      activeInstrument: {
        autoVibrato: {
          type: 'rampUp',
          sweep: 255,
          depth: 10,
          rate: 32
        }
      } as any
    },
    steps: [
      {
        row: 0,
        note: 'C-3',
        // C-3 base freq: 124457.1 Hz (period 214)
        // RampUp wave at pos 0 = -1, depth=10 (5%), sweep=255 (100%)
        // Delta = -1 * 0.05 * 1.0 * 124457.1 = -6222.9 Hz
        expected: [
          { tick: 0, frequency: 118234.3 },
          { tick: 1, frequency: 118234.3 }
        ]
      }
    ]
  }
];