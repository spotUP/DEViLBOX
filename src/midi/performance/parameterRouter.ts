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
import { useAudioStore } from '../../stores/useAudioStore';
import { getToneEngine } from '../../engine/ToneEngine';
import { getChannelFilterManager } from '../../engine/ChannelFilterManager';
import { getDJEngine } from '../../engine/dj/DJEngine';
import { useDJStore } from '../../stores/useDJStore';
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

interface ChannelFilterRoute {
  type: 'channelFilter';
  /** Which filter parameter to control */
  filterParam: 'position' | 'resonance';
  /** Transform normalized 0-1 value */
  transform?: (normalized: number) => number;
}

type ParameterRoute = ConfigRoute | VSTBridgeRoute | EffectRoute | ChannelFilterRoute;

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

  // ── 303 Oscillator ──────────────────────────────────────────────
  'tuning':               { type: 'config', path: 'tb303.tuning', transform: n => -1 + n * 2 },
  'waveform':             { type: 'config', path: 'tb303.oscillator.waveformBlend' },
  'pulseWidth':           { type: 'config', path: 'tb303.oscillator.pulseWidth' },
  'subOscGain':           { type: 'config', path: 'tb303.oscillator.subOscGain' },
  'subOscBlend':          { type: 'config', path: 'tb303.oscillator.subOscBlend' },
  'pitchToPw':            { type: 'config', path: 'tb303.oscillator.pitchToPw' },
  'volume':               { type: 'config', path: 'tb303.volume' },

  // ── 303 MOJO (filter character) ──────────────────────────────────
  'passbandCompensation': { type: 'config', path: 'tb303.devilFish.passbandCompensation' },
  'resTracking':          { type: 'config', path: 'tb303.devilFish.resTracking' },
  'filterInputDrive':     { type: 'config', path: 'tb303.devilFish.filterInputDrive' },
  'diodeCharacter':       { type: 'config', path: 'tb303.devilFish.diodeCharacter' },
  'duffingAmount':        { type: 'config', path: 'tb303.devilFish.duffingAmount', transform: n => -1 + n * 2 },
  'filterFmDepth':        { type: 'config', path: 'tb303.devilFish.filterFmDepth' },
  'lpBpMix':              { type: 'config', path: 'tb303.devilFish.lpBpMix' },

  // ── 303 DevilFish (circuit mods) ───────────────────────────────
  'normalDecay':          { type: 'config', path: 'tb303.devilFish.normalDecay' },
  'accentDecay':          { type: 'config', path: 'tb303.devilFish.accentDecay' },
  'softAttack':           { type: 'config', path: 'tb303.devilFish.softAttack' },
  'accentSoftAttack':     { type: 'config', path: 'tb303.devilFish.accentSoftAttack' },
  'filterTracking':       { type: 'config', path: 'tb303.devilFish.filterTracking' },
  'stageNLAmount':        { type: 'config', path: 'tb303.devilFish.stageNLAmount' },
  'ensembleAmount':       { type: 'config', path: 'tb303.devilFish.ensembleAmount' },

  // ── 303 Korg (ladder filter) ───────────────────────────────────
  'korgBite':             { type: 'config', path: 'tb303.devilFish.korgBite' },
  'korgClip':             { type: 'config', path: 'tb303.devilFish.korgClip' },
  'korgCrossmod':         { type: 'config', path: 'tb303.devilFish.korgCrossmod' },
  'korgQSag':             { type: 'config', path: 'tb303.devilFish.korgQSag' },
  'korgSharpness':        { type: 'config', path: 'tb303.devilFish.korgSharpness' },

  // ── 303 LFO ────────────────────────────────────────────────────
  'lfoRate':              { type: 'config', path: 'tb303.lfo.rate' },
  'lfoContour':           { type: 'config', path: 'tb303.lfo.contour', transform: n => -1 + n * 2 },
  'lfoPitchDepth':        { type: 'config', path: 'tb303.lfo.pitchDepth' },
  'lfoPwmDepth':          { type: 'config', path: 'tb303.lfo.pwmDepth' },
  'lfoFilterDepth':       { type: 'config', path: 'tb303.lfo.filterDepth' },
  'lfoStiffDepth':        { type: 'config', path: 'tb303.lfo.stiffDepth' },

  // ── 303 FX ─────────────────────────────────────────────────────
  'chorusMix':            { type: 'config', path: 'tb303.chorus.mix' },
  'phaserRate':           { type: 'config', path: 'tb303.phaser.rate' },
  'phaserWidth':          { type: 'config', path: 'tb303.phaser.depth' },
  'phaserFeedback':       { type: 'config', path: 'tb303.phaser.feedback' },
  'phaserMix':            { type: 'config', path: 'tb303.phaser.mix' },
  'delayTime':            { type: 'config', path: 'tb303.delay.time' },
  'delayFeedback':        { type: 'config', path: 'tb303.delay.feedback' },
  'delayTone':            { type: 'config', path: 'tb303.delay.tone' },
  'delayMix':             { type: 'config', path: 'tb303.delay.mix' },
  'delaySpread':          { type: 'config', path: 'tb303.delay.stereo' },

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

  // ── OBXd (removed — kept for backwards compat with saved MIDI mappings) ──
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

  // ── Channel Filters (DJ-style sweeps for ALL channels) ──────────
  'mixer.filterPosition':  { type: 'channelFilter', filterParam: 'position',  transform: n => n * 2 - 1 }, // 0-1 → -1..+1
  'mixer.filterResonance': { type: 'channelFilter', filterParam: 'resonance' }, // 0-1 pass-through

  // ── Master FX (placeholder — routed via routeMasterFXParameter) ──
  // These are handled specially since they target the master effects chain
  // rather than per-instrument config. The route entries exist so hasRoute()
  // returns true for them.
  'masterFx.slot0.wet':      { type: 'config', path: '__masterFx__' },
  'masterFx.slot0.param0':   { type: 'config', path: '__masterFx__' },
  'masterFx.slot1.wet':      { type: 'config', path: '__masterFx__' },
  'masterFx.slot1.param0':   { type: 'config', path: '__masterFx__' },
  'masterFx.slot2.wet':      { type: 'config', path: '__masterFx__' },
  'masterFx.slot2.param0':   { type: 'config', path: '__masterFx__' },
  'masterFx.masterVolume':   { type: 'config', path: '__masterFx__' },
  'masterFx.limiterCeiling': { type: 'config', path: '__masterFx__' },
};

