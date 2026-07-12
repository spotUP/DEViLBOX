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
import type { ChannelData, InstrumentConfig, Pattern, TrackerCell } from '@/types';
import type { RobHubbardConfig, UADEChipRamInfo } from '@/types/instrument';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { DEFAULT_ROB_HUBBARD } from '@/types/instrument';
import { robHubbardEncoder } from '@/engine/uade/encoders/RobHubbardEncoder';

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

// ── Byte-exact block decoding (variable-length command stream) ────────────────
//
// A RH "pattern" is not a fixed cell grid: each channel's track is an ordered list
// of block addresses (u32), and each block is a contiguous run of variable-length
// commands ending in the -124 end marker. To make the format losslessly editable
// AND byte-exact, we decode each block into one TrackerCell per command, stashing
// the command's EXACT source bytes in the cell carriers (cutoff=length, period=b0,
// pan=b1). The variable encoder concatenates those carriers to reproduce the block.

/**
 * Number of file bytes one RH stream command occupies, starting at `pos`.
 * Mirrors the byte-consumption of the old parseRHChannelStream exactly so block
 * spans and command boundaries line up with what the replayer reads.
 */
function rhCommandLen(buf: Uint8Array, pos: number): number {
  const value = s8(buf, pos);
  if (value >= 0) return 2;   // note: duration byte + note byte
  switch (value) {
    case -128: return 2;      // sample change (sample index byte)
    case -127: return 2;      // portamento (speed byte)
    case -126: return 2;      // rest (duration byte)
    case -125: return 1;      // sustain flag
    case -124: return 1;      // end of pattern (terminates block)
    case -123: return 1;      // song end
    case -122: return 2;      // volume set (variant 4)
    case -121: return 2;      // volume set (variant 3)
    default:   return 1;      // unknown — consume a single byte
  }
}

/**
 * Decode one contiguous block (from `startAddr` to and including its -124 marker)
 * into one command-row per stream command. `sampleRef.cur` tracks the running
 * 1-based instrument across the block (updated on sample-change commands).
 */
function decodeRHBlock(
  buf: Uint8Array,
  startAddr: number,
  sampleRef: { cur: number },
): { rows: TrackerCell[]; byteSize: number } {
  const rows: TrackerCell[] = [];
  let pos = startAddr;
  let safety = 0;
  while (pos < buf.length && safety++ < 8192) {
    const value = s8(buf, pos);
    const len = rhCommandLen(buf, pos);
    if (pos + len > buf.length) break;

    // Display fields (carrier bytes below make the round-trip byte-exact regardless).
    let note = 0;
    let instrument = 0;
    if (value >= 0) {
      note = rhNoteToTrackerNote(s8(buf, pos + 1)) || 49;
      instrument = sampleRef.cur;
    } else if (value === -128) {
      let smpIdx = s8(buf, pos + 1);
      if (smpIdx < 0) smpIdx = 0;
      sampleRef.cur = smpIdx + 1;
      instrument = sampleRef.cur;
    } else if (value === -126) {
      note = 97; // rest / note-off
    }

    const cell: TrackerCell = {
      note, instrument, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      cutoff: len,
      period: buf[pos] & 0xFF,
    };
    if (len >= 2) cell.pan = buf[pos + 1] & 0xFF;
    rows.push(cell);

    pos += len;
    if (value === -124) break; // -124 terminates the block
  }
  return { rows, byteSize: pos - startAddr };
}

/**
 * Read a channel's ordered list of block addresses from its track pointer.
 * The track list is a run of u32 (absolute) entries terminated by a null entry.
 */
function enumerateRHChannelBlocks(buf: Uint8Array, trackPtr: number): number[] {
  const addrs: number[] = [];
  if (!trackPtr || trackPtr >= buf.length) return addrs;
  let tp = trackPtr;
  for (let i = 0; i < 512; i++) {
    if (tp + 4 > buf.length) break;
    const addr = u32BE(buf, tp);
    tp += 4;
    if (!addr) break; // null entry = loop / end
    if (addr < 0 || addr >= buf.length) break;
    addrs.push(addr);
  }
  return addrs;
}

interface RHVariableResult {
  patterns: Pattern[];
  songPositions: number[];
  filePatternAddrs: number[];
  filePatternSizes: number[];
  trackMap: number[][];
  /** Canonical carrier rows per unique block (byte-exact source of truth). */
  blockRows: TrackerCell[][];
}

