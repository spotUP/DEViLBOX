/**
 * TFMXParser.ts — TFMX Professional format parser with full pattern decoding.
 *
 * TFMX (The Final Music eXpander) was created by Jochen Hippel for the Amiga.
 * This parser handles the TFMX Professional (mdat.*) format.
 *
 * File layout (from TFMX Professional 2.0 format documentation and
 * NostalgicPlayer TfmxIdentifier.cs):
 *
 *   0x000  10 bytes  Magic: "TFMX-SONG " (note trailing space)
 *   0x00A   2 bytes  Reserved word (ignored)
 *   0x00C   4 bytes  Reserved long (ignored)
 *   0x010 240 bytes  Text area (40x6 lines, null-padded)
 *   0x100  64 bytes  Song start positions (32 x u16BE)
 *   0x140  64 bytes  Song end positions (32 x u16BE)
 *   0x180  64 bytes  Song tempo values (32 x u16BE)
 *   0x1C0  16 bytes  Padding / reserved
 *   0x1D0  12 bytes  Packed-module offsets (3 x u32BE):
 *                      [0] trackstep ptr  (0 -> use 0x600)
 *                      [1] pattern ptr    (0 -> use 0x200)
 *                      [2] macro ptr      (0 -> use 0x400)
 *   -- followed by pattern data, macro data, trackstep data, sample data --
 *
 * Pattern data:
 *   The pattern pointer table (at patternPtr) contains u32BE absolute offsets
 *   to each pattern's command stream. Each command is a 4-byte big-endian
 *   longword:
 *     byte 0 < 0x80:  note + immediate fetch (byte 3 = detune)
 *     byte 0 0x80-BF: note + wait (byte 3 = wait jiffies)
 *     byte 0 0xC0-EF: portamento
 *     byte 0 0xF0-FF: pattern command (F0=end, F3=wait, F4=stop, F5=keyup, etc.)
 *
 * The trackstep table assigns TFMX patterns to voices per step.
 * Each trackstep entry: 8 voices x 2 bytes (hi=pattern number, lo=transpose).
 *
 * TFMX Pro uses 4 PCM channels on the Amiga (Paula hardware).
 * TFMX 7-Voices uses 7.
 *
 * References:
 *   - Jonathan H. Pickard, "TFMX Professional 2.0 Song File Format" (1993-1998)
 *   - NostalgicPlayer TfmxWorker.cs (DoTrack method, lines 2011-2241)
 *   - libxmp docs/formats/tfmx-format.txt
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, InstrumentConfig } from '@/types';
import type { TFMXConfig, UADEChipRamInfo } from '@/types/instrument';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import type { TFMXNativeData, TFMXTrackstepEntry, TFMXPatternCommand, TFMXCommandType, TFMXVoiceAssignment, TFMXMacro, TFMXMacroCommand } from '@/types/tfmxNative';
import { encodeTFMXCell } from '@/engine/uade/encoders/TFMXEncoder';

// ── Constants ─────────────────────────────────────────────────────────────────

const TFMX_MIN_SIZE = 0x200;
const TFMX_SONG_SLOTS = 32;
// Unpacked module default offsets (file-space, verified against NostalgicPlayer).
// NostalgicPlayer loads file data from offset 0x200 into musicData[],
// using musicData-relative defaults of 0x600/0x200/0x400.
// In file-space these correspond to 0x800/0x400/0x600.
const TFMX_TRACKSTEP_UNPACKED = 0x800;
const TFMX_PATTERN_PTR_UNPACKED = 0x400;
const TFMX_MACRO_PTR_UNPACKED = 0x600;
const TFMX_TRACKSTEP_ENTRY_SIZE = 16;
const TFMX_TRACK_END = 0xFF;
const TFMX_TRACK_HOLD = 0x80;
const NUM_CHANNELS = 8;
const MAX_PATTERN_POINTERS = 128;
const MAX_COMMANDS_PER_PATTERN = 512;

// ── Utilities ─────────────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  if (off + 1 >= buf.length) return 0;
  return (buf[off] << 8) | buf[off + 1];
}

function u32BE(buf: Uint8Array, off: number): number {
  if (off + 3 >= buf.length) return 0;
  return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}

// ── Magic detection ───────────────────────────────────────────────────────────

function findTFMXMagic(buf: Uint8Array): number {
  const limit = Math.min(0x200, buf.length - 10);
  for (let i = 0; i < limit; i++) {
    const b0 = buf[i];
    if (b0 !== 0x54 && b0 !== 0x74) continue;

    // "TFMX-SONG " (10 bytes)
    if (
      buf[i] === 0x54 && buf[i + 1] === 0x46 && buf[i + 2] === 0x4D && buf[i + 3] === 0x58 &&
      buf[i + 4] === 0x2D && buf[i + 5] === 0x53 && buf[i + 6] === 0x4F && buf[i + 7] === 0x4E &&
      buf[i + 8] === 0x47 && buf[i + 9] === 0x20
    ) return i;

    // "TFMX_SONG" (9 bytes)
    if (
      buf[i] === 0x54 && buf[i + 1] === 0x46 && buf[i + 2] === 0x4D && buf[i + 3] === 0x58 &&
      buf[i + 4] === 0x5F && buf[i + 5] === 0x53 && buf[i + 6] === 0x4F && buf[i + 7] === 0x4E &&
      buf[i + 8] === 0x47
    ) return i;

    // "tfmxsong" (lower-case, 8 bytes)
    if (
      buf[i] === 0x74 && buf[i + 1] === 0x66 && buf[i + 2] === 0x6D && buf[i + 3] === 0x78 &&
      buf[i + 4] === 0x73 && buf[i + 5] === 0x6F && buf[i + 6] === 0x6E && buf[i + 7] === 0x67
    ) return i;

    // Old TFMX 1.5: "TFMX " then not 'S'/'_'
    if (
      buf[i] === 0x54 && buf[i + 1] === 0x46 && buf[i + 2] === 0x4D && buf[i + 3] === 0x58 &&
      buf[i + 4] === 0x20 && buf[i + 8] !== 0x47 &&
      !(buf[i + 5] === 0x53 && buf[i + 6] === 0x4F && buf[i + 7] === 0x4E)
    ) return i;
  }
  return -1;
}

export function isTFMXFile(buffer: ArrayBuffer): boolean {
  return findTFMXMagic(new Uint8Array(buffer)) >= 0;
}

// ── Note conversion ───────────────────────────────────────────────────────────

/**
 * Convert a TFMX note index (6-bit, 0-63) to XM note number.
 * TFMX period table has 5 octaves starting at C-0 (index 0).
 * Index 0 = C-0, 12 = C-1, 24 = C-2, 36 = C-3, 48 = C-4.
 * XM mapping: add 13 to shift into displayable range.
 */
