/**
 * STXParser.ts — ScreamTracker Music Interface Kit (.stx) format parser
 *
 * STX (STMIK 0.2) is a hybrid of STM and S3M: it uses a flat 64-byte header
 * reminiscent of STM, but stores patterns and samples via paragraph-offset
 * pointer tables in S3M style, and decodes patterns using the S3M packed-row
 * format.
 *
 * Binary layout — STXFileHeader (64 bytes):
 *   +0   songName[20]        — song title, null-padded
 *   +20  trackerName[8]      — usually "!Scream!" but any printable ASCII
 *   +28  patternSize u16LE   — declared pattern size; 0x1A = newer file version
 *   +30  unknown1 u16LE      — must be 0
 *   +32  patTableOffset u16LE — pattern parapointer table at this_value << 4
 *   +34  smpTableOffset u16LE — sample parapointer table at this_value << 4
 *   +36  chnTableOffset u16LE — channel/order table at this_value << 4
 *   +38  unknown2 u32LE      — must be 0
 *   +42  globalVolume u8
 *   +43  initTempo u8        — packed: high nibble = ticks/row, low nibble = tempo
 *   +44  unknown3 u32LE      — must be 1
 *   +48  numPatterns u16LE
 *   +50  numSamples u16LE
 *   +52  numOrders u16LE
 *   +54  unknown4[6]
 *   +60  magic[4]            — "SCRM"
 *
 * Pattern table:  numPatterns × u16LE parapointers at patTableOffset << 4
 * Sample table:   numSamples  × u16LE parapointers at smpTableOffset << 4
 * Channel/order:  at chnTableOffset << 4: skip 32 bytes, then numOrders × 5-byte
 *                 records where the first byte is the pattern index.
 *
 * Sample headers: S3M-style S3MSampleHeader (80 bytes) at samplePointer << 4.
 *   The three-byte data pointer inside each S3MSampleHeader resolves the PCM data.
 *
 * Pattern format (S3M packed rows):
 *   Each row is a sequence of "flag bytes" terminated by 0x00.
 *     flagByte & 0x1F = channel (0-based, 0-3 active in STMIK)
 *     flagByte & 0x20 → read note u8, instrument u8
 *     flagByte & 0x40 → read volume u8 (0-64)
 *     flagByte & 0x80 → read STM command u8, param u8
 *
 * Format version detection:
 *   If patternSize != 0x1A and first two bytes at the first pattern offset match
 *   patternSize, patterns are "format version 0" (first 2 bytes are the packed
 *   size, like normal S3M). Otherwise "format version 1" (no size prefix; the
 *   packed data starts immediately).
 *
 * Note encoding (S3M):
 *   noteByte high nibble = octave (0-based), low nibble = semitone (0=C)
 *   XM note = octave * 12 + semitone + 1  (1-based; C-0 = 1)
 *   0xFE = note off; 0xFF = no note
 *
 * Effect encoding:
 *   STX uses STM effects (same as the STM format) via ConvertSTMCommand.
 *   Command indices 1-10 map to tracker effects; 0 and 11-15 are no-ops.
 *
 * Reference: OpenMPT Load_stm.cpp (ReadSTX, STXFileHeader, S3MTools.h)
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell } from '@/types';
import type { ParsedSample, ParsedInstrument } from '@/types/tracker';
import type { InstrumentConfig } from '@/types/instrument';
import { convertToInstrument } from '../InstrumentConverter';

// ── Binary helpers ────────────────────────────────────────────────────────────

function u8(v: DataView, off: number): number    { return v.getUint8(off); }
function u16le(v: DataView, off: number): number { return v.getUint16(off, true); }
function u32le(v: DataView, off: number): number { return v.getUint32(off, true); }

function readString(v: DataView, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = v.getUint8(off + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FILE_HDR_SIZE    = 64;
const ROWS_PER_PATTERN = 64;
const NUM_CHANNELS     = 4; // STMIK always uses 4 channels

// S3M note encoding constants
const S3M_NOTE_OFF  = 0xFE;
const S3M_NOTE_NONE = 0xFF;
const XM_NOTE_OFF   = 97;  // Standard note-cut value in XM/DEViLBOX convention

// S3M pattern flag bits
const S3M_END_OF_ROW      = 0x00;
const S3M_CHANNEL_MASK    = 0x1F;
const S3M_NOTE_PRESENT    = 0x20;
const S3M_VOLUME_PRESENT  = 0x40;
const S3M_EFFECT_PRESENT  = 0x80;

// STM effect index → XM effect type
// Based on OpenMPT's stmEffects[] (ConvertSTMCommand).
// Indices 0 and 0xA-0xF are no-ops in all cases.
const STM_EFFECTS: number[] = [
  0x00, // 0x0 → none
  0x0F, // 0x1 → Axx set speed    (CMD_SPEED)
  0x0B, // 0x2 → Bxx pos jump     (CMD_POSITIONJUMP)
  0x0D, // 0x3 → Cxx pat break    (CMD_PATTERNBREAK)
  0x0A, // 0x4 → Dxx vol slide    (CMD_VOLUMESLIDE)
  0x02, // 0x5 → Exx porta down   (CMD_PORTAMENTODOWN)
  0x01, // 0x6 → Fxx porta up     (CMD_PORTAMENTOUP)
  0x03, // 0x7 → Gxx tone porta   (CMD_TONEPORTAMENTO)
  0x04, // 0x8 → Hxx vibrato      (CMD_VIBRATO)
  0x1D, // 0x9 → Ixx tremor       (CMD_TREMOR)
  0x00, // 0xA → Jxx arpeggio (no-op in ST2)
  0x00, // 0xB → K (no-op)
  0x00, // 0xC → L (no-op)
  0x00, // 0xD → M (no-op)
  0x00, // 0xE → N (no-op)
  0x00, // 0xF → O (no-op)
];

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Returns true if the buffer is a valid STX (STMIK) module.
 *
 * Mirrors OpenMPT STXFileHeader::Validate():
 *   - "SCRM" at offset 60 (magic[4])
 *   - 64 <= patternSize <= 0x840, OR patternSize == 0x1A (newer format)
 *   - globalVolume <= 64, OR == 0x58 (placeholder)
 *   - numPatterns <= 64
 *   - numSamples <= 96
 *   - (numOrders <= 0x81) OR numOrders == 0x101
 *   - unknown1 == 0, unknown2 == 0, unknown3 == 1
 *   - trackerName bytes (offsets 20-27) all printable ASCII (0x20-0x7E)
 */
