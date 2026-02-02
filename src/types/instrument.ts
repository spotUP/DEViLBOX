/**
 * Instrument Types - Synth Engine Definitions
 */

export type SynthType =
  | 'Synth'
  | 'MonoSynth'
  | 'DuoSynth'
  | 'FMSynth'
  | 'AMSynth'
  | 'PluckSynth'
  | 'MetalSynth'
  | 'MembraneSynth'
  | 'NoiseSynth'
  | 'TB303'
  | 'Sampler'
  | 'Player'
  | 'Wavetable'
  | 'GranularSynth'
  // New synths
  | 'SuperSaw'
  | 'PolySynth'
  | 'Organ'
  | 'DrumMachine'
  | 'ChipSynth'
  | 'PWMSynth'
  | 'StringMachine'
  | 'FormantSynth'
  | 'Furnace'
  // Furnace Chip Types (WASM-emulated)
  // FM Synthesis Chips
  | 'FurnaceOPN'      // Sega Genesis / Mega Drive (YM2612)
  | 'FurnaceOPM'      // Yamaha OPM (X68000, arcade)
  | 'FurnaceOPL'      // OPL3 (AdLib, Sound Blaster)
  | 'FurnaceOPLL'     // Yamaha OPLL (MSX, SMS FM)
  | 'FurnaceESFM'     // Enhanced OPL3 FM
  | 'FurnaceOPZ'      // Yamaha OPZ (TX81Z)
  | 'FurnaceOPNA'     // YM2608 (PC-98, arcade)
  | 'FurnaceOPNB'     // YM2610 (Neo Geo)
  | 'FurnaceOPL4'     // Yamaha OPL4 (FM + wavetable)
  | 'FurnaceY8950'    // Y8950 (MSX-Audio)
  // Console PSG Chips
  | 'FurnaceNES'      // Nintendo Entertainment System (2A03)
  | 'FurnaceGB'       // Game Boy
  | 'FurnacePSG'      // TI SN76489 (Master System)
  | 'FurnacePCE'      // PC Engine / TurboGrafx-16
  | 'FurnaceSNES'     // Super Nintendo (SPC700)
  | 'FurnaceVB'       // Virtual Boy
  | 'FurnaceLynx'     // Atari Lynx
  | 'FurnaceSWAN'     // WonderSwan
  // NES Expansion Audio
  | 'FurnaceVRC6'     // Konami VRC6 (Castlevania 3)
  | 'FurnaceVRC7'     // Konami VRC7 (Lagrange Point)
  | 'FurnaceN163'     // Namco 163 (wavetable)
  | 'FurnaceFDS'      // Famicom Disk System
  | 'FurnaceMMC5'     // MMC5 (Castlevania 3 US)
  // Computer Chips
  | 'FurnaceC64'      // Commodore 64 (SID3 - enhanced)
  | 'FurnaceSID6581'  // Classic SID 6581 (warm/gritty)
  | 'FurnaceSID8580'  // Classic SID 8580 (cleaner)
  | 'FurnaceAY'       // AY-3-8910 (ZX Spectrum, MSX)
  | 'FurnaceVIC'      // VIC-20
  | 'FurnaceSAA'      // Philips SAA1099
  | 'FurnaceTED'      // Commodore Plus/4
  | 'FurnaceVERA'     // Commander X16
  // Arcade PCM Chips
  | 'FurnaceSEGAPCM'  // Sega System 16/18
  | 'FurnaceQSOUND'   // Capcom CPS1/CPS2
  | 'FurnaceES5506'   // Ensoniq ES5506
  | 'FurnaceRF5C68'   // Sega CD
  | 'FurnaceC140'     // Namco System 2
  | 'FurnaceK007232'  // Konami arcade
  | 'FurnaceK053260'  // Konami arcade
  | 'FurnaceGA20'     // Irem arcade
  | 'FurnaceOKI'      // OKI MSM6295
  | 'FurnaceYMZ280B'  // Capcom/Konami arcade
  // Wavetable Chips
  | 'FurnaceSCC'      // Konami SCC (MSX)
  | 'FurnaceX1_010'   // Seta X1-010
  | 'FurnaceBUBBLE'   // Bubble System
  // Other
  | 'FurnaceTIA'      // Atari 2600
  | 'FurnaceSM8521'   // Sharp SM8521
  | 'FurnaceT6W28'    // NEC PC-6001
  | 'FurnaceSUPERVISION' // Watara Supervision
  | 'FurnaceUPD1771'  // NEC μPD1771
  // NEW Chips (47-72)
  | 'FurnaceOPN2203'  // YM2203 (PC-88/98, simpler OPNA)
  | 'FurnaceOPNBB'    // YM2610B (Extended Neo Geo)
  | 'FurnaceAY8930'   // Enhanced AY (Microchip)
  | 'FurnaceNDS'      // Nintendo DS Sound
  | 'FurnaceGBA'      // GBA DMA Sound
  | 'FurnacePOKEMINI' // Pokemon Mini
  | 'FurnaceNAMCO'    // Namco WSG (Pac-Man, Galaga)
  | 'FurnacePET'      // Commodore PET
  | 'FurnacePOKEY'    // Atari POKEY (Atari 800/5200)
  | 'FurnaceMSM6258'  // OKI MSM6258 ADPCM
  | 'FurnaceMSM5232'  // OKI MSM5232 8-voice synth
  | 'FurnaceMULTIPCM' // Sega MultiPCM (System 32)
  | 'FurnaceAMIGA'    // Amiga Paula (4 channel)
  | 'FurnacePCSPKR'   // PC Speaker (internal beeper)
  | 'FurnacePONG'     // AY-3-8500 (original Pong chip)
  | 'FurnacePV1000'   // Casio PV-1000
  | 'FurnaceDAVE'     // Enterprise DAVE
  | 'FurnaceSU'       // Sound Unit
  | 'FurnacePOWERNOISE' // Power Noise
  | 'FurnaceZXBEEPER' // ZX Spectrum beeper
  | 'FurnaceSCVTONE'  // Epoch Super Cassette Vision
  | 'FurnacePCMDAC'   // Generic PCM DAC
  // Bass synths
  | 'WobbleBass'
  // Buzzmachines (Jeskola Buzz effects as synths)
  | 'Buzzmachine'
  // Multi-sample instruments
  | 'DrumKit'
  // Module playback (libopenmpt)
  | 'ChiptuneModule'
  // Buzzmachine Generators (WASM-emulated Buzz synths)
  | 'BuzzDTMF'         // CyanPhase DTMF (phone tones)
  | 'BuzzFreqBomb'     // Elenzil Frequency Bomb
  | 'BuzzKick'         // FSM Kick drum
  | 'BuzzKickXP'       // FSM KickXP (extended kick)
  | 'BuzzNoise'        // Jeskola Noise generator
  | 'BuzzTrilok'       // Jeskola Trilok (bass drum)
  | 'Buzz4FM2F'        // MadBrain 4FM2F (4-op FM)
  | 'BuzzDynamite6'    // MadBrain Dynamite6 (additive)
  | 'BuzzM3'           // Makk M3 (dual-osc synth)
  | 'Buzz3o3'          // Oomek Aggressor 3o3 (TB-303 clone)
  | 'MAMEVFX'          // Ensoniq VFX (ES5506)
  | 'MAMEDOC'          // Ensoniq ESQ-1 (ES5503)
  | 'MAMERSA'          // Roland SA (MKS-20/RD-1000)
  | 'MAMESWP30'        // Yamaha SWP30 (AWM2)
  | 'DubSiren'         // Dub Siren (Osc + LFO + Delay)
  | 'SpaceLaser'       // Space Laser (FM + Pitch Sweep)
  | 'V2'               // Farbrausch V2 Synth
  | 'Synare';          // Synare 3 (Electronic Percussion)

export type WaveformType = 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise';

// Extended waveform types for vibrato/tremolo effects (tracker formats)
export type VibratoWaveformType = 'sine' | 'rampDown' | 'rampUp' | 'square' | 'random';

// Extended waveform types for vibrato/tremolo effects (tracker formats)

export type FilterType = 'lowpass' | 'highpass' | 'bandpass' | 'notch';

export interface OscillatorConfig {
  type: WaveformType;
  detune: number; // -100 to 100 cents
  octave: number; // -2 to 2
}

export interface EnvelopeConfig {
  attack: number; // 0-2000ms
  decay: number; // 0-2000ms
  sustain: number; // 0-100%
  release: number; // 0-5000ms
}

export interface FilterConfig {
  type: FilterType;
  frequency: number; // 20Hz-20kHz
  Q: number; // 0-100 (resonance)
  rolloff: -12 | -24 | -48 | -96;
}

export interface FilterEnvelopeConfig {
  baseFrequency: number; // Hz
  octaves: number; // 0-8
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

/**
 * Pitch Envelope Configuration
 * Modulates oscillator pitch over time (for kick drums, synth basses, FX)
 */
export interface PitchEnvelopeConfig {
  enabled: boolean;
  amount: number;       // -48 to +48 semitones (starting offset from base pitch)
  attack: number;       // 0-2000ms - time to reach peak offset
  decay: number;        // 0-2000ms - time to decay to sustain
  sustain: number;      // -100 to +100% of amount - sustain offset (0 = back to base pitch)
  release: number;      // 0-5000ms - time to return to base pitch on release
}

export const DEFAULT_PITCH_ENVELOPE: PitchEnvelopeConfig = {
  enabled: false,
  amount: 12,           // Start 1 octave up
  attack: 0,            // Instant attack
  decay: 50,            // Quick decay to base pitch
  sustain: 0,           // Return to base pitch
  release: 100,         // Quick release
};

/**
 * Devil Fish Mod Configuration
 * Based on Robin Whittle's Devil Fish modifications to the TB-303
 * Expands the 5-dimensional TB-303 sound space to 14 dimensions
 */
export interface DevilFishConfig {
  enabled: boolean;

  // Envelope controls
  normalDecay: number;    // 30-3000ms - MEG (Main Envelope Generator) decay for normal notes
  accentDecay: number;    // 30-3000ms - MEG decay for accented notes
  vegDecay: number;       // 16-3000ms - VEG (Volume Envelope Generator) decay
  vegSustain: number;     // 0-100% - VEG sustain level (100% = infinite notes)
  softAttack: number;     // 0.3-3000ms (exponential) - attack time for non-accented notes

