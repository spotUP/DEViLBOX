/**
 * NKS2 Parameter Router
 *
 * Generic parameter routing that replaces the hardcoded `updateBankParameter()` switch
 * in useMIDIStore.ts. Routes any NKS2 parameter change to the correct synth engine
 * via useInstrumentStore, VSTBridge WASM, WAM, or Tone.js.
 *
 * All incoming values are 0-1 normalized. The router handles denormalization
 * per-parameter as needed.
 */

import { useInstrumentStore } from '../../stores/useInstrumentStore';
import { getToneEngine } from '../../engine/ToneEngine';
import type { SynthType } from '@typedefs/instrument';
import type { MappableParameter } from '../types';

// ============================================================================
// Route Table Types
// ============================================================================

interface ConfigRoute {
  type: 'config';
  /** Dot-path into instrument config (e.g., 'tb303.filter.cutoff') */
  path: string;
  /** Transform normalized 0-1 value to engine value */
  transform?: (normalized: number) => number;
}

interface VSTBridgeRoute {
  type: 'vstbridge';
  /** WASM parameter index */
  paramId: number;
  /** Transform normalized 0-1 value to WASM value */
  transform?: (normalized: number) => number;
}

interface EffectRoute {
  type: 'effect';
  /** Effect type to find on the instrument */
  effectType: string;
  /** Parameter name within the effect */
  param: string;
  /** Transform normalized 0-1 value */
  transform?: (normalized: number) => number;
}

type ParameterRoute = ConfigRoute | VSTBridgeRoute | EffectRoute;

// ============================================================================
// Route Tables
// Encode the same knowledge as the old updateBankParameter switch,
// but in a data-driven format keyed by MappableParameter.
// ============================================================================

