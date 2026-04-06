/**
 * TFMX Native Data Types — preserves the hierarchical structure for the TFMX editor.
 *
 * TFMX (The Final Music eXpander) stores music as:
 *   1. A trackstep matrix assigning patterns to 4 voices per song step
 *   2. A pool of up to 128 independent pattern command streams
 *   3. Macro instruments (volume + sound mod sequences)
 */

// ── Voice Assignment ─────────────────────────────────────────────────────────

export interface TFMXVoiceAssignment {
  /** Pattern number from the pool (-1 if stop/hold) */
  patternNum: number;
  /** Signed transpose value (low byte of trackstep entry) */
  transpose: number;
  /** 0x80 = hold previous pattern (don't restart) */
  isHold: boolean;
  /** 0xFF/0xFE = stop this voice */
  isStop: boolean;
}

// ── Trackstep Entry ──────────────────────────────────────────────────────────

export interface TFMXTrackstepEntry {
  /** Absolute step index in the trackstep table */
  stepIndex: number;
  /** Voice assignments (4 for standard TFMX, 7 for 7-voice mode) */
  voices: TFMXVoiceAssignment[];
  /** True if this line is an EFFE control command, not voice data */
  isEFFE: boolean;
  /** EFFE sub-command: 0=stop, 1=loop, 2=tempo, 3=fadeVolDown, 4=fadeVolUp */
  effeCommand?: number;
  /** EFFE parameter (e.g. tempo value, loop target step) */
  effeParam?: number;
}

// ── Pattern Command ──────────────────────────────────────────────────────────

export type TFMXCommandType =
  | 'note'        // byte0 < 0x80: note + immediate fetch
  | 'noteWait'    // byte0 0x80-0xBF: note + wait
  | 'portamento'  // byte0 0xC0-0xEF: portamento to note
  | 'end'         // F0: end pattern
  | 'loop'        // F1: loop
  | 'jump'        // F2: jump to pattern
  | 'wait'        // F3: wait N jiffies
  | 'stop'        // F4: stop player
  | 'keyup'       // F5: key-up (note off)
  | 'vibrato'     // F6: vibrato
  | 'envelope'    // F7: envelope
  | 'command';    // F8-FF: other commands (gosub, return, fade, etc.)

export interface TFMXPatternCommand {
  /** Original 4-byte big-endian command as u32 */
  raw: number;
  /** File byte offset of this command */
  fileOffset: number;
  /** Individual bytes for display */
  byte0: number;
  byte1: number;
  byte2: number;
  byte3: number;
  /** Semantic command type */
  type: TFMXCommandType;
  /** TFMX note index (0-63) — only for note/noteWait/portamento */
  note?: number;
  /** Macro/instrument number — only for note/noteWait/portamento */
  macro?: number;
  /** Wait time in jiffies — for noteWait and wait commands */
  wait?: number;
  /** Detune value — for note (immediate fetch) commands */
  detune?: number;
  /** Relative volume (0-15) — for note/noteWait/portamento */
  relVol?: number;
  /** F-command code (0-F) — for pattern commands */
  commandCode?: number;
  /** Command parameter byte(s) */
  commandParam?: number;
}

// ── Macro Command (Huelsbeck TFMX instrument format) ────────────────────────
//
// TFMX Huelsbeck instruments are 4-byte longword command streams indexed via
// the macro pointer table. Each command has:
//   byte 0 = command number (low 6 bits 0x00-0x29) + flags in top 2 bits
//   byte 1 = bb (first arg)
//   byte 2 = cd (second arg high)
//   byte 3 = ee (second arg low / third byte)
//
// Many commands combine cd:ee into a 16-bit word or bb:cd:ee into a 24-bit
// address. See TFMX_MACRO_COMMANDS for the per-command parameter layout.
//
// Reference: third-party/libtfmxaudiodecoder-main/src/Chris/Macro.cpp
//            third-party/libtfmxaudiodecoder-main/src/Chris/TFMXDecoder.h