// ============================================================================
// VSTBridge helper
// ============================================================================

function getVSTBridgeSynth(instrumentId: number): unknown {
  const engine = getToneEngine();
  const key = (instrumentId << 16) | 0xFFFF;
  return engine.instruments.get(key);
}

// ============================================================================
// Throttle for direct synth calls — prevent audio glitches from rapid MIDI CC
// ============================================================================

const _pendingSynthUpdates: Map<number, Map<string, number>> = new Map();
let _synthFlushScheduled = false;

function flushSynthUpdates(): void {
  _synthFlushScheduled = false;
  try {
    const engine = getToneEngine();
    for (const [instrumentId, params] of _pendingSynthUpdates) {
      let found = false;
      engine.instruments.forEach((instrument, key) => {
        if ((key >>> 16) !== instrumentId) return;
        found = true;
        const synthObj = instrument as unknown as Record<string, unknown>;
        if (typeof synthObj.set === 'function') {
          for (const [param, value] of params) {
            try {
              // Call set() as a method on the object to preserve `this` binding.
              // Also handle Tone.js native synths which expect set({key: value}).
              (synthObj as any).set(param, value);
            } catch {
              // Tone.js synths: set() expects an object, not (string, number)
              try { (synthObj as any).set({ [param]: value }); } catch { /* ignore */ }
            }
          }
        }
      });
      if (!found && (globalThis as Record<string, unknown>).MIDI_DEBUG) {
        console.warn(`[SynthFlush] NO MATCH for instId=${instrumentId} — engine has ${engine.instruments.size} instruments`);
      }
    }
  } catch (e) {
    console.warn('[KnobRoute] flush error:', e);
  }
  _pendingSynthUpdates.clear();
}

function sendDirectToSynth(instrumentId: number, param: string, value: number): void {
  // Coalesce rapid updates — only send to synth at ~60Hz (requestAnimationFrame)
  let instrumentParams = _pendingSynthUpdates.get(instrumentId);
  if (!instrumentParams) {
    instrumentParams = new Map();
    _pendingSynthUpdates.set(instrumentId, instrumentParams);
  }
  instrumentParams.set(param, value);

  if (!_synthFlushScheduled) {
    _synthFlushScheduled = true;
    requestAnimationFrame(flushSynthUpdates);
  }
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
  instrument: Record<string, unknown>
): Record<string, unknown> {
  const parts = path.split('.');

  // Simple top-level property (e.g., 'volume', 'pan')
  if (parts.length === 1) {
    return { [parts[0]]: value };
  }

  // Build the nested update by walking down from the instrument's existing data
  function buildLevel(partIndex: number, current: Record<string, unknown>): unknown {
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
      const rawArr = current?.[key];
      const currentArray = Array.isArray(rawArr) ? [...rawArr] as Record<string, unknown>[] : [] as Record<string, unknown>[];
      const arrayElement: Record<string, unknown> = currentArray[arrayIndex] ? { ...currentArray[arrayIndex] } : {};

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
    const childCurrent = (current?.[key] || {}) as Record<string, unknown>;
    const childUpdate = buildLevel(partIndex + 1, childCurrent);

    // If child is the final value (leaf returned from recursion), set it
    if (partIndex + 1 === parts.length - 1) {
      return { ...current, [key]: { ...childCurrent, [parts[partIndex + 1]]: childUpdate } };
    }

    return { ...current, [key]: childUpdate };
  }

  // Start from the first key
  const rootKey = parts[0];
  const rootCurrent = (instrument[rootKey] || {}) as Record<string, unknown>;

  if (parts.length === 2) {
    // Simple 2-level: e.g., 'obxd.filterCutoff'
    return { [rootKey]: { ...rootCurrent, [parts[1]]: value } };
  }

  if (parts.length === 3) {
    // 3-level: e.g., 'tb303.filter.cutoff'
    const midKey = parts[1];
    const leafKey = parts[2];
    const midCurrent = (rootCurrent[midKey] || {}) as Record<string, unknown>;
    return { [rootKey]: { ...rootCurrent, [midKey]: { ...midCurrent, [leafKey]: value } } };
  }

  if (parts.length === 4 && /^\d+$/.test(parts[2])) {
    // Array case: e.g., 'furnace.operators.0.tl' or 'dexed.operators.0.level'
    const arrayKey = parts[1];
    const arrayIndex = parseInt(parts[2]);
    const leafKey = parts[3];
    const rawArr = rootCurrent[arrayKey];
    const currentArray = Array.isArray(rawArr) ? [...rawArr] as Record<string, unknown>[] : [] as Record<string, unknown>[];
    currentArray[arrayIndex] = { ...currentArray[arrayIndex], [leafKey]: value };
    return { [rootKey]: { ...rootCurrent, [arrayKey]: currentArray } };
  }

  // Generic deep case (shouldn't normally be needed, but safe fallback)
  return buildLevel(0, instrument) as Record<string, unknown>;
}

// ============================================================================
// Throttle for config routes — coalesce rapid MIDI CC updates to ~60Hz
// to avoid flooding the store/React with per-CC-message re-renders.
// ============================================================================