const PARAMETER_ROUTES: Record<string, ParameterRoute> = {
  // ── 303 Main ──────────────────────────────────────────────────────
  'cutoff':       { type: 'config', path: 'tb303.filter.cutoff' },
  'resonance':    { type: 'config', path: 'tb303.filter.resonance' },
  'envMod':       { type: 'config', path: 'tb303.filterEnvelope.envMod' },
  'decay':        { type: 'config', path: 'tb303.filterEnvelope.decay' },
  'accent':       { type: 'config', path: 'tb303.accent.amount' },
  'overdrive':    { type: 'config', path: 'tb303.overdrive.amount' },
  'slideTime':    { type: 'config', path: 'tb303.slide.time' },

  // ── Siren ─────────────────────────────────────────────────────────
  'siren.osc.frequency':   { type: 'config', path: 'dubSiren.oscillator.frequency', transform: n => 60 + (n * 940) },
  'siren.lfo.rate':        { type: 'config', path: 'dubSiren.lfo.rate',             transform: n => 0.1 + (n * 19.9) },
  'siren.lfo.depth':       { type: 'config', path: 'dubSiren.lfo.depth',            transform: n => n * 500 },
  'siren.delay.time':      { type: 'config', path: 'dubSiren.delay.time',           transform: n => 0.01 + (n * 0.99) },
  'siren.delay.feedback':  { type: 'config', path: 'dubSiren.delay.feedback',       transform: n => n * 0.95 },
  'siren.delay.wet':       { type: 'config', path: 'dubSiren.delay.wet' },
  'siren.filter.frequency':{ type: 'config', path: 'dubSiren.filter.frequency',     transform: n => 20 + (n * 9980) },
  'siren.reverb.wet':      { type: 'config', path: 'dubSiren.reverb.wet' },

  // ── Furnace FM ────────────────────────────────────────────────────
  'furnace.algorithm':  { type: 'config', path: 'furnace.algorithm',  transform: n => Math.round(n * 7) },
  'furnace.feedback':   { type: 'config', path: 'furnace.feedback',   transform: n => Math.round(n * 7) },
  'furnace.op1TL':      { type: 'config', path: 'furnace.operators.0.tl', transform: n => Math.round(n * 127) },
  'furnace.op1AR':      { type: 'config', path: 'furnace.operators.0.ar', transform: n => Math.round(n * 31) },
  'furnace.op1DR':      { type: 'config', path: 'furnace.operators.0.dr', transform: n => Math.round(n * 31) },
  'furnace.op1SL':      { type: 'config', path: 'furnace.operators.0.sl', transform: n => Math.round(n * 15) },
  'furnace.op1RR':      { type: 'config', path: 'furnace.operators.0.rr', transform: n => Math.round(n * 15) },
  'furnace.fms':        { type: 'config', path: 'furnace.fms',        transform: n => Math.round(n * 7) },

  // ── V2 ────────────────────────────────────────────────────────────
  'v2.osc1Level':     { type: 'config', path: 'v2.osc1.level',          transform: n => Math.round(n * 127) },
  'v2.filter1Cutoff': { type: 'config', path: 'v2.filter1.cutoff',      transform: n => Math.round(n * 127) },
  'v2.filter1Reso':   { type: 'config', path: 'v2.filter1.resonance',   transform: n => Math.round(n * 127) },
  'v2.envAttack':     { type: 'config', path: 'v2.envelope.attack',     transform: n => Math.round(n * 127) },
  'v2.envDecay':      { type: 'config', path: 'v2.envelope.decay',      transform: n => Math.round(n * 127) },
  'v2.envSustain':    { type: 'config', path: 'v2.envelope.sustain',    transform: n => Math.round(n * 127) },
  'v2.envRelease':    { type: 'config', path: 'v2.envelope.release',    transform: n => Math.round(n * 127) },
  'v2.lfo1Depth':     { type: 'config', path: 'v2.lfo1.depth',         transform: n => Math.round(n * 127) },

  // ── Synare ────────────────────────────────────────────────────────
  'synare.tune':         { type: 'config', path: 'synare.oscillator.tune',        transform: n => 20 + n * 980 },
  'synare.osc2Mix':      { type: 'config', path: 'synare.oscillator2.mix' },
  'synare.filterCutoff': { type: 'config', path: 'synare.filter.cutoff',          transform: n => 20 * Math.pow(20000 / 20, n) },
  'synare.filterReso':   { type: 'config', path: 'synare.filter.resonance',       transform: n => n * 100 },
  'synare.filterEnvMod': { type: 'config', path: 'synare.filter.envMod',          transform: n => n * 100 },
  'synare.filterDecay':  { type: 'config', path: 'synare.filter.decay',           transform: n => 10 + n * 1990 },
  'synare.sweepAmount':  { type: 'config', path: 'synare.sweep.amount',           transform: n => n * 48 },
  'synare.sweepTime':    { type: 'config', path: 'synare.sweep.time',             transform: n => 5 + n * 495 },

  // ── Dexed (DX7) ──────────────────────────────────────────────────
  'dexed.algorithm':   { type: 'config', path: 'dexed.algorithm',         transform: n => Math.round(n * 31) },
  'dexed.feedback':    { type: 'config', path: 'dexed.feedback',          transform: n => Math.round(n * 7) },
  'dexed.op1Level':    { type: 'config', path: 'dexed.operators.0.level', transform: n => Math.round(n * 99) },
  'dexed.op1Coarse':   { type: 'config', path: 'dexed.operators.0.coarse', transform: n => Math.round(n * 31) },
  'dexed.lfoSpeed':    { type: 'config', path: 'dexed.lfoSpeed',          transform: n => Math.round(n * 99) },
  'dexed.lfoPitchMod': { type: 'config', path: 'dexed.lfoPitchModDepth',  transform: n => Math.round(n * 99) },
  'dexed.lfoAmpMod':   { type: 'config', path: 'dexed.lfoAmpModDepth',   transform: n => Math.round(n * 99) },
  'dexed.transpose':   { type: 'config', path: 'dexed.transpose',         transform: n => Math.round(-24 + n * 48) },

  // ── OBXd ──────────────────────────────────────────────────────────
  'obxd.osc1Level':    { type: 'config', path: 'obxd.osc1Level' },
  'obxd.osc2Level':    { type: 'config', path: 'obxd.osc2Level' },
  'obxd.filterCutoff': { type: 'config', path: 'obxd.filterCutoff' },
  'obxd.filterReso':   { type: 'config', path: 'obxd.filterResonance' },
  'obxd.filterEnv':    { type: 'config', path: 'obxd.filterEnvAmount' },
  'obxd.ampAttack':    { type: 'config', path: 'obxd.ampAttack' },
  'obxd.ampDecay':     { type: 'config', path: 'obxd.ampDecay' },
  'obxd.volume':       { type: 'config', path: 'obxd.masterVolume' },

  // ── SpaceLaser ────────────────────────────────────────────────────
  'spacelaser.startFreq':   { type: 'config', path: 'spaceLaser.laser.startFreq',    transform: n => 100 + n * 9900 },
  'spacelaser.endFreq':     { type: 'config', path: 'spaceLaser.laser.endFreq',      transform: n => 20 + n * 4980 },
  'spacelaser.sweepTime':   { type: 'config', path: 'spaceLaser.laser.sweepTime',    transform: n => 10 + n * 2990 },
  'spacelaser.fmAmount':    { type: 'config', path: 'spaceLaser.fm.amount',          transform: n => n * 100 },
  'spacelaser.fmRatio':     { type: 'config', path: 'spaceLaser.fm.ratio',           transform: n => 0.5 + n * 15.5 },
  'spacelaser.filterCutoff':{ type: 'config', path: 'spaceLaser.filter.cutoff',      transform: n => 20 * Math.pow(20000 / 20, n) },
  'spacelaser.filterReso':  { type: 'config', path: 'spaceLaser.filter.resonance',   transform: n => n * 100 },
  'spacelaser.delayWet':    { type: 'config', path: 'spaceLaser.delay.wet' },

  // ── SAM Speech ────────────────────────────────────────────────────
  'sam.pitch':  { type: 'config', path: 'sam.pitch',  transform: n => Math.round(n * 255) },
  'sam.speed':  { type: 'config', path: 'sam.speed',  transform: n => Math.round(n * 255) },
  'sam.mouth':  { type: 'config', path: 'sam.mouth',  transform: n => Math.round(n * 255) },
  'sam.throat': { type: 'config', path: 'sam.throat', transform: n => Math.round(n * 255) },

  // ── TonewheelOrgan (VSTBridge) ────────────────────────────────────
  'organ.drawbar16':    { type: 'vstbridge', paramId: 0,  transform: n => n * 8 },
  'organ.drawbar8':     { type: 'vstbridge', paramId: 2,  transform: n => n * 8 },
  'organ.drawbar4':     { type: 'vstbridge', paramId: 3,  transform: n => n * 8 },
  'organ.percussion':   { type: 'vstbridge', paramId: 9 },
  'organ.vibratoType':  { type: 'vstbridge', paramId: 13, transform: n => Math.round(n * 5) },
  'organ.vibratoDepth': { type: 'vstbridge', paramId: 14 },
  'organ.overdrive':    { type: 'vstbridge', paramId: 15 },
  'organ.volume':       { type: 'vstbridge', paramId: 16 },

  // ── Melodica (VSTBridge) ──────────────────────────────────────────
  'melodica.breath':      { type: 'vstbridge', paramId: 0 },
  'melodica.brightness':  { type: 'vstbridge', paramId: 1 },
  'melodica.vibratoRate': { type: 'vstbridge', paramId: 2,  transform: n => n * 10 },
  'melodica.vibratoDepth':{ type: 'vstbridge', paramId: 3 },
  'melodica.detune':      { type: 'vstbridge', paramId: 4,  transform: n => -50 + n * 100 },
  'melodica.portamento':  { type: 'vstbridge', paramId: 6 },
  'melodica.attack':      { type: 'vstbridge', paramId: 7 },
  'melodica.volume':      { type: 'vstbridge', paramId: 9 },

  // ── FX (Space Echo) ──────────────────────────────────────────────
  'echo.rate':         { type: 'effect', effectType: 'SpaceEcho', param: 'rate',         transform: n => 50 + (n * 950) },
  'echo.intensity':    { type: 'effect', effectType: 'SpaceEcho', param: 'intensity',    transform: n => n * 1.2 },
  'echo.echoVolume':   { type: 'effect', effectType: 'SpaceEcho', param: 'echoVolume' },
  'echo.reverbVolume': { type: 'effect', effectType: 'SpaceEcho', param: 'reverbVolume' },
  'echo.mode':         { type: 'effect', effectType: 'SpaceEcho', param: 'mode',         transform: n => Math.floor(1 + n * 11) },

  // ── FX (Bi-Phase) ────────────────────────────────────────────────
  'biphase.rateA':    { type: 'effect', effectType: 'BiPhase', param: 'rateA',    transform: n => 0.1 + (n * 9.9) },
  'biphase.feedback': { type: 'effect', effectType: 'BiPhase', param: 'feedback', transform: n => n * 0.95 },
  'biphase.routing':  { type: 'effect', effectType: 'BiPhase', param: 'routing',  transform: n => n > 0.5 ? 1 : 0 },

  // ── Mixer ─────────────────────────────────────────────────────────
  'mixer.volume': { type: 'config', path: 'volume', transform: n => -60 + (n * 60) },
  'mixer.pan':    { type: 'config', path: 'pan',    transform: n => -100 + (n * 200) },
};

