import { type ComplianceTestCase } from '../ComplianceRunner';

/**
 * Volume Column Compliance Tests (XM and IT)
 * Covers: Vibrato speed/depth, Panning slides, Tone Portamento in volume column
 */
export const volumeColumnCases: ComplianceTestCase[] = [
  {
    name: 'XM VolCol: Vibrato Speed (Ax)',
    format: 'XM',
    steps: [
      { row: 0, volume: 0xA4 }, // Set vibrato speed to 4
      { row: 1, effect: '400', expected: [{ tick: 1, period: 4544 + 0 }] } // Speed 4 in vol col, depth 0 in eff col -> no change
    ]
  },
  {
    name: 'XM VolCol: Vibrato Depth (Bx)',
    format: 'XM',
    initialState: { period: 4544, vibratoSpeed: 4 },
    steps: [
      { row: 0, volume: 0xB2, expected: [{ tick: 1, period: 4544 + Math.floor(0.38 * 2 * 4) }] } // B2: Vibrato depth 2
    ]
  },
  {
    name: 'XM VolCol: Pan Slide Left (Dx)',
    format: 'XM',
    initialState: { pan: 128 },
    steps: [
      { row: 0, volume: 0xD2, expected: [{ tick: 1, pan: 126 }, { tick: 2, pan: 124 }] }
    ]
  },
  {
    name: 'XM VolCol: Pan Slide Right (Ex)',
    format: 'XM',
    initialState: { pan: 128 },
    steps: [
      { row: 0, volume: 0xE2, expected: [{ tick: 1, pan: 130 }, { tick: 2, pan: 132 }] }
    ]
  },
  {
    name: 'XM VolCol: Tone Porta (Fx)',
    format: 'XM',
    initialState: { period: 4544, portamentoTarget: 4000 },
    steps: [
      { row: 0, volume: 0xF2, expected: [{ tick: 1, period: 4544 - 2*16*4 }] } // F2: Speed 2*16 = 32
    ]
  },
  {
    name: 'IT VolCol: Volume Slide Up (Cx)',
    format: 'IT',
    initialState: { volume: 32 },
    steps: [
      { row: 0, volume: 0x62, expected: [{ tick: 1, volume: 34 }] } // 6x in IT is volume slide up (nibbles are reversed vs XM)
    ]
  },
  {
    name: 'IT VolCol: Volume Slide Down (Dx)',
    format: 'IT',
    initialState: { volume: 32 },
    steps: [
      { row: 0, volume: 0x72, expected: [{ tick: 1, volume: 30 }] } // 7x in IT is volume slide down
    ]
  },
  {
    name: 'IT VolCol: Fine Vol Up (Ex)',
    format: 'IT',
    initialState: { volume: 32 },
    steps: [
      { row: 0, volume: 0x82, expected: [{ tick: 0, volume: 34 }] } // 8x: Fine Up
    ]
  },
  {
    name: 'IT VolCol: Fine Vol Down (Fx)',
    format: 'IT',
    initialState: { volume: 32 },
    steps: [
      { row: 0, volume: 0x92, expected: [{ tick: 0, volume: 30 }] } // 9x: Fine Down
    ]
  },
  {
    name: 'XM VolCol: Set Pan (Cx)',
    format: 'XM',
    steps: [
      { row: 0, volume: 0xC8, expected: [{ tick: 0, pan: 128 }] } // C8: Set pan to 8*16 = 128
    ]
  }
];
