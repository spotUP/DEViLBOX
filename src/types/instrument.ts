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
  // Additive/Spectral
  | 'HarmonicSynth'
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
  | 'Buzz3o3DF'        // Oomek Aggressor Devil Fish (enhanced 303)
  | 'BuzzM4'           // Makk M4 (100-waveform wavetable synth)
  // MAME Hardware-Accurate Synths
  | 'MAMEAICA'         // Sega AICA (Dreamcast/Naomi)
  | 'MAMEASC'          // Apple Sound Chip (IIGS/Mac)
  | 'MAMEAstrocade'    // Bally Astrocade custom sound
  | 'MAMEC352'         // Namco C352 (arcade PCM, needs ROM)
  | 'MAMEES5503'       // Ensoniq ES5503 DOC (32-osc wavetable)
  | 'MAMEICS2115'      // ICS WaveFront (32-voice, needs ROM)
  | 'MAMEK054539'      // Konami 054539 (arcade PCM, needs ROM)
  | 'MAMEMEA8000'      // Philips MEA8000 (LPC speech)
  | 'MAMEMSM5232'      // OKI MSM5232 (8-voice organ/synth)
  | 'MAMERF5C400'      // Ricoh RF5C400 (32-voice PCM, needs ROM)
  | 'MAMESN76477'      // TI SN76477 (complex sound generator)
  | 'MAMESNKWave'      // SNK custom wavetable
  | 'MAMESP0250'       // GI SP0250 (speech synthesis)
  | 'MAMETIA'          // Atari 2600 TIA (MAME native)
  | 'MAMETMS36XX'      // TI TMS36XX (electronic organ)
  | 'MAMETMS5220'      // TI TMS5220 Speak & Spell (LPC speech)
  | 'MAMETR707'        // Roland TR-707 (PCM drum machine, needs ROM)
  | 'MAMEUPD931'       // NEC uPD931 (speech synthesis)
  | 'MAMEUPD933'       // NEC uPD933 (raw CZ phase distortion chip)
  | 'MAMEVotrax'       // Votrax SC-01 (classic speech)
  | 'MAMEYMF271'       // Yamaha OPX (12-voice FM+PCM)
  | 'MAMEYMOPQ'        // Yamaha OPQ (YM3806 FM)
  | 'MAMEVASynth'      // Virtual Analog modeling synth
  | 'MAMEVFX'          // Ensoniq VFX (ES5506)
  | 'MAMEDOC'          // Ensoniq ESQ-1 (ES5503)
  | 'MAMERSA'          // Roland SA (MKS-20/RD-1000)
  | 'MAMESWP30'        // Yamaha SWP30 (AWM2)
  | 'CZ101'            // Casio CZ-101 Phase Distortion (UPD933)
  | 'CEM3394'          // Curtis Electromusic analog synth voice (Prophet VS, Matrix-6, ESQ-1)
  | 'SCSP'             // Sega Saturn SCSP (YMF292-F) 32-voice sound processor
  | 'DubSiren'         // Dub Siren (Osc + LFO + Delay)
  | 'SpaceLaser'       // Space Laser (FM + Pitch Sweep)
  | 'V2'               // Farbrausch V2 Synth
  | 'V2Speech'         // Farbrausch V2 Speech Synth
  | 'Sam'              // Commodore SAM Speech Synth
  | 'Synare'           // Synare 3 (Electronic Percussion)
  | 'WAM'              // Web Audio Module (External Plugin)
  // Named WAM Synths (WAM 2.0 instruments with preconfigured URLs)
  | 'WAMOBXd'           // OB-Xd WAM synth
  | 'WAMSynth101'       // Synth-101 WAM synth
  | 'WAMTinySynth'      // TinySynth WAM synth
  | 'WAMFaustFlute'     // Faust Flute WAM synth
  // JUCE WASM Synths
  | 'Dexed'            // Yamaha DX7 FM Synthesizer (6-op FM)
  | 'OBXd'             // Oberheim OB-X Analog Synthesizer
  // VST Bridge (dynamically registered WASM synths)
  | 'DexedBridge'      // Dexed DX7 via VSTBridge (test/validation)
  | 'Vital'            // Vital Spectral Warping Wavetable Synthesizer
  | 'Odin2'            // Odin2 Semi-Modular Hybrid Synthesizer
  | 'Surge'            // Surge XT Hybrid Synthesizer
  | 'Helm'             // Helm Polyphonic Synthesizer by Matt Tytel
  | 'Sorcer'           // Sorcer FAUST-based Wavetable Synthesizer
  | 'Amsynth'          // amsynth Classic Analog Modeling Synthesizer
  | 'OBXf'             // OB-Xf Oberheim OB-X/OB-Xa Modeling
  | 'TonewheelOrgan'   // Hammond-style Tonewheel Organ (VSTBridge)
  | 'Melodica'         // Melodica Reed Instrument (VSTBridge)
  | 'Monique'          // Monique Morphing Monosynth (VSTBridge)
  // Virtual instruments (aliased MAME)
  | 'VFX'             // Ensoniq VFX (alias for MAMEVFX)
  | 'D50'            // Roland D-50 (virtual analog)
  // HivelyTracker / AHX synthesis
  | 'HivelySynth'     // HivelyTracker 16-channel chip synth (WASM)
  // UADE - Universal Amiga Demod-player (130+ exotic Amiga formats)
  | 'UADESynth'       // UADE catch-all (playback-only via 68k emulation)
  // UADE Format-Specific Synths (native DSP via WASM)
  | 'SoundMonSynth'   // SoundMon II / Brian Postma (wavetable + ADSR)
  | 'SidMonSynth'     // SidMon II (SID-like synthesis)
  | 'DigMugSynth'     // Digital Mugician (4-wave blending wavetable)
  | 'FCSynth'         // Future Composer 1.3/1.4 (47 waveforms + synth macro)
  | 'FredSynth'       // Fred Editor (macro-driven wavetable)
  | 'TFMXSynth'       // TFMX / Jochen Hippel (SndMod/VolMod sequences)
  | 'HippelCoSoSynth' // Jochen Hippel CoSo (frequency/volume sequence synthesis)
  | 'RobHubbardSynth' // Rob Hubbard (Amiga PCM sample + vibrato/wobble synthesis)
  | 'SidMon1Synth'    // SidMon 1.0 (ADSR + arpeggio + wavetable synthesis)
  | 'OctaMEDSynth'   // OctaMED SynthInstr (vol/wf command table oscillator)
  | 'DavidWhittakerSynth' // David Whittaker (Amiga period-based frq/vol sequence synthesis)
  | 'SymphonieSynth'  // Symphonie / Symphonie Pro (native AudioWorklet replayer)
  | 'MusicLineSynth'  // MusicLine Editor (WASM replayer)
  // SunVox modular synthesizer
  | 'SunVoxSynth'     // SunVox WASM patch player (.sunsynth / .sunvox)
  // Modular Synthesis
  | 'ModularSynth'    // Modular synthesizer with patch editor
  // SuperCollider scripted synthesis
  | 'SuperCollider';  // SuperCollider SynthDef (scsynth WASM)

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
  accentAttack?: number;  // 0.3-30ms - MEG attack time for accented notes
  vegDecay: number;       // 16-3000ms - VEG (Volume Envelope Generator) decay
  vegSustain: number;     // 0-100% - VEG sustain level (100% = infinite notes)
  softAttack: number;     // 0.3-3000ms (exponential) - attack time for non-accented notes
  accentSoftAttack?: number; // 0-100% - soft attack amount for accented notes

  // Filter controls
  filterTracking: number; // 0-200% - filter frequency tracks note pitch
  filterFmDepth: number;  // 0-100% - VCA output feeds back to filter frequency (audio-rate FM)
  filterInputDrive?: number; // 0-1 (db303 truth)
  passbandCompensation?: number; // 0-100% - filter passband level compensation
  resTracking?: number;   // 0-100% - resonance frequency tracking across keyboard
  duffingAmount?: number; // 0-100% - non-linear filter effect (Duffing oscillator)
  lpBpMix?: number;       // 0-100% - lowpass/bandpass filter mix (0=LP, 100=BP)
  stageNLAmount?: number; // 0-100% - per-stage non-linearity amount
  filterSelect?: number;  // 0-255 - filter mode/topology selection
  diodeCharacter?: number; // 0-100% - diode ladder filter character

  // Effects
  ensembleAmount?: number; // 0-100% - built-in ensemble/chorus effect

  // Extended range toggles (Wide mode — bypasses standard 303 mapping)
  extendedCutoff?: boolean;  // When true, cutoff knob sends setCutoffHz(10-5000Hz)
  extendedEnvMod?: boolean;  // When true, envMod knob sends setEnvModPercent(0-300%)

  // Audio quality
  oversamplingOrder?: 0 | 1 | 2 | 3 | 4; // 0=none, 1=2x, 2=4x, 3=8x, 4=16x oversampling

  // Korg/Advanced Filter
  korgEnabled?: boolean;  // Enable/disable Korg filter parameters
  korgBite?: number;      // 0-1 - filter bite/edge character
  korgClip?: number;      // 0-1 - soft clipping amount
  korgCrossmod?: number;  // 0-1 - cross modulation depth
  korgQSag?: number;      // 0-1 - resonance sag amount
  korgSharpness?: number; // 0-1 - filter sharpness/slope
  korgStiffness?: number; // 0-1 - (alias for duffingAmount)
  korgWarmth?: number;    // 0-1 - (alias for diodeCharacter)
  korgFilterFm?: number;  // 0-1 - (alias for filterFmDepth)

  // Accent controls
  sweepSpeed: 'fast' | 'normal' | 'slow'; // Accent sweep circuit behavior
  accentSweepEnabled: boolean;            // Enable/disable accent sweep circuit

  // Resonance mode
  highResonance: boolean; // Enable filter self-oscillation at mid/high frequencies

  // Output processing
  muffler: 'off' | 'soft' | 'hard' | 'dark' | 'mid' | 'bright'; // TB303: soft/hard clipping, Buzz3o3: dark/mid/bright lowpass
}