const _pendingConfigUpdates: Map<number, Record<string, unknown>> = new Map();
let _configFlushScheduled = false;

function flushConfigUpdates(): void {
  _configFlushScheduled = false;
  const instrumentStore = useInstrumentStore.getState();
  for (const [instrumentId, update] of _pendingConfigUpdates) {
    instrumentStore.updateInstrument(instrumentId, update);
  }
  _pendingConfigUpdates.clear();
}

function scheduleConfigUpdate(instrumentId: number, update: Record<string, unknown>): void {
  // Merge into any pending update for this instrument
  const existing = _pendingConfigUpdates.get(instrumentId);
  if (existing) {
    deepMerge(existing, update);
  } else {
    _pendingConfigUpdates.set(instrumentId, update);
  }

  if (!_configFlushScheduled) {
    _configFlushScheduled = true;
    requestAnimationFrame(flushConfigUpdates);
  }
}

/** Recursively merge src into dst (mutates dst).
 *  Clones frozen sub-objects before writing — buildNestedUpdate may contain
 *  frozen references from the Zustand store that can't be mutated in-place. */
function deepMerge(dst: Record<string, unknown>, src: Record<string, unknown>): void {
  for (const key of Object.keys(src)) {
    const srcVal = src[key];
    const dstVal = dst[key];
    if (
      typeof srcVal === 'object' && srcVal !== null && !Array.isArray(srcVal) &&
      typeof dstVal === 'object' && dstVal !== null && !Array.isArray(dstVal)
    ) {
      if (Object.isFrozen(dstVal)) {
        dst[key] = { ...(dstVal as Record<string, unknown>) };
      }
      deepMerge(dst[key] as Record<string, unknown>, srcVal as Record<string, unknown>);
    } else {
      dst[key] = srcVal;
    }
  }
}

// ============================================================================
// Main Router
// ============================================================================

