/**
 * IMSParser.ts — Images Music System (.ims) Amiga format parser
 *
 * Images Music System is a 4-channel Amiga tracker format. It has no magic bytes;
 * detection is purely structural (header layout and offset consistency checks).
 *
 * Binary layout (1084-byte header):
 *   +0    song name (20 bytes, null-padded ASCII)
 *   +20   31 × MOD sample header (30 bytes each = 930 bytes total)
 *         Each sample: name(22) + length(uint16BE, words) + finetune(int8)
 *                      + volume(uint8) + loopStart(uint16BE, words) + loopLen(uint16BE, words)
 *   +950  numOrders  (uint8)
 *   +951  restartPos (uint8)
 *   +952  order list (128 bytes, uint8 each)
 *   +1080 sampleDataOffset (uint32BE) — byte offset to sample PCM data
 *   +1084 pattern data (3 bytes/cell × 64 rows × 4 channels, packed sequentially)
 *   +sampleDataOffset: sample PCM data (signed int8, sequential per instrument)
 *
 * Pattern cell (3 bytes):
 *   byte0 bits[7:6]: instrument high bits [5:4]
 *   byte0 bits[5:0]: note index (0–47 = note, 63 = empty, other = invalid)
 *   byte1 bits[7:4]: instrument low bits [3:0]
 *   byte1 bits[3:0]: effect type
 *   byte2:           effect parameter
 *
 * Reference: OpenMPT Load_ims.cpp
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// ── Binary helpers ────────────────────────────────────────────────────────────

function u8(v: DataView, off: number): number  { return v.getUint8(off); }
function i8(v: DataView, off: number): number  { return v.getInt8(off); }
function u16(v: DataView, off: number): number { return v.getUint16(off, false); }
function u32(v: DataView, off: number): number { return v.getUint32(off, false); }

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

const HEADER_SIZE      = 1084;   // fixed IMS header length
const BYTES_PER_PATTERN = 768;   // 3 bytes/cell × 64 rows × 4 channels
const NUM_CHANNELS     = 4;
const ROWS_PER_PATTERN = 64;
const MAX_SAMPLES      = 31;
const MAX_PATTERNS     = 128;
const SAMPLE_RATE      = 8287;   // standard Amiga PAL rate

// LRRL stereo panning (Amiga standard)
const CHANNEL_PAN = [-50, 50, 50, -50] as const;

// ── IMS sample header ─────────────────────────────────────────────────────────

interface IMSSample {
  name:      string;
  length:    number;   // in words (multiply by 2 for bytes)
  finetune:  number;   // int8 — must be 0 for valid IMS
  volume:    number;   // 0–64
  loopStart: number;   // in words
  loopLen:   number;   // in words (>1 means loop active)
}

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Returns true if the buffer passes all IMS structural validation checks.
 * IMS has no magic bytes — detection is based entirely on internal consistency.
 */
export function isIMSFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < HEADER_SIZE) return false;

  const v = new DataView(buffer);

  // Read the sample data offset stored at +1080
  const sampleDataOffset = u32(v, 1080);

  // The offset must be past the header
  if (sampleDataOffset <= HEADER_SIZE) return false;

  // The gap between header end and sample data must be an exact multiple of
  // BYTES_PER_PATTERN — this is the primary structural fingerprint.
  const patternDataSize = sampleDataOffset - HEADER_SIZE;
  if (patternDataSize % BYTES_PER_PATTERN !== 0) return false;

  const numPatterns = patternDataSize / BYTES_PER_PATTERN;
  if (numPatterns > MAX_PATTERNS) return false;

  // Order / sequence sanity
  const numOrders  = u8(v, 950);
  const restartPos = u8(v, 951);

  if (numOrders === 0 || numOrders > 128) return false;
  if (restartPos > numOrders)             return false;

  // Every order entry must reference a valid pattern index
  for (let i = 0; i < 128; i++) {
    if (u8(v, 952 + i) >= numPatterns) return false;
  }

  // At least one sample must have a non-zero length
  let hasSampleLength = false;
  for (let s = 0; s < MAX_SAMPLES; s++) {
    const base   = 20 + s * 30;
    const length = u16(v, base + 22);  // length in words
    if (length > 0x8000) return false; // implausibly large → reject

    const finetune = i8(v, base + 24);
    if (finetune !== 0) return false;  // IMS samples always have finetune == 0

    if (length > 0) hasSampleLength = true;
  }

  return hasSampleLength;
}