function tfmxNoteToXM(noteIdx: number): number {
  return Math.max(1, Math.min(96, (noteIdx & 0x3F) + 13));
}

// ── Macro command decoding (Huelsbeck 4-byte command stream) ─────────────────

const MAX_MACRO_COMMANDS = 256;

/**
 * Decode a TFMX macro starting at the given file offset.
 * Reads 4-byte command longwords until a Stop command (0x07) or end-of-data.
 */
function decodeTFMXMacro(buf: Uint8Array, macroOffset: number, macroIndex: number): TFMXMacro {
  const commands: TFMXMacroCommand[] = [];
  let pos = macroOffset;

  for (let step = 0; step < MAX_MACRO_COMMANDS; step++) {
    if (pos + 4 > buf.length) break;

    const b0 = buf[pos];
    const b1 = buf[pos + 1];
    const b2 = buf[pos + 2];
    const b3 = buf[pos + 3];
    const opcode = b0 & 0x3F;
    const flags = b0 & 0xC0;
    const raw = (b0 << 24) | (b1 << 16) | (b2 << 8) | b3;

    commands.push({
      step,
      raw: raw >>> 0,
      fileOffset: pos,
      byte0: b0,
      byte1: b1,
      byte2: b2,
      byte3: b3,
      opcode,
      flags,
    });

    pos += 4;

    // Stop command (0x07) terminates the macro
    if (opcode === 0x07) break;
  }

  return {
    index: macroIndex,
    fileOffset: macroOffset,
    length: commands.length,
    commands,
    name: `Macro ${macroIndex + 1}`,
  };
}

// ── Pattern command decoding ──────────────────────────────────────────────────

interface DecodedTFMXCommand {
  cell: TrackerCell;
  fileOffset: number;
}

/**
 * Decode a TFMX pattern's command stream starting at the given file offset.
 * Reads 4-byte longwords until an F0 (end) or F4 (stop) command is found.
 */
