/**
 * MIDI Types - Core type definitions for MIDI integration
 */

// ============================================================================
// Device Types
// ============================================================================

export interface MIDIDeviceInfo {
  id: string;
  name: string;
  manufacturer: string;
  type: 'input' | 'output';
  isConnected: boolean;
  isTD3: boolean;
}

// ============================================================================
// CC Mapping Types
// ============================================================================

export type TB303Parameter =
  | 'cutoff'
  | 'resonance'
  | 'envMod'
  | 'decay'
  | 'accent'
  | 'overdrive'
  | 'slideTime'
  | 'normalDecay'
  | 'accentDecay'
  | 'vegDecay'
  | 'vegSustain'
  | 'softAttack'
  | 'filterTracking'
  | 'filterFM';

export type KnobBankMode = '303' | 'Siren' | 'FX' | 'Furnace' | 'V2' | 'Synare' | 'SpaceLaser' | 'SAM' | 'Organ' | 'Melodica' | 'MasterFX' | 'Mixer'
  | 'Hively' | 'Klystrack' | 'DX7' | 'SidMon' | 'SidMon1' | 'SonicArranger' | 'SoundMon' | 'HippelCoSo' | 'FC' | 'RobHubbard' | 'GTUltra' | 'Geonkick' | 'CZ101'
  | 'Harmonic' | 'Wavetable' | 'PinkTrombone' | 'Sfizz' | 'CEM3394' | 'TR808' | 'TR909';