  // Filter controls
  filterTracking: number; // 0-200% - filter frequency tracks note pitch
  filterFM: number;       // 0-100% - VCA output feeds back to filter frequency (audio-rate FM)

  // Accent controls
  sweepSpeed: 'fast' | 'normal' | 'slow'; // Accent sweep circuit behavior
  accentSweepEnabled: boolean;            // Enable/disable accent sweep circuit

  // Resonance mode
  highResonance: boolean; // Enable filter self-oscillation at mid/high frequencies

  // Output processing
  muffler: 'off' | 'soft' | 'hard'; // Soft clipping on VCA output
}

export interface TB303Config {
  // Engine selection - 'accurate' uses Open303 AudioWorklet for authentic TB-303 sound
  engineType?: 'tonejs' | 'accurate' | 'jc303'; // Default: 'accurate'

  // Tuning
  tuning?: number; // Master tuning in Hz (default: 440)

  // Tempo-relative envelopes (for slower tempos = longer sweeps)
  tempoRelative?: boolean; // Default: false (absolute ms), true = scale with BPM

  oscillator: {
    type: 'sawtooth' | 'square';
  };
  filter: {
    cutoff: number; // Stock: 314-2394Hz (exponential) | Devil Fish: 157-4788Hz (2× range)
    resonance: number; // 0-100%
  };
  filterEnvelope: {
    envMod: number; // Stock: 0-100% | Devil Fish: 0-300% (3× modulation depth)
    decay: number; // Stock: 200-2000ms (controls MEG) | Devil Fish: 16-3000ms (controls VEG when DF enabled)
  };
  accent: {
    amount: number; // 0-100%
  };
  slide: {
    time: number; // 2-360ms (stock TB-303 was fixed at 60ms, Devil Fish makes it variable)
    mode: 'linear' | 'exponential';
  };
  pedalboard?: {
    enabled: boolean;
    chain: any[];
  };
  overdrive?: {
    amount: number; // 0-100%
    modelIndex?: number; // GuitarML model index
    drive?: number; // 0-100%
    dryWet?: number; // 0-100%
  };
  // Devil Fish modifications (optional - for backward compatibility)
  devilFish?: DevilFishConfig;
}

/**
 * Wavetable Synthesizer Configuration
 * Multi-voice wavetable synth with morphing and unison
 */
export interface WavetableConfig {
  wavetableId: string;              // Preset wavetable ID
  morphPosition: number;            // 0-100% - position in wavetable
  morphModSource: 'none' | 'lfo' | 'envelope';
  morphModAmount: number;           // 0-100%
  morphLFORate: number;             // 0.1-20 Hz
  unison: {
    voices: number;                 // 1-8 voices
    detune: number;                 // 0-100 cents spread
    stereoSpread: number;           // 0-100% panning spread
  };
  envelope: EnvelopeConfig;
  filter: {
    type: FilterType;
    cutoff: number;                 // 20-20000 Hz
    resonance: number;              // 0-100%
    envelopeAmount: number;         // -100 to 100%
  };
  filterEnvelope: EnvelopeConfig;
}

export const DEFAULT_WAVETABLE: WavetableConfig = {
  wavetableId: 'basic-saw',
  morphPosition: 0,
  morphModSource: 'none',
  morphModAmount: 50,
  morphLFORate: 2,
  unison: {
    voices: 1,
    detune: 10,
    stereoSpread: 50,
  },
  envelope: {
    attack: 10,
    decay: 500,
    sustain: 0,  // Decay to silence (tracker-style)
    release: 100,
  },
  filter: {
    type: 'lowpass',
    cutoff: 8000,
    resonance: 20,
    envelopeAmount: 0,
  },
  filterEnvelope: {
    attack: 10,
    decay: 500,
    sustain: 0,  // Decay to silence
    release: 100,
  },
};

/**
 * Granular Synthesizer Configuration
 * Sample-based granular synth with grain manipulation
 */
export interface GranularConfig {
  sampleUrl: string;                // URL or base64 of source sample
  grainSize: number;                // 10-500ms - duration of each grain
  grainOverlap: number;             // 0-100% - overlap between grains
  playbackRate: number;             // 0.25-4x - playback speed
  detune: number;                   // -1200 to 1200 cents
  randomPitch: number;              // 0-100% - random pitch variation per grain
  randomPosition: number;           // 0-100% - random position variation in sample
  scanPosition: number;             // 0-100% - position in sample to read grains from
  scanSpeed: number;                // -100 to 100% - speed of scanning through sample
  density: number;                  // 1-16 - number of overlapping grain streams
  reverse: boolean;                 // Play grains in reverse
  envelope: {
    attack: number;                 // Grain attack (ms)
    release: number;                // Grain release (ms)
  };
  filter: {
    type: FilterType;
    cutoff: number;
    resonance: number;
  };
}

export const DEFAULT_GRANULAR: GranularConfig = {
  sampleUrl: '',
  grainSize: 100,
  grainOverlap: 50,
  playbackRate: 1,
  detune: 0,
  randomPitch: 0,
  randomPosition: 0,
  scanPosition: 0,
  scanSpeed: 0,
  density: 4,
  reverse: false,
  envelope: {
    attack: 10,
    release: 50,
  },
  filter: {
    type: 'lowpass',
    cutoff: 20000,
    resonance: 0,
  },
};

export interface MAMEConfig {
  type: 'vfx' | 'doc' | 'rsa' | 'swp30';
  clock: number;
  romsLoaded: boolean;
  registers: Record<number, number>;
}

export const DEFAULT_MAME_VFX: MAMEConfig = {
  type: 'vfx',
  clock: 16000000,
  romsLoaded: false,
  registers: {},
};

export const DEFAULT_MAME_DOC: MAMEConfig = {
  type: 'doc',
  clock: 1000000,
  romsLoaded: false,
  registers: {},
};

export const DEFAULT_MAME_RSA: MAMEConfig = {
  type: 'rsa',
  clock: 20000000,
  romsLoaded: false,
  registers: {},
};

export const DEFAULT_MAME_SWP30: MAMEConfig = {
  type: 'swp30',
  clock: 33868800,
  romsLoaded: false,
  registers: {},
};

/**
 * ChiptuneModule Configuration
 * Uses libopenmpt WASM for sample-accurate MOD/XM/IT/S3M playback
 * Provides audio-rate parameter modulation for authentic tracker effects
 */
export interface ChiptuneModuleConfig {
  moduleData: string;             // Base64-encoded original module file
  format: 'MOD' | 'XM' | 'IT' | 'S3M' | 'UNKNOWN';
  sourceFile?: string;            // Original filename for reference
  useLibopenmpt?: boolean;        // If true, use libopenmpt for playback (default: true)
  repeatCount?: number;           // -1 = infinite, 0 = once, >0 = n times
  stereoSeparation?: number;      // 0-200% stereo separation (100 = default)
  interpolationFilter?: number;   // 0 = none, 1 = linear, 2 = cubic, 8 = sinc
}

export const DEFAULT_CHIPTUNE_MODULE: ChiptuneModuleConfig = {
  moduleData: '',
  format: 'UNKNOWN',
  useLibopenmpt: true,
  repeatCount: 0,
  stereoSeparation: 100,
  interpolationFilter: 0,
};

/**
 * SuperSaw Synthesizer Configuration
 * Multiple detuned sawtooth oscillators for massive trance/EDM sounds
 * Inspired by Roland JP-8000/Access Virus supersaw
 */
export interface SuperSawConfig {
  voices: number;               // 3-9 oscillators (default 7)
  detune: number;               // 0-100 cents spread between voices
  mix: number;                  // 0-100% center vs side voices
  stereoSpread: number;         // 0-100% panning width

  // Advanced detuning (new)
  spreadCurve?: 'linear' | 'exponential' | 'random';  // How voices spread across detune range
  phaseMode?: 'free' | 'reset' | 'random';            // Phase behavior on note trigger
  analogDrift?: number;         // 0-100% pitch drift for analog warmth

  // Sub oscillator (new)
  sub?: {
    enabled: boolean;
    octave: -1 | -2;            // Sub octave
    waveform: 'sine' | 'square';
    level: number;              // 0-100%
  };

  // PWM mode (new) - pulse waves instead of saws
  pwm?: {
    enabled: boolean;
    width: number;              // 10-90% pulse width
    modRate: number;            // 0-10 Hz PWM rate
    modDepth: number;           // 0-100% modulation depth
  };

  envelope: EnvelopeConfig;
  filter: {
    type: FilterType;
    cutoff: number;             // 20-20000 Hz
    resonance: number;          // 0-100%
    envelopeAmount: number;     // -100 to 100%
    keyTracking?: number;       // 0-100%
  };
  filterEnvelope: EnvelopeConfig;

