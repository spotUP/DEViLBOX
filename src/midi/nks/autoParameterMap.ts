/**
 * NKS2 Auto Parameter Map
 *
 * Automatically generates NKS2 profiles for VSTBridge and WAM synths
 * using runtime parameter discovery and heuristic PDI type assignment.
 *
 * Used when a synth doesn't have a hand-crafted parameter map but
 * exposes its parameters through WASM metadata or WAM descriptors.
 */

import type {
  NKS2PDI,
  NKS2PDIType,
  NKS2PDIStyle,
  NKS2Parameter,
  NKS2PerformanceSection,
  NKS2SynthProfile,
  NKS2Navigation,
} from './types';

// ============================================================================
// Types for runtime parameter discovery
// ============================================================================

/** Parameter descriptor from VSTBridge WASM or WAM AudioWorklet */
export interface RuntimeParam {
  id: number | string;         // Numeric index (VSTBridge) or string ID (WAM)
  name: string;                // Human-readable name
  minValue: number;
  maxValue: number;
  defaultValue: number;
  stepSize?: number;           // 0 = continuous, >0 = discrete
  label?: string;              // Unit label (e.g., "Hz", "dB")
  valueStrings?: string[];     // Enumerated values for discrete params
}

// ============================================================================
// Heuristic PDI Inference
// ============================================================================

/** Keywords that indicate specific parameter types */
const WAVEFORM_KEYWORDS = ['wave', 'waveform', 'osc type', 'oscillator type', 'osc mode'];
const FILTER_TYPE_KEYWORDS = ['filter type', 'filter mode', 'flt type', 'flt mode'];
const TOGGLE_KEYWORDS = ['on', 'off', 'enable', 'disable', 'bypass', 'active', 'mute', 'solo'];
const BIPOLAR_KEYWORDS = ['pan', 'detune', 'pitch', 'tune', 'offset', 'balance', 'spread'];
const TEMPO_KEYWORDS = ['tempo', 'sync', 'bpm', 'rate'];

/** Keywords that indicate "important" parameters (for Performance mode selection) */
const IMPORTANCE_KEYWORDS = [
  'cutoff', 'resonance', 'filter', 'volume', 'level', 'gain',
  'attack', 'decay', 'sustain', 'release',
  'frequency', 'pitch', 'tune',
  'drive', 'distortion', 'mix', 'wet', 'dry',
  'depth', 'rate', 'amount', 'mod',
  'wave', 'waveform', 'shape',
];

function matchesAny(name: string, keywords: string[]): boolean {
  const lower = name.toLowerCase();
  return keywords.some(kw => lower.includes(kw));
}

/**
 * Infer NKS2 PDI from a runtime parameter descriptor.
 */
function inferPDI(param: RuntimeParam): NKS2PDI {
  const name = param.name.toLowerCase();

  // Toggle detection
  if (param.valueStrings?.length === 2 || (param.maxValue === 1 && param.stepSize === 1)) {
    return { type: 'toggle', style: 'power' };
  }

  // Discrete detection
  const isDiscrete = (param.stepSize && param.stepSize >= 1) ||
                     (param.valueStrings && param.valueStrings.length > 2);

  if (isDiscrete) {
    let style: NKS2PDIStyle = 'menu';
    if (matchesAny(name, WAVEFORM_KEYWORDS)) style = 'waveform';
    else if (matchesAny(name, FILTER_TYPE_KEYWORDS)) style = 'filterType';

    const isBipolar = param.minValue < 0;
    return {
      type: isBipolar ? 'discrete_bipolar' : 'discrete',
      style,
      value_count: param.valueStrings?.length ?? Math.round(param.maxValue - param.minValue + 1),
      display_values: param.valueStrings,
    };
  }

  // Continuous detection
  const isBipolar = param.minValue < 0 || matchesAny(name, BIPOLAR_KEYWORDS);
  const type: NKS2PDIType = isBipolar ? 'continuous_bipolar' : 'continuous';

  let style: NKS2PDIStyle = 'knob';
  if (matchesAny(name, TEMPO_KEYWORDS)) style = 'temposync';

  return { type, style };
}

/**
 * Score a parameter's "importance" for Performance mode selection.
 * Higher score = more likely to be in the first 8 knobs.
 */
