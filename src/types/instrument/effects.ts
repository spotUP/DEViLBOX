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
  // Buzzmachines (WASM-emulated Buzz effects)
  | 'BuzzDistortion'   // Arguru Distortion
  | 'BuzzSVF'          // Elak State Variable Filter
  | 'BuzzDelay'        // Jeskola Delay
  | 'BuzzChorus'       // FSM Chorus
  | 'BuzzCompressor'   // Geonik Compressor
  | 'BuzzOverdrive'    // Geonik Overdrive
  | 'BuzzDistortion2'  // Jeskola Distortion
  | 'BuzzCrossDelay'   // Jeskola Cross Delay
  | 'BuzzPhilta'       // FSM Philta (filter)
  | 'BuzzDist2'        // Elak Dist2
  | 'BuzzFreeverb'     // Jeskola Freeverb (reverb)
  | 'BuzzFreqShift'    // Bigyo Frequency Shifter
  | 'BuzzNotch'        // CyanPhase Notch Filter
  | 'BuzzStereoGain'   // DedaCode Stereo Gain
  | 'BuzzSoftSat'      // Graue Soft Saturation
  | 'BuzzLimiter'      // Ld Soft Limiter
  | 'BuzzExciter'      // Oomek Exciter
  | 'BuzzMasterizer'   // Oomek Masterizer
  | 'BuzzStereoDist'   // WhiteNoise Stereo Distortion
  | 'BuzzWhiteChorus'  // WhiteNoise White Chorus
  | 'BuzzZfilter'      // Q Zfilter
  | 'BuzzChorus2'      // FSM Chorus 2
  | 'BuzzPanzerDelay'  // FSM Panzer Delay
  | 'SpaceyDelayer'    // WASM SpaceyDelayer multitap tape delay
  | 'RETapeEcho'       // WASM RE-150/201 tape echo
  // WASM effects (native C++ DSP via AudioWorklet)
  | 'MoogFilter'       // 6 analog-modeled Moog ladder filters (WASM)
  | 'MVerb'            // MVerb plate reverb (WASM, GPL v3)
  | 'Leslie'           // Leslie rotary speaker (WASM)
  | 'SpringReverb'     // Spring reverb with drip (WASM)
  | 'VinylNoise'       // Vinyl crackle & hiss synthesizer
  | 'Tumult'           // Tumult noise/ambience generator (AudioWorklet, 1:1 port)
  | 'TapeSimulator'   // Kiss of Shame tape deck emulator (WASM port)
  | 'ToneArm'         // Physics-based vinyl playback simulation (AudioWorklet, 1:1 port)
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

export type EffectCategory = 'tonejs' | 'neural' | 'buzzmachine' | 'wasm' | 'wam';

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
}