export type TFMXMacroParamLayout =
  | 'none'        // command takes no parameters
  | 'addr24'      // bb:cd:ee — 24-bit address
  | 'word16'      // cd:ee — 16-bit word
  | 'byte_word'   // bb / cd:ee — byte + word (e.g. count + step)
  | 'byte'        // bb only — single byte
  | 'note_detune' // bb=note, cd:ee=signed detune
  | 'env'         // bb=speed, cd=count, ee=target volume
  | 'vibrato'     // bb=time, ee=intensity
  | 'volume'      // ee=volume only
  | 'addvol_note' // bb=note, cd=0xFE flag, ee=volume
  | 'wave'        // ee=sample number
  | 'wave_mod'    // bb=sample, cd:ee=other args
  | 'split'       // bb=threshold, cd:ee=step target
  | 'random'      // bb=macro, cd=speed, ee=mode
  | 'play_macro'  // bb=macro, cd=channel|noteVol, ee=detune
  | 'sid_speed'   // aa:bb=speed, cd:ee=delta
  | 'sid_op1';    // bb=speed, cd=interMod, ee=interDelta

export interface TFMXMacroCommandDef {
  /** Command opcode (0x00-0x29) */
  opcode: number;
  /** Short mnemonic (e.g. 'DMAoff', 'SetBegin', 'AddNote') */
  mnemonic: string;
  /** Human-readable description */
  description: string;
  /** Parameter layout for the editor */
  layout: TFMXMacroParamLayout;
}

/** Master table of all 42 TFMX Huelsbeck macro commands. */
export const TFMX_MACRO_COMMANDS: TFMXMacroCommandDef[] = [
  { opcode: 0x00, mnemonic: 'DMAoff',     description: 'DMAoff + Reset (stop sample, clear all)',         layout: 'none' },
  { opcode: 0x01, mnemonic: 'DMAon',      description: 'DMAon (start sample at selected begin)',          layout: 'byte' },
  { opcode: 0x02, mnemonic: 'SetBegin',   description: 'Set sample start address',                        layout: 'addr24' },
  { opcode: 0x03, mnemonic: 'SetLen',     description: 'Set sample length (words)',                       layout: 'word16' },
  { opcode: 0x04, mnemonic: 'Wait',       description: 'Wait N VBI ticks',                                layout: 'word16' },
  { opcode: 0x05, mnemonic: 'Loop',       description: 'Repeat block N times',                            layout: 'byte_word' },
  { opcode: 0x06, mnemonic: 'Cont',       description: 'Continue at another macro',                       layout: 'byte_word' },
  { opcode: 0x07, mnemonic: 'Stop',       description: 'End macro',                                       layout: 'none' },
  { opcode: 0x08, mnemonic: 'AddNote',    description: 'Note + detune (added to current note)',           layout: 'note_detune' },
  { opcode: 0x09, mnemonic: 'SetNote',    description: 'Set absolute note + detune',                      layout: 'note_detune' },
  { opcode: 0x0A, mnemonic: 'Reset',      description: 'Reset vibrato/portamento/envelope',               layout: 'none' },
  { opcode: 0x0B, mnemonic: 'Portamento', description: 'Start portamento (count + speed)',                layout: 'byte_word' },
  { opcode: 0x0C, mnemonic: 'Vibrato',    description: 'Vibrato (speed + intensity)',                     layout: 'vibrato' },
  { opcode: 0x0D, mnemonic: 'AddVolume',  description: 'Add to volume',                                   layout: 'volume' },
  { opcode: 0x0E, mnemonic: 'SetVolume',  description: 'Set absolute volume (0-3F)',                      layout: 'volume' },
  { opcode: 0x0F, mnemonic: 'Envelope',   description: 'Envelope (speed/count/target volume)',            layout: 'env' },
  { opcode: 0x10, mnemonic: 'LoopKeyUp',  description: 'Loop until key-up',                               layout: 'byte_word' },
  { opcode: 0x11, mnemonic: 'AddBegin',   description: 'Add offset to sample start',                      layout: 'byte_word' },
  { opcode: 0x12, mnemonic: 'AddLen',     description: 'Add to sample length (signed)',                   layout: 'word16' },
  { opcode: 0x13, mnemonic: 'StopSample', description: 'DMAoff without clear (optional volume)',          layout: 'volume' },
  { opcode: 0x14, mnemonic: 'WaitKeyUp',  description: 'Wait until key-up',                               layout: 'byte' },
  { opcode: 0x15, mnemonic: 'Gosub',      description: 'Goto submacro (saves return)',                    layout: 'byte_word' },
  { opcode: 0x16, mnemonic: 'Return',     description: 'Return to saved macro/step',                      layout: 'none' },
  { opcode: 0x17, mnemonic: 'SetPeriod',  description: 'Set Paula period directly',                       layout: 'word16' },
  { opcode: 0x18, mnemonic: 'SampleLoop', description: 'Shift sample start, halve length',                layout: 'addr24' },
  { opcode: 0x19, mnemonic: 'OneShot',    description: 'Force 1-sample one-shot',                         layout: 'none' },
  { opcode: 0x1A, mnemonic: 'WaitOnDMA',  description: 'Wait N wave cycles (loops)',                      layout: 'word16' },
  { opcode: 0x1B, mnemonic: 'RandomPlay', description: 'Random play (macro/speed/mode)',                  layout: 'random' },
  { opcode: 0x1C, mnemonic: 'SplitKey',   description: 'Branch on note threshold',                        layout: 'split' },
  { opcode: 0x1D, mnemonic: 'SplitVol',   description: 'Branch on volume threshold',                      layout: 'split' },
  { opcode: 0x1E, mnemonic: 'RndMask',    description: 'Set random mask byte',                            layout: 'byte' },
  { opcode: 0x1F, mnemonic: 'PrevNote',   description: 'AddNote using previous note as base',             layout: 'note_detune' },
  { opcode: 0x20, mnemonic: 'NOP',        description: 'Undefined / NOP',                                 layout: 'none' },
  { opcode: 0x21, mnemonic: 'PlayMacro',  description: 'Trigger macro on a channel',                      layout: 'play_macro' },
  { opcode: 0x22, mnemonic: 'SIDsetbeg',  description: 'SID source sample start',                         layout: 'addr24' },
  { opcode: 0x23, mnemonic: 'SIDsetlen',  description: 'SID buffer + source lengths',                     layout: 'sid_speed' },
  { opcode: 0x24, mnemonic: 'SIDop3ofs',  description: 'SID op3 offset',                                  layout: 'addr24' },
  { opcode: 0x25, mnemonic: 'SIDop3frq',  description: 'SID op3 speed + amplitude',                       layout: 'sid_speed' },
  { opcode: 0x26, mnemonic: 'SIDop2ofs',  description: 'SID op2 offset',                                  layout: 'addr24' },
  { opcode: 0x27, mnemonic: 'SIDop2frq',  description: 'SID op2 speed + amplitude',                       layout: 'sid_speed' },
  { opcode: 0x28, mnemonic: 'SIDop1',     description: 'SID op1 speed/interMod/delta',                    layout: 'sid_op1' },
  { opcode: 0x29, mnemonic: 'SIDstop',    description: 'Stop SID mode',                                   layout: 'byte' },
];

