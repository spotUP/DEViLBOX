/**
 * RTMParser.ts — Real Tracker 2 (.rtm) PC format parser
 *
 * Real Tracker 2 is a PC DOS tracker format from the mid-1990s by Real Productions.
 * It uses a chunked object structure with 4-byte type tags for each section.
 *
 * Binary layout (little-endian throughout):
 *   +0    RTMObjectHeader (42 bytes): id[4]="RTMM", space=0x20, name[32], eof=0x1A,
 *         version(u16le, 0x0100–0x0112), objectSize(u16le, ≥98)
 *   +42   RTMMHeader (up to objectSize bytes):
 *         software[20], composer[32], flags(u16le), numChannels(u8),
 *         numInstruments(u8), numOrders(u16le), numPatterns(u16le),
 *         speed(u8), tempo(u8), panning[32](int8), extraDataSize(u32le),
 *         originalName[32] (version ≥ 0x112 only)
 *   +42+objectSize  extraData: order list (numOrders × u16le) + optional track names
 *   Then numPatterns × (RTMObjectHeader "RTND" + RTMPatternHeader + packed data)
 *   Then numInstruments × (RTMObjectHeader "RTIN" + RTINHeader +
 *        numSamples × (RTMObjectHeader "RTSM" + RTSMHeader + raw PCM))
 *
 * Pattern encoding (packed RLE):
 *   byte 0x00 = end of row (advance to next row)
 *   bit 0x01  = explicit channel index byte follows (else keep current)
 *   bit 0x02  = note byte follows (0xFE = key-off/97, <120: cell.note = raw + 1)
 *   bit 0x04  = instrument byte follows
 *   bit 0x08  = command1 byte follows
 *   bit 0x10  = param1 byte follows
 *   bit 0x20  = command2 byte follows
 *   bit 0x40  = param2 byte follows
 *   Channel auto-increments by 1 after each cell is processed.
 *
 * Reference: OpenMPT Load_rtm.cpp
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// ── Binary helpers ────────────────────────────────────────────────────────────

function u8(v: DataView, off: number): number    { return v.getUint8(off); }
function u16le(v: DataView, off: number): number { return v.getUint16(off, true); }
function u32le(v: DataView, off: number): number { return v.getUint32(off, true); }
function i8(v: DataView, off: number): number    { return v.getInt8(off); }

function readNullTermString(v: DataView, offset: number, maxLen: number): string {
  let s = '';
  for (let i = 0; i < maxLen; i++) {
    const c = v.getUint8(offset + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** RTMObjectHeader is always 42 bytes */
const OBJ_HDR_SIZE   = 42;

/** Maximum RTMMHeader body bytes defined by the struct */
const RTMM_HDR_SIZE  = 130;

/** Minimum objectSize for a valid RTMM header (OpenMPT: objectSize >= 98) */
const RTMM_MIN_OBJ   = 98;

/**
 * XM note-off value stored in TrackerCell.note.
 * OpenMPT maps RTM 0xFE → NOTE_KEYOFF (97 in 1-based XM notation).
 */
const XM_NOTE_OFF    = 97;

/**
 * RTM note offset: OpenMPT code is `m.note = note + NOTE_MIDDLEC - 48` where
 * NOTE_MIDDLEC == 49, so the net offset is +1.
 */
const RTM_NOTE_OFFSET = 1;

/** Default C5 speed when RTSM sampleRate field is 0 */
const DEFAULT_C5_SPEED = 8363;

// RTMMHeader flag bits
const SONG_LINEAR_SLIDES = 0x01;
const SONG_TRACK_NAMES   = 0x02;

// RTSMHeader flag bits
const RTSM_SMP_16BIT = 0x02;
const RTSM_SMP_DELTA = 0x04;

// ── RTMObjectHeader ───────────────────────────────────────────────────────────

interface RTMObjectHeader {
  id:         string;   // 4-char type tag ("RTMM" | "RTND" | "RTIN" | "RTSM")
  space:      number;   // must be 0x20
  name:       string;   // [32] null-terminated ASCII
  eof:        number;   // must be 0x1A
  version:    number;   // u16le, 0x0100–0x0112
  objectSize: number;   // u16le — byte length of the object body that follows this header
}

function readObjectHeader(v: DataView, offset: number): RTMObjectHeader {
  const id = String.fromCharCode(
    u8(v, offset), u8(v, offset + 1), u8(v, offset + 2), u8(v, offset + 3),
  );
  return {
    id,
    space:      u8(v,    offset + 4),
    name:       readNullTermString(v, offset + 5, 32),
    eof:        u8(v,    offset + 37),
    version:    u16le(v, offset + 38),
    objectSize: u16le(v, offset + 40),
  };
}

function isMainHeaderValid(hdr: RTMObjectHeader): boolean {
  return hdr.id === 'RTMM'
    && hdr.space === 0x20
    && hdr.eof   === 0x1A
    && hdr.version >= 0x100
    && hdr.version <= 0x112
    && hdr.objectSize >= RTMM_MIN_OBJ;
}

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Returns true if buffer starts with a valid RTM song-object header (RTMM).
 */
export function isRTMFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < OBJ_HDR_SIZE + 4) return false;
  const v = new DataView(buffer);
  try {
    return isMainHeaderValid(readObjectHeader(v, 0));
  } catch {
    return false;
  }
}

// ── RTMMHeader ────────────────────────────────────────────────────────────────

interface RTMMHeader {
  software:       string;
  composer:       string;
  flags:          number;
  numChannels:    number;
  numInstruments: number;
  numOrders:      number;
  numPatterns:    number;
  speed:          number;
  tempo:          number;
  panning:        number[];  // int8[32], -64..64
  extraDataSize:  number;
  originalName:   string;
}

/**
 * RTMMHeader binary layout (MPT_BINARY_STRUCT(RTMMHeader, 130)):
 *   +0   software[20]     null-terminated ASCII
 *   +20  composer[32]     null-terminated ASCII
 *   +52  flags(u16le)
 *   +54  numChannels(u8)  1–32
 *   +55  numInstruments(u8)
 *   +56  numOrders(u16le) ≤ 999
 *   +58  numPatterns(u16le) ≤ 999
 *   +60  speed(u8)        must be non-zero
 *   +61  tempo(u8)
 *   +62  panning[32](int8) -64..64
 *   +94  extraDataSize(u32le) < 0x10000
 *   +98  originalName[32] (present for version ≥ 0x112 only)
 *
 * We read min(objectSize, RTMM_HDR_SIZE) bytes, guarding each field access.
 */
function readRTMMHeader(v: DataView, bodyStart: number, availableBytes: number): RTMMHeader {
  const o   = bodyStart;
  const has = (need: number): boolean => availableBytes >= need;

  const software       = readNullTermString(v, o +  0, 20);
  const composer       = has( 52) ? readNullTermString(v, o + 20, 32) : '';
  const flags          = has( 54) ? u16le(v, o + 52) : 0;
  const numChannels    = has( 55) ? u8(v,   o + 54)  : 0;
  const numInstruments = has( 56) ? u8(v,   o + 55)  : 0;
  const numOrders      = has( 58) ? u16le(v, o + 56) : 0;
  const numPatterns    = has( 60) ? u16le(v, o + 58) : 0;
  const speed          = has( 61) ? u8(v,   o + 60)  : 6;
  const tempo          = has( 62) ? u8(v,   o + 61)  : 125;

  const panning: number[] = [];
  for (let i = 0; i < 32; i++) {
    // +62 is the start of panning[32]; guard each byte individually
    panning.push(has(63 + i) ? i8(v, o + 62 + i) : 0);
  }

  const extraDataSize = has( 98) ? u32le(v, o + 94) : 0;
  const originalName  = has(130) ? readNullTermString(v, o + 98, 32) : '';

  return {
    software, composer, flags, numChannels, numInstruments,
    numOrders, numPatterns, speed, tempo, panning, extraDataSize, originalName,
  };
}

// ── RTMPatternHeader ──────────────────────────────────────────────────────────

interface RTMPatternHeader {
  flags:      number;  // u16le — always 1
  numTracks:  number;  // u8
  numRows:    number;  // u16le
  packedSize: number;  // u32le — byte length of the compressed pattern data
}

/**
 * RTMPatternHeader binary layout (MPT_BINARY_STRUCT(RTMPatternHeader, 9)):
 *   +0 flags(u16le)
 *   +2 numTracks(u8)
 *   +3 numRows(u16le)
 *   +5 packedSize(u32le)
 */