  // Pitch envelope (new)
  pitchEnvelope?: {
    enabled: boolean;
    amount: number;             // -24 to +24 semitones
    attack: number;             // 0-2000ms
    decay: number;              // 0-2000ms
  };
}

export const DEFAULT_SUPERSAW: SuperSawConfig = {
  voices: 7,
  detune: 30,
  mix: 50,
  stereoSpread: 80,
  envelope: {
    attack: 10,
    decay: 500,
    sustain: 0,  // Decay to silence (tracker-style)
    release: 100,
  },
  filter: {
    type: 'lowpass',
    cutoff: 8000,
    resonance: 20,
    envelopeAmount: 0,
  },
  filterEnvelope: {
    attack: 10,
    decay: 500,
    sustain: 0,  // Decay to silence
    release: 100,
  },
};

/**
 * PolySynth Configuration
 * True polyphonic synth with voice management
 */
export interface PolySynthConfig {
  voiceCount: number;           // 1-16 max simultaneous voices
  voiceType: 'Synth' | 'FMSynth' | 'AMSynth';
  stealMode: 'oldest' | 'lowest' | 'highest';
  oscillator: OscillatorConfig;
  envelope: EnvelopeConfig;
  filter?: FilterConfig;
  filterEnvelope?: FilterEnvelopeConfig;
  portamento: number;           // 0-1000ms glide between notes
}

export const DEFAULT_POLYSYNTH: PolySynthConfig = {
  voiceCount: 8,
  voiceType: 'Synth',
  stealMode: 'oldest',
  oscillator: {
    type: 'sawtooth',
    detune: 0,
    octave: 0,
  },
  envelope: {
    attack: 50,
    decay: 500,
    sustain: 0,  // Decay to silence (tracker-style)
    release: 100,
  },
  portamento: 0,
};

/**
 * Organ (Hammond Drawbar) Configuration
 */
export interface OrganConfig {
  drawbars: [number, number, number, number, number, number, number, number, number];
  // 16', 5⅓', 8', 4', 2⅔', 2', 1⅗', 1⅓', 1' (0-8 each)
  percussion: {
    enabled: boolean;
    volume: number;             // 0-100%
    decay: 'fast' | 'slow';
    harmonic: 'second' | 'third';
  };
  keyClick: number;             // 0-100%
  vibrato: {
    type: 'V1' | 'V2' | 'V3' | 'C1' | 'C2' | 'C3';
    depth: number;              // 0-100%
  };
  rotary: {
    enabled: boolean;
    speed: 'slow' | 'fast';
  };
}

export const DEFAULT_ORGAN: OrganConfig = {
  drawbars: [8, 8, 8, 0, 0, 0, 0, 0, 0], // Classic rock organ
  percussion: {
    enabled: false,
    volume: 50,
    decay: 'fast',
    harmonic: 'third',
  },
  keyClick: 30,
  vibrato: {
    type: 'C3',
    depth: 50,
  },
  rotary: {
    enabled: true,
    speed: 'slow',
  },
};

/**
 * DrumMachine Configuration (808/909 style)
 * Based on authentic TR-808 synthesis from io-808 and TR-909 from er-99 emulator
 */
export type DrumType = 'kick' | 'snare' | 'clap' | 'hihat' | 'tom' | 'cymbal' | 'cowbell' | 'rimshot' | 'conga' | 'clave' | 'maracas';

// Drum machine type selector (affects overall synthesis character)
export type DrumMachineType = '808' | '909';

export interface DrumMachineConfig {
  drumType: DrumType;
  machineType?: DrumMachineType; // '808' or '909' - affects synthesis character
  kick?: {
    pitch: number;              // 30-100 Hz base frequency (808: 48Hz, 909: 80Hz)
    pitchDecay: number;         // 0-500ms pitch envelope duration
    tone: number;               // 0-100% tone/click (808: filter cutoff, 909: noise)
    toneDecay: number;          // 0-100ms tone decay (909: 20ms)
    decay: number;              // 50-2000ms amplitude decay (808: 50-300ms, 909: 300ms)
    drive: number;              // 0-100% saturation (808: 60%, 909: 50%)
    envAmount: number;          // 1-10x pitch envelope (808: ~2x from 98Hz to 48Hz, 909: 2.5)
    envDuration: number;        // 0-200ms pitch envelope (808: 110ms attack, 909: 50ms)
    filterFreq: number;         // Lowpass filter cutoff (808: 200-300Hz, 909: 3000Hz)
  };
  snare?: {
    pitch: number;              // 100-500 Hz body frequency (808: 238Hz low + 476Hz high, 909: 220Hz)
    pitchHigh?: number;         // 808 only: high oscillator (476Hz)
    tone: number;               // 0-100% body/snap balance
    toneDecay: number;          // Noise decay in ms (808: 75ms, 909: 250ms)
    snappy: number;             // 0-100% noise amount
    decay: number;              // 50-500ms amplitude decay (808: 100ms, 909: 100ms)
    envAmount: number;          // 1-10x pitch envelope (909: 4.0, 808: ~1 - no pitch env)
    envDuration: number;        // 0-50ms pitch envelope (909: 10ms, 808: 100ms)
    filterType: 'lowpass' | 'highpass' | 'bandpass' | 'notch'; // 808: highpass, 909: notch
    filterFreq: number;         // Filter frequency (808: 800-1800Hz highpass, 909: 1000Hz notch)
  };
  hihat?: {
    tone: number;               // 0-100% dark/bright
    decay: number;              // 10-1000ms (808 closed: 50ms, open: 90-450ms)
    metallic: number;           // 0-100%
    // 808 uses 6 square oscillators at inharmonic freqs: [263, 400, 421, 474, 587, 845]
    // Then bandpass at 10kHz + highpass at 8kHz
  };
  clap?: {
    tone: number;               // 0-100% filter frequency (808: 1000Hz bandpass, 909: 2200Hz)
    decay: number;              // 50-500ms overall decay (808: 115ms reverb, 909: 80ms)
    toneDecay: number;          // Individual burst decay (808: sawtooth repeats, 909: 250ms)
    spread: number;             // 0-100ms burst spacing (808: 100ms sawtooth, 909: 10ms)
    filterFreqs: [number, number]; // Serial filters (808: 1000Hz bandpass, 909: [900, 1200])
    modulatorFreq: number;      // Sawtooth modulator frequency (909: 40Hz)
  };
  tom?: {
    pitch: number;              // 100-400 Hz (808 Low: 80-100Hz, Mid: 120-160Hz, Hi: 165-220Hz)
    decay: number;              // 100-500ms (808: 180-200ms)
    tone: number;               // 0-100% noise amount (808: pink noise 0.2 amp, 909: 5%)
    toneDecay: number;          // Noise decay (808: 100-155ms, 909: 100ms)
    envAmount: number;          // 1-5x pitch envelope (909: 2.0, 808: ~1)
    envDuration: number;        // 50-200ms pitch envelope (808: 100ms, 909: 100ms)
  };
  // 808-specific: Conga (like tom but higher pitched, no noise)
  conga?: {
    pitch: number;              // 165-455 Hz (808 Low: 165-220Hz, Mid: 250-310Hz, Hi: 370-455Hz)
    decay: number;              // 100-300ms (808: 180ms)
    tuning: number;             // 0-100% pitch interpolation within range
  };
  cowbell?: {
    decay: number;              // 10-500ms (808: 15ms short + 400ms tail)
    filterFreq: number;         // Bandpass center (808: 2640Hz)
    // 808: Two square oscillators at 540Hz and 800Hz
  };
  rimshot?: {
    decay: number;              // 10-100ms (808: 40ms, 909: 30ms)
    filterFreqs: [number, number, number]; // Bandpass freqs (808: [480, 1750, 2450], 909: [220, 500, 950])
    filterQ: number;            // Resonance (808: ~5, 909: 10.5)
    saturation: number;         // 1-5x saturation (808: high via swing VCA, 909: 3.0)
  };
  // 808-specific: Clave (similar to rimshot but different frequencies)
  clave?: {
    decay: number;              // 10-60ms (808: 40ms)
    pitch: number;              // Primary pitch (808: 2450Hz triangle)
    pitchSecondary: number;     // Secondary pitch (808: 1750Hz sine)
    filterFreq: number;         // Bandpass center (808: 2450Hz)
  };
  // 808-specific: Maracas
  maracas?: {
    decay: number;              // 10-100ms (808: 30ms)
    filterFreq: number;         // Highpass cutoff (808: 5000Hz)
  };
  // 808-specific: Cymbal (more complex than hihat)
  cymbal?: {
    tone: number;               // 0-100% low/high band balance
    decay: number;              // 500-7000ms (808: 700-6800ms for low band)
    // 808: 3-band filtering with separate envelopes per band
  };
}

export const DEFAULT_DRUM_MACHINE: DrumMachineConfig = {
  drumType: 'kick',
  machineType: '909', // Default to 909 for backwards compatibility
  // TR-909 accurate kick parameters (808 values in comments)
  kick: {
    pitch: 80,              // 909: 80Hz, 808: 48Hz base
    pitchDecay: 50,         // Legacy: kept for compatibility
    tone: 50,               // Noise/click amount
    toneDecay: 20,          // 909: 20ms noise decay
    decay: 300,             // 909: 300ms, 808: 50-300ms (user controlled)
    drive: 50,              // 909: moderate saturation, 808: 60%
    envAmount: 2.5,         // 909: 2.5x, 808: ~2x (98Hz to 48Hz)
    envDuration: 50,        // 909: 50ms, 808: 110ms attack then decay
    filterFreq: 3000,       // 909: 3000Hz, 808: 200-300Hz (user controlled via tone)
  },
  // TR-909 accurate snare parameters (808 values in comments)
  snare: {
    pitch: 220,             // 909: 220Hz, 808: 238Hz (low osc)
    pitchHigh: 476,         // 808: 476Hz (high osc), 909 doesn't use this
    tone: 25,               // 909: 25%, 808: controlled by snappy
    toneDecay: 250,         // 909: 250ms, 808: 75ms noise decay
    snappy: 70,             // Noise amount
    decay: 100,             // 909: 100ms, 808: ~100ms
    envAmount: 4.0,         // 909: 4.0x, 808: ~1 (no pitch envelope)
    envDuration: 10,        // 909: 10ms, 808: 100ms
    filterType: 'notch',    // 909: notch, 808: highpass
    filterFreq: 1000,       // 909: 1000Hz notch, 808: 800-1800Hz highpass
  },
  // 808-style hi-hat (6 square oscillators at inharmonic frequencies)
  hihat: {
    tone: 50,               // Dark/bright control
    decay: 100,             // 808 closed: 50ms, open: 90-450ms
    metallic: 50,           // Harmonicity control
  },
  // TR-909 accurate clap parameters (808 uses sawtooth envelope for reverb effect)
  clap: {
    tone: 55,               // 909: ~2200Hz, 808: 1000Hz bandpass
    decay: 80,              // 909: 80ms, 808: 115ms reverb tail
    toneDecay: 250,         // 909: 250ms, 808: sawtooth repeating
    spread: 10,             // 909: 10ms, 808: 100ms sawtooth spacing
    filterFreqs: [900, 1200], // 909: serial bandpass, 808: 1000Hz single
    modulatorFreq: 40,      // 909: 40Hz sawtooth
  },
  // Tom parameters (808 uses pink noise, 909 uses little noise)
  tom: {
    pitch: 200,             // Mid tom default (808: 120-160Hz, 909: 200Hz)
    decay: 200,             // 909: 200ms, 808: 180-200ms
    tone: 5,                // 909: 5%, 808: pink noise 0.2 amplitude
    toneDecay: 100,         // 909: 100ms, 808: 100-155ms
    envAmount: 2.0,         // 909: 2.0x, 808: ~1 (minimal pitch sweep)
    envDuration: 100,       // 909: 100ms, 808: 100ms
  },
  // 808-specific: Conga (higher pitched tom, no noise)
  conga: {
    pitch: 310,             // Mid conga default (808: 250-310Hz range)
    decay: 180,             // 808: 180ms
    tuning: 50,             // 0-100% pitch interpolation
  },
  // 808-specific: Cowbell (dual square oscillators through bandpass)
  cowbell: {
    decay: 400,             // 808: 15ms short attack + 400ms tail
    filterFreq: 2640,       // 808: 2640Hz bandpass center
  },
  // Rimshot parameters (808/909 differ in frequencies and character)
  rimshot: {
    decay: 30,              // 909: 30ms, 808: 40ms
    filterFreqs: [220, 500, 950], // 909: parallel resonant, 808: [480, 1750, 2450]
    filterQ: 10.5,          // 909: very high Q, 808: lower Q ~5
    saturation: 3.0,        // 909: heavy, 808: via swing VCA distortion
  },
  // 808-specific: Clave (higher pitched than rimshot, woodblock character)
  clave: {
    decay: 40,              // 808: 40ms
    pitch: 2450,            // 808: 2450Hz triangle
    pitchSecondary: 1750,   // 808: 1750Hz sine
    filterFreq: 2450,       // 808: 2450Hz bandpass
  },
  // 808-specific: Maracas (highpass filtered noise)
  maracas: {
    decay: 30,              // 808: 30ms (quick shake)
    filterFreq: 5000,       // 808: 5000Hz highpass
  },
  // 808-specific: Cymbal (complex 3-band filtering)
  cymbal: {
    tone: 50,               // Low/high band balance
    decay: 2000,            // 808: 700-6800ms (variable low band decay)
  },
};

/**
 * Advanced Arpeggio Step Configuration
 * Each step in the arpeggio pattern with per-step controls
 */
export interface ArpeggioStep {
  noteOffset: number;           // -24 to +36 semitones
  volume?: number;              // 0-100% (default 100)
  gate?: number;                // 0-100% gate length (default 100)
  effect?: 'none' | 'accent' | 'slide' | 'skip';  // Per-step effects
}

/**
 * Arpeggio Speed Unit Types
 */
export type ArpeggioSpeedUnit = 'hz' | 'ticks' | 'division';

/**
 * Arpeggio Playback Mode
 */
export type ArpeggioMode = 'loop' | 'pingpong' | 'oneshot' | 'random';

/**
 * Advanced Arpeggio Configuration
 * Full-featured arpeggiator with tracker-style controls
 */
export interface ArpeggioConfig {
  enabled: boolean;
  speed: number;                // Speed value (interpretation depends on speedUnit)
  speedUnit: ArpeggioSpeedUnit; // 'hz' | 'ticks' | 'division'
  steps: ArpeggioStep[];        // Up to 16 steps with per-step controls
  mode: ArpeggioMode;           // Playback mode
  swing?: number;               // 0-100% swing amount (default 0)
  // Legacy support: simple pattern array
  pattern?: number[];           // Simple semitone offsets (for backwards compat)
}

/**
 * Default Arpeggio Configuration
 */
export const DEFAULT_ARPEGGIO: ArpeggioConfig = {
  enabled: false,
  speed: 15,                    // 15 Hz (typical chiptune speed)
  speedUnit: 'hz',
  steps: [
    { noteOffset: 0 },
    { noteOffset: 4 },
    { noteOffset: 7 },
  ],
  mode: 'loop',
  swing: 0,
};

/**
 * ChipSynth Configuration (8-bit)
 * Hardware-accurate parameters based on NES/GB/C64 chips
 */
export interface ChipSynthConfig {
  // Chip emulation target (new)
  chip?: 'nes' | 'gb' | 'c64' | 'ay' | 'sn76489' | 'generic';