// SuperCollider synthesis types

export interface SCParam {
  name: string;
  value: number;
  default: number;
  min: number;
  max: number;
}

export interface SuperColliderConfig {
  synthDefName: string;   // Name declared in SynthDef(\name, ...)
  source: string;         // SC source code (for display/editing)
  binary: string;         // base64-encoded compiled .scsyndef
  params: SCParam[];      // Tweakable parameters (excl. freq/amp/gate)
}

export interface TB303Config {
  engineType?: 'jc303' | 'db303'; // jc303 = Open303 engine, db303 = db303 variant with additional tweaks

  // Tuning
  tuning?: number; // Master tuning in Hz (default: 440)

  // Volume
  volume?: number; // 0-1 (db303 truth)

  // Extended toggles (db303 feature)
  extendedCutoff?: boolean;
  extendedEnvMod?: boolean;

  // Tempo-relative envelopes (for slower tempos = longer sweeps)
  tempoRelative?: boolean; // Default: false (absolute ms), true = scale with BPM

  oscillator: {
    type: 'sawtooth' | 'square';
    waveformBlend?: number;  // 0-1 continuous blend (0=saw, 1=square) - overrides type if set
    pulseWidth?: number;      // 0-100 (pulse width modulation control)
    subOscGain?: number;      // 0-100 (sub-oscillator level)
    subOscBlend?: number;     // 0-100 (sub-oscillator mix with main oscillator)
    pitchToPw?: number;       // 0-1 (pitch-to-pulse-width modulation)
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
    chain: EffectConfig[];
  };
  overdrive?: {
    amount: number; // 0-100%
    modelIndex?: number; // GuitarML model index
    drive?: number; // 0-100%
    dryWet?: number; // 0-100%
  };
  // Devil Fish modifications (optional - for backward compatibility)
  devilFish?: DevilFishConfig;

  // LFO (Low Frequency Oscillator) - for modulation
  lfo?: {
    enabled?: boolean;         // Enable/disable LFO
    waveform: number;         // 0=triangle, 1=saw up, 2=saw down, 3=square, 4=random(S&H), 5=noise
    rate: number;              // 0-100 (LFO speed/frequency)
    contour: number;           // 0-100 (envelope contour amount)
    pitchDepth: number;        // 0-100 (pitch modulation depth)
    pwmDepth: number;          // 0-100 (pulse width modulation depth)
    filterDepth: number;       // 0-100 (filter cutoff modulation depth)
    stiffDepth?: number;       // 0-100 (stiffness modulation depth)
  };

