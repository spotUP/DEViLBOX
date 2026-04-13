/**
 * RobHubbardParser.ts — Rob Hubbard Amiga music format (rh.*) native parser
 *
 * Rob Hubbard composed music for many classic Amiga games. The player was
 * adapted by Wanted Team for EaglePlayer / DeliTracker. The module file is a
 * compiled 68k Amiga executable combining player code and music data in a
 * single file.
 *
 * Detection (from UADE "Rob Hubbard_v7.asm", DTP_Check2 routine):
 *   The check verifies five consecutive BRA branch opcodes at fixed offsets
 *   followed by two specific opcode constants:
 *
 *   1. word  at offset  0 == 0x6000  (BRA — unconditional branch)
 *   2. word  at offset  4 == 0x6000
 *   3. word  at offset  8 == 0x6000
 *   4. word  at offset 12 == 0x6000
 *   5. word  at offset 16 == 0x6000
 *   6. word  at offset 20 == 0x41FA  (LEA pc-relative)
 *   7. u32BE at offset 28 == 0x4E7541FA  (RTS + LEA pc-relative)
 *
 *   File must be at least 32 bytes for the checks to be performed.
 *
 * UADE eagleplayer.conf: RobHubbard  prefixes=rh
 * MI_MaxSamples = 13 (from InfoBuffer in Rob Hubbard_v7.asm).
 *
 * Sample table extraction algorithm (from Rob Hubbard.s EagleRipper + Rob Hubbard_v7.asm
 * InitPlayer routine):
 *
 *   Step 1 — Find sample count:
 *     Scan from offset 64 for the word $2418 (MOVE.B (A0)+,D4).
 *     When found at offset F, the sample count is the byte at F-1.
 *
 *   Step 2 — Find sample table start:
 *     Scan from offset 54 for the word $41FA (LEA d16(PC),An).
 *     When found at offset F, the displacement word d16 is at F+2.
 *     If the word at F+4 == $D1FC (ADD.L #imm,A0), apply a 0x40-byte variant skip.
 *     Sample table start = (F+2 [optionally +0x40]) + sign_extend(d16)
 *     (This is the standard 68k PC-relative address computation.)
 *
 *   Step 3 — Parse sample blobs:
 *     Each blob: [u32BE pcmLen][2 bytes header][pcmLen bytes signed PCM]
 *     Total blob size = pcmLen + 6.  Blobs are followed by a $4E71 (NOP) end marker.
 *
 * Single-file format: player code + music data in one binary blob.
 *
 * Reference: third-party/uade-3.05/amigasrc/players/wanted_team/RobHubbard/src/Rob Hubbard_v7.asm
 * Reference: third-party/uade-3.05/amigasrc/players/wanted_team/RobHubbard/src/Rob Hubbard.s
 * Reference parsers: JeroenTelParser.ts, JasonPageParser.ts
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, Pattern } from '@/types';
import type { RobHubbardConfig, UADEChipRamInfo } from '@/types/instrument';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { DEFAULT_ROB_HUBBARD } from '@/types/instrument';
import { encodeRobHubbardCell } from '@/engine/uade/encoders/RobHubbardEncoder';
import { decodeMODCell } from '@/engine/uade/encoders/MODEncoder';

// ── Constants ───────────────────────────────────────────────────────────────

/**
 * Minimum file size required for the detection checks to be safe.
 * The last checked field is a u32BE at offset 28, so we need at least 32 bytes.
 */
const MIN_FILE_SIZE = 32;

/**
 * Maximum number of placeholder instruments to create.
 * Matches MI_MaxSamples = 13 declared in the InfoBuffer of Rob Hubbard_v7.asm.
 */
const MAX_INSTRUMENTS = 13;

/**
 * Maximum allowed PCM sample length (sanity check matching UADE's cmp.l #$10000,D1).
 */
const MAX_SAMPLE_LEN = 0x10000;

// ── Binary helpers ──────────────────────────────────────────────────────────

function u8(buf: Uint8Array, off: number): number {
  if (off < 0 || off >= buf.length) return 0;
  return buf[off] & 0xFF;
}

function s8(buf: Uint8Array, off: number): number {
  const v = u8(buf, off);
  return v < 128 ? v : v - 256;
}

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

/** Signed 16-bit big-endian read. */
function i16BE(buf: Uint8Array, off: number): number {
  const v = u16BE(buf, off);
  return v >= 0x8000 ? v - 0x10000 : v;
}