  channel: 'pulse1' | 'pulse2' | 'triangle' | 'noise';
  pulse?: {
    duty: 12.5 | 25 | 50 | 75;  // Duty cycle percentage (75% = inverted 25%)
    // Hardware sweep (NES-style, new)
    sweep?: {
      enabled: boolean;
      period: number;           // 0-7 (sweep speed)
      direction: 'up' | 'down';
      shift: number;            // 0-7 (pitch change amount)
    };
  };
  noise?: {
    mode: 'white' | 'periodic' | 'metallic';  // metallic = looped noise
    period: number;             // For periodic noise
  };
  bitDepth: number;             // 4-16 bits
  sampleRate: number;           // 4000-44100 Hz
  arpeggio?: ArpeggioConfig;    // Advanced arpeggio config
  envelope: EnvelopeConfig;
  vibrato: {
    speed: number;              // 0-20 Hz
    depth: number;              // 0-100%
    delay: number;              // ms before vibrato starts
  };

  // Hardware volume envelope (GB/NES style, new)
  hardwareEnvelope?: {
    enabled: boolean;
    initialVolume: number;      // 0-15
    direction: 'up' | 'down';   // Volume sweep direction
    period: number;             // 0-7 (sweep speed, 0=disable)
  };

  // Ring modulation (C64 style, new)
  ringMod?: {
    enabled: boolean;
    sourceChannel: 'pulse1' | 'pulse2' | 'triangle';
  };

  // Hard sync (C64 style, new)
  sync?: {
    enabled: boolean;
    sourceChannel: 'pulse1' | 'pulse2' | 'triangle';
  };

  // Macro system (Furnace-style, new)
  macros?: {
    volume?: number[];          // Volume sequence (0-15)
    arpeggio?: number[];        // Note offset sequence
    duty?: number[];            // Duty cycle sequence (0-3 for pulse)
    pitch?: number[];           // Pitch offset sequence
    waveform?: number[];        // Waveform sequence
    loopPoint?: number;         // Where to loop (-1 = no loop)
    releasePoint?: number;      // Release point (-1 = none)
  };
}

export const DEFAULT_CHIP_SYNTH: ChipSynthConfig = {
  channel: 'pulse1',
  pulse: {
    duty: 50,
  },
  bitDepth: 8,
  sampleRate: 22050,
  envelope: {
    attack: 5,
    decay: 300,
    sustain: 0,  // Decay to silence (tracker-style)
    release: 50,
  },
  vibrato: {
    speed: 6,
    depth: 0,
    delay: 200,
  },
  arpeggio: {
    enabled: false,
    speed: 15,              // 15 Hz (typical chiptune arpeggio speed)
    speedUnit: 'hz',
    steps: [
      { noteOffset: 0 },    // Root
      { noteOffset: 4 },    // Major third
      { noteOffset: 7 },    // Fifth
    ],
    mode: 'loop',
    swing: 0,
  },
};

/**
 * PWMSynth Configuration (Pulse Width Modulation)
 */
export interface PWMSynthConfig {
  pulseWidth: number;           // 0-100% (50% = square)
  pwmDepth: number;             // 0-100% modulation depth
  pwmRate: number;              // 0.1-20 Hz LFO rate
  pwmWaveform: 'sine' | 'triangle' | 'sawtooth';
  oscillators: number;          // 1-3 oscillators
  detune: number;               // 0-50 cents between oscillators
  envelope: EnvelopeConfig;
  filter: {
    type: FilterType;
    cutoff: number;
    resonance: number;
    envelopeAmount: number;
    keyTracking: number;        // 0-100%
  };
  filterEnvelope: EnvelopeConfig;
}

export const DEFAULT_PWM_SYNTH: PWMSynthConfig = {
  pulseWidth: 50,
  pwmDepth: 30,
  pwmRate: 2,
  pwmWaveform: 'sine',
  oscillators: 2,
  detune: 10,
  envelope: {
    attack: 50,
    decay: 500,
    sustain: 0,  // Decay to silence (tracker-style)
    release: 100,
  },
  filter: {
    type: 'lowpass',
    cutoff: 4000,
    resonance: 20,
    envelopeAmount: 30,
    keyTracking: 50,
  },
  filterEnvelope: {
    attack: 10,
    decay: 500,
    sustain: 0,  // Decay to silence
    release: 100,
  },
};

/**
 * StringMachine Configuration (Ensemble Strings)
 */
export interface StringMachineConfig {
  sections: {
    violin: number;             // 0-100% level
    viola: number;
    cello: number;
    bass: number;
  };
  ensemble: {
    depth: number;              // 0-100% chorus depth
    rate: number;               // 0.5-6 Hz
    voices: number;             // 2-6 chorus voices
  };
  attack: number;               // 10-2000ms
  release: number;              // 100-5000ms
  brightness: number;           // 0-100% high frequency content
}

export const DEFAULT_STRING_MACHINE: StringMachineConfig = {
  sections: {
    violin: 100,
    viola: 70,
    cello: 50,
    bass: 30,
  },
  ensemble: {
    depth: 60,
    rate: 3,
    voices: 4,
  },
  attack: 200,
  release: 1000,
  brightness: 60,
};

/**
 * FormantSynth Configuration (Vocal Synthesis)
 */
export type VowelType = 'A' | 'E' | 'I' | 'O' | 'U';

export interface FormantSynthConfig {
  vowel: VowelType;
  vowelMorph: {
    target: VowelType;
    amount: number;             // 0-100% blend
    rate: number;               // 0-5 Hz morph speed
    mode: 'manual' | 'lfo' | 'envelope';
  };
  oscillator: {
    type: WaveformType;
    pulseWidth?: number;        // For pulse wave
  };
  formants: {
    f1: number;                 // First formant Hz (override)
    f2: number;                 // Second formant Hz
    f3: number;                 // Third formant Hz
    bandwidth: number;          // 50-200 Hz
  };
  envelope: EnvelopeConfig;
  brightness: number;           // 0-100%
}

// Formant frequency presets for vowels
export const VOWEL_FORMANTS: Record<VowelType, { f1: number; f2: number; f3: number }> = {
  A: { f1: 800, f2: 1200, f3: 2500 },
  E: { f1: 400, f2: 2000, f3: 2600 },
  I: { f1: 300, f2: 2300, f3: 3000 },
  O: { f1: 500, f2: 800, f3: 2500 },
  U: { f1: 350, f2: 600, f3: 2400 },
};

/**
 * WobbleBass Configuration
 * Dedicated bass synth for dubstep, DnB, jungle wobble and growl basses
 * Features dual oscillators, FM, Reese-style detuning, aggressive filter, and tempo-synced LFO
 */
export type WobbleLFOSync =
  | '1/1' | '1/2' | '1/2T' | '1/2D'
  | '1/4' | '1/4T' | '1/4D'
  | '1/8' | '1/8T' | '1/8D'
  | '1/16' | '1/16T' | '1/16D'
  | '1/32' | '1/32T'
  | 'free';

export type WobbleMode = 'classic' | 'reese' | 'fm' | 'growl' | 'hybrid';

export interface WobbleBassConfig {
  mode: WobbleMode;

