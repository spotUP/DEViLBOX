/**
 * Unified Effects Registry
 *
 * Combines Tone.js effects and GuitarML neural effects into a single registry.
 * All 60 effects (23 Tone.js + 37 Neural) available for both instrument and master chains.
 */

import { GUITARML_MODEL_REGISTRY } from './guitarMLRegistry';
import type { EffectCategory } from '@typedefs/instrument';

export interface AvailableEffect {
  category: EffectCategory;
  type?: string;              // For tonejs effects
  neuralModelIndex?: number;  // For neural effects
  label: string;
  group: string;              // UI grouping
  description?: string;
}

/**
 * All available effects - Tone.js + Neural combined
 */
export const AVAILABLE_EFFECTS: AvailableEffect[] = [
  // ===== DYNAMICS (Tone.js) =====
  {
    category: 'tonejs',
    type: 'Compressor',
    label: 'Compressor',
    group: 'Dynamics',
    description: 'Dynamic range compression with threshold, ratio, attack, and release',
  },
  {
    category: 'tonejs',
    type: 'EQ3',
    label: '3-Band EQ',
    group: 'Dynamics',
    description: 'Three-band equalizer with low, mid, and high frequency control',
  },

  // ===== DISTORTION (Tone.js) =====
  {
    category: 'tonejs',
    type: 'Distortion',
    label: 'Distortion',
    group: 'Distortion',
    description: 'Waveshaping distortion with drive control',
  },
  {
    category: 'tonejs',
    type: 'BitCrusher',
    label: 'Bit Crusher',
    group: 'Distortion',
    description: 'Digital bit reduction for lo-fi effects',
  },
  {
    category: 'tonejs',
    type: 'Chebyshev',
    label: 'Chebyshev',
    group: 'Distortion',
    description: 'Harmonic waveshaper distortion',
  },
  {
    category: 'tonejs',
    type: 'TapeSaturation',
    label: 'Tape Saturation',
    group: 'Distortion',
    description: 'Analog tape warmth with odd/even harmonic saturation and high-frequency rolloff',
  },

  // ===== TIME-BASED (Tone.js) =====
  {
    category: 'tonejs',
    type: 'Reverb',
    label: 'Reverb',
    group: 'Reverb & Delay',
    description: 'Convolution reverb with decay and pre-delay',
  },
  {
    category: 'tonejs',
    type: 'JCReverb',
    label: 'JC Reverb',
    group: 'Reverb & Delay',
    description: 'Feedback comb filter reverb',
  },
  {
    category: 'tonejs',
    type: 'Delay',
    label: 'Delay',
    group: 'Reverb & Delay',
    description: 'Simple delay with time and feedback',
  },
  {
    category: 'tonejs',
    type: 'FeedbackDelay',
    label: 'Feedback Delay',
    group: 'Reverb & Delay',
    description: 'Delay with enhanced feedback control',
  },
  {
    category: 'tonejs',
    type: 'PingPongDelay',
    label: 'Ping Pong Delay',
    group: 'Reverb & Delay',
    description: 'Stereo delay that bounces between left and right',
  },
  {
    category: 'tonejs',
    type: 'SpaceEcho',
    label: 'Space Echo',
    group: 'Reverb & Delay',
    description: 'Roland RE-201 emulation with 3 heads and spring reverb',
  },
  {
    category: 'tonejs',
    type: 'SpaceyDelayer',
    label: 'Spacey Delayer',
    group: 'Reverb & Delay',
    description: 'Multitap tape delay with configurable tap spacing (WASM)',
  },
  {
    category: 'tonejs',
    type: 'RETapeEcho',
    label: 'RE Tape Echo',
    group: 'Reverb & Delay',
    description: 'Roland RE-150/201 tape echo with wow, flutter, and tape saturation (WASM)',
  },

  // ===== MODULATION (Tone.js) =====
  {
    category: 'tonejs',
    type: 'BiPhase',
    label: 'Bi-Phase',
    group: 'Modulation',
    description: 'Dual-stage phaser with series/parallel routing',
  },
  {
    category: 'tonejs',
    type: 'Chorus',
    label: 'Chorus',
    group: 'Modulation',
    description: 'Modulated delay for thickening sounds',
  },
  {
    category: 'tonejs',
    type: 'Phaser',
    label: 'Phaser',
    group: 'Modulation',
    description: 'Sweeping notch filter effect',
  },
  {
    category: 'tonejs',
    type: 'Tremolo',
    label: 'Tremolo',
    group: 'Modulation',
    description: 'Amplitude modulation for rhythmic pulsing',
  },
  {
    category: 'tonejs',
    type: 'Vibrato',
    label: 'Vibrato',
    group: 'Modulation',
    description: 'Pitch modulation for warbling effects',
  },
  {
    category: 'tonejs',
    type: 'AutoPanner',
    label: 'Auto Panner',
    group: 'Modulation',
    description: 'Automatic stereo panning modulation',
  },

  // ===== FILTERS (Tone.js) =====
  {
    category: 'tonejs',
    type: 'Filter',
    label: 'Filter',
    group: 'Filter',
    description: 'Resonant filter with multiple types',
  },
  {
    category: 'tonejs',
    type: 'DubFilter',
    label: 'Dub Filter',
    group: 'Filter',
    description: 'King Tubby-style resonant high-pass filter for dramatic sweeps',
  },
  {
    category: 'tonejs',
    type: 'AutoFilter',
    label: 'Auto Filter',
    group: 'Filter',
    description: 'LFO-modulated filter for rhythmic sweeps',
  },
  {
    category: 'tonejs',
    type: 'AutoWah',
    label: 'Auto Wah',
    group: 'Filter',
    description: 'Envelope-following wah effect',
  },
  {
    category: 'wasm',
    type: 'MoogFilter',
    label: 'Moog Filter',
    group: 'Filter',
    description: '6 analog-modeled Moog ladder filters (Hyperion, Krajeski, Stilson, Microtracker, Improved, Oberheim) via WASM',
  },
  {
    category: 'wasm',
    type: 'Vocoder',
    label: 'Vocoder',
    group: 'Voice',
    description: 'Channel vocoder (32-band voclib WASM) — chain audio or mic as modulator, internal saw/square/noise/chord carrier, formant shift',
  },
  {
    category: 'wasm',
    type: 'AutoTune',
    label: 'Auto-Tune',
    group: 'Voice',
    description: 'Real-time pitch correction — YIN pitch detection + scale snap (key/scale/strength/speed)',
  },
  {
    category: 'wasm',
    type: 'MVerb',
    label: 'MVerb Plate',
    group: 'Reverb & Delay',
    description: 'MVerb plate reverb — lush algorithmic reverb with damping, density, and early/late reflections (WASM, GPL v3)',
  },
  {
    category: 'wasm',
    type: 'Leslie',
    label: 'Leslie Speaker',
    group: 'Modulation',
    description: 'Rotary speaker cabinet — crossover, dual-rotor AM/doppler, speed ramping between chorale and tremolo (WASM)',
  },
  {
    category: 'wasm',
    type: 'SpringReverb',
    label: 'Spring Reverb',
    group: 'Reverb & Delay',
    description: 'Classic dub spring tank — allpass diffusion, comb bank, metallic drip transients, tension control (WASM)',
  },
  {
    category: 'wasm',
    type: 'Aelapse',
    label: 'Ælapse Tape+Springs',
    group: 'Reverb & Delay',
    description: 'Tape delay chained into a 4-spring reverb tank — saturation, drift, 3 delay modes, spring scatter & chaos. Port of smiarx/aelapse with hardware JUCE UI (WASM)',
  },
  {
    category: 'wasm',
    type: 'VinylNoise',
    label: 'Vinyl Noise',
    group: 'Texture',
    description: 'Vinyl crackle & hiss synthesizer — DSP-generated pops, dust noise, and mid-range warmth (viator-rust port)',
  },
  {
    category: 'wasm',
    type: 'ToneArm',
    label: 'ToneArm',
    group: 'Texture',
    description: 'Physics-based vinyl playback simulation — Faraday cartridge distortion, wow/flutter, RIAA EQ, stylus rolloff, hiss & pops (ToneArm port)',
  },
  {
    category: 'wasm',
    type: 'Tumult',
    label: 'Tumult',
    group: 'Texture',
    description: 'Noise & ambience generator — 5 synth modes + 95 bundled samples, 5-band SVF EQ, Duck/Follow sidechain (Tumult port)',
  },
  {
    category: 'wasm',
    type: 'TapeSimulator',
    label: 'Tape Simulator',
    group: 'Texture',
    description: 'Analog tape deck emulator — saturation, wow/flutter, head bump, bias rolloff, hiss (Kiss of Shame port)',
  },

  // ===== PITCH (Tone.js) =====
  {
    category: 'tonejs',
    type: 'PitchShift',
    label: 'Pitch Shift',
    group: 'Pitch',
    description: 'Transpose audio up or down by semitones',
  },
  {
    category: 'tonejs',
    type: 'FrequencyShifter',
    label: 'Frequency Shifter',
    group: 'Pitch',
    description: 'Ring modulation-style frequency shifting',
  },

  // ===== SPATIAL (Tone.js) =====
  {
    category: 'tonejs',
    type: 'StereoWidener',
    label: 'Stereo Widener',
    group: 'Spatial',
    description: 'Enhance stereo image width',
  },

  // ===== WAM 2.0 EFFECTS (Web Audio Modules) =====
  {
    category: 'wam',
    type: 'WAMBigMuff',
    label: 'Big Muff (WAM)',
    group: 'Distortion',
    description: 'Electro-Harmonix Big Muff Pi fuzz (WAM 2.0)',
  },
  {
    category: 'wam',
    type: 'WAMTS9',
    label: 'TS-9 Overdrive (WAM)',
    group: 'Distortion',
    description: 'Ibanez Tube Screamer overdrive (WAM 2.0, Faust DSP)',
  },
  {
    category: 'wam',
    type: 'WAMQuadraFuzz',
    label: 'QuadraFuzz (WAM)',
    group: 'Distortion',
    description: '4-band multiband distortion/fuzz (WAM 2.0)',
  },
  {
    category: 'wam',
    type: 'WAMDistoMachine',
    label: 'Disto Machine (WAM)',
    group: 'Amp Simulator',
    description: 'Multi-mode distortion with cabinet sim (WAM 2.0)',
  },
  {
    category: 'wam',
    type: 'WAMVoxAmp',
    label: 'Vox Amp 30 (WAM)',
    group: 'Amp Simulator',
    description: '1960s guitar amp simulator with cabinet (WAM 2.0)',
  },
  {
    category: 'wam',
    type: 'WAMStonePhaser',
    label: 'Stone Phaser (WAM)',
    group: 'Modulation',
    description: 'Stereo phaser effect (WAM 2.0, Faust DSP)',
  },
  {
    category: 'wam',
    type: 'WAMPingPongDelay',
    label: 'Ping Pong Delay (WAM)',
    group: 'Reverb & Delay',
    description: 'Stereo ping-pong delay (WAM 2.0)',
  },
  {
    category: 'wam',
    type: 'WAMFaustDelay',
    label: 'Faust Delay (WAM)',
    group: 'Reverb & Delay',
    description: 'Ping-pong delay powered by Faust DSP (WAM 2.0)',
  },
  {
    category: 'wam',
    type: 'WAMPitchShifter',
    label: 'Pitch Shifter (WAM)',
    group: 'Pitch',
    description: 'Csound-powered pitch shifter (WAM 2.0)',
  },
  {
    category: 'wam',
    type: 'WAMGraphicEQ',
    label: 'Graphic EQ (WAM)',
    group: 'Dynamics',
    description: 'Multi-band graphic equalizer (WAM 2.0)',
  },
  {
    category: 'wam',
    type: 'WAMPedalboard',
    label: 'Pedalboard (WAM)',
    group: 'Multi-FX',
    description: 'Drag-and-drop guitar pedalboard (WAM 2.0)',
  },

  // ===== WASM EFFECTS (Zynthian-ported) =====

  // ── Creative ──
  { category: 'wasm', type: 'Masha', label: 'Masha Beat Stutter', group: 'Creative', description: 'Beat-synced stutter/glitch effect' },

  // ── Delay ──
  { category: 'tonejs', type: 'AmbientDelay', label: 'Ambient Delay', group: 'Reverb & Delay', description: 'Diffused multi-tap ambient delay with modulation' },
  { category: 'wasm', type: 'ArtisticDelay', label: 'Artistic Delay', group: 'Reverb & Delay', description: 'Creative delay with pitch-shifting and modulation' },
  { category: 'wasm', type: 'Della', label: 'Della Delay', group: 'Reverb & Delay', description: 'Analog-style delay with tape character' },
  { category: 'wasm', type: 'ReverseDelay', label: 'Reverse Delay', group: 'Reverb & Delay', description: 'Reversed playback delay effect' },
  { category: 'wasm', type: 'SlapbackDelay', label: 'Slapback Delay', group: 'Reverb & Delay', description: 'Short single-repeat rockabilly delay' },
  { category: 'wasm', type: 'VintageDelay', label: 'Vintage Delay', group: 'Reverb & Delay', description: 'Warm analog-modeled vintage delay' },
  { category: 'wasm', type: 'ZamDelay', label: 'ZAM Delay', group: 'Reverb & Delay', description: 'Clean digital delay with feedback control' },
  { category: 'wasm', type: 'TapeDelay', label: 'Tape Delay', group: 'Reverb & Delay', description: 'RE-201/Echoplex tape delay — wow, flutter, tape saturation, tone filter' },

  // ── Distortion ──
  { category: 'wasm', type: 'AutoSat', label: 'Auto Saturator', group: 'Distortion', description: 'Automatic saturation with dynamic response' },
  { category: 'wasm', type: 'CabinetSim', label: 'Cabinet Simulator', group: 'Distortion', description: 'Guitar/bass cabinet impulse response simulator' },
  { category: 'wasm', type: 'DistortionShaper', label: 'Distortion Shaper', group: 'Distortion', description: 'Waveshaper distortion with adjustable curve' },
  { category: 'wasm', type: 'Driva', label: 'Driva', group: 'Distortion', description: 'Tube-style drive with tone control' },
  { category: 'wasm', type: 'Exciter', label: 'Exciter', group: 'Distortion', description: 'Harmonic exciter for adding presence and clarity' },
  { category: 'wasm', type: 'Overdrive', label: 'Overdrive', group: 'Distortion', description: 'Soft-clipping overdrive effect' },
  { category: 'wasm', type: 'Satma', label: 'Satma', group: 'Distortion', description: 'Saturation and warming effect' },
  { category: 'wasm', type: 'Saturator', label: 'Saturator', group: 'Distortion', description: 'Multimode saturation processor' },
  { category: 'wasm', type: 'TubeAmp', label: 'Tube Amplifier', group: 'Distortion', description: 'Vacuum tube amplifier simulation' },

  // ── Dynamics ──
  { category: 'wasm', type: 'AGC', label: 'Auto Gain Control', group: 'Dynamics', description: 'Automatic gain leveling' },
  { category: 'wasm', type: 'BeatBreather', label: 'Beat Breather', group: 'Dynamics', description: 'Transient-aware dynamics processor' },
  { category: 'wasm', type: 'Clipper', label: 'Clipper', group: 'Dynamics', description: 'Hard/soft clipper for peak limiting' },
  { category: 'wasm', type: 'DeEsser', label: 'De-Esser', group: 'Dynamics', description: 'Sibilance reduction processor' },
  { category: 'wasm', type: 'Ducka', label: 'Ducka', group: 'Dynamics', description: 'Ducking/sidechain dynamics effect' },
  { category: 'wasm', type: 'DynamicsProc', label: 'Dynamics Processor', group: 'Dynamics', description: 'Full-featured dynamics processor' },
  { category: 'wasm', type: 'Expander', label: 'Expander', group: 'Dynamics', description: 'Dynamic range expander' },
  { category: 'wasm', type: 'GOTTComp', label: 'GOTT Compressor', group: 'Dynamics', description: 'Glue-style optical compressor' },
  { category: 'wasm', type: 'Limiter', label: 'Limiter', group: 'Dynamics', description: 'Brick-wall limiter for peak control' },
  { category: 'wasm', type: 'Maximizer', label: 'Maximizer', group: 'Dynamics', description: 'Loudness maximizer with look-ahead' },
  { category: 'wasm', type: 'MonoComp', label: 'Mono Compressor', group: 'Dynamics', description: 'Simple mono compressor' },
  { category: 'wasm', type: 'MultibandClipper', label: 'Multiband Clipper', group: 'Dynamics', description: 'Per-band clipping for transparent limiting' },
  { category: 'wasm', type: 'MultibandComp', label: 'Multiband Compressor', group: 'Dynamics', description: 'Multi-band compression processor' },
  { category: 'wasm', type: 'MultibandDynamics', label: 'Multiband Dynamics', group: 'Dynamics', description: 'Full multiband dynamics processor' },
  { category: 'wasm', type: 'MultibandExpander', label: 'Multiband Expander', group: 'Dynamics', description: 'Per-band expansion processor' },
  { category: 'wasm', type: 'MultibandGate', label: 'Multiband Gate', group: 'Dynamics', description: 'Per-band noise gate' },
  { category: 'wasm', type: 'MultibandLimiter', label: 'Multiband Limiter', group: 'Dynamics', description: 'Per-band limiting processor' },
  { category: 'wasm', type: 'NoiseGate', label: 'Noise Gate', group: 'Dynamics', description: 'Noise gate with adjustable threshold' },
  { category: 'wasm', type: 'Panda', label: 'Panda Comp/Expand', group: 'Dynamics', description: 'Combined compressor/expander' },
  { category: 'tonejs', type: 'SidechainCompressor', label: 'Sidechain Compressor', group: 'Dynamics', description: 'Compressor with external sidechain input' },
  { category: 'wasm', type: 'SidechainGate', label: 'Sidechain Gate', group: 'Dynamics', description: 'Gate with external sidechain trigger' },
  { category: 'wasm', type: 'SidechainLimiter', label: 'Sidechain Limiter', group: 'Dynamics', description: 'Limiter with external sidechain' },
  { category: 'wasm', type: 'TransientDesigner', label: 'Transient Designer', group: 'Dynamics', description: 'Attack/sustain transient shaping' },
  { category: 'wasm', type: 'X42Comp', label: 'X42 Compressor', group: 'Dynamics', description: 'Clean digital compressor' },

  // ── EQ & Filter ──
  { category: 'wasm', type: 'ParametricEQ', label: 'Parametric EQ', group: 'EQ & Filter', description: '4-band parametric equalizer' },
  { category: 'wasm', type: 'EQ5Band', label: '5-Band EQ', group: 'EQ & Filter', description: '5-band equalizer' },
  { category: 'wasm', type: 'EQ8Band', label: '8-Band EQ', group: 'EQ & Filter', description: '8-band equalizer' },
  { category: 'wasm', type: 'EQ12Band', label: '12-Band EQ', group: 'EQ & Filter', description: '12-band equalizer' },
  { category: 'wasm', type: 'GEQ31', label: '31-Band Graphic EQ', group: 'EQ & Filter', description: '31-band graphic equalizer' },
  { category: 'wasm', type: 'DynamicEQ', label: 'Dynamic EQ', group: 'EQ & Filter', description: 'Frequency-selective dynamic EQ' },
  { category: 'wasm', type: 'Kuiza', label: 'Kuiza EQ', group: 'EQ & Filter', description: 'Smooth parametric EQ' },
  { category: 'wasm', type: 'ZamEQ2', label: 'ZAM EQ2', group: 'EQ & Filter', description: 'Stereo parametric EQ' },
  { category: 'wasm', type: 'BassEnhancer', label: 'Bass Enhancer', group: 'EQ & Filter', description: 'Sub-harmonic bass enhancement' },
  { category: 'wasm', type: 'PhonoFilter', label: 'Phono Filter (RIAA)', group: 'EQ & Filter', description: 'RIAA phono equalization curve' },

  // ── Granular ──
  { category: 'wasm', type: 'GranularFreeze', label: 'Granular Freeze', group: 'Creative', description: 'Granular freeze/sustain effect' },

  // ── Lo-Fi ──
  { category: 'wasm', type: 'Bitta', label: 'Bitta Crusher', group: 'Lo-Fi', description: 'Bit-crushing and sample-rate reduction' },
  { category: 'tonejs', type: 'TapeDegradation', label: 'Tape Degradation', group: 'Lo-Fi', description: 'Worn tape emulation with wow, flutter, and hiss' },
  { category: 'wasm', type: 'Vinyl', label: 'Vinyl Simulator', group: 'Lo-Fi', description: 'Vinyl record crackle, noise, and wear simulation' },

  // ── Modulation ──
  { category: 'wasm', type: 'CalfPhaser', label: 'Calf Phaser', group: 'Modulation', description: 'Multi-stage phaser with feedback' },
  { category: 'wasm', type: 'Flanger', label: 'Flanger', group: 'Modulation', description: 'Classic flanging effect' },
  { category: 'wasm', type: 'JunoChorus', label: 'Juno-60 Chorus', group: 'Modulation', description: 'Roland Juno-60 chorus emulation' },
  { category: 'wasm', type: 'MultiChorus', label: 'Multi Chorus', group: 'Modulation', description: 'Multi-voice chorus with spread' },
  { category: 'wasm', type: 'Pulsator', label: 'Pulsator', group: 'Modulation', description: 'Rhythmic tremolo/pulsation effect' },
  { category: 'wasm', type: 'RingMod', label: 'Ring Modulator', group: 'Modulation', description: 'Ring modulation with carrier frequency control' },

  // ── Reverb ──
  { category: 'wasm', type: 'DragonflyHall', label: 'Dragonfly Hall', group: 'Reverb & Delay', description: 'Large hall algorithmic reverb' },
  { category: 'wasm', type: 'DragonflyPlate', label: 'Dragonfly Plate', group: 'Reverb & Delay', description: 'Plate reverb emulation' },
  { category: 'wasm', type: 'DragonflyRoom', label: 'Dragonfly Room', group: 'Reverb & Delay', description: 'Small room algorithmic reverb' },
  { category: 'wasm', type: 'EarlyReflections', label: 'Early Reflections', group: 'Reverb & Delay', description: 'Room early reflections processor' },
  { category: 'wasm', type: 'Roomy', label: 'Roomy Reverb', group: 'Reverb & Delay', description: 'Natural room reverb' },
  { category: 'wasm', type: 'ShimmerReverb', label: 'Shimmer Reverb', group: 'Reverb & Delay', description: 'Pitch-shifted ethereal reverb' },

  // ── Stereo & Spatial ──
  { category: 'wasm', type: 'BinauralPanner', label: 'Binaural Panner', group: 'Stereo & Spatial', description: 'HRTF-based 3D binaural panning' },
  { category: 'wasm', type: 'HaasEnhancer', label: 'Haas Stereo Enhancer', group: 'Stereo & Spatial', description: 'Haas effect stereo widening' },
  { category: 'wasm', type: 'MultiSpread', label: 'Multi Spread', group: 'Stereo & Spatial', description: 'Multi-band stereo spreading' },
  { category: 'wasm', type: 'MultibandEnhancer', label: 'Multiband Enhancer', group: 'Stereo & Spatial', description: 'Per-band stereo enhancement' },
  { category: 'wasm', type: 'Vihda', label: 'Vihda Stereo', group: 'Stereo & Spatial', description: 'Stereo widening and enhancement' },

  // ===== NEURAL EFFECTS (37 GuitarML models) =====
  ...GUITARML_MODEL_REGISTRY.map((model) => ({
    category: 'neural' as const,
    type: 'Neural',           // Required so modals don't fall back to 'Distortion'
    neuralModelIndex: model.index,
    label: model.name,
    group: model.category === 'overdrive' ? 'Neural Overdrive'
      : model.category === 'distortion' ? 'Neural Distortion'
      : model.category === 'amplifier' ? 'Neural Amp'
      : 'Neural Effect',
    description: `${model.fullName} - ${model.description}`,
  })),

  // ===== BUZZMACHINE (Jeskola Buzz WASM effects) =====
  // Distortion
  { category: 'buzzmachine' as EffectCategory, type: 'BuzzDistortion', label: 'Arguru Distortion', group: 'Buzz Distortion', description: 'Classic Buzz distortion effect (Arguru)' },
  { category: 'buzzmachine' as EffectCategory, type: 'BuzzOverdrive', label: 'Geonik Overdrive', group: 'Buzz Distortion', description: 'Warm overdrive (Geonik)' },
  { category: 'buzzmachine' as EffectCategory, type: 'BuzzDistortion2', label: 'Jeskola Distortion', group: 'Buzz Distortion', description: 'Jeskola hard distortion' },
  { category: 'buzzmachine' as EffectCategory, type: 'BuzzDist2', label: 'Elak Dist2', group: 'Buzz Distortion', description: 'Elak distortion v2' },
  { category: 'buzzmachine' as EffectCategory, type: 'BuzzSoftSat', label: 'Graue Soft Saturation', group: 'Buzz Distortion', description: 'Gentle saturation (Graue)' },
  { category: 'buzzmachine' as EffectCategory, type: 'BuzzStereoDist', label: 'WhiteNoise Stereo Dist', group: 'Buzz Distortion', description: 'Stereo distortion (WhiteNoise)' },
  // Filter
  { category: 'buzzmachine' as EffectCategory, type: 'BuzzSVF', label: 'Elak State Variable Filter', group: 'Buzz Filter', description: 'Multi-mode SVF (LP/HP/BP/Notch)' },
  { category: 'buzzmachine' as EffectCategory, type: 'BuzzPhilta', label: 'FSM Philta', group: 'Buzz Filter', description: 'Resonant filter (FSM)' },
  { category: 'buzzmachine' as EffectCategory, type: 'BuzzNotch', label: 'CyanPhase Notch', group: 'Buzz Filter', description: 'Phase notch filter (CyanPhase)' },
  { category: 'buzzmachine' as EffectCategory, type: 'BuzzZfilter', label: 'Q Zfilter', group: 'Buzz Filter', description: 'Z-plane filter (Q)' },
  // Reverb & Delay
  { category: 'buzzmachine' as EffectCategory, type: 'BuzzDelay', label: 'Jeskola Delay', group: 'Buzz Delay', description: 'Classic Buzz delay (Jeskola)' },
  { category: 'buzzmachine' as EffectCategory, type: 'BuzzCrossDelay', label: 'Jeskola Cross Delay', group: 'Buzz Delay', description: 'Stereo cross-feedback delay' },
  { category: 'buzzmachine' as EffectCategory, type: 'BuzzFreeverb', label: 'Jeskola Freeverb', group: 'Buzz Reverb', description: 'Freeverb reverb (Jeskola)' },
  { category: 'buzzmachine' as EffectCategory, type: 'BuzzPanzerDelay', label: 'FSM Panzer Delay', group: 'Buzz Delay', description: 'Heavy multi-tap delay (FSM)' },
  // Modulation
  { category: 'buzzmachine' as EffectCategory, type: 'BuzzChorus', label: 'FSM Chorus', group: 'Buzz Modulation', description: 'Chorus effect (FSM)' },
  { category: 'buzzmachine' as EffectCategory, type: 'BuzzChorus2', label: 'FSM Chorus 2', group: 'Buzz Modulation', description: 'Enhanced chorus v2 (FSM)' },
  { category: 'buzzmachine' as EffectCategory, type: 'BuzzWhiteChorus', label: 'WhiteNoise White Chorus', group: 'Buzz Modulation', description: 'White chorus (WhiteNoise)' },
  { category: 'buzzmachine' as EffectCategory, type: 'BuzzFreqShift', label: 'Bigyo Frequency Shifter', group: 'Buzz Modulation', description: 'Frequency shifter (Bigyo)' },
  // Dynamics
  { category: 'buzzmachine' as EffectCategory, type: 'BuzzCompressor', label: 'Geonik Compressor', group: 'Buzz Dynamics', description: 'Compressor (Geonik)' },
  { category: 'buzzmachine' as EffectCategory, type: 'BuzzLimiter', label: 'Ld Soft Limiter', group: 'Buzz Dynamics', description: 'Soft limiter (Ld)' },
  { category: 'buzzmachine' as EffectCategory, type: 'BuzzExciter', label: 'Oomek Exciter', group: 'Buzz Dynamics', description: 'Harmonic exciter (Oomek)' },
  { category: 'buzzmachine' as EffectCategory, type: 'BuzzMasterizer', label: 'Oomek Masterizer', group: 'Buzz Dynamics', description: 'Mastering processor (Oomek)' },
  // EQ & Stereo
  { category: 'buzzmachine' as EffectCategory, type: 'BuzzStereoGain', label: 'DedaCode Stereo Gain', group: 'Buzz Stereo', description: 'Stereo gain/balance (DedaCode)' },
];

