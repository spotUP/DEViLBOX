/**
 * Ensoniq VFX/TS-10/SD-1 Wavetable Synthesizer Module
 *
 * Based on the Ensoniq ES5506 chip (1989) for 32-voice
 * wavetable synthesis with resonant filters.
 */

export { VFXSynth, VFX_FACTORY_PRESETS } from './VFXSynth';
export type { VFXPatch, VFXVoice } from './VFXSynth';
export { VFXTranswave, ES5506Control, ES5506FilterMode } from './VFXSynth';