export function isSTXFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < FILE_HDR_SIZE) return false;
  const v = new DataView(buffer);

  // magic[4] at offset 60 must be "SCRM"
  if (u8(v, 60) !== 0x53 || u8(v, 61) !== 0x43 ||
      u8(v, 62) !== 0x52 || u8(v, 63) !== 0x4D) return false;

  const patternSize  = u16le(v, 28);
  const unknown1     = u16le(v, 30);
  const unknown2     = u32le(v, 38);
  const globalVolume = u8(v, 42);
  const unknown3     = u32le(v, 44);
  const numPatterns  = u16le(v, 48);
  const numSamples   = u16le(v, 50);
  const numOrders    = u16le(v, 52);

  if (unknown1 !== 0)                                              return false;
  if (unknown2 !== 0)                                              return false;
  if (unknown3 !== 1)                                              return false;
  if (patternSize < 64 && patternSize !== 0x1A)                   return false;
  if (patternSize > 0x840)                                         return false;
  if (globalVolume > 64 && globalVolume !== 0x58)                 return false;
  if (numPatterns > 64)                                            return false;
  if (numSamples > 96)                                             return false;
  if (numOrders > 0x81 && numOrders !== 0x101)                    return false;

  // trackerName at bytes 20-27 must all be printable ASCII
  for (let i = 20; i < 28; i++) {
    const c = u8(v, i);
    if (c < 0x20 || c >= 0x7F) return false;
  }

  return true;
}

// ── Effect conversion ─────────────────────────────────────────────────────────

/**
 * Convert a raw STM effect index + param byte to XM effTyp + eff.
 * Based on OpenMPT ConvertSTMCommand() called from ReadSTX with fileVerMinor=0xFF.
 *
 * In STX patterns, the fileVerMinor is 0xFF (per OpenMPT source), meaning the
 * tempo conversion branch (verMinor < 21) does NOT fire; STX patterns already
 * store the nibble-packed speed value directly.
 */
