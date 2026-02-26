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
import type { DavidWhittakerConfig } from '@/types/instrument';
import { DEFAULT_DAVID_WHITTAKER } from '@/types/instrument';

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

// ── Standard Amiga period table (60 entries, PAL) ────────────────────────────

const AMIGA_PERIODS: number[] = [
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
  107, 101,  95,  90,  85,  80,  75,  71,  67,  63,  60,  56,
   53,  50,  47,  45,  42,  40,  37,  35,  33,  31,  30,  28,
];

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

interface DWParseResult {
  base: number;
  variant: number;
  periodTableOffset: number;
  frqseqsOffset: number;
  volseqsOffset: number;
  samples: DWSampleHeader[];
  sampleInfoBase: number;
  sampleInfoSize: number;
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
  let headers = 0;
  let size = 10;
  let periodTableOffset = 0;
  let frqseqsOffset = 0;
  let volseqsOffset = 0;

  // ── First pass: scan for base address and song headers ────────────────────
  let pos = 0;

  // Check for variant 30 (movem.l at offset 0)
  if (u16BE(buf, 0) === 0x48e7) {
    if (u16BE(buf, 4) === 0x6100) {
      const offset = u16BE(buf, 6);
      pos = 4 + 2 + offset;  // skip to after bsr.w destination
      variant = 30;
    }
  }

  // Scan for rts (0x4e75) looking for base pointer and song info
  let safeLimit = 0;
  while (pos < buf.length - 20 && safeLimit++ < 4096) {
    const val = u16BE(buf, pos);
    pos += 2;

    if (val === 0x4e75) break;  // rts

    switch (val) {
      case 0x47fa: {  // lea x,a3 — base pointer
        const disp = s16BE(buf, pos);
        base = pos + disp;
        pos += 2;
        break;
      }
      case 0x6100: {  // bsr.w — info pointer
        pos += 2;
        _info = pos;
        if (u16BE(buf, pos - 2 - 2) === 0x6100) {
          _info = pos + s16BE(buf, pos - 2);
          pos += 2;
        }
        break;
      }
      case 0xc0fc: {  // mulu.w #x,d0
        size = u16BE(buf, pos);
        pos += 2;
        if (size === 18) {
          _readLen = 4;
        } else {
          variant = 10;
        }
        if (u16BE(buf, pos) === 0x41fa) {  // lea x,a0
          pos += 2;
          headers = pos + s16BE(buf, pos);
          pos += 2;
        }
        if (u16BE(buf, pos) === 0x1230) _flag = 1;
        break;
      }
      case 0x1230: {  // move.b (a0,d0.w),d1
        pos -= 6;
        if (u16BE(buf, pos) === 0x41fa) {
          pos += 2;
          headers = pos + s16BE(buf, pos);
          pos += 2;
          _flag = 1;
        }
        pos += 4;
        break;
      }
      case 0xbe7c: {  // cmp.w #x,d7
        _channels = u16BE(buf, pos);
        pos += 4;
        break;
      }
    }

    if (pos > buf.length - 4) break;
  }

  if (!base && !headers) return null;

  // ── Second pass: scan for sample info and sequences ───────────────────────
  // After the first rts, scan for sample data structures
  let sampleInfoBase = headers;
  let sampleInfoSize = size;

  const samples: DWSampleHeader[] = [];

  // Parse sample headers from the headers table
  // Each sample header: length(4), tuning(2), [data follows]
  if (headers > 0 && headers < buf.length) {
    let spos = headers;
    for (let i = 0; i < 64 && spos + 6 < buf.length; i++) {
      const length = u32BE(buf, spos);
      if (length === 0 || length > 0x100000) break;  // sanity check

      const tuningVal = u16BE(buf, spos + 4);
      if (tuningVal === 0) break;

      const relative = Math.floor(3579545 / tuningVal);

      samples.push({
        length,
        tuning: tuningVal,
        relative,
        volume: 64,   // default; may be overwritten below
        loopPtr: 0,
        finetune: 0,
        volseqOffset: 0,
      });

      spos += size;  // advance by sample record size
    }
  }

  // ── Third pass: scan for period table, frqseqs, volseqs ──────────────────
  pos = 0;
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
          _com2 = 0xc0; com3 = 0xb0; com4 = 0xa0;
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

  return {
    base,
    variant,
    periodTableOffset,
    frqseqsOffset,
    volseqsOffset,
    samples,
    sampleInfoBase,
    sampleInfoSize,
  };
}

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Parse a David Whittaker (.dw / .dwold) file into a TrackerSong.
 *
 * Extracts instrument configs using heuristic binary scanning.
 * Returns a minimal song if full extraction is not possible.
 */
export function parseDavidWhittakerFile(buffer: ArrayBuffer, filename: string): TrackerSong {
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

      instruments.push({
        id: i + 1,
        name: `DW Inst ${i + 1}`,
        type: 'synth' as const,
        synthType: 'DavidWhittakerSynth' as const,
        davidWhittaker: dwConfig,
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

  // ── Build minimal pattern ─────────────────────────────────────────────────
  // Emit a single-row pattern for each instrument as a preview
  const CHANNELS = 4;
  const ROWS = 64;
  const channelData: ChannelData[] = [];

  for (let ch = 0; ch < CHANNELS; ch++) {
    const rows: TrackerCell[] = [];
    for (let r = 0; r < ROWS; r++) {
      if (r === 0 && ch < instruments.length) {
        rows.push({
          note: 49,  // MIDI 60 / C-4 / Amiga index 24 (C-3)
          instrument: ch + 1,
          volume: 0,
          effTyp: 0,
          eff: 0,
          effTyp2: 0,
          eff2: 0,
        });
      } else {
        rows.push({
          note: 0,
          instrument: 0,
          volume: 0,
          effTyp: 0,
          eff: 0,
          effTyp2: 0,
          eff2: 0,
        });
      }
    }
    channelData.push({
      id:           `channel-${ch}`,
      name:         `Channel ${ch + 1}`,
      muted:        false,
      solo:         false,
      collapsed:    false,
      volume:       100,
      pan:          0,
      instrumentId: null,
      color:        null,
      rows,
    });
  }

  const pattern: Pattern = {
    id:       'pattern-0',
    name:     'Pattern 1',
    length:   ROWS,
    channels: channelData,
  };
  const songPositions = [0];

  return {
    name: baseName,
    format: 'XM' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: CHANNELS,
    initialSpeed: 6,
    initialBPM: 125,
  };
}

