import { type ComplianceTestCase } from '../ComplianceRunner';

export const panningEnvelopeCases: ComplianceTestCase[] = [
  {
    name: 'XM Panning Envelope Linear Interpolation',
    format: 'XM',
    panningEnvelope: {
      enabled: true,
      points: [
        { tick: 0, value: 32 }, // Center
        { tick: 10, value: 64 } // Full Right
      ],
      sustainPoint: null,
      loopStartPoint: null,
      loopEndPoint: null,
    },
    initialState: { 
      pan: 128, // Center
    },
    steps: [
      { 
        row: 0, 
        note: 'C-4',
        expected: [
          { tick: 0, envelopePanning: 32 },
          { tick: 5, envelopePanning: 48 }
        ]
      }
    ]
  },
  {
    name: 'IT Filter Envelope Modulation',
    format: 'IT',
    pitchEnvelope: {
      enabled: true,
      points: [
        { tick: 0, value: 32 }, // No offset
        { tick: 10, value: 64 } // +32 offset
      ],
      sustainPoint: null,
      loopStartPoint: null,
      loopEndPoint: null,
    },
    steps: [
      {
        row: 0,
        note: 'C-4',
        effect: 'Z7F', // Cutoff 127
        expected: [
          { tick: 0, envelopePitch: 32 },
          { tick: 5, envelopePitch: 48 }
        ]
      }
    ]
  }
];