// ── Format detection ────────────────────────────────────────────────────────

/**
 * Return true if the buffer passes the full DTP_Check2 detection algorithm.
 *
 * When `filename` is supplied the basename is also checked for the expected
 * UADE prefix (`rh.`). The prefix check alone is not sufficient; the binary
 * scan is always performed.
 *
 * @param buffer    Raw file bytes
 * @param filename  Original filename (optional; used for prefix fast-reject)
 */
export function isRobHubbardFormat(buffer: ArrayBuffer, filename?: string): boolean {
  const buf = new Uint8Array(buffer);

  // ── Prefix check (optional fast-reject) ──────────────────────────────────
  if (filename !== undefined) {
    const base = (filename.split('/').pop() ?? filename).toLowerCase();
    if (!base.startsWith('rh.') && !base.endsWith('.rh')) return false;
  }

  // ── Minimum size ─────────────────────────────────────────────────────────
  if (buf.length < MIN_FILE_SIZE) return false;

  // ── Binary signature checks (DTP_Check2) ─────────────────────────────────
  if (u16BE(buf,  0) !== 0x6000)     return false;
  if (u16BE(buf,  4) !== 0x6000)     return false;
  if (u16BE(buf,  8) !== 0x6000)     return false;
  if (u16BE(buf, 12) !== 0x6000)     return false;
  if (u16BE(buf, 16) !== 0x6000)     return false;
  if (u16BE(buf, 20) !== 0x41FA)     return false;
  if (u32BE(buf, 28) !== 0x4e7541fa) return false;

  return true;
}

// ── Sample table extraction ──────────────────────────────────────────────────

/**
 * Locate the sample table and count in the Rob Hubbard binary.
 *
 * Uses the algorithm from Rob Hubbard_v7.asm (InitPlayer) and Rob Hubbard.s
 * (EagleRipper):
 *
 *   1. Scan from offset 64 for the opcode $2418.  The byte at (found-1) is the
 *      sample count (0-based dbf loop counter, so actual count = byte+1).
 *   2. Scan from offset 54 for $41FA (LEA d16(PC)).  The word following is the
 *      PC-relative displacement: sample_table = disp_word_offset + displacement.
 *      If $D1FC (ADD.L) follows, add 0x40 first (variant skip, from ripper).
 *
 * Returns null if the scan fails or the computed offset is out-of-bounds.
 */
function findSampleTable(buf: Uint8Array): { tableOffset: number; count: number } | null {
  // ── Step 1: find sample count ─────────────────────────────────────────────
  // Scan for MOVE.L (A0)+,D2 opcode 0x2418 — the count byte precedes it
  let sampleCount = -1;
  const step1Limit = Math.min(256, buf.length - 2);
  for (let off = 64; off < step1Limit; off += 2) {
    if (u16BE(buf, off) === 0x2418) {
      if (off - 1 >= 0) {
        sampleCount = buf[off - 1];
      }
      break;
    }
  }
  if (sampleCount < 0) return null;

  // ── Step 2: find sample table offset ─────────────────────────────────────
  // Scan for LEA pc-relative opcode 0x41FA
  let d16Pos = -1;
  const step2Limit = Math.min(128, buf.length - 2);
  for (let off = 40; off < step2Limit; off += 2) {
    if (u16BE(buf, off) === 0x41FA) {
      d16Pos = off + 2; // displacement word is immediately after the opcode
      break;
    }
  }
  if (d16Pos < 0 || d16Pos + 2 > buf.length) return null;

  const displacement = i16BE(buf, d16Pos);

  // Variant skip: if $D1FC (ADD.L #imm,A0) is at d16Pos+2, add 0x40
  let a1 = d16Pos;
  if (d16Pos + 4 <= buf.length && u16BE(buf, d16Pos + 2) === 0xD1FC) {
    a1 += 0x40;
  }

  // 68k PC-relative: EA = address_of_d16 + displacement
  const tableOffset = a1 + displacement;
  if (tableOffset < 0 || tableOffset >= buf.length) return null;

  // actual sample count = sampleCount + 1  (dbf loop counter is 0-based)
  return { tableOffset, count: sampleCount + 1 };
}