  // Dual Oscillator Section
  osc1: {
    type: WaveformType;
    octave: number;           // -2 to +2
    detune: number;           // -100 to +100 cents
    level: number;            // 0-100%
  };
  osc2: {
    type: WaveformType;
    octave: number;           // -2 to +2
    detune: number;           // -100 to +100 cents (for Reese effect)
    level: number;            // 0-100%
  };

  // Sub Oscillator (clean sine)
  sub: {
    enabled: boolean;
    octave: number;           // -2 to 0
    level: number;            // 0-100%
  };

  // FM Section
  fm: {
    enabled: boolean;
    amount: number;           // 0-100 (modulation index)
    ratio: number;            // 0.5-8 (carrier:modulator ratio)
    envelope: number;         // 0-100% (FM amount envelope depth)
  };

  // Unison/Reese Section
  unison: {
    voices: number;           // 1-16
    detune: number;           // 0-100 cents spread
    stereoSpread: number;     // 0-100%
  };

  // Filter Section (aggressive lowpass)
  filter: {
    type: 'lowpass' | 'bandpass' | 'highpass';
    cutoff: number;           // 20-20000 Hz
    resonance: number;        // 0-100% (high values for screaming)
    rolloff: -12 | -24 | -48;
    drive: number;            // 0-100% (filter drive/saturation)
    keyTracking: number;      // 0-100%
  };

  // Filter Envelope
  filterEnvelope: {
    amount: number;           // -100 to +100% (bipolar)
    attack: number;           // 0-2000ms
    decay: number;            // 0-2000ms
    sustain: number;          // 0-100%
    release: number;          // 0-2000ms
  };

  // Wobble LFO (tempo-synced)
  wobbleLFO: {
    enabled: boolean;
    sync: WobbleLFOSync;      // Tempo sync division
    rate: number;             // 0.1-20 Hz (when sync='free')
    shape: 'sine' | 'triangle' | 'saw' | 'square' | 'sample_hold';
    amount: number;           // 0-100% filter modulation
    pitchAmount: number;      // 0-100 cents
    fmAmount: number;         // 0-100% FM modulation
    phase: number;            // 0-360 degrees
    retrigger: boolean;
  };

  // Amp Envelope
  envelope: EnvelopeConfig;

  // Built-in Effects
  distortion: {
    enabled: boolean;
    type: 'soft' | 'hard' | 'fuzz' | 'bitcrush';
    drive: number;            // 0-100%
    tone: number;             // 0-100% (post-dist filter)
  };

  // Formant (for growl)
  formant: {
    enabled: boolean;
    vowel: VowelType;
    morph: number;            // 0-100% position between vowels
    lfoAmount: number;        // 0-100% LFO modulation of vowel
  };
}

export const DEFAULT_WOBBLE_BASS: WobbleBassConfig = {
  mode: 'classic',

  osc1: {
    type: 'sawtooth',
    octave: -1,
    detune: 0,
    level: 100,
  },
  osc2: {
    type: 'sawtooth',
    octave: -1,
    detune: 7,              // Slight detune for thickness
    level: 80,
  },

  sub: {
    enabled: true,
    octave: -2,
    level: 60,
  },

  fm: {
    enabled: false,
    amount: 30,
    ratio: 2,
    envelope: 50,
  },

  unison: {
    voices: 4,
    detune: 15,
    stereoSpread: 50,
  },

  filter: {
    type: 'lowpass',
    cutoff: 800,
    resonance: 60,
    rolloff: -24,
    drive: 30,
    keyTracking: 0,
  },

  filterEnvelope: {
    amount: 70,
    attack: 5,
    decay: 300,
    sustain: 20,
    release: 200,
  },

  wobbleLFO: {
    enabled: true,
    sync: '1/4',
    rate: 4,
    shape: 'sine',
    amount: 80,
    pitchAmount: 0,
    fmAmount: 0,
    phase: 0,
    retrigger: true,
  },

  envelope: {
    attack: 5,
    decay: 200,
    sustain: 80,
    release: 300,
  },

  distortion: {
    enabled: true,
    type: 'soft',
    drive: 40,
    tone: 70,
  },

  formant: {
    enabled: false,
    vowel: 'A',
    morph: 0,
    lfoAmount: 0,
  },
};

/**
 * WobbleBass Configuration
 * Dedicated bass synth for dubstep, DnB, jungle wobble and growl basses
 * Features dual oscillators, FM, Reese-style detuning, aggressive filter, and tempo-synced LFO
 */




/**
 * Buzzmachine Configuration
 * For Jeskola Buzz machine effects used as synths/generators
 *
 * Machine types match the BuzzmachineType const in BuzzmachineEngine.ts
 */
export type BuzzmachineType =
  // Distortion/Saturation
  | 'ArguruDistortion'
  | 'ElakDist2'
  | 'JeskolaDistortion'
  | 'GeonikOverdrive'
  | 'GraueSoftSat'
  | 'WhiteNoiseStereoDist'
  // Filters
  | 'ElakSVF'
  | 'CyanPhaseNotch'
  | 'QZfilter'
  | 'FSMPhilta'
  // Delay/Reverb
  | 'JeskolaDelay'
  | 'JeskolaCrossDelay'
  | 'JeskolaFreeverb'
  | 'FSMPanzerDelay'
  // Chorus/Modulation
  | 'FSMChorus'
  | 'FSMChorus2'
  | 'WhiteNoiseWhiteChorus'
  | 'BigyoFrequencyShifter'
  // Dynamics
  | 'GeonikCompressor'
  | 'LdSLimit'
  | 'OomekExciter'
  | 'OomekMasterizer'
  | 'DedaCodeStereoGain'
  // Generators
  | 'FSMKick'
  | 'FSMKickXP'
  | 'JeskolaTrilok'
  | 'JeskolaNoise'
  | 'OomekAggressor'
  | 'MadBrain4FM2F'
  | 'MadBrainDynamite6'
  | 'MakkM3'
  | 'CyanPhaseDTMF'
  | 'ElenzilFrequencyBomb';

export interface BuzzmachineConfig {
  machineType: BuzzmachineType;
  parameters: Record<number, number>;  // Parameter index -> value
}

export const DEFAULT_BUZZMACHINE: BuzzmachineConfig = {
  machineType: 'ArguruDistortion',
  parameters: {},
};

export const DEFAULT_FORMANT_SYNTH: FormantSynthConfig = {
  vowel: 'A',
  vowelMorph: {
    target: 'O',
    amount: 0,
    rate: 1,
    mode: 'manual',
  },
  oscillator: {
    type: 'sawtooth',
  },
  formants: {
    ...VOWEL_FORMANTS.A,
    bandwidth: 100,
  },
  envelope: {
    attack: 50,
    decay: 500,
    sustain: 0,  // Decay to silence (tracker-style)
    release: 100,
  },
  brightness: 70,
};

/**
 * Furnace Tracker Instrument Configuration
 * Based on Furnace's instrument.h - comprehensive FM/chip instrument support
 */

// Macro types from Furnace (DIV_MACRO_*)
export const FurnaceMacroType = {
  VOL: 0,
  ARP: 1,
  DUTY: 2,
  WAVE: 3,
  PITCH: 4,
  EX1: 5,
  EX2: 6,
  EX3: 7,
  ALG: 8,
  FB: 9,
  FMS: 10,
  AMS: 11,
  PAN_L: 12,
  PAN_R: 13,
  PHASE_RESET: 14,
  EX4: 15,
  EX5: 16,
  EX6: 17,
  EX7: 18,
  EX8: 19,
  FMS2: 20,
  AMS2: 21,
} as const;

export type FurnaceMacroType = typeof FurnaceMacroType[keyof typeof FurnaceMacroType];

export interface FurnaceOperatorConfig {
  enabled: boolean;
  // Basic FM parameters
  mult: number;      // 0-15 (frequency multiplier)
  tl: number;        // Total Level 0-127 (attenuation)
  ar: number;        // Attack Rate 0-31
  dr: number;        // Decay Rate 0-31
  d2r: number;       // Decay 2 Rate / Sustain Rate 0-31
  sl: number;        // Sustain Level 0-15
  rr: number;        // Release Rate 0-15
  dt: number;        // Detune -3 to +3 (signed)
  dt2: number;       // Detune 2 / Coarse tune 0-3 (OPM/OPZ)
  rs: number;        // Rate Scaling 0-3

  // Modulation flags
  am: boolean;       // Amplitude Modulation enable

  // OPL-specific
  ksr: boolean;      // Key Scale Rate
  ksl: number;       // Key Scale Level 0-3
  sus: boolean;      // Sustain flag
  vib: boolean;      // Vibrato flag
  ws: number;        // Waveform Select 0-7

  // SSG-EG (OPN family)
  ssg: number;       // SSG-EG mode 0-15