function convertSTMEffect(
  effIdx: number,
  param: number,
): { effTyp: number; eff: number } {
  const idx   = effIdx & 0x0F;
  const xmEff = STM_EFFECTS[idx];

  if (idx === 0x00 || idx >= 0x0A) return { effTyp: 0, eff: 0 };

  switch (idx) {
    case 0x01: { // Axx set speed
      // STX passes verMinor=0xFF to ConvertSTMCommand, so no decimal conversion.
      if (param === 0) return { effTyp: 0, eff: 0 };
      // Speed = high nibble only
      return { effTyp: xmEff, eff: param >> 4 };
    }

    case 0x02: // Bxx position jump
      return { effTyp: xmEff, eff: param };

    case 0x03: { // Cxx pattern break (BCD param)
      const bcdParam = ((param >> 4) * 10) + (param & 0x0F);
      return { effTyp: xmEff, eff: bcdParam };
    }

    case 0x04: { // Dxx volume slide; lower nibble takes precedence
      let p = param;
      if (p & 0x0F) {
        p &= 0x0F;
      } else {
        p &= 0xF0;
      }
      return { effTyp: xmEff, eff: p };
    }

    default:
      // Exx, Fxx, Gxx, Hxx, Ixx: no-op if param is zero (ST2 has no effect memory)
      if (param === 0) return { effTyp: 0, eff: 0 };
      return { effTyp: xmEff, eff: param };
  }
}

// ── S3M sample header reader ──────────────────────────────────────────────────

/**
 * S3MSampleHeader layout (80 bytes) — field offsets from header base:
 *   +0   sampleType u8      (1=PCM; 0=empty/AdLib)
 *   +1   filename[12]
 *   +13  dataPointer[3]     → (dp[0] | dp[1]<<8 | dp[2]<<16) << 4
 *   +16  length u32LE       (sample length in samples)
 *   +20  loopStart u32LE
 *   +24  loopEnd u32LE
 *   +28  defaultVolume u8   (0-64)
 *   +29  reserved
 *   +30  pack u8            (0=raw PCM; 1=DP30ADPCM → skip)
 *   +31  flags u8           (0x01=loop, 0x02=stereo, 0x04=16-bit)
 *   +32  c5speed u32LE      (middle-C frequency)
 *   +36  reserved2[4]
 *   +40  gusAddress u16LE
 *   +42  sb512 u16LE
 *   +44  lastUsedPos u32LE
 *   +48  name[28]
 *   +76  magic[4] "SCRS"
 */
interface S3MSampleParsed {
  sampleType:    number;
  filename:      string;
  dataOffset:    number; // absolute byte offset into file
  length:        number;
  loopStart:     number;
  loopEnd:       number;
  defaultVolume: number;
  pack:          number;
  flags:         number;
  c5speed:       number;
  name:          string;
}

function readS3MSampleHeader(v: DataView, base: number): S3MSampleParsed {
  const sampleType = u8(v, base);

  // Three-byte paragraph pointer: low word LE first, then high byte
  const dpLo   = u8(v, base + 14);
  const dpHi   = u8(v, base + 15);
  const dpHigh = u8(v, base + 13);
  const dataOffset = (dpLo | (dpHi << 8) | (dpHigh << 16)) * 16;

  return {
    sampleType,
    filename:      readString(v, base + 1, 12),
    dataOffset,
    length:        u32le(v, base + 16),
    loopStart:     u32le(v, base + 20),
    loopEnd:       u32le(v, base + 24),
    defaultVolume: Math.min(u8(v, base + 28), 64),
    pack:          u8(v, base + 30),
    flags:         u8(v, base + 31),
    c5speed:       u32le(v, base + 32),
    name:          readString(v, base + 48, 28),
  };
}

// ── Pattern decoder ───────────────────────────────────────────────────────────

/**
 * Decode a packed S3M/STX pattern into a 2D grid of TrackerCell [row][channel].
 *
 * Row format: read bytes until 0x00 (end of row).
 *   flagByte & 0x1F = channel
 *   flagByte & 0x20 → note u8, instrument u8
 *   flagByte & 0x40 → volume u8 (0-64)
 *   flagByte & 0x80 → STM command u8, param u8
 */