export type MappableParameter =
  | TB303Parameter
  // 303 Oscillator
  | 'tuning'
  | 'waveform'
  | 'pulseWidth'
  | 'subOscGain'
  | 'subOscBlend'
  | 'pitchToPw'
  | 'volume'
  // 303 MOJO (filter character)
  | 'passbandCompensation'
  | 'resTracking'
  | 'filterInputDrive'
  | 'diodeCharacter'
  | 'duffingAmount'
  | 'filterFmDepth'
  | 'lpBpMix'
  // 303 DevilFish (circuit mods)
  | 'accentSoftAttack'
  | 'stageNLAmount'
  | 'ensembleAmount'
  // 303 Korg (ladder filter)
  | 'korgBite'
  | 'korgClip'
  | 'korgCrossmod'
  | 'korgQSag'
  | 'korgSharpness'
  // 303 LFO
  | 'lfoRate'
  | 'lfoContour'
  | 'lfoPitchDepth'
  | 'lfoPwmDepth'
  | 'lfoFilterDepth'
  | 'lfoStiffDepth'
  // 303 FX
  | 'chorusMix'
  | 'phaserRate'
  | 'phaserWidth'
  | 'phaserFeedback'
  | 'phaserMix'
  | 'delayTime'
  | 'delayFeedback'
  | 'delayTone'
  | 'delayMix'
  | 'delaySpread'
  // Dub Siren
  | 'siren.osc.frequency'
  | 'siren.lfo.rate'
  | 'siren.lfo.depth'
  | 'siren.delay.time'
  | 'siren.delay.feedback'
  | 'siren.delay.wet'
  | 'siren.filter.frequency'
  | 'siren.reverb.wet'
  // Space Echo
  | 'echo.rate'
  | 'echo.intensity'
  | 'echo.echoVolume'
  | 'echo.reverbVolume'
  | 'echo.mode'
  | 'echo.bass'
  | 'echo.treble'
  // Bi-Phase
  | 'biphase.rateA'
  | 'biphase.depthA'
  | 'biphase.rateB'
  | 'biphase.depthB'
  | 'biphase.feedback'
  | 'biphase.routing'
  // Mixer
  | 'mixer.volume'
  | 'mixer.pan'
  | 'mixer.filterPosition'
  | 'mixer.filterResonance'
  // Furnace FM
  | 'furnace.algorithm'
  | 'furnace.feedback'
  | 'furnace.op1TL'
  | 'furnace.op1AR'
  | 'furnace.op1DR'
  | 'furnace.op1SL'
  | 'furnace.op1RR'
  | 'furnace.fms'
  // V2
  | 'v2.osc1Level'
  | 'v2.filter1Cutoff'
  | 'v2.filter1Reso'
  | 'v2.envAttack'
  | 'v2.envDecay'
  | 'v2.envSustain'
  | 'v2.envRelease'
  | 'v2.lfo1Depth'
  // Synare
  | 'synare.tune'
  | 'synare.osc2Mix'
  | 'synare.filterCutoff'
  | 'synare.filterReso'
  | 'synare.filterEnvMod'
  | 'synare.filterDecay'
  | 'synare.sweepAmount'
  | 'synare.sweepTime'
  // Dexed
  | 'dexed.algorithm'
  | 'dexed.feedback'
  | 'dexed.op1Level'
  | 'dexed.op1Coarse'
  | 'dexed.lfoSpeed'
  | 'dexed.lfoPitchMod'
  | 'dexed.lfoAmpMod'
  | 'dexed.transpose'
  // OBXd params (kept for backwards compatibility with old MIDI mappings)
  | 'obxd.osc1Level'
  | 'obxd.osc2Level'
  | 'obxd.filterCutoff'
  | 'obxd.filterReso'
  | 'obxd.filterEnv'
  | 'obxd.ampAttack'
  | 'obxd.ampDecay'
  | 'obxd.volume'
  // SpaceLaser
  | 'spacelaser.startFreq'
  | 'spacelaser.endFreq'
  | 'spacelaser.sweepTime'
  | 'spacelaser.fmAmount'
  | 'spacelaser.fmRatio'
  | 'spacelaser.filterCutoff'
  | 'spacelaser.filterReso'
  | 'spacelaser.delayWet'
  // SAM
  | 'sam.pitch'
  | 'sam.speed'
  | 'sam.mouth'
  | 'sam.throat'
  // TonewheelOrgan (VSTBridge)
  | 'organ.drawbar16'
  | 'organ.drawbar8'
  | 'organ.drawbar4'
  | 'organ.percussion'
  | 'organ.vibratoType'
  | 'organ.vibratoDepth'
  | 'organ.overdrive'
  | 'organ.volume'
  // Melodica (VSTBridge)
  | 'melodica.breath'
  | 'melodica.brightness'
  | 'melodica.vibratoRate'
  | 'melodica.vibratoDepth'
  | 'melodica.detune'
  | 'melodica.portamento'
  | 'melodica.attack'
  | 'melodica.volume'
  // Hively / AHX
  | 'hively.filterSpeed'
  | 'hively.filterLower'
  | 'hively.filterUpper'
  | 'hively.vibratoSpeed'
  | 'hively.vibratoDepth'
  | 'hively.squareSpeed'
  // Klystrack
  | 'klystrack.cutoff'
  | 'klystrack.resonance'
  | 'klystrack.attack'
  | 'klystrack.decay'
  | 'klystrack.sustain'
  | 'klystrack.release'
  | 'klystrack.pulseWidth'
  // DX7
  | 'dx7.algorithm'
  | 'dx7.feedback'
  | 'dx7.op1Level'
  | 'dx7.op2Level'
  | 'dx7.op3Level'
  | 'dx7.lfoSpeed'
  | 'dx7.transpose'
  // SidMon
  | 'sidmon.filterCutoff'
  | 'sidmon.filterResonance'
  | 'sidmon.arpSpeed'
  | 'sidmon.vibSpeed'
  | 'sidmon.vibDepth'
  | 'sidmon.vibDelay'
  // SidMon1
  | 'sidmon1.attackSpeed'
  | 'sidmon1.attackMax'
  | 'sidmon1.decaySpeed'
  | 'sidmon1.decayMin'
  | 'sidmon1.sustain'
  | 'sidmon1.releaseSpeed'
  | 'sidmon1.releaseMin'
  // SonicArranger
  | 'sonicarranger.vibratoSpeed'
  | 'sonicarranger.vibratoLevel'
  | 'sonicarranger.vibratoDelay'
  | 'sonicarranger.portamentoSpeed'
  | 'sonicarranger.fineTuning'
  | 'sonicarranger.effect'
  | 'sonicarranger.effectArg1'
  // SoundMon
  | 'soundmon.adsrControl'
  | 'soundmon.adsrSpeed'
  | 'soundmon.egControl'
  | 'soundmon.lfoSpeed'
  | 'soundmon.lfoDepth'
  | 'soundmon.lfoDelay'
  | 'soundmon.waveTable'
  // HippelCoSo
  | 'hippelcoso.vibSpeed'
  | 'hippelcoso.vibDepth'
  // Future Composer
  | 'fc.synthSpeed'
  | 'fc.vibSpeed'
  | 'fc.vibDepth'
  | 'fc.vibDelay'
  // Rob Hubbard
  | 'robhubbard.divider'
  | 'robhubbard.portaSpeed'
  // GTUltra
  | 'gtultra.attack'
  | 'gtultra.decay'
  | 'gtultra.sustain'
  | 'gtultra.release'
  | 'gtultra.firstwave'
  | 'gtultra.gatetimer'
  | 'gtultra.vibdelay'
  // Geonkick
  | 'geonkick.osc0Freq'
  | 'geonkick.osc0Amp'
  | 'geonkick.osc1Freq'
  | 'geonkick.osc1Amp'
  | 'geonkick.filterCutoff'
  | 'geonkick.filterQ'
  | 'geonkick.distDrive'
  // CZ-101
  | 'cz101.waveform1'
  | 'cz101.waveform2'
  | 'cz101.dco_rate'
  | 'cz101.dco_depth'
  | 'cz101.dcw_rate'
  | 'cz101.dcw_depth'
  | 'cz101.dca_rate'
  // Harmonic synth
  | 'harmonic.filterCutoff'
  | 'harmonic.filterResonance'
  | 'harmonic.attack'
  | 'harmonic.decay'
  | 'harmonic.sustain'
  | 'harmonic.release'
  | 'harmonic.spectralTilt'
  // Wavetable synth
  | 'wavetable.morphPosition'
  | 'wavetable.cutoff'
  | 'wavetable.resonance'
  | 'wavetable.attack'
  | 'wavetable.decay'
  | 'wavetable.sustain'
  | 'wavetable.release'
  // PinkTrombone vocal synth
  | 'pinktrombone.tongueIndex'
  | 'pinktrombone.tongueDiameter'
  | 'pinktrombone.lipDiameter'
  | 'pinktrombone.constrictionIndex'
  | 'pinktrombone.constrictionDiameter'
  | 'pinktrombone.velum'
  | 'pinktrombone.tenseness'
  | 'pinktrombone.vibratoAmount'
  // Sfizz SFZ sampler
  | 'sfizz.expression'
  | 'sfizz.pan'
  | 'sfizz.chorusSend'
  | 'sfizz.reverbSend'
  | 'sfizz.transpose'
  | 'sfizz.modWheel'
  | 'sfizz.polyphony'
  // CEM3394 analog
  | 'cem3394.saw'
  | 'cem3394.square'
  | 'cem3394.triangle'
  // TR-808 drum levels
  | 'tr808.kick'
  | 'tr808.snare'
  | 'tr808.closedHat'
  | 'tr808.openHat'
  | 'tr808.clap'
  | 'tr808.cowbell'
  | 'tr808.cymbal'
  | 'tr808.clave'
  // TR-909 drum levels
  | 'tr909.kick'
  | 'tr909.snare'
  | 'tr909.closedHat'
  | 'tr909.openHat'
  | 'tr909.clap'
  | 'tr909.crash'
  | 'tr909.ride'
  | 'tr909.rimshot'
  // Master FX
  | 'masterFx.slot0.wet'
  | 'masterFx.slot0.param0'
  | 'masterFx.slot1.wet'
  | 'masterFx.slot1.param0'
  | 'masterFx.slot2.wet'
  | 'masterFx.slot2.param0'
  | 'masterFx.masterVolume'
  | 'masterFx.limiterCeiling'
  // Dub Studio moves + bus params (routed via routeDubParameter in
  // parameterRouter.ts). All 27 moves enumerated here so DEFAULT_CC_MAPPINGS
  // can pre-wire out-of-the-box CC → move routing — users override via MIDI
  // Learn. Per-channel variants (`dub.echoThrow.ch3` etc.) stay dynamic;
  // only global moves get default CCs.
  | DubMoveParameter;

