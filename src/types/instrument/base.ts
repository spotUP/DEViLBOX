/**
 * Instrument Types - Foundation Types
 * Base type aliases, enums, and config interfaces used across all instrument domains.
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
  // C64 SID playback (audio handled by C64SIDEngine, not Furnace)
  | 'C64SID'
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
  | 'DeltaMusic1Synth' // Delta Music 1.0 (4-channel Amiga wavetable + ADSR synthesis)
  | 'DeltaMusic2Synth' // Delta Music 2.0 (4-channel Amiga wavetable + vol/vib table synthesis)
  | 'SonicArrangerSynth' // Sonic Arranger (18-mode wavetable synthesis + ADSR/AMF tables)
  | 'JamCrackerSynth' // JamCracker Pro (transpiled 68k replayer + Paula emulation WASM)
  | 'FuturePlayerSynth' // Future Player (transpiled 68k replayer + Paula emulation WASM)
  // SunVox modular synthesizer
  | 'SunVoxSynth'     // SunVox WASM patch player (.sunsynth / .sunvox)
  // Modular Synthesis
  | 'ModularSynth'    // Modular synthesizer with patch editor
  // SuperCollider scripted synthesis
  | 'SuperCollider';  // SuperCollider SynthDef (scsynth WASM)

export type WaveformType = 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise';

// Extended waveform types for vibrato/tremolo effects (tracker formats)
export type VibratoWaveformType = 'sine' | 'rampDown' | 'rampUp' | 'square' | 'random';

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

export type VowelType = 'A' | 'E' | 'I' | 'O' | 'U';

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

/** Chip RAM location metadata for UADE-based format editing.
 *  Stored on instruments produced by native parsers when loaded via UADE.
 *  All addresses are absolute Amiga chip RAM addresses. */
export interface UADEChipRamInfo {
  /** Chip RAM address where the module binary starts (file byte 0 maps here). */
  moduleBase: number;
  /** Total size of the module binary in bytes (for full export via readMemory). */
  moduleSize: number;
  /** Chip RAM address where this instrument's data block starts.
   *  instrBase = moduleBase + file_offset_of_instrument_entry */
  instrBase: number;
  /** Size of this instrument's data block in bytes. */
  instrSize: number;
  /** Format-specific named section addresses within the module.
   *  e.g. { freqMacros: 0x12340, volMacros: 0x15600, waveData: 0x18000 }
   *  Used by editors to find waveform tables, arpeggio data, etc. */
  sections: Record<string, number>;
}
