/**
 * DJ Quick EQ Presets — one-tap EQ curves for live mixing.
 * Values are dB (-12 to +12) applied to the existing 3-band EQ per deck.
 */

export interface DjEqPreset {
  id: string;
  label: string;
  eqLow: number;
  eqMid: number;
  eqHigh: number;
  description: string;
}

export const DJ_EQ_PRESETS: DjEqPreset[] = [
  { id: 'flat',   label: 'Flat',   eqLow: 0,  eqMid: 0,  eqHigh: 0,  description: 'Neutral — no EQ' },
  { id: 'punch',  label: 'Punch',  eqLow: 6,  eqMid: 2,  eqHigh: 1,  description: 'Kick emphasis, punchy low-end' },
  { id: 'deep',   label: 'Deep',   eqLow: 9,  eqMid: -2, eqHigh: -3, description: 'Heavy bass, sub focus' },
  { id: 'warm',   label: 'Warm',   eqLow: 3,  eqMid: 2,  eqHigh: -4, description: 'Analog warmth, rolled-off highs' },
  { id: 'bright', label: 'Bright', eqLow: -1, eqMid: 1,  eqHigh: 7,  description: 'Crisp treble, sparkle' },
  { id: 'scoop',  label: 'Scoop',  eqLow: 5,  eqMid: -5, eqHigh: 5,  description: 'Scooped mids, electronic feel' },
  { id: 'full',   label: 'Full',   eqLow: 5,  eqMid: 3,  eqHigh: 3,  description: 'Overall boost, louder feel' },
  { id: 'air',    label: 'Air',    eqLow: -2, eqMid: 0,  eqHigh: 9,  description: 'Airy highs, shimmer' },
];