  // OPZ-specific (added from Furnace) - optional for backward compatibility
  dam?: number;      // AM depth 0-7
  dvb?: number;      // Vibrato depth 0-7
  egt?: boolean;     // Fixed frequency mode
  kvs?: number;      // Key velocity sensitivity 0-3
}

export interface FurnaceMacro {
  type: number;      // FurnaceMacroType
  data: number[];    // Up to 256 steps
  loop: number;      // Loop point (-1 = no loop)
  release: number;   // Release point (-1 = no release)
  mode: number;      // Macro mode (0=sequence, 1=ADSR, 2=LFO)
  // Added from Furnace's DivInstrumentMacro - optional for backward compatibility
  delay?: number;    // Macro start delay in ticks
  speed?: number;    // Macro speed (1 = normal, 2 = half speed, etc.)
  open?: boolean;    // Whether loop is "open" (continues past release)
}

// Complete per-operator macro set from Furnace
export interface FurnaceOpMacros {
  tl?: FurnaceMacro;
  ar?: FurnaceMacro;
  dr?: FurnaceMacro;
  d2r?: FurnaceMacro;
  sl?: FurnaceMacro;
  rr?: FurnaceMacro;
  mult?: FurnaceMacro;
  dt?: FurnaceMacro;
  dt2?: FurnaceMacro;
  rs?: FurnaceMacro;
  am?: FurnaceMacro;
  ksr?: FurnaceMacro;
  ksl?: FurnaceMacro;
  sus?: FurnaceMacro;
  vib?: FurnaceMacro;
  ws?: FurnaceMacro;
  ssg?: FurnaceMacro;
  // OPZ-specific
  dam?: FurnaceMacro;
  dvb?: FurnaceMacro;
  egt?: FurnaceMacro;
  kvs?: FurnaceMacro;
}

// Chip-specific configs from Furnace

// Game Boy (DIV_INS_GB)
export interface FurnaceGBConfig {
  envVol: number;        // Initial volume 0-15
  envDir: number;        // Direction (0=decrease, 1=increase)
  envLen: number;        // Length 0-7
  soundLen: number;      // Sound length 0-63
  duty?: number;         // Duty cycle 0-3 (12.5%, 25%, 50%, 75%)
  // Hardware sequence (for precise envelope control)
  hwSeqEnabled?: boolean; // Enable hardware sequence
  hwSeqLen?: number;
  hwSeq?: Array<{
    cmd: number;         // Command type
    data: number;        // Command data
  }>;
  softEnv?: boolean;      // Use software envelope
  alwaysInit?: boolean;   // Always initialize
}

// C64 SID (DIV_INS_C64)
export interface FurnaceC64Config {
  triOn: boolean;        // Triangle waveform
  sawOn: boolean;        // Saw waveform
  pulseOn: boolean;      // Pulse waveform
  noiseOn: boolean;      // Noise waveform
  a: number;             // Attack 0-15
  d: number;             // Decay 0-15
  s: number;             // Sustain 0-15
  r: number;             // Release 0-15
  duty: number;          // Pulse duty 0-4095
  ringMod: boolean;      // Ring modulation
  oscSync: boolean;      // Oscillator sync
  toFilter?: boolean;    // Route to filter
  initFilter?: boolean;  // Initialize filter
  filterOn?: boolean;    // Filter enabled (editor alias)
  filterRes?: number;    // Filter resonance (editor alias) 0-15
  filterResonance?: number; // 0-15
  filterCutoff?: number; // 0-2047
  filterLP?: boolean;    // Low-pass filter
  filterBP?: boolean;    // Band-pass filter
  filterHP?: boolean;    // High-pass filter
  filterCh3Off?: boolean; // Disable channel 3
}

// Amiga (DIV_INS_AMIGA)
export interface FurnaceAmigaConfig {
  initSample: number;    // Initial sample (-1 = none)
  useNoteMap: boolean;   // Use note-to-sample mapping
  useSample: boolean;    // Use sample (vs wavetable)
  useWave: boolean;      // Use wavetable
  waveLen: number;       // Wavetable length
  // Note map for multi-sample instruments
  noteMap: Array<{
    note: number;
    sample: number;
    frequency: number;
  }>;
}

// Namco 163 (DIV_INS_N163)
export interface FurnaceN163Config {
  wave: number;          // Wavetable index
  wavePos: number;       // Wave position in RAM
  waveLen: number;       // Wave length
  waveMode: number;      // Wave mode
  perChPos: boolean;     // Per-channel position
}

// FDS (DIV_INS_FDS)
export interface FurnaceFDSConfig {
  modSpeed: number;      // Modulation speed 0-4095
  modDepth: number;      // Modulation depth 0-63
  modTable: number[];    // 32-step modulation table (-4 to +3)
  initModTableWithFirstWave: boolean;
}

// SNES (DIV_INS_SNES)
export interface FurnaceSNESConfig {
  useEnv: boolean;       // Use hardware envelope
  gainMode: number | string; // Gain mode (number for raw, string for named modes)
  gain: number;          // Gain value
  a: number;             // Attack
  d: number;             // Decay
  s: number;             // Sustain level
  r: number;             // Release
  // BRR sample settings
  d2?: number;           // Decay 2
  sus?: number;          // Sustain mode
}

// ESFM (DIV_INS_ESFM)
export interface FurnaceESFMOperatorConfig extends FurnaceOperatorConfig {
  delay: number;         // Operator delay 0-7
  outLvl: number;        // Output level 0-7
  modIn: number;         // Modulation input 0-7
  left: boolean;         // Left output enable
  right: boolean;        // Right output enable
  ct: number;            // Coarse tune
  dt: number;            // Fine detune
  fixed: boolean;        // Fixed frequency
  fixedFreq: number;     // Fixed frequency value
}

export interface FurnaceESFMConfig {
  operators: FurnaceESFMOperatorConfig[];
  noise: number;         // Noise mode
}

// ES5506 (DIV_INS_ES5506)
export interface FurnaceES5506Config {
  filter: {
    mode: number;        // Filter mode
    k1: number;          // Filter coefficient K1
    k2: number;          // Filter coefficient K2
  };
  envelope: {
    ecount: number;      // Envelope count
    lVRamp: number;      // Left volume ramp
    rVRamp: number;      // Right volume ramp
    k1Ramp: number;      // K1 ramp
    k2Ramp: number;      // K2 ramp
    k1Slow: boolean;     // K1 slow mode
    k2Slow: boolean;     // K2 slow mode
  };
}

// Main Furnace Config (expanded)
export interface FurnaceConfig {
  chipType: number;

  // FM parameters
  algorithm: number;     // 0-7 (operator connection algorithm)
  feedback: number;      // 0-7 (op1 self-feedback)
  fms?: number;          // FM sensitivity / LFO->FM depth 0-7
  ams?: number;          // AM sensitivity / LFO->AM depth 0-3
  fms2?: number;         // Secondary FM sensitivity (OPZ)
  ams2?: number;         // Secondary AM sensitivity (OPZ)
  ops?: number;          // Number of operators (2 or 4)
  opllPreset?: number;   // OPLL preset patch 0-15
  fixedDrums?: boolean;  // OPLL fixed drum mode

  // Operator configurations
  operators: FurnaceOperatorConfig[];

  // Macro system
  macros: FurnaceMacro[];
  opMacros: FurnaceOpMacros[];

  // Wavetables
  wavetables: Array<{
    id: number;
    data: number[];
    len?: number;   // Optional for backward compatibility
    max?: number;   // Optional for backward compatibility
  }>;

  // Chip-specific configurations (optional, based on chipType)
  gb?: FurnaceGBConfig;
  c64?: FurnaceC64Config;
  amiga?: FurnaceAmigaConfig;
  n163?: FurnaceN163Config;
  fds?: FurnaceFDSConfig;
  snes?: FurnaceSNESConfig;
  esfm?: FurnaceESFMConfig;
  es5506?: FurnaceES5506Config;

