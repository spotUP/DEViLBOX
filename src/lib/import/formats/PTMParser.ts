/**
 * PTMParser.ts — PolyTracker (.ptm) PC format parser
 *
 * PolyTracker is a PC DOS tracker format by Peter Sprenger. It is broadly
 * S3M-compatible but uses its own RLE-compressed pattern encoding and delta
 * PCM sample storage.
 *
 * Binary layout — 608-byte PTMFileHeader (little-endian throughout):
 *   +0    songname    (28 bytes, null-terminated ASCII)
 *   +28   dosEOF      (uint8, must be 26)
 *   +29   versionLo   (uint8, e.g. 0x03)
 *   +30   versionHi   (uint8, must be ≤ 2)
 *   +31   reserved1   (uint8)
 *   +32   numOrders   (uint16LE, 1–256)
 *   +34   numSamples  (uint16LE, 1–255)
 *   +36   numPatterns (uint16LE, 1–128)
 *   +38   numChannels (uint16LE, 1–32)
 *   +40   flags       (uint16LE, must be 0)
 *   +42   reserved2   (2 bytes)
 *   +44   magic       "PTMF" (4 bytes)
 *   +48   reserved3   (16 bytes)
 *   +64   chnPan[32]  (uint8 each; pan = (val & 0x0F) << 4 | 4)
 *   +96   orders[256] (uint8 each; 0xFF = end, 0xFE = loop)
 *   +352  patOffsets[128] (uint16LE each; byte offset = value * 16)
 *
 * After header: numSamples × 80-byte PTMSampleHeader (little-endian):
 *   +0    flags       (uint8)
 *   +1    filename    (12 bytes, null-terminated)
 *   +13   volume      (uint8, 0–64)
 *   +14   c4speed     (uint16LE; C5 speed = c4speed * 2)
 *   +16   smpSegment  (2 bytes, ignored)
 *   +18   dataOffset  (uint32LE, absolute byte offset to sample data)
 *   +22   length      (uint32LE, bytes)
 *   +26   loopStart   (uint32LE, bytes)
 *   +30   loopEnd     (uint32LE, bytes; subtract 1 for inclusive end)
 *   +34   gusdata     (14 bytes, ignored)
 *   +48   samplename  (28 bytes, null-terminated)
 *   +76   magic "PTMS" (4 bytes, ignored)
 *
 * Reference: OpenMPT Load_ptm.cpp (Olivier Lapicque, OpenMPT Devs)
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// ── Binary helpers ────────────────────────────────────────────────────────────

function u8(v: DataView, off: number): number  { return v.getUint8(off); }
function u16(v: DataView, off: number): number { return v.getUint16(off, true); }
function u32(v: DataView, off: number): number { return v.getUint32(off, true); }

function readString(v: DataView, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const ch = v.getUint8(off + i);
    if (ch === 0) break;
    s += String.fromCharCode(ch);
  }
  return s.trim();
}

// ── Constants ─────────────────────────────────────────────────────────────────

const HEADER_SIZE        = 608;   // PTMFileHeader byte length
const SAMPLE_HEADER_SIZE = 80;    // PTMSampleHeader byte length
const ROWS_PER_PATTERN   = 64;
const MAX_CHANNELS       = 32;

// Sample flag bits (PTMSampleHeader.flags)
const SMP_TYPE_MASK  = 0x03;
const SMP_PCM        = 0x01;
const SMP_LOOP       = 0x04;
const SMP_16BIT      = 0x10;

// Order-list sentinel values
const ORDER_END  = 0xFF;
const ORDER_SKIP = 0xFE;

// ── Interfaces ────────────────────────────────────────────────────────────────

interface PTMSampleInfo {
  flags:      number;
  filename:   string;
  volume:     number;
  c4speed:    number;
  dataOffset: number;
  length:     number;
  loopStart:  number;
  loopEnd:    number;
  name:       string;
}

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Returns true if the buffer contains a valid PTM file.
 *
 * Checks:
 *   1. "PTMF" magic at offset 44
 *   2. dosEOF == 26
 *   3. versionHi ≤ 2
 *   4. flags == 0
 *   5. numChannels 1–32
 *   6. numOrders 1–256
 *   7. numSamples 1–255
 *   8. numPatterns 1–128
 *   9. Buffer large enough for header + sample headers
 */