/**
 * Parse the sample table and return one RobHubbardConfig per sample.
 *
 * Each sample blob layout (big-endian):
 *   +0  uint32  pcmLen   — PCM data length in bytes
 *   +4  uint8   vol      — possible volume byte (0–64 range), from blob header
 *   +5  uint8   unused
 *   +6  int8[]  PCM data — signed 8-bit PCM, pcmLen bytes
 *
 * Total blob size = pcmLen + 6.
 *
 * All synth parameters other than sampleData/sampleVolume/sampleLen are set to
 * safe defaults (relative=1024 → identity period, divider=0 → no vibrato, etc.)
 * because the exact synth parameters are encoded in 68k machine code and cannot
 * be extracted without emulation.
 */
interface SampleBlobResult {
  config: RobHubbardConfig;
  /** File-relative byte offset of the start of this blob (the u32BE pcmLen field). */
  blobOffset: number;
  /** Total blob size in bytes: pcmLen + 6 (4-byte length + 2-byte header + PCM). */
  blobSize: number;
}

function parseSampleBlobs(
  buf: Uint8Array,
  tableOffset: number,
  count: number,
): SampleBlobResult[] {
  const results: SampleBlobResult[] = [];
  let pos = tableOffset;

  for (let i = 0; i < count; i++) {
    if (pos + 6 > buf.length) break;

    const pcmLen = u32BE(buf, pos);

    // Sanity check: matches UADE's cmp.l #$10000,D1
    if (pcmLen === 0 || pcmLen > MAX_SAMPLE_LEN) break;

    // Volume may be in byte at +4 (header area before PCM data).
    // If it's in the 0-64 Amiga volume range, use it; otherwise default to 64.
    const headerByte4 = buf[pos + 4];
    const sampleVolume = headerByte4 <= 64 ? headerByte4 : 64;

    if (pos + 6 + pcmLen > buf.length) break;

    // Extract PCM as signed int8 array
    const pcmSlice = buf.slice(pos + 6, pos + 6 + pcmLen);
    const sampleData: number[] = new Array(pcmLen);
    for (let j = 0; j < pcmLen; j++) {
      const byte = pcmSlice[j];
      sampleData[j] = byte >= 128 ? byte - 256 : byte;
    }

    const config: RobHubbardConfig = {
      sampleLen:     pcmLen,
      loopOffset:    -1,    // no loop — loop info is encoded in 68k code
      sampleVolume:  sampleVolume || 64,
      relative:      1024,  // identity: period = PERIODS[note] * 1024 >> 10 = PERIODS[note]
      divider:       0,     // no vibrato — divider stored in 68k code, not extractable
      vibratoIdx:    0,
      hiPos:         0,     // no wobble
      loPos:         0,
      vibTable:      [],
      sampleData,
    };

    results.push({ config, blobOffset: pos, blobSize: pcmLen + 6 });

    pos += pcmLen + 6;
  }

  return results;
}

// ── Song header and pattern extraction ──────────────────────────────────────

/**
 * Convert an RH/Amiga note index (0-59) to a tracker note value (1-96).
 * Same mapping as DW: tracker_note = amiga_index + 25.
 */
function rhNoteToTrackerNote(idx: number): number {
  const n = idx + 25;
  return (n >= 1 && n <= 96) ? n : 0;
}

interface RHSong {
  speed: number;
  tracks: number[];  // per-channel file offsets to track lists (4 u32 pointers)
}

interface RHEvent {
  tick: number;
  note: number;       // tracker note (1-96), 0 = no note, 97 = note off
  instrument: number; // 1-based, 0 = no change
  effTyp: number;
  eff: number;
}

/**
 * Scan the RH binary to find song headers (speed + per-channel track pointers).
 * Ported from FlodJS RHPlayer.js loader().
 *
 * The RH binary has song headers at an offset found via:
 *   0xc0fc (mulu.w #x,d0) → check for 0x41eb (lea x(a3),a0) → songsHeaders offset
 *
 * Each song: [1 pad byte, 1 speed byte, 4×4 = 16 track pointer bytes] = 18 bytes
 */
