/**
 * MAME Synth Module Exports
 */

// Base class
export { MAMEBaseSynth, type MAMEMacroConfig, type OscDataCallback } from './MAMEBaseSynth';

// Types
export {
  MacroType,
  type MacroState,
  type OperatorMacroState,
  type ChannelEffectMemory,
  type MAMEChipCapabilities,
  createDefaultChannelMemory,
  createEmptyMacro,
  createMacro,
  getChipCapabilities,
  CHIP_CAPABILITIES,
  DEFAULT_CHIP_CAPABILITIES,
} from './MAMEMacroTypes';

// Effect router
export {
  MAMEEffectRouter,
  type MAMEEffectTarget,
  type EffectFlowControl,
  EffectWaveform,
  getSharedEffectRouter,
} from './MAMEEffectRouter';

// Pitch utilities
export {
  midiToFreq,
  freqToMidi,
  noteNameToMidi,
  applyPitchOffset,
  applyCentsOffset,
  freqToAmigaPeriod,
  amigaPeriodToFreq,
  // Chip-specific
  freqToSCSP,
  freqToYMF271,
  freqToYMOPQ,
  freqToC352,
  freqToES5503,
  freqToK054539,
  freqToICS2115,
  freqToRF5C400,
  freqToSN76477VCO,
  freqToTMS36XX,
  freqToAstrocade,
  freqToUPD933,
  freqToCEM3394,
  freqToVASynth,
  freqToLinear16,
  freqToLinear12,
  // Velocity
  velocityToTL,
  velocityToLinear,
  velocityToLog,
  velocityToDb,
  // Panning
  panToStereo,
  midiPanToXM,
  xmPanTo4bit,
} from './MAMEPitchUtils';

// WASM loader utilities
export {
  ensureMAMEModuleLoaded,
  createMAMEWorkletNode,
  preprocessEmscriptenJS,
} from './mame-wasm-loader';