// ============================================================================
// VSTBridge helper
// ============================================================================

function getVSTBridgeSynth(instrumentId: number): any {
  const engine = getToneEngine();
  const key = `${instrumentId}--1`;
  return engine.instruments.get(key);
}

// ============================================================================
// Deep-set helper for nested config paths
// ============================================================================

/**
 * Build a nested update object from a dot-path and value.
 * e.g., buildNestedUpdate('tb303.filter.cutoff', 0.5, instrument)
 * returns { tb303: { ...instrument.tb303, filter: { ...instrument.tb303.filter, cutoff: 0.5 } } }
 *
 * For array-indexed paths like 'furnace.operators.0.tl':
 * returns { furnace: { ...instrument.furnace, operators: [...operators with [0].tl = value] } }
 */
function buildNestedUpdate(
  path: string,
  value: number,
  instrument: Record<string, any>
): Record<string, any> {
  const parts = path.split('.');

  // Simple top-level property (e.g., 'volume', 'pan')
  if (parts.length === 1) {
    return { [parts[0]]: value };
  }

  // Build the nested update by walking down from the instrument's existing data
  function buildLevel(partIndex: number, current: any): any {
    if (partIndex === parts.length - 1) {
      // Leaf: return the value
      return value;
    }

    const key = parts[partIndex];
    const nextKey = parts[partIndex + 1];
    const isNextArrayIndex = /^\d+$/.test(nextKey);

    if (isNextArrayIndex) {
      // Array case: e.g., 'operators.0.tl'
      const arrayIndex = parseInt(nextKey);
      const currentArray = Array.isArray(current?.[key]) ? [...current[key]] : [];
      const arrayElement = currentArray[arrayIndex] ? { ...currentArray[arrayIndex] } : {};

      // Recurse past the index
      const leafKey = parts[partIndex + 2];
      if (leafKey !== undefined) {
        arrayElement[leafKey] = buildLevel(partIndex + 3, arrayElement);
        // If partIndex + 3 >= parts.length, that buildLevel returned value
        if (partIndex + 3 >= parts.length) {
          arrayElement[leafKey] = value;
        }
      }

      currentArray[arrayIndex] = arrayElement;
      return { ...current, [key]: currentArray };
    }

    // Object case: recurse
    const childCurrent = current?.[key] || {};
    const childUpdate = buildLevel(partIndex + 1, childCurrent);

    // If child is the final value (leaf returned from recursion), set it
    if (partIndex + 1 === parts.length - 1) {
      return { ...current, [key]: { ...childCurrent, [parts[partIndex + 1]]: childUpdate } };
    }

    return { ...current, [key]: childUpdate };
  }

  // Start from the first key
  const rootKey = parts[0];
  const rootCurrent = instrument[rootKey] || {};

  if (parts.length === 2) {
    // Simple 2-level: e.g., 'obxd.filterCutoff'
    return { [rootKey]: { ...rootCurrent, [parts[1]]: value } };
  }

  if (parts.length === 3) {
    // 3-level: e.g., 'tb303.filter.cutoff'
    const midKey = parts[1];
    const leafKey = parts[2];
    const midCurrent = rootCurrent[midKey] || {};
    return { [rootKey]: { ...rootCurrent, [midKey]: { ...midCurrent, [leafKey]: value } } };
  }

  if (parts.length === 4 && /^\d+$/.test(parts[2])) {
    // Array case: e.g., 'furnace.operators.0.tl' or 'dexed.operators.0.level'
    const arrayKey = parts[1];
    const arrayIndex = parseInt(parts[2]);
    const leafKey = parts[3];
    const currentArray = Array.isArray(rootCurrent[arrayKey]) ? [...rootCurrent[arrayKey]] : [];
    currentArray[arrayIndex] = { ...currentArray[arrayIndex], [leafKey]: value };
    return { [rootKey]: { ...rootCurrent, [arrayKey]: currentArray } };
  }

  // Generic deep case (shouldn't normally be needed, but safe fallback)
  return buildLevel(0, instrument);
}

