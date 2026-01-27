import { type ComplianceTestCase } from '../ComplianceRunner';

/**
 * XM Envelope Compliance Tests
 * Based on OpenMPT Test Cases: EnvLoops.xm, EnvOff.xm, NoteOffFadeNoEnv.xm
 */
export const envelopeCases: ComplianceTestCase[] = [
  {
    name: 'XM Volume Envelope Linear Interpolation',
    format: 'XM',
    volumeEnvelope: {
      enabled: true,
      points: [
        { tick: 0, value: 0 },
        { tick: 4, value: 64 }
      ],
      sustainPoint: null,
      loopStartPoint: null,
      loopEndPoint: null,
    },
    steps: [
      { 
        row: 0, 
        note: 'C-3', 
        expected: [{ tick: 0, envelopeVolume: 0 }] 
      },
      {
        row: 1, // Note continues
        expected: [{ tick: 0, envelopeVolume: 64 }] // At Row 1 Tick 0 (Total ticks = 6), envelope reaches end (64)
      }
    ]
  },
  {
    name: 'XM Volume Envelope Sustain',
    format: 'XM',
    volumeEnvelope: {
      enabled: true,
      points: [
        { tick: 0, value: 64 },
        { tick: 10, value: 32 }
      ],
      sustainPoint: 0, // Sustain at peak
      loopStartPoint: null,
      loopEndPoint: null,
    },
    steps: [
      { 
        row: 0, 
        note: 'C-3', 
        expected: [{ tick: 5, envelopeVolume: 64 }] // Held at sustain point
      },
      {
        row: 1,
        note: '===', // Note Off at Row 1 Tick 0
        expected: [{ tick: 4, envelopeVolume: 51 }] // Released for 4 ticks: 64 - 12.8 = 51.2, rounded to 51
      }
    ]
  }
];