function decodeTFMXPattern(buf: Uint8Array, patDataOffset: number): DecodedTFMXCommand[] {
  const commands: DecodedTFMXCommand[] = [];
  let pos = patDataOffset;

  for (let i = 0; i < MAX_COMMANDS_PER_PATTERN; i++) {
    if (pos + 4 > buf.length) break;

    const b0 = buf[pos];
    const b1 = buf[pos + 1];
    const b2 = buf[pos + 2];
    const b3 = buf[pos + 3];
    const fileOffset = pos;
    pos += 4;

    if (b0 >= 0xF0) {
      // Pattern command (F0-FF)
      const cmdType = b0 & 0x0F;

      if (cmdType === 0) {
        // F0 = End pattern — display only (no Dxx effect, WASM engine handles flow)
        commands.push({
          cell: { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 },
          fileOffset,
        });
        break;
      }

      if (cmdType === 4) {
        // F4 = Stop — display only (no Dxx effect, WASM engine handles flow)
        commands.push({
          cell: { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 },
          fileOffset,
        });
        break;
      }

      if (cmdType === 3) {
        // F3 = Wait (b1+1 jiffies) — show as speed effect
        commands.push({
          cell: { note: 0, instrument: 0, volume: 0, effTyp: 0x0F, eff: (b1 + 1) & 0xFF, effTyp2: 0, eff2: 0 },
          fileOffset,
        });
        continue;
      }

      if (cmdType === 5) {
        // F5 = Key-up — show as note-off (XM note 97)
        commands.push({
          cell: { note: 97, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 },
          fileOffset,
        });
        continue;
      }

      if (cmdType === 6) {
        // F6 = Vibrato (b1=rate, b3=depth) — show as vibrato effect
        commands.push({
          cell: { note: 0, instrument: 0, volume: 0, effTyp: 0x04, eff: ((b1 & 0x0F) << 4) | (b3 & 0x0F), effTyp2: 0, eff2: 0 },
          fileOffset,
        });
        continue;
      }

      if (cmdType === 7) {
        // F7 = Envelope (b1=rate, b3=target volume) — show as volume slide
        commands.push({
          cell: { note: 0, instrument: 0, volume: 0, effTyp: 0x0A, eff: b3, effTyp2: 0, eff2: 0 },
          fileOffset,
        });
        continue;
      }

      // Other commands (F1=loop, F2=jump, F8=gosub, F9=return, FA=fade, FB=pPat, FC=port, FD=lock, FE=stopCu, FF=nop)
      // Show the raw command type and param as effect
      commands.push({
        cell: { note: 0, instrument: 0, volume: 0, effTyp: cmdType, eff: b1, effTyp2: 0, eff2: 0 },
        fileOffset,
      });

      // F1 (loop) and F2 (jump) don't end the pattern data stream in the file.
      // The replayer handles control flow. We continue reading until F0/F4.
      continue;
    }

    if (b0 < 0xC0) {
      // Note event (< 0x80 = immediate fetch, 0x80-0xBF = with wait)
      const noteIdx = b0 & 0x3F;
      const xmNote = tfmxNoteToXM(noteIdx);
      const macro = b1;
      const relVol = (b2 >> 4) & 0x0F;
      const hasWait = (b0 & 0x80) !== 0;
      const waitOrDetune = b3;

      commands.push({
        cell: {
          note: xmNote,
          instrument: macro + 1, // 1-based
          volume: relVol * 4,    // 0-15 -> 0-60 (approx mapping to 0-64 range)
          effTyp: hasWait ? 0x0F : 0,   // speed effect for wait value
          eff: hasWait ? waitOrDetune : 0,
          effTyp2: !hasWait && waitOrDetune !== 0 ? 0x0E : 0, // detune as fine effect
          eff2: !hasWait ? waitOrDetune : 0,
        },
        fileOffset,
      });
      continue;
    }

    // 0xC0-0xEF = Portamento
    const noteIdx = b0 & 0x3F;
    const xmNote = tfmxNoteToXM(noteIdx);
    commands.push({
      cell: {
        note: xmNote,
        instrument: b1 > 0 ? b1 + 1 : 0,
        volume: ((b2 >> 4) & 0x0F) * 4,
        effTyp: 0x03, // portamento
        eff: b3,
        effTyp2: 0,
        eff2: 0,
      },
      fileOffset,
    });
  }

  return commands;
}

// ── Native pattern decoder (preserves full TFMX semantics) ───────────────────