const RH_PATTERN_ROWS = 64;
// Hard ceiling on the display timeline so a pathological loop can't allocate an
// unbounded grid. 96 patterns × 64 ticks = 6144 rows is far longer than any real
// RH song's single loop pass.
const RH_MAX_DISPLAY_ROWS = RH_PATTERN_ROWS * 96;

/**
 * Tick length one decoded command occupies on the display timeline.
 *   - note command (opcode byte < 128): byte0 IS the duration → cell.period
 *   - rest command (-126 → unsigned 130): byte1 is the duration → cell.pan
 *   - every other command (sample/portamento/sustain/volume/end): 0 ticks —
 *     it mutates replay state without advancing time, so it is invisible on the
 *     tick grid (its bytes still round-trip via the canonical block rows).
 * Padding rows (cutoff undefined) are not real commands → 0 ticks.
 */
function rhCellTicks(cell: TrackerCell): number {
  if (cell.cutoff === undefined) return 0;
  const opcode = cell.period ?? 0;
  if (opcode < 128) return Math.max(1, opcode);        // note: duration byte
  if (opcode === 130) return Math.max(1, cell.pan ?? 0); // -126 rest: duration byte
  return 0;                                             // control command
}

/**
 * Build the tick-timeline display grid + byte-exact variable layout for one RH song.
 *
 * A RH channel is an INDEPENDENT command byte-stream, not a step in a shared grid:
 * each channel walks its own ordered list of blocks at its own tick rate (channels
 * loop their lists independently, with different lengths). Command-indexing the grid
 * (one row per command) desynchronises the channels and collapses long/sustained
 * notes into a few rows, so a sustained bass voice renders blank under the playhead
 * even while it sounds ("hear bass, see no notes").
 *
 * Fix: lay every channel on ONE shared tick timeline — each note/rest occupies its
 * `duration` ticks (note-on cell on the first tick row, blank continuation rows
 * below), control commands take zero ticks — then slice the timeline into fixed
 * 64-row patterns so row === real tick and the playhead sits on the sounding note.
 *
 * The display cells are carrier-less (they are for viewing/editing). Byte-exact
 * export is driven by `blockRows[fp]` — the exact decoded carrier cells of each
 * unique block — which the variable encoder concatenates to reproduce the file
 * verbatim. Because a channel's block straddles pattern boundaries on the shared
 * timeline, the block carriers CANNOT live inside one pattern's rows; keeping them
 * on the layout (round-trip only) is the faithful representation.
 */
