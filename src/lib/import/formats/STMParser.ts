/**
 * STMParser.ts — ScreamTracker 2 (.stm) format parser
 *
 * ScreamTracker 2 is an early PC DOS tracker format by Future Crew.
 *
 * Binary layout:
 *   +0    songname[20]        — song title, null-padded
 *   +20   trackerName[8]      — "!Scream!", "BMOD2STM", "WUZAMOD!", "SWavePro"
 *   +28   dosEof (0x1A)       — magic byte
 *   +29   filetype (0x02)     — module type (2 = module)
 *   +30   verMajor            — version major (must be 2)
 *   +31   verMinor            — version minor (0, 10, 20, 21)
 *   +32   initTempo           — packed: high nibble = ticks/row, low nibble = tempo factor
 *   +33   numPatterns         — number of patterns (0-64)
 *   +34   globalVolume        — global volume (0-64)
 *   +35   reserved[13]
 *   +48   31 x STMSampleHeader (32 bytes each = 992 bytes) -> ends at 1040
 *   +1040 order list: 64 bytes (verMinor==0) or 128 bytes
 *         Values 99 or 255 = end-of-song marker
 *   After order list: numPatterns x 1024-byte pattern blocks
 *   Sample data: sampleHeader.offset << 4 = absolute file offset
 *
 * STMSampleHeader (32 bytes):
 *   +0   filename[12]      — sample name (null-padded)
 *   +12  zero (uint8)      — must be 0 (or 46 for putup10.stm quirk)
 *   +13  disk (uint8)      — legacy disk number (ignored)
 *   +14  offset (uint16LE) — file offset = this value << 4
 *   +16  length (uint16LE) — sample length in bytes
 *   +18  loopStart (uint16LE)
 *   +20  loopEnd (uint16LE)
 *   +22  volume (uint8)    — 0-64
 *   +23  reserved2 (uint8)
 *   +24  sampleRate (uint16LE)
 *   +26  reserved3[6]
 *
 * Pattern cell (4 bytes per channel per row):
 *   byte0: note byte (0x00-0x5F pitched, 0xFB empty, 0xFC continue, 0xFD/0xFE note cut)
 *          Pitched: octave = note>>4, semitone = note&0x0F -> XM = octave*12 + semitone + 36 + 1
 *   byte1: insVol — instr = insVol>>3, vol_lo = insVol&0x07
 *   byte2: volCmd — vol_hi = (volCmd&0xF0)>>1, effType = volCmd&0x0F
 *          combined volume = vol_lo | vol_hi (0-64 valid; >64 = no volume)
 *   byte3: cmdInf — effect parameter
 *
 * Reference: OpenMPT Load_stm.cpp
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// Binary helpers

function u8(v: DataView, off: number): number    { return v.getUint8(off); }
function u16le(v: DataView, off: number): number { return v.getUint16(off, true); }

function readString(v: DataView, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = v.getUint8(off + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

// Constants

const FILE_HDR_SIZE    = 48;
const SAMPLE_HDR_SIZE  = 32;
const NUM_SAMPLES      = 31;
const NUM_CHANNELS     = 4;
const ROWS_PER_PATTERN = 64;
const PATTERN_SIZE     = ROWS_PER_PATTERN * NUM_CHANNELS * 4; // 1024 bytes

// OpenMPT NOTE_MIN = 1; pitched STM note formula:
//   xmNote = (noteByte >> 4) * 12 + (noteByte & 0x0F) + 36 + 1
const NOTE_MIN    = 1;
const XM_NOTE_CUT = 97;

// STM effect index -> XM effect type
// Based on OpenMPT stmEffects[] array (indices 0-15 = effects . A B C D E F G H I J K L M N O)
const STM_EFFECTS: number[] = [
  0x00, // 0x0 -> none
  0x0F, // 0x1 -> Axx set speed   (CMD_SPEED)
  0x0B, // 0x2 -> Bxx pos jump    (CMD_POSITIONJUMP)
  0x0D, // 0x3 -> Cxx pat break   (CMD_PATTERNBREAK)
  0x0A, // 0x4 -> Dxx vol slide   (CMD_VOLUMESLIDE)
  0x02, // 0x5 -> Exx porta down  (CMD_PORTAMENTODOWN)
  0x01, // 0x6 -> Fxx porta up    (CMD_PORTAMENTOUP)
  0x03, // 0x7 -> Gxx tone porta  (CMD_TONEPORTAMENTO)
  0x04, // 0x8 -> Hxx vibrato     (CMD_VIBRATO)
  0x1D, // 0x9 -> Ixx tremor      (CMD_TREMOR)
  0x00, // 0xA -> Jxx arpeggio    (no-op in ST2)
  0x00, // 0xB -> K               (no-op)
  0x00, // 0xC -> L               (no-op)
  0x00, // 0xD -> M               (no-op)
  0x00, // 0xE -> N               (no-op)
  0x00, // 0xF -> O               (no-op)
];

// Format detection

/**
 * Returns true if the buffer is a valid STM module.
 * Mirrors OpenMPT's STMFileHeader::Validate() logic.
 */