// ============================================================================
// Main Router
// ============================================================================

/**
 * Route a parameter change to the correct synth engine.
 *
 * @param param - MappableParameter string or NKS2 engineParam key
 * @param normalizedValue - 0-1 normalized value
 * @param instrumentId - Optional instrument ID (uses current if omitted)
 */
export function routeParameterToEngine(
  param: MappableParameter | string,
  normalizedValue: number,
  instrumentId?: number,
): void {
  const route = PARAMETER_ROUTES[param];
  if (!route) {
    console.warn(`[parameterRouter] No route for parameter: ${param}`);
    return;
  }

  const instrumentStore = useInstrumentStore.getState();
  const targetId = instrumentId ?? instrumentStore.currentInstrumentId;
  const instrument = instrumentStore.instruments.find(i => i.id === targetId);

  if (!instrument) {
    console.warn(`[parameterRouter] No instrument found for id: ${targetId}`);
    return;
  }

  const value = route.transform ? route.transform(normalizedValue) : normalizedValue;

  switch (route.type) {
    case 'config': {
      const update = buildNestedUpdate(route.path, value, instrument as any);
      instrumentStore.updateInstrument(instrument.id, update);
      break;
    }

    case 'vstbridge': {
      const synth = getVSTBridgeSynth(instrument.id);
      if (synth && 'setParameter' in synth) {
        (synth as any).setParameter(route.paramId, value);
      }
      break;
    }

    case 'effect': {
      const fx = instrument.effects.find((e: any) => e.type === route.effectType);
      if (fx) {
        instrumentStore.updateEffect(instrument.id, fx.id, {
          parameters: { ...fx.parameters, [route.param]: value },
        });
      }
      break;
    }
  }
}

/**
 * Route a parameter change from a MIDI CC value (0-127).
 * Convenience wrapper that normalizes CC to 0-1 before routing.
 */
export function routeCCToEngine(
  param: MappableParameter | string,
  ccValue: number,
  instrumentId?: number,
): void {
  routeParameterToEngine(param, ccValue / 127, instrumentId);
}

/**
 * Route a VSTBridge parameter directly by index.
 * Used for auto-profiled synths that bypass the route table.
 */
export function routeVSTBridgeParam(
  instrumentId: number,
  vstParamId: number,
  value: number,
): void {
  const synth = getVSTBridgeSynth(instrumentId);
  if (synth && 'setParameter' in synth) {
    (synth as any).setParameter(vstParamId, value);
  }
}

/**
 * Check if a parameter has a known route.
 */
export function hasRoute(param: string): boolean {
  return param in PARAMETER_ROUTES;
}

/**
 * Get all registered parameter route keys.
 */
export function getRouteKeys(): string[] {
  return Object.keys(PARAMETER_ROUTES);
}

/**
 * Register a dynamic route at runtime (for auto-profiled VSTBridge/WAM synths).
 */
export function registerRoute(param: string, route: ParameterRoute): void {
  PARAMETER_ROUTES[param] = route;
}