function decodeSTXPattern(
  rowData: Uint8Array,
  numChannels: number,
): TrackerCell[][] {
  const emptyCell = (): TrackerCell => ({
    note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  });

  const cells: TrackerCell[][] = Array.from(
    { length: ROWS_PER_PATTERN },
    () => Array.from({ length: numChannels }, emptyCell),
  );

  let pos = 0;
  let row = 0;

  while (row < ROWS_PER_PATTERN && pos < rowData.length) {
    const flagByte = rowData[pos++];

    if (flagByte === S3M_END_OF_ROW) {
      row++;
      continue;
    }

    const ch = flagByte & S3M_CHANNEL_MASK;

    let note       = 0;
    let instrument = 0;
    let volume     = 0;
    let effTyp     = 0;
    let eff        = 0;

    if (flagByte & S3M_NOTE_PRESENT) {
      const noteByte = rowData[pos++];
      instrument     = rowData[pos++];

      if (noteByte === S3M_NOTE_OFF) {
        note = XM_NOTE_OFF;
      } else if (noteByte !== S3M_NOTE_NONE) {
        // High nibble = octave, low nibble = semitone (0=C)
        const octave   = (noteByte >> 4) & 0x0F;
        const semitone = noteByte & 0x0F;
        note = octave * 12 + semitone + 1; // 1-based, C-0 = 1
      }
    }

    if (flagByte & S3M_VOLUME_PRESENT) {
      const rawVol = rowData[pos++];
      volume = rawVol <= 64 ? rawVol : 0;
    }

    if (flagByte & S3M_EFFECT_PRESENT) {
      const command = rowData[pos++];
      const param   = rowData[pos++];
      const { effTyp: et, eff: ep } = convertSTMEffect(command, param);
      effTyp = et;
      eff    = ep;
    }

    if (ch < numChannels) {
      cells[row][ch] = { note, instrument, volume, effTyp, eff, effTyp2: 0, eff2: 0 };
    }
  }

  return cells;
}

// ── Helper: build empty pattern ───────────────────────────────────────────────

function makeEmptyPattern(
  patIdx: number,
  numChannels: number,
  filename: string,
  maxPatIdx: number,
  numSamples: number,
): Pattern {
  const emptyCell: TrackerCell = {
    note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  };
  const channels: ChannelData[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push({
      id:           `channel-${ch}`,
      name:         `Channel ${ch + 1}`,
      muted:        false,
      solo:         false,
      collapsed:    false,
      volume:       100,
      pan:          0,
      instrumentId: null,
      color:        null,
      rows:         Array.from({ length: ROWS_PER_PATTERN }, () => ({ ...emptyCell })),
    });
  }
  return {
    id:     `pattern-${patIdx}`,
    name:   `Pattern ${patIdx}`,
    length: ROWS_PER_PATTERN,
    channels,
    importMetadata: {
      sourceFormat:            'STX',
      sourceFile:              filename,
      importedAt:              new Date().toISOString(),
      originalChannelCount:    numChannels,
      originalPatternCount:    maxPatIdx + 1,
      originalInstrumentCount: numSamples,
    },
  };
}

/** Build a silent placeholder InstrumentConfig. */
function makeEmptyInstrumentConfig(id: number, name: string): InstrumentConfig {
  return {
    id,
    name: name || `Sample ${id}`,
    type:      'sample' as const,
    synthType: 'Sampler' as const,
    effects:   [],
    volume:    -60,
    pan:       0,
  } as InstrumentConfig;
}

// ── PCM extraction ────────────────────────────────────────────────────────────

/**
 * Extract 8-bit signed PCM from the raw file buffer.
 * S3M/STX 8-bit samples are unsigned by convention in older STX files
 * (they predate the ST3 formatVersion=2 unsigned flag). OpenMPT calls
 * sampleHeader.GetSampleFormat(true) with isST3=true, which uses the
 * formatVersion field from the S3M header. For STX there is no such field, so
 * OpenMPT passes `true` (signedSamples), meaning PCM data is treated as signed.
 * We leave 8-bit data as-is (signed Int8).
 */
function extractPCM(
  raw: Uint8Array,
  offset: number,
  byteLength: number,
): ArrayBuffer {
  const end       = Math.min(offset + byteLength, raw.length);
  const actualLen = end - offset;
  const buf = new ArrayBuffer(actualLen);
  const out = new Uint8Array(buf);
  for (let i = 0; i < actualLen; i++) {
    out[i] = raw[offset + i];
  }
  return buf;
}

// ── Main parser ───────────────────────────────────────────────────────────────

