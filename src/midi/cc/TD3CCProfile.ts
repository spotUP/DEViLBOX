/**
 * TD-3 CC Profile - Default MIDI CC assignments for Behringer TD-3
 *
 * These CC numbers match the TD-3's MIDI implementation.
 * Users can customize via MIDI Learn in the UI.
 */

import type { CCMapping, TB303Parameter } from '../types';

/**
 * TD-3 CC number assignments
 * Note: ENV_MOD is set to CC12 to avoid conflict with PAN (CC10)
 */
export const TD3_CC_MAP = {
  CUTOFF: 74,      // Filter cutoff frequency
  RESONANCE: 71,   // Filter resonance
  ENV_MOD: 12,     // Filter envelope modulation depth (was 10, changed to avoid PAN conflict)
  DECAY: 75,       // Envelope decay time
  ACCENT: 16,      // Accent amount (may vary by device)
  VOLUME: 7,       // Channel volume
  PAN: 10,         // Pan position
} as const;

/**
 * Reverse mapping: CC number -> parameter name
 */
export const TD3_CC_REVERSE_MAP: Partial<Record<number, TB303Parameter>> = {
  [TD3_CC_MAP.CUTOFF]: 'cutoff',
  [TD3_CC_MAP.RESONANCE]: 'resonance',
  [TD3_CC_MAP.ENV_MOD]: 'envMod',
  [TD3_CC_MAP.DECAY]: 'decay',
  [TD3_CC_MAP.ACCENT]: 'accent',
};

/**
 * Default CC mappings for TB303 parameters
 */
export const DEFAULT_TD3_MAPPINGS: CCMapping[] = [
  {
    ccNumber: TD3_CC_MAP.CUTOFF,
    parameter: 'cutoff',
    min: 200,       // 200 Hz (must be > 0 for logarithmic curve)
    max: 20000,     // 20 kHz
    curve: 'logarithmic',  // Frequency perception is logarithmic
  },
  {
    ccNumber: TD3_CC_MAP.RESONANCE,
    parameter: 'resonance',
    min: 0,
    max: 100,       // Percentage
    curve: 'linear',
  },
  {
    ccNumber: TD3_CC_MAP.ENV_MOD,
    parameter: 'envMod',
    min: 0,
    max: 100,       // Percentage
    curve: 'linear',
  },
  {
    ccNumber: TD3_CC_MAP.DECAY,
    parameter: 'decay',
    min: 30,        // 30 ms (must be > 0 for logarithmic curve)
    max: 3000,      // 3 seconds
    curve: 'logarithmic',  // Time perception is roughly logarithmic
  },
  {
    ccNumber: TD3_CC_MAP.ACCENT,
    parameter: 'accent',
    min: 0,
    max: 100,       // Percentage
    curve: 'linear',
  },
];

/**
 * Get parameter value range for display
 */
export function getParameterDisplayInfo(parameter: TB303Parameter): {
  unit: string;
  formatValue: (value: number) => string;
} {
  switch (parameter) {
    case 'cutoff':
      return {
        unit: 'Hz',
        formatValue: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`),
      };
    case 'decay':
      return {
        unit: 'ms',
        formatValue: (v) => (v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)}`),
      };
    case 'resonance':
    case 'envMod':
    case 'accent':
    case 'overdrive':
    case 'slideTime':
      return {
        unit: '%',
        formatValue: (v) => `${Math.round(v)}`,
      };
    default:
      return {
        unit: '',
        formatValue: (v) => `${v}`,
      };
  }
}

/**
 * Convert CC value (0-127) to parameter value using mapping
 */
export function ccToParameter(ccValue: number, mapping: CCMapping): number {
  const normalized = ccValue / 127;

  if (mapping.curve === 'logarithmic') {
    // Guard against log(0) - ensure min is at least 1 for logarithmic scaling
    const safeMin = Math.max(1, mapping.min);
    const safeMax = Math.max(safeMin + 1, mapping.max);
    const logMin = Math.log(safeMin);
    const logMax = Math.log(safeMax);
    return Math.exp(logMin + normalized * (logMax - logMin));
  }

  return mapping.min + normalized * (mapping.max - mapping.min);
}

/**
 * Convert parameter value to CC value (0-127) using mapping
 */
export function parameterToCC(paramValue: number, mapping: CCMapping): number {
  let normalized: number;

  if (mapping.curve === 'logarithmic') {
    // Guard against log(0) - ensure min is at least 1 for logarithmic scaling
    const safeMin = Math.max(1, mapping.min);
    const safeMax = Math.max(safeMin + 1, mapping.max);
    const logMin = Math.log(safeMin);
    const logMax = Math.log(safeMax);
    const logValue = Math.log(Math.max(safeMin, Math.min(safeMax, paramValue)));
    normalized = (logValue - logMin) / (logMax - logMin);
  } else {
    normalized = (paramValue - mapping.min) / (mapping.max - mapping.min);
  }

  return Math.round(Math.max(0, Math.min(127, normalized * 127)));
}