  // Built-in effects
  chorus?: {
    enabled: boolean;         // Enable/disable chorus effect
    mode: 0 | 1 | 2 | 3 | 4;  // 0=off, 1=subtle, 2=standard, 3=rich, 4=dramatic
    mix: number;              // 0-100 (dry/wet mix)
  };
  phaser?: {
    enabled: boolean;         // Enable/disable phaser effect
    rate: number;             // 0-100 (LFO speed)
    depth: number;            // 0-100 (sweep depth/width)
    feedback: number;         // 0-100 (resonance/feedback amount)
    mix: number;              // 0-100 (dry/wet mix)
  };
  delay?: {
    enabled: boolean;         // Enable/disable delay effect
    time: number;             // 0-2000 (delay time in milliseconds)
    feedback: number;         // 0-100 (delay feedback/repeats)
    tone: number;             // 0-100 (filter cutoff for delay line)
    mix: number;              // 0-100 (dry/wet mix)
    stereo: number;           // 0-100 (stereo spread/width)
  };
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

export interface HarmonicSynthConfig {
  harmonics: number[];        // 32 values, each 0-1 (amplitude per harmonic)
  spectralTilt: number;       // -100 to 100 (shapes harmonic rolloff)
  evenOddBalance: number;     // -100 to 100 (odd-heavy ↔ even-heavy)
  filter: {
    type: 'lowpass' | 'highpass' | 'bandpass';
    cutoff: number;           // 20-20000 Hz
    resonance: number;        // 0-30
  };
  envelope: { attack: number; decay: number; sustain: number; release: number; };
  lfo: {
    rate: number;             // 0.1-20 Hz
    depth: number;            // 0-100
    target: 'pitch' | 'filter' | 'spectral';
  };
  maxVoices: number;          // 4-8
}

/** Sawtooth harmonic series: 1/n */
const SAW_HARMONICS = Array.from({ length: 32 }, (_, i) => 1 / (i + 1));

export const DEFAULT_HARMONIC_SYNTH: HarmonicSynthConfig = {
  harmonics: SAW_HARMONICS,
  spectralTilt: 0,
  evenOddBalance: 0,
  filter: { type: 'lowpass', cutoff: 8000, resonance: 1 },
  envelope: { attack: 10, decay: 300, sustain: 70, release: 200 },
  lfo: { rate: 2, depth: 0, target: 'pitch' },
  maxVoices: 6,
};

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

// ── HivelyTracker / AHX Configuration ───────────────────────────────────────

export interface HivelyEnvelopeConfig {
  aFrames: number;
  aVolume: number;
  dFrames: number;
  dVolume: number;
  sFrames: number;
  rFrames: number;
  rVolume: number;
}

export interface HivelyPerfEntryConfig {
  note: number;
  waveform: number;        // 0=triangle, 1=sawtooth, 2=square, 3=noise (+4 for filtered variants)
  fixed: boolean;
  fx: [number, number];
  fxParam: [number, number];
}

export interface HivelyConfig {
  volume: number;              // 0-64
  waveLength: number;          // 0-5 (maps to 4,8,16,32,64,128 samples)
  filterLowerLimit: number;    // 0-127
  filterUpperLimit: number;    // 0-63
  filterSpeed: number;         // 0-63
  squareLowerLimit: number;    // 0-255
  squareUpperLimit: number;    // 0-255
  squareSpeed: number;         // 0-63
  vibratoDelay: number;        // 0-255
  vibratoSpeed: number;        // 0-255
  vibratoDepth: number;        // 0-15
  hardCutRelease: boolean;
  hardCutReleaseFrames: number; // 0-7
  envelope: HivelyEnvelopeConfig;
  performanceList: {
    speed: number;
    entries: HivelyPerfEntryConfig[];
  };
}

export const DEFAULT_HIVELY: HivelyConfig = {
  volume: 64,
  waveLength: 3,               // 32-sample square wave
  filterLowerLimit: 0,
  filterUpperLimit: 0,
  filterSpeed: 0,
  squareLowerLimit: 32,
  squareUpperLimit: 63,
  squareSpeed: 1,
  vibratoDelay: 0,
  vibratoSpeed: 0,
  vibratoDepth: 0,
  hardCutRelease: false,
  hardCutReleaseFrames: 0,
  envelope: {
    aFrames: 1, aVolume: 64,
    dFrames: 1, dVolume: 64,
    sFrames: 1,
    rFrames: 1, rVolume: 0,
  },
  performanceList: {
    speed: 1,
    entries: [{ note: 0, waveform: 2, fixed: false, fx: [0, 0], fxParam: [0, 0] }],
  },
};

/**
 * UADE (Universal Amiga Dead-player Engine) configuration.
 * Stores the raw file bytes + metadata for playback-only exotic Amiga formats.
 * The UADE WASM module emulates the full Amiga 68000 + Paula chip, running
 * real eagleplayer binaries (JochenHippel, TFMX, FredEditor, SidMon, etc.).
 */
export interface UADEConfig {
  type: 'uade';
  filename: string;
  fileData: ArrayBuffer;
  subsongCount: number;
  currentSubsong: number;
  metadata: {
    player: string;        // Detected eagleplayer name (e.g. "JochenHippel")
    formatName: string;    // Human-readable format name
    minSubsong: number;
    maxSubsong: number;
  };
}

// =============================================================================
// UADE Format-Specific Synth Configs
// Each represents a native Amiga tracker instrument with real DSP parameters.
// TypeScript sends these to a WASM engine that renders the audio in real-time.
// All volume values: 0-64 (Amiga standard). Speed/delay values: 0-63 or 0-255.
// =============================================================================

/**
 * SoundMon II (Brian Postma) instrument configuration.
 * Supports both wavetable synth and raw PCM instruments.
 */
export interface SoundMonConfig {
  type: 'synth' | 'pcm';
  // Synth fields (type === 'synth')
  waveType: number;          // 0-15: oscillator waveform (square, saw, triangle, noise, pulse variants)
  waveSpeed: number;         // 0-15: waveform morph rate
  arpTable: number[];        // 16 entries: semitone offsets per tick
  arpSpeed: number;          // 0-15: ticks per arpeggio step
  attackVolume: number;      // 0-64
  decayVolume: number;       // 0-64
  sustainVolume: number;     // 0-64
  releaseVolume: number;     // 0-64
  attackSpeed: number;       // 0-63
  decaySpeed: number;        // 0-63
  sustainLength: number;     // 0-255 ticks
  releaseSpeed: number;      // 0-63
  vibratoDelay: number;      // 0-255 ticks before vibrato starts
  vibratoSpeed: number;      // 0-63
  vibratoDepth: number;      // 0-63
  portamentoSpeed: number;   // 0-63 (0 = disabled)
  // PCM fields (type === 'pcm')
  pcmData?: Uint8Array;      // Raw 8-bit signed PCM
  loopStart?: number;        // Loop start in samples
  loopLength?: number;       // Loop length in samples (0 = no loop)
  finetune?: number;         // -8..+7
  volume?: number;           // 0-64
  transpose?: number;        // -12..+12 semitones
}

export const DEFAULT_SOUNDMON: SoundMonConfig = {
  type: 'synth',
  waveType: 0,
  waveSpeed: 0,
  arpTable: new Array(16).fill(0),
  arpSpeed: 0,
  attackVolume: 64,
  decayVolume: 32,
  sustainVolume: 32,
  releaseVolume: 0,
  attackSpeed: 4,
  decaySpeed: 4,
  sustainLength: 16,
  releaseSpeed: 4,
  vibratoDelay: 0,
  vibratoSpeed: 0,
  vibratoDepth: 0,
  portamentoSpeed: 0,
};

/**
 * SidMon II instrument configuration.
 * SID-like synthesis with waveform + ADSR + filter + arpeggio.
 */
export interface SidMonConfig {
  type: 'synth' | 'pcm';
  // Synth fields
  waveform: 0 | 1 | 2 | 3;  // 0=triangle, 1=sawtooth, 2=pulse, 3=noise
  pulseWidth: number;         // 0-255 (for pulse waveform)
  attack: number;             // 0-15 (SID ADSR format)
  decay: number;              // 0-15
  sustain: number;            // 0-15
  release: number;            // 0-15
  arpTable: number[];         // 8 entries: semitone offsets
  arpSpeed: number;           // 0-15 ticks per step
  vibDelay: number;           // 0-255 ticks
  vibSpeed: number;           // 0-63
  vibDepth: number;           // 0-63
  filterCutoff: number;       // 0-255
  filterResonance: number;    // 0-15
  filterMode: number;         // 0=LP, 1=HP, 2=BP
  // PCM fields
  pcmData?: Uint8Array;
  loopStart?: number;
  loopLength?: number;
  finetune?: number;          // -8..+7
}

export const DEFAULT_SIDMON: SidMonConfig = {
  type: 'synth',
  waveform: 1,               // sawtooth
  pulseWidth: 128,
  attack: 2,
  decay: 4,
  sustain: 8,
  release: 4,
  arpTable: new Array(8).fill(0),
  arpSpeed: 0,
  vibDelay: 0,
  vibSpeed: 0,
  vibDepth: 0,
  filterCutoff: 255,
  filterResonance: 0,
  filterMode: 0,
};

/**
 * Digital Mugician (V1/V2) instrument configuration.
 * 4-wave blending wavetable + per-step volume envelope.
 */
export interface DigMugConfig {
  wavetable: [number, number, number, number]; // 4 waveform indices (0-14 built-in waves each)
  waveBlend: number;         // 0-63: blend position across 4 waves
  waveSpeed: number;         // 0-63: morph rate
  volume: number;            // 0-64
  arpTable: number[];        // 8 entries: semitone offsets
  arpSpeed: number;          // 0-15
  vibSpeed: number;          // 0-63
  vibDepth: number;          // 0-63
  // Embedded waveform bytes extracted from DM file (128 bytes, signed int8)
  waveformData?: Uint8Array;
  // V2 optional PCM layer
  pcmData?: Uint8Array;
  loopStart?: number;
  loopLength?: number;
}

export const DEFAULT_DIGMUG: DigMugConfig = {
  wavetable: [0, 2, 4, 6],
  waveBlend: 0,
  waveSpeed: 0,
  volume: 64,
  arpTable: new Array(8).fill(0),
  arpSpeed: 0,
  vibSpeed: 0,
  vibDepth: 0,
};

/**
 * Future Composer 1.3/1.4 instrument configuration.
 * 47 built-in waveforms + synth macro sequencer + ADSR + vibrato + arpeggio.
 */
export interface FCConfig {
  waveNumber: number;        // 0-46: initial waveform (0=saw, 1=sq, 2=tri, 3=noise, 4-46=composite)
  synthTable: Array<{        // 16 synth macro steps
    waveNum: number;         // 0-46: waveform for this step
    transposition: number;   // semitone offset
    effect: number;          // effect code (0=none, 1=slide, 2=vibrato, etc.)
  }>;
  synthSpeed: number;        // 0-15: ticks per synth macro step
  atkLength: number;         // 0-255: attack length in ticks
  atkVolume: number;         // 0-64: attack peak volume
  decLength: number;         // 0-255: decay length in ticks
  decVolume: number;         // 0-64: decay end volume (= sustain level)
  sustVolume: number;        // 0-64: sustain volume
  relLength: number;         // 0-255: release length in ticks
  vibDelay: number;          // 0-255: ticks before vibrato starts
  vibSpeed: number;          // 0-63
  vibDepth: number;          // 0-63
  arpTable: number[];        // 16 entries: semitone offsets
}

export const DEFAULT_FC: FCConfig = {
  waveNumber: 0,
  synthTable: Array.from({ length: 16 }, () => ({ waveNum: 0, transposition: 0, effect: 0 })),
  synthSpeed: 1,
  atkLength: 4,
  atkVolume: 64,
  decLength: 8,
  decVolume: 32,
  sustVolume: 32,
  relLength: 8,
  vibDelay: 0,
  vibSpeed: 0,
  vibDepth: 0,
  arpTable: new Array(16).fill(0),
};

/**
 * Fred Editor instrument configuration (real format — PWM synthesis).
 *
 * Fred Editor has three instrument types:
 *   0 = Regular PCM sample  → handled by Sampler (no FredConfig needed)
 *   1 = PWM (pulse-width-modulation square wave) → FredSynth
 *   2 = Wavetable blend     → Sampler approximation for now
 *
 * This config covers type 1. The WASM synth generates a square wave with
 * oscillating pulse width driven by the pulse parameters below.
 *
 * Binary blob layout for fred_load_instrument():
 *   [0]       envelopeVol   (0-64)
 *   [1]       attackSpeed   (ticks per volume step)
 *   [2]       attackVol     (0-64 peak attack volume)
 *   [3]       decaySpeed    (ticks per volume step)
 *   [4]       decayVol      (0-64 sustain level)
 *   [5]       sustainTime   (ticks to hold)
 *   [6]       releaseSpeed  (ticks per volume step)
 *   [7]       releaseVol    (0-64 floor)
 *   [8]       vibratoDelay  (ticks)
 *   [9]       vibratoSpeed  (ticks per LFO step)
 *   [10]      vibratoDepth  (1/64th semitone units)
 *   [11]      arpeggioLimit (active entries in table)
 *   [12]      arpeggioSpeed (ticks per arp step)
 *   [13]      pulseRateNeg  (signed int8 — decrease rate per step)
 *   [14]      pulseRatePos  (unsigned — increase rate per step)
 *   [15]      pulseSpeed    (ticks per PWM modulation step)
 *   [16]      pulsePosL     (lower bound of pulse width, 0-64)
 *   [17]      pulsePosH     (upper bound of pulse width, 0-64)
 *   [18]      pulseDelay    (ticks before modulation starts)
 *   [19..34]  arpeggio[16]  (signed bytes: semitone offsets)
 *   [35..36]  relative      (uint16 LE — period multiplier / 1024)
 */
export interface FredConfig {
  // ADSR envelope
  envelopeVol:   number;   // initial volume (0-64)
  attackSpeed:   number;   // ticks per volume step
  attackVol:     number;   // peak attack volume (0-64)
  decaySpeed:    number;   // ticks per step
  decayVol:      number;   // sustain level (0-64)
  sustainTime:   number;   // ticks to hold at decayVol
  releaseSpeed:  number;   // ticks per step
  releaseVol:    number;   // floor (0-64)