/**
 * Full dub-move parameter namespace. One entry per move registered in
 * DubRouter.MOVES (lives in src/engine/dub/DubRouter.ts) + one entry per
 * continuous bus param in DUB_BUS_PARAMS (parameterRouter.ts). Keep in
 * sync — the `dubMovesDefaultCCMappings.test.ts` contract guards it.
 */
export type DubMoveParameter =
  // Global moves (27 total — Phase 1 + PR #42 moves)
  | 'dub.echoThrow'
  | 'dub.dubStab'
  | 'dub.channelThrow'
  | 'dub.channelMute'
  | 'dub.springSlam'
  | 'dub.filterDrop'
  | 'dub.dubSiren'
  | 'dub.tapeWobble'
  | 'dub.snareCrack'
  | 'dub.delayTimeThrow'
  | 'dub.backwardReverb'
  | 'dub.masterDrop'
  | 'dub.tapeStop'
  | 'dub.transportTapeStop'
  | 'dub.toast'
  | 'dub.tubbyScream'
  | 'dub.stereoDoubler'
  | 'dub.reverseEcho'
  | 'dub.sonarPing'
  | 'dub.radioRiser'
  | 'dub.subSwell'
  | 'dub.oscBass'
  | 'dub.crushBass'
  | 'dub.subHarmonic'
  | 'dub.echoBuildUp'
  | 'dub.delayPreset380'
  | 'dub.delayPresetDotted'
  | 'dub.eqSweep'
  | 'dub.springKick'
  | 'dub.delayPresetQuarter'
  | 'dub.delayPreset8th'
  | 'dub.delayPresetTriplet'
  | 'dub.delayPreset16th'
  | 'dub.delayPresetDoubler'
  | 'dub.ghostReverb'
  | 'dub.voltageStarve'
  | 'dub.ringMod'
  | 'dub.hpfRise'
  | 'dub.madProfPingPong'
  | 'dub.combSweep'
  // Continuous bus settings
  | 'dub.echoIntensity'
  | 'dub.echoWet'
  | 'dub.echoRateMs'
  | 'dub.springWet'
  | 'dub.returnGain'
  | 'dub.hpfCutoff'
  | 'dub.sidechainAmount'
  // Bus enable + REC arm toggles
  | 'dub.enabled'
  | 'dub.armed';