// ── Note index → XM note ──────────────────────────────────────────────────────

/**
 * Convert an IMS note index (0–47) to an XM note number.
 *   IMS note 0  → C-0 in the module = XM note 37 (C-3 in standard XM octave numbering)
 *   IMS note 47 → the highest note = XM note 84
 *   IMS note 63 → empty cell (XM note 0)
 *   Any other value is invalid.
 *
 * Returns -1 on invalid (caller should throw).
 */
function imsNoteToXM(noteIdx: number): number {
  if (noteIdx === 63) return 0;          // empty cell
  if (noteIdx < 48)  return 37 + noteIdx; // valid note range
  return -1;                              // invalid
}

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Parse an Images Music System (.ims) file into a TrackerSong.
 *
 * @throws If the file fails validation or contains an invalid note value.
 */
export async function parseIMSFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  if (!isIMSFormat(buffer)) {
    throw new Error('IMSParser: file does not pass IMS format validation');
  }

  const v     = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // ── Header fields ──────────────────────────────────────────────────────────

  const songName         = readString(v, 0, 20) || filename.replace(/\.[^/.]+$/, '');
  const numOrders        = u8(v, 950);
  const restartPos       = u8(v, 951);
  const sampleDataOffset = u32(v, 1080);

  const numPatterns = (sampleDataOffset - HEADER_SIZE) / BYTES_PER_PATTERN;

  // Order list: only the first numOrders entries are meaningful
  const orderList: number[] = [];
  for (let i = 0; i < numOrders; i++) {
    orderList.push(u8(v, 952 + i));
  }

  // ── Sample headers ─────────────────────────────────────────────────────────
  // Offset +20, 31 samples × 30 bytes each:
  //   +0  name      (22 bytes)
  //   +22 length    (uint16BE, words)
  //   +24 finetune  (int8)
  //   +25 volume    (uint8)
  //   +26 loopStart (uint16BE, words)
  //   +28 loopLen   (uint16BE, words)

  const sampleHeaders: IMSSample[] = [];
  for (let s = 0; s < MAX_SAMPLES; s++) {
    const base = 20 + s * 30;
    sampleHeaders.push({
      name:      readString(v, base,      22) || `Sample ${s + 1}`,
      length:    u16(v, base + 22),
      finetune:  i8(v, base + 24),
      volume:    u8(v, base + 25),
      loopStart: u16(v, base + 26),
      loopLen:   u16(v, base + 28),
    });
  }

  // ── Pattern data ───────────────────────────────────────────────────────────
  // Patterns are stored sequentially starting at +1084.
  // Each pattern: 64 rows × 4 channels × 3 bytes = 768 bytes.
  //
  // Cell encoding (3 bytes):
  //   b0 = [instrHi:2 | noteIdx:6]
  //   b1 = [instrLo:4 | effTyp:4]
  //   b2 = effParam

  const patterns: Pattern[] = [];
  let patternBase = HEADER_SIZE;

  for (let pIdx = 0; pIdx < numPatterns; pIdx++) {
    const channels: ChannelData[] = Array.from(
      { length: NUM_CHANNELS },
      (_, ch): ChannelData => ({
        id:           `channel-${ch}`,
        name:         `Channel ${ch + 1}`,
        muted:        false,
        solo:         false,
        collapsed:    false,
        volume:       100,
        pan:          CHANNEL_PAN[ch],
        instrumentId: null,
        color:        null,
        rows:         [],
      }),
    );

    // Cells are stored row-major: row0ch0, row0ch1, row0ch2, row0ch3, row1ch0, …
    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const cellOff = patternBase + (row * NUM_CHANNELS + ch) * 3;

        const b0 = u8(v, cellOff);
        const b1 = u8(v, cellOff + 1);
        const b2 = u8(v, cellOff + 2);

        // Decode note and instrument
        const noteIdx  = b0 & 0x3F;
        const instrHi  = (b0 & 0xC0) >> 2;   // bits [5:4] of instrument
        const instrLo  = (b1 & 0xF0) >> 4;   // bits [3:0] of instrument
        const instrument = instrHi | instrLo;  // 0–31
        const effTyp   = b1 & 0x0F;
        const eff      = b2;

        if (instrument > MAX_SAMPLES) {
          throw new Error(
            `IMSParser: invalid instrument ${instrument} at pattern ${pIdx} row ${row} ch ${ch}`,
          );
        }

        const xmNote = imsNoteToXM(noteIdx);
        if (xmNote === -1) {
          throw new Error(
            `IMSParser: invalid note index ${noteIdx} at pattern ${pIdx} row ${row} ch ${ch}`,
          );
        }

        const cell: TrackerCell = {
          note:       xmNote,
          instrument: instrument,
          volume:     0,     // IMS has no volume column
          effTyp,
          eff,
          effTyp2:    0,
          eff2:       0,
        };

        channels[ch].rows.push(cell);
      }
    }

    patterns.push({
      id:      `pattern-${pIdx}`,
      name:    `Pattern ${pIdx}`,
      length:  ROWS_PER_PATTERN,
      channels,
      importMetadata: {
        sourceFormat:            'IMS',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    NUM_CHANNELS,
        originalPatternCount:    numPatterns,
        originalInstrumentCount: MAX_SAMPLES,
      },
    });

    patternBase += BYTES_PER_PATTERN;
  }

  // ── Sample PCM data ────────────────────────────────────────────────────────
  // Samples are stored sequentially starting at sampleDataOffset.
  // Each sample is (header.length * 2) bytes of signed int8 PCM.

  let pcmCursor = sampleDataOffset;
  const samplePCM: (Uint8Array | null)[] = [];

  for (let s = 0; s < MAX_SAMPLES; s++) {
    const hdr      = sampleHeaders[s];
    const byteLen  = hdr.length * 2;   // length field is in words → bytes

    if (byteLen > 0 && pcmCursor + byteLen <= buffer.byteLength) {
      samplePCM.push(bytes.slice(pcmCursor, pcmCursor + byteLen));
      pcmCursor += byteLen;
    } else {
      samplePCM.push(null);
      pcmCursor += byteLen;
    }
  }

  // ── Build InstrumentConfig list ────────────────────────────────────────────

  const instruments: InstrumentConfig[] = [];

  for (let s = 0; s < MAX_SAMPLES; s++) {
    const hdr  = sampleHeaders[s];
    const id   = s + 1;
    const pcm  = samplePCM[s];

    if (!pcm || pcm.length === 0) {
      // Silent placeholder — no PCM data for this slot
      instruments.push({
        id,
        name: hdr.name,
        type:      'sample'  as const,
        synthType: 'Sampler' as const,
        effects:   [],
        volume:    -60,
        pan:       0,
      } as unknown as InstrumentConfig);
      continue;
    }

    // Loop calculation (all values are in words in the header):
    //   loopLen > 1 → active loop
    //     loopStart (bytes) = loopStart * 2
    //     loopEnd   (bytes) = (loopStart + loopLen) * 2
    //   loopLen <= 1 → no loop (loopStart=0, loopEnd=0)
    let loopStart = 0;
    let loopEnd   = 0;

    if (hdr.loopLen > 1) {
      loopStart = hdr.loopStart * 2;
      loopEnd   = (hdr.loopStart + hdr.loopLen) * 2;
      loopEnd   = Math.min(loopEnd, pcm.length);
    }

    instruments.push(
      createSamplerInstrument(id, hdr.name, pcm, hdr.volume, SAMPLE_RATE, loopStart, loopEnd),
    );
  }

  // ── Assemble TrackerSong ───────────────────────────────────────────────────

  return {
    name:            songName,
    format:          'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions:   orderList,
    songLength:      orderList.length,
    restartPosition: restartPos,
    numChannels:     NUM_CHANNELS,
    initialSpeed:    6,
    initialBPM:      125,
    linearPeriods:   false,
  };
}
