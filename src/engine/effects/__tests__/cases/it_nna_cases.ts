import { type ComplianceTestCase } from '../ComplianceRunner';

export const itNNACases: ComplianceTestCase[] = [
  {
    name: 'IT NNA Continue',
    format: 'IT',
    initialState: {
      activeInstrument: {
        envelopes: {
          volumeEnvelope: {
            enabled: true,
            points: [
              { tick: 0, value: 64 },
              { tick: 10, value: 0 }
            ],
            sustainPoint: null,
            loopStartPoint: null,
            loopEndPoint: null,
          }
        }
      } as any
    },
    steps: [
      { 
        row: 0, 
        note: 'C-4',
        instrument: 1,
        expected: [{ tick: 0, envelopeVolume: 64 }]
      },
      {
        row: 1,
        note: 'E-4', // New note on same channel
        instrument: 1,
        // NNA Continue: old note should still be playing its envelope
        expected: [
          { tick: 0, envelopeVolume: 64 },
          { tick: 5, envelopeVolumePast: 32 } // Old note at tick 11 total
        ]
      }
    ]
  },
  {
    name: 'IT NNA Note Off',
    format: 'IT',
    initialState: {
      activeInstrument: {
        envelopes: {
          volumeEnvelope: {
            enabled: true,
            points: [
              { tick: 0, value: 64 },
              { tick: 10, value: 0 }
            ],
            sustainPoint: 0, // Sustain at peak
            loopStartPoint: null,
            loopEndPoint: null,
          }
        }
      } as any
    },
    steps: [
      { 
        row: 0, 
        note: 'C-4',
        instrument: 1,
        expected: [{ tick: 5, envelopeVolume: 64 }] // Sustained
      },
      {
        row: 1,
        note: 'E-4', // New note with NNA Note Off
        instrument: 1,
        effect: 'S72', // Set NNA to Note Off
        expected: [
          { tick: 0, envelopeVolume: 64 }, // New note at start
          { tick: 5, envelopeVolumePast: 32 } // Old note released for 5 ticks
        ]
      }
    ]
  },
  {
    name: 'IT NNA Note Fade',
    format: 'IT',
    initialState: {
      activeInstrument: {
        envelopes: {
          volumeEnvelope: {
            enabled: true,
            points: [
              { tick: 0, value: 64 },
              { tick: 10, value: 64 }
            ],
            sustainPoint: 0,
            loopStartPoint: null,
            loopEndPoint: null,
          }
        },
        fadeout: 1024 // Fade out by 1024 units per tick (1/64 of max 65536)
      } as any
    },
    steps: [
      { 
        row: 0, 
        note: 'C-4',
        instrument: 1,
        expected: [{ tick: 5, envelopeVolume: 64 }]
      },
      {
        row: 1,
        note: 'E-4', 
        instrument: 1,
        effect: 'S73', // Set NNA to Note Fade
        expected: [
          { tick: 0, envelopeVolume: 64 },
          // After 6 ticks of fading at 1024 per tick (Tick 0 to Tick 5):
          // fadeout = 65536 - 6 * 1024 = 59392
          // multiplier = 59392 / 65536 = 0.90625
          // volume = 64 * 0.90625 = 58
          { tick: 5, envelopeVolumePast: 58 } 
        ]
      }
    ]
  }
];