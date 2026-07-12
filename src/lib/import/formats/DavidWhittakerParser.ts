/**
 * DavidWhittakerParser.ts — David Whittaker (.dw / .dwold) format parser
 *
 * Implements native parsing for the David Whittaker Amiga music format,
 * ported from FlodJS DWPlayer.js by Christian Corti (Neoart Costa Rica).
 *
 * Format detection:
 *   DW files are relocatable 68000 code stubs. Detection scans for the
 *   0x47fa (lea x,a3) opcode near the beginning of the file, which is a
 *   reliable marker for DW-family player stubs. Combined with presence of
 *   sequence data patterns.
 *
 * Instrument extraction:
 *   The parser extracts sample headers (which contain tuning, volume, and
 *   pointers to volseq/frqseq tables) using the DWPlayer.js scan logic.
 *   Since the binary structure is relocatable code, full extraction requires
 *   68000 disassembly; this parser uses heuristic scanning.
 *
 * If format detection is uncertain or extraction fails, returns a minimal
 * song with one default DavidWhittakerSynth instrument.
 *
 * Reference: FlodJS DWPlayer.js by Christian Corti, Neoart Costa Rica (2012)
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, ChannelData, InstrumentConfig } from '@/types';
import type { DavidWhittakerConfig, UADEChipRamInfo } from '@/types/instrument';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { DEFAULT_DAVID_WHITTAKER } from '@/types/instrument';
import { davidWhittakerEncoder } from '@/engine/uade/encoders/DavidWhittakerEncoder';

// ── Binary read helpers ───────────────────────────────────────────────────────

function u8(buf: Uint8Array, off: number): number {
  if (off < 0 || off >= buf.length) return 0;
  return buf[off] & 0xFF;
}

function s8(buf: Uint8Array, off: number): number {
  const v = u8(buf, off);
  return v < 128 ? v : v - 256;
}

function u16BE(buf: Uint8Array, off: number): number {
  if (off + 1 >= buf.length) return 0;
  return ((buf[off] & 0xFF) << 8) | (buf[off + 1] & 0xFF);
}

function s16BE(buf: Uint8Array, off: number): number {
  const v = u16BE(buf, off);
  return v < 0x8000 ? v : v - 0x10000;
}

function u32BE(buf: Uint8Array, off: number): number {
  if (off + 3 >= buf.length) return 0;
  return ((buf[off] & 0xFF) * 0x1000000) +
         ((buf[off + 1] & 0xFF) << 16) +
         ((buf[off + 2] & 0xFF) << 8) +
          (buf[off + 3] & 0xFF);
}


// ── Note conversion ───────────────────────────────────────────────────────────

/**
 * Convert a DW/Amiga note index (0-59, into 60-entry period table) to a
 * tracker note value (1-96, FT2 style).
 *
 * Amiga period table index 0 = C-1 (ProTracker) = C-2 (FT2) = tracker note 25.
 * So: tracker_note = amiga_index + 25.
 */
function amigaIndexToTrackerNote(idx: number): number {
  const n = idx + 25;
  return (n >= 1 && n <= 96) ? n : 0;
}

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Detect whether the buffer contains a David Whittaker module.
 *
 * Heuristic: scan for the 0x47fa (lea x,a3) opcode within the first 512 bytes,
 * which is the anchor instruction used by DWPlayer.js to locate the data base.
 * Also check that the file has a reasonable minimum size.
 */
export function isDavidWhittakerFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 64) return false;
  const buf = new Uint8Array(buffer);
  const scanEnd = Math.min(buf.length - 4, 2048);

  for (let i = 0; i < scanEnd; i += 2) {
    const opcode = u16BE(buf, i);
    if (opcode === 0x47fa) {
      // Found lea x,a3 — this strongly indicates a DW-family player
      return true;
    }
    // Also detect the variant-30 header: 0x48e7 (movem.l) at offset 0
    if (i === 0 && opcode === 0x48e7) {
      // Check for bsr.w at offset 4
      if (u16BE(buf, 4) === 0x6100) return true;
    }
  }

  return false;
}

// ── Sequence extraction helpers ───────────────────────────────────────────────

/**
 * Extract a volume or frequency sequence starting at `offset` in the buffer.
 * Reads until a loop marker (-128) is found followed by a loop target, or
 * until MAX_SEQ_LEN bytes are consumed.
 * Returns the raw signed bytes.
 */
function extractSequence(buf: Uint8Array, offset: number, maxLen = 64): number[] {
  const seq: number[] = [];
  let pos = offset;
  while (pos < buf.length && seq.length < maxLen) {
    const v = s8(buf, pos);
    seq.push(v);
    pos++;
    if (v === -128) {
      // Loop marker: next byte is the target
      if (pos < buf.length) {
        seq.push(u8(buf, pos) & 0x7f);
        pos++;
      }
      break;
    }
  }
  return seq;
}

// ── Instrument scan ──────────────────────────────────────────────────────────

interface DWSampleHeader {
  length: number;
  tuning: number;    // raw Amiga period for tuning (e.g., 428 = A-3 = A-440)
  relative: number;  // 3579545 / tuning
  volume: number;    // 0-64
  loopPtr: number;
  finetune: number;
  volseqOffset: number;  // offset into volseq table (from frqseq/volseq base)
}

interface DWSong {
  speed: number;
  delay: number;
  tracks: number[];  // per-channel file offset to track list
}

interface DWParseResult {
  base: number;
  variant: number;
  periodTableOffset: number;
  frqseqsOffset: number;
  volseqsOffset: number;
  samples: DWSampleHeader[];
  sampleInfoBase: number;
  sampleInfoSize: number;
  // Song-level data for pattern extraction
  songs: DWSong[];
  channels: number;
  readLen: number;    // 2 or 4 (u16 or u32 track pointers)
  flag: boolean;      // determines song header format
  com2: number;       // command range boundary (signed)
  com3: number;
  com4: number;
}

/**
 * Scan the binary to locate the DW player structures.
 * Returns null if the scan fails to find required structures.
 *
 * This implements a simplified version of DWPlayer.js loader() using the
 * same opcode scan approach.
 */
function scanDWStructures(buf: Uint8Array): DWParseResult | null {
  let base = 0;
  let variant = 0;
  let songsHeaders = 0;  // offset to songs table (speed + track pointers)
  let size = 10;
  let periodTableOffset = 0;
  let frqseqsOffset = 0;
  let volseqsOffset = 0;
  let readLen = 2;   // bytes per track pointer (2 = u16, 4 = u32)
  let flag = false;  // determines song header format (speed as u8+delay vs u16)
  let channels = 4;

  // ── First pass: scan for base, song headers (before first rts) ──────────
  let pos = 0;

  // Check for variant 30 (movem.l at offset 0)
  if (u16BE(buf, 0) === 0x48e7) {
    if (u16BE(buf, 4) === 0x6100) {
      const offset = u16BE(buf, 6);
      pos = 4 + 2 + offset;
      variant = 30;
    }
  }

  let safeLimit = 0;
  while (pos < buf.length - 20 && safeLimit++ < 4096) {
    const val = u16BE(buf, pos);
    pos += 2;

    if (val === 0x4e75) break;  // rts — end of first pass

    switch (val) {
      case 0x47fa: {  // lea x,a3 — base pointer
        const disp = s16BE(buf, pos);
        base = pos + disp;
        pos += 2;
        break;
      }
      case 0x6100: {  // bsr.w
        pos += 2;
        if (u16BE(buf, pos - 4) === 0x6100) pos += 2;
        break;
      }
      case 0xc0fc: {  // mulu.w #x,d0
        size = u16BE(buf, pos);
        pos += 2;
        if (size === 18) {
          readLen = 4;
        } else {
          variant = 10;
        }
        if (u16BE(buf, pos) === 0x41fa) {  // lea x,a0
          pos += 2;
          songsHeaders = pos + s16BE(buf, pos);
          pos += 2;
        }
        if (pos < buf.length && u16BE(buf, pos) === 0x1230) flag = true;
        break;
      }
      case 0x1230: {  // move.b (a0,d0.w),d1
        flag = true;
        pos -= 6;
        if (u16BE(buf, pos) === 0x41fa) {
          pos += 2;
          songsHeaders = pos + s16BE(buf, pos);
          pos += 2;
        }
        pos += 4;
        break;
      }
      case 0xbe7c: {  // cmp.w #x,d7
        channels = u16BE(buf, pos);
        pos += 4;
        break;
      }
    }
    if (pos > buf.length - 4) break;
  }

  if (!base && !songsHeaders) return null;

  // ── Parse songs from the songs table ────────────────────────────────────
  const songs: DWSong[] = [];
  if (songsHeaders > 0 && songsHeaders < buf.length - 4) {
    let lower = 0x7fffffff;
    let spos = songsHeaders;
    let songLimit = 0;
    while (spos < buf.length - 4 && songLimit++ < 64) {
      const song: DWSong = { speed: 0, delay: 0, tracks: [] };
      if (flag) {
        song.speed = u8(buf, spos); spos++;
        song.delay = u8(buf, spos); spos++;
      } else {
        song.speed = u16BE(buf, spos); spos += 2;
      }
      if (song.speed > 255 || song.speed === 0) break;

      for (let ch = 0; ch < channels; ch++) {
        let trackPtr: number;
        if (readLen === 4) {
          trackPtr = base + u32BE(buf, spos);
          spos += 4;
        } else {
          trackPtr = base + u16BE(buf, spos);
          spos += 2;
        }
        if (trackPtr < lower) lower = trackPtr;
        song.tracks.push(trackPtr);
      }

      songs.push(song);
      if ((lower - spos) < size) break;
    }
  }

  // ── Second pass: scan for sample info structures (after first rts) ──────
  // The sample header table is found via 0x4bfa in the FlodJS second rts loop.
  // Our simpler scan: look for sample-like data at `songsHeaders` fallback.
  // This keeps compatibility with the existing instrument extraction.
  let sampleInfoBase = songsHeaders;
  let sampleInfoSize = size;
  const samples: DWSampleHeader[] = [];

  // Attempt to find sample data from the second scan (after first rts)
  // Look for the 0x4bfa opcode (lea x,a5) which precedes sample header info
  if (pos < buf.length - 20) {
    let sampleHeaders = 0;
    let sampleTotal = 0;
    let sampleSize = 0;
    let spos = pos;
    let limit2 = 0;
    while (spos < buf.length - 20 && limit2++ < 4096) {
      const val2 = u16BE(buf, spos);
      spos += 2;
      if (val2 === 0x4e75) break;

      if (val2 === 0x4bfa && !sampleHeaders) {
        // lea x,a5 — sample info pointer
        const infoOff = spos + s16BE(buf, spos);
        spos += 2;
        spos++;
        sampleTotal = u8(buf, spos); spos++;
        // Look backwards for 0x41fa or 0x207a to find actual header data
        const prevPos = spos;
        spos -= 10;
        const prev = u16BE(buf, spos);
        if (prev === 0x41fa || prev === 0x207a) {
          spos += 2;
          sampleHeaders = spos + u16BE(buf, spos);
        } else if (prev === 0xd0fc) {
          sampleHeaders = 64 + u16BE(buf, spos + 2);
          spos -= 18;
          sampleHeaders += (spos + u16BE(buf, spos));
        }
        spos = prevPos;
        sampleInfoBase = infoOff;
      }

      if (val2 === 0x84c3 && !sampleSize) {
        // divu.w d3,d2 — sample record size follows
        spos += 4;
        const sz = u16BE(buf, spos);
        if (sz === 0xdafc) {
          sampleSize = u16BE(buf, spos + 2);
        } else if (sz === 0xdbfc) {
          sampleSize = u32BE(buf, spos + 2);
        }
        if (sampleSize === 12 && variant < 30) variant = 20;

        // Parse samples from the headers
        if (sampleHeaders && sampleTotal > 0) {
          sampleInfoBase = sampleHeaders;
          sampleInfoSize = sampleSize || size;
          let sh = sampleHeaders;
          for (let i = 0; i <= sampleTotal && sh + 6 < buf.length; i++) {
            const length = u32BE(buf, sh);
            if (length === 0 || length > 0x100000) break;
            const tuningVal = u16BE(buf, sh + 4);
            if (tuningVal === 0) break;
            const relative = Math.floor(3579545 / tuningVal);
            samples.push({
              length, tuning: tuningVal, relative,
              volume: 64, loopPtr: 0, finetune: 0, volseqOffset: 0,
            });
            sh += 6 + length; // skip sample data
          }
        }
        break;
      }
    }
  }

  // Fallback sample parsing: if second-pass scan didn't find samples,
  // try parsing from the area after the songs table (legacy behavior)
  if (samples.length === 0 && songsHeaders > 0) {
    // Try scanning for sample-like records after the songs data
    let spos = songsHeaders;
    for (let i = 0; i < 64 && spos + 6 < buf.length; i++) {
      const length = u32BE(buf, spos);
      if (length === 0 || length > 0x100000) break;
      const tuningVal = u16BE(buf, spos + 4);
      if (tuningVal === 0) break;
      const relative = Math.floor(3579545 / tuningVal);
      samples.push({
        length, tuning: tuningVal, relative,
        volume: 64, loopPtr: 0, finetune: 0, volseqOffset: 0,
      });
      spos += size;
    }
  }

  // ── Third pass: scan for period table, frqseqs, volseqs ──────────────────
  pos = 0;
  let com2 = 0xb0;
  let com3 = 0xa0;
  let com4 = 0x90;
  safeLimit = 0;

  while (pos < buf.length - 4 && safeLimit++ < 8192) {
    const val = u16BE(buf, pos);
    pos += 2;

    switch (val) {
      case 0x322d: {  // move.w x(a5),d1 — period table scan
        const wval = u16BE(buf, pos);
        pos += 2;
        if (wval === 0x000a || wval === 0x000c) {
          pos -= 8;
          if (u16BE(buf, pos) === 0x45fa) {  // lea x,a2
            pos += 2;
            periodTableOffset = pos + s16BE(buf, pos);
            pos += 2;
          } else {
            pos += 6;
          }
        }
        break;
      }
      case 0x0400:  // subi.b #x,d0
      case 0x0440:  // subi.w #x,d0
      case 0x0600: {  // addi.b #x,d0
        const wval = u16BE(buf, pos);
        pos += 2;
        if (wval === 0x00c0 || wval === 0x0040) {
          com2 = 0xc0; com3 = 0xb0; com4 = 0xa0;
        } else if (wval === com3) {
          pos += 2;
          if (u16BE(buf, pos) === 0x45fa) {  // lea x,a2
            pos += 2;
            volseqsOffset = pos + s16BE(buf, pos);
            pos += 2;
          }
        } else if (wval === com4) {
          pos += 2;
          if (u16BE(buf, pos) === 0x45fa) {  // lea x,a2
            pos += 2;
            frqseqsOffset = pos + s16BE(buf, pos);
            pos += 2;
          }
        }
        break;
      }
    }
  }

  // Convert command range values to signed bytes (FlodJS does com2 -= 256)
  const signedCom2 = com2 - 256;
  const signedCom3 = com3 - 256;
  const signedCom4 = com4 - 256;

  return {
    base,
    variant,
    periodTableOffset,
    frqseqsOffset,
    volseqsOffset,
    samples,
    sampleInfoBase,
    sampleInfoSize,
    songs,
    channels,
    readLen,
    flag,
    com2: signedCom2,
    com3: signedCom3,
    com4: signedCom4,
  };
}

// ── Byte-exact block decoding (variable-length command stream) ─────────────────
//
// A DW "pattern" is not a fixed cell grid: each channel's track is an ordered list
// of block addresses, and each block is a contiguous run of command bytes ending in
// the -128 marker. To make the format losslessly editable AND byte-exact, we decode
// each block into one TrackerCell per command, stashing the command's EXACT source
// bytes in the cell carriers (cutoff=length, period=b0, pan=b1, resonance=b2). The
// variable encoder concatenates those carriers back to reproduce the block verbatim.

/**
 * Number of file bytes one DW stream command occupies, starting at `pos`.
 * Mirrors the byte-consumption of parseDWChannelStream exactly so block spans and
 * command boundaries line up with what the replayer reads.
 */
function dwCommandLen(buf: Uint8Array, scan: DWParseResult, pos: number): number {
  const value = s8(buf, pos);
  if (value >= 0) return 1;            // note
  if (value >= -32) return 1;          // speed change
  if (value >= scan.com2) return 1;    // sample change
  if (value >= scan.com3) return 1;    // volume-sequence select
  if (value >= scan.com4) return 1;    // frequency-sequence select
  switch (value) {
    case -128: return 1;  // end of pattern
    case -127: return 3;  // portamento (2 param bytes)
    case -126: return 1;  // rest / note-off
    case -125: return 1;  // channel enable
    case -124: return 1;  // song end
    case -123: return 2;  // transpose (1 param byte)
    case -122: return 3;  // vibrato (2 param bytes)
    case -121: return 1;  // vibrato off
    case -120: return (scan.variant >= 10 && scan.variant !== 21) ? 2 : 1;
    case -119: return (scan.variant !== 21) ? 3 : 1;
    case -118: return 2;  // speed/delay change (1 param byte)
    case -117: return 2;  // fade (1 param byte)
    case -116: return 2;  // song volume (1 param byte)
    default:   return 1;  // unknown — consume a single byte and continue
  }
}

/**
 * Decode one contiguous block (from `startAddr` to and including its -128 marker)
 * into one command-row per stream command. `sampleRef.cur` tracks the running
 * 1-based instrument across the block (updated on sample-change commands).
 */
function decodeDWBlock(
  buf: Uint8Array,
  scan: DWParseResult,
  startAddr: number,
  sampleRef: { cur: number },
): { rows: TrackerCell[]; byteSize: number } {
  const rows: TrackerCell[] = [];
  let pos = startAddr;
  let safety = 0;
  while (pos < buf.length && safety++ < 8192) {
    const value = s8(buf, pos);
    const len = dwCommandLen(buf, scan, pos);
    if (pos + len > buf.length) break;

    // Display fields (carrier bytes below make the round-trip byte-exact regardless).
    let note = 0;
    let instrument = 0;
    if (value >= 0) {
      note = amigaIndexToTrackerNote(value) || 49;
      instrument = sampleRef.cur;
    } else if (value >= scan.com2 && value < -32) {
      sampleRef.cur = (value - scan.com2) + 1;
      instrument = sampleRef.cur;
    } else if (value === -126) {
      note = 97; // rest / note-off
    }

    const cell: TrackerCell = {
      note, instrument, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      // Carrier: exact source bytes of this command.
      cutoff: len,
      period: buf[pos] & 0xFF,
    };
    if (len >= 2) cell.pan = buf[pos + 1] & 0xFF;
    if (len >= 3) cell.resonance = buf[pos + 2] & 0xFF;
    rows.push(cell);

    pos += len;
    if (value === -128) break; // -128 terminates the block
  }
  return { rows, byteSize: pos - startAddr };
}

