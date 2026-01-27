import { type ComplianceTestCase } from '../ComplianceRunner';

export const s3mCases: ComplianceTestCase[] = [

  {

    name: 'Dxy Volume Slide Priority',

    format: 'S3M',

    initialState: { volume: 32 },

    steps: [

      { row: 0, effect: 'D11', expected: [{ tick: 1, volume: 33 }] } // Tick 0: no slide, Tick 1: up takes priority

    ]

  },

  {

    name: 'Fine Portamento (FFx/EFx)',

    format: 'S3M',

    initialState: { period: 428 },

    steps: [

      { row: 0, effect: 'FF1', expected: [{ tick: 0, period: 428 - 4 }] }, // FF1: Fine Porta Up (1*4 units)

      { row: 1, effect: 'EF1', expected: [{ tick: 0, period: 424 + 4 }] }  // EF1: Fine Porta Down (1*4 units)

    ]

  },

  {

    name: 'Period Limit (Lower)',

    format: 'S3M',

    initialState: { period: 66 },

    steps: [

      { row: 0, effect: 'F01', expected: [{ tick: 1, period: 64 }] } // 66 - 4 = 62, should clamp to 64

    ]

  },

  {

    name: 'Period Stop (0)',

    format: 'S3M',

    initialState: { period: 4 },

    steps: [

      { row: 0, effect: 'F01', expected: [{ tick: 1, cutNote: true }] } // 4 - 4 = 0, should stop

    ]

  },

  {

    name: 'Unified Param Memory',

    format: 'S3M',

    initialState: { volume: 32, period: 428 },

    steps: [

      { row: 0, effect: 'D10' }, // Set memory to 0x10

      { row: 1, effect: 'E00', expected: [{ tick: 1, period: 428 + 16*4 }] } 

    ]

  }

];
