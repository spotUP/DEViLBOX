/**
 * SoundMasterParser.ts — Sound Master Amiga music format native parser
 *
 * Sound Master (versions 1.0–3.0) was written by Michiel J. Soede. The module
 * file is a compiled 68k Amiga executable combining player code and music data
 * in a single binary. MI_MaxSamples = 32 (from InfoBuffer in the player asm).
 *
 * Detection (from UADE "Sound Master_v1.asm", DTP_Check2 routine):
 *   1. word[0] must be 0x6000 (BRA.W opcode).
 *   2. word[1] (D2) must be: non-negative (< 0x8000 signed), non-zero, even.
 *   3. word[2] must be 0x6000.
 *   4. word[3] (D3) must be: non-negative, non-zero, even.
 *   5. word[4] must be 0x6000.
 *   6. Scan from (2 + D2) up to 30 bytes for 0x47FA (LEA pc-relative opcode).
 *   7. From that position, scan forward for 0x4E75 (RTS opcode). Let rtsEnd be
 *      the position immediately after the RTS word.
 *   8. Optional new-format check: if 4 bytes at (rtsEnd - 8) == 0x177C0000,
 *      set checkOff = rtsEnd - 6; otherwise checkOff = rtsEnd.
 *   9. Required: 4 bytes at (checkOff - 6) must equal 0x00BFE001.
 *
 * UADE eagleplayer.conf: SoundMaster  prefixes=sm,sm1,sm2,sm3,smpro
 *
 * Single-file format: player code + music data + samples all in one binary
 * blob. This parser extracts metadata only; UADE handles actual audio playback.
 *
 * Reference:
 *   third-party/uade-3.05/amigasrc/players/wanted_team/SoundMaster/Sound Master_v1.asm
 * Reference parsers: JeroenTelParser.ts, JasonPageParser.ts
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, Pattern, TrackerCell, ChannelData } from '@/types';

// NOTE: uadePatternLayout not added — Sound Master uses compiled 68k executable
// layout with variable-length note data discovered by opcode scanning. No fixed-size
// cell format exists. Requires UADEVariablePatternLayout with per-track tracking.

// ── Constants ───────────────────────────────────────────────────────────────

/**
 * Maximum number of samples as declared in InfoBuffer:
 *   MI_MaxSamples = 32
 */
const MAX_SAMPLES = 32;

const NUM_CHANNELS = 4;
const ROWS_PER_PATTERN = 64;

// ── Binary helpers ──────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  if (off + 1 >= buf.length) return 0;
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function i16BE(buf: Uint8Array, off: number): number {
  const v = u16BE(buf, off);
  return v < 0x8000 ? v : v - 0x10000;
}

