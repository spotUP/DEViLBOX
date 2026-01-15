/**
 * Automation Types - Parameter Automation Curves
 */

export type AutomationMode = 'steps' | 'curve' | 'keyframes';

export type InterpolationType = 'linear' | 'exponential' | 'easeIn' | 'easeOut' | 'easeBoth';

export type AutomationParameter =
  // TB-303 core parameters
  | 'cutoff'
  | 'resonance'
  | 'envMod'
  | 'decay'
  | 'accent'
  | 'tuning'
  | 'overdrive'
  // Devil Fish parameters
  | 'normalDecay'
  | 'accentDecay'
  | 'vegDecay'
  | 'vegSustain'
  | 'softAttack'
  | 'filterTracking'
  | 'filterFM'
  // General mixer parameters
  | 'volume'
  | 'pan'
  | 'distortion'
  | 'delay'
  | 'reverb';

export interface AutomationPoint {
  row: number;
  value: number; // 0-1 normalized
}

export interface AutomationCurve {
  id: string;
  patternId: string;
  channelIndex: number;
  parameter: AutomationParameter;
  mode: AutomationMode;
  interpolation: InterpolationType;
  points: AutomationPoint[];
  enabled: boolean;
}

export type AutomationShape =
  | 'rampUp'
  | 'rampDown'
  | 'triangle'
  | 'sine'
  | 'saw'
  | 'reverseSaw'
  | 'square'
  | 'random';

export interface AutomationPreset {
  id: string;
  name: string;
  shape: AutomationShape;
  points: AutomationPoint[];
}

export interface AutomationState {
  curves: AutomationCurve[];
  selectedCurveId: string | null;
  editMode: 'pencil' | 'line' | 'curve' | 'select';
  presets: AutomationPreset[];
}

export const AUTOMATION_PRESETS: AutomationPreset[] = [
  {
    id: 'ramp-up',
    name: 'Ramp Up',
    shape: 'rampUp',
    points: [
      { row: 0, value: 0 },
      { row: 63, value: 1 },
    ],
  },
  {
    id: 'ramp-down',
    name: 'Ramp Down',
    shape: 'rampDown',
    points: [
      { row: 0, value: 1 },
      { row: 63, value: 0 },
    ],
  },
  {
    id: 'triangle',
    name: 'Triangle',
    shape: 'triangle',
    points: [
      { row: 0, value: 0 },
      { row: 31, value: 1 },
      { row: 63, value: 0 },
    ],
  },
  {
    id: 'sine',
    name: 'Sine Wave',
    shape: 'sine',
    points: Array.from({ length: 64 }, (_, i) => ({
      row: i,
      value: (Math.sin((i / 64) * Math.PI * 2) + 1) / 2,
    })),
  },
];
