/**
 * BPM Sync Utilities
 *
 * Pure utility module for computing BPM-synced timing values.
 * No Tone.js or React dependencies.
 */

// All supported musical subdivisions
export type SyncDivision =
  | '1/1' | '1/2' | '1/4' | '1/8' | '1/16' | '1/32'
  | '1/2d' | '1/4d' | '1/8d' | '1/16d'
  | '1/2t' | '1/4t' | '1/8t';

/**
 * Multipliers relative to one quarter note.
 * 1/4 = 1.0 beat, 1/8 = 0.5, dotted = 1.5×, triplet = 2/3×
 */
export const DIVISION_MULTIPLIERS: Record<SyncDivision, number> = {
  '1/1':  4.0,
  '1/2':  2.0,
  '1/4':  1.0,
  '1/8':  0.5,
  '1/16': 0.25,
  '1/32': 0.125,
  '1/2d': 3.0,     // dotted half = 2 * 1.5
  '1/4d': 1.5,     // dotted quarter
  '1/8d': 0.75,    // dotted eighth
  '1/16d': 0.375,  // dotted sixteenth
  '1/2t': 4 / 3,   // half-note triplet
  '1/4t': 2 / 3,   // quarter-note triplet
  '1/8t': 1 / 3,   // eighth-note triplet
};

/** Convert BPM + division to milliseconds */
export function bpmToMs(bpm: number, division: SyncDivision): number {
  const quarterMs = 60000 / bpm;
  return quarterMs * DIVISION_MULTIPLIERS[division];
}

/** Convert BPM + division to seconds */
export function bpmToSeconds(bpm: number, division: SyncDivision): number {
  return bpmToMs(bpm, division) / 1000;
}

/** Convert BPM + division to Hz (for LFO-rate effects like chorus/phaser) */
export function bpmToHz(bpm: number, division: SyncDivision): number {
  const ms = bpmToMs(bpm, division);
  return 1000 / ms;
}

/** Grouped divisions for UI dropdown */
export const SYNC_DIVISIONS: { value: SyncDivision; label: string; category: 'Straight' | 'Dotted' | 'Triplet' }[] = [
  { value: '1/1',  label: '1/1',   category: 'Straight' },
  { value: '1/2',  label: '1/2',   category: 'Straight' },
  { value: '1/4',  label: '1/4',   category: 'Straight' },
  { value: '1/8',  label: '1/8',   category: 'Straight' },
  { value: '1/16', label: '1/16',  category: 'Straight' },
  { value: '1/32', label: '1/32',  category: 'Straight' },
  { value: '1/2d', label: '1/2.',  category: 'Dotted' },
  { value: '1/4d', label: '1/4.',  category: 'Dotted' },
  { value: '1/8d', label: '1/8.',  category: 'Dotted' },
  { value: '1/16d', label: '1/16.', category: 'Dotted' },
  { value: '1/2t', label: '1/2T',  category: 'Triplet' },
  { value: '1/4t', label: '1/4T',  category: 'Triplet' },
  { value: '1/8t', label: '1/8T',  category: 'Triplet' },
];

/**
 * Maps effect types to their syncable parameter(s).
 * unit: 'seconds' | 'ms' | 'hz' | 'normalized'
 */
export const SYNCABLE_EFFECT_PARAMS: Record<string, { param: string; unit: 'seconds' | 'ms' | 'hz' | 'normalized' }[]> = {
  Delay:          [{ param: 'time', unit: 'seconds' }],
  FeedbackDelay:  [{ param: 'time', unit: 'seconds' }],
  PingPongDelay:  [{ param: 'time', unit: 'seconds' }],
  SpaceEcho:      [{ param: 'rate', unit: 'ms' }],
  SpaceyDelayer:  [{ param: 'firstTap', unit: 'ms' }],
  RETapeEcho:     [{ param: 'repeatRate', unit: 'normalized' }],
  Chorus:         [{ param: 'frequency', unit: 'hz' }],
  BiPhase:        [{ param: 'rateA', unit: 'hz' }],
};

/**
 * Compute the final synced value for a specific effect parameter.
 * Returns the value in the correct unit for that effect.
 */
export function computeSyncedValue(
  bpm: number,
  division: SyncDivision,
  unit: 'seconds' | 'ms' | 'hz' | 'normalized',
): number {
  switch (unit) {
    case 'seconds':
      return bpmToSeconds(bpm, division);
    case 'ms':
      return bpmToMs(bpm, division);
    case 'hz':
      return bpmToHz(bpm, division);
    case 'normalized':
      // RETapeEcho: ms / 1000, clamped 0-1
      return Math.min(1, Math.max(0, bpmToMs(bpm, division) / 1000));
    default:
      return bpmToMs(bpm, division);
  }
}

/** Check if an effect config has BPM sync enabled */
export function isEffectBpmSynced(params: Record<string, number | string>): boolean {
  return params.bpmSync === 1;
}

/** Get the sync division from effect parameters, with fallback */
export function getEffectSyncDivision(params: Record<string, number | string>): SyncDivision {
  const div = params.syncDivision as string;
  if (div && div in DIVISION_MULTIPLIERS) return div as SyncDivision;
  return '1/8';
}