function readPatternHeader(v: DataView, offset: number): RTMPatternHeader {
  return {
    flags:      u16le(v, offset + 0),
    numTracks:  u8(v,    offset + 2),
    numRows:    u16le(v, offset + 3),
    packedSize: u32le(v, offset + 5),
  };
}

// ── RTINHeader ────────────────────────────────────────────────────────────────

interface RTINHeader {
  numSamples: number;
  flags:      number;
  // samples[120] omitted — not used in our output model
}

/**
 * RTINHeader binary layout (MPT_BINARY_STRUCT(RTINHeader, 341)).
 * We only need the first 3 bytes for our purposes:
 *   +0 numSamples(u8)
 *   +1 flags(u16le)
 *   +3 samples[120](u8) ... (not read)
 */
function readInstrumentHeader(v: DataView, offset: number, availableBytes: number): RTINHeader {
  return {
    numSamples: availableBytes > 0 ? u8(v,    offset)     : 0,
    flags:      availableBytes > 2 ? u16le(v, offset + 1) : 0,
  };
}

// ── RTSMHeader ────────────────────────────────────────────────────────────────

interface RTSMHeader {
  flags:         number;  // u16le
  baseVolume:    number;  // u8, 0–64
  defaultVolume: number;  // u8, 0–64
  length:        number;  // u32le — raw byte count of PCM data
  loopType:      number;  // u8: 0=none, 1=forward, 2=pingpong
  loopStart:     number;  // u32le — in bytes
  loopEnd:       number;  // u32le — in bytes
  sampleRate:    number;  // u32le — C5 speed in Hz
  baseNote:      number;  // u8 — middle C reference (unused here)
  panning:       number;  // int8, -64..64
}

/**
 * RTSMHeader binary layout (MPT_BINARY_STRUCT(RTSMHeader, 26)):
 *   +0  flags(u16le)
 *   +2  baseVolume(u8)
 *   +3  defaultVolume(u8)
 *   +4  length(u32le)
 *   +8  loopType(u8)
 *   +9  reserved[3]
 *   +12 loopStart(u32le)
 *   +16 loopEnd(u32le)
 *   +20 sampleRate(u32le)
 *   +24 baseNote(u8)
 *   +25 panning(int8)
 */
function readSampleHeader(v: DataView, offset: number): RTSMHeader {
  return {
    flags:         u16le(v, offset +  0),
    baseVolume:    u8(v,    offset +  2),
    defaultVolume: u8(v,    offset +  3),
    length:        u32le(v, offset +  4),
    loopType:      u8(v,    offset +  8),
    loopStart:     u32le(v, offset + 12),
    loopEnd:       u32le(v, offset + 16),
    sampleRate:    u32le(v, offset + 20),
    baseNote:      u8(v,    offset + 24),
    panning:       i8(v,    offset + 25),
  };
}

// ── Effect conversion ─────────────────────────────────────────────────────────

/**
 * Convert an RTM effect command + param into a TrackerCell effTyp/eff pair.
 *
 * RTM uses XM-style effect numbering for commands 1–33 (cmd <= 'X'-55 = 33),
 * with the following mappings from Load_rtm.cpp::ConvertRTMEffect():
 *
 *   cmd ==  8 → CMD_PANNING8,       eff = param * 2 (saturate to 255)
 *   cmd == 28 && (param & 0xF0)==0xA0 → CMD_S3MCMDEX (pass through)
 *   cmd  ≤ 33 → standard XM effect (effTyp = cmd, eff = param)
 *   cmd == 36 → CMD_VOLUMESLIDE     (0x0A)
 *   cmd == 37 → CMD_PORTAMENTOUP    (0x01)
 *   cmd == 38 → CMD_PORTAMENTODOWN  (0x02)
 *   cmd == 39 → CMD_VIBRATOVOL      (0x06)
 *   cmd == 40 → CMD_SPEED           (0x0F)
 *
 * Commands M and V (MIDI) are not handled and produce effTyp 0.
 */