/**
 * Read a channel's ordered list of block addresses from its track pointer.
 * The track list is a run of u16/u32 entries terminated by a null (loop) entry.
 */
function enumerateChannelBlocks(buf: Uint8Array, scan: DWParseResult, trackPtr: number): number[] {
  const addrs: number[] = [];
  if (!trackPtr || trackPtr >= buf.length) return addrs;
  let tp = trackPtr;
  for (let i = 0; i < 512; i++) {
    if (tp + scan.readLen > buf.length) break;
    const raw = scan.readLen === 4 ? u32BE(buf, tp) : u16BE(buf, tp);
    tp += scan.readLen;
    if (!raw) break; // null entry = loop to start
    const addr = scan.readLen === 4 ? raw : scan.base + raw;
    if (addr < 0 || addr >= buf.length) break;
    addrs.push(addr);
  }
  return addrs;
}

interface DWVariableResult {
  patterns: Pattern[];
  songPositions: number[];
  filePatternAddrs: number[];
  filePatternSizes: number[];
  trackMap: number[][];
}

/**
 * Build the byte-exact variable pattern layout for one DW song.
 *
 * Each channel independently steps through an ordered list of block addresses.
 * Blocks are deduplicated into file-patterns (filePatternAddrs/Sizes); one
 * tracker "step" corresponds to one entry across all channels' block lists.
 * trackMap[step][ch] resolves to the file-pattern index for that block (-1 if the
 * channel's list is shorter). Each channel's rows carry the block's exact source
 * bytes so the variable encoder reproduces the file byte-for-byte.
 */
function buildDWVariablePatterns(
  buf: Uint8Array,
  scan: DWParseResult,
  song: DWSong,
  numChannels: number,
): DWVariableResult | null {
  // Per-channel ordered block-address lists.
  const channelBlocks: number[][] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    const trackPtr = ch < song.tracks.length ? song.tracks[ch] : 0;
    channelBlocks.push(enumerateChannelBlocks(buf, scan, trackPtr));
  }

  const numSteps = channelBlocks.reduce((m, l) => Math.max(m, l.length), 0);
  if (numSteps === 0) return null;

  // Deduplicate block addresses into file-patterns; decode each unique block once.
  const addrToFp = new Map<number, number>();
  const filePatternAddrs: number[] = [];
  const filePatternSizes: number[] = [];
  const fpRows: TrackerCell[][] = [];
  const fpFor = (addr: number): number => {
    let fp = addrToFp.get(addr);
    if (fp === undefined) {
      const { rows, byteSize } = decodeDWBlock(buf, scan, addr, { cur: 1 });
      fp = filePatternAddrs.length;
      addrToFp.set(addr, fp);
      filePatternAddrs.push(addr);
      filePatternSizes.push(byteSize);
      fpRows.push(rows);
    }
    return fp;
  };

  const patterns: Pattern[] = [];
  const songPositions: number[] = [];
  const trackMap: number[][] = [];

  for (let step = 0; step < numSteps; step++) {
    const stepTrackMap: number[] = [];
    const perChannelRows: TrackerCell[][] = [];
    let maxRows = 0;

    for (let ch = 0; ch < numChannels; ch++) {
      const list = channelBlocks[ch];
      if (step < list.length) {
        const fp = fpFor(list[step]);
        stepTrackMap.push(fp);
        // Clone the decoded rows so per-step patterns don't share cell objects.
        const rows = fpRows[fp].map(c => ({ ...c }));
        perChannelRows.push(rows);
        if (rows.length > maxRows) maxRows = rows.length;
      } else {
        stepTrackMap.push(-1);
        perChannelRows.push([]);
      }
    }
    if (maxRows === 0) maxRows = 1;

    const channels: ChannelData[] = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const rows = perChannelRows[ch];
      // Pad with carrier-less rows (cutoff undefined) — the encoder emits nothing
      // for them, so padding does not affect byte-exactness.
      while (rows.length < maxRows) {
        rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
      }
      channels.push({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false, solo: false, collapsed: false,
        volume: 100, pan: (ch === 0 || ch === 3) ? -50 : 50,
        instrumentId: null, color: null, rows,
      });
    }

    patterns.push({
      id: `pattern-${step}`, name: `Pattern ${step}`, length: maxRows, channels,
    });
    songPositions.push(step);
    trackMap.push(stepTrackMap);
  }

  return { patterns, songPositions, filePatternAddrs, filePatternSizes, trackMap };
}

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Parse a David Whittaker (.dw / .dwold) file into a TrackerSong.
 *
 * Extracts instrument configs using heuristic binary scanning.
 * Returns a minimal song if full extraction is not possible.
 *
 * @param moduleBase - Chip RAM address where the module binary starts (0 if unknown).
 *                     DavidWhittaker is a compiled Amiga binary; use UADEEngine.scanMemoryForMagic
 *                     with the 0x47fa (lea x,a3) opcode to find the actual base address.
 */