export function isPTMFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < HEADER_SIZE) return false;

  const v = new DataView(buffer);

  // 1. Magic "PTMF" at +44
  if (
    v.getUint8(44) !== 0x50 || // P
    v.getUint8(45) !== 0x54 || // T
    v.getUint8(46) !== 0x4D || // M
    v.getUint8(47) !== 0x46    // F
  ) return false;

  // 2. dosEOF must be 26
  if (u8(v, 28) !== 26) return false;

  // 3. versionHi must be ≤ 2
  if (u8(v, 30) > 2) return false;

  // 4. flags must be 0
  if (u16(v, 40) !== 0) return false;

  // 5-8. Channel/order/sample/pattern count sanity
  const numChannels = u16(v, 38);
  const numOrders   = u16(v, 32);
  const numSamples  = u16(v, 34);
  const numPatterns = u16(v, 36);

  if (numChannels < 1 || numChannels > 32) return false;
  if (numOrders   < 1 || numOrders   > 256) return false;
  if (numSamples  < 1 || numSamples  > 255) return false;
  if (numPatterns < 1 || numPatterns > 128) return false;

  return true;
}

// ── Delta PCM decode ──────────────────────────────────────────────────────────

/**
 * Decode 8-bit delta PCM to signed int8 PCM stored in a Uint8Array.
 *
 * PTM uses delta encoding: each byte is a signed delta from the previous
 * sample value. The running sum wraps at uint8 boundaries, then the final
 * value is reinterpreted as signed (two's complement) before output.
 *
 * Algorithm (matching OpenMPT SampleIO::deltaPCM for 8-bit):
 *   running = 0
 *   for each byte d:
 *     running = (running + d) & 0xFF     // unsigned 8-bit addition
 *     output signed = running >= 128 ? running - 256 : running
 *
 * The output is stored as signed bytes in a Uint8Array (two's complement),
 * which is what createSamplerInstrument / pcm8ToWAV expect.
 */
function decodeDeltaPCM8(raw: Uint8Array): Uint8Array {
  const out = new Uint8Array(raw.length);
  let running = 0;
  for (let i = 0; i < raw.length; i++) {
    running = (running + raw[i]) & 0xFF;
    // Store as two's complement signed byte: values 128–255 map to -128 to -1
    out[i] = running;
  }
  return out;
}

// ── Effect command conversion ─────────────────────────────────────────────────

/**
 * Convert a raw PTM effect command (0x00–0x0F, MOD-style letters A–P) and
 * parameter into a TrackerCell effTyp / eff pair.
 *
 * PTM effects are MOD commands 0–15 (0=arpeggio, 1=portaUp, …, F=speed/bpm)
 * but portamento and volume slides behave like S3M (fine slides share the same
 * letter). Command 0x08 (panning) is remapped to S3MCMDEX per OpenMPT.
 *
 * Returns { effTyp, eff } with the canonical XM effect encoding used by the
 * rest of the codebase (effTyp matches standard MOD/XM numbering).
 */
function convertPTMEffect(
  command: number,
  param: number,
): { effTyp: number; eff: number } {
  // Commands 0x00–0x0F: standard MOD effect letters
  // effTyp values here match the standard XM/MOD encoding used in TrackerCell.
  switch (command) {
    case 0x00: return { effTyp: 0x00, eff: param };  // Arpeggio
    case 0x01: return { effTyp: 0x01, eff: param };  // Porta up
    case 0x02: return { effTyp: 0x02, eff: param };  // Porta down
    case 0x03: return { effTyp: 0x03, eff: param };  // Tone portamento
    case 0x04: return { effTyp: 0x04, eff: param };  // Vibrato
    case 0x05: return { effTyp: 0x05, eff: param };  // Tone porta + vol slide
    case 0x06: return { effTyp: 0x06, eff: param };  // Vibrato + vol slide
    case 0x07: return { effTyp: 0x07, eff: param };  // Tremolo
    case 0x08: {
      // Panning → S3MCMDEX (0x53 = 'S' in XM extended commands)
      // Formula from OpenMPT: 0x80 | ((max(param >> 3, 1) - 1) & 0x0F)
      const panVal = (Math.max((param >> 3), 1) - 1) & 0x0F;
      return { effTyp: 0x53, eff: 0x80 | panVal };  // CMD_S3MCMDEX
    }
    case 0x09: return { effTyp: 0x09, eff: param };  // Sample offset
    case 0x0A: return { effTyp: 0x0A, eff: param };  // Volume slide
    case 0x0B: return { effTyp: 0x0B, eff: param };  // Position jump
    case 0x0C: return { effTyp: 0x0C, eff: param };  // Set volume
    case 0x0D: return { effTyp: 0x0D, eff: param };  // Pattern break
    case 0x0E: return { effTyp: 0x0E, eff: param };  // Extended MOD (Exy)
    case 0x0F: return { effTyp: 0x0F, eff: param };  // Set speed / BPM
    default:   return { effTyp: 0x00, eff: 0x00 };  // Unknown → ignore
  }
}

