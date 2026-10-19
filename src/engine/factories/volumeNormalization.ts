/**
 * Volume normalization for synth types.
 * Shared across all sub-factories.
 *
 * Offsets live in two places: a registered synth carries its offset on its
 * SynthDescriptor (volumeOffsetDb); a synth type that is not in SynthRegistry
 * keeps its offset in VOLUME_NORMALIZATION_OFFSETS below. A type must never be
 * in both (src/engine/registry/__tests__/volumeOffsetSingleSource.test.ts).
 */

import { SynthRegistry } from '../registry/SynthRegistry';

export const VOLUME_NORMALIZATION_OFFSETS: Record<string, number> = {
  // Tone.js built-in synths - recalibrated 2026-03-05 via browser test runner
  'PolySynth': 8,        // Measured: -10.3dB → on target
  // Custom synths (WASM and specialized engines) - recalibrated 2026-03-05
  'JC303': 1,            // Same engine as TB303
  // Furnace FM chips - recalibrated 2026-02-13 via browser test runner
  // Furnace Dispatch chips - recalibrated 2026-02-13 via browser test runner
  'PinkTrombone': 6,      // Vocal tract model runs quiet — boost to audible level
  'SuperSaw': 6,         // Measured: -7.3dB → target -10dB
  'WobbleBass': 12,      // Measured: -9.4dB → on target
  'FormantSynth': -1,    // Measured: -0.5dB → target -10dB
  'StringMachine': 7,    // Measured: -5.8dB → target -10dB
  'PWMSynth': 4,         // Measured: -4.9dB → target -10dB
  'ChipSynth': 4,        // Measured: -8.9dB → target -10dB
  'Organ': 3,            // Measured: -10.3dB → on target
  'DrumMachine': 18,     // Measured 2026-02-05: peak -18.4dB at offset 10 → need +8dB delta
  // MAME/WASM synths - CAUTION: test runner can't measure these (WASM doesn't init in test)
  // These offsets are GUESSES. Only Dexed reliably inits in test environment.
  'MdaEPiano': 6,        // Initial estimate — Rhodes is naturally quiet
  'MdaJX10': 4,          // Initial estimate
  'MdaDX10': 4,          // Initial estimate
  'RaffoSynth': 4,       // Minimoog clone
  'CalfMono': 4,         // Calf Monosynth — initial estimate
  'SetBfree': 6,         // setBfree Hammond B3 — organ can be loud
  'SynthV1': 4,          // SynthV1 4-osc poly — initial estimate
  'Amsynth': 3,          // AMSynth analog modelling — moderate output
  'VL1': 3,              // Casio VL-Tone — low output wavetable synth
  'TalNoizeMaker': 4,   // TAL-NoiseMaker VA — initial estimate
  'Aeolus': 6,           // Pipe organ — can be loud
  'FluidSynth': 4,       // SF2 player — depends on soundfont
  'Sfizz': 4,            // SFZ player — depends on samples
  'ZynAddSubFX': 5,      // Mega-synth — can be loud
  // MAME chip synths - calibrated 2026-02-07 via browser test runner
  'HivelySynth': 1,     // Measured: -11.0dB → target -10dB
  'JamCrackerSynth': 0, // JamCracker WASM replayer — volume managed internally
  'MaxTraxSynth': 0,    // MaxTrax WASM replayer — volume managed internally
  'OctaMEDSynth': 0,   // OctaMED synth instrument — volume managed internally
  'UADESynth': 0,       // UADE exotic Amiga player — volume managed internally
  'SunVoxSynth': 0,     // SunVox WASM patch player — volume managed internally
  'SunVoxModular': 0,   // SunVox modular — volume managed internally
  'KlysSynth': 0,       // Klystrack — volume managed internally
  'Sc68Synth': 0,       // SC68/SNDH — volume managed internally
  'ZxtuneSynth': 0,     // ZXTune — volume managed internally
  'AyletSynth': 0,      // aylet — volume managed internally
  'PiyoPiyoSynth': 0,   // PiyoPiyo — volume managed internally
  'PsgplaySynth': 0,    // Atari ST SNDH — volume managed internally
  'GmeSynth': 0,        // game-music-emu — volume managed internally
  'S98Synth': 0,        // S98 on ymfm — volume managed internally
  'TFMSynth': 0,        // TFM Music Maker — volume managed internally
  'StoneTrackerSynth': 0, // StoneTracker — volume managed internally
  'NuadeSynth': 0,       // nuade — volume managed internally
  'EaglePlayerSynth': 0, // eagleplayers on the Musashi host — volume managed internally
  'MusicMakerSynth': 0,  // MusicMaker V8 — volume managed internally
  'MusicLineSynth': 0,  // MusicLine — volume managed internally
  'SymphonieSynth': 0,  // Symphonie — volume managed internally
  'FuturePlayerSynth': 0, // Future Player — volume managed internally
};

/**
 * Get the normalized volume for a synth type
 * Applies synth-specific offset to achieve consistent output levels
 */
/**
 * Config volume a new instrument starts at. Every offset above was measured
 * against this value, so every path that makes a default instrument config
 * must use it (getInitialConfig, createDefaultInstrument).
 */
export const DEFAULT_INSTRUMENT_VOLUME_DB = -12;

/**
 * Raw normalization offset for a synth type: the registry descriptor first,
 * the legacy table for unregistered types, else 0. Furnace types get their
 * offset through setVolumeOffset, so callers that set an output level use
 * getNormalizedVolume, which treats Furnace as 0.
 */
export function instrumentOffsetDb(synthType: string): number {
  return SynthRegistry.get(synthType)?.volumeOffsetDb ?? VOLUME_NORMALIZATION_OFFSETS[synthType] ?? 0;
}

/**
 * The output level, in dB, an instrument of this type runs at for a config
 * volume. Creation and live volume updates both go through here, so the two
 * can never disagree.
 */
export function getNormalizedVolume(synthType: string, configVolume: number | undefined): number {
  const baseVolume = configVolume ?? DEFAULT_INSTRUMENT_VOLUME_DB;
  const offset = synthType.startsWith('Furnace') ? 0 : instrumentOffsetDb(synthType);
  return baseVolume + offset;
}