  // Additional chip configs (editor-specific)
  nes?: {
    dutyNoise: number;
    envMode: 'length' | 'env';
    envValue: number;
    sweepEnabled: boolean;
    sweepPeriod: number;
    sweepNegate: boolean;
    sweepShift: number;
  };
  psg?: {
    duty: number;
    width: number;
    noiseMode: 'white' | 'periodic';
    attack: number;
    decay: number;
    sustain: number;
    release: number;
  };
  pcm?: {
    sampleRate: number;
    loopStart: number;
    loopEnd: number;
    loopPoint: number;
    bitDepth: number;
    loopEnabled: boolean;
  };
}

export const DEFAULT_FURNACE: FurnaceConfig = {
  chipType: 1, // FM (OPN2/Genesis)
  algorithm: 4, // Algorithm 4: OP1+OP2->OP3, OP4 carrier (classic FM brass/strings)
  feedback: 4,  // Moderate feedback for richer harmonics
  fms: 0,
  ams: 0,
  fms2: 0,
  ams2: 0,
  ops: 4,
  opllPreset: 0,
  fixedDrums: false,
  operators: [
    // OP1 - Modulator
    {
      enabled: true,
      mult: 2,    // 2x frequency ratio
      tl: 40,     // Moderate modulation depth
      ar: 31,     // Fast attack
      dr: 8,      // Moderate decay
      d2r: 2,     // Slow secondary decay
      sl: 4,      // Sustain at ~75%
      rr: 6,      // Moderate release
      dt: 0,
      dt2: 0,
      rs: 0,
      am: false,
      ksr: false,
      ksl: 0,
      sus: false,
      vib: false,
      ws: 0,
      ssg: 0,
      dam: 0,
      dvb: 0,
      egt: false,
      kvs: 0,
    },
    // OP2 - Modulator
    {
      enabled: true,
      mult: 1,    // 1x frequency ratio
      tl: 50,     // Lower modulation
      ar: 28,     // Fast attack
      dr: 6,      // Moderate decay
      d2r: 2,
      sl: 4,
      rr: 6,
      dt: 0,
      dt2: 0,
      rs: 0,
      am: false,
      ksr: false,
      ksl: 0,
      sus: false,
      vib: false,
      ws: 0,
      ssg: 0,
      dam: 0,
      dvb: 0,
      egt: false,
      kvs: 0,
    },
    // OP3 - Carrier (outputs for algorithm 4)
    {
      enabled: true,
      mult: 1,
      tl: 0,      // Full volume (carrier)
      ar: 31,
      dr: 10,
      d2r: 4,
      sl: 2,
      rr: 6,
      dt: 0,
      dt2: 0,
      rs: 0,
      am: false,
      ksr: false,
      ksl: 0,
      sus: false,
      vib: false,
      ws: 0,
      ssg: 0,
      dam: 0,
      dvb: 0,
      egt: false,
      kvs: 0,
    },
    // OP4 - Carrier (always outputs in algorithm 4)
    {
      enabled: true,
      mult: 1,
      tl: 0,      // Full volume (carrier)
      ar: 31,
      dr: 8,
      d2r: 3,
      sl: 3,
      rr: 5,      // Slightly slower release for tail
      dt: 0,
      dt2: 0,
      rs: 0,
      am: false,
      ksr: false,
      ksl: 0,
      sus: false,
      vib: false,
      ws: 0,
      ssg: 0,
      dam: 0,
      dvb: 0,
      egt: false,
      kvs: 0,
    },
  ],
  macros: [],
  opMacros: Array.from({ length: 4 }, () => ({})),
  wavetables: [],
};

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
  | 'BuzzPanzerDelay'; // FSM Panzer Delay

export type EffectCategory = 'tonejs' | 'neural';

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

export interface InstrumentMetadata {
  importedFrom?: 'MOD' | 'XM' | 'IT' | 'S3M' | 'FUR';
  originalEnvelope?: any; // Preserved point-based envelope for future editor
  autoVibrato?: any; // Preserved auto-vibrato settings
  preservedSample?: {
    audioBuffer: ArrayBuffer;
    url: string;
    baseNote: string;
    detune: number;
    loop: boolean;
    loopStart: number;
    loopEnd: number;
    envelope: EnvelopeConfig;
  };
  transformHistory?: Array<{
    timestamp: string;
    fromType: SynthType;
    toType: SynthType;
  }>;
  // MOD/XM period-based playback
  modPlayback?: {
    usePeriodPlayback: boolean; // If true, use period-based playback (Amiga)
    periodMultiplier: number; // AMIGA_PALFREQUENCY_HALF = 3546895
    finetune: number; // -8 to +7 (ProTracker) or -128 to +127 (XM)
    defaultVolume?: number; // Sample's default volume (0-64) for channel init
    fadeout?: number; // Fadeout rate
  };
  envelopes?: Record<number, {
    volumeEnvelope?: any;
    panningEnvelope?: any;
    pitchEnvelope?: any;
    fadeout?: number;
  }>;
  preservedSynth?: {
    synthType: SynthType;
    config: Partial<InstrumentConfig>;
    bakeType?: 'lite' | 'pro';
  };
}

// Import beat slicer types
import type { BeatSlice, BeatSliceConfig } from './beatSlicer';

export interface SampleConfig {
  audioBuffer?: ArrayBuffer;
  url: string;
  multiMap?: Record<string, string>; // Note (e.g. "C4") -> URL map for multi-sampling
  baseNote: string; // "C-4"
  detune: number; // -100 to +100 cents
  loop: boolean;
  loopType?: 'off' | 'forward' | 'pingpong'; // Loop mode
  loopStart: number; // Sample frame index
  loopEnd: number; // Sample frame index
  sampleRate?: number; // For converting loop points to seconds (default 8363 Hz for MOD)
  reverse: boolean;
  playbackRate: number; // 0.25-4x
  // Beat slicer data
  slices?: BeatSlice[];
  sliceConfig?: BeatSliceConfig;
}

/**
 * Drumkit Key Mapping - Maps a note range to a sample
 * Impulse Tracker style keymapping for multi-sample instruments
 */
export interface DrumKitKeyMapping {
  /** Unique ID for this mapping */
  id: string;
  /** Note range start (MIDI note number, 0-127, or XM note 1-96) */
  noteStart: number;
  /** Note range end (MIDI note number) - same as start for single-key mapping */
  noteEnd: number;
  /** Reference to the source sample/instrument ID */
  sampleId: string;
  /** Sample URL if different from the referenced instrument */
  sampleUrl?: string;
  /** Sample name for display */
  sampleName?: string;
  /** Pitch offset in semitones (-48 to +48) */
  pitchOffset: number;
  /** Fine tuning in cents (-100 to +100) */
  fineTune: number;
  /** Volume offset in dB (-12 to +12) */
  volumeOffset: number;
  /** Panning offset (-100 to +100, 0 = center) */
  panOffset: number;
  /** Optional: override base note for sample playback */
  baseNote?: string;
}

/**
 * DrumKit Configuration - Multi-sample instrument
 * Like Impulse Tracker's instrument keymapping
 */
export interface DrumKitConfig {
  /** List of key mappings */
  keymap: DrumKitKeyMapping[];
  /** Default sample to use for unmapped notes */
  defaultSampleId?: string;
  /** Polyphony mode: 'poly' allows overlapping, 'mono' cuts previous note */
  polyphony: 'poly' | 'mono';
  /** Max simultaneous voices (1-16) */
  maxVoices: number;
  /** Whether to cut notes when same key is re-triggered */
  noteCut: boolean;
}

export const DEFAULT_DRUMKIT: DrumKitConfig = {
  keymap: [],
  polyphony: 'poly',
  maxVoices: 8,
  noteCut: false,
};

/**
 * LFO (Low Frequency Oscillator) Configuration
 * Provides audio-rate modulation for filter, pitch, and amplitude
 */
export type LFOWaveform = 'sine' | 'triangle' | 'sawtooth' | 'square';
export type LFOTarget = 'filter' | 'pitch' | 'volume';

// Tempo-synced LFO divisions (T=triplet, D=dotted)
export type LFOSyncDivision =
  | '1/1' | '1/2' | '1/2T' | '1/2D'
  | '1/4' | '1/4T' | '1/4D'
  | '1/8' | '1/8T' | '1/8D'
  | '1/16' | '1/16T' | '1/16D'
  | '1/32' | '1/32T'
  | 'free';

// Mapping from sync division to rate multiplier (at 120 BPM)
export const LFO_SYNC_RATES: Record<LFOSyncDivision, number> = {
  '1/1': 0.5,     // Whole note = 0.5 Hz at 120 BPM
  '1/2': 1,       // Half note
  '1/2T': 1.5,    // Half note triplet
  '1/2D': 0.75,   // Dotted half note
  '1/4': 2,       // Quarter note
  '1/4T': 3,      // Quarter triplet
  '1/4D': 1.5,    // Dotted quarter
  '1/8': 4,       // Eighth note
  '1/8T': 6,      // Eighth triplet
  '1/8D': 3,      // Dotted eighth
  '1/16': 8,      // Sixteenth
  '1/16T': 12,    // Sixteenth triplet
  '1/16D': 6,     // Dotted sixteenth
  '1/32': 16,     // 32nd note
  '1/32T': 24,    // 32nd triplet
  'free': 1,      // Not synced, use raw rate
};

export interface LFOConfig {
  enabled: boolean;
  waveform: LFOWaveform;
  rate: number;           // 0.1 - 20 Hz (when sync='free')
  sync?: boolean;         // Sync to tempo
  syncDivision?: LFOSyncDivision;  // Tempo division when synced

  // Filter LFO
  filterAmount: number;   // 0-100% (bipolar: -100 to +100 cents from current)
  filterTarget: 'cutoff' | 'resonance' | 'both';

  // Pitch LFO (vibrato)
  pitchAmount: number;    // 0-100 cents

  // Volume LFO (tremolo)
  volumeAmount: number;   // 0-100%