function u32BE(buf: Uint8Array, off: number): number {
  if (off + 3 >= buf.length) return 0;
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

// ── Format detection ────────────────────────────────────────────────────────

/**
 * Return true if the buffer passes the full DTP_Check2 detection algorithm for
 * the Sound Master format.
 *
 * When `filename` is supplied the basename is also checked for the expected
 * UADE prefixes (sm., sm1., sm2., sm3., smpro.). If a prefix does not match,
 * detection returns false immediately to avoid false positives. The binary
 * detection is always performed regardless of filename.
 *
 * @param buffer    Raw file bytes
 * @param filename  Original filename (optional; used for prefix check)
 */
export function isSoundMasterFormat(buffer: ArrayBuffer, filename?: string): boolean {
  const buf = new Uint8Array(buffer);

  // ── Extension check (optional fast-reject) ───────────────────────────────
  // UADE eagleplayer.conf declares: prefixes=sm,sm1,sm2,sm3,smpro
  // In practice the reference files use these as file extensions (.sm, .smpro, .sm3).
  if (filename !== undefined) {
    const base = (filename.split('/').pop() ?? filename).toLowerCase();
    const validExtensions = ['.sm', '.sm1', '.sm2', '.sm3', '.smpro'];
    if (!validExtensions.some(ext => base.endsWith(ext))) return false;
  }

  // Minimum bytes: three BRA.W words at offsets 0, 4, 8 → need at least 10;
  // subsequent scan requires more. Gate on specific reads below.
  if (buf.length < 14) return false;

  // ── Three consecutive 0x6000 BRA.W words at offsets 0, 4, 8 ─────────────
  if (u16BE(buf, 0) !== 0x6000) return false;

  const d2 = u16BE(buf, 2);
  // D2 must be non-zero, non-negative (signed < 0x8000), and even
  if (d2 === 0 || d2 >= 0x8000 || (d2 & 1) !== 0) return false;

  if (u16BE(buf, 4) !== 0x6000) return false;

  const d3 = u16BE(buf, 6);
  // D3 must be non-zero, non-negative, and even
  if (d3 === 0 || d3 >= 0x8000 || (d3 & 1) !== 0) return false;

  if (u16BE(buf, 8) !== 0x6000) return false;

  // ── Scan for 0x47FA (LEA pc-relative) starting at (2 + D2) ───────────────
  // Scan limit is scanBase + 30 bytes (lea 30(A1), A0 in assembly)
  const scanBase = 2 + d2;
  const scanLimit = scanBase + 30;
  if (scanLimit + 1 >= buf.length) return false;

  let leaPos = -1;
  for (let pos = scanBase; pos < scanLimit && pos + 1 < buf.length; pos += 2) {
    if (u16BE(buf, pos) === 0x47fa) {
      leaPos = pos;
      break;
    }
  }
  if (leaPos === -1) return false;

  // ── Scan forward from leaPos for 0x4E75 (RTS) ────────────────────────────
  let rtsPos = -1;
  for (let pos = leaPos; pos + 1 < buf.length; pos += 2) {
    if (u16BE(buf, pos) === 0x4e75) {
      rtsPos = pos;
      break;
    }
  }
  if (rtsPos === -1) return false;

  // rtsEnd = position of A1 after the FindRTS loop (2 bytes past the RTS word)
  const rtsEnd = rtsPos + 2;

  // ── Optional new-format adjustment ───────────────────────────────────────
  // If 4 bytes at (rtsEnd - 8) == 0x177C0000, adjust checkOff back by 6
  let checkOff = rtsEnd;
  if (rtsEnd >= 8 && rtsEnd - 8 + 3 < buf.length && u32BE(buf, rtsEnd - 8) === 0x177c0000) {
    checkOff = rtsEnd - 6;
  }

  // ── Required check: 4 bytes at (checkOff - 6) must be 0x00BFE001 ─────────
  if (checkOff < 6 || checkOff - 6 + 3 >= buf.length) return false;
  return u32BE(buf, checkOff - 6) === 0x00bfe001;
}

// ── Data extraction helpers ─────────────────────────────────────────────────

/**
 * Sample info entry extracted from the module binary.
 * New format: 6 bytes per entry (u32 offset, u16 word-length).
 * Old format: 4 bytes offset + 2 bytes length in a different layout.
 */
interface SMSampleInfo {
  offset: number;   // byte offset to PCM data (relative to sample base)
  length: number;   // sample length in words (multiply by 2 for bytes)
}

/**
 * Song entry from the position list.
 * 3 bytes per entry: (byte0, byte1, byte2).
 * A null entry (0, 0, 1) marks the end.
 */
interface SMSongEntry {
  byte0: number;   // position / pattern index
  byte1: number;   // speed or second index
  byte2: number;   // end mark or flag
}

/**
 * Results of scanning the module binary for data structures.
 */
interface SMScanResult {
  isNewFormat: boolean;
  samples: SMSampleInfo[];
  songEntries: SMSongEntry[];
  numSubSongs: number;
  songLength: number;
}

/**
 * Scan the Sound Master module binary to extract sample info and song entries.
 *
 * Detection algorithm (from Sound Master_v1.asm InitPlayer):
 *
 * 1. Find the code entry: A1 = module + 2 + word@(module+2)
 * 2. Determine format variant (new vs old) by scanning for specific opcodes
 * 3. Scan for $1743 (MOVE.B (D7,A3),D3) to find the position/song data
 * 4. Scan for $41EB (LEA d16(A3),A0) to find the sample info table (new format)
 *    or $3D70 / $D5F0 for old format
 *
 * Returns null if the scan fails.
 */
function scanSMStructures(buf: Uint8Array): SMScanResult | null {
  try {
    if (buf.length < 14) return null;

    const d2 = u16BE(buf, 2);  // first BRA displacement
    const moduleBase = 0;

    // A1 = module + 2 + d2 (second init entry point)
    const a1Init = 2 + d2;
    if (a1Init >= buf.length) return null;

    // Determine format: check for $1740 at specific offsets
    let isNewFormat = false;
    if (a1Init + 8 < buf.length) {
      if (u16BE(buf, a1Init + 6) === 0x1740 || u16BE(buf, a1Init + 4) === 0x1740) {
        isNewFormat = true;
      }
    }

    // ── Find position/song data via $1743 scan ─────────────────────────────

    let positionOff = -1;
    let songAnchorOff = -1;

    // The $1743 scan in InitPlayer starts from module base (A0)
    for (let i = moduleBase; i + 1 < buf.length && i < buf.length - 2; i += 2) {
      if (u16BE(buf, i) === 0x1743) {
        songAnchorOff = i + 2;  // displacement word follows the opcode
        break;
      }
    }

    // After finding $1743, locate the $47FA (LEA pc-relative) scan
    // which gives us the song data base pointer (A6/A3)
    let songBase = -1;
    if (a1Init + 40 < buf.length) {
      // Find $47FA or $3C00 near A1 to locate the data base
      for (let i = a1Init; i + 3 < buf.length && i < a1Init + 200; i += 2) {
        if (u16BE(buf, i) === 0x47fa) {
          const disp = i16BE(buf, i + 2);
          songBase = i + 2 + disp;
          break;
        }
      }
    }

    // Read position data: the $1743 displacement gives offset to song entries
    const songEntries: SMSongEntry[] = [];
    if (songAnchorOff >= 0 && songBase >= 0) {
      const songDisp = i16BE(buf, songAnchorOff);
      positionOff = songBase + songDisp;

      // Song entries start at positionOff + 3 (per InitPlayer: ADDQ #3,A3)
      let entryOff = positionOff + 3;
      if (entryOff < 0) entryOff = positionOff;

      for (let i = 0; i < 8 && entryOff + 2 < buf.length; i++) {
        const b0 = buf[entryOff];
        const b1 = buf[entryOff + 1];
        const b2 = buf[entryOff + 2];

        // Null entry (0, 0, 1) marks end
        if (b0 === 0 && b1 === 0 && b2 === 1) break;

        songEntries.push({ byte0: b0, byte1: b1, byte2: b2 });
        entryOff += 3;
      }
    }

    // ── Find sample info via $41EB scan (new format) ────────────────────────

    const samples: SMSampleInfo[] = [];

    if (isNewFormat || songEntries.length === 0) {
      // Scan for $41EB (LEA d16(A3),A0) starting from init code area
      let sampleInfoOff = -1;
      const scanStart = a1Init;

      for (let i = scanStart; i + 5 < buf.length && i < scanStart + 2000; i += 2) {
        if (u16BE(buf, i) === 0x41eb) {
          // Found LEA d16(A3),A0 — displacement gives sample info offset
          if (songBase >= 0) {
            const disp = i16BE(buf, i + 2);
            sampleInfoOff = songBase + disp;

            // Read additional displacement to get actual sample info address
            const disp2Off = i + 4;
            if (disp2Off + 1 < buf.length) {
              const disp2 = i16BE(buf, disp2Off);
              const sampleTableBase = songBase + disp2;
              if (sampleTableBase >= 0 && sampleTableBase + 4 < buf.length) {
                const sampleDataOff = u32BE(buf, sampleTableBase);
                sampleInfoOff = sampleInfoOff + sampleDataOff;
              }
            }
          }
          break;
        }
      }

      // Parse sample info table: each entry is 6 bytes (u32 offset, u16 word-length)
      if (sampleInfoOff > 0 && sampleInfoOff < buf.length) {
        for (let i = 0; i < MAX_SAMPLES; i++) {
          const entryOff = sampleInfoOff + i * 6;
          if (entryOff + 5 >= buf.length) break;

          const sampleOff = u32BE(buf, entryOff);
          const wordLen = u16BE(buf, entryOff + 4);

          // Negative offset means unused (per InitPlayer: bmi.b NoUsed)
          if (sampleOff >= 0x80000000) continue;
          if (wordLen === 0) continue;

          samples.push({ offset: sampleOff, length: wordLen });
        }
      }
    }

    // If no samples found via scan, try reading from known offsets
    if (samples.length === 0) {
      // Old format scan: look for $D5F0 or $3D70
      for (let i = a1Init; i + 3 < buf.length && i < a1Init + 2000; i += 2) {
        if (u16BE(buf, i) === 0xd5f0 || u16BE(buf, i) === 0x3d70) {
          // Try to extract sample info from old format layout
          // Old format has 128-byte offset to sample lengths (32 × u16 word pairs)
          if (songBase >= 0) {
            const baseOff = songBase;
            for (let s = 0; s < MAX_SAMPLES && baseOff + s * 4 + 3 < buf.length; s++) {
              const off = u32BE(buf, baseOff + s * 4);
              if (off >= 0x80000000 || off === 0) continue;
              samples.push({ offset: off, length: 0 });
            }
          }
          break;
        }
      }
    }

    // Determine song length from position data
    let songLength = 0;
    if (positionOff >= 0 && positionOff < buf.length) {
      songLength = buf[positionOff] || 1;
    }

    return {
      isNewFormat,
      samples,
      songEntries,
      numSubSongs: Math.max(1, songEntries.length),
      songLength: Math.max(1, songLength),
    };
  } catch {
    return null;
  }
}

/**
 * Standard Amiga period table for Amiga note detection.
 * Maps period values to note indices (C-1 = 0 through B-5 = 59).
 */
const AMIGA_PERIODS = [
  856,808,762,720,678,640,604,570,538,508,480,453,  // Octave 1
  428,404,381,360,339,320,302,285,269,254,240,226,  // Octave 2
  214,202,190,180,170,160,151,143,135,127,120,113,  // Octave 3
  107,101, 95, 90, 85, 80, 76, 71, 67, 64, 60, 57, // Octave 4
];

/**
 * Find the closest Amiga note index for a given period value.
 * Returns -1 if no reasonable match found.
 */
function periodToNoteIndex(period: number): number {
  if (period < 50 || period > 1000) return -1;
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < AMIGA_PERIODS.length; i++) {
    const dist = Math.abs(period - AMIGA_PERIODS[i]);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  // Allow +/- 5 tolerance for finetune variations
  return bestDist <= 5 ? bestIdx : -1;
}

/**
 * Scan the data area of the module for Amiga period values to reconstruct
 * basic pattern data. This is a heuristic approach since the exact pattern
 * cell encoding varies between Sound Master versions.
 *
 * We scan for consecutive u16BE values that match known Amiga periods,
 * which indicates likely note data.
 */
function extractSMNoteData(
  buf: Uint8Array,
  startOff: number,
  endOff: number,
): { notes: number[]; positions: number[] } {
  const notes: number[] = [];
  const positions: number[] = [];

  const scanEnd = Math.min(endOff, buf.length - 2);
  for (let i = startOff; i < scanEnd; i += 2) {
    const word = u16BE(buf, i);
    const noteIdx = periodToNoteIndex(word);
    if (noteIdx >= 0) {
      // Convert to tracker note: noteIndex + 25 (Amiga convention)
      const trackerNote = noteIdx + 25;
      if (trackerNote >= 1 && trackerNote <= 96) {
        notes.push(trackerNote);
        positions.push(i);
      }
    }
  }

  return { notes, positions };
}

/**
 * Build tracker patterns from extracted note data and song structure.
 */
function buildSMPatterns(
  scanResult: SMScanResult,
  buf: Uint8Array,
  filename: string,
): { patterns: Pattern[]; songPositions: number[] } {
  const numInstr = Math.max(1, scanResult.samples.length);

  // Determine data area to scan for periods
  // The data area is typically after the code section. Use the second BRA
  // displacement as a rough estimate of where data might start.
  const d2 = u16BE(buf, 2);
  const d3 = u16BE(buf, 6);
  const codeEnd = Math.max(2 + d2, 6 + d3);
  const dataStart = Math.min(codeEnd + 100, buf.length);
  const dataEnd = buf.length;

  const { notes } = extractSMNoteData(buf, dataStart, dataEnd);

  if (notes.length === 0) {
    return { patterns: [], songPositions: [0] };
  }

  // Distribute notes across 4 channels into 64-row patterns
  const numPat = Math.max(1, Math.ceil(notes.length / (ROWS_PER_PATTERN * NUM_CHANNELS)));
  const patternLimit = Math.min(numPat, 128);
  const patterns: Pattern[] = [];
  let noteIdx = 0;

  for (let p = 0; p < patternLimit; p++) {
    const channels: ChannelData[] = [];

    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const rows: TrackerCell[] = [];

      for (let r = 0; r < ROWS_PER_PATTERN; r++) {
        if (noteIdx < notes.length && (r % 2 === 0 || noteIdx < notes.length * 0.8)) {
          // Place notes with some spacing for readability
          const instrNum = Math.min(numInstr, (noteIdx % numInstr) + 1);
          rows.push({
            note: notes[noteIdx],
            instrument: instrNum,
            volume: 0,
            effTyp: 0,
            eff: 0,
            effTyp2: 0,
            eff2: 0,
          });
          noteIdx++;
        } else {
          rows.push({
            note: 0, instrument: 0, volume: 0,
            effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
          });
        }
      }

      channels.push({
        id: `p${p}-ch${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: (ch === 0 || ch === 3) ? -50 : 50,
        instrumentId: null,
        color: null,
        rows,
      });
    }

    patterns.push({
      id: `pattern-${p}`,
      name: `Pattern ${p}`,
      length: ROWS_PER_PATTERN,
      channels,
      importMetadata: {
        sourceFormat: 'MOD' as const,
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: NUM_CHANNELS,
        originalPatternCount: patternLimit,
        originalInstrumentCount: numInstr,
      },
    });
  }

  return {
    patterns,
    songPositions: patterns.map((_, i) => i),
  };
}

// ── Prefix helpers ──────────────────────────────────────────────────────────

/**
 * Strip the Sound Master UADE prefix from a basename to derive the module title.
 * Handles: smpro., sm3., sm2., sm1., sm.  (longest match first).
 */
function stripSoundMasterPrefix(name: string): string {
  return (
    name
      .replace(/^smpro\./i, '')
      .replace(/^sm3\./i, '')
      .replace(/^sm2\./i, '')
      .replace(/^sm1\./i, '')
      .replace(/^sm\./i, '')
      .replace(/\.(smpro|sm3|sm2|sm1|sm)$/i, '') || name
  );
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse a Sound Master module file into a TrackerSong.
 *
 * Sound Master modules are compiled 68k Amiga executables. This parser
 * scans the binary for sample info tables (via $41EB opcode scan), song
 * entries (via $1743 opcode scan), and reconstructs pattern data by
 * scanning for Amiga period values in the data area. Actual audio
 * playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive module name)
 */
export async function parseSoundMasterFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  if (!isSoundMasterFormat(buffer, filename)) {
    throw new Error('Not a Sound Master module');
  }

  const buf = new Uint8Array(buffer);

  // ── Module name from filename ─────────────────────────────────────────────

  const base = filename.split('/').pop() ?? filename;
  const moduleName = stripSoundMasterPrefix(base) || base;

  // ── Scan binary for data structures ───────────────────────────────────────

  let scanResult: SMScanResult | null = null;
  try {
    scanResult = scanSMStructures(buf);
  } catch {
    // Fall through to defaults
  }

  // ── Build instruments from sample info or use placeholders ────────────────

  const instruments: InstrumentConfig[] = [];
  const numInstruments = (scanResult && scanResult.samples.length > 0)
    ? scanResult.samples.length
    : MAX_SAMPLES;

  for (let i = 0; i < numInstruments; i++) {
    const sampleInfo = scanResult?.samples[i];
    const sampleLen = sampleInfo ? sampleInfo.length * 2 : 0;
    instruments.push({
      id: i + 1,
      name: sampleLen > 0 ? `Sample ${i + 1} (${sampleLen}b)` : `Sample ${i + 1}`,
      type: 'synth' as const,
      synthType: 'Synth' as const,
      effects: [],
      volume: 0,
      pan: 0,
    } as InstrumentConfig);
  }

  // ── Extract patterns or fall back to placeholder ──────────────────────────

  let patterns: Pattern[];
  let songPositions: number[];
  let songLength: number;

  const extracted = scanResult
    ? buildSMPatterns(scanResult, buf, filename)
    : null;

  if (extracted && extracted.patterns.length > 0) {
    patterns = extracted.patterns;
    songPositions = extracted.songPositions;
    songLength = songPositions.length;
  } else {
    // Fallback: single empty pattern
    const emptyRows = Array.from({ length: ROWS_PER_PATTERN }, () => ({
      note: 0, instrument: 0, volume: 0,
      effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
    }));

    patterns = [{
      id: 'pattern-0',
      name: 'Pattern 0',
      length: ROWS_PER_PATTERN,
      channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: (ch === 0 || ch === 3) ? -50 : 50,
        instrumentId: null,
        color: null,
        rows: emptyRows,
      })),
      importMetadata: {
        sourceFormat: 'MOD' as const,
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: NUM_CHANNELS,
        originalPatternCount: 1,
        originalInstrumentCount: numInstruments,
      },
    }];
    songPositions = [0];
    songLength = 1;
  }

  return {
    name: `${moduleName} [Sound Master]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
  };
}
