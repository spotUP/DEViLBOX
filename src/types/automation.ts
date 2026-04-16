/**
 * Automation Types - Parameter Automation Curves
 */

export type AutomationMode = 'steps' | 'curve' | 'keyframes';

export type InterpolationType = 'linear' | 'exponential' | 'easeIn' | 'easeOut' | 'easeBoth';

/** Automation parameter key — NKS param id (e.g. 'tb303.cutoff', 'dexed.algorithm') */
export type AutomationParameter = string;

/** Reference to the data source that produced an automation point, enabling write-back */
export type AutomationSourceRef =
  | { type: 'table'; tableType: 'wave' | 'pulse' | 'filter'; tableId: number; index: number }
  | { type: 'effect'; row: number; channel: number; effectCol: number }
  | { type: 'macro'; instrumentId: number; macroType: string; frame: number }
  | { type: 'furnace-effect'; row: number; channel: number; effectCol: number };

export interface AutomationPoint {
  row: number;
  value: number; // 0-1 normalized
  tension?: number; // 0-1, per-point curve tension (optional override)
  curveType?: InterpolationType; // per-segment interpolation override
  sourceRef?: AutomationSourceRef;
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
  | 'random'
  | 'sweepUp'
  | 'sweepDown'
  | 'buildDrop';

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

/**
 * Interpolate an automation curve value at a given row.
 * Handles all interpolation modes. Works with any AutomationCurve or bare points array.
 */
export function interpolateAutomationValue(
  points: AutomationPoint[],
  row: number,
  interpolation: InterpolationType = 'linear',
  mode: AutomationMode = 'curve',
): number | null {
  if (points.length === 0) return null;

  // Find surrounding points
  let before: AutomationPoint | null = null;
  let after: AutomationPoint | null = null;

  for (let i = 0; i < points.length; i++) {
    if (points[i].row <= row) before = points[i];
    if (points[i].row >= row) { after = points[i]; break; }
  }

  // Exact match or edge cases
  if (before && before.row === row) return before.value;
  if (after && after.row === row) return after.value;
  if (!before && after) return after.value;
  if (before && !after) return before.value;

  // Step mode — hold previous value
  if (mode === 'steps') return before ? before.value : null;

  // Interpolate between surrounding points
  if (before && after) {
    const t = (row - before.row) / (after.row - before.row);
    const diff = after.value - before.value;

    switch (interpolation) {
      case 'linear':
        return before.value + diff * t;
      case 'exponential':
        return before.value + diff * (t * t);
      case 'easeIn':
        return before.value + diff * (t * t * t);
      case 'easeOut': {
        const tInv = 1 - t;
        return before.value + diff * (1 - tInv * tInv * tInv);
      }
      case 'easeBoth':
        if (t < 0.5) {
          return before.value + diff * (4 * t * t * t);
        } else {
          const s = 2 * t - 2;
          return before.value + diff * (1 + s * s * s / 2);
        }
      default:
        return before.value + diff * t;
    }
  }

  return null;
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
  {
    id: 'saw',
    name: 'Sawtooth',
    shape: 'saw',
    points: [
      { row: 0, value: 0 },
      { row: 31, value: 1 },
      { row: 32, value: 0 },
      { row: 63, value: 1 },
    ],
  },
  {
    id: 'reverse-saw',
    name: 'Reverse Saw',
    shape: 'reverseSaw',
    points: [
      { row: 0, value: 1 },
      { row: 31, value: 0 },
      { row: 32, value: 1 },
      { row: 63, value: 0 },
    ],
  },
  {
    id: 'square',
    name: 'Square',
    shape: 'square',
    points: [
      { row: 0, value: 1 },
      { row: 15, value: 1 },
      { row: 16, value: 0 },
      { row: 31, value: 0 },
      { row: 32, value: 1 },
      { row: 47, value: 1 },
      { row: 48, value: 0 },
      { row: 63, value: 0 },
    ],
  },
  {
    id: 'random',
    name: 'Random',
    shape: 'random',
    points: Array.from({ length: 16 }, (_, i) => ({
      row: i * 4,
      value: Math.random(),
    })),
  },
  {
    id: 'sine-2x',
    name: 'Sine 2x',
    shape: 'sine',
    points: Array.from({ length: 64 }, (_, i) => ({
      row: i,
      value: (Math.sin((i / 64) * Math.PI * 4) + 1) / 2,
    })),
  },
  {
    id: 'sine-4x',
    name: 'Sine 4x',
    shape: 'sine',
    points: Array.from({ length: 64 }, (_, i) => ({
      row: i,
      value: (Math.sin((i / 64) * Math.PI * 8) + 1) / 2,
    })),
  },
  {
    id: 'staircase-4',
    name: 'Staircase 4',
    shape: 'rampUp',
    points: [
      { row: 0, value: 0 },
      { row: 15, value: 0 },
      { row: 16, value: 0.33 },
      { row: 31, value: 0.33 },
      { row: 32, value: 0.66 },
      { row: 47, value: 0.66 },
      { row: 48, value: 1 },
      { row: 63, value: 1 },
    ],
  },
  {
    id: 'staircase-8',
    name: 'Staircase 8',
    shape: 'rampUp',
    points: Array.from({ length: 16 }, (_, i) => ({
      row: i * 4,
      value: Math.floor(i / 2) / 7,
    })),
  },
  // ── DJ-style filter sweeps (quadratic ease-in-out from DJQuantizedFX) ──
  {
    id: 'sweep-up',
    name: 'DJ Sweep Up',
    shape: 'sweepUp',
    points: Array.from({ length: 64 }, (_, i) => {
      const t = i / 63;
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      return { row: i, value: eased };
    }),
  },
  {
    id: 'sweep-down',
    name: 'DJ Sweep Down',
    shape: 'sweepDown',
    points: Array.from({ length: 64 }, (_, i) => {
      const t = i / 63;
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      return { row: i, value: 1 - eased };
    }),
  },
  {
    id: 'build-drop',
    name: 'Build & Drop',
    shape: 'buildDrop',
    points: (() => {
      const pts: AutomationPoint[] = [];
      // Sweep up to 1 over first 75% of pattern using DJ easing
      const buildEnd = 47; // ~75% of 64
      for (let i = 0; i <= buildEnd; i++) {
        const t = i / buildEnd;
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        pts.push({ row: i, value: eased });
      }
      // Sharp drop
      pts.push({ row: 48, value: 0 });
      pts.push({ row: 63, value: 0 });
      return pts;
    })(),
  },
];
