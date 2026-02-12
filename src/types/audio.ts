/**
 * Audio Types - Audio Engine State & Playback
 */

import type * as Tone from 'tone';

export interface PlaybackState {
  isPlaying: boolean;
  isPaused: boolean;
  currentRow: number;
  currentPatternId: string;
  loop: boolean;
}

export interface TransportState {
  bpm: number; // 20-999
  timeSignature: [number, number]; // e.g., [4, 4]
  swing: number; // 0-100%
  position: string; // Tone.js transport position
}

export interface AudioEngineState {
  initialized: boolean;
  contextState: 'suspended' | 'running' | 'closed';
  masterVolume: number; // -60 to 0 dB
  masterMuted: boolean;
  playback: PlaybackState;
  transport: TransportState;
  analyserNode: Tone.Analyser | null;
  fftNode: Tone.FFT | null;
}

export interface ScheduledNote {
  time: number;
  note: string;
  duration: number;
  velocity: number;
  instrumentId: number;
  channelIndex: number;
  rowIndex: number;
  // TB-303 specific
  accent?: boolean;
  slide?: boolean;
  // Automation
  cutoff?: number;
  resonance?: number;
  pan?: number;
}

export interface EffectCommand {
  code: string; // e.g., "A0F", "C40"
  type: string; // e.g., "volumeSlide", "setVolume"
  parameters: number[];
  apply: (synth: unknown, time: number) => void;
}

export const DEFAULT_BPM = 135;
export const DEFAULT_MASTER_VOLUME = -6;
export const MIN_BPM = 20;
export const MAX_BPM = 999;

/**
 * Groove Template - Defines timing and velocity offsets for rows in a pattern
 * Each value represents timing offset as percentage (-50 to +50)
 * Velocity offsets represent gain multiplier (e.g. -0.2 = 20% quieter)
 */
export interface GrooveTemplate {
  id: string;
  name: string;
  category: 'straight' | 'shuffle' | 'swing' | 'funk' | 'hip-hop' | 'custom';
  description?: string;
  /** Array of timing offsets for each row in the groove cycle (typically 2-16 values) */
  values: number[];
  /** Optional array of velocity/gain offsets (-1.0 to 1.0) for each row */
  velocityOffsets?: number[];
  /** BPM range this groove works best with (optional hint) */
  suggestedBpmRange?: [number, number];
}

/**
 * Pre-defined groove templates
 * Values are timing offsets in percentage (-50 to +50):
 * 0 = on the grid, positive = late/lazy, negative = early/rushed
 */