export interface CCMapping {
  ccNumber: number;
  parameter: MappableParameter;
  min: number;
  max: number;
  curve: 'linear' | 'logarithmic';
  channel?: number; // Optional channel filter (1-16, undefined = any)
}

// Grid sequencer MIDI CC mapping types
export type GridMappableParameter =
  | 'baseOctave'
  | 'velocity'
  | 'cutoff'
  | 'resonance'
  | 'envMod'
  | 'decay'
  | 'accent'
  | 'slideTime'
  | 'overdrive'
  | 'normalDecay'
  | 'accentDecay'
  | 'softAttack'
  | 'vegSustain'
  | 'filterFM'
  | 'filterTracking';

export interface GridMIDIMapping {
  channel: number;
  controller: number;
  parameter: GridMappableParameter;
  min: number;
  max: number;
  curve?: 'linear' | 'exponential' | 'logarithmic';
}

// ============================================================================
// TD-3 Pattern Types
// ============================================================================

export interface TD3Note {
  value: number;      // 0-11 (C, C#, D, D#, E, F, F#, G, G#, A, A#, B)
  octave: number;     // 0-2 (transpose offset)
  upperC: boolean;    // True if upper octave C (sets bit 0x80)
}

export interface TD3Step {
  note: TD3Note | null;  // null = rest
  accent: boolean;
  slide: boolean;
  tie: boolean;
}

export interface TD3PatternData {
  group: number;        // 0-3 (A, B, C, D)
  pattern: number;      // 0-15 (patterns within group)
  steps: TD3Step[];     // 16 steps
  triplet: boolean;     // Triplet timing mode
  activeSteps: number;  // Number of active steps (1-16)
}