function findRHSongs(buf: Uint8Array): { songs: RHSong[]; samplesDataOffset: number } | null {
  let songsHeaders = 0;
  let samplesData = 0;

  // Scan from offset 44 through 1024 looking for opcodes
  let pos = 44;
  while (pos < Math.min(1024, buf.length - 6)) {
    const value = u16BE(buf, pos);
    pos += 2;

    if (value === 0x7e10 || value === 0x7e20) {
      // moveq #16,d7 or moveq #32,d7 — sample data region
      const next = u16BE(buf, pos);
      if (next === 0x41fa) {  // lea $x,a0
        pos += 2;
        const sampleDataBase = pos + u16BE(buf, pos);
        pos += 2;
        const addi = u16BE(buf, pos);
        if (addi === 0xd1fc) {  // adda.l
          pos += 2;
          samplesData = sampleDataBase + u32BE(buf, pos);
          pos += 4;
        } else {
          samplesData = sampleDataBase;
        }
        if (pos + 2 < buf.length) {
          pos += 2; // skip samplesHeaders offset
          if (pos < buf.length && u8(buf, pos) === 0x72) {
            pos += 2; // skip moveq + count byte
          }
        }
      } else {
        pos += 2;
      }
    } else if (value === 0xc0fc) {
      // mulu.w #x,d0 — may contain songsHeaders
      pos += 2;  // skip immediate
      const lea = u16BE(buf, pos);
      if (lea === 0x41eb) {  // lea $x(a3),a0
        pos += 2;
        songsHeaders = u16BE(buf, pos);
        pos += 2;
      } else {
        pos += 2;
      }
    } else if (value === 0x4240) {
      // clr.w d0 — period table follows, end of scan
      break;
    }
  }

  if (!songsHeaders || songsHeaders >= buf.length) return null;

  // Parse song headers
  const songs: RHSong[] = [];
  pos = songsHeaders;
  let lowestTrack = 0x7fffffff;
  let songLimit = 0;

  while (pos + 18 <= buf.length && songLimit++ < 32) {
    pos++;  // skip pad byte
    const speed = u8(buf, pos); pos++;
    if (speed === 0 || speed > 255) break;

    const song: RHSong = { speed, tracks: [] };
    for (let ch = 0; ch < 4; ch++) {
      const trackPtr = u32BE(buf, pos);
      pos += 4;
      if (trackPtr > 0 && trackPtr < lowestTrack) lowestTrack = trackPtr;
      song.tracks.push(trackPtr);
    }

    songs.push(song);
    if ((lowestTrack - pos) < 18) break;
  }

  return { songs, samplesDataOffset: samplesData };
}

const MAX_RH_EVENTS = 16384;

/**
 * Parse an RH pattern byte stream for a single channel.
 *
 * RH byte stream format (from FlodJS RHPlayer.js process()):
 *   Positive byte (0-127): Duration multiplier, followed by note byte
 *     ticks = song.speed * value
 *   -128: Sample change (next signed byte = sample index)
 *   -127: Portamento (next signed byte = speed)
 *   -126: Rest (next byte = duration multiplier, ticks = speed * value)
 *   -125: Sustain flag (variant 4)
 *   -124: End of pattern → next from track list
 *   -123: Song end
 *   -122: Volume set (variant 4, next byte)
 *   -121: Volume set (variant 3, next byte)
 */
function parseRHChannelStream(
  buf: Uint8Array,
  song: RHSong,
  channelIdx: number,
): RHEvent[] {
  const events: RHEvent[] = [];
  const trackPtr = song.tracks[channelIdx];
  if (!trackPtr || trackPtr >= buf.length) return events;

  const speed = song.speed;
  let currentSample = 1;
  let tick = 0;

  // Read first pattern address from track list (u32)
  let trackPos = 4;
  let patternPos = u32BE(buf, trackPtr);
  if (patternPos === 0 || patternPos >= buf.length) return events;

  let safety = 0;
  while (safety++ < MAX_RH_EVENTS) {
    if (patternPos < 0 || patternPos >= buf.length) break;
    const value = s8(buf, patternPos);
    patternPos++;

    if (value >= 0) {
      // Note: value = duration multiplier, next byte = note
      const duration = speed * value;
      if (patternPos >= buf.length) break;
      const noteIdx = s8(buf, patternPos);
      patternPos++;

      const trackerNote = rhNoteToTrackerNote(noteIdx);
      if (trackerNote > 0) {
        events.push({
          tick,
          note: trackerNote,
          instrument: currentSample,
          effTyp: 0,
          eff: 0,
        });
      }
      tick += duration || speed;
    } else {
      switch (value) {
        case -128: {
          // Sample change: next signed byte = sample index
          if (patternPos >= buf.length) { safety = MAX_RH_EVENTS; break; }
          let smpIdx = s8(buf, patternPos);
          patternPos++;
          if (smpIdx < 0) smpIdx = 0;
          currentSample = smpIdx + 1;  // 1-based
          break;
        }
        case -127:
          // Portamento: next byte = speed
          patternPos++;
          break;
        case -126: {
          // Rest: next byte = duration multiplier
          if (patternPos >= buf.length) { safety = MAX_RH_EVENTS; break; }
          const durByte = s8(buf, patternPos);
          patternPos++;
          const duration = speed * (durByte > 0 ? durByte : 1);
          events.push({
            tick,
            note: 97,  // note-off
            instrument: 0,
            effTyp: 0,
            eff: 0,
          });
          tick += duration;
          break;
        }
        case -125:
          // Sustain flag — no extra bytes
          break;
        case -124: {
          // End of pattern → read next pattern address from track list
          if (trackPtr + trackPos >= buf.length) { safety = MAX_RH_EVENTS; break; }
          const nextAddr = u32BE(buf, trackPtr + trackPos);
          trackPos += 4;

          if (!nextAddr) {
            // 0 = loop to beginning → song loops, stop extraction
            safety = MAX_RH_EVENTS;
            break;
          }
          patternPos = nextAddr;
          break;
        }
        case -123:
          // Song end
          safety = MAX_RH_EVENTS;
          break;
        case -122:
        case -121:
          // Volume set: next byte
          patternPos++;
          break;
        default:
          // Unknown command
          safety = MAX_RH_EVENTS;
          break;
      }
    }
  }

  return events;
}

