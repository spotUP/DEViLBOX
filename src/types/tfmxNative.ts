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
}
