/**
 * UNICParser.ts — UNIC Tracker v1 (.unic) Amiga format parser
 *
 * UNIC Tracker is a module packer (not a stand-alone tracker).
 * It stores 4-channel Amiga pattern data using 3 bytes per cell (vs MOD's 4).
 * Files may carry "M.K.", "UNIC", or "\0\0\0\0" at +1080.
 *
 * Binary layout (total header read: 1084 + 768 bytes):
 *   +0    song title (20 bytes, space-padded ASCII)
 *   +20   31 × standard MOD sample headers (30 bytes each = 930 bytes total)
 *         Each header:
 *           +0   name (22 bytes) — bytes [20..21] hold int16BE finetune
 *           +22  length    (uint16BE, words; < 0x8000)
 *           +24  finetune  (int8, must be 0 for UNIC)
 *           +25  volume    (uint8, 0–64)
 *           +26  loopStart (uint16BE, words; < 0x8000)
 *           +28  loopLen   (uint16BE, words; < 0x8000; >1 means looping)
 *   +950  numOrders  (uint8, 1–127)
 *   +951  restartPos (uint8)
 *   +952  order list (128 bytes)
 *   +1080 magic      (4 bytes): "M.K.", "UNIC", or "\0\0\0\0"
 *   +1084 first pattern data (64 rows × 4 channels × 3 bytes = 768 bytes)
 *         (used for detection validation; all patterns read starting at +1084)
 *
 * Pattern cell (3 bytes):
 *   byte0 bits[7:2]: instrument high bits packed; bit[5:0] = noteIdx (0–36)
 *     noteIdx = data[0] & 0x3F
 *     instrHi = (data[0] >> 2) & 0x30
 *   byte1:
 *     instrLo = (data[1] >> 4) & 0x0F
 *     command = data[1] & 0x0F
 *   byte2: effect parameter
 *   instrument = instrHi | instrLo
 *   XM note: noteIdx > 0 → noteIdx + NOTE_MIDDLEC − 13 = noteIdx + 36
 *
 * Sample data starts immediately after all pattern data (at +1084 + numPatterns×768).
 * PCM is signed int8, little-endian (standard for UNIC).
 *
 * Finetune: int16BE stored at name[20..21], value negated before MOD2XMFineTune().
 *
 * Reference: OpenMPT Load_unic.cpp, ProWizard by Asle
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// ── Binary helpers ────────────────────────────────────────────────────────────

function u8(v: DataView, off: number): number  { return v.getUint8(off); }
function i8(v: DataView, off: number): number  { return v.getInt8(off); }
function u16(v: DataView, off: number): number { return v.getUint16(off, false); } // big-endian
function i16(v: DataView, off: number): number { return v.getInt16(off, false); }  // big-endian

function readString(v: DataView, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const ch = v.getUint8(off + i);
    if (ch === 0) break;
    s += String.fromCharCode(ch);
  }
  return s.trim();
}

/** Return true if all bytes in [off, off+len) are printable ASCII or NUL. */
function hasInvalidChars(v: DataView, off: number, len: number): boolean {
  for (let i = 0; i < len; i++) {
    const ch = v.getUint8(off + i);
    if (ch !== 0 && (ch < 0x20 || ch > 0x7e)) return true;
  }
  return false;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const HEADER_SIZE       = 1084;  // title + 31 sample headers + order block + magic
const BYTES_PER_PATTERN = 768;   // 3 bytes/cell × 64 rows × 4 channels
const NUM_CHANNELS      = 4;
const ROWS_PER_PATTERN  = 64;
const MAX_SAMPLES       = 31;
const SAMPLE_RATE       = 8287;  // standard Amiga PAL rate

// XM note base: noteIdx 1 = C-0 in 1-indexed UNIC table; OpenMPT maps
// noteIdx + NOTE_MIDDLEC − 13 where NOTE_MIDDLEC = 49 → adds 36.
const UNIC_NOTE_OFFSET  = 36;    // noteIdx + 36 = XM note

// LRRL stereo panning (Amiga standard)
const CHANNEL_PAN = [-50, 50, 50, -50] as const;

// ── Finetune conversion ───────────────────────────────────────────────────────

/**
 * Convert a UNIC finetune value (int16BE from name[20..21], already negated
 * before calling here) to an XM finetune value in the range -128..+112
 * (steps of 16).
 *
 * Maps ProTracker MOD finetune nibble (0–15) to XM:
 *   0..7  →  0, 16, 32, 48, 64, 80, 96, 112
 *   8..15 → -128, -112, -96, -80, -64, -48, -32, -16
 *
 * The UNIC finetune stored at name[20] is the negated raw value; the caller
 * passes `negatedFinetune = -rawFinetune` (matching OpenMPT's
 * `MOD2XMFineTune(-finetune)`).
 *
 * The raw finetune field is in the range -42..8 (the negative of that gives
 * 0..42 for the most common case).  We clamp to 0 if still negative after
 * negation, then apply the nibble mapping.
 */
function mod2XMFinetune(negatedRawFinetune: number): number {
  let idx = negatedRawFinetune;
  if (idx < 0) idx = 0;
  idx = idx & 0x0f; // clamp to nibble
  // Standard MOD2XMFineTune table (each step is 16 XM units)
  const table = [0, 16, 32, 48, 64, 80, 96, 112, -128, -112, -96, -80, -64, -48, -32, -16];
  return table[idx];
}

// ── Internal sample header ────────────────────────────────────────────────────

interface UNICSample {
  name:      string;
  length:    number;   // in words
  volume:    number;   // 0–64
  loopStart: number;   // in words
  loopLen:   number;   // in words (>1 = active loop)
  finetune:  number;   // XM finetune (-128..+112)
}

// ── Header validation helpers ─────────────────────────────────────────────────

/**
 * Validate a single 30-byte UNIC sample header (standard MOD layout with
 * UNIC-specific finetune at name[20..21]).
 *
 * Returns false if any field is out of range.
 */
function isValidSampleHeader(v: DataView, base: number): boolean {
  // name[0..19] must contain only printable ASCII or NUL
  if (hasInvalidChars(v, base, 20)) return false;

  // int16BE finetune at name[20..21] must be in -42..8
  const finetune = i16(v, base + 20);
  if (finetune < -42 || finetune > 8) return false;

  // Standard MOD finetune byte (at +24 in the 30-byte header) must be 0
  if (i8(v, base + 24) !== 0) return false;

  // volume must be ≤ 64
  if (u8(v, base + 25) > 64) return false;

  // length, loopStart, loopLen all must be < 0x8000
  const length    = u16(v, base + 22);
  const loopStart = u16(v, base + 26);
  const loopLen   = u16(v, base + 28);

  if (length    >= 0x8000) return false;
  if (loopStart >= 0x8000) return false;
  if (loopLen   >= 0x8000) return false;

  // If length is 0, loopStart/loopLen/finetune must all be zero
  if (!length && (loopStart > 0 || loopLen > 1 || finetune !== 0)) return false;

  // loopStart + loopLen must not exceed length
  if (length && length < loopStart + loopLen) return false;

  return true;
}

/**
 * Validate a single 3-byte UNIC pattern cell.
 * Returns false if any field is out of spec.
 */
function isValidPatternCell(v: DataView, off: number, lastSample: number): boolean {
  const b0 = u8(v, off);
  const b1 = u8(v, off + 1);
  const b2 = u8(v, off + 2);

  if (b0 > 0x74) return false;
  if ((b0 & 0x3f) > 0x24) return false;

  const command = b1 & 0x0f;
  const param   = b2;

  if (command === 0x0c && param > 80)   return false; // volume set
  if (command === 0x0b && param > 0x7f) return false; // position jump
  if (command === 0x0d && param > 0x40) return false; // pattern break

  const instr = ((b0 >> 2) & 0x30) | ((b1 >> 4) & 0x0f);
  if (instr > lastSample) return false;

  return true;
}

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Returns true if the buffer passes all UNIC Tracker v1 structural checks.
 *
 * Detection mirrors OpenMPT's UNICFileHeader::IsValid() exactly:
 *  1. Magic at +1080 must be "M.K.", "UNIC", or "\0\0\0\0"
 *  2. Song title must be clean ASCII
 *  3. All 31 sample headers must pass validation
 *  4. Total sample size (byte sum) must be ≥ 256
 *  5. numOrders must be 1–127
 *  6. All 256 cells of the first pattern (at +1084) must pass cell validation
 *
 * Additionally (matching OpenMPT's ReadUNIC post-parse check):
 *  7. numNotes ≥ 16 and at least one instrument used across the first pattern
 */
export function isUNICFormat(buffer: ArrayBuffer): boolean {
  // Minimum: full header + first pattern
  if (buffer.byteLength < HEADER_SIZE + BYTES_PER_PATTERN) return false;

  const v = new DataView(buffer);

  // ── 1. Magic check ─────────────────────────────────────────────────────────
  const magic = readString(v, 1080, 4);
  const b1080 = u8(v, 1080);
  const b1081 = u8(v, 1081);
  const b1082 = u8(v, 1082);
  const b1083 = u8(v, 1083);
  const isNullMagic  = (b1080 === 0 && b1081 === 0 && b1082 === 0 && b1083 === 0);
  const isMKMagic    = (magic === 'M.K.');
  const isUNICMagic  = (magic === 'UNIC');
  if (!isMKMagic && !isUNICMagic && !isNullMagic) return false;

  // ── 2. Title ───────────────────────────────────────────────────────────────
  if (hasInvalidChars(v, 0, 20)) return false;

  // ── 3. Sample headers + totalSampleSize + lastSample ──────────────────────
  let totalSampleBytes = 0;
  let lastSample = 0;

  for (let s = 0; s < MAX_SAMPLES; s++) {
    const base = 20 + s * 30;
    if (!isValidSampleHeader(v, base)) return false;
    const len = u16(v, base + 22);
    totalSampleBytes += len * 2;
    if (len > 0) lastSample = s + 1; // 1-based
  }

  // ── 4. Total sample size ───────────────────────────────────────────────────
  if (totalSampleBytes < 256) return false;

  // ── 5. numOrders ──────────────────────────────────────────────────────────
  const numOrders = u8(v, 950);
  if (numOrders === 0 || numOrders >= 128) return false;

  // Scan order list for max pattern index (all 128 entries per OpenMPT)
  let maxPattern = 0;
  for (let i = 0; i < 128; i++) {
    const pat = u8(v, 952 + i);
    if (pat >= 128) return false;
    // Entries past numOrders+1 must be 0 (OpenMPT check)
    if (i > numOrders + 1 && pat !== 0) return false;
    if (pat > maxPattern) maxPattern = pat;
  }
  const numPatterns = maxPattern + 1;

  // ── 6. First pattern cell validation ──────────────────────────────────────
  let numNotes   = 0;
  let allInstrs  = 0;

  const firstPatBase = HEADER_SIZE;
  for (let cell = 0; cell < ROWS_PER_PATTERN * NUM_CHANNELS; cell++) {
    const off = firstPatBase + cell * 3;
    if (!isValidPatternCell(v, off, lastSample)) return false;

    const b0    = u8(v, off);
    const b1    = u8(v, off + 1);
    const noteIdx = b0 & 0x3f;
    const instr   = ((b0 >> 2) & 0x30) | ((b1 >> 4) & 0x0f);

    if (noteIdx > 0) numNotes++;
    allInstrs |= instr;
  }

  // ── 7. Note / instrument sanity ────────────────────────────────────────────
  if (numNotes < 16 || allInstrs === 0) return false;

  // ── 8. Buffer large enough for all patterns + sample data ─────────────────
  const patternDataSize = numPatterns * BYTES_PER_PATTERN;
  if (buffer.byteLength < HEADER_SIZE + patternDataSize + totalSampleBytes) return false;

  return true;
}

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Parse a UNIC Tracker v1 (.unic) file into a TrackerSong.
 *
 * @throws If the file fails validation or contains an invalid note/cell.
 */
export async function parseUNICFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  if (!isUNICFormat(buffer)) {
    throw new Error('UNICParser: file does not pass UNIC format validation');
  }

  const v     = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // ── Song metadata ──────────────────────────────────────────────────────────

  const songName  = readString(v, 0, 20) || filename.replace(/\.[^/.]+$/, '');
  const numOrders = u8(v, 950);
  const restartPos = u8(v, 951);

  // ── Order list ─────────────────────────────────────────────────────────────

  let numPatterns = 0;
  for (let i = 0; i < 128; i++) {
    const pat = u8(v, 952 + i);
    if (pat + 1 > numPatterns) numPatterns = pat + 1;
  }

  const orderList: number[] = [];
  for (let i = 0; i < numOrders; i++) {
    orderList.push(u8(v, 952 + i));
  }

  // ── Sample headers ─────────────────────────────────────────────────────────
  // Offset +20, 31 samples × 30 bytes each (standard MOD layout):
  //   +0   name      (22 bytes) — name[20..21] = int16BE UNIC finetune
  //   +22  length    (uint16BE, words)
  //   +24  finetune  (int8, must be 0)
  //   +25  volume    (uint8)
  //   +26  loopStart (uint16BE, words)
  //   +28  loopLen   (uint16BE, words)

  const sampleHeaders: UNICSample[] = [];
  for (let s = 0; s < MAX_SAMPLES; s++) {
    const base       = 20 + s * 30;
    const rawFT      = i16(v, base + 20);  // int16BE at name[20..21]
    const xmFinetune = mod2XMFinetune(-rawFT); // OpenMPT: MOD2XMFineTune(-finetune)

    sampleHeaders.push({
      name:      readString(v, base, 20) || `Sample ${s + 1}`,
      length:    u16(v, base + 22),
      volume:    u8(v, base + 25),
      loopStart: u16(v, base + 26),
      loopLen:   u16(v, base + 28),
      finetune:  xmFinetune,
    });
  }

  // ── Pattern data ───────────────────────────────────────────────────────────
  // Patterns are stored sequentially starting at HEADER_SIZE (+1084).
  // Each pattern: 64 rows × 4 channels × 3 bytes = 768 bytes.
  // Cells are stored row-major: row0ch0, row0ch1, row0ch2, row0ch3, row1ch0, …
  //
  // Cell encoding (3 bytes):
  //   b0 = [instrHi(2)|noteIdx(6)]   where instrHi are bits [5:4] of instrument
  //   b1 = [instrLo(4)|command(4)]   where instrLo are bits [3:0] of instrument
  //   b2 = effect parameter
  //   noteIdx = b0 & 0x3F (0=empty, 1–36=note)
  //   instrument = ((b0 >> 2) & 0x30) | ((b1 >> 4) & 0x0F)
  //   XM note = noteIdx + UNIC_NOTE_OFFSET  (if noteIdx > 0)

  const patterns: Pattern[] = [];

  // We re-validate all patterns during parse (not just the first) to match
  // OpenMPT's ReadUNIC() which validates every cell via ValidateUNICPatternEntry.
  let numNotes   = 0;
  let allInstrs  = 0;
  // lastSample for per-pattern validation
  let lastSample = 0;
  for (let s = 0; s < MAX_SAMPLES; s++) {
    if (sampleHeaders[s].length > 0) lastSample = s + 1;
  }

  for (let pIdx = 0; pIdx < numPatterns; pIdx++) {
    const patternBase = HEADER_SIZE + pIdx * BYTES_PER_PATTERN;

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

    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const cellOff = patternBase + (row * NUM_CHANNELS + ch) * 3;

        const b0 = u8(v, cellOff);
        const b1 = u8(v, cellOff + 1);
        const b2 = u8(v, cellOff + 2);

        // Validate (mirrors OpenMPT's ValidateUNICPatternEntry)
        if (!isValidPatternCell(v, cellOff, lastSample)) {
          throw new Error(
            `UNICParser: invalid cell at pattern ${pIdx} row ${row} ch ${ch}`,
          );
        }

        const noteIdx  = b0 & 0x3f;
        const instrHi  = (b0 >> 2) & 0x30;  // bits [5:4]
        const instrLo  = (b1 >> 4) & 0x0f;  // bits [3:0]
        const instr    = instrHi | instrLo;
        const command  = b1 & 0x0f;
        const param    = b2;

        const xmNote   = noteIdx > 0 ? noteIdx + UNIC_NOTE_OFFSET : 0;

        if (noteIdx > 0) numNotes++;
        allInstrs |= instr;

        const cell: TrackerCell = {
          note:       xmNote,
          instrument: instr,
          volume:     0,      // UNIC has no volume column
          effTyp:     command,
          eff:        param,
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
        sourceFormat:            'UNIC',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    NUM_CHANNELS,
        originalPatternCount:    numPatterns,
        originalInstrumentCount: MAX_SAMPLES,
      },
    });
  }

  // Post-parse sanity check (matches OpenMPT's numNotes/allInstrs check)
  if (numNotes < 16 || allInstrs === 0) {
    throw new Error('UNICParser: insufficient note/instrument data across all patterns');
  }

  // ── Sample PCM data ────────────────────────────────────────────────────────
  // Samples follow immediately after all pattern data.
  // Each sample is (header.length * 2) bytes of signed int8 PCM (little-endian).
  //
  // Loop fixup (OpenMPT Metal Jumpover.unic fix):
  //   If loopStart > 0 and (loopStart_bytes + loopEnd_bytes) in [length-2, length]:
  //     loopEnd   += loopStart
  //     loopStart += loopStart   (i.e. both are doubled)
  //   This corrects files where loopStart is stored as a DWORD index rather than words.

  let pcmCursor = HEADER_SIZE + numPatterns * BYTES_PER_PATTERN;
  const instruments: InstrumentConfig[] = [];

  for (let s = 0; s < MAX_SAMPLES; s++) {
    const hdr     = sampleHeaders[s];
    const byteLen = hdr.length * 2; // length field is words → bytes

    if (byteLen === 0 || pcmCursor + byteLen > buffer.byteLength) {
      // Silent placeholder
      pcmCursor += byteLen;
      instruments.push({
        id:        s + 1,
        name:      hdr.name,
        type:      'sample'  as const,
        synthType: 'Sampler' as const,
        effects:   [],
        volume:    -60,
        pan:       0,
      } as unknown as InstrumentConfig);
      continue;
    }

    const pcm = bytes.slice(pcmCursor, pcmCursor + byteLen);
    pcmCursor += byteLen;

    // Loop calculation (all header values are in words):
    //   loopLen > 1 → active loop
    //   Initial byte positions:
    let loopStart = hdr.loopStart * 2;
    let loopEnd   = (hdr.loopStart + hdr.loopLen) * 2;

    if (hdr.loopLen > 1) {
      // OpenMPT loop fixup for incorrect DWORD loop starts
      if (
        hdr.loopStart > 0 &&
        loopStart + loopEnd >= byteLen - 2 &&
        loopStart + loopEnd <= byteLen
      ) {
        loopEnd   += loopStart;
        loopStart += loopStart;
      }
      loopEnd = Math.min(loopEnd, pcm.length);
    } else {
      loopStart = 0;
      loopEnd   = 0;
    }

    const inst = createSamplerInstrument(
      s + 1,
      hdr.name,
      pcm,
      hdr.volume,
      SAMPLE_RATE,
      loopStart,
      loopEnd,
    );

    // Apply UNIC finetune (stored as XM finetune units in sampleHeaders)
    if (inst.metadata?.modPlayback) {
      inst.metadata.modPlayback.finetune = hdr.finetune;
    }

    instruments.push(inst);
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