export const GROOVE_TEMPLATES: GrooveTemplate[] = [
  // Straight grooves (no swing)
  {
    id: 'straight',
    name: 'Straight',
    category: 'straight',
    description: 'No groove, all rows on the grid',
    values: [0, 0],
  },

  // Shuffle/Swing grooves (triplet feel)
  {
    id: 'light-shuffle',
    name: 'Light Shuffle',
    category: 'shuffle',
    description: 'Subtle rhythmic bounce (16th)',
    values: [0, 8],
    velocityOffsets: [0, -0.05], // Swung note slightly quieter
  },
  {
    id: 'medium-shuffle',
    name: 'Medium Shuffle',
    category: 'shuffle',
    description: 'Classic bouncy shuffle feel',
    values: [0, 16],
    velocityOffsets: [0, -0.1],
  },
  {
    id: 'heavy-shuffle',
    name: 'Heavy Shuffle',
    category: 'shuffle',
    description: 'Strong triplet-style bounce',
    values: [0, 25],
    velocityOffsets: [0, -0.15],
  },
  {
    id: 'triplet',
    name: 'Full Triplet',
    category: 'shuffle',
    description: 'True 2:1 triplet timing (66%)',
    values: [0, 33],
    velocityOffsets: [0, -0.2],
  },

  // MPC-style swing values (Famous for timing + heavy velocity ghosting)
  {
    id: 'mpc-50',
    name: 'MPC 50%',
    category: 'swing',
    description: 'MPC straight (no swing)',
    values: [0, 0],
  },
  {
    id: 'mpc-54',
    name: 'MPC 54%',
    category: 'swing',
    description: 'MPC light swing',
    values: [0, 8],
    velocityOffsets: [0, -0.08],
  },
  {
    id: 'mpc-58',
    name: 'MPC 58%',
    category: 'swing',
    description: 'MPC medium swing',
    values: [0, 16],
    velocityOffsets: [0, -0.12],
  },
  {
    id: 'mpc-62',
    name: 'MPC 62%',
    category: 'swing',
    description: 'MPC heavy swing',
    values: [0, 25],
    velocityOffsets: [0, -0.18],
  },
  {
    id: 'mpc-66',
    name: 'MPC 66%',
    category: 'swing',
    description: 'MPC maximum swing',
    values: [0, 33],
    velocityOffsets: [0, -0.25],
  },

  // Funk grooves (Syncopated: emphasis on 1 and 3, ghosting on 2 and 4)
  {
    id: 'funk-16th',
    name: 'Funk 16th',
    category: 'funk',
    description: '16th note funk groove',
    values: [0, 5, -3, 10],
    velocityOffsets: [0.1, -0.2, 0.05, -0.3], // Hard emphasis on 1, deep ghost on 4
    suggestedBpmRange: [90, 130],
  },
  {
    id: 'funk-lazy',
    name: 'Lazy Funk',
    category: 'funk',
    description: 'Relaxed funk feel, everything slightly late',
    values: [3, 8, 5, 12],
    velocityOffsets: [0.05, -0.1, 0.05, -0.15],
    suggestedBpmRange: [80, 110],
  },
  {
    id: 'funk-tight',
    name: 'Tight Funk',
    category: 'funk',
    description: 'Rushed funk feel, snappy timing',
    values: [-2, 5, -5, 8],
    velocityOffsets: [0.15, -0.15, 0.1, -0.2],
    suggestedBpmRange: [100, 140],
  },

  // Hip-hop grooves
  {
    id: 'boom-bap',
    name: 'Boom Bap',
    category: 'hip-hop',
    description: 'Classic 90s hip-hop swing',
    values: [0, 12, 0, 8],
    velocityOffsets: [0.1, -0.15, 0.05, -0.1],
    suggestedBpmRange: [85, 100],
  },
  {
    id: 'lo-fi',
    name: 'Lo-Fi',
    category: 'hip-hop',
    description: 'Drunk/loose timing for lo-fi beats',
    values: [5, 15, -3, 18],
    velocityOffsets: [-0.05, -0.2, -0.1, -0.25],
    suggestedBpmRange: [70, 95],
  },
  {
    id: 'trap-triplet',
    name: 'Trap Triplet',
    category: 'hip-hop',
    description: 'Triplet hi-hat groove for trap',
    values: [0, 22, 11, 33, 0, 22],
    velocityOffsets: [0.1, -0.2, -0.1, -0.3, 0.05, -0.25],
    suggestedBpmRange: [130, 160],
  },

  // Special/experimental
  {
    id: 'drunken',
    name: 'Drunken Master',
    category: 'custom',
    description: 'Irregular timing for experimental feel',
    values: [0, 8, -5, 15, 3, 20, -8, 12],
    velocityOffsets: [0, -0.1, 0.05, -0.2, 0.1, -0.15, 0.05, -0.3],
  },
  {
    id: 'push-pull',
    name: 'Push-Pull',
    category: 'custom',
    description: 'Alternating early/late for tension',
    values: [-10, 10, -10, 10],
    velocityOffsets: [0.1, -0.1, 0.1, -0.1],
  },
];

/**
 * Get groove offset for a specific row
 * @param groove The groove template to use
 * @param row The current row number
 * @param rowDuration Duration of one row in seconds
 * @returns Time offset in seconds
 */
export function getGrooveOffset(groove: GrooveTemplate, row: number, rowDuration: number): number {
  if (!groove.values || groove.values.length === 0) return 0;

  // Cycle through groove values
  const grooveIndex = row % groove.values.length;
  const grooveValue = groove.values[grooveIndex];

  // Convert percentage (-50 to +50) to time offset
  // Max offset is 50% of row duration
  return (grooveValue / 100) * rowDuration;
}

/**
 * Get velocity/gain offset for a specific row
 * @param groove The groove template to use
 * @param row The current row number
 * @returns Velocity offset (-1.0 to 1.0)
 */
export function getGrooveVelocity(groove: GrooveTemplate, row: number): number {
  if (!groove.velocityOffsets || groove.velocityOffsets.length === 0) return 0;

  const grooveIndex = row % groove.velocityOffsets.length;
  return groove.velocityOffsets[grooveIndex];
}