function convertRTMEffect(cmd: number, param: number): { effTyp: number; eff: number } {
  if (cmd === 0 && param === 0) return { effTyp: 0, eff: 0 };

  // CMD_PANNING8 — OpenMPT: saturate_cast<uint8>(param * 2), max 255
  if (cmd === 8) {
    return { effTyp: 0x08, eff: Math.min(255, param * 2) };
  }

  // CMD_S3MCMDEX for the 0xAx subcommand
  const S_CMD = 'S'.charCodeAt(0) - 55; // == 28
  if (cmd === S_CMD && (param & 0xF0) === 0xA0) {
    return { effTyp: 0x13, eff: param }; // XM/IT S3MCMDEX code
  }

  // Standard XM effect range
  const X_CMD = 'X'.charCodeAt(0) - 55; // == 33
  if (cmd >= 1 && cmd <= X_CMD) {
    return { effTyp: cmd, eff: param };
  }

  // Extended RTM commands beyond 'X'
  switch (cmd) {
    case 36: return { effTyp: 0x0A, eff: param };  // volume slide  (Dxx in XM)
    case 37: return { effTyp: 0x01, eff: param };  // portamento up (1xx)
    case 38: return { effTyp: 0x02, eff: param };  // portamento dn (2xx)
    case 39: return { effTyp: 0x06, eff: param };  // vibrato+vol   (6xx)
    case 40: return { effTyp: 0x0F, eff: param };  // set speed     (Fxx)
    default: return { effTyp: 0,    eff: 0 };
  }
}

// ── Delta PCM decoders ────────────────────────────────────────────────────────

/**
 * Decode delta-encoded 8-bit PCM.
 * Algorithm: running sum; each byte is interpreted as a signed delta.
 * Output is an unsigned byte stream where 0x80 = silence (signed 0).
 */
function decodeDelta8(src: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(src.length);
  let acc = 0;
  for (let i = 0; i < src.length; i++) {
    const delta = src[i] < 128 ? src[i] : src[i] - 256;
    acc = (acc + delta) & 0xFF;
    out[i] = acc;
  }
  return out;
}

/**
 * Decode delta-encoded 16-bit LE PCM.
 * Each pair of bytes is a signed 16-bit LE delta; accumulate into running sum.
 * Output buffer has the same byte length as the input (pairs of LE int16).
 */
function decodeDelta16(src: Uint8Array): Uint8Array<ArrayBuffer> {
  const out     = new Uint8Array(src.length);
  const outView = new DataView(out.buffer);
  let acc = 0;
  for (let i = 0; i + 1 < src.length; i += 2) {
    const raw16   = (src[i + 1] << 8) | src[i];
    const delta   = raw16 < 32768 ? raw16 : raw16 - 65536;
    acc           = (acc + delta) & 0xFFFF;
    const signed  = acc < 32768 ? acc : acc - 65536;
    outView.setInt16(i, signed, true);
  }
  return out;
}

// ── Channel panning conversion ────────────────────────────────────────────────

/**
 * Convert RTM int8 panning (-64..64) to ChannelData pan (-100..100).
 *
 * OpenMPT maps: panValue = (rtmPan + 64) * 2  →  0..256 (clamped to 255).
 * ChannelData.pan is -100..100 where 0 = centre.
 * Mapping: panValue 0 → -100, 128 → 0, 256 → +100.
 */
function rtmPanToChannelPan(rtmPan: number): number {
  const panValue = Math.min(255, (rtmPan + 64) * 2); // 0..255
  return Math.round((panValue / 128 - 1) * 100);     // -100..+100
}

// ── Blank instrument placeholder ──────────────────────────────────────────────

function blankInstrument(id: number, name: string): InstrumentConfig {
  return {
    id,
    name,
    type:      'sample'  as const,
    synthType: 'Sampler' as const,
    effects:   [],
    volume:    -60,
    pan:       0,
  } as InstrumentConfig;
}

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Parse a Real Tracker 2 (.rtm) file into a TrackerSong.
 *
 * One InstrumentConfig is created per RTSM sample chunk encountered across all
 * RTIN instrument chunks. Each RTSM sample gets a globally-sequential 1-based ID.
 *
 * @throws If the file fails format validation or the buffer is truncated.
 */