/**
 * Get effects grouped by category
 */
export function getEffectsByGroup(): Record<string, AvailableEffect[]> {
  const grouped: Record<string, AvailableEffect[]> = {};

  // Temporary: collect all WASM effects into a single test group
  const wasmTestGroup: AvailableEffect[] = [];

  AVAILABLE_EFFECTS.forEach((effect) => {
    if (!grouped[effect.group]) {
      grouped[effect.group] = [];
    }
    grouped[effect.group].push(effect);

    // Also add WASM effects to the test group
    if (effect.category === 'wasm') {
      wasmTestGroup.push(effect);
    }
  });

  // Add the test group (remove this when done testing)
  if (wasmTestGroup.length > 0) {
    grouped['★ Zynthian WASM'] = wasmTestGroup;
  }

  return grouped;
}

/**
 * Get effects by category (tonejs vs neural)
 */
export function getEffectsByCategory(category: EffectCategory): AvailableEffect[] {
  return AVAILABLE_EFFECTS.filter((effect) => effect.category === category);
}

/**
 * Search effects by name or description
 */
export function searchEffects(query: string): AvailableEffect[] {
  const lowerQuery = query.toLowerCase();
  return AVAILABLE_EFFECTS.filter(
    (effect) =>
      effect.label.toLowerCase().includes(lowerQuery) ||
      effect.description?.toLowerCase().includes(lowerQuery) ||
      effect.group.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Get total effect count
 */
export function getTotalEffectCount(): { total: number; tonejs: number; neural: number; wasm: number; wam: number; buzzmachine: number } {
  const tonejs = AVAILABLE_EFFECTS.filter((e) => e.category === 'tonejs').length;
  const neural = AVAILABLE_EFFECTS.filter((e) => e.category === 'neural').length;
  const wasm = AVAILABLE_EFFECTS.filter((e) => e.category === 'wasm').length;
  const wam = AVAILABLE_EFFECTS.filter((e) => e.category === 'wam').length;
  const buzzmachine = AVAILABLE_EFFECTS.filter((e) => e.category === 'buzzmachine').length;
  return { total: tonejs + neural + wasm + wam + buzzmachine, tonejs, neural, wasm, wam, buzzmachine };
}

/**
 * Get all group names
 */
export function getEffectGroups(): string[] {
  const groups = new Set(AVAILABLE_EFFECTS.map((e) => e.group));
  return Array.from(groups).sort();
}
