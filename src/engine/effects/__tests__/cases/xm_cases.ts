import { type ComplianceTestCase } from '../ComplianceRunner';

export const xmCases: ComplianceTestCase[] = [
  {
    name: 'Dxx Pattern Break Hex',
    format: 'XM',
    steps: [
      { row: 0, effect: 'D10', expected: [{ tick: 0, period: 0 }] }, // D10 = row 16
    ]
  },
  {
    name: 'Volume Column Fine Slides',
    format: 'XM',
    initialState: { volume: 32 },
    steps: [
      { row: 0, volume: 0x81, expected: [{ tick: 0, volume: 31 }] }, // 8x Fine Down
      { row: 1, volume: 0x91, expected: [{ tick: 0, volume: 32 }] }  // 9x Fine Up
    ]
  },
  {
    name: 'Arpeggio Backwards (Speed 6)',
    format: 'XM',
    initialState: { period: 4544, finetune: 0 }, // C-4
    steps: [
      { 
        row: 0, 
        effect: '037', 
        expected: [
          { tick: 0, period: 4544 }, // Tick 0 has NO arpeggio modulation
          { tick: 1, period: 4352 }  // Tick 1: 4544 - 3*64 = 4352
        ]
      }
    ]
  },
  {
    name: 'XM Auto-Vibrato Sweep',
    format: 'XM',
    initialState: { 
      period: 4544, // C-4
      activeInstrument: {
        autoVibrato: {
          type: 'sine',
          sweep: 64,
          depth: 16,
          rate: 32
        }
      } as any
    },
    steps: [
      { 
        row: 0, 
        note: 'C-4',
        expected: [
          { tick: 0, period: 4544 } // Tick 0 has NO auto-vibrato
        ]
      }
    ]
  },
  {
    name: 'XM Auto-Vibrato Sweep Full',
    format: 'XM',
    initialState: { 
      period: 4544, // C-4
      activeInstrument: {
        autoVibrato: {
          type: 'square',
          sweep: 64,
          depth: 16,
          rate: 32
        }
      } as any
    },
    // Enable linear slides for accurate XM simulation
    steps: [
      { 
        row: 0, 
        note: 'C-4',
        expected: [
          { tick: 0, period: 4544 }, // T0: Sweep=0
          // Square(0) = 1.0
          // T1: Sweep=64. autoDelta = (1.0 * 16 * 64) / 128 = 8.
          // period = 4544 + 8 = 4552.
          { tick: 1, period: 4552 }
        ]
      }
    ]
  },
  {
    name: 'Multi-Retrig (Rxy) Volume',
    format: 'XM',
    initialState: { volume: 64 },
    steps: [
      { row: 0, effect: 'R11', expected: [{ tick: 1, volume: 63 }] } // R11: Retrig every 1 tick, x=1 (vol-1)
    ]
  },
  {
    name: 'Pan Slide Left Zero (P00)',
    format: 'XM',
    initialState: { pan: 128 },
    steps: [
      { row: 0, volume: 0xD0, expected: [{ tick: 1, pan: 0 }] } // D0 (Slide Left 0) resets pan to 0 on all ticks but T0
    ]
  }
];