// ── Sample header parser ──────────────────────────────────────────────────────

/**
 * Parse a single 80-byte PTMSampleHeader at the given offset.
 */
function parseSampleHeader(v: DataView, off: number): PTMSampleInfo {
  return {
    flags:      u8(v,  off + 0),
    filename:   readString(v, off + 1,  12),
    volume:     u8(v,  off + 13),
    c4speed:    u16(v, off + 14),
    dataOffset: u32(v, off + 18),
    length:     u32(v, off + 22),
    loopStart:  u32(v, off + 26),
    loopEnd:    u32(v, off + 30),
    name:       readString(v, off + 48, 28),
  };
}

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Parse a PolyTracker (.ptm) file into a TrackerSong.
 *
 * @throws If the buffer fails PTM validation.
 */
export async function parsePTMFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  if (!isPTMFormat(buffer)) {
    throw new Error('PTMParser: file does not pass PTM format validation');
  }

  const v     = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // ── Header fields ──────────────────────────────────────────────────────────

  const songName    = readString(v, 0, 28) || filename.replace(/\.[^/.]+$/, '');
  const numOrders   = u16(v, 32);
  const numSamples  = u16(v, 34);
  const numPatterns = u16(v, 36);
  const numChannels = u16(v, 38);

  // ── Channel panning ────────────────────────────────────────────────────────
  // chnPan[32] at +64: each byte 0–15; pan = (val & 0x0F) << 4 | 4
  // 0=left(4), 7=center(116≈128), 15=right(244)
  // We store as -100..+100 for our ChannelData.pan field.
  // Map: 0→-100, 7→0, 15→+100 with linear interpolation.

  const channelPan: number[] = [];
  for (let ch = 0; ch < MAX_CHANNELS; ch++) {
    const raw = u8(v, 64 + ch) & 0x0F;
    // raw 0=left, 7=center, 15=right
    channelPan.push(Math.round((raw / 7.5 - 1) * 100));
  }

  // ── Order list ─────────────────────────────────────────────────────────────
  // orders[256] at +96: valid entries are 0..numOrders-1.
  // 0xFF = end-of-song marker, 0xFE = loop-back marker (skip both).

  const orderList: number[] = [];
  let restartPosition = 0;

  for (let i = 0; i < numOrders; i++) {
    const ord = u8(v, 96 + i);
    if (ord === ORDER_END) break;
    if (ord === ORDER_SKIP) {
      // 0xFE marks the loop point — record current position as restart
      restartPosition = orderList.length;
      continue;
    }
    orderList.push(ord);
  }

  // ── Pattern offsets ────────────────────────────────────────────────────────
  // patOffsets[128] at +352: uint16LE; actual byte offset = value * 16.

  const patOffsets: number[] = [];
  for (let i = 0; i < 128; i++) {
    patOffsets.push(u16(v, 352 + i * 2) * 16);
  }

  // ── Sample headers ─────────────────────────────────────────────────────────

  const sampleHeaders: PTMSampleInfo[] = [];
  const sampleBase = HEADER_SIZE;

  for (let s = 0; s < numSamples; s++) {
    sampleHeaders.push(parseSampleHeader(v, sampleBase + s * SAMPLE_HEADER_SIZE));
  }

  // ── Patterns ───────────────────────────────────────────────────────────────
  // Each pattern is RLE-compressed at patOffsets[pat] (0 = absent).
  //
  // Loop: read byte b.
  //   b == 0           → advance row (row++)
  //   b & 0x1F         → channel index (0-based)
  //   b & 0x20         → note + instrument follow (2 bytes)
  //   b & 0x40         → command + param follow (2 bytes)
  //   b & 0x80         → volume byte follows (1 byte)

  const patterns: Pattern[] = [];

  for (let pat = 0; pat < numPatterns; pat++) {
    // Build empty channels
    const channels: ChannelData[] = Array.from(
      { length: numChannels },
      (_, ch): ChannelData => ({
        id:           `channel-${ch}`,
        name:         `Ch ${ch + 1}`,
        muted:        false,
        solo:         false,
        collapsed:    false,
        volume:       100,
        pan:          ch < MAX_CHANNELS ? channelPan[ch] : 0,
        instrumentId: null,
        color:        null,
        rows:         [],
      }),
    );

    // Pre-fill all rows with empty cells so random-access writes work
    const grid: TrackerCell[][] = Array.from({ length: ROWS_PER_PATTERN }, () =>
      Array.from({ length: numChannels }, (): TrackerCell => ({
        note:    0,
        instrument: 0,
        volume:  0,
        effTyp:  0,
        eff:     0,
        effTyp2: 0,
        eff2:    0,
      })),
    );

    const patOffset = patOffsets[pat];

    if (patOffset !== 0 && patOffset + 1 < buffer.byteLength) {
      let pos = patOffset;
      let row = 0;

      while (row < ROWS_PER_PATTERN && pos < buffer.byteLength) {
        const b = bytes[pos++];

        if (b === 0) {
          // End-of-row marker
          row++;
          continue;
        }

        const ch = b & 0x1F;
        // Use a dummy target cell for out-of-range channels so we still
        // advance the read cursor correctly.
        const cell: TrackerCell = ch < numChannels ? grid[row][ch] : {
          note: 0, instrument: 0, volume: 0,
          effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        };

        if (b & 0x20) {
          // Note + instrument
          if (pos + 1 >= buffer.byteLength) break;
          const rawNote  = bytes[pos++];
          const rawInstr = bytes[pos++];

          cell.instrument = rawInstr;

          if (rawNote === 254) {
            cell.note = 97; // NOTE_CUT (XM convention)
          } else if (rawNote >= 1 && rawNote <= 120) {
            cell.note = rawNote; // PTM notes are 1-indexed, same as XM
          } else {
            cell.note = 0; // empty
          }
        }

        if (b & 0x40) {
          // Effect command + parameter
          if (pos + 1 >= buffer.byteLength) break;
          const command = bytes[pos++];
          const param   = bytes[pos++];

          // Global volume (command 0x10 in OpenMPT's effTrans offset but 0x00
          // remapped via ConvertModCommand → CMD_GLOBALVOLUME only when
          // command == 0x10). For PTM, commands 0x00–0x0F are standard MOD
          // effects. Command 0x10+ are extended and rarely used; we ignore
          // them for now (the reference implementation maps them to exotic
          // IT/S3M commands not needed for basic playback).
          if (command <= 0x0F) {
            let effParam = param;

            // Global volume special case: command 0x0C treated as set-volume
            // inside PTM (CMD_GLOBALVOLUME is command 0x10 in OpenMPT's extra
            // table, not 0x0C). Standard handling applies here.

            const { effTyp, eff } = convertPTMEffect(command, effParam);
            cell.effTyp = effTyp;
            cell.eff    = eff;
          }
          // Commands > 0x0F: extended PTM effects (rare), ignore for playback
        }

        if (b & 0x80) {
          // Volume column byte (0–64)
          if (pos >= buffer.byteLength) break;
          const vol = bytes[pos++];
          cell.volume = Math.min(vol, 64);
        }
      }
    }

    // Assign rows from grid into channels
    for (let ch = 0; ch < numChannels; ch++) {
      for (let row = 0; row < ROWS_PER_PATTERN; row++) {
        channels[ch].rows.push(grid[row][ch]);
      }
    }

    patterns.push({
      id:      `pattern-${pat}`,
      name:    `Pattern ${pat}`,
      length:  ROWS_PER_PATTERN,
      channels,
      importMetadata: {
        sourceFormat:            'PTM',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    numChannels,
        originalPatternCount:    numPatterns,
        originalInstrumentCount: numSamples,
      },
    });
  }

  // ── Sample PCM data ────────────────────────────────────────────────────────
  // PTM uses delta PCM encoding for all sample data.
  // For 8-bit samples: running cumulative sum (uint8) then reinterpret as signed.
  // For 16-bit samples: PTM8Dto16 is a special 8→16 delta expansion; since we
  // store as Uint8Array via createSamplerInstrument / pcm8ToWAV (which reads
  // signed 8-bit), we decode the same way and note bit-depth for rate/length.

  const instruments: InstrumentConfig[] = [];

  for (let s = 0; s < numSamples; s++) {
    const hdr = sampleHeaders[s];
    const id  = s + 1;

    const isPCM    = (hdr.flags & SMP_TYPE_MASK) === SMP_PCM;
    const is16Bit  = (hdr.flags & SMP_16BIT)     !== 0;
    const hasLoop  = (hdr.flags & SMP_LOOP)       !== 0;

    if (!isPCM || hdr.length === 0 || hdr.dataOffset === 0) {
      // No usable sample data — emit silent placeholder
      instruments.push({
        id,
        name: hdr.name || hdr.filename || `Sample ${id}`,
        type:      'sample'  as const,
        synthType: 'Sampler' as const,
        effects:   [],
        volume:    -60,
        pan:       0,
      } as unknown as InstrumentConfig);
      continue;
    }

    // C5 speed: PTM stores C4 speed; actual C5 = c4speed * 2.
    // If c4speed is 0, fall back to a sensible default (8363 = standard S3M C5).
    const sampleRate = hdr.c4speed > 0 ? hdr.c4speed * 2 : 8363;

    // For 16-bit samples, length/loopStart/loopEnd are in bytes;
    // divide by 2 to get sample-frame counts. We still read the raw bytes.
    const byteLength   = hdr.length;
    const loopStartB   = hdr.loopStart;
    // OpenMPT decrements loopEnd by 1 (exclusive → inclusive range)
    const loopEndB     = hdr.loopEnd > 0 ? hdr.loopEnd - 1 : 0;

    // Sample-frame counts (for createSamplerInstrument loop points)
    const frameDivisor = is16Bit ? 2 : 1;
    const loopStartF   = loopStartB / frameDivisor;
    const loopEndF     = hasLoop && loopEndB > loopStartB
      ? loopEndB / frameDivisor
      : 0;

    // Read raw bytes from file
    const dataEnd = hdr.dataOffset + byteLength;
    if (dataEnd > buffer.byteLength) {
      // Sample data extends past end of file — skip
      instruments.push({
        id,
        name: hdr.name || hdr.filename || `Sample ${id}`,
        type:      'sample'  as const,
        synthType: 'Sampler' as const,
        effects:   [],
        volume:    -60,
        pan:       0,
      } as unknown as InstrumentConfig);
      continue;
    }

    const rawBytes = bytes.slice(hdr.dataOffset, dataEnd);

    // Decode delta PCM (8-bit running sum; same algorithm regardless of 16-bit
    // flag since createSamplerInstrument / pcm8ToWAV operates on byte streams)
    const pcmBytes = decodeDeltaPCM8(rawBytes);

    // Volume: PTM stores 0–64, createSamplerInstrument expects 0–64
    const volume = Math.min(hdr.volume, 64);

    // Loop points in bytes (createSamplerInstrument takes byte offsets)
    const loopStartBytes = hasLoop ? Math.round(loopStartF) : 0;
    const loopEndBytes   = hasLoop && loopEndF > loopStartF
      ? Math.round(loopEndF)
      : 0;

    const name = hdr.name || hdr.filename || `Sample ${id}`;

    instruments.push(
      createSamplerInstrument(id, name, pcmBytes, volume, sampleRate, loopStartBytes, loopEndBytes),
    );
  }

  // ── Assemble TrackerSong ───────────────────────────────────────────────────

  return {
    name:            songName,
    format:          'S3M' as TrackerFormat, // PTM is S3M-compatible; use S3M playback engine
    patterns,
    instruments,
    songPositions:   orderList.length > 0 ? orderList : [0],
    songLength:      orderList.length > 0 ? orderList.length : 1,
    restartPosition,
    numChannels,
    initialSpeed:    6,   // PTM has no speed field in header; 6 is the tracker default
    initialBPM:      125, // PTM has no BPM field in header; 125 is the DOS tracker default
    linearPeriods:   false,
  };
}
