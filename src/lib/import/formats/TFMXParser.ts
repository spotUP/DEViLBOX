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
import { encodeTFMXCell } from '@/engine/uade/encoders/TFMXEncoder';

// ── Constants ─────────────────────────────────────────────────────────────────

const TFMX_MIN_SIZE = 0x200;
const TFMX_SONG_SLOTS = 32;
const TFMX_TRACKSTEP_UNPACKED = 0x600;
const TFMX_PATTERN_PTR_UNPACKED = 0x200;
const TFMX_MACRO_PTR_UNPACKED = 0x400;
const TFMX_TRACKSTEP_ENTRY_SIZE = 16;
const TFMX_TRACK_END = 0xFF;
const TFMX_TRACK_HOLD = 0x80;
const NUM_CHANNELS = 4;
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
        // F0 = End pattern — show as pattern break, then stop
        commands.push({
          cell: { note: 0, instrument: 0, volume: 0, effTyp: 0x0D, eff: 0, effTyp2: 0, eff2: 0 },
          fileOffset,
        });
        break;
      }

      if (cmdType === 4) {
        // F4 = Stop — show as pattern break, then stop
        commands.push({
          cell: { note: 0, instrument: 0, volume: 0, effTyp: 0x0D, eff: 0, effTyp2: 0, eff2: 0 },
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

  // 3b. Read data base offset at h+0x0C.
  // In TFMX Professional, pattern/macro data pointers in the pointer tables are
  // RELATIVE to this base offset, not absolute file positions.
  const dataBase = u32BE(buf, h + 0x0C);

  // 4. Read pattern pointer table (up to 128 u32BE entries)
  // Number of patterns = (macroStart - patternStart) / 4, capped at 128
  const numPatternSlots = Math.min(
    Math.floor((macroPtrTable - patPtrTable) / 4),
    MAX_PATTERN_POINTERS,
  );
  const patternPointers: number[] = [];
  for (let i = 0; i < numPatternSlots; i++) {
    const raw = u32BE(buf, patPtrTable + i * 4);
    // Apply data base offset for relative pointers. Pointers >= 0xFF000000
    // are invalid/unused slots. Pointers that already exceed dataBase are
    // likely already absolute (some TFMX variants use absolute offsets).
    if (raw === 0 || raw >= 0xFF000000) {
      patternPointers.push(raw);
    } else if (dataBase > 0 && raw < dataBase) {
      patternPointers.push(raw + dataBase);
    } else {
      patternPointers.push(raw);
    }
  }

  // 5. Decode all TFMX patterns
  const decodedPatterns: DecodedTFMXCommand[][] = [];
  for (let i = 0; i < patternPointers.length; i++) {
    const ptr = patternPointers[i];
    if (ptr === 0 || ptr >= buf.length) {
      decodedPatterns.push([]);
      continue;
    }
    decodedPatterns.push(decodeTFMXPattern(buf, ptr));
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

    // Read voice assignments for this step
    const voicePatNums: number[] = [];
    let isEnd = false;

    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const hi = buf[stepOff + ch * 2];
      if (hi === TFMX_TRACK_END) { isEnd = true; break; }
      if (hi >= 0xFE) {
        // 0xFE = stop voice, treat as no pattern
        voicePatNums.push(-1);
      } else if (hi === TFMX_TRACK_HOLD) {
        // Hold previous pattern (no new assignment)
        voicePatNums.push(-1);
      } else {
        voicePatNums.push(hi);
      }
    }

    if (isEnd) break;

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
        pan:          (ch === 0 || ch === 3) ? -50 : 50,
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
        pan:          (ch === 0 || ch === 3) ? -50 : 50,
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

  // 8. Determine initial BPM/speed from tempo value
  let initialBPM   = 125;
  let initialSpeed = 6;
  if (tempo > 15) {
    initialBPM = tempo;
  } else if (tempo > 0) {
    initialBPM   = Math.round(50 / (tempo + 1) * 2.5);
    initialSpeed = tempo + 1;
  }

  // 9. Extract instrument data from the macro table
  const instruments: InstrumentConfig[] = [];
  const MAX_INSTRUMENTS = 128;
  const MACRO_ENTRY_SIZE = 4; // macro pointer table has u32BE entries

  // Count macros from the pointer table
  const numMacroSlots = Math.min(
    Math.floor((trackstepOff - macroPtrTable) / MACRO_ENTRY_SIZE),
    MAX_INSTRUMENTS,
  );

  for (let i = 0; i < numMacroSlots; i++) {
    const macroAddr = u32BE(buf, macroPtrTable + i * MACRO_ENTRY_SIZE);
    if (macroAddr === 0 || macroAddr >= buf.length) continue;

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
      synthType: 'Synth' as const,
      tfmx: tfmxConfig,
      uadeChipRam,
      effects: [],
      volume: 64,
      pan: 0,
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
    getCellFileOffset: (pattern: number, row: number, channel: number): number => {
      if (pattern < 0 || pattern >= channelOffsetMaps.length) return -1;
      const map = channelOffsetMaps[pattern];
      if (channel < 0 || channel >= map.length) return -1;
      const offsets = map[channel];
      if (row < 0 || row >= offsets.length) return -1;
      return offsets[row];
    },
  };

  return {
    name:            filename.replace(/\.[^/.]+$/, ''),
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
  };
}