function decodeTFMXPatternNative(buf: Uint8Array, patDataOffset: number): TFMXPatternCommand[] {
  const commands: TFMXPatternCommand[] = [];
  let pos = patDataOffset;

  for (let i = 0; i < MAX_COMMANDS_PER_PATTERN; i++) {
    if (pos + 4 > buf.length) break;

    const b0 = buf[pos];
    const b1 = buf[pos + 1];
    const b2 = buf[pos + 2];
    const b3 = buf[pos + 3];
    const fileOffset = pos;
    const raw = ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0;
    pos += 4;

    const base = { raw, fileOffset, byte0: b0, byte1: b1, byte2: b2, byte3: b3 };

    if (b0 >= 0xF0) {
      const cmdNibble = b0 & 0x0F;
      const typeMap: Record<number, TFMXCommandType> = {
        0: 'end', 1: 'loop', 2: 'jump', 3: 'wait', 4: 'stop',
        5: 'keyup', 6: 'vibrato', 7: 'envelope',
      };
      const type: TFMXCommandType = typeMap[cmdNibble] ?? 'command';

      const cmd: TFMXPatternCommand = {
        ...base, type, commandCode: cmdNibble, commandParam: b1,
      };

      if (type === 'wait') cmd.wait = b1 + 1;
      if (type === 'vibrato') { cmd.commandParam = (b1 << 8) | b3; }
      if (type === 'envelope') { cmd.commandParam = (b1 << 8) | b3; }

      commands.push(cmd);
      if (type === 'end' || type === 'stop') break;
      continue;
    }

    if (b0 < 0xC0) {
      // Note event
      const hasWait = (b0 & 0x80) !== 0;
      const noteIdx = b0 & 0x3F;
      const macro = b1;
      const relVol = (b2 >> 4) & 0x0F;

      commands.push({
        ...base,
        type: hasWait ? 'noteWait' : 'note',
        note: noteIdx,
        macro,
        relVol,
        wait: hasWait ? b3 + 1 : undefined,
        detune: hasWait ? undefined : b3,
      });
      continue;
    }

    // 0xC0-0xEF: Portamento
    const noteIdx = b0 & 0x3F;
    commands.push({
      ...base,
      type: 'portamento',
      note: noteIdx,
      macro: b1 > 0 ? b1 : undefined,
      relVol: (b2 >> 4) & 0x0F,
      commandParam: b3,
    });
  }

  return commands;
}

// ── Main parser ───────────────────────────────────────────────────────────────