/** Throttle timestamps for 'effect' CC updates (key = `instrumentId:effectId:param`) */
const _effectThrottleTimestamps = new Map<string, number>();

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
  // Push to live subscribers first so DOM knobs can update on every CC
  // without waiting for React re-render. Harmless if no subscriber.
  fireParamLiveSubscribers(param, normalizedValue);

  // Master FX parameters are routed separately (not per-instrument)
  if (param.startsWith('masterFx.')) {
    routeMasterFXParameter(param, normalizedValue);
    return;
  }

  const route = PARAMETER_ROUTES[param];
  if (!route) {
    // Fallback: try sending directly to the current synth engine.
    // Strips namespace prefix (e.g. 'hively.filterSpeed' → 'filterSpeed')
    const instrumentStore = useInstrumentStore.getState();
    const targetId = instrumentId ?? instrumentStore.currentInstrumentId;
    if (targetId !== undefined && targetId !== null) {
      const shortParam = param.includes('.') ? param.split('.').pop()! : param;
      sendDirectToSynth(targetId, shortParam, normalizedValue);
    }
    return;
  }

  // Channel filter routes don't need an instrument lookup
  if (route.type === 'channelFilter') {
    const filterValue = route.transform ? route.transform(normalizedValue) : normalizedValue;
    const filterManager = getChannelFilterManager();
    // Apply to ALL active channels (global sweep from MIDI knob)
    filterManager.setAll(route.filterParam, filterValue);
    return;
  }

  const instrumentStore = useInstrumentStore.getState();
  const targetId = instrumentId ?? instrumentStore.currentInstrumentId;
  const instrument = instrumentStore.instruments.find(i => i.id === targetId);

  if (!instrument) {
    // Normal during startup — MIDI CC arrives before instruments are loaded
    return;
  }

  const value = route.transform ? route.transform(normalizedValue) : normalizedValue;

  // Debug: Log parameter routing
  if ((globalThis as Record<string, unknown>).MIDI_DEBUG) {
    console.log(`[parameterRouter] ${param} = ${normalizedValue} → ${value} (instrument ${instrument.id})`);
  }

  switch (route.type) {
    case 'config': {
      // Send to synth engine for immediate audio response.
      // Strip namespace prefix from the route key for synth.set().
      // Route keys like 'cutoff', 'accent' → no change (TB303 set() expects these).
      // Namespaced keys like 'mixer.volume' → 'volume', 'synare.tune' → 'tune'.
      // NOTE: Do NOT use route.path here — path is the store's nested config path
      // (e.g. 'tb303.accent.amount') which differs from the synth param name ('accent').
      const dotIdx = param.indexOf('.');
      const synthParam = dotIdx >= 0 ? param.substring(dotIdx + 1) : param;
      // Synths expect 0-1 normalized values — they do their own internal
      // conversion (Hz, dB, etc.). Don't send the route transform output.
      sendDirectToSynth(instrument.id, synthParam, normalizedValue);
      // Also update the store (throttled) for UI persistence — store uses
      // the TRANSFORMED value (dB, Hz, etc.) for Tone.js compatibility.
      const update = buildNestedUpdate(route.path, value, instrument as unknown as Record<string, unknown>);
      scheduleConfigUpdate(instrument.id, update as Record<string, unknown>);
      break;
    }

    case 'vstbridge': {
      const synth = getVSTBridgeSynth(instrument.id);
      if (synth && typeof synth === 'object' && 'setParameter' in (synth as Record<string, unknown>)) {
        (synth as { setParameter: (id: number, v: number) => void }).setParameter(route.paramId, value);
      }
      break;
    }

    case 'effect': {
      const fx = instrument.effects.find((e) => e.type === route.effectType);
      if (fx) {
        // Throttle to ~30Hz: a physical CC knob can fire 100+ updates/sec, each
        // triggering a full Zustand write + potential rebuildMasterEffects. Coalesce
        // within a 33ms window keyed by instrumentId + effectId + param.
        const throttleKey = `${instrument.id}:${fx.id}:${route.param}`;
        const now = performance.now();
        if (now - (_effectThrottleTimestamps.get(throttleKey) ?? 0) < 33) break;
        _effectThrottleTimestamps.set(throttleKey, now);
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
  if (synth && typeof synth === 'object' && 'setParameter' in (synth as Record<string, unknown>)) {
    (synth as { setParameter: (id: number, v: number) => void }).setParameter(vstParamId, value);
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

// ============================================================================
// Master FX Parameter Router
// Routes master effect parameters to the ToneEngine master effects chain.
// ============================================================================

function routeMasterFXParameter(param: string, normalizedValue: number): void {
  try {
    const audioStore = useAudioStore.getState();
    const engine = getToneEngine();

    // Parse param: 'masterFx.slot0.wet', 'masterFx.slot0.param0', 'masterFx.masterVolume', etc.
    if (param === 'masterFx.masterVolume') {
      // Master channel volume: 0-1 → -60..0 dB
      const dB = -60 + normalizedValue * 60;
      engine.masterChannel.volume.rampTo(dB, 0.02);
      return;
    }

    if (param === 'masterFx.limiterCeiling') {
      // Limiter ceiling: 0-1 → -20..0 dB
      const dB = -20 + normalizedValue * 20;
      engine.masterChannel.volume.rampTo(Math.min(0, dB), 0.02);
      return;
    }

    // Parse slot index and param type: 'masterFx.slot0.wet' → slot=0, subParam='wet'
    const match = param.match(/^masterFx\.slot(\d+)\.(\w+)$/);
    if (!match) return;

    const slotIndex = parseInt(match[1]);
    const subParam = match[2];
    const effects = audioStore.masterEffects;

    if (slotIndex >= effects.length) return;

    const effect = effects[slotIndex];
    if (!effect) return;

    if (subParam === 'wet') {
      // Wet: 0-1 → 0-100 (EffectConfig uses 0-100 for wet)
      const wetValue = Math.round(normalizedValue * 100);
      audioStore.updateMasterEffect(effect.id, { wet: wetValue });
    } else if (subParam === 'param0') {
      // Generic first parameter: find the first numeric parameter key
      const paramKeys = Object.keys(effect.parameters).filter(
        k => typeof effect.parameters[k] === 'number'
      );
      if (paramKeys.length > 0) {
        const firstParam = paramKeys[0];
        const currentVal = effect.parameters[firstParam] as number;
        // Scale to reasonable range — assume 0-1 if current value is ≤ 1, else 0-100
        const maxVal = (typeof currentVal === 'number' && currentVal > 1) ? 100 : 1;
        audioStore.updateMasterEffect(effect.id, {
          parameters: { ...effect.parameters, [firstParam]: normalizedValue * maxVal },
        });
      }
    }
  } catch {
    // Audio store not available
  }
}

// ============================================================================
// DJ Parameter Router
// Routes DJ-specific parameters to the DJEngine subsystem.
// Called from useMIDIStore when isDJContext() is true.
// ============================================================================

type DJRouteHandler = (value: number) => void;

let _djRouteCache: Record<string, DJRouteHandler> | null = null;

function getDJRoutes(): Record<string, DJRouteHandler> {
  if (_djRouteCache) return _djRouteCache;

  _djRouteCache = {
    // Crossfader: 0-1 maps directly
    'dj.crossfader': (v) => getDJEngine().setCrossfader(v),

    // Deck volumes: 0-1 maps to 0-1.5 (allows slight boost)
    'dj.deckA.volume': (v) => getDJEngine().deckA.setVolume(v * 1.5),
    'dj.deckB.volume': (v) => getDJEngine().deckB.setVolume(v * 1.5),

    // Master volume: 0-1 maps to 0-1.5
    'dj.masterVolume': (v) => getDJEngine().mixer.setMasterVolume(v * 1.5),

    // EQ: 0-1 maps to -12dB to +12dB range
    'dj.deckA.eqHi': (v) => getDJEngine().deckA.setEQ('high', -12 + v * 24),
    'dj.deckA.eqMid': (v) => getDJEngine().deckA.setEQ('mid', -12 + v * 24),
    'dj.deckA.eqLow': (v) => getDJEngine().deckA.setEQ('low', -12 + v * 24),
    'dj.deckB.eqHi': (v) => getDJEngine().deckB.setEQ('high', -12 + v * 24),
    'dj.deckB.eqMid': (v) => getDJEngine().deckB.setEQ('mid', -12 + v * 24),
    'dj.deckB.eqLow': (v) => getDJEngine().deckB.setEQ('low', -12 + v * 24),

    // Filter: 0-1 maps to -1..+1 (center = off, left = HPF, right = LPF)
    'dj.deckA.filter': (v) => getDJEngine().deckA.setFilterPosition(-1 + v * 2),
    'dj.deckB.filter': (v) => getDJEngine().deckB.setFilterPosition(-1 + v * 2),

    // Filter resonance: 0-1 maps to Q 0.5-15
    'dj.deckA.filterQ': (v) => getDJEngine().deckA.setFilterResonance(0.5 + v * 14.5),
    'dj.deckB.filterQ': (v) => getDJEngine().deckB.setFilterResonance(0.5 + v * 14.5),

    // Pitch: 0-1 maps to -6..+6 semitones
    'dj.deckA.pitch': (v) => getDJEngine().deckA.setPitch(-6 + v * 12),
    'dj.deckB.pitch': (v) => getDJEngine().deckB.setPitch(-6 + v * 12),

    // Scratch velocity: 0-1 maps to -4..+4 (center = stopped)
    'dj.deckA.scratchVelocity': (v) => getDJEngine().deckA.setScratchVelocity(-4 + v * 8),
    'dj.deckB.scratchVelocity': (v) => getDJEngine().deckB.setScratchVelocity(-4 + v * 8),
  };

  return _djRouteCache;
}

/**
 * Route a DJ parameter change to the DJ engine.
 *
 * Uses relative-delta tracking: each CC is treated as a DELTA from the
 * previous MIDI value and added to the current software position. No jump
 * on first touch, 1:1 responsiveness, full 0-1 range reachable. First CC
 * after a preset change / reset establishes baseline without moving SW.
 *
 * @param param - DJ parameter path (e.g., 'dj.crossfader')
 * @param normalizedValue - 0-1 normalized value from MIDI CC
 */
export function routeDJParameter(param: string, normalizedValue: number): void {
  const tracked = djRelativeTrack(param, normalizedValue);

  const routes = getDJRoutes();
  const handler = routes[param];
  if (handler) {
    try {
      handler(tracked);
    } catch {
      // DJ engine not initialized — ignore silently
    }
  }
  // Fire imperative subscribers (DOM-ref knob updates) synchronously on
  // every CC. setAttribute on SVG x/y/d is cheap (no layout) and the
  // browser coalesces paints to the next vsync, so this minimizes the
  // delay between CC arrival and pixels on screen.
  fireParamLiveSubscribers(param, tracked);
  // UI store sync is still batched to 60fps via rAF — immer+broadcast is
  // expensive, and DOM knobs handled imperatively above don't need it.
  scheduleDJStoreSync(param, tracked);
}

// ── rAF-batched store sync (60fps UI) ──────────────────────────────────────
const _pendingDJStoreUpdates = new Map<string, number>();
let _djStoreSyncScheduled = false;

function flushDJStoreSync(): void {
  _djStoreSyncScheduled = false;
  if (_pendingDJStoreUpdates.size > 0) {
    // Single consolidated setState — one immer run, one subscriber broadcast,
    // one React render pass regardless of how many DJ params updated this frame.
    useDJStore.setState((state) => {
      for (const [param, value] of _pendingDJStoreUpdates) {
        applyDJMutation(state as unknown as DJMutableState, param, value);
      }
    });
    _pendingDJStoreUpdates.clear();
  }
  // Drop live values so the next frame's first CC re-seeds from the store
  // (lets DOM-knob changes between MIDI bursts be respected).
  _djLiveValues.clear();
}

// ── Direct state mutation (inside a single setState for minimal overhead) ──
interface DJMutableState {
  crossfaderPosition: number;
  masterVolume: number;
  decks: Record<'A' | 'B' | 'C', {
    volume: number;
    eqLow: number;
    eqMid: number;
    eqHigh: number;
    eqPreset: string | null;
    filterPosition: number;
    filterResonance: number;
    pitchOffset: number;
    effectiveBPM: number;
    detectedBPM: number;
    scratchVelocity: number;
  }>;
}

function applyDJMutation(state: DJMutableState, param: string, value: number): void {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  switch (param) {
    case 'dj.crossfader':
      state.crossfaderPosition = clamp(value, 0, 1);
      break;
    case 'dj.masterVolume':
      state.masterVolume = clamp(value * 1.5, 0, 1.5);
      break;
    case 'dj.deckA.volume':
      state.decks.A.volume = clamp(value * 1.5, 0, 1.5);
      break;
    case 'dj.deckB.volume':
      state.decks.B.volume = clamp(value * 1.5, 0, 1.5);
      break;
    case 'dj.deckA.eqHi':
      state.decks.A.eqHigh = clamp(-12 + value * 24, -12, 12);
      state.decks.A.eqPreset = null;
      break;
    case 'dj.deckA.eqMid':
      state.decks.A.eqMid = clamp(-12 + value * 24, -12, 12);
      state.decks.A.eqPreset = null;
      break;
    case 'dj.deckA.eqLow':
      state.decks.A.eqLow = clamp(-12 + value * 24, -12, 12);
      state.decks.A.eqPreset = null;
      break;
    case 'dj.deckB.eqHi':
      state.decks.B.eqHigh = clamp(-12 + value * 24, -12, 12);
      state.decks.B.eqPreset = null;
      break;
    case 'dj.deckB.eqMid':
      state.decks.B.eqMid = clamp(-12 + value * 24, -12, 12);
      state.decks.B.eqPreset = null;
      break;
    case 'dj.deckB.eqLow':
      state.decks.B.eqLow = clamp(-12 + value * 24, -12, 12);
      state.decks.B.eqPreset = null;
      break;
    case 'dj.deckA.filter':
      state.decks.A.filterPosition = clamp(-1 + value * 2, -1, 1);
      break;
    case 'dj.deckB.filter':
      state.decks.B.filterPosition = clamp(-1 + value * 2, -1, 1);
      break;
    case 'dj.deckA.filterQ':
      state.decks.A.filterResonance = clamp(0.5 + value * 14.5, 0.5, 15);
      break;
    case 'dj.deckB.filterQ':
      state.decks.B.filterResonance = clamp(0.5 + value * 14.5, 0.5, 15);
      break;
    case 'dj.deckA.pitch': {
      const c = clamp(-6 + value * 12, -16, 16);
      state.decks.A.pitchOffset = c;
      const base = state.decks.A.detectedBPM || 120;
      state.decks.A.effectiveBPM = Math.round(base * Math.pow(2, c / 12) * 100) / 100;
      break;
    }
    case 'dj.deckB.pitch': {
      const c = clamp(-6 + value * 12, -16, 16);
      state.decks.B.pitchOffset = c;
      const base = state.decks.B.detectedBPM || 120;
      state.decks.B.effectiveBPM = Math.round(base * Math.pow(2, c / 12) * 100) / 100;
      break;
    }
    case 'dj.deckA.scratchVelocity':
      state.decks.A.scratchVelocity = clamp(-4 + value * 8, -8, 8);
      break;
    case 'dj.deckB.scratchVelocity':
      state.decks.B.scratchVelocity = clamp(-4 + value * 8, -8, 8);
      break;
  }
}

// ── Imperative live-value subscribers (bypass React render entirely) ──────
// Knob components can subscribe via subscribeToParamLiveValue to push updates
// directly to the DOM (line x/y, arc d attribute) on each CC, skipping the
// React store → selector → render cycle. Works for any param — DJ, TB303,
// Siren, Furnace, effect chains — as long as its router calls
// fireParamLiveSubscribers() after resolving the normalized value.
type LiveValueCallback = (normalized: number) => void;
const _paramLiveSubscribers = new Map<string, Set<LiveValueCallback>>();

/** Subscribe to live pre-store values of ANY param (MIDI-routed). Fires
 *  synchronously on each CC with a normalized 0-1 value. Returns an
 *  unsubscribe fn. */
export function subscribeToParamLiveValue(param: string, cb: LiveValueCallback): () => void {
  let set = _paramLiveSubscribers.get(param);
  if (!set) {
    set = new Set();
    _paramLiveSubscribers.set(param, set);
  }
  set.add(cb);
  return () => {
    set!.delete(cb);
    if (set!.size === 0) _paramLiveSubscribers.delete(param);
  };
}

/** Backward-compatible alias — DJ callers use the generic subscriber. */
export const subscribeToDJLiveValue = subscribeToParamLiveValue;

/** Fire all live-value subscribers for a param with a normalized 0-1 value.
 *  Called by both routeDJParameter and routeParameterToEngine so any knob
 *  in the app can bypass React. */
function fireParamLiveSubscribers(param: string, normalized: number): void {
  const subs = _paramLiveSubscribers.get(param);
  if (subs && subs.size > 0) {
    for (const cb of subs) cb(normalized);
  }
}

function scheduleDJStoreSync(param: string, normalized: number): void {
  _pendingDJStoreUpdates.set(param, normalized); // last value wins per param
  if (!_djStoreSyncScheduled) {
    _djStoreSyncScheduled = true;
    requestAnimationFrame(flushDJStoreSync);
  }
}

// ── Relative-delta tracking state ──────────────────────────────────────────
// Keyed by DJ param path. Stores the last MIDI value we saw; the next CC's
// delta (midiValue - lastMidi) is added to the current SW value. First CC
// for a param sets the baseline but doesn't move SW (no jump on first touch).
// _djLiveValues holds the running SW value so multiple CCs within a single
// rAF frame accumulate correctly (readDJParamNormalized would otherwise be
// stale until the rAF flush writes to the store).
const _djLastMidi = new Map<string, number>();
const _djLiveValues = new Map<string, number>();

/** Returns the current software (store) value for a DJ param in 0-1 space. */
function readDJParamNormalized(param: string): number | null {
  const store = useDJStore.getState();
  switch (param) {
    case 'dj.crossfader':      return store.crossfaderPosition;
    case 'dj.deckA.volume':    return Math.max(0, Math.min(1, store.decks.A.volume / 1.5));
    case 'dj.deckB.volume':    return Math.max(0, Math.min(1, store.decks.B.volume / 1.5));
    case 'dj.masterVolume':    return Math.max(0, Math.min(1, store.masterVolume / 1.5));
    case 'dj.deckA.eqHi':      return (store.decks.A.eqHigh + 12) / 24;
    case 'dj.deckA.eqMid':     return (store.decks.A.eqMid   + 12) / 24;
    case 'dj.deckA.eqLow':     return (store.decks.A.eqLow   + 12) / 24;
    case 'dj.deckB.eqHi':      return (store.decks.B.eqHigh + 12) / 24;
    case 'dj.deckB.eqMid':     return (store.decks.B.eqMid   + 12) / 24;
    case 'dj.deckB.eqLow':     return (store.decks.B.eqLow   + 12) / 24;
    case 'dj.deckA.filter':    return (store.decks.A.filterPosition + 1) / 2;
    case 'dj.deckB.filter':    return (store.decks.B.filterPosition + 1) / 2;
    case 'dj.deckA.filterQ':   return (store.decks.A.filterResonance - 0.5) / 14.5;
    case 'dj.deckB.filterQ':   return (store.decks.B.filterResonance - 0.5) / 14.5;
    case 'dj.deckA.pitch':     return (store.decks.A.pitchOffset + 6) / 12;
    case 'dj.deckB.pitch':     return (store.decks.B.pitchOffset + 6) / 12;
    default:                   return null; // no SW reference — pass through unchanged
  }
}

function djRelativeTrack(param: string, midiValue: number): number {
  // Use live value if available (accumulated within current rAF frame),
  // otherwise seed from the store (start of a new frame / first ever touch).
  let sw = _djLiveValues.get(param);
  if (sw === undefined) {
    const stored = readDJParamNormalized(param);
    if (stored === null) return midiValue; // no SW reference — pass through
    sw = stored;
  }

  const lastMidi = _djLastMidi.get(param);
  _djLastMidi.set(param, midiValue);
  const debug = (globalThis as Record<string, unknown>).DJ_PICKUP_DEBUG;

  // First CC for this param — establish baseline without moving SW
  if (lastMidi === undefined) {
    _djLiveValues.set(param, sw);
    if (debug) console.log(`[DJRelative] ${param} BASELINE midi=${midiValue.toFixed(3)} sw=${sw.toFixed(3)}`);
    return sw;
  }

  const delta = midiValue - lastMidi;

  // Adaptive scaling: each CC moves SW proportionally so the two converge
  // at the matching extreme. speed = (SW range left toward target) / (physical
  // range left toward target). Produces 1:1 when SW and physical are in sync,
  // accelerates when SW is behind, decelerates when SW is ahead, and hits
  // 0 / 1 exactly when the physical knob reaches its stop. No discontinuous
  // snaps — reversing direction re-computes the ratio cleanly.
  let next: number;
  if (delta === 0) {
    next = sw;
  } else if (delta > 0) {
    const remainingPhysical = 1 - lastMidi;
    if (remainingPhysical <= 0) {
      next = 1;
    } else {
      const remainingSW = 1 - sw;
      next = sw + delta * (remainingSW / remainingPhysical);
    }
  } else {
    // delta < 0
    if (lastMidi <= 0) {
      next = 0;
    } else {
      next = sw + delta * (sw / lastMidi); // delta is negative → SW decreases
    }
  }
  next = Math.max(0, Math.min(1, next));
  _djLiveValues.set(param, next);

  if (debug) {
    console.log(
      `[DJAdaptive] ${param} midi=${midiValue.toFixed(3)} last=${lastMidi.toFixed(3)} ` +
      `Δ=${delta >= 0 ? '+' : ''}${delta.toFixed(3)} sw=${sw.toFixed(3)} → ${next.toFixed(3)}`,
    );
  }
  return next;
}

/** Reset relative-track baselines — call when the DJ controller preset changes. */
export function resetDJSoftTakeover(): void {
  _djLastMidi.clear();
  _djLiveValues.clear();
}

/**
 * Update the DJ Zustand store so React knobs reflect MIDI changes.
 * Shared by both useMIDIStore (generic controllers) and DJControllerMapper (DJ presets).
 */
export function syncDJParamToStore(param: string, normalized: number): void {
  const store = useDJStore.getState();
  switch (param) {
    case 'dj.crossfader':
      store.setCrossfader(normalized);
      break;
    case 'dj.deckA.volume':
      store.setDeckVolume('A', normalized * 1.5);
      break;
    case 'dj.deckB.volume':
      store.setDeckVolume('B', normalized * 1.5);
      break;
    case 'dj.masterVolume':
      store.setMasterVolume(normalized * 1.5);
      break;
    case 'dj.deckA.pitch':
      store.setDeckPitch('A', -6 + normalized * 12);
      break;
    case 'dj.deckB.pitch':
      store.setDeckPitch('B', -6 + normalized * 12);
      break;
    case 'dj.deckA.eqHi':
      store.setDeckEQ('A', 'high', -12 + normalized * 24);
      break;
    case 'dj.deckA.eqMid':
      store.setDeckEQ('A', 'mid', -12 + normalized * 24);
      break;
    case 'dj.deckA.eqLow':
      store.setDeckEQ('A', 'low', -12 + normalized * 24);
      break;
    case 'dj.deckB.eqHi':
      store.setDeckEQ('B', 'high', -12 + normalized * 24);
      break;
    case 'dj.deckB.eqMid':
      store.setDeckEQ('B', 'mid', -12 + normalized * 24);
      break;
    case 'dj.deckB.eqLow':
      store.setDeckEQ('B', 'low', -12 + normalized * 24);
      break;
    case 'dj.deckA.filter':
      store.setDeckFilter('A', -1 + normalized * 2);
      break;
    case 'dj.deckB.filter':
      store.setDeckFilter('B', -1 + normalized * 2);
      break;
    case 'dj.deckA.filterQ':
      store.setDeckState('A', { filterResonance: 0.5 + normalized * 14.5 });
      break;
    case 'dj.deckB.filterQ':
      store.setDeckState('B', { filterResonance: 0.5 + normalized * 14.5 });
      break;
    case 'dj.deckA.scratchVelocity':
      store.setDeckState('A', { scratchVelocity: -4 + normalized * 8 });
      break;
    case 'dj.deckB.scratchVelocity':
      store.setDeckState('B', { scratchVelocity: -4 + normalized * 8 });
      break;
  }
}

/**
 * Reset DJ route cache (call when DJ engine is disposed/recreated).
 */
export function resetDJRouteCache(): void {
  _djRouteCache = null;
}

// ============================================================================
// DRUMPAD JOYSTICK MODULATION
// ============================================================================

import { getDrumPadXYMapping } from '../drumpadXYMap';
import { useDrumPadStore } from '../../stores/useDrumPadStore';
import { PAD_INSTRUMENT_BASE } from '../../types/drumpad';
import { getDrumPadEngine } from '../../hooks/drumpad/useMIDIPadRouting';
import type { DrumPadXYMapping } from '../drumpadXYMap';
import type { SynthType } from '../../types/instrument/base';

// ── Joystick modulation snapshot/restore ──
// Snapshots the synth's current param values on first joystick touch per pad.
// On pad release, restores them so the preset sounds the same next trigger.
const _xySnapshots = new Map<number, Map<string, number>>(); // padId → param → normalized

/** Take a snapshot of the current synth values for XY-mapped params */
function snapshotXYParams(padId: number, instId: number, mapping: DrumPadXYMapping): void {
  if (_xySnapshots.has(padId)) return; // Already snapshotted
  const snap = new Map<string, number>();
  try {
    const engine = getToneEngine();
    engine.instruments.forEach((instrument, key) => {
      if ((key >>> 16) !== instId) return;
      const synthObj = instrument as unknown as Record<string, unknown>;
      if (typeof synthObj.get !== 'function') return;
      for (const axis of [mapping.x, mapping.y]) {
        if (axis.target !== 'synth') continue;
        const val = (synthObj as any).get(axis.param);
        if (val !== undefined && typeof val === 'number') {
          snap.set(axis.param, val);
        }
      }
    });
  } catch { /* ignore */ }
  if (snap.size > 0) _xySnapshots.set(padId, snap);
}

/**
 * Reset joystick-modulated params to their pre-modulation values.
 * Call this from releasePad to restore the preset sound.
 */
export function resetDrumPadModulation(padId: number): void {
  const snap = _xySnapshots.get(padId);
  if (!snap) return;

  // Resolve instId the same way routeDrumPadModulation does
  const store = useDrumPadStore.getState();
  const program = store.programs.get(store.currentProgramId);
  if (!program) { _xySnapshots.delete(padId); return; }

  const pad = program.pads.find(p => p.id === padId);
  if (!pad) { _xySnapshots.delete(padId); return; }

  let instId = PAD_INSTRUMENT_BASE + padId;
  if (!pad.synthConfig?.synthType && pad.instrumentId != null) {
    instId = pad.instrumentId;
  }

  for (const [param, value] of snap) {
    sendDirectToSynth(instId, param, value);
  }
  _xySnapshots.delete(padId);
}

/**
 * Apply joystick XY modulation to held drum pads.
 *
 * @param normalizedX - Joystick X axis (0-1, from pitch bend)
 * @param normalizedY - Joystick Y axis (0-1, from mod wheel CC 1)
 * @param heldPadIds  - Array of currently held pad IDs
 */
export function routeDrumPadModulation(
  normalizedX: number | null,
  normalizedY: number | null,
  heldPadIds: number[],
): void {
  if (heldPadIds.length === 0) return;

  const store = useDrumPadStore.getState();
  const program = store.programs.get(store.currentProgramId);
  if (!program) return;

  for (const padId of heldPadIds) {
    const pad = program.pads.find(p => p.id === padId);
    if (!pad) continue;

    // Resolve synthType from synthConfig (pad-owned) or instrumentId (song instrument)
    let synthType: SynthType | undefined = pad.synthConfig?.synthType;
    let instId: number = PAD_INSTRUMENT_BASE + padId;

    if (!synthType && pad.instrumentId != null) {
      const instrument = useInstrumentStore.getState().instruments.find(
        i => i.id === pad.instrumentId,
      );
      if (instrument) {
        synthType = instrument.synthType;
        instId = pad.instrumentId;
      }
    }

    const mapping = getDrumPadXYMapping(synthType);

    // Snapshot current values on first joystick touch (for restore on release)
    snapshotXYParams(padId, instId, mapping);

    if ((globalThis as Record<string, unknown>).MIDI_DEBUG) {
      console.log(`[DrumPadXY] pad=${padId} synth=${synthType} instId=${instId} X=${normalizedX?.toFixed(2)} Y=${normalizedY?.toFixed(2)} target=${mapping.x.target}/${mapping.y.target} mapping=${mapping.x.param}/${mapping.y.param}`);
    }

    if (normalizedX !== null) {
      applyDrumPadAxis(mapping.x, normalizedX, padId, instId);
    }
    if (normalizedY !== null) {
      applyDrumPadAxis(mapping.y, normalizedY, padId, instId);
    }
  }
}

function applyDrumPadAxis(
  axis: DrumPadXYMapping['x'],
  normalized: number,
  padId: number,
  instId: number,
): void {
  // Denormalize value based on curve
  let value: number;
  if (axis.curve === 'log') {
    value = axis.min * Math.pow(axis.max / axis.min, normalized);
  } else {
    value = axis.min + normalized * (axis.max - axis.min);
  }

  if ((globalThis as Record<string, unknown>).MIDI_DEBUG) {
    console.log(`[DrumPadAxis] param=${axis.param} target=${axis.target} norm=${normalized.toFixed(2)} value=${value.toFixed(2)} padId=${padId} instId=${instId}`);
  }

  if (axis.target === 'pad') {
    // Modulate the pad's built-in filter via DrumPadEngine voice
    applyPadFilterParam(padId, axis.param, value);
  } else {
    // Send directly to the synth engine, bypassing PARAMETER_ROUTES.
    // PARAMETER_ROUTES maps generic param names (e.g. 'lfoRate') to specific
    // synth configs (e.g. TB303's 'tb303.lfo.rate') which breaks when the
    // target is a different synth type like DubSiren. Pad synths also aren't
    // in the instrument store, so the route lookup fails silently.
    sendDirectToSynth(instId, axis.param, normalized);
  }
}

/**
 * Directly modulate a DrumPadEngine voice's filter params.
 * This works for sample-only pads and as the universal fallback.
 */
function applyPadFilterParam(padId: number, param: string, value: number): void {
  const engine = getDrumPadEngine();
  if (!engine) return;

  const filterNode = engine.getVoiceFilter(padId);
  if (!filterNode) return;

  const now = filterNode.context.currentTime;
  switch (param) {
    case 'cutoff':
      filterNode.frequency.setTargetAtTime(
        Math.max(20, Math.min(20000, value)),
        now,
        0.01, // 10ms smoothing
      );
      break;
    case 'resonance':
      filterNode.Q.setTargetAtTime(
        (value / 100) * 20,
        now,
        0.01,
      );
      break;
  }
}

// ── Vocoder / Mic joystick modulation ──

import { getActiveVocoderEngine } from '../../engine/vocoder/VocoderEngine';
import { useVocoderStore } from '../../stores/useVocoderStore';

/**
 * Check if the vocoder mic is actively being used (vocoder on + PTT held).
 */
export function isVocoderTalking(): boolean {
  const store = useVocoderStore.getState();
  return store.isActive && store.pttActive;
}

/**
 * Route joystick XY to the active vocoder engine.
 * X (pitch bend) → formantShift (0.25–4.0, log)
 * Y (mod wheel)  → carrierFreq (20–2000 Hz, log)
 */
export function routeVocoderModulation(
  normalizedX: number | null,
  normalizedY: number | null,
): void {
  const engine = getActiveVocoderEngine();
  if (!engine) return;

  if (normalizedX !== null) {
    const shift = 0.25 * Math.pow(4.0 / 0.25, normalizedX);
    engine.setFormantShift(shift);
  }
  if (normalizedY !== null) {
    const freq = 20 * Math.pow(2000 / 20, normalizedY);
    engine.setCarrierFreq(freq);
  }
}
