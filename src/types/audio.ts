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
  apply: (synth: any, time: number) => void;
}

export const DEFAULT_BPM = 135;
export const DEFAULT_MASTER_VOLUME = -6;
export const MIN_BPM = 20;
export const MAX_BPM = 999;

/**
 * Groove Template - Defines timing offsets for rows in a pattern
 * Each value represents timing offset as percentage (-50 to +50)
 * Positive = delay (late), Negative = early (push)
 */
export interface GrooveTemplate {
  id: string;
  name: string;
  category: 'straight' | 'shuffle' | 'swing' | 'funk' | 'hip-hop' | 'custom';
  description?: string;
  /** Array of timing offsets for each row in the groove cycle (typically 2-16 values) */
  values: number[];
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
    description: 'Subtle triplet feel (54%)',
    values: [0, 8],
  },
  {
    id: 'medium-shuffle',
    name: 'Medium Shuffle',
    category: 'shuffle',
    description: 'Classic shuffle feel (58%)',
    values: [0, 16],
  },
  {
    id: 'heavy-shuffle',
    name: 'Heavy Shuffle',
    category: 'shuffle',
    description: 'Strong triplet feel (66%)',
    values: [0, 33],
  },
  {
    id: 'triplet',
    name: 'Full Triplet',
    category: 'shuffle',
    description: 'True triplet timing (66.7%)',
    values: [0, 33],
  },

  // MPC-style swing values
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
  },
  {
    id: 'mpc-58',
    name: 'MPC 58%',
    category: 'swing',
    description: 'MPC medium swing',
    values: [0, 16],
  },
  {
    id: 'mpc-62',
    name: 'MPC 62%',
    category: 'swing',
    description: 'MPC heavy swing',
    values: [0, 25],
  },
  {
    id: 'mpc-66',
    name: 'MPC 66%',
    category: 'swing',
    description: 'MPC maximum swing',
    values: [0, 33],
  },
  {
    id: 'mpc-71',
    name: 'MPC 71%',
    category: 'swing',
    description: 'MPC extreme swing (beyond triplet)',
    values: [0, 42],
  },

  // Funk grooves (syncopated patterns)
  {
    id: 'funk-16th',
    name: 'Funk 16th',
    category: 'funk',
    description: '16th note funk groove',
    values: [0, 5, -3, 10],
    suggestedBpmRange: [90, 130],
  },
  {
    id: 'funk-lazy',
    name: 'Lazy Funk',
    category: 'funk',
    description: 'Relaxed funk feel, everything slightly late',
    values: [3, 8, 5, 12],
    suggestedBpmRange: [80, 110],
  },
  {
    id: 'funk-tight',
    name: 'Tight Funk',
    category: 'funk',
    description: 'Rushed funk feel, snappy timing',
    values: [-2, 5, -5, 8],
    suggestedBpmRange: [100, 140],
  },

  // Hip-hop grooves
  {
    id: 'boom-bap',
    name: 'Boom Bap',
    category: 'hip-hop',
    description: 'Classic 90s hip-hop swing',
    values: [0, 12, 0, 8],
    suggestedBpmRange: [85, 100],
  },
  {
    id: 'lo-fi',
    name: 'Lo-Fi',
    category: 'hip-hop',
    description: 'Drunk/loose timing for lo-fi beats',
    values: [5, 15, -3, 18],
    suggestedBpmRange: [70, 95],
  },
  {
    id: 'trap-triplet',
    name: 'Trap Triplet',
    category: 'hip-hop',
    description: 'Triplet hi-hat groove for trap',
    values: [0, 22, 11, 33, 0, 22],
    suggestedBpmRange: [130, 160],
  },

  // Special/experimental
  {
    id: 'drunken',
    name: 'Drunken Master',
    category: 'custom',
    description: 'Irregular timing for experimental feel',
    values: [0, 8, -5, 15, 3, 20, -8, 12],
  },
  {
    id: 'push-pull',
    name: 'Push-Pull',
    category: 'custom',
    description: 'Alternating early/late for tension',
    values: [-10, 10, -10, 10],
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