export function parseSTXFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  if (!isSTXFormat(buffer)) throw new Error('Not a valid STX file');

  const v   = new DataView(buffer);
  const raw = new Uint8Array(buffer);

  // ── Header fields ──
  const songName       = readString(v, 0, 20);
  const patternSize    = u16le(v, 28);
  const patTableOffset = u16le(v, 32); // paragraph pointer → << 4
  const smpTableOffset = u16le(v, 34); // paragraph pointer → << 4
  const chnTableOffset = u16le(v, 36); // paragraph pointer → << 4
  const globalVolume   = Math.min(u8(v, 42), 64);
  const initTempo      = u8(v, 43) || 0x60;
  const numPatterns    = u16le(v, 48);
  const numSamples     = u16le(v, 50);
  const numOrders      = u16le(v, 52);

  // Tempo: same as STM — high nibble = ticks/row, low nibble = factor
  const initialSpeed = Math.max(1, initTempo >> 4);
  const initialBPM   = 125; // ST2 tempo mode; 125 is a safe playback default

  void globalVolume; // Stored but not directly used in TrackerSong shape

  // ── Pattern parapointer table ──
  const patTableBase = patTableOffset << 4;
  const patternParapointers: number[] = [];
  for (let i = 0; i < numPatterns; i++) {
    patternParapointers.push(u16le(v, patTableBase + i * 2));
  }

  // ── Sample parapointer table ──
  const smpTableBase = smpTableOffset << 4;
  const sampleParapointers: number[] = [];
  for (let i = 0; i < numSamples; i++) {
    sampleParapointers.push(u16le(v, smpTableBase + i * 2));
  }

  // ── Order list ──
  // Channel/order table: skip 32 bytes of channel flags, then numOrders × 5-byte records.
  // Each record: byte[0] = pattern index, bytes[1-4] = padding.
  const chnTableBase = (chnTableOffset << 4) + 32;
  const rawOrders: number[] = [];
  for (let i = 0; i < numOrders; i++) {
    const patIdx = u8(v, chnTableBase + i * 5);
    // 99 and 255 are end-of-song markers (same as STM)
    if (patIdx === 99 || patIdx === 255) break;
    if (patIdx <= 63) rawOrders.push(patIdx);
  }
  if (rawOrders.length === 0) rawOrders.push(0);

  // ── Determine format version ──
  // If patternSize != 0x1A and the first pattern's first two bytes match patternSize,
  // then patterns are "version 0" (S3M-style: first u16LE = packed size, then data).
  // Otherwise "version 1" (packed data starts at offset 0 directly).
  let formatVersion = 1;
  if (numPatterns > 0 && patternSize !== 0x1A) {
    const firstPatOff = patternParapointers[0] << 4;
    if (firstPatOff + 2 <= buffer.byteLength) {
      if (u16le(v, firstPatOff) === patternSize) {
        formatVersion = 0;
      }
    }
  }

  // ── Samples → InstrumentConfig ──
  const instruments: InstrumentConfig[] = [];

  for (let si = 0; si < numSamples; si++) {
    const id     = si + 1;
    const smpOff = sampleParapointers[si] << 4;

    if (smpOff === 0 || smpOff + 80 > buffer.byteLength) {
      instruments.push(makeEmptyInstrumentConfig(id, `Sample ${id}`));
      continue;
    }

    const hdr = readS3MSampleHeader(v, smpOff);

    // Only PCM samples (type 1) are playable
    if (hdr.sampleType !== 1) {
      const name = hdr.name.replace(/\0/g, '').trim() || `Sample ${id}`;
      instruments.push(makeEmptyInstrumentConfig(id, name));
      continue;
    }

    const name = hdr.name.replace(/\0/g, '').trim() ||
                 hdr.filename.replace(/\0/g, '').trim() ||
                 `Sample ${id}`;

    // Skip compressed (DP30ADPCM) and empty samples
    if (hdr.pack === 1 || hdr.length === 0 ||
        hdr.dataOffset === 0 || hdr.dataOffset >= buffer.byteLength) {
      instruments.push(makeEmptyInstrumentConfig(id, name));
      continue;
    }

    const is16bit        = !!(hdr.flags & 0x04);
    const bytesPerSample = is16bit ? 2 : 1;
    const byteLength     = hdr.length * bytesPerSample;

    const pcmData = extractPCM(raw, hdr.dataOffset, byteLength);

    const hasLoop    = !!(hdr.flags & 0x01) && hdr.loopEnd > hdr.loopStart && hdr.loopEnd <= hdr.length;
    const loopLength = hasLoop ? hdr.loopEnd - hdr.loopStart : 0;

    const sample: ParsedSample = {
      id,
      name,
      pcmData,
      bitDepth:     is16bit ? 16 : 8,
      sampleRate:   hdr.c5speed || 8363,
      length:       hdr.length,
      loopStart:    hasLoop ? hdr.loopStart : 0,
      loopLength,
      loopType:     hasLoop ? 'forward' : 'none',
      volume:       hdr.defaultVolume,
      finetune:     0,
      relativeNote: 0,
      panning:      128, // center
    };

    const parsedInst: ParsedInstrument = {
      id,
      name,
      samples:     [sample],
      fadeout:     0,
      volumeType:  'none',
      panningType: 'none',
    };

    const converted = convertToInstrument(parsedInst, id, 'S3M');
    if (converted.length > 0) {
      instruments.push(converted[0]);
    } else {
      instruments.push(makeEmptyInstrumentConfig(id, name));
    }
  }

  // ── Patterns ──
  const referencedPats = new Set<number>(rawOrders);
  for (let i = 0; i < numPatterns; i++) referencedPats.add(i);
  const allPatIdxs = Array.from(referencedPats).sort((a, b) => a - b);
  const maxPatIdx  = allPatIdxs.length > 0 ? allPatIdxs[allPatIdxs.length - 1] : 0;

  const patterns: Pattern[] = [];
  const patIndexToArrayIdx = new Map<number, number>();

  for (const patIdx of allPatIdxs) {
    if (patIdx >= patternParapointers.length || patternParapointers[patIdx] === 0) {
      patIndexToArrayIdx.set(patIdx, patterns.length);
      patterns.push(makeEmptyPattern(patIdx, NUM_CHANNELS, filename, maxPatIdx, numSamples));
      continue;
    }

    const patOff = patternParapointers[patIdx] << 4;
    if (patOff + 2 > buffer.byteLength) {
      patIndexToArrayIdx.set(patIdx, patterns.length);
      patterns.push(makeEmptyPattern(patIdx, NUM_CHANNELS, filename, maxPatIdx, numSamples));
      continue;
    }

    // In version 0, the first u16LE is the declared packed size; skip it.
    // In version 1, packed data starts at offset 0 of the pattern block.
    let dataStart = patOff;
    if (formatVersion === 0) {
      // Validate: if size > 0x840 it's suspicious (same check as OpenMPT)
      const declaredSize = u16le(v, patOff);
      if (declaredSize > 0x840) {
        patIndexToArrayIdx.set(patIdx, patterns.length);
        patterns.push(makeEmptyPattern(patIdx, NUM_CHANNELS, filename, maxPatIdx, numSamples));
        continue;
      }
      dataStart = patOff + 2;
    }

    // Determine row data length: either declared (v0) or read until end of available data
    let rowDataLen: number;
    if (formatVersion === 0) {
      rowDataLen = u16le(v, patOff); // already validated <= 0x840
    } else {
      // Version 1: no explicit size — read up to the next parapointer or EOF
      // Use a conservative maximum: 64 rows × 4 channels × max cell size (5 bytes) + terminator
      // In practice STX patterns are small; 2048 bytes is well within reason.
      rowDataLen = Math.min(2048, buffer.byteLength - dataStart);
    }

    const rowData = raw.subarray(dataStart, dataStart + rowDataLen);
    const cells   = decodeSTXPattern(rowData, NUM_CHANNELS);

    const channels: ChannelData[] = [];
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const rows: TrackerCell[] = [];
      for (let row = 0; row < ROWS_PER_PATTERN; row++) {
        rows.push(cells[row]?.[ch] ?? {
          note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        });
      }
      channels.push({
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

    patIndexToArrayIdx.set(patIdx, patterns.length);
    patterns.push({
      id:     `pattern-${patIdx}`,
      name:   `Pattern ${patIdx}`,
      length: ROWS_PER_PATTERN,
      channels,
      importMetadata: {
        sourceFormat:            'STX',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    NUM_CHANNELS,
        originalPatternCount:    maxPatIdx + 1,
        originalInstrumentCount: numSamples,
      },
    });
  }

  // ── Song positions ──
  const songPositions: number[] = [];
  for (const patIdx of rawOrders) {
    const arrIdx = patIndexToArrayIdx.get(patIdx);
    if (arrIdx !== undefined) songPositions.push(arrIdx);
  }
  if (songPositions.length === 0) songPositions.push(0);

  return {
    name:            songName.replace(/\0/g, '').trim() || filename.replace(/\.[^/.]+$/, ''),
    format:          'S3M',
    patterns,
    instruments,
    songPositions,
    songLength:      songPositions.length,
    restartPosition: 0,
    numChannels:     NUM_CHANNELS,
    initialSpeed,
    initialBPM,
    linearPeriods:   false,
  };
}