export function parseTFMXFile(
  buffer: ArrayBuffer,
  filename: string,
  subsong = 0,
): TrackerSong {
  const buf = new Uint8Array(buffer);

  // 1. Locate TFMX header
  const h = findTFMXMagic(buf);
  if (h < 0) throw new Error('[TFMXParser] Not a TFMX file (no magic found)');
  if (buf.length < TFMX_MIN_SIZE) {
    throw new Error('[TFMXParser] File too small to be a valid TFMX module');
  }

  // 2. Read song table at h+0x100 (32 starts, 32 ends, 32 tempos)
  const songStarts: number[] = [];
  const songEnds:   number[] = [];
  const songTempos: number[] = [];
  for (let i = 0; i < TFMX_SONG_SLOTS; i++) {
    songStarts.push(u16BE(buf, h + 0x100 + i * 2));
    songEnds.push(  u16BE(buf, h + 0x140 + i * 2));
    songTempos.push(u16BE(buf, h + 0x180 + i * 2));
  }

  // 3. Read section offsets at h+0x1D0 (three u32BE pointers)
  let trackstepOff = u32BE(buf, h + 0x1D0);
  let patPtrTable  = u32BE(buf, h + 0x1D4);
  let macroPtrTable = u32BE(buf, h + 0x1D8);
  if (trackstepOff === 0)  trackstepOff  = h + TFMX_TRACKSTEP_UNPACKED;
  if (patPtrTable === 0)   patPtrTable   = h + TFMX_PATTERN_PTR_UNPACKED;
  if (macroPtrTable === 0) macroPtrTable = h + TFMX_MACRO_PTR_UNPACKED;

  // 4. Read pattern pointer table (up to 128 u32BE entries)
  // Pointer values are file-absolute (verified against NostalgicPlayer, which
  // subtracts 0x200 to convert from file-space to its musicData buffer space).
  // Number of patterns = (macroStart - patternStart) / 4, capped at 128
  const numPatternSlots = Math.min(
    Math.floor((macroPtrTable - patPtrTable) / 4),
    MAX_PATTERN_POINTERS,
  );
  const patternPointers: number[] = [];
  for (let i = 0; i < numPatternSlots; i++) {
    const raw = u32BE(buf, patPtrTable + i * 4);
    patternPointers.push(raw);
  }

  // 5. Decode all TFMX patterns (both flat for backward compat and native for editor)
  const decodedPatterns: DecodedTFMXCommand[][] = [];
  const nativePatterns: TFMXPatternCommand[][] = [];
  for (let i = 0; i < patternPointers.length; i++) {
    const ptr = patternPointers[i];
    if (ptr === 0 || ptr >= buf.length) {
      decodedPatterns.push([]);
      nativePatterns.push([]);
      continue;
    }
    decodedPatterns.push(decodeTFMXPattern(buf, ptr));
    nativePatterns.push(decodeTFMXPatternNative(buf, ptr));
  }

  // 5b. Read text area at h+0x10 (240 bytes = 6 lines × 40 chars)
  const textLines: string[] = [];
  for (let line = 0; line < 6; line++) {
    const lineOff = h + 0x10 + line * 40;
    let text = '';
    for (let c = 0; c < 40 && lineOff + c < buf.length; c++) {
      const ch = buf[lineOff + c];
      text += ch >= 0x20 && ch < 0x7F ? String.fromCharCode(ch) : ' ';
    }
    textLines.push(text.trimEnd());
  }

  // 6. Select subsong
  const clampedSong = Math.max(0, Math.min(TFMX_SONG_SLOTS - 1, subsong));
  let firstStep = songStarts[clampedSong];
  let lastStep  = songEnds[clampedSong];
  const tempo   = songTempos[clampedSong];

  if (firstStep > lastStep || firstStep > 0x3FFF || lastStep > 0x3FFF) {
    firstStep = 0;
    lastStep  = 0;
  }

  // 6b. Build native trackstep entries for the TFMX editor
  const nativeTracksteps: TFMXTrackstepEntry[] = [];
  for (let stepIdx = firstStep; stepIdx <= lastStep; stepIdx++) {
    const stepOff = trackstepOff + stepIdx * TFMX_TRACKSTEP_ENTRY_SIZE;
    if (stepOff + TFMX_TRACKSTEP_ENTRY_SIZE > buf.length) break;

    const firstWord = (buf[stepOff] << 8) | buf[stepOff + 1];
    if (firstWord === 0xEFFE) {
      const cmd = (buf[stepOff + 2] << 8) | buf[stepOff + 3];
      const param = (buf[stepOff + 4] << 8) | buf[stepOff + 5];
      nativeTracksteps.push({
        stepIndex: stepIdx,
        voices: [],
        isEFFE: true,
        effeCommand: cmd,
        effeParam: param,
      });
      if (cmd === 0x0000) break; // stop
      continue;
    }

    const voices: TFMXVoiceAssignment[] = [];
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const hi = buf[stepOff + ch * 2];
      const lo = buf[stepOff + ch * 2 + 1];
      voices.push({
        patternNum: (hi === TFMX_TRACK_END || hi >= 0xFE || hi === TFMX_TRACK_HOLD) ? -1 : hi,
        transpose: lo > 127 ? lo - 256 : lo,  // signed byte
        isHold: hi === TFMX_TRACK_HOLD,
        isStop: hi === TFMX_TRACK_END || hi >= 0xFE,
      });
    }

    nativeTracksteps.push({
      stepIndex: stepIdx,
      voices,
      isEFFE: false,
    });
  }

  // 7. Build tracker patterns from trackstep entries
  // Each trackstep entry assigns a TFMX pattern to each of the 4 channels.
  // We decode each channel's assigned pattern and merge them into one tracker pattern.
  //
  // For getCellFileOffset, we store:
  //   channelOffsetMaps[trackerPatIdx][channel][row] = file offset of that command
  const trackerPatterns: Pattern[] = [];
  const channelOffsetMaps: (number | -1)[][][] = [];

  for (let stepIdx = firstStep; stepIdx <= lastStep; stepIdx++) {
    const stepOff = trackstepOff + stepIdx * TFMX_TRACKSTEP_ENTRY_SIZE;
    if (stepOff + TFMX_TRACKSTEP_ENTRY_SIZE > buf.length) break;

    // Check for $EFFE command line (no track data — the entire line is a command)
    const firstWord = (buf[stepOff] << 8) | buf[stepOff + 1];
    if (firstWord === 0xEFFE) {
      const cmd = (buf[stepOff + 2] << 8) | buf[stepOff + 3];
      if (cmd === 0x0000) break; // EFFE0000 = stop player
      // EFFE0001 = loop section, EFFE0002 = set tempo, EFFE0003/0004 = volume fade
      // Skip command lines — they don't produce pattern rows
      continue;
    }

    // Read voice assignments for this step
    const voicePatNums: number[] = [];

    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const hi = buf[stepOff + ch * 2];
      if (hi === TFMX_TRACK_END || hi >= 0xFE) {
        // 0xFF = stop voice, 0xFE = stop voice indicated in low byte — no pattern
        voicePatNums.push(-1);
      } else if (hi === TFMX_TRACK_HOLD) {
        // Hold previous pattern (no new assignment)
        voicePatNums.push(-1);
      } else {
        voicePatNums.push(hi);
      }
    }

    // If ALL voices are stopped (-1), skip this step
    if (voicePatNums.every(v => v === -1)) continue;

    // Get decoded commands for each channel
    const channelCommands: DecodedTFMXCommand[][] = [];
    let maxRows = 0;
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const patNum = voicePatNums[ch] ?? -1;
      if (patNum >= 0 && patNum < decodedPatterns.length && decodedPatterns[patNum].length > 0) {
        channelCommands.push(decodedPatterns[patNum]);
        maxRows = Math.max(maxRows, decodedPatterns[patNum].length);
      } else {
        channelCommands.push([]);
      }
    }

    // Ensure at least 1 row
    if (maxRows === 0) maxRows = 1;

    // Build tracker rows and offset maps
    const channelRows: TrackerCell[][] = Array.from({ length: NUM_CHANNELS }, () => []);
    const offsetMap: (number | -1)[][] = Array.from({ length: NUM_CHANNELS }, () => []);

    for (let row = 0; row < maxRows; row++) {
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const cmds = channelCommands[ch];
        if (row < cmds.length) {
          channelRows[ch].push(cmds[row].cell);
          offsetMap[ch].push(cmds[row].fileOffset);
        } else {
          // Padding row beyond this channel's command count
          channelRows[ch].push({
            note: 0, instrument: 0, volume: 0,
            effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
          });
          offsetMap[ch].push(-1); // not editable
        }
      }
    }

    channelOffsetMaps.push(offsetMap);

    trackerPatterns.push({
      id:     `pattern-${trackerPatterns.length}`,
      name:   `Pattern ${trackerPatterns.length + 1}`,
      length: maxRows,
      channels: channelRows.map((rows, ch) => ({
        id:           `channel-${ch}`,
        name:         `Channel ${ch + 1}`,
        muted:        false,
        solo:         false,
        collapsed:    false,
        volume:       100,
        pan:          [-50, 50, 50, -50, -50, 50, 50, -50][ch] ?? 0,
        instrumentId: null,
        color:        null,
        rows,
      })),
      importMetadata: {
        sourceFormat: 'TFMX',
        sourceFile:   filename,
        importedAt:   new Date().toISOString(),
        originalChannelCount:    NUM_CHANNELS,
        originalPatternCount:    patternPointers.length,
        originalInstrumentCount: 0,
      },
    });
  }

  // Ensure at least one pattern
  if (trackerPatterns.length === 0) {
    const emptyRows: TrackerCell[] = [{
      note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
    }];
    channelOffsetMaps.push(Array.from({ length: NUM_CHANNELS }, () => [-1]));
    trackerPatterns.push({
      id:     'pattern-0',
      name:   'Pattern 0',
      length: 1,
      channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
        id:           `channel-${ch}`,
        name:         `Channel ${ch + 1}`,
        muted:        false,
        solo:         false,
        collapsed:    false,
        volume:       100,
        pan:          [-50, 50, 50, -50, -50, 50, 50, -50][ch] ?? 0,
        instrumentId: null,
        color:        null,
        rows:         [...emptyRows],
      })),
      importMetadata: {
        sourceFormat: 'TFMX',
        sourceFile:   filename,
        importedAt:   new Date().toISOString(),
        originalChannelCount:    NUM_CHANNELS,
        originalPatternCount:    0,
        originalInstrumentCount: 0,
      },
    });
  }

  // Build TFMX timing table: cumulative jiffies → (patternIndex, row)
  const tfmxTimingTable: { patternIndex: number; row: number; cumulativeJiffies: number }[] = [];
  let cumulativeJiffies = 0;

  for (let patIdx = 0; patIdx < trackerPatterns.length; patIdx++) {
    const pat = trackerPatterns[patIdx];
    const numRows = pat.channels[0]?.rows.length ?? 0;

    for (let row = 0; row < numRows; row++) {
      tfmxTimingTable.push({ patternIndex: patIdx, row, cumulativeJiffies });
      // Get the wait time from the raw TFMX command at this row
      const offsetMap = channelOffsetMaps[patIdx]?.[0]; // use channel 0 as timing reference
      if (offsetMap && row < offsetMap.length && offsetMap[row] >= 0) {
        const cmdOff = offsetMap[row];
        if (cmdOff >= 0 && cmdOff + 3 < buf.length) {
          const b0 = buf[cmdOff];
          const b1 = buf[cmdOff + 1];
          const b3 = buf[cmdOff + 3];
          if (b0 >= 0xF0 && (b0 & 0x0F) === 3) {
            // F3: wait (b1 + 1) jiffies
            cumulativeJiffies += b1 + 1;
          } else if (b0 >= 0x80 && b0 < 0xC0) {
            // Note with wait: b3 + 1 jiffies
            cumulativeJiffies += b3 + 1;
          } else {
            // Immediate command (no wait) — 1 jiffy minimum for display
            cumulativeJiffies += 1;
          }
        } else {
          cumulativeJiffies += 1;
        }
      } else {
        cumulativeJiffies += 1;
      }
    }
  }

  // 8. Determine initial BPM/speed from tempo value
  // TFMX timing doesn't map directly to tracker BPM (commands have per-note waits).
  // Use 125 BPM / speed 6 as defaults for reasonable pattern scrolling.
  // CIA mode (tempo >= 16) uses tempo as BPM-like value × 2.5/24.
  let initialBPM   = 125;
  let initialSpeed = 6;
  if (tempo > 15) {
    initialBPM = Math.round(tempo * 2.5 / 24) || 125;
  } else if (tempo > 0) {
    // VBlank mode: keep standard 125 BPM, adjust speed for approximate pace
    initialBPM = 125;
    initialSpeed = Math.max(3, Math.min(8, tempo + 1));
  }

  // 9. Extract instrument data from the macro table
  const instruments: InstrumentConfig[] = [];
  const macros: TFMXMacro[] = [];
  const MAX_INSTRUMENTS = 128;
  const MACRO_ENTRY_SIZE = 4; // macro pointer table has u32BE entries

  // Count macros by iterating the pointer table and stopping at invalid entries
  // (matches NostalgicPlayer approach — packed modules can have trackstep before macros)
  for (let i = 0; i < MAX_INSTRUMENTS; i++) {
    const ptrOff = macroPtrTable + i * MACRO_ENTRY_SIZE;
    if (ptrOff + MACRO_ENTRY_SIZE > buf.length) break;
    const macroAddr = u32BE(buf, ptrOff);
    if (macroAddr === 0 || macroAddr >= buf.length) continue;
    if (macroAddr >= 0xFF000000) break; // end of table marker
    if ((macroAddr & 3) !== 0) break; // misaligned = end of valid entries

    // Read up to 64 bytes of macro data for display
    const macroDataSize = 64;
    const volModSeqData = new Uint8Array(macroDataSize);
    const sndModSeqData = new Uint8Array(macroDataSize);
    const maxRead = Math.min(macroDataSize, buf.length - macroAddr);
    for (let b = 0; b < maxRead; b++) volModSeqData[b] = buf[macroAddr + b];

    // Check if macro data is all zeros (empty slot)
    let nonZero = false;
    for (let b = 0; b < maxRead; b++) {
      if (volModSeqData[b] !== 0) { nonZero = true; break; }
    }
    if (!nonZero) continue;

    // Decode the full 4-byte command stream for the macro editor
    macros.push(decodeTFMXMacro(buf, macroAddr, i));

    const tfmxConfig: TFMXConfig = {
      sndSeqsCount: 1,
      sndModSeqData,
      volModSeqData,
      sampleCount: 0,
      sampleHeaders: new Uint8Array(0),
      sampleData: new Uint8Array(0),
    };

    const uadeChipRam: UADEChipRamInfo = {
      moduleBase: 0,
      moduleSize: buf.length,
      instrBase: macroAddr,
      instrSize: macroDataSize,
      sections: {
        macroPtrTable,
        patPtrTable,
      },
    };

    instruments.push({
      id: i + 1,
      name: `Macro ${i + 1}`,
      type: 'synth' as const,
      synthType: 'TFMXSynth' as const,
      tfmx: tfmxConfig,
      uadeChipRam,
      effects: [],
      volume: 64,
      pan: 0,
      // Index into tfmxNative.macros for the macro editor
      metadata: { tfmxMacroIndex: i },
    } as InstrumentConfig);
  }

  // 10. Build uadePatternLayout for chip RAM editing
  const uadePatternLayout: UADEPatternLayout = {
    formatId: 'tfmx',
    patternDataFileOffset: patPtrTable, // not used directly (getCellFileOffset overrides)
    bytesPerCell: 4,
    rowsPerPattern: 1, // variable per pattern
    numChannels: NUM_CHANNELS,
    numPatterns: trackerPatterns.length,
    moduleSize: buf.length,
    encodeCell: encodeTFMXCell,
    decodeCell: (raw: Uint8Array): TrackerCell => {
      const b0 = raw[0], b1 = raw[1], b2 = raw[2], b3 = raw[3];

      if (b0 >= 0xF0) {
        // Pattern commands (F0=end, F1=loop, F3=wait, F5=key-up, etc.)
        if (b0 === 0xF5) return { note: 97, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
        if (b0 === 0xF0) return { note: 0, instrument: 0, volume: 0, effTyp: 0x0D, eff: 0, effTyp2: 0, eff2: 0 };
        if (b0 === 0xF3) return { note: 0, instrument: 0, volume: 0, effTyp: 0x0F, eff: (b1 + 1), effTyp2: 0, eff2: 0 };
        return { note: 0, instrument: 0, volume: 0, effTyp: b0 & 0x0F, eff: b1, effTyp2: 0, eff2: 0 };
      }
      if (b0 >= 0xC0) {
        // Portamento
        const noteIdx = b0 & 0x3F;
        const xmNote = tfmxNoteToXM(noteIdx);
        return { note: xmNote, instrument: b1 > 0 ? b1 + 1 : 0, volume: ((b2 >> 4) & 0x0F) * 4, effTyp: 0x03, eff: b3, effTyp2: 0, eff2: 0 };
      }
      // Note event (< 0xC0): < 0x80 = immediate, 0x80-0xBF = with wait
      const noteIdx = b0 & 0x3F;
      const xmNote = tfmxNoteToXM(noteIdx);
      const hasWait = (b0 & 0x80) !== 0;
      return {
        note: xmNote, instrument: b1 + 1, volume: ((b2 >> 4) & 0x0F) * 4,
        effTyp: hasWait ? 0x0F : 0, eff: hasWait ? b3 : 0,
        effTyp2: !hasWait && b3 !== 0 ? 0x0E : 0, eff2: !hasWait ? b3 : 0,
      };
    },
    getCellFileOffset: (pattern: number, row: number, channel: number): number => {
      if (pattern < 0 || pattern >= channelOffsetMaps.length) return -1;
      const map = channelOffsetMaps[pattern];
      if (channel < 0 || channel >= map.length) return -1;
      const offsets = map[channel];
      if (row < 0 || row >= offsets.length) return -1;
      return offsets[row];
    },
  };

  // 11. Build TFMXNativeData for the native editor
  const songName = (() => {
    const base = filename.split('/').pop() ?? filename;
    const lower = base.toLowerCase();
    for (const prefix of ['mdat.', 'tfmx.', 'tfx.']) {
      if (lower.startsWith(prefix)) return base.slice(prefix.length);
    }
    return base.replace(/\.[^/.]+$/, '');
  })();

  const tfmxNative: TFMXNativeData = {
    songName,
    textLines,
    songStarts,
    songEnds,
    songTempos,
    tracksteps: nativeTracksteps,
    patterns: nativePatterns,
    patternPointers,
    numVoices: NUM_CHANNELS,
    activeSubsong: clampedSong,
    firstStep,
    lastStep,
    macros,
    macroPointerTableOffset: macroPtrTable,
  };

  return {
    name:            songName,
    format:          'MOD' as TrackerFormat,
    patterns:        trackerPatterns,
    instruments,
    songPositions:   trackerPatterns.map((_, i) => i),
    songLength:      trackerPatterns.length,
    restartPosition: 0,
    numChannels:     NUM_CHANNELS,
    initialSpeed,
    initialBPM,
    linearPeriods:   false,
    uadePatternLayout,
    tfmxTimingTable,
    tfmxNative,
  };
}