/**
 * Convert per-channel RH events into unified tracker patterns.
 */
function buildRHPatterns(channelEvents: RHEvent[][]): { patterns: Pattern[]; songPositions: number[] } {
  const ROWS_PER_PATTERN = 64;
  const NUM_CHANNELS = 4;

  let maxTick = 0;
  for (const events of channelEvents) {
    for (const ev of events) {
      if (ev.tick > maxTick) maxTick = ev.tick;
    }
  }

  const totalRows = maxTick + 1;
  const numPatterns = Math.max(1, Math.ceil(totalRows / ROWS_PER_PATTERN));
  const patternLimit = Math.min(numPatterns, 256);

  const patterns: Pattern[] = [];

  for (let p = 0; p < patternLimit; p++) {
    const startTick = p * ROWS_PER_PATTERN;
    const channels: { id: string; name: string; muted: boolean; solo: boolean; collapsed: boolean; volume: number; pan: number; instrumentId: null; color: null; rows: { note: number; instrument: number; volume: number; effTyp: number; eff: number; effTyp2: number; eff2: number }[] }[] = [];

    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const rows: { note: number; instrument: number; volume: number; effTyp: number; eff: number; effTyp2: number; eff2: number }[] = [];
      const events = channelEvents[ch] || [];

      for (let r = 0; r < ROWS_PER_PATTERN; r++) {
        const targetTick = startTick + r;
        const ev = events.find(e => e.tick === targetTick);
        rows.push({
          note: ev?.note ?? 0,
          instrument: ev?.instrument ?? 0,
          volume: 0,
          effTyp: ev?.effTyp ?? 0,
          eff: ev?.eff ?? 0,
          effTyp2: 0,
          eff2: 0,
        });
      }

      channels.push({
        id: `channel-${ch}`,
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
    });
  }

  return { patterns, songPositions: patterns.map((_, i) => i) };
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse a Rob Hubbard module file into a TrackerSong.
 *
 * Rob Hubbard modules are compiled 68k Amiga executables.  The parser:
 *   - Locates the sample table using the UADE EaglePlayer detection algorithm
 *   - Extracts up to MI_MaxSamples PCM instruments as RobHubbardSynth configs
 *   - Falls back to silent placeholder instruments for any unextracted slots
 *
 * Actual synthesis is handled by RobHubbardSynth / RobHubbardEngine (WASM).
 * Synth parameters that require 68k emulation (relative, divider, vibTable,
 * hiPos/loPos) are set to safe defaults.
 *
 * @param buffer     Raw file bytes (ArrayBuffer)
 * @param filename   Original filename (used to derive module name)
 * @param moduleBase Chip RAM address where UADE loaded this module (0 if unknown).
 *                   Use UADEEngine.scanMemoryForMagic to resolve the real address.
 */
export async function parseRobHubbardFile(
  buffer: ArrayBuffer,
  filename: string,
  moduleBase = 0,
): Promise<TrackerSong> {
  if (!isRobHubbardFormat(buffer, filename)) {
    throw new Error('Not a Rob Hubbard module');
  }

  const buf = new Uint8Array(buffer);

  // ── Module name from filename ─────────────────────────────────────────────
  const baseName = (filename.split('/').pop() ?? filename);
  const moduleName = baseName.replace(/^rh\./i, '') || baseName;

  // ── Extract sample configs ────────────────────────────────────────────────
  let blobResults: SampleBlobResult[] = [];
  const tableResult = findSampleTable(buf);
  if (tableResult !== null) {
    blobResults = parseSampleBlobs(buf, tableResult.tableOffset, tableResult.count);
  }

  const extractedCount = blobResults.length;

  // ── Build instrument list ─────────────────────────────────────────────────
  const instruments: InstrumentConfig[] = [];

  for (let i = 0; i < MAX_INSTRUMENTS; i++) {
    if (i < extractedCount) {
      // Real PCM data extracted from the binary
      const { config: cfg, blobOffset, blobSize } = blobResults[i];

      // Blob layout: [u32BE pcmLen][u8 vol][u8 unused][pcmLen bytes PCM]
      // The sampleVolume byte is at blobOffset+4 within the file.
      const chipRam: UADEChipRamInfo = {
        moduleBase,
        moduleSize: buffer.byteLength,
        instrBase:  moduleBase + blobOffset,
        instrSize:  blobSize,
        sections: {
          sampleTable: moduleBase + (tableResult?.tableOffset ?? 0),
        },
      };

      instruments.push({
        id:          i + 1,
        name:        `Sample ${i + 1}`,
        type:        'synth' as const,
        synthType:   'RobHubbardSynth' as const,
        effects:     [],
        volume:      0,
        pan:         0,
        robHubbard:  cfg,
        uadeChipRam: chipRam,
      } as InstrumentConfig);
    } else {
      // Placeholder for unextracted slots (silent but correctly typed)
      instruments.push({
        id:         i + 1,
        name:       `Sample ${i + 1}`,
        type:       'synth' as const,
        synthType:  'RobHubbardSynth' as const,
        effects:    [],
        volume:     0,
        pan:        0,
        robHubbard: { ...DEFAULT_ROB_HUBBARD },
      } as InstrumentConfig);
    }
  }

  // ── Extract real patterns from binary ─────────────────────────────────────
  const NUM_CHANNELS = 4;
  const ROWS = 64;
  let patterns: Pattern[] = [];
  let songPositions: number[] = [0];
  let initialSpeed = 6;

  const songResult = findRHSongs(buf);
  if (songResult && songResult.songs.length > 0) {
    const song = songResult.songs[0];
    initialSpeed = song.speed || 6;

    const channelEvents: RHEvent[][] = [];
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      channelEvents.push(parseRHChannelStream(buf, song, ch));
    }

    let totalNotes = 0;
    for (const events of channelEvents) {
      totalNotes += events.filter(e => e.note > 0 && e.note < 97).length;
    }

    if (totalNotes > 0) {
      const built = buildRHPatterns(channelEvents);
      patterns = built.patterns;
      songPositions = built.songPositions;
    }
  }

  // Fallback: empty pattern if extraction failed
  if (patterns.length === 0) {
    const emptyRows = Array.from({ length: 64 }, () => ({
      note: 0, instrument: 0, volume: 0,
      effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
    }));
    patterns = [{
      id: 'pattern-0',
      name: 'Pattern 0',
      length: 64,
      channels: Array.from({ length: 4 }, (_, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false, solo: false, collapsed: false,
        volume: 100,
        pan: (ch === 0 || ch === 3) ? -50 : 50,
        instrumentId: null, color: null,
        rows: emptyRows.map(r => ({ ...r })),
      })),
    }];
    songPositions = [0];
  }

  const extractNote = extractedCount > 0
    ? ` (${extractedCount} smp, ${patterns.length} pat)`
    : ` (${MAX_INSTRUMENTS} smp)`;

  const uadePatternLayout: UADEPatternLayout = {
    formatId: 'robHubbard',
    patternDataFileOffset: 0,
    bytesPerCell: 4,
    rowsPerPattern: ROWS,
    numChannels: NUM_CHANNELS,
    numPatterns: patterns.length,
    moduleSize: buffer.byteLength,
    encodeCell: encodeRobHubbardCell,
    decodeCell: decodeMODCell,
    getCellFileOffset: (pat: number, row: number, channel: number): number => {
      const patternByteSize = ROWS * NUM_CHANNELS * 4;
      return pat * patternByteSize + row * NUM_CHANNELS * 4 + channel * 4;
    },
  };

  return {
    name: `${moduleName} [Rob Hubbard]${extractNote}`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout,
  };
}