function buildRHVariablePatterns(
  buf: Uint8Array,
  song: RHSong,
  numChannels: number,
): RHVariableResult | null {
  const channelBlocks: number[][] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    const trackPtr = ch < song.tracks.length ? song.tracks[ch] : 0;
    channelBlocks.push(enumerateRHChannelBlocks(buf, trackPtr));
  }

  if (channelBlocks.every(l => l.length === 0)) return null;

  // Dedup blocks into file-patterns. blockRows[fp] holds the exact decoded carrier
  // cells for that block (byte-exact source of truth for the encoder / round-trip).
  const addrToFp = new Map<number, number>();
  const filePatternAddrs: number[] = [];
  const filePatternSizes: number[] = [];
  const blockRows: TrackerCell[][] = [];
  const fpFor = (addr: number): number => {
    let fp = addrToFp.get(addr);
    if (fp === undefined) {
      const { rows, byteSize } = decodeRHBlock(buf, addr, { cur: 1 });
      fp = filePatternAddrs.length;
      addrToFp.set(addr, fp);
      filePatternAddrs.push(addr);
      filePatternSizes.push(byteSize);
      blockRows.push(rows);
    }
    return fp;
  };

  // ── Pass 1: lay each channel on its own tick timeline ──────────────────────
  // Walk the channel's block list (looping independently), placing each note/rest
  // display cell at its cumulative tick and reserving its duration in continuation
  // rows. `chFpByTick[ch][tick]` records which block covers each tick (for a valid
  // trackMap). We first find the longest single-pass length, then fill every shorter
  // channel by looping so no active voice ever goes silent mid-song.
  const singlePassTicks = (list: number[]): number => {
    let ticks = 0;
    for (const addr of list) {
      for (const cell of blockRows[fpFor(addr)]) ticks += rhCellTicks(cell);
    }
    return ticks;
  };

  let displayTicks = 0;
  for (const list of channelBlocks) {
    if (list.length > 0) displayTicks = Math.max(displayTicks, singlePassTicks(list));
  }
  if (displayTicks <= 0) displayTicks = RH_PATTERN_ROWS;
  displayTicks = Math.min(displayTicks, RH_MAX_DISPLAY_ROWS);

  const numPatterns = Math.max(1, Math.ceil(displayTicks / RH_PATTERN_ROWS));
  const totalRows = numPatterns * RH_PATTERN_ROWS;

  // Per-channel timeline of display cells + the fp covering each tick.
  const chRows: TrackerCell[][] = [];
  const chFpByTick: Int32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    const timeline: TrackerCell[] = Array.from({ length: totalRows }, () => ({
      note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
    }));
    const fpByTick = new Int32Array(totalRows).fill(-1);
    const list = channelBlocks[ch];
    if (list.length > 0) {
      let tick = 0;
      let blockIdx = 0;
      let guard = 0;
      while (tick < totalRows && guard++ < totalRows + list.length + 8) {
        const fp = fpFor(list[blockIdx % list.length]);
        blockIdx++;
        let advanced = false;
        for (const cell of blockRows[fp]) {
          const dur = rhCellTicks(cell);
          if (dur <= 0) continue;              // control command — no display row
          if (tick >= totalRows) break;
          timeline[tick] = {
            note: cell.note, instrument: cell.instrument,
            volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
          };
          const end = Math.min(totalRows, tick + dur);
          for (let t = tick; t < end; t++) fpByTick[t] = fp;
          tick = end;
          advanced = true;
        }
        // A block of pure control commands advances 0 ticks; keep looping to the
        // next block but never spin forever (guard covers the degenerate all-zero
        // list where every block is control-only).
        if (!advanced && blockIdx % list.length === 0 && singlePassTicks(list) === 0) break;
      }
    }
    chRows.push(timeline);
    chFpByTick.push(fpByTick);
  }

  // ── Pass 2: slice the timelines into fixed 64-row patterns ─────────────────
  const patterns: Pattern[] = [];
  const songPositions: number[] = [];
  const trackMap: number[][] = [];
  for (let p = 0; p < numPatterns; p++) {
    const base = p * RH_PATTERN_ROWS;
    const channels: ChannelData[] = [];
    const patTrack: number[] = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const rows = chRows[ch].slice(base, base + RH_PATTERN_ROWS);
      channels.push({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false, solo: false, collapsed: false,
        volume: 100, pan: (ch === 0 || ch === 3) ? -50 : 50,
        instrumentId: null, color: null, rows,
      });
      patTrack.push(channelBlocks[ch].length > 0 ? chFpByTick[ch][base] : -1);
    }
    patterns.push({
      id: `pattern-${p}`, name: `Pattern ${p}`, length: RH_PATTERN_ROWS, channels,
    });
    songPositions.push(p);
    trackMap.push(patTrack);
  }

  return { patterns, songPositions, filePatternAddrs, filePatternSizes, trackMap, blockRows };
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

  // ── Extract real patterns as a byte-exact variable layout ─────────────────
  const NUM_CHANNELS = 4;
  let patterns: Pattern[] = [];
  let songPositions: number[] = [0];
  let initialSpeed = 6;
  let variable: RHVariableResult | null = null;

  const songResult = findRHSongs(buf);
  if (songResult && songResult.songs.length > 0) {
    const song = songResult.songs[0];
    initialSpeed = song.speed || 6;
    variable = buildRHVariablePatterns(buf, song, NUM_CHANNELS);
    if (variable) {
      patterns = variable.patterns;
      songPositions = variable.songPositions;
    }
  }

  // Fallback: empty pattern if extraction failed (no variable layout — an
  // unfaithful grid must NOT claim byte-exactness).
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

  const result: TrackerSong = {
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
  };

  if (variable) {
    const uadeVariableLayout: UADEVariablePatternLayout = {
      formatId: 'robHubbard',
      numChannels: NUM_CHANNELS,
      numFilePatterns: variable.filePatternAddrs.length,
      rowsPerPattern: patterns.map(p => p.length),
      moduleSize: buffer.byteLength,
      encoder: robHubbardEncoder,
      filePatternAddrs: variable.filePatternAddrs,
      filePatternSizes: variable.filePatternSizes,
      trackMap: variable.trackMap,
      blockRows: variable.blockRows,
    };
    (result as unknown as { uadeVariableLayout: UADEVariablePatternLayout }).uadeVariableLayout = uadeVariableLayout;
  }

  return result;
}