export async function parseRTMFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  const v   = new DataView(buffer);
  const raw = new Uint8Array(buffer);

  // ── File-level song object header (42 bytes at offset 0) ───────────────────
  if (buffer.byteLength < OBJ_HDR_SIZE) {
    throw new Error('RTMParser: file too small for RTMObjectHeader');
  }
  const fileHdr = readObjectHeader(v, 0);
  if (!isMainHeaderValid(fileHdr)) {
    throw new Error('RTMParser: invalid RTMM object header');
  }

  // ── RTMMHeader body ─────────────────────────────────────────────────────────
  const songBodyStart = OBJ_HDR_SIZE;
  const songBodyLen   = Math.min(fileHdr.objectSize, RTMM_HDR_SIZE);
  if (buffer.byteLength < songBodyStart + songBodyLen) {
    throw new Error('RTMParser: file truncated reading RTMMHeader');
  }
  const songHdr = readRTMMHeader(v, songBodyStart, songBodyLen);

  if (songHdr.numChannels === 0 || songHdr.numChannels > 32) {
    throw new Error(`RTMParser: invalid numChannels (${songHdr.numChannels})`);
  }
  if (songHdr.speed === 0) {
    throw new Error('RTMParser: invalid speed (0)');
  }

  // ── Extra data: order list + optional track names ───────────────────────────
  // cursor advances past the song object body then the extra data block.
  let cursor    = OBJ_HDR_SIZE + fileHdr.objectSize;
  const extraStart = cursor;
  const extraEnd   = extraStart + songHdr.extraDataSize;

  // Read order list: numOrders × uint16LE from the start of extra data
  const orderList: number[] = [];
  let extraCursor = extraStart;
  for (
    let i = 0;
    i < songHdr.numOrders && extraCursor + 2 <= extraEnd && extraCursor + 2 <= buffer.byteLength;
    i++
  ) {
    orderList.push(u16le(v, extraCursor));
    extraCursor += 2;
  }

  // Skip the rest of the extra data (track names if songTrackNames flag set, etc.)
  cursor = extraEnd;

  // ── Song name ───────────────────────────────────────────────────────────────
  let songName = fileHdr.name;
  if (!songName && fileHdr.version >= 0x112) {
    songName = songHdr.originalName;
  }
  if (!songName) {
    songName = filename.replace(/\.[^/.]+$/i, '');
  }

  const numChannels    = songHdr.numChannels;
  const numPatterns    = songHdr.numPatterns;
  const numInstruments = songHdr.numInstruments;

  // ── Patterns ────────────────────────────────────────────────────────────────
  const patterns: Pattern[] = [];

  for (let pat = 0; pat < numPatterns; pat++) {
    if (cursor + OBJ_HDR_SIZE > buffer.byteLength) break;

    const patObjHdr = readObjectHeader(v, cursor);
    cursor         += OBJ_HDR_SIZE;

    // Read the pattern header from the first part of the object body
    if (cursor + 9 > buffer.byteLength) break;
    const patHdr = readPatternHeader(v, cursor);
    cursor       += patObjHdr.objectSize;  // advance past full object body

    // Packed pattern data immediately follows the object body
    const packedStart = cursor;
    cursor           += patHdr.packedSize;
    const packedEnd   = cursor;

    const numRows = Math.max(1, patHdr.numRows);

    // Allocate empty grid: grid[row][channel]
    const grid: TrackerCell[][] = Array.from({ length: numRows }, () =>
      Array.from({ length: numChannels }, (): TrackerCell => ({
        note: 0, instrument: 0, volume: 0,
        effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      })),
    );

    // Decode packed data (OpenMPT::ReadRTM pattern decoding)
    let pPos = packedStart;
    let row  = 0;
    let chn  = 0;

    while (row < numRows && pPos < packedEnd) {
      const b = u8(v, pPos++);

      // 0x00 = end of row
      if (b === 0) {
        row++;
        chn = 0;
        continue;
      }

      // bit 0x01: explicit new channel index
      if (b & 0x01) {
        if (pPos >= packedEnd) break;
        chn = u8(v, pPos++);
      }

      if (chn >= numChannels) break;

      const cell = grid[row][chn];

      // bit 0x02: note byte
      if (b & 0x02) {
        if (pPos >= packedEnd) break;
        const nr = u8(v, pPos++);
        if (nr === 0xFE) {
          cell.note = XM_NOTE_OFF;
        } else if (nr < 120) {
          cell.note = nr + RTM_NOTE_OFFSET;
        }
        // nr >= 120 and != 0xFE: ignore (undefined in the format)
      }

      // bit 0x04: instrument byte
      if (b & 0x04) {
        if (pPos >= packedEnd) break;
        cell.instrument = u8(v, pPos++);
      }

      // bits 0x08/0x10/0x20/0x40: two optional command+param pairs
      let cmd1 = 0, param1 = 0, cmd2 = 0, param2 = 0;
      if (b & 0x08) { if (pPos >= packedEnd) break; cmd1   = u8(v, pPos++); }
      if (b & 0x10) { if (pPos >= packedEnd) break; param1 = u8(v, pPos++); }
      if (b & 0x20) { if (pPos >= packedEnd) break; cmd2   = u8(v, pPos++); }
      if (b & 0x40) { if (pPos >= packedEnd) break; param2 = u8(v, pPos++); }

      // Primary effect (cmd1/param1)
      if (cmd1 !== 0 || param1 !== 0) {
        const e1    = convertRTMEffect(cmd1, param1);
        cell.effTyp = e1.effTyp;
        cell.eff    = e1.eff;
      }

      // Secondary effect (cmd2/param2)
      if (cmd2 !== 0 || param2 !== 0) {
        const e2     = convertRTMEffect(cmd2, param2);
        cell.effTyp2 = e2.effTyp;
        cell.eff2    = e2.eff;
      }

      // Channel auto-increments after each processed cell (OpenMPT: chn++)
      chn++;
    }

    // Build ChannelData array with per-channel panning from song header
    const channels: ChannelData[] = Array.from({ length: numChannels }, (_, ch): ChannelData => ({
      id:           `channel-${ch}`,
      name:         `Channel ${ch + 1}`,
      muted:        false,
      solo:         false,
      collapsed:    false,
      volume:       100,
      pan:          rtmPanToChannelPan(songHdr.panning[ch] ?? 0),
      instrumentId: null,
      color:        null,
      rows:         grid.map(r => r[ch]),
    }));

    patterns.push({
      id:      `pattern-${pat}`,
      name:    patObjHdr.name || `Pattern ${pat}`,
      length:  numRows,
      channels,
      importMetadata: {
        sourceFormat:            'RTM',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    numChannels,
        originalPatternCount:    numPatterns,
        originalInstrumentCount: numInstruments,
      },
    });
  }

  // ── Song positions ──────────────────────────────────────────────────────────
  const maxPatIdx     = Math.max(0, patterns.length - 1);
  const songPositions = orderList.map(idx => Math.min(idx, maxPatIdx));

  // ── Instruments + Samples ───────────────────────────────────────────────────
  // One InstrumentConfig is created per RTSM sample (globally sequential IDs).
  const instruments: InstrumentConfig[] = [];
  let sampleSeq = 0; // global 0-based counter across all instruments

  for (let instr = 0; instr < numInstruments; instr++) {
    if (cursor + OBJ_HDR_SIZE > buffer.byteLength) break;

    const insObjHdr = readObjectHeader(v, cursor);
    cursor         += OBJ_HDR_SIZE;

    const insBodyLen = Math.min(insObjHdr.objectSize, 341);
    if (cursor + insBodyLen > buffer.byteLength) {
      // Instrument body unreadable — emit blank and stop
      instruments.push(blankInstrument(sampleSeq + 1, insObjHdr.name || `Instrument ${instr + 1}`));
      sampleSeq++;
      break;
    }

    const insHdr = readInstrumentHeader(v, cursor, insBodyLen);
    cursor       += insObjHdr.objectSize;

    const instrName  = insObjHdr.name || `Instrument ${instr + 1}`;
    const numSamples = insHdr.numSamples;

    if (numSamples === 0) {
      // Instrument with no samples — emit a silent placeholder
      instruments.push(blankInstrument(sampleSeq + 1, instrName));
      sampleSeq++;
      continue;
    }

    // Read all RTSM sub-chunks for this instrument.
    // Each sample becomes its own InstrumentConfig entry.
    for (let smp = 0; smp < numSamples; smp++) {
      const sampleId = sampleSeq + 1; // 1-based global instrument ID
      sampleSeq++;

      if (cursor + OBJ_HDR_SIZE > buffer.byteLength) {
        instruments.push(blankInstrument(sampleId, instrName));
        continue;
      }

      const smpObjHdr = readObjectHeader(v, cursor);
      cursor         += OBJ_HDR_SIZE;

      const smpBodyLen = Math.min(smpObjHdr.objectSize, 26);
      if (cursor + smpBodyLen > buffer.byteLength) {
        instruments.push(blankInstrument(sampleId, instrName));
        cursor += smpObjHdr.objectSize;
        continue;
      }

      const smpHdr = readSampleHeader(v, cursor);
      cursor       += smpObjHdr.objectSize;

      const rawByteLen = smpHdr.length;
      const is16bit    = (smpHdr.flags & RTSM_SMP_16BIT) !== 0;
      const isDelta    = (smpHdr.flags & RTSM_SMP_DELTA) !== 0;

      if (rawByteLen === 0 || cursor + rawByteLen > buffer.byteLength) {
        instruments.push(blankInstrument(sampleId, instrName));
        cursor += rawByteLen;
        continue;
      }

      const sampleName = smpObjHdr.name || instrName;
      const sampleRate = smpHdr.sampleRate > 0 ? smpHdr.sampleRate : DEFAULT_C5_SPEED;

      let pcm8: Uint8Array;
      let loopStartFrames: number;
      let loopEndFrames:   number;

      if (is16bit) {
        // 16-bit PCM (optionally delta-encoded) → downsample to 8-bit for createSamplerInstrument
        let raw16: Uint8Array<ArrayBuffer> = new Uint8Array(raw.buffer, raw.byteOffset + cursor, rawByteLen);
        if (isDelta) raw16 = decodeDelta16(raw16);

        // Convert signed 16-bit LE → signed 8-bit (take high byte of each sample)
        const numFrames = Math.floor(raw16.length / 2);
        pcm8 = new Uint8Array(numFrames);
        for (let f = 0; f < numFrames; f++) {
          const lo  = raw16[f * 2];
          const hi  = raw16[f * 2 + 1];
          const s16 = (hi << 8) | lo;
          // Reinterpret as signed 16-bit then scale to signed 8-bit range
          const signed16 = s16 < 32768 ? s16 : s16 - 65536;
          const signed8  = Math.round(signed16 / 256);
          // Store as unsigned representation of the signed 8-bit value
          pcm8[f] = signed8 < 0 ? signed8 + 256 : signed8;
        }

        // Loop points from RTSM are in bytes; convert to sample frames for 16-bit
        loopStartFrames = Math.floor(smpHdr.loopStart / 2);
        loopEndFrames   = Math.floor(smpHdr.loopEnd   / 2);
      } else {
        // 8-bit PCM (optionally delta-encoded)
        let rawSmp: Uint8Array<ArrayBuffer> = new Uint8Array(raw.buffer, raw.byteOffset + cursor, rawByteLen);
        if (isDelta) rawSmp = decodeDelta8(rawSmp);
        pcm8 = rawSmp;

        // Loop points for 8-bit are already in sample frames (== bytes)
        loopStartFrames = smpHdr.loopStart;
        loopEndFrames   = smpHdr.loopEnd;
      }

      const hasLoop = smpHdr.loopType !== 0 && loopEndFrames > loopStartFrames;

      instruments.push(createSamplerInstrument(
        sampleId,
        sampleName,
        pcm8,
        smpHdr.defaultVolume,   // 0–64, matches createSamplerInstrument's volume scale
        sampleRate,
        hasLoop ? loopStartFrames : 0,
        hasLoop ? loopEndFrames   : 0,
      ));

      cursor += rawByteLen;
    }
  }

  // ── Assemble TrackerSong ───────────────────────────────────────────────────

  return {
    name:            songName,
    format:          'XM' as TrackerFormat,   // RTM effects are XM-compatible
    patterns,
    instruments,
    songPositions,
    songLength:      songPositions.length,
    restartPosition: 0,
    numChannels,
    initialSpeed:    songHdr.speed,
    initialBPM:      songHdr.tempo,
    linearPeriods:   (songHdr.flags & SONG_LINEAR_SLIDES) !== 0,
  };
}