  // Phase
  phase: number;          // 0-360 degrees starting phase
  retrigger: boolean;     // Reset phase on note attack
}

export const DEFAULT_LFO: LFOConfig = {
  enabled: false,
  waveform: 'sine',
  rate: 5,
  sync: false,
  syncDivision: '1/4',
  filterAmount: 0,
  filterTarget: 'cutoff',
  pitchAmount: 0,
  volumeAmount: 0,
  phase: 0,
  retrigger: true,
};

/**
 * LFO (Low Frequency Oscillator) Configuration
 * Provides audio-rate modulation for filter, pitch, and amplitude
 */

// Tempo-synced LFO divisions (T=triplet, D=dotted)

// Mapping from sync division to rate multiplier (at 120 BPM)



/**
 * LFO (Low Frequency Oscillator) Configuration
 * Provides audio-rate modulation for filter, pitch, and amplitude
 */



/**
 * Dub Siren Configuration
 * Classic dub sound effect generator with LFO and Delay
 */
export interface DubSirenConfig {
  oscillator: {
    type: 'sine' | 'square' | 'sawtooth' | 'triangle';
    frequency: number; // Base frequency (60-1000 Hz)
  };
  lfo: {
    enabled: boolean;
    type: 'sine' | 'square' | 'sawtooth' | 'triangle';
    rate: number; // 0-20 Hz
    depth: number; // Modulation amount (0-1000)
  };
  delay: {
    enabled: boolean;
    time: number; // 0-1 seconds
    feedback: number; // 0-1
    wet: number; // 0-1
  };
  filter: {
    enabled: boolean;
    frequency: number; // 20-20000 Hz
    type: FilterType;
    rolloff: -12 | -24 | -48 | -96;
  };
  reverb: {
    enabled: boolean;
    decay: number; // seconds
    wet: number; // 0-1
  };
}

export const DEFAULT_DUB_SIREN: DubSirenConfig = {
  oscillator: {
    type: 'sine',
    frequency: 440,
  },
  lfo: {
    enabled: true,
    type: 'square',
    rate: 2,
    depth: 100,
  },
  delay: {
    enabled: true,
    time: 0.3,
    feedback: 0.4,
    wet: 0.3,
  },
  filter: {
    enabled: true,
    type: 'lowpass',
    frequency: 2000,
    rolloff: -24,
  },
  reverb: {
    enabled: true,
    decay: 1.5,
    wet: 0.1,
  },
};

/**
 * Synare 3 Configuration
 * Analog electronic percussion synthesizer
 */
export interface SynareConfig {
  oscillator: {
    type: 'square' | 'pulse';
    tune: number; // Base frequency (Hz)
    fine: number; // Fine tune (cents)
  };
  oscillator2: {
    enabled: boolean;
    detune: number; // Semitones from Osc 1
    mix: number;    // 0-1
  };
  noise: {
    enabled: boolean;
    type: 'white' | 'pink';
    mix: number;    // 0-1
    color: number;  // 0-100 (Lowpass cutoff)
  };
  filter: {
    cutoff: number; // 20-20000 Hz
    resonance: number; // 0-100%
    envMod: number; // 0-100%
    decay: number; // 10-2000ms
  };
  lfo: {
    enabled: boolean;
    rate: number; // 0.1-20 Hz
    depth: number; // 0-100%
    target: 'pitch' | 'filter' | 'both';
  };
  envelope: {
    decay: number; // 10-2000ms (Amp decay)
    sustain: number; // 0-1 (Simulates gate hold)
  };
  sweep: {
    enabled: boolean;
    amount: number; // Pitch drop amount (semitones)
    time: number;   // Sweep time (ms)
  };
}

/**
 * Space Laser Configuration
 * FM-based synth for classic reggae and anime laser effects
 */
export interface SpaceLaserConfig {
  laser: {
    startFreq: number;    // Hz (typically high, e.g. 5000)
    endFreq: number;      // Hz (typically low, e.g. 100)
    sweepTime: number;    // ms
    sweepCurve: 'exponential' | 'linear';
  };
  fm: {
    amount: number;       // Modulation index (0-100)
    ratio: number;        // Multiplier (0.5 - 16)
  };
  noise: {
    amount: number;       // 0-100%
    type: 'white' | 'pink' | 'brown';
  };
  filter: {
    type: FilterType;
    cutoff: number;       // 20-20000 Hz
    resonance: number;    // 0-100%
  };
  delay: {
    enabled: boolean;
    time: number;         // seconds
    feedback: number;     // 0-1
    wet: number;          // 0-1
  };
  reverb: {
    enabled: boolean;
    decay: number;        // seconds
    wet: number;          // 0-1
  };
}

/**
 * Farbrausch V2 Synth Configuration
 * Advanced multi-voice subtractive synth common in 4k/64k intros
 * Ground truth from V2 source code (v2defs.cpp)
 */
export interface V2Config {
  osc1: {
    mode: number; // Off, Saw/Tri, Pulse, Sin, Noise, XX, AuxA, AuxB
    transpose: number; // -64 to +63 (maps to 0-127)
    detune: number;    // -64 to +63 (maps to 0-127)
    color: number;     // 0-127
    level: number;     // 0-127
  };
  osc2: {
    mode: number; // !Off, Tri, Pul, Sin, Noi, FM, AuxA, AuxB
    ringMod: boolean;
    transpose: number;
    detune: number;
    color: number;
    level: number;
  };
  osc3: {
    mode: number; // !Off, Tri, Pul, Sin, Noi, FM, AuxA, AuxB
    ringMod: boolean;
    transpose: number;
    detune: number;
    color: number;
    level: number;
  };
  filter1: {
    mode: number; // Off, Low, Band, High, Notch, All, MoogL, MoogH
    cutoff: number; // 0-127
    resonance: number; // 0-127
  };
  filter2: {
    mode: number; // Off, Low, Band, High, Notch, All, MoogL, MoogH
    cutoff: number; // 0-127
    resonance: number; // 0-127
  };
  routing: {
    mode: number; // single, serial, parallel
    balance: number; // 0-127 (Filter 1 vs Filter 2)
  };
  envelope: {
    attack: number; // 0-127
    decay: number;  // 0-127
    sustain: number; // 0-127
    release: number; // 0-127
  };
  envelope2: {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
  };
  lfo1: {
    rate: number;
    depth: number;
  };
}

export const DEFAULT_V2: V2Config = {
  osc1: { mode: 1, transpose: 0, detune: 0, color: 64, level: 127 },
  osc2: { mode: 0, ringMod: false, transpose: 0, detune: 10, color: 64, level: 0 },
  osc3: { mode: 0, ringMod: false, transpose: 0, detune: -10, color: 64, level: 0 },
  filter1: { mode: 1, cutoff: 127, resonance: 0 },
  filter2: { mode: 0, cutoff: 127, resonance: 0 },
  routing: { mode: 0, balance: 64 },
  envelope: { attack: 0, decay: 64, sustain: 127, release: 32 },
  envelope2: { attack: 0, decay: 64, sustain: 127, release: 32 },
  lfo1: { rate: 64, depth: 0 },
};

export const DEFAULT_SPACE_LASER: SpaceLaserConfig = {
  laser: {
    startFreq: 4000,
    endFreq: 150,
    sweepTime: 150,
    sweepCurve: 'exponential',
  },
  fm: {
    amount: 40,
    ratio: 2.5,
  },
  noise: {
    amount: 10,
    type: 'white',
  },
  filter: {
    type: 'bandpass',
    cutoff: 2000,
    resonance: 40,
  },
  delay: {
    enabled: true,
    time: 0.3,
    feedback: 0.5,
    wet: 0.4,
  },
  reverb: {
    enabled: true,
    decay: 2.0,
    wet: 0.2,
  },
};

export const DEFAULT_SYNARE: SynareConfig = {
  oscillator: {
    type: 'square',
    tune: 200,
    fine: 0,
  },
  oscillator2: {
    enabled: false,
    detune: 0,
    mix: 0.5,
  },
  noise: {
    enabled: true,
    type: 'white',
    mix: 0.2,
    color: 100,
  },
  filter: {
    cutoff: 800,
    resonance: 60,
    envMod: 70,
    decay: 200,
  },
  lfo: {
    enabled: false,
    rate: 5,
    depth: 0,
    target: 'pitch',
  },
  envelope: {
    decay: 300,
    sustain: 0,
  },
  sweep: {
    enabled: true,
    amount: 24,
    time: 150,
  },
};

/**
 * Instrument type discriminator for XM compatibility
 * - 'sample': Standard XM sampled instrument
 * - 'synth': DEViLBOX synthesizer (extension)
 */
export type InstrumentType = 'sample' | 'synth';

export interface InstrumentConfig {
  id: number;                   // 1-128 (XM-compatible range, 1-indexed)
  name: string;                 // Max 22 characters (XM limit)
  type: InstrumentType;         // 'sample' or 'synth' (for XM export handling)
  synthType: SynthType;
  oscillator?: OscillatorConfig;
  envelope?: EnvelopeConfig;
  filter?: FilterConfig;
  filterEnvelope?: FilterEnvelopeConfig;
  pitchEnvelope?: PitchEnvelopeConfig;  // Pitch modulation envelope (for synth basses, kicks, FX)
  tb303?: TB303Config;
  wavetable?: WavetableConfig;
  granular?: GranularConfig;
  // New synth configs
  superSaw?: SuperSawConfig;
  polySynth?: PolySynthConfig;
  organ?: OrganConfig;
  drumMachine?: DrumMachineConfig;
  chipSynth?: ChipSynthConfig;
  pwmSynth?: PWMSynthConfig;
  stringMachine?: StringMachineConfig;
  formantSynth?: FormantSynthConfig;
  furnace?: FurnaceConfig;
  // Bass synths
  wobbleBass?: WobbleBassConfig;
  // Dub Siren
  dubSiren?: DubSirenConfig;
  // Space Laser
  spaceLaser?: SpaceLaserConfig;
  // Synare 3
  synare?: SynareConfig;
  // V2 Synth
  v2?: V2Config;
  // MAME synths
  mame?: MAMEConfig;
  // Buzzmachines
  buzzmachine?: BuzzmachineConfig;
  // Drumkit/Keymap (multi-sample)
  drumKit?: DrumKitConfig;
  // Module playback (libopenmpt)
  chiptuneModule?: ChiptuneModuleConfig;
  // Sampler config
  sample?: SampleConfig;
  effects: EffectConfig[];
  volume: number; // -60 to 0 dB
  pan: number; // -100 to 100
  monophonic?: boolean; // If true, force monophonic playback (one voice at a time)
  isLive?: boolean; // If true, bypass lookahead buffer for instant triggering during playback
  lfo?: LFOConfig; // Global LFO for filter/pitch/volume modulation
  parameters?: Record<string, any>; // Additional synth-specific parameters (e.g., sample URLs)
  metadata?: InstrumentMetadata; // Import metadata and transformation history
}

export interface InstrumentPreset {
  id: string;
  name: string;
  category: 'Bass' | 'Lead' | 'Pad' | 'Drum' | 'FX';
  tags: string[];
  author?: string;
  config: Omit<InstrumentConfig, 'id'>;
}

export interface InstrumentState {
  instruments: InstrumentConfig[];
  currentInstrumentId: number | null;
  presets: InstrumentPreset[];
}

export const DEFAULT_OSCILLATOR: OscillatorConfig = {
  type: 'sawtooth',
  detune: 0,
  octave: 0,
};

export const DEFAULT_ENVELOPE: EnvelopeConfig = {
  attack: 10,
  decay: 500,
  sustain: 0,  // Decay to silence (tracker-style)
  release: 100,
};

export const DEFAULT_FILTER: FilterConfig = {
  type: 'lowpass',
  frequency: 2000,
  Q: 1,
  rolloff: -24,
};

export const DEFAULT_TB303: TB303Config = {
  engineType: 'jc303',
  oscillator: {
    type: 'sawtooth',
  },
  filter: {
    cutoff: 800,
    resonance: 65,
  },
  filterEnvelope: {
    envMod: 60,
    decay: 200,
  },
  accent: {
    amount: 70,
  },
  slide: {
    time: 60,
    mode: 'exponential',
  },
  overdrive: {
    amount: 0,
  },
};

/**
 * Default Devil Fish settings that produce TB-303-compatible sound
 * Based on manual's "Limiting the Devil Fish to TB-303 sounds" section
 */
export const DEFAULT_DEVIL_FISH: DevilFishConfig = {
  enabled: false,

  // Envelope defaults (TB-303 compatible)
  normalDecay: 200,      // Standard MEG decay
  accentDecay: 200,      // Accented notes fixed at ~200ms in TB-303
  vegDecay: 3000,        // TB-303 had fixed ~3-4 second VEG decay
  vegSustain: 0,         // No sustain in TB-303
  softAttack: 0.3,       // Minimum (instant attack) - stock TB-303 had fixed ~4ms, DF makes it variable

  // Filter defaults (TB-303 compatible)
  filterTracking: 0,     // TB-303 filter didn't track pitch
  filterFM: 0,           // No filter FM in TB-303

  // Accent defaults (TB-303 compatible)
  sweepSpeed: 'normal',  // Standard TB-303 accent behavior
  accentSweepEnabled: true,

  // Resonance mode (TB-303 compatible)
  highResonance: false,  // Normal resonance range

  // Output (TB-303 compatible)
  muffler: 'off',        // No muffler in TB-303
};