// ============================================================================
// MIDI Message Types
// ============================================================================

export type MIDIMessageType =
  | 'noteOn'
  | 'noteOff'
  | 'cc'
  | 'pitchBend'
  | 'programChange'
  | 'sysex'
  | 'clock'
  | 'start'
  | 'stop'
  | 'continue'
  | 'other';

export interface MIDIMessage {
  type: MIDIMessageType;
  channel: number;      // 0-15, -1 for system messages
  data: Uint8Array;
  timestamp: number;
  // Parsed data for common message types
  note?: number;        // For noteOn/noteOff
  velocity?: number;    // For noteOn/noteOff
  cc?: number;          // For CC messages
  value?: number;       // For CC messages
  pitchBend?: number;   // For pitchBend (-8192 to 8191)
  program?: number;     // For programChange (0-127)
}

export type MIDIMessageHandler = (message: MIDIMessage, deviceId: string) => void;

// ============================================================================
// SysEx Constants
// ============================================================================

export const TD3_SYSEX = {
  // Behringer TD-3 manufacturer ID
  HEADER: new Uint8Array([0xF0, 0x00, 0x20, 0x32, 0x00, 0x01, 0x0A]),
  FOOTER: 0xF7,

  // Commands
  CMD_REQUEST_PATTERN: 0x77,
  CMD_SEND_PATTERN: 0x78,

  // Message sizes
  PATTERN_PAYLOAD_SIZE: 115,  // Bytes after header
  STEPS_PER_PATTERN: 16,

  // Byte offsets in pattern payload (after command byte)
  OFFSET_GROUP: 0,
  OFFSET_PATTERN: 1,
  OFFSET_HEADER_BYTES: 2,     // 00 01
  OFFSET_NOTES: 4,            // 32 bytes (16 steps * 2)
  OFFSET_ACCENTS: 36,         // 32 bytes
  OFFSET_SLIDES: 68,          // 32 bytes
  OFFSET_TRIPLET: 100,        // 2 bytes
  OFFSET_ACTIVE_STEPS: 102,   // 2 bytes (nibbled)
  OFFSET_RESERVED: 104,       // 2 bytes
  OFFSET_TIE_BITS: 106,       // 4 bytes (u16 as nibbles)
  OFFSET_REST_BITS: 110,      // 4 bytes (u16 as nibbles)
} as const;

// ============================================================================
// Note Conversion Helpers
// ============================================================================

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export type NoteName = typeof NOTE_NAMES[number];

// MIDI note number to note name and octave
export function midiNoteToNoteName(midiNote: number): { name: NoteName; octave: number } {
  const octave = Math.floor(midiNote / 12) - 1; // MIDI octave convention
  const noteIndex = midiNote % 12;
  return { name: NOTE_NAMES[noteIndex], octave };
}

// Tracker note string (e.g., "C-4", "F#3") to MIDI note number
export function trackerNoteToMidi(trackerNote: string): number | null {
  if (!trackerNote || trackerNote === '===' || trackerNote === '---') {
    return null;
  }

  // Parse note like "C-4", "F#3", "D#5"
  const match = trackerNote.match(/^([A-G])(#?)(-?\d)$/);
  if (!match) return null;

  const [, noteLetter, sharp, octaveStr] = match;
  const octave = parseInt(octaveStr, 10);

  // Find note index
  const noteWithSharp = noteLetter + (sharp || '');
  const noteIndex = NOTE_NAMES.indexOf(noteWithSharp as NoteName);
  if (noteIndex === -1) return null;

  // Convert to MIDI note number
  return (octave + 1) * 12 + noteIndex;
}

// MIDI note number to tracker note string
export function midiToTrackerNote(midiNote: number): string {
  const { name, octave } = midiNoteToNoteName(midiNote);
  // Format: note + octave, using "-" separator for naturals, no separator for sharps
  if (name.includes('#')) {
    return `${name}${octave}`;
  }
  return `${name}-${octave}`;
}