  // Vibrato
  vibratoDelay: number;    // ticks before starting
  vibratoSpeed: number;    // ticks per LFO step
  vibratoDepth: number;    // amplitude in 1/64th semitone units

  // Arpeggio
  arpeggio:      number[]; // 16 signed semitone offsets
  arpeggioLimit: number;   // active entries
  arpeggioSpeed: number;   // ticks per step

  // PWM parameters
  pulseRateNeg:  number;   // decrease per step (signed)
  pulseRatePos:  number;   // increase per step
  pulseSpeed:    number;   // ticks per PWM step
  pulsePosL:     number;   // lower bound (0-64)
  pulsePosH:     number;   // upper bound (0-64)
  pulseDelay:    number;   // ticks before modulation starts

  // Relative tuning
  relative:      number;   // period multiplier / 1024 (1024 = no shift)
}

export const DEFAULT_FRED: FredConfig = {
  envelopeVol:   64,
  attackSpeed:   1,
  attackVol:     64,
  decaySpeed:    1,
  decayVol:      32,
  sustainTime:   16,
  releaseSpeed:  1,
  releaseVol:    0,
  vibratoDelay:  0,
  vibratoSpeed:  0,
  vibratoDepth:  0,
  arpeggio:      new Array(16).fill(0),
  arpeggioLimit: 0,
  arpeggioSpeed: 1,
  pulseRateNeg:  -1,
  pulseRatePos:  1,
  pulseSpeed:    4,
  pulsePosL:     16,
  pulsePosH:     48,
  pulseDelay:    0,
  relative:      1024,
};

/**
 * TFMX (Jochen Hippel) instrument configuration.
 *
 * Stores the raw binary data needed for real-time WASM synthesis via TFMXSynth.
 * The WASM module builds a minimal TFMX module from these blobs on each note_on.
 *
 * - sndSeqsCount:  total number of SndModSeqs in the original file
 * - sndModSeqData: all SndModSeqs concatenated (sndSeqsCount × 64 bytes)
 * - volModSeqData: this instrument's VolModSeq (64 bytes)
 * - sampleCount:   number of PCM sample slots in the bank
 * - sampleHeaders: raw sample header bytes (sampleCount × 30 bytes)
 * - sampleData:    raw 8-bit signed PCM bank (all samples concatenated)
 */
export interface TFMXConfig {
  sndSeqsCount:  number;
  sndModSeqData: Uint8Array;  // sndSeqsCount × 64 bytes
  volModSeqData: Uint8Array;  // 64 bytes — this instrument's VolModSeq
  sampleCount:   number;
  sampleHeaders: Uint8Array;  // sampleCount × 30 bytes
  sampleData:    Uint8Array;  // raw PCM bank
}

export const DEFAULT_TFMX: TFMXConfig = {
  sndSeqsCount:  1,
  sndModSeqData: new Uint8Array(64),
  volModSeqData: new Uint8Array(64),
  sampleCount:   0,
  sampleHeaders: new Uint8Array(0),
  sampleData:    new Uint8Array(0),
};

/**
 * Jochen Hippel CoSo instrument configuration.
 *
 * Pure synthesis format: frequency and volume sequences stepped each tick at
 * 50 Hz (Amiga timer), with optional vibrato and portamento.
 *
 * - fseq: frequency sequence (signed bytes). Normal values are transpose
 *   offsets added to the base note period. Special codes:
 *     -32 = loop (next byte = target position & 63)
 *     -31 = end (reset to start)
 *     -24 = delay (next byte = tick count)
 * - vseq: volume sequence (signed bytes). Normal values are 0-63.
 *   Special codes:
 *     -32 = loop (next byte = target position & 63)
 *     -24 = sustain (next byte = tick count)
 *     -31..-25 = end/stop (hold current volume)
 * - volSpeed: ticks between each vseq step (≥1)
 * - vibSpeed: vibrato LFO step per tick (signed: negative toggles direction)
 * - vibDepth: vibrato depth in period units
 * - vibDelay: ticks before vibrato activates
 */
export interface HippelCoSoConfig {
  fseq:     number[];   // frequency sequence (signed bytes)
  vseq:     number[];   // volume sequence (signed bytes, 0-63)
  volSpeed: number;     // ticks per vseq step (1-16)
  vibSpeed: number;     // vibrato speed (signed, -128..127)
  vibDepth: number;     // vibrato depth (0-255)
  vibDelay: number;     // vibrato delay ticks (0-255)
}

export const DEFAULT_HIPPEL_COSO: HippelCoSoConfig = {
  fseq:     [0],
  vseq:     [32, -31],
  volSpeed: 1,
  vibSpeed: 0,
  vibDepth: 0,
  vibDelay: 0,
};

/**
 * Rob Hubbard synthesizer configuration.
 *
 * Rob Hubbard's Amiga music system uses PCM sample playback with:
 *   - period-based frequency (Amiga Paula-style)
 *   - per-instrument relative tuning (3579545 / freqHz)
 *   - vibrato driven by a shared table, indexed per instrument
 *   - wobble oscillator: synthPos bouncing between loPos and hiPos
 *     sets sample bytes to 60 to create waveform morphing
 *   - portamento: signed period delta each tick
 */
export interface RobHubbardConfig {
  sampleLen: number;      // PCM data length in bytes
  loopOffset: number;     // loop start offset from sample start; <0 = no loop
  sampleVolume: number;   // Amiga volume 0-64
  relative: number;       // integer: 3579545 / freqHz (for period scaling)
  divider: number;        // vibrato depth divisor; 0 = no vibrato
  vibratoIdx: number;     // starting index within vibTable
  hiPos: number;          // wobble upper bound; 0 = no wobble
  loPos: number;          // wobble lower bound
  vibTable: number[];     // vibrato wave table (signed int8 values)
  sampleData: number[];   // PCM data (signed int8 values)
}

export const DEFAULT_ROB_HUBBARD: RobHubbardConfig = {
  sampleLen: 0,
  loopOffset: -1,
  sampleVolume: 64,
  relative: 256,
  divider: 0,
  vibratoIdx: 0,
  hiPos: 0,
  loPos: 0,
  vibTable: [],
  sampleData: [],
};

// ── SidMon 1.0 ──────────────────────────────────────────────────────────────

/**
 * SidMon 1.0 synthesizer configuration.
 *
 * SidMon 1.0 uses a wavetable oscillator with:
 *   - 16-step arpeggio table cycled each tick (50Hz)
 *   - ADSR envelope: attack→decay→sustain countdown→release
 *   - Phase shift (period LFO) using a 32-byte phaseWave
 *   - Pitch fall: signed byte accumulated each tick
 *   - 32-byte mainWave PCM wavetable for audio output
 *   - Finetune: pre-multiplied (finetune_0_15 * 67)
 */
export interface SidMon1Config {
  arpeggio?: number[];    // 16 entries, 0-255
  attackSpeed?: number;   // 0-255
  attackMax?: number;     // 0-64
  decaySpeed?: number;    // 0-255
  decayMin?: number;      // 0-64
  sustain?: number;       // 0-255 (countdown ticks)
  releaseSpeed?: number;  // 0-255
  releaseMin?: number;    // 0-64
  phaseShift?: number;    // 0-255 (0 = disabled)
  phaseSpeed?: number;    // 0-255
  finetune?: number;      // 0-1005 (finetune_0_15 * 67)
  pitchFall?: number;     // signed -128..127
  mainWave?: number[];    // 32 signed bytes (-128..127)
  phaseWave?: number[];   // 32 signed bytes (-128..127)
}

export const DEFAULT_SIDMON1: SidMon1Config = {
  arpeggio: new Array(16).fill(0),
  attackSpeed: 8,
  attackMax: 64,
  decaySpeed: 4,
  decayMin: 32,
  sustain: 0,
  releaseSpeed: 4,
  releaseMin: 0,
  phaseShift: 0,
  phaseSpeed: 0,
  finetune: 0,
  pitchFall: 0,
  mainWave: [
    127, 100, 71, 41, 9, -22, -53, -82, -108, -127, -127, -127,
    -108, -82, -53, -22, 9, 41, 71, 100, 127, 100, 71, 41,
    9, -22, -53, -82, -108, -127, -127, -127,
  ],
  phaseWave: new Array(32).fill(0),
};

/**
 * OctaMED SynthInstr Configuration
 * Real-time oscillator driven by vol/wf command tables, up to 10 waveforms.
 */
export interface OctaMEDConfig {
  volume: number;         // 0-64
  voltblSpeed: number;    // vol-table execute rate (0=every output block)
  wfSpeed: number;        // wf-table execute rate
  vibratoSpeed: number;   // 0-255
  loopStart: number;      // bytes (reference only)
  loopLen: number;        // bytes (reference only)
  voltbl: Uint8Array;     // 128 bytes vol command table
  wftbl: Uint8Array;      // 128 bytes wf command table
  waveforms: Int8Array[]; // 1-10 × 256 signed bytes
}

export const DEFAULT_OCTAMED: OctaMEDConfig = {
  volume: 64,
  voltblSpeed: 0,
  wfSpeed: 0,
  vibratoSpeed: 0,
  loopStart: 0,
  loopLen: 0,
  voltbl: new Uint8Array(128).fill(0xFF),   // single FF = loop at current volume
  wftbl: new Uint8Array(128).fill(0xFF),    // single FF = loop on waveform 0
  waveforms: [new Int8Array(256)],          // one silent waveform
};

/**
 * David Whittaker synthesizer configuration.
 *
 * David Whittaker is an Amiga music format using per-instrument:
 *   - frqseq: frequency sequence (signed-byte offsets added to note index)
 *     -128 = loop marker (next byte = loop target & 0x7f)
 *   - volseq: volume sequence (0-64 = volume level)
 *     -128 = loop marker (next byte = loop target & 0x7f)
 *   - relative: tuning multiplier (~8364 for standard A-440 tuning)
 *     relative = 3579545 / tuning_period (e.g., 428 → 8364)
 *   - Vibrato: triangle LFO via vibratoSpeed/vibratoDepth
 */
export interface DavidWhittakerConfig {
  defaultVolume?: number;   // 0-64
  relative?: number;        // tuning multiplier (~8364 for standard A-440)
  vibratoSpeed?: number;    // 0-255
  vibratoDepth?: number;    // 0-255
  volseq?: number[];        // volume sequence bytes (0-64 or -128 for loop)
  frqseq?: number[];        // frequency sequence bytes (signed, semitone offsets)
}

export const DEFAULT_DAVID_WHITTAKER: DavidWhittakerConfig = {
  defaultVolume: 64,
  relative: 8364,           // 3579545 / 428 — standard A-440 tuning
  vibratoSpeed: 0,
  vibratoDepth: 0,
  volseq: [64, -128, 0],   // constant volume, loop at 0
  frqseq: [-128, 0],        // static pitch, loop at 0
};

/**
 * SunVox WASM patch configuration.
 * Stores a raw .sunsynth (or .sunvox) binary and the user-visible display name.
 * controlValues caches the most recently read per-control values so the UI can
 * render knobs without repeatedly querying the WASM layer.
 */
export interface SunVoxConfig {
  /**
   * Raw .sunsynth binary as loaded from disk.
   * Persisted via IndexedDB structured clone (ArrayBuffer survives round-trips).
   * NOTE: Not preserved in JSON file export — patches must be re-imported after
   * loading a project from a .json export file.
   */
  patchData: ArrayBuffer | null;
  /** Display name of the loaded patch (from module name in WASM) */
  patchName: string;
  /**
   * Runtime cache of the most recently set control values, keyed by ctlId string.
   * Populated by SunVoxControls UI; not guaranteed to reflect the WASM engine state.
   * Stale values on project load are harmless — WASM re-initializes from patchData.
   */
  controlValues: Record<string, number>;
}

export const DEFAULT_SUNVOX: SunVoxConfig = {
  patchData: null,
  patchName: '',
  controlValues: {},
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
  | 'OomekAggressorDF'
  | 'MadBrain4FM2F'
  | 'MadBrainDynamite6'
  | 'MakkM3'
  | 'MakkM4'
  | 'CyanPhaseDTMF'
  | 'ElenzilFrequencyBomb';

export interface BuzzmachineConfig {
  machineType: BuzzmachineType;
  parameters: Record<number, number>;  // Parameter index -> value
  customWaves?: Record<number, number[]>; // Custom wavetables (index -> samples)
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
  dt2?: number;      // Detune 2 / Coarse tune 0-3 (OPM/OPZ)
  rs?: number;       // Rate Scaling 0-3

  // Modulation flags
  am?: boolean;      // Amplitude Modulation enable

  // OPL-specific
  ksr?: boolean;     // Key Scale Rate
  ksl?: number;      // Key Scale Level 0-3
  sus?: boolean;     // Sustain flag
  vib?: boolean;     // Vibrato flag
  ws?: number;       // Waveform Select 0-7

  // SSG-EG (OPN family)
  ssg?: number;      // SSG-EG mode 0-15

  // OPZ-specific (added from Furnace) - optional for backward compatibility
  dam?: number;      // AM depth 0-7
  dvb?: number;      // Vibrato depth 0-7
  egt?: boolean;     // Fixed frequency mode
  kvs?: number;      // Key velocity sensitivity 0-3
}

export interface FurnaceMacro {
  code?: number;     // Macro slot (0=vol, 1=arp, 2=duty, 3=wave, 4=pitch, etc.)
  type: number;      // FurnaceMacroType / word size flags
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
  dutyIsAbs?: boolean;   // Duty is absolute
  filterIsAbs?: boolean; // Filter cutoff is absolute
  noTest?: boolean;      // Disable test bit
  resetDuty?: boolean;   // Reset duty cycle on note-on
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

  // Furnace file metadata
  furnaceIndex?: number;  // Original instrument index in the Furnace file (0-based)
  rawBinaryData?: Uint8Array;  // Original binary instrument data for upload to WASM

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
  kickFreq?: number;     // OPL drum kick frequency
  snareHatFreq?: number; // OPL drum snare/hi-hat frequency
  tomTopFreq?: number;   // OPL drum tom/top frequency

  // Operator configurations
  operators: FurnaceOperatorConfig[];

  // Macro system
  macros: FurnaceMacro[];
  opMacros: FurnaceOpMacros[];
  opMacroArrays?: FurnaceMacro[][];  // Raw operator macros [4 operators][N macros each] — indexed by Furnace code 0-19

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

  // Simple chip-specific fields (from feature blocks)
  x1BankSlot?: number;     // X1-010 bank slot
  powerNoiseOctave?: number; // PowerNoise octave

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
    loopMode?: number;  // 0=forward, 1=backward, 2=ping-pong
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

// ============================================================================
// JUCE WASM Synth Configurations
// ============================================================================

/**
 * DX7 Operator Configuration
 */
export interface DexedOperatorConfig {
  level?: number;           // 0-99 output level
  coarse?: number;          // 0-31 coarse frequency ratio
  fine?: number;            // 0-99 fine frequency
  detune?: number;          // 0-14 (7 = center)
  mode?: 'ratio' | 'fixed' | number; // Frequency mode
  egRates?: [number, number, number, number];   // 0-99 for R1-R4
  egLevels?: [number, number, number, number];  // 0-99 for L1-L4
  breakPoint?: number;      // 0-99 (A-1 to C8)
  leftDepth?: number;       // 0-99 keyboard scaling
  rightDepth?: number;      // 0-99 keyboard scaling
  leftCurve?: number;       // 0-3
  rightCurve?: number;      // 0-3
  rateScaling?: number;     // 0-7
  ampModSens?: number;      // 0-3
  velocitySens?: number;    // 0-7
}

/**
 * Dexed (DX7) Synthesizer Configuration
 */
export interface DexedConfig {
  // FM Algorithm (0-31)
  algorithm: number;
  // Operator self-feedback (0-7)
  feedback: number;
  // Oscillator key sync (0-1)
  oscSync: boolean;

  // Operator configurations (6 operators)
  operators: DexedOperatorConfig[];

  // Pitch envelope
  pitchEgRates: [number, number, number, number];   // 0-99
  pitchEgLevels: [number, number, number, number];  // 0-99

  // LFO parameters
  lfoSpeed: number;        // 0-99
  lfoDelay: number;        // 0-99
  lfoPitchModDepth: number; // 0-99
  lfoAmpModDepth: number;   // 0-99
  lfoSync: boolean;
  lfoWave: 'triangle' | 'sawDown' | 'sawUp' | 'square' | 'sine' | 'sampleHold' | number;
  lfoPitchModSens: number; // 0-7

  // Transpose (-24 to +24)
  transpose: number;

  // Voice name (10 chars max)
  name?: string;
}

/**
 * Default Dexed (INIT VOICE) configuration
 */
export const DEFAULT_DEXED: DexedConfig = {
  algorithm: 0,
  feedback: 0,
  oscSync: true,
  operators: Array.from({ length: 6 }, () => ({
    level: 99,
    coarse: 1,
    fine: 0,
    detune: 7,
    mode: 'ratio' as const,
    egRates: [99, 99, 99, 99] as [number, number, number, number],
    egLevels: [99, 99, 99, 0] as [number, number, number, number],
    breakPoint: 0,
    leftDepth: 0,
    rightDepth: 0,
    leftCurve: 0,
    rightCurve: 0,
    rateScaling: 0,
    ampModSens: 0,
    velocitySens: 0,
  })),
  pitchEgRates: [99, 99, 99, 99],
  pitchEgLevels: [50, 50, 50, 50],
  lfoSpeed: 35,
  lfoDelay: 0,
  lfoPitchModDepth: 0,
  lfoAmpModDepth: 0,
  lfoSync: false,
  lfoWave: 'triangle',
  lfoPitchModSens: 0,
  transpose: 0,
  name: 'INIT VOICE',
};

/**
 * OB-Xd (Oberheim) Synthesizer Configuration
 */
export interface OBXdConfig {
  // Oscillator 1
  osc1Waveform: 'saw' | 'pulse' | 'triangle' | 'noise' | number;
  osc1Octave: number;        // -2 to +2
  osc1Detune: number;        // -1 to +1 semitones
  osc1PulseWidth: number;    // 0-1
  osc1Level: number;         // 0-1

  // Oscillator 2
  osc2Waveform: 'saw' | 'pulse' | 'triangle' | 'noise' | number;
  osc2Octave: number;
  osc2Detune: number;
  osc2PulseWidth: number;
  osc2Level: number;

  // Oscillator modifiers
  oscSync: boolean;
  oscXor: boolean;           // Ring modulation style

  // Filter
  filterCutoff: number;      // 0-1 (maps to 20-20000 Hz)
  filterResonance: number;   // 0-1
  filterType: 'lp24' | 'lp12' | 'hp' | 'bp' | 'notch' | number;
  filterEnvAmount: number;   // 0-1
  filterKeyTrack: number;    // 0-1
  filterVelocity: number;    // 0-1

  // Filter envelope (ADSR)
  filterAttack: number;      // 0-1 (seconds-ish)
  filterDecay: number;
  filterSustain: number;
  filterRelease: number;

  // Amp envelope (ADSR)
  ampAttack: number;
  ampDecay: number;
  ampSustain: number;
  ampRelease: number;

  // LFO
  lfoRate: number;           // 0-1 (maps to 0.1-20 Hz)
  lfoWaveform: 'sine' | 'triangle' | 'saw' | 'square' | 'sampleHold' | number;
  lfoDelay: number;          // 0-1
  lfoOscAmount: number;      // 0-1
  lfoFilterAmount: number;   // 0-1
  lfoAmpAmount: number;      // 0-1
  lfoPwAmount: number;       // 0-1

  // Global
  masterVolume: number;      // 0-1
  voices: number;            // 1-8
  unison: boolean;
  unisonDetune: number;      // 0-1
  portamento: number;        // 0-1
  panSpread: number;         // 0-1
  velocitySensitivity: number; // 0-1

  // Extended
  noiseLevel: number;        // 0-1
  subOscLevel: number;       // 0-1
  subOscOctave: -1 | -2 | number;
  drift: number;             // 0-1 analog drift
}

/**
 * Default OB-Xd configuration
 */
export const DEFAULT_OBXD: OBXdConfig = {
  osc1Waveform: 'saw',
  osc1Octave: 0,
  osc1Detune: 0,
  osc1PulseWidth: 0.5,
  osc1Level: 1,

  osc2Waveform: 'saw',
  osc2Octave: 0,
  osc2Detune: 0.1,
  osc2PulseWidth: 0.5,
  osc2Level: 0.7,

  oscSync: false,
  oscXor: false,

  filterCutoff: 0.7,
  filterResonance: 0.3,
  filterType: 'lp24',
  filterEnvAmount: 0.5,
  filterKeyTrack: 0,
  filterVelocity: 0.3,

  filterAttack: 0.01,
  filterDecay: 0.3,
  filterSustain: 0.3,
  filterRelease: 0.3,

  ampAttack: 0.01,
  ampDecay: 0.2,
  ampSustain: 0.7,
  ampRelease: 0.3,

  lfoRate: 0.2,
  lfoWaveform: 'sine',
  lfoDelay: 0,
  lfoOscAmount: 0,
  lfoFilterAmount: 0,
  lfoAmpAmount: 0,
  lfoPwAmount: 0,

  masterVolume: 0.7,
  voices: 8,
  unison: false,
  unisonDetune: 0.1,
  portamento: 0,
  panSpread: 0.3,
  velocitySensitivity: 0.5,

  noiseLevel: 0,
  subOscLevel: 0,
  subOscOctave: -1,
  drift: 0.02,
};

// ===== RdPiano (Roland SA-synthesis Digital Piano) =====

export interface RdPianoConfig {
  patch: number;           // 0-15 patch index
  chorusEnabled: boolean;  // Space-D BBD chorus
  chorusRate: number;      // 0-14
  chorusDepth: number;     // 0-14
  efxEnabled: boolean;     // Phaser EFX toggle
  phaserRate: number;      // 0.0-1.0
  phaserDepth: number;     // 0.0-1.0
  tremoloEnabled: boolean;
  tremoloRate: number;     // 0-14
  tremoloDepth: number;    // 0-14
  volume: number;          // 0.0-1.0
}

export const DEFAULT_RDPIANO: RdPianoConfig = {
  patch: 0,
  chorusEnabled: true,
  chorusRate: 5,
  chorusDepth: 14,
  efxEnabled: false,
  phaserRate: 0.4,
  phaserDepth: 0.8,
  tremoloEnabled: false,
  tremoloRate: 6,
  tremoloDepth: 6,
  volume: 1.0,
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

export interface InstrumentMetadata {
  importedFrom?: 'MOD' | 'XM' | 'IT' | 'S3M' | 'FUR';
  originalEnvelope?: EnvelopePoints; // Preserved point-based volume envelope for FT2 processing
  panningEnvelope?: EnvelopePoints; // Preserved panning envelope for FT2 processing
  autoVibrato?: AutoVibrato; // Preserved auto-vibrato settings
  fadeout?: number; // XM fadeout speed (0-4095), applied per tick on key-off
  sampleMap?: number[]; // XM note-to-sample mapping (96 entries, note 0-95 → sample index)
  multiSamples?: Array<{
    sample: SampleConfig;
    finetune: number;
    relativeNote: number;
    defaultVolume: number;
    panning?: number;
  }>; // All samples for this XM instrument (indexed by sampleMap values)
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
    relativeNote?: number; // XM sample relative note (-96 to +95 semitones)
    defaultVolume?: number; // Sample's default volume (0-64) for channel init
    panning?: number; // Sample default panning (0-255, 128 = center)
    fadeout?: number; // Fadeout rate
  };
  envelopes?: Record<number, {
    volumeEnvelope?: EnvelopePoints;
    panningEnvelope?: EnvelopePoints;
    pitchEnvelope?: EnvelopePoints;
    fadeout?: number;
  }>;
  preservedSynth?: {
    synthType: SynthType;
    config: Partial<InstrumentConfig>;
    bakeType?: 'lite' | 'pro';
  };
  /** Optional display label override shown in the instrument list badge (e.g. "ML Sine", "ML Saw") */
  displayType?: string;
  /** MusicLine Editor waveform synth config (smplType > 0) — triggers synth editor instead of sample editor */
  mlSynthConfig?: { waveformType: number; volume: number };
}

// Import beat slicer types
import type { BeatSlice, BeatSliceConfig } from './beatSlicer';
import type { EnvelopePoints, AutoVibrato } from './tracker';

export interface SampleConfig {
  audioBuffer?: ArrayBuffer;
  url: string;
  multiMap?: Record<string, string>; // Note (e.g. "C4") -> URL map for multi-sampling
  baseNote: string; // "C-4"
  detune: number; // -100 to +100 cents

  // Regular loop (plays after note-off if sustainLoop is enabled)
  loop: boolean;
  loopType?: 'off' | 'forward' | 'pingpong'; // Loop mode
  loopStart: number; // Sample frame index
  loopEnd: number; // Sample frame index

  // Sustain loop (IT-style: plays while note is held, then switches to regular loop)
  sustainLoop?: boolean;
  sustainLoopType?: 'off' | 'forward' | 'pingpong';
  sustainLoopStart?: number; // Sample frame index
  sustainLoopEnd?: number; // Sample frame index

  sampleRate?: number; // For converting loop points to seconds (default 8363 Hz for MOD)
  reverse: boolean;
  playbackRate: number; // 0.25-4x

  // Beat slicer data
  slices?: BeatSlice[];
  sliceConfig?: BeatSliceConfig;

  // Reference-based slicing (memory optimization)
  // When set, this sample is a slice of another instrument's buffer
  sourceInstrumentId?: number; // Reference to the original instrument
  sliceStart?: number; // Start frame in the source buffer
  sliceEnd?: number; // End frame in the source buffer

  /** Amiga chip RAM address for UADE enhanced-mode write-back. Present only on
   *  instruments extracted by UADEParser's enhanced scan. */
  uadeSamplePtr?: number;
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
 * Commodore SAM Speech Configuration
 */
export interface SamConfig {
  text: string;
  pitch: number;    // 0-255 (default 64)
  speed: number;    // 0-255 (default 72)
  mouth: number;    // 0-255 (default 128)
  throat: number;   // 0-255 (default 128)
  singmode: boolean;
  phonetic: boolean;
  vowelSequence?: string[];     // e.g. ['IY', 'AH', 'OO'] — per-note vowel cycling
  vowelLoopSingle?: boolean;    // true = sustain/loop vowel while note held
}

export const DEFAULT_SAM: SamConfig = {
  text: 'COMMODORE SIXTY FOUR',
  pitch: 64,
  speed: 72,
  mouth: 128,
  throat: 128,
  singmode: true,
  phonetic: false,
  vowelSequence: [],
  vowelLoopSingle: true,
};

/**
 * Web Audio Module (WAM) Configuration
 */
export interface WAMConfig {
  moduleUrl: string;              // URL to the WAM entry point (e.g. index.js)
  pluginState: Record<string, unknown> | null;  // Serialized state of the plugin
  pluginStateVersion?: number;    // Tracks state schema for staleness detection
  pluginStateTimestamp?: number;  // When state was last saved
  parameterValues?: Record<string, number>;  // Individual parameter overrides
}

export const DEFAULT_WAM: WAMConfig = {
  moduleUrl: '',
  pluginState: null,
  pluginStateVersion: 1,
  pluginStateTimestamp: 0,
};
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

/**
 * V2 Speech Configuration (Ronan/Lisa)
 */
export interface V2SpeechConfig {
  text: string;
  speed: number;
  pitch: number;
  formantShift: number;
  singMode: boolean; // Enables MIDI note-to-pitch tracking
  vowelSequence?: string[];     // e.g. ['IY', 'AH', 'OO'] — per-note vowel cycling
  vowelLoopSingle?: boolean;    // true = sustain/loop vowel while note held
}

export const DEFAULT_V2_SPEECH: V2SpeechConfig = {
  text: '!kwIH_k !fAA_ks',
  speed: 64,
  pitch: 64,
  formantShift: 64,
  singMode: true,
  vowelSequence: [],
  vowelLoopSingle: true,
};

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
 * DeepPartial Helper
 */
export type DeepPartial<T> = T extends Array<infer U>
  ? Array<DeepPartial<U>>
  : T extends object
  ? { [P in keyof T]?: DeepPartial<T[P]> }
  : T;

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
  harmonicSynth?: HarmonicSynthConfig;
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
  v2?: V2Config;
  v2Speech?: V2SpeechConfig;
  sam?: SamConfig;
  synare?: SynareConfig;
  wam?: WAMConfig;
  // MAME synths
  mame?: MAMEConfig;
  // Buzzmachines
  buzzmachine?: BuzzmachineConfig;
  // JUCE WASM Synths
  dexed?: DexedConfig;
  obxd?: OBXdConfig;
  rdpiano?: RdPianoConfig;
  // Drumkit/Keymap (multi-sample)
  drumKit?: DrumKitConfig;
  // Module playback (libopenmpt)
  chiptuneModule?: ChiptuneModuleConfig;
  // HivelyTracker / AHX instrument
  hively?: HivelyConfig;
  // UADE exotic Amiga format (playback-only)
  uade?: UADEConfig;
  // UADE Format-Specific Synths (native DSP via WASM)
  soundMon?: SoundMonConfig;
  sidMon?: SidMonConfig;
  digMug?: DigMugConfig;
  fc?: FCConfig;
  fred?: FredConfig;
  tfmx?: TFMXConfig;
  hippelCoso?: HippelCoSoConfig;
  robHubbard?: RobHubbardConfig;
  sidmon1?: SidMon1Config;
  octamed?: OctaMEDConfig;
  davidWhittaker?: DavidWhittakerConfig;
  symphonie?: import('@/engine/symphonie/SymphoniePlaybackData').SymphoniePlaybackData;
  // SunVox WASM patch
  sunvox?: SunVoxConfig;
  // Modular Synthesis
  modularSynth?: import('./modular').ModularPatchConfig;
  // SuperCollider scripted synthesis
  superCollider?: SuperColliderConfig;
  // Sampler config
  sample?: SampleConfig;
  effects: EffectConfig[];
  volume: number; // -60 to 0 dB
  pan: number; // -100 to 100
  monophonic?: boolean; // If true, force monophonic playback (one voice at a time)
  isLive?: boolean; // If true, bypass lookahead buffer for instant triggering during playback
  lfo?: LFOConfig; // Global LFO for filter/pitch/volume modulation
  parameters?: Record<string, unknown>; // Additional synth-specific parameters (e.g., sample URLs)
  metadata?: InstrumentMetadata; // Import metadata and transformation history
  rawBinaryData?: Uint8Array;   // Raw binary instrument data for WASM upload (e.g. native .fur format)
}

export interface InstrumentPreset {
  id: string;
  name: string;
  category: 'Bass' | 'Lead' | 'Pad' | 'Drum' | 'FX';
  tags: string[];
  author?: string;
  config: DeepPartial<Omit<InstrumentConfig, 'id'>>;
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
  engineType: 'db303',  // Use db303 engine by default for better sound
  volume: 1.0,          // Reference never calls setVolume — WASM default is 1.0.
                        // Lower values starve internal nonlinearities, making sound tame.
  oscillator: {
    type: 'sawtooth',   // db303 default: waveform=0 (sawtooth)
    pulseWidth: 0,      // 0 = 50% duty cycle (true square). Reference default is 1 (99% thin pulse)
                        // but we use 0 so SAW/SQR toggle produces a proper square wave.
    subOscGain: 0,      // db303 default: subOscGain=0
    subOscBlend: 1,     // db303 default: subOscBlend=1 (100% blend)
  },
  filter: {
    cutoff: 0.5,        // db303 default: cutoff=0.5 (normalized 0-1)
    resonance: 0.5,     // db303 default: resonance=0.5 (normalized 0-1)
  },
  filterEnvelope: {
    envMod: 0.5,        // db303 default: envMod=0.5 (normalized 0-1)
    decay: 0.5,         // default-preset.xml: 0.5 (normalized 0-1)
  },
  accent: {
    amount: 0.5,        // db303 default: accent=0.5 (normalized 0-1)
  },
  slide: {
    time: 0.17,         // db303 default: slideTime=0.17 (normalized 0-1)
    mode: 'exponential',
  },
  overdrive: {
    amount: 0,
  },
  // Devil Fish parameters — always enabled (matching reference db303.pages.dev).
  // The WASM has no "DF off" mode — it always uses these params internally.
  // Source of truth: db303-local/default-preset.xml (loaded by reference app on init).
  // Conversion: JC303.cpp::setParameter() converts 0-1 → real values inside WASM.
  devilFish: {
    enabled: true,
    normalDecay: 0.164,          // default-preset.xml: 0.164
    accentDecay: 0.006,          // default-preset.xml: 0.006 — CRITICAL for acid screams
    softAttack: 0,               // default-preset.xml: 0
    accentSoftAttack: 0.1,       // default-preset.xml: 0.1 (punch on accented notes)
    passbandCompensation: 0.09,  // default-preset.xml: 0.09. App inverts → WASM gets 1-0.09=0.91
    resTracking: 0.257,           // default-preset.xml: 0.743 (inverted on read: 1-0.743=0.257). App inverts → WASM gets 0.743
    filterInputDrive: 0.169,     // default-preset.xml: 0.169 (subtle warmth/drive)
    filterSelect: 0,             // 0=DiodeLadder (only valid: 0 or 5=Korg). Reference init uses 0.
    diodeCharacter: 1,           // default-preset.xml: 1 (nonlinear character)
    duffingAmount: 0.03,         // default-preset.xml: 0.03 (subtle saturation)
    filterFmDepth: 0,            // db303 app default: filterFmDepth=0
    lpBpMix: 0,                  // db303 app default: lpBpMix=0
    filterTracking: 0,           // db303 app default: filterTracking=0
    stageNLAmount: 0,            // db303 app default: stageNLAmount=0
    ensembleAmount: 0,           // db303 app default: ensembleAmount=0
    korgEnabled: false,          // Korg filter params off by default
    oversamplingOrder: 2,        // db303 app default: oversamplingOrder=2 (4x)
    // Required defaults for other Devil Fish parameters
    accentSweepEnabled: true,
    sweepSpeed: 'normal',
    highResonance: false,
    muffler: 'off',
    vegDecay: 0.5,               // db303 default: vegDecay=0.5
    vegSustain: 0,
  },
  lfo: {
    enabled: false,     // LFO off by default (not standard 303)
    waveform: 0,        // db303 default: lfoWaveform=0 (triangle)
    rate: 0,            // db303 default: lfoRate=0
    contour: 0,         // db303 default: lfoContour=0
    pitchDepth: 0,      // db303 default: lfoPitchDepth=0
    pwmDepth: 0,        // db303 default: lfoPwmDepth=0
    filterDepth: 0,     // db303 default: lfoFilterDepth=0
    stiffDepth: 0,      // db303 default: lfoStiffDepth=0
  },
  chorus: {
    enabled: false,     // db303 default: chorusMode=0 (off)
    mode: 0,
    mix: 0.5,           // db303 default: chorusMix=0.5
  },
  phaser: {
    enabled: false,     // db303 default: phaserMix=0 (disabled)
    rate: 0.5,          // db303 default: phaserRate=0.5
    depth: 0.7,         // db303 default: phaserWidth=0.7
    feedback: 0,        // db303 default: phaserFeedback=0
    mix: 0,
  },
  delay: {
    enabled: false,     // db303 default: delayMix=0 (disabled)
    time: 3,            // default-preset.xml: 3 (WASM raw 0-16, 16th note subdivisions)
    feedback: 0.3,      // default-preset.xml: 0.3
    tone: 0.5,          // default-preset.xml: 0.5
    mix: 0,
    stereo: 0.5,        // default-preset.xml: 0.5 (spread)
  },
};

export const DEFAULT_SUPERCOLLIDER: SuperColliderConfig = {
  synthDefName: '',
  source: `SynthDef(\\mySynth, { |freq=440, amp=0.5, gate=1|
  var sig = SinOsc.ar(freq) * amp;
  var env = EnvGen.kr(Env.adsr(0.01, 0.1, 0.7, 0.5), gate, doneAction: 2);
  Out.ar(0, (sig * env).dup);
}).add`,
  binary: '',
  params: [],
};
