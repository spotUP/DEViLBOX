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
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { DEFAULT_DAVID_WHITTAKER } from '@/types/instrument';
import { encodeDavidWhittakerCell } from '@/engine/uade/encoders/DavidWhittakerEncoder';
import { decodeMODCell } from '@/engine/uade/encoders/MODEncoder';

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

/** An event parsed from the pattern byte stream */
interface DWEvent {
  tick: number;       // absolute tick offset from song start
  note: number;       // tracker note (1-96), 0 = no note, 97 = note off
  instrument: number; // 1-based instrument, 0 = no change
  effTyp: number;
  eff: number;
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

// ── Pattern byte stream extraction ────────────────────────────────────────────

const MAX_PATTERN_EVENTS = 16384; // safety limit

/**
 * Parse a DW pattern byte stream for a single channel, starting at `startPos`.
 * Returns events with absolute tick offsets, and the byte position where parsing stopped.
 *
 * The DW byte stream format (from FlodJS DWPlayer.js process()):
 *   Positive byte (0-127): Note value (period table index + finetune)
 *   -1 to -32: Speed change (speed = globalSpeed * (byte + 33))
 *   com2 to -33: Sample change (sample index = byte - com2)
 *   com3 to com2: Volume sequence select
 *   com4 to com3: Frequency sequence select
 *   -128: End of pattern → next pattern from track list
 *   -127: Portamento (2 param bytes)
 *   -126: Rest/note off
 *   -125: Channel enable
 *   -124: Song end
 *   -123: Transpose (1 param byte)
 *   -122: Vibrato (2 param bytes)
 *   -121: Vibrato off
 *   -120: Various per variant (may read 1 byte)
 *   -119: Track jump / halve off (may read 2 bytes)
 *   -118: Speed/delay change (read 1 byte)
 *   -117: Fade (read 1 byte)
 *   -116: Song vol (read 1 byte)
 */
function parseDWChannelStream(
  buf: Uint8Array,
  scan: DWParseResult,
  song: DWSong,
  channelIdx: number,
): DWEvent[] {
  const events: DWEvent[] = [];
  const trackPtr = song.tracks[channelIdx];
  if (!trackPtr || trackPtr >= buf.length) return events;

  let globalSpeed = song.speed;
  let speed = globalSpeed;
  let currentSample = 1;  // 1-based instrument
  let tick = 0;

  // Read first pattern address from track list
  let trackPos = scan.readLen;  // advance past first entry
  let patternPos: number;
  if (scan.readLen === 4) {
    patternPos = u32BE(buf, trackPtr);
  } else {
    patternPos = scan.base + u16BE(buf, trackPtr);
  }

  if (patternPos < 0 || patternPos >= buf.length) return events;

  let safety = 0;
  while (safety++ < MAX_PATTERN_EVENTS) {
    if (patternPos < 0 || patternPos >= buf.length) break;
    const value = s8(buf, patternPos);
    patternPos++;

    if (value >= 0) {
      // Note: value is period table index
      const trackerNote = amigaIndexToTrackerNote(value);
      events.push({
        tick,
        note: trackerNote || 49,  // fallback to C-4
        instrument: currentSample,
        effTyp: 0,
        eff: 0,
      });
      tick += speed;
    } else if (value >= -32) {
      // Speed change: speed = globalSpeed * (value + 33)
      speed = globalSpeed * (value + 33);
      if (speed <= 0) speed = globalSpeed;
    } else if (value >= scan.com2) {
      // Sample change
      currentSample = (value - scan.com2) + 1;  // 1-based
    } else if (value >= scan.com3) {
      // Volume sequence select — skip (doesn't affect pattern display)
    } else if (value >= scan.com4) {
      // Frequency sequence select — skip
    } else {
      switch (value) {
        case -128: {
          // End of pattern → read next pattern address from track list
          if (trackPtr + trackPos >= buf.length) { safety = MAX_PATTERN_EVENTS; break; }
          let nextAddr: number;
          if (scan.readLen === 4) {
            nextAddr = u32BE(buf, trackPtr + trackPos);
          } else {
            nextAddr = u16BE(buf, trackPtr + trackPos);
          }

          if (!nextAddr) {
            // Null entry = loop to beginning of track — song loops, stop extraction
            safety = MAX_PATTERN_EVENTS;
            break;
          }
          if (scan.readLen === 4) {
            patternPos = nextAddr;
          } else {
            patternPos = scan.base + nextAddr;
          }
          trackPos += scan.readLen;
          break;
        }
        case -127:
          // Portamento: read 2 param bytes
          patternPos += 2;
          break;
        case -126:
          // Rest/note off — emit note-off event, advance ticks
          events.push({
            tick,
            note: 97,  // XM note-off
            instrument: 0,
            effTyp: 0,
            eff: 0,
          });
          tick += speed;
          break;
        case -125:
          // Channel enable (variant > 0) — no extra bytes
          break;
        case -124:
          // Song end
          safety = MAX_PATTERN_EVENTS;
          break;
        case -123:
          // Transpose: read 1 byte
          patternPos++;
          break;
        case -122:
          // Vibrato: read 2 bytes
          patternPos += 2;
          break;
        case -121:
          // Vibrato off — no extra bytes
          break;
        case -120:
          // Various per variant — may read 1 byte in some variants
          if (scan.variant >= 10 && scan.variant !== 21) patternPos++;
          break;
        case -119:
          // Track jump (variant != 21): read 2 bytes (new track pointer)
          if (scan.variant !== 21) patternPos += 2;
          break;
        case -118:
          // Speed/delay change: read 1 byte
          if (scan.variant !== 31) {
            globalSpeed = u8(buf, patternPos);
            speed = globalSpeed;
          }
          patternPos++;
          break;
        case -117:
          // Fade: read 1 byte
          patternPos++;
          break;
        case -116:
          // Song vol: read 1 byte
          patternPos++;
          break;
        default:
          // Unknown command — stop to avoid corruption
          safety = MAX_PATTERN_EVENTS;
          break;
      }
    }
  }

  return events;
}

/**
 * Convert DW per-channel events into unified tracker patterns.
 * Groups events into 64-row patterns, aligned by tick count.
 */
function buildDWPatterns(
  channelEvents: DWEvent[][],
  numChannels: number,
): Pattern[] {
  const ROWS_PER_PATTERN = 64;
  const patterns: Pattern[] = [];

  // Find total number of rows needed (max tick across channels / speed per row)
  let maxTick = 0;
  for (const events of channelEvents) {
    for (const ev of events) {
      if (ev.tick > maxTick) maxTick = ev.tick;
    }
  }

  // Each tick = 1 row in the pattern
  const totalRows = maxTick + 1;
  const numPatterns = Math.max(1, Math.ceil(totalRows / ROWS_PER_PATTERN));

  // Limit to reasonable number of patterns
  const patternLimit = Math.min(numPatterns, 256);

  for (let p = 0; p < patternLimit; p++) {
    const startTick = p * ROWS_PER_PATTERN;
    const channels: ChannelData[] = [];

    for (let ch = 0; ch < numChannels; ch++) {
      const rows: TrackerCell[] = [];
      const events = channelEvents[ch] || [];

      for (let r = 0; r < ROWS_PER_PATTERN; r++) {
        const targetTick = startTick + r;
        // Find event at this tick
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

  return patterns;
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

  // ── Extract real patterns from binary or fall back to stub ──────────────
  const CHANNELS = scanResult?.channels || 4;
  const ROWS = 64;

  let patterns: Pattern[] = [];
  let songPositions: number[] = [0];
  let initialSpeed = 6;

  if (scanResult && scanResult.songs.length > 0) {
    // Use first song for pattern extraction
    const song = scanResult.songs[0];
    initialSpeed = song.speed || 6;

    // Parse each channel's byte stream
    const channelEvents: DWEvent[][] = [];
    for (let ch = 0; ch < CHANNELS; ch++) {
      if (ch < song.tracks.length) {
        channelEvents.push(parseDWChannelStream(buf, scanResult, song, ch));
      } else {
        channelEvents.push([]);
      }
    }

    // Count total notes extracted
    let totalNotes = 0;
    for (const events of channelEvents) {
      totalNotes += events.filter(e => e.note > 0 && e.note < 97).length;
    }

    if (totalNotes > 0) {
      patterns = buildDWPatterns(channelEvents, CHANNELS);
      songPositions = patterns.map((_, i) => i);
    }
  }

  // Fallback: if no patterns were extracted, create a stub
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

  // ── Build uadePatternLayout for chip RAM editing ──────────────────────────
  // DW modules are compiled 68k executables — pattern data is embedded in
  // player code, so patternDataFileOffset is 0.  getCellFileOffset provides
  // a standard row-major layout relative to the module base for potential
  // chip RAM patching once the real data offset is resolved at runtime.
  const uadePatternLayout: UADEPatternLayout = {
    formatId: 'davidWhittaker',
    patternDataFileOffset: 0,
    bytesPerCell: 4,
    rowsPerPattern: ROWS,
    numChannels: CHANNELS,
    numPatterns: patterns.length,
    moduleSize: buffer.byteLength,
    encodeCell: encodeDavidWhittakerCell,
    decodeCell: decodeMODCell,
    getCellFileOffset: (pat: number, row: number, channel: number): number => {
      const patternByteSize = ROWS * CHANNELS * 4;
      return pat * patternByteSize + row * CHANNELS * 4 + channel * 4;
    },
  };

  const extractInfo = patterns.length > 1
    ? ` (${patterns.length} patterns extracted)`
    : '';

  return {
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
    uadePatternLayout,
  };
}