function importanceScore(param: RuntimeParam): number {
  let score = 0;
  const lower = param.name.toLowerCase();

  for (const kw of IMPORTANCE_KEYWORDS) {
    if (lower.includes(kw)) score += 10;
  }

  // Penalize toggles (less useful on knobs)
  if (param.maxValue === 1 && param.stepSize === 1) score -= 5;

  // Boost params near the front of the list (often the most important)
  if (typeof param.id === 'number' && param.id < 16) score += 5 - Math.floor(param.id / 4);

  return score;
}

// ============================================================================
// Auto-Profile Generator
// ============================================================================

/**
 * Generate an NKS2 synth profile from runtime parameter descriptors.
 * Used for VSTBridge and WAM plugins that expose params at runtime.
 */
export function generateNKS2Profile(
  synthType: string,
  params: RuntimeParam[],
): NKS2SynthProfile {
  // Convert all params to NKS2Parameter
  const nks2Params: NKS2Parameter[] = params.map(p => ({
    id: `${synthType.toLowerCase()}.${typeof p.id === 'number' ? `param${p.id}` : p.id}`,
    name: p.name.substring(0, 31),  // NKS max name length
    pdi: inferPDI(p),
    defaultValue: normalizeValue(p.defaultValue, p.minValue, p.maxValue),
    unit: p.label,
    engineParam: typeof p.id === 'number' ? `vstbridge.${p.id}` : `wam.${p.id}`,
  }));

  // Sort by importance for Performance mode
  const ranked = [...params].sort((a, b) => importanceScore(b) - importanceScore(a));

  // Top 8 become Performance mode
  const perfParams = ranked.slice(0, 8).map(p => {
    const idx = params.indexOf(p);
    return nks2Params[idx];
  });

  const performance: NKS2PerformanceSection[] = [{
    name: 'Main',
    parameters: perfParams,
  }];

  // If more than 8 params, add second performance section
  if (ranked.length > 8) {
    const perfParams2 = ranked.slice(8, 16).map(p => {
      const idx = params.indexOf(p);
      return nks2Params[idx];
    });
    performance.push({
      name: 'More',
      parameters: perfParams2,
    });
  }

  // Group remaining params into Edit groups by name prefix
  const groups = autoGroupParams(nks2Params);
  const editGroups = groups.length > 0
    ? groups.map(g => ({
        name: g.name,
        sections: [{ name: g.name, parameters: g.parameters }],
      }))
    : undefined;

  const navigation: NKS2Navigation = { performance, editGroups };

  return {
    synthType,
    parameters: nks2Params,
    navigation,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function normalizeValue(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

interface ParamGroup {
  name: string;
  parameters: NKS2Parameter[];
}

/**
 * Auto-group parameters by name prefix.
 * Splits on '.', '_', ':', or space to find common prefixes.
 */
function autoGroupParams(params: NKS2Parameter[]): ParamGroup[] {
  const prefixMap = new Map<string, NKS2Parameter[]>();

  for (const param of params) {
    // Extract prefix from name (e.g., "Osc 1 Level" -> "Osc 1", "Filter.Cutoff" -> "Filter")
    const match = param.name.match(/^([A-Za-z]+[\s._:]?\d*)/);
    const prefix = match ? match[1].trim() : 'Other';

    if (!prefixMap.has(prefix)) {
      prefixMap.set(prefix, []);
    }
    prefixMap.get(prefix)!.push(param);
  }

  // Only create groups with 2+ parameters
  return Array.from(prefixMap.entries())
    .filter(([, params]) => params.length >= 2)
    .map(([name, parameters]) => ({ name, parameters }));
}

// ============================================================================
// Profile Cache
// ============================================================================

const autoProfileCache = new Map<string, NKS2SynthProfile>();

/**
 * Get or create an auto-generated NKS2 profile for a runtime-discovered synth.
 * Caches the result since WASM parameters are static per synth type.
 */
export function getAutoProfile(
  synthType: string,
  params: RuntimeParam[],
): NKS2SynthProfile {
  let profile = autoProfileCache.get(synthType);
  if (!profile) {
    profile = generateNKS2Profile(synthType, params);
    autoProfileCache.set(synthType, profile);
  }
  return profile;
}

/**
 * Clear the auto-profile cache (for testing or hot-reloading).
 */
export function clearAutoProfileCache(): void {
  autoProfileCache.clear();
}
