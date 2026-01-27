import { type ComplianceTestCase } from '../ComplianceRunner';

export const legacyCases: ComplianceTestCase[] = [
  {
    name: 'M15 SoundTracker (MOD)',
    format: 'MOD',
    steps: [
      { row: 0, effect: 'C40', expected: [{ tick: 0, volume: 64 }] } // Volume 64
    ]
  },
  {
    name: 'Scream Tracker 2 (STM)',
    format: 'S3M',
    steps: [
      { row: 0, effect: 'A01', expected: [{ tick: 0, period: 0 }] } // STM Set Speed
    ]
  },
  {
    name: 'MultiTracker (MTM)',
    format: 'MTM' as any,
    steps: [
      { row: 0, effect: 'A01', expected: [{ tick: 0, period: 0 }] }
    ]
  },
  {
    name: 'DigiBooster Pro (DBM)',
    format: 'DBM' as any,
    steps: [
      { row: 0, effect: 'C40', expected: [{ tick: 0, volume: 64 }] }
    ]
  },
  {
    name: 'ProTracker 3.6 (PT36)',
    format: 'PT36' as any,
    steps: [
      { row: 0, effect: 'E01', expected: [{ tick: 0, period: 0 }] }
    ]
  }
];