export interface TFMXMacroCommand {
  /** Step index within the macro (0-based) */
  step: number;
  /** Original 4-byte command as u32 (raw display) */
  raw: number;
  /** File byte offset of this command (for chip RAM patching) */
  fileOffset: number;
  /** Individual bytes */
  byte0: number;
  byte1: number;
  byte2: number;
  byte3: number;
  /** Command opcode (byte0 & 0x3F) */
  opcode: number;
  /** Command flags (byte0 & 0xC0, top 2 bits) */
  flags: number;
}

export interface TFMXMacro {
  /** Macro index in the pointer table (0-127) */
  index: number;
  /** File offset where the macro command stream starts */
  fileOffset: number;
  /** Number of 4-byte commands in this macro (including terminator) */
  length: number;
  /** Decoded command list (terminated by 0x07 Stop or end-of-data) */
  commands: TFMXMacroCommand[];
  /** Optional human-readable name (synthesized — TFMX files don't store macro names) */
  name?: string;
}

// ── Native Data ──────────────────────────────────────────────────────────────

export interface TFMXNativeData {
  /** Song name extracted from filename */
  songName: string;
  /** Text area lines (up to 6 × 40 chars) */
  textLines: string[];
  /** 32 subsong start step indices */
  songStarts: number[];
  /** 32 subsong end step indices */
  songEnds: number[];
  /** 32 subsong tempo values */
  songTempos: number[];
  /** Full trackstep table (all entries, not just active subsong) */
  tracksteps: TFMXTrackstepEntry[];
  /** Decoded pattern pool — index = TFMX pattern number */
  patterns: TFMXPatternCommand[][];
  /** File offsets for each pattern pointer (for reference) */
  patternPointers: number[];
  /** Number of voices: 4 (standard) or 7 (7-voice mode) */
  numVoices: number;
  /** Currently active subsong index (0-31) */
  activeSubsong: number;
  /** First trackstep index for the active subsong */
  firstStep: number;
  /** Last trackstep index for the active subsong */
  lastStep: number;
  /** Decoded macro instruments (Huelsbeck format: 4-byte command streams) */
  macros: TFMXMacro[];
  /** File offset of the macro pointer table */
  macroPointerTableOffset: number;
}