export function isSTMFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < FILE_HDR_SIZE) return false;
  const v = new DataView(buffer);

  const dosEof       = u8(v, 28);
  const filetype     = u8(v, 29);
  const verMajor     = u8(v, 30);
  const verMinor     = u8(v, 31);
  const numPatterns  = u8(v, 33);
  const globalVolume = u8(v, 34);

  if (filetype !== 2)                                                              return false;
  if (dosEof !== 0x1A && dosEof !== 2)                                             return false;
  if (verMajor !== 2)                                                              return false;
  if (verMinor !== 0 && verMinor !== 10 && verMinor !== 20 && verMinor !== 21)     return false;
  if (numPatterns > 64)                                                            return false;
  if (globalVolume > 64 && globalVolume !== 0x58)                                 return false;

  // trackerName bytes 20-27 must all be printable ASCII (0x20-0x7E)
  for (let i = 20; i < 28; i++) {
    const c = u8(v, i);
    if (c < 0x20 || c >= 0x7F) return false;
  }

  return true;
}

// Sample header reader

interface STMSampleHeader {
  filename:   string;
  zero:       number;
  offset:     number; // raw uint16LE; absolute file pos = offset << 4
  length:     number;
  loopStart:  number;
  loopEnd:    number;
  volume:     number;
  sampleRate: number;
}

function readSampleHeader(v: DataView, base: number): STMSampleHeader {
  return {
    filename:   readString(v, base, 12),
    zero:       u8(v, base + 12),
    // +13 = disk (ignored)
    offset:     u16le(v, base + 14),
    length:     u16le(v, base + 16),
    loopStart:  u16le(v, base + 18),
    loopEnd:    u16le(v, base + 20),
    volume:     Math.min(u8(v, base + 22), 64),
    // +23 = reserved2
    sampleRate: u16le(v, base + 24),
    // +26..+31 = reserved3[6]
  };
}

// Effect conversion

/**
 * Convert a raw STM effect index + param byte to XM effTyp + eff.
 * Based on OpenMPT ConvertSTMCommand().
 */
function convertSTMEffect(
  effIdx: number,
  param: number,
  verMinor: number,
): { effTyp: number; eff: number } {
  const idx   = effIdx & 0x0F;
  const xmEff = STM_EFFECTS[idx];

  // Indices 0x0A-0x0F are always no-ops
  if (idx >= 0x0A) return { effTyp: 0, eff: 0 };

  // Effect 0 = no effect
  if (idx === 0x00) return { effTyp: 0, eff: 0 };

  switch (idx) {
    case 0x01: { // Axx set speed
      let p = param;
      if (verMinor < 21) {
        // Decimal-encoded tempo: convert from decimal to nibble-packed
        p = (Math.floor(p / 10) << 4) + (p % 10);
      }
      if (p === 0) return { effTyp: 0, eff: 0 };
      // Speed = high nibble
      return { effTyp: xmEff, eff: p >> 4 };
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

// Parser

export async function parseSTMFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  const v   = new DataView(buffer);
  const raw = new Uint8Array(buffer);

  // File header (48 bytes)
  const songName    = readString(v, 0, 20);
  const verMinor    = u8(v, 31);
  let   initTempo   = u8(v, 32);
  const numPatterns = u8(v, 33);

  // For verMinor < 21, tempo is stored as decimal; convert to packed nibbles
  if (verMinor < 21) {
    initTempo = ((Math.floor(initTempo / 10)) << 4) + (initTempo % 10);
  }
  if (initTempo === 0) initTempo = 0x60;

  const initialSpeed = Math.max(1, initTempo >> 4);
  const initialBPM   = 125; // ST2 BPM mode is non-standard; 125 is a safe playback default

  // Sample headers (31 x 32 bytes starting at offset 48)
  const sampleHeaders: STMSampleHeader[] = [];
  let cursor = FILE_HDR_SIZE;
  for (let s = 0; s < NUM_SAMPLES; s++) {
    sampleHeaders.push(readSampleHeader(v, cursor));
    cursor += SAMPLE_HDR_SIZE;
  }
  // cursor is now 48 + 992 = 1040

  // Order list (64 or 128 bytes)
  const orderListSize = verMinor === 0 ? 64 : 128;
  const rawOrders: number[] = [];
  for (let i = 0; i < orderListSize; i++) {
    const val = u8(v, cursor + i);
    if (val === 99 || val === 255) break; // end-of-song marker
    if (val <= 63) rawOrders.push(val);
  }
  cursor += orderListSize;

  if (rawOrders.length === 0) rawOrders.push(0);

  // Patterns
  const patternDataStart = cursor;

  // Build the set of all pattern indices to parse
  const referencedPats = new Set<number>(rawOrders);
  for (let i = 0; i < numPatterns; i++) referencedPats.add(i);

  const allPatIdxs = Array.from(referencedPats).sort((a, b) => a - b);
  const maxPatIdx  = allPatIdxs.length > 0 ? allPatIdxs[allPatIdxs.length - 1] : 0;

  const patIndexToArrayIdx = new Map<number, number>();
  const patterns: Pattern[] = [];

  for (const patIdx of allPatIdxs) {
    const patOff   = patternDataStart + patIdx * PATTERN_SIZE;
    const channels: ChannelData[] = [];

    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const rows: TrackerCell[] = [];

      for (let row = 0; row < ROWS_PER_PATTERN; row++) {
        const cellOff = patOff + (row * NUM_CHANNELS + ch) * 4;

        if (cellOff + 3 >= buffer.byteLength) {
          rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          continue;
        }

        const noteByte = u8(v, cellOff);
        const insVol   = u8(v, cellOff + 1);
        const volCmd   = u8(v, cellOff + 2);
        const cmdInf   = u8(v, cellOff + 3);

        // Decode note
        let note = 0;
        if (noteByte === 0xFB || noteByte === 0xFC) {
          note = 0; // empty / continue
        } else if (noteByte === 0xFD || noteByte === 0xFE) {
          note = XM_NOTE_CUT;
        } else if (noteByte < 0x60) {
          const octave   = (noteByte >> 4) & 0x0F;
          const semitone = noteByte & 0x0F;
          note = octave * 12 + semitone + 36 + NOTE_MIN;
        }

        // Decode instrument (upper 5 bits of insVol)
        let instrument = insVol >> 3;
        if (instrument > 31) instrument = 0;

        // Decode volume: low 3 bits of insVol | ((high 4 bits of volCmd) >> 1)
        const volLo  = insVol & 0x07;
        const volHi  = (volCmd & 0xF0) >> 1;
        const rawVol = volLo | volHi;
        const volume = rawVol <= 64 ? rawVol : 0;

        // Decode effect
        const { effTyp, eff } = convertSTMEffect(volCmd & 0x0F, cmdInf, verMinor);

        rows.push({
          note,
          instrument,
          volume,
          effTyp,
          eff,
          effTyp2: 0,
          eff2: 0,
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

    const arrIdx = patterns.length;
    patIndexToArrayIdx.set(patIdx, arrIdx);

    patterns.push({
      id:       `pattern-${patIdx}`,
      name:     `Pattern ${patIdx}`,
      length:   ROWS_PER_PATTERN,
      channels,
      importMetadata: {
        sourceFormat:            'STM',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    NUM_CHANNELS,
        originalPatternCount:    maxPatIdx + 1,
        originalInstrumentCount: NUM_SAMPLES,
      },
    });
  }

  // Song positions
  const songPositions: number[] = [];
  for (const patIdx of rawOrders) {
    const arrIdx = patIndexToArrayIdx.get(patIdx);
    if (arrIdx !== undefined) songPositions.push(arrIdx);
  }
  if (songPositions.length === 0) songPositions.push(0);

  // Instruments
  const instruments: InstrumentConfig[] = sampleHeaders.map((hdr, i) => {
    const id   = i + 1;
    const name = hdr.filename.replace(/\0/g, '').trim() || `Sample ${id}`;

    const sampleFileOff = hdr.offset << 4;
    const length        = hdr.length;

    // OpenMPT: if length < 2, treat as empty; also skip zero-volume samples
    const isEmpty =
      length < 2 ||
      sampleFileOff < FILE_HDR_SIZE ||
      sampleFileOff >= buffer.byteLength ||
      hdr.volume === 0;

    if (isEmpty) {
      return {
        id,
        name,
        type:      'sample' as const,
        synthType: 'Sampler' as const,
        effects:   [],
        volume:    -60,
        pan:       0,
      } as InstrumentConfig;
    }

    const readEnd = Math.min(sampleFileOff + length, buffer.byteLength);
    const readLen = readEnd - sampleFileOff;
    if (readLen <= 0) {
      return {
        id,
        name,
        type:      'sample' as const,
        synthType: 'Sampler' as const,
        effects:   [],
        volume:    -60,
        pan:       0,
      } as InstrumentConfig;
    }

    const pcm = raw.subarray(sampleFileOff, sampleFileOff + readLen);

    // Loop active if: loopStart < length && loopEnd > loopStart && loopEnd != 0xFFFF
    const hasLoop =
      hdr.loopStart < length &&
      hdr.loopEnd > hdr.loopStart &&
      hdr.loopEnd !== 0xFFFF;

    const loopStart  = hasLoop ? hdr.loopStart : 0;
    const loopEnd    = hasLoop ? hdr.loopEnd   : 0;
    const sampleRate = hdr.sampleRate > 0 ? hdr.sampleRate : 8363;

    return createSamplerInstrument(
      id,
      name,
      pcm,
      hdr.volume,
      sampleRate,
      loopStart,
      loopEnd,
    );
  });

  return {
    name:            songName.replace(/\0/g, '').trim() || filename.replace(/\.[^/.]+$/, ''),
    format:          'MOD' as TrackerFormat,
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