export function parseDavidWhittakerFile(buffer: ArrayBuffer, filename: string, moduleBase = 0): TrackerSong {
  const buf = new Uint8Array(buffer);
  const baseName = filename.replace(/\.[^.]+$/, '');

  // Attempt to scan DW structures
  let scanResult: DWParseResult | null = null;
  try {
    scanResult = scanDWStructures(buf);
  } catch {
    // Fall through to default
  }

  const instruments: InstrumentConfig[] = [];

  if (scanResult && scanResult.samples.length > 0) {
    // Build instruments from scanned sample headers
    for (let i = 0; i < scanResult.samples.length; i++) {
      const sample = scanResult.samples[i];

      // Build default sequences — the exact offsets require full 68k
      // disassembly; emit safe defaults that produce audible output
      const volseq: number[] = [sample.volume & 0x3f, -128, 0];
      const frqseq: number[] = [-128, 0];

      // If we found a frqseq table, try to extract sequence for this sample
      if (scanResult.frqseqsOffset > 0 && scanResult.frqseqsOffset < buf.length) {
        // Each entry in the frqseq table is a 2-byte relative pointer
        const seqPtr = scanResult.base + u16BE(buf, scanResult.frqseqsOffset + i * 2);
        if (seqPtr > 0 && seqPtr < buf.length) {
          const extracted = extractSequence(buf, seqPtr, 64);
          if (extracted.length > 0) {
            frqseq.splice(0, frqseq.length, ...extracted);
          }
        }
      }

      // If we found a volseq table, try to extract sequence for this sample
      if (scanResult.volseqsOffset > 0 && scanResult.volseqsOffset < buf.length) {
        const seqPtr = scanResult.base + u16BE(buf, scanResult.volseqsOffset + i * 2);
        if (seqPtr > 0 && seqPtr < buf.length) {
          const extracted = extractSequence(buf, seqPtr, 64);
          if (extracted.length > 0) {
            volseq.splice(0, volseq.length, ...extracted);
          }
        }
      }

      const dwConfig: DavidWhittakerConfig = {
        defaultVolume: Math.min(64, sample.volume),
        relative: sample.relative > 0 ? sample.relative : 8364,
        vibratoSpeed: 0,
        vibratoDepth: 0,
        volseq,
        frqseq,
      };

      // File-relative offset of this instrument's sample header record.
      // instrBase = moduleBase + fileOffset; when moduleBase=0 (parse time),
      // instrBase equals the file offset and the UADEParser's NATIVE_ROUTES
      // wrapper resolves the real chip RAM address via scanMemoryForMagic.
      const instrFileOffset = scanResult.sampleInfoBase + i * scanResult.sampleInfoSize;
      const chipRam: UADEChipRamInfo = {
        moduleBase,
        moduleSize: buffer.byteLength,
        instrBase: moduleBase + instrFileOffset,
        instrSize: scanResult.sampleInfoSize,
        sections: {
          sampleInfoBase: moduleBase + scanResult.sampleInfoBase,
          base:           moduleBase + scanResult.base,
          frqseqs:        scanResult.frqseqsOffset > 0 ? moduleBase + scanResult.frqseqsOffset : 0,
          volseqs:        scanResult.volseqsOffset  > 0 ? moduleBase + scanResult.volseqsOffset  : 0,
        },
      };

      instruments.push({
        id: i + 1,
        name: `DW Inst ${i + 1}`,
        type: 'synth' as const,
        synthType: 'DavidWhittakerSynth' as const,
        davidWhittaker: dwConfig,
        uadeChipRam: chipRam,
        effects: [],
        volume: 0,
        pan: 0,
      } as InstrumentConfig);
    }
  }

  // If no instruments were extracted, emit one default instrument
  if (instruments.length === 0) {
    instruments.push({
      id: 1,
      name: 'DW Instrument',
      type: 'synth' as const,
      synthType: 'DavidWhittakerSynth' as const,
      davidWhittaker: { ...DEFAULT_DAVID_WHITTAKER },
      effects: [],
      volume: 0,
      pan: 0,
    } as InstrumentConfig);
  }

  // ── Extract real patterns as a byte-exact variable layout ──────────────────
  const CHANNELS = scanResult?.channels || 4;
  const ROWS = 64;

  let patterns: Pattern[] = [];
  let songPositions: number[] = [0];
  let initialSpeed = 6;
  let variable: DWVariableResult | null = null;

  if (scanResult && scanResult.songs.length > 0) {
    const song = scanResult.songs[0];
    initialSpeed = song.speed || 6;
    variable = buildDWVariablePatterns(buf, scanResult, song, CHANNELS);
    if (variable) {
      patterns = variable.patterns;
      songPositions = variable.songPositions;
    }
  }

  // Fallback: if no patterns were extracted, create a stub (no variable layout —
  // an unfaithful grid must NOT claim byte-exactness).
  if (patterns.length === 0) {
    const channelData: ChannelData[] = [];
    for (let ch = 0; ch < CHANNELS; ch++) {
      const rows: TrackerCell[] = [];
      for (let r = 0; r < ROWS; r++) {
        if (r === 0 && ch < instruments.length) {
          rows.push({
            note: 49, instrument: ch + 1, volume: 0,
            effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
          });
        } else {
          rows.push({
            note: 0, instrument: 0, volume: 0,
            effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
          });
        }
      }
      channelData.push({
        id: `channel-${ch}`, name: `Channel ${ch + 1}`,
        muted: false, solo: false, collapsed: false,
        volume: 100, pan: 0, instrumentId: null, color: null, rows,
      });
    }
    patterns = [{
      id: 'pattern-0', name: 'Pattern 1', length: ROWS, channels: channelData,
    }];
    songPositions = [0];
  }

  const extractInfo = patterns.length > 1
    ? ` (${patterns.length} patterns extracted)`
    : '';

  const result: TrackerSong = {
    name: `${baseName}${extractInfo}`,
    format: 'XM' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: CHANNELS,
    initialSpeed,
    initialBPM: 125,
    davidWhittakerFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
  };

  if (variable) {
    const uadeVariableLayout: UADEVariablePatternLayout = {
      formatId: 'davidWhittaker',
      numChannels: CHANNELS,
      numFilePatterns: variable.filePatternAddrs.length,
      rowsPerPattern: patterns.map(p => p.length),
      moduleSize: buffer.byteLength,
      encoder: davidWhittakerEncoder,
      filePatternAddrs: variable.filePatternAddrs,
      filePatternSizes: variable.filePatternSizes,
      trackMap: variable.trackMap,
    };
    (result as unknown as { uadeVariableLayout: UADEVariablePatternLayout }).uadeVariableLayout = uadeVariableLayout;
  }

  return result;
}

