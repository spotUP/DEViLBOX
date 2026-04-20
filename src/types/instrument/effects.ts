/**
 * Effect-related types and interfaces
 */

export type AudioEffectType =
  | 'Distortion'
  | 'Reverb'
  | 'Delay'
  | 'Chorus'
  | 'Phaser'
  | 'Tremolo'
  | 'Vibrato'
  | 'Compressor'
  | 'EQ3'
  | 'Filter'
  | 'BitCrusher'
  | 'Chebyshev'
  | 'FrequencyShifter'
  | 'PingPongDelay'
  | 'PitchShift'
  | 'AutoFilter'
  | 'AutoPanner'
  | 'AutoWah'
  | 'FeedbackDelay'
  | 'JCReverb'
  | 'StereoWidener'
  | 'TapeSaturation'
  | 'SidechainCompressor'
  | 'SpaceEcho'
  | 'BiPhase'
  | 'DubFilter'
  | 'Neural' // Neural effects category
  | 'SpaceyDelayer'    // WASM SpaceyDelayer multitap tape delay
  | 'RETapeEcho'       // WASM RE-150/201 tape echo
  // WASM effects (native C++ DSP via AudioWorklet)
  | 'MoogFilter'       // 6 analog-modeled Moog ladder filters (WASM)
  | 'MVerb'            // MVerb plate reverb (WASM, GPL v3)
  | 'MadProfessorPlate' // MVerb tuned to Mad Professor PCM-70 dub voicing (WASM)
  | 'DattorroPlate'    // Jon Dattorro 1997 plate reverb (MIT, el-visio/dattorro-verb port)
  | 'Leslie'           // Leslie rotary speaker (WASM)
  | 'SpringReverb'     // Spring reverb with drip (WASM)
  | 'VinylNoise'       // Vinyl crackle & hiss synthesizer
  | 'Tumult'           // Tumult noise/ambience generator (AudioWorklet, 1:1 port)
  | 'TapeSimulator'   // Kiss of Shame tape deck emulator (WASM port)
  | 'ToneArm'         // Physics-based vinyl playback simulation (AudioWorklet, 1:1 port)
  | 'Aelapse'         // Ælapse tape delay + spring reverb (WASM, smiarx/aelapse port)
  | 'SwedishChainsaw' // Boss HM-2 + JCM800 tonestack (WASM, Barabas5532 port)
  | 'TapeDelay'       // RE-201/Echoplex tape delay (AudioWorklet, cyrusasfa port)
  // *Wave / ambient effects
  | 'ShimmerReverb'   // Shimmer reverb with pitch-shifted feedback (WASM)
  | 'GranularFreeze'  // Live-capture granular freeze effect (WASM)
  | 'TapeDegradation' // Tape wow/flutter/hiss degradation
  | 'AmbientDelay'    // Modulated multi-tap delay with feedback filter
  | 'Vocoder'         // Channel vocoder (WASM voclib) — chain or mic modulator
  | 'AutoTune'        // Real-time pitch correction (YIN detection + PitchShift)
  // Dynamics & processing (WASM)
  | 'BassEnhancer'    // Sub-harmonic bass enhancement (WASM)
  | 'Exciter'         // Harmonic exciter (WASM)
  | 'TransientDesigner' // Transient attack/sustain shaper (WASM)
  | 'MultibandComp'   // 3-band multiband compressor (WASM)
  | 'Limiter'         // Brick-wall limiter (WASM)
  // WAM 2.0 effects (external Web Audio Module plugins)
  | 'WAMBigMuff'        // Big Muff Pi fuzz
  | 'WAMTS9'            // TS-9 Overdrive
  | 'WAMDistoMachine'   // Disto Machine distortion
  | 'WAMQuadraFuzz'     // QuadraFuzz multiband
  | 'WAMVoxAmp'         // Vox Amp 30
  | 'WAMStonePhaser'    // Stone Phaser stereo
  | 'WAMPingPongDelay'  // Ping Pong Delay
  | 'WAMFaustDelay'     // Faust Delay
  | 'WAMPitchShifter'   // Csound Pitch Shifter
  | 'WAMGraphicEQ'      // Graphic Equalizer
  | 'WAMPedalboard';    // Pedalboard multi-FX

export type EffectCategory = 'tonejs' | 'neural' | 'wasm' | 'wam';

export interface EffectConfig {
  id: string;
  category: EffectCategory;  // Discriminator for effect type
  type: AudioEffectType;          // For tonejs: existing types; for neural: "Neural"
  enabled: boolean;
  wet: number; // 0-100%
  parameters: Record<string, number | string>;  // Parameters (numbers are 0-100 normalized, strings for types/modes)

  // Neural-specific (only when category === 'neural')
  neuralModelIndex?: number;   // Index into GUITARML_MODEL_REGISTRY
  neuralModelName?: string;    // Display name cache

  // Sidechain routing (only for SidechainCompressor)
  sidechainSource?: number;  // Channel index to use as sidechain input (-1 or undefined = none)

  // Per-channel routing: which channels this effect applies to.
  // undefined or empty = all channels (default master bus behavior).
  // When set, the effect is applied via a dedicated send bus to only
  // the selected channels instead of the full master chain.
  selectedChannels?: number[];

  // DJ master-chain bass-lock: when true, the effect is inserted on a
  // high-pass split at ~150 Hz and the low end bypasses the effect
  // entirely (keeps the bassline clean while phaser/reverb/delay
  // processes the mids/highs only). When false, effect processes full
  // spectrum. When undefined, falls back to a per-type default (see
  // `getDefaultBassLock` in bassLockDefaults.ts — true for reverbs /
  // delays / phasers, false for distortion/compression/EQ).
  bassLock?: boolean;
}

/** Per-effect parameter preset (factory or user-saved) */
export interface EffectPreset {
  name: string;
  params: Record<string, number | string>;
}
