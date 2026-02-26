/**
 * SymphonieProParser.ts — Symphonie / Symphonie Pro (.symmod) native parser
 *
 * Symphonie was an Amiga tracker with an interesting chunk-based format.
 * Symphonie Pro is an enhanced version with additional stereo/sample-boost features.
 * Files are identified by the 4-byte magic "SymM" at offset 0.
 *
 * Reference: Reference Code/openmpt-master/soundlib/Load_symmod.cpp (authoritative)
 *
 * File layout:
 *   Header (16 bytes):
 *     magic[4]       = "SymM"
 *     version        uint32BE (must be 1)
 *     firstChunkID   int32BE  (must be -1 = NumChannels)
 *     numChannels    uint32BE (1–256)
 *
 *   Followed by a sequence of chunks until EOF. Each chunk:
 *     chunkType  int32BE  (see ChunkType enum)
 *     data       varies   (4-byte inline value, or length-prefixed packed block)
 *
 * Chunk types (int32BE):
 *   -1  NumChannels    — already consumed in header
 *   -2  TrackLength    — uint32BE: rows per track (max 1024)
 *   -3  PatternSize    — skip 4
 *   -4  NumInstruments — skip 4
 *   -5  EventSize      — uint32BE: must be 4 (bytes per event)
 *   -6  Tempo          — uint32BE: BPM = 1.24 * min(val, 800)
 *   -7  ExternalSamples— skip 4
 *   -10 PositionList   — packed array of SymPosition (32 bytes each)
 *   -11 SampleFile     — length-prefixed raw sample blob
 *   -12 EmptySample    — no data; increment sample counter
 *   -13 PatternEvents  — packed array of SymEvent (4 bytes each)
 *   -14 InstrumentList — packed array of SymInstrument (256 bytes each)
 *   -15 Sequences      — packed array of SymSequence (16 bytes each)
 *   -16 InfoText        — packed text (song message, we use first line as name)
 *   -17 SamplePacked   — delta-compressed 8-bit sample
 *   -18 SamplePacked16 — block-delta-compressed 16-bit sample (skip same as -17)
 *   -19 InfoType        — skip
 *   -20 InfoBinary      — skip
 *   -21 InfoString      — skip
 *   10  SampleBoost    — uint32BE: sample normalisation factor (marks Pro variant)
 *   11  StereoDetune   — uint32BE: skip (marks Pro variant)
 *   12  StereoPhase    — uint32BE: skip (marks Pro variant)
 *
 * Packed block format: uint32BE packedLength, then either
 *   - "PACK\xFF\xFF" + uint32BE unpackedLength + RLE payload  → RLE-decompress
 *   - raw bytes (packedLength bytes)
 *
 * RLE types (int8):
 *    0: uint8 count + count raw bytes
 *    1: uint8 count + uint32 dword → repeat dword count times
 *    2: uint32 dword → write dword twice
 *    3: uint8 count → write count zero bytes
 *   -1: end of stream
 *
 * SymEvent (4 bytes each):
 *   command uint8, note int8, param uint8, inst uint8
 *
 * SymSequence (16 bytes):
 *   start uint16BE, length uint16BE, loop uint16BE, info int16BE,
 *   transpose int16BE, padding[6]
 *
 * SymPosition (32 bytes):
 *   dummy[4], loopNum uint16BE, loopCount uint16BE,
 *   pattern uint16BE, start uint16BE, length uint16BE,
 *   speed uint16BE, transpose int16BE, eventsPerLine uint16BE,
 *   padding[12]
 *
 * SymInstrument (256 bytes):
 *   first 128 bytes = name OR virtual/transwave header
 *   type int8, loopStartHigh uint8, loopLenHigh uint8, numRepetitions uint8,
 *   channel uint8, dummy1 uint8, volume uint8 (0-199), dummy2[3],
 *   finetune int8, transpose int8, sampleFlags uint8, filter int8,
 *   instFlags uint8, downsample uint8, ...
 *
 * Panning (from OpenMPT, line 1930):
 *   channel & 1 → right (pan +50), else → left (pan -50)
 *
 * Note mapping (from OpenMPT, line 1431):
 *   note range 0-84 → output note = note + 25  (1-based, C-0 offset)
 *   (OpenMPT: note += 25 where note is 0-based, so C-0=1 is note 25+0=25… hmm)
 *   Actually: if event.note >= 0 && event.note <= 84 → note = event.note + 25
 *   This matches OpenMPT where NOTE_MIN=1 and "note + 25" gives notes 25-109
 *   In XM terms: note 1 = C-0, so note 25 = C-2, note 25+84 = C-9 area.
 *   We map directly: note field = symNote + 25.
 *
 * Tempo: BPM = floor(1.24 * min(rawTempo, 800)); default = 125 if no Tempo chunk.
 * Speed: from SetSpeed events in patterns; default = 6.
 *
 * Effects: this parser extracts note/instrument/volume only; effects are
 * approximated/dropped for display purposes (matches our other Amiga parsers).
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';

// ── Binary reader ─────────────────────────────────────────────────────────────

class Reader {
  public pos: number;
  private data: Uint8Array;
  private view: DataView;

  constructor(data: Uint8Array, offset = 0) {
    this.data = data;
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    this.pos = offset;
  }

  get length(): number { return this.data.length; }
  get remaining(): number { return this.data.length - this.pos; }
  canRead(n: number): boolean { return this.pos + n <= this.data.length; }

  u8(): number {
    if (this.pos >= this.data.length) throw new Error('EOF');
    return this.data[this.pos++];
  }

  s8(): number {
    const v = this.u8();
    return v >= 128 ? v - 256 : v;
  }

  u16be(): number {
    if (!this.canRead(2)) throw new Error('EOF');
    const v = this.view.getUint16(this.pos, false);
    this.pos += 2;
    return v;
  }

  s16be(): number {
    if (!this.canRead(2)) throw new Error('EOF');
    const v = this.view.getInt16(this.pos, false);
    this.pos += 2;
    return v;
  }

  u32be(): number {
    if (!this.canRead(4)) throw new Error('EOF');
    const v = this.view.getUint32(this.pos, false);
    this.pos += 4;
    return v;
  }

  s32be(): number {
    if (!this.canRead(4)) throw new Error('EOF');
    const v = this.view.getInt32(this.pos, false);
    this.pos += 4;
    return v;
  }

  bytes(n: number): Uint8Array {
    if (!this.canRead(n)) throw new Error('EOF');
    const slice = this.data.slice(this.pos, this.pos + n);
    this.pos += n;
    return slice;
  }

  skip(n: number): void {
    this.pos = Math.min(this.pos + n, this.data.length);
  }

  readMagic(magic: string): boolean {
    if (!this.canRead(magic.length)) return false;
    for (let i = 0; i < magic.length; i++) {
      if (this.data[this.pos + i] !== magic.charCodeAt(i)) return false;
    }
    this.pos += magic.length;
    return true;
  }

  peekMagic(magic: string): boolean {
    if (!this.canRead(magic.length)) return false;
    for (let i = 0; i < magic.length; i++) {
      if (this.data[this.pos + i] !== magic.charCodeAt(i)) return false;
    }
    return true;
  }
}

// ── RLE / Packed block decoder ────────────────────────────────────────────────

/**
 * Read a Symphonie packed block:
 *   uint32BE packedLength, then:
 *   - If "PACK\xFF\xFF" magic: RLE decompress
 *   - Otherwise: raw bytes
 *
 * Mirrors DecodeSymChunk() in Load_symmod.cpp.
 */
function decodeSymChunk(r: Reader): Uint8Array {
  if (!r.canRead(4)) return new Uint8Array(0);
  const packedLength = r.u32be();
  if (packedLength === 0 || !r.canRead(packedLength)) {
    r.skip(r.remaining);
    return new Uint8Array(0);
  }

  const chunkStart = r.pos;
  const chunkEnd   = chunkStart + packedLength;

  // Check for PACK\xFF\xFF header (RLE compressed)
  if (packedLength >= 10 && r.peekMagic('PACK')) {
    r.skip(4); // "PACK"
    if (r.u8() !== 0xFF || r.u8() !== 0xFF) {
      // Not the right magic; treat as raw
      r.pos = chunkStart;
      const raw = r.bytes(packedLength);
      return raw;
    }

    const unpackedLength = r.u32be();
    // Sanity cap: max 170× compression ratio per OpenMPT comment
    const maxLength = Math.min(unpackedLength, packedLength * 170);
    const data = new Uint8Array(maxLength);
    let offset = 0;
    let remain = maxLength;
    let done = false;

    while (!done && r.pos < chunkEnd && remain > 0) {
      const type = r.s8();

      switch (type) {
        case 0: {
          // Copy raw bytes
          if (!r.canRead(1)) { done = true; break; }
          const len = r.u8();
          if (remain < len || !r.canRead(len)) { done = true; break; }
          for (let i = 0; i < len; i++) {
            data[offset++] = r.u8();
          }
          remain -= len;
          break;
        }
        case 1: {
          // Repeat a dword N times
          if (!r.canRead(1)) { done = true; break; }
          const len = r.u8();
          if (remain < len * 4 || !r.canRead(4)) { done = true; break; }
          const b0 = r.u8(), b1 = r.u8(), b2 = r.u8(), b3 = r.u8();
          for (let i = 0; i < len && remain >= 4; i++) {
            data[offset++] = b0; data[offset++] = b1;
            data[offset++] = b2; data[offset++] = b3;
            remain -= 4;
          }
          break;
        }
        case 2: {
          // Write a dword twice
          if (remain < 8 || !r.canRead(4)) { done = true; break; }
          const b0 = r.u8(), b1 = r.u8(), b2 = r.u8(), b3 = r.u8();
          data[offset++] = b0; data[offset++] = b1;
          data[offset++] = b2; data[offset++] = b3;
          data[offset++] = b0; data[offset++] = b1;
          data[offset++] = b2; data[offset++] = b3;
          remain -= 8;
          break;
        }
        case 3: {
          // Write N zero bytes (array already zero-initialized)
          if (!r.canRead(1)) { done = true; break; }
          const len = r.u8();
          if (remain < len) { done = true; break; }
          offset += len;
          remain -= len;
          break;
        }
        case -1:
          done = true;
          break;
        default:
          done = true;
          break;
      }
    }

    r.pos = chunkEnd;

    // Validate: all bytes must have been consumed (remain === 0)
    if (remain > 0) return new Uint8Array(0);
    return data;
  } else {
    // Uncompressed: raw bytes
    const raw = r.bytes(packedLength);
    return raw;
  }
}

/**
 * Decode a packed array of structs of size `structSize`.
 * Returns a flat Uint8Array of all struct bytes.
 */
function decodeSymArray(r: Reader): Uint8Array {
  return decodeSymChunk(r);
}

// ── Instrument name reader ────────────────────────────────────────────────────

function readAmigaString(data: Uint8Array, offset: number, maxLen: number): string {
  let s = '';
  for (let i = 0; i < maxLen; i++) {
    const c = data[offset + i];
    if (c === 0) break;
    // Amiga_no_C1: keep ASCII printable, replace control chars with space
    s += (c >= 0x20 && c < 0x80) ? String.fromCharCode(c) : (c >= 0xA0 ? String.fromCharCode(c) : ' ');
  }
  return s.trimEnd();
}

// ── Format structures ─────────────────────────────────────────────────────────

interface SymEvent {
  command: number;  // uint8
  note:    number;  // int8
  param:   number;  // uint8
  inst:    number;  // uint8
}

function readSymEvents(data: Uint8Array): SymEvent[] {
  const count = Math.floor(data.length / 4);
  const events: SymEvent[] = [];
  for (let i = 0; i < count; i++) {
    const base = i * 4;
    const command = data[base];
    const note = data[base + 1] >= 128 ? data[base + 1] - 256 : data[base + 1];
    events.push({
      command,
      note,
      param: data[base + 2],
      inst:  data[base + 3],
    });
  }
  return events;
}

interface SymSequence {
  start:     number;  // uint16BE
  length:    number;  // uint16BE
  loop:      number;  // uint16BE (unused for our purposes)
  info:      number;  // int16BE  (-1=end, 1=skip)
  transpose: number;  // int16BE
}

function readSymSequences(data: Uint8Array): SymSequence[] {
  const count = Math.floor(data.length / 16);
  const seqs: SymSequence[] = [];
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let i = 0; i < count; i++) {
    const base = i * 16;
    seqs.push({
      start:     view.getUint16(base,     false),
      length:    view.getUint16(base + 2, false),
      loop:      view.getUint16(base + 4, false),
      info:      view.getInt16 (base + 6, false),
      transpose: view.getInt16 (base + 8, false),
    });
  }
  return seqs;
}

interface SymPosition {
  loopNum:   number;  // uint16BE — how many times to repeat this position
  pattern:   number;  // uint16BE — which raw pattern block
  start:     number;  // uint16BE — row start within the raw pattern
  length:    number;  // uint16BE — number of rows
  speed:     number;  // uint16BE — pattern speed (ticks/row)
  transpose: number;  // int16BE  — note transpose
}

function readSymPositions(data: Uint8Array): SymPosition[] {
  const count = Math.floor(data.length / 32);
  const positions: SymPosition[] = [];
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let i = 0; i < count; i++) {
    const base = i * 32;
    positions.push({
      loopNum:   view.getUint16(base + 4,  false),
      pattern:   view.getUint16(base + 8,  false),
      start:     view.getUint16(base + 10, false),
      length:    view.getUint16(base + 12, false),
      speed:     view.getUint16(base + 14, false),
      transpose: view.getInt16 (base + 16, false),
    });
  }
  return positions;
}

interface SymInstrumentRaw {
  nameOrHeader: Uint8Array; // 128 bytes
  type:         number;     // int8  (Silent=-8, Kill=-4, Normal=0, Loop=4, Sustain=8)
  volume:       number;     // uint8 (0-199; default 100)
  channel:      number;     // uint8 (Mono=0, StereoL=1, StereoR=2, LineSrc=3)
  instFlags:    number;     // uint8 (NoTranspose=1, NoDSP=2, SyncPlay=4)
  transpose:    number;     // int8
  name:         string;
}

// SymInstrument is 256 bytes:
//   Offset   0-127:  name[128] (or virtual/transwave header — first 4 bytes = "ViRT" if virtual)
//   Offset 128:      type (int8)
//   Offset 129:      loopStartHigh (uint8)
//   Offset 130:      loopLenHigh (uint8)
//   Offset 131:      numRepetitions (uint8)
//   Offset 132:      channel (uint8)
//   Offset 133:      dummy1
//   Offset 134:      volume (uint8, 0-199)
//   Offset 135-137:  dummy2[3]
//   Offset 138:      finetune (int8)
//   Offset 139:      transpose (int8)
//   Offset 140:      sampleFlags (uint8)
//   Offset 141:      filter (int8)
//   Offset 142:      instFlags (uint8)
//   Offset 143:      downsample (uint8)
//   ... rest of 256 bytes = filter/fade/padding

function readSymInstruments(data: Uint8Array): SymInstrumentRaw[] {
  const INST_SIZE = 256;
  const count = Math.floor(data.length / INST_SIZE);
  const insts: SymInstrumentRaw[] = [];
  for (let i = 0; i < count; i++) {
    const base = i * INST_SIZE;
    const nameOrHeader = data.slice(base, base + 128);
    const type    = data[base + 128] >= 128 ? data[base + 128] - 256 : data[base + 128];
    const volume  = data[base + 134];
    const channel = data[base + 132];
    const instFlags = data[base + 142];
    const transpose = data[base + 139] >= 128 ? data[base + 139] - 256 : data[base + 139];

    // Check if this is a virtual instrument (first 4 bytes = "ViRT")
    const isVirt = nameOrHeader[0] === 0x56 && nameOrHeader[1] === 0x69
                && nameOrHeader[2] === 0x52 && nameOrHeader[3] === 0x54;
    const name = isVirt ? 'Virtual' : readAmigaString(nameOrHeader, 0, 128);

    insts.push({ nameOrHeader, type, volume, channel, instFlags, transpose, name });
  }
  return insts;
}

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Returns true if the buffer starts with the SymMOD file header:
 *   magic "SymM" + version 1 + firstChunkID -1 + numChannels 1-256
 *
 * Mirrors SymFileHeader::Validate() in Load_symmod.cpp.
 */
export function isSymphonieProFormat(bytes: Uint8Array): boolean {
  if (bytes.length < 16) return false;
  // magic "SymM"
  if (bytes[0] !== 0x53 || bytes[1] !== 0x79 || bytes[2] !== 0x6D || bytes[3] !== 0x4D) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // version must be 1
  if (view.getUint32(4, false) !== 1) return false;
  // firstChunkID must be -1
  if (view.getInt32(8, false) !== -1) return false;
  // numChannels 1-256
  const numChannels = view.getUint32(12, false);
  if (numChannels < 1 || numChannels > 256) return false;
  return true;
}

// ── Main parser ───────────────────────────────────────────────────────────────

// SymEvent::Command enum values
const CMD_KEYON         =  0;
const CMD_VOLSLIDE_UP   =  1;
const CMD_VOLSLIDE_DOWN =  2;
const CMD_PITCH_UP      =  3;
const CMD_PITCH_DOWN    =  4;
const CMD_REPLAY_FROM   =  5;
const CMD_FROM_AND_PITCH=  6;
const _CMD_SET_FROM_ADD  =  7;
const _CMD_FROM_ADD      =  8;
const CMD_SET_SPEED     =  9;
const _CMD_ADD_PITCH     = 10;
const _CMD_ADD_VOLUME    = 11;
const CMD_TREMOLO       = 12;
const CMD_VIBRATO       = 13;
const _CMD_SAMPLE_VIB    = 14;
const _CMD_PITCH_SLIDE_TO= 15;
const CMD_RETRIG        = 16;
const _CMD_EMPHASIS      = 17;
const CMD_ADD_HALFTONE  = 18;
const _CMD_CV            = 19;
const _CMD_CVADD         = 20;
const _CMD_FILTER        = 23;
const _CMD_DSP_ECHO      = 24;
const _CMD_DSP_DELAY     = 25;

// SymEvent::Volume enum (special param values > 200)
const VOL_COMMAND   = 200;
const VOL_STOP      = 254;
const _VOL_CONT      = 253;
const VOL_KEYOFF    = 251;
const VOL_SPEEDDOWN = 250;
const VOL_SPEEDUP   = 249;
const VOL_SETPITCH  = 248;

/**
 * Parse a Symphonie Pro (.symmod) file into a TrackerSong.
 * Returns null on any validation failure (never throws).
 */
export function parseSymphonieProFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  try {
    return _parseSymphonieProFile(bytes, filename);
  } catch {
    return null;
  }
}

function _parseSymphonieProFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  if (!isSymphonieProFormat(bytes)) return null;

  const r = new Reader(bytes);

  // ── Header ────────────────────────────────────────────────────────────────
  r.skip(4); // "SymM"
  r.skip(4); // version = 1
  r.skip(4); // firstChunkID = -1 (NumChannels)
  const numChannels = Math.min(r.u32be(), 256);

  // ── Chunk loop ────────────────────────────────────────────────────────────

  // Chunk type constants (int32BE)
  const CHUNK_NUM_CHANNELS     = -1;
  const CHUNK_TRACK_LENGTH     = -2;
  const CHUNK_PATTERN_SIZE     = -3;
  const CHUNK_NUM_INSTRUMENTS  = -4;
  const CHUNK_EVENT_SIZE       = -5;
  const CHUNK_TEMPO            = -6;
  const CHUNK_EXTERNAL_SAMPLES = -7;
  const CHUNK_POSITION_LIST    = -10;
  const CHUNK_SAMPLE_FILE      = -11;
  const CHUNK_EMPTY_SAMPLE     = -12;
  const CHUNK_PATTERN_EVENTS   = -13;
  const CHUNK_INSTRUMENT_LIST  = -14;
  const CHUNK_SEQUENCES        = -15;
  const CHUNK_INFO_TEXT        = -16;
  const CHUNK_SAMPLE_PACKED    = -17;
  const CHUNK_SAMPLE_PACKED16  = -18;
  const CHUNK_INFO_TYPE        = -19;
  const CHUNK_INFO_BINARY      = -20;
  const CHUNK_INFO_STRING      = -21;
  const CHUNK_SAMPLE_BOOST     = 10;
  const CHUNK_STEREO_DETUNE    = 11;
  const CHUNK_STEREO_PHASE     = 12;

  let trackLen       = 0;
  let initialBPM     = 125;  // default; Tempo chunk will override
  let initialSpeed   = 6;    // default; will be read from pattern SetSpeed events
  let positionsData  = new Uint8Array(0);
  let sequencesData  = new Uint8Array(0);
  let patternData    = new Uint8Array(0);
  let instrumentData = new Uint8Array(0);
  let infoText       = '';

  while (r.canRead(4)) {
    const chunkType = r.s32be();

    switch (chunkType) {
      case CHUNK_NUM_CHANNELS:
        r.skip(4); // already handled
        break;

      case CHUNK_TRACK_LENGTH: {
        const tl = r.u32be();
        if (tl > 1024) return null;
        trackLen = tl;
        break;
      }

      case CHUNK_EVENT_SIZE: {
        const es = r.u32be() & 0xFFFF;
        if (es !== 4) return null;
        break;
      }

      case CHUNK_TEMPO: {
        const rawTempo = r.u32be();
        const clamped  = Math.min(rawTempo, 800);
        initialBPM     = Math.floor(1.24 * clamped);
        if (initialBPM < 32) initialBPM = 32;
        if (initialBPM > 999) initialBPM = 999;
        break;
      }

      case CHUNK_PATTERN_SIZE:
      case CHUNK_NUM_INSTRUMENTS:
        r.skip(4);
        break;

      case CHUNK_SAMPLE_BOOST:
      case CHUNK_STEREO_DETUNE:
      case CHUNK_STEREO_PHASE:
        r.skip(4); // marks Pro variant; we don't need the value for pattern parsing
        break;

      case CHUNK_EXTERNAL_SAMPLES:
        r.skip(4);
        break;

      case CHUNK_POSITION_LIST:
        if (positionsData.length === 0) {
          positionsData = new Uint8Array(decodeSymArray(r));
        } else {
          // Skip
          if (r.canRead(4)) { const l = r.u32be(); r.skip(l); }
        }
        break;

      case CHUNK_SAMPLE_FILE:
      case CHUNK_SAMPLE_PACKED:
      case CHUNK_SAMPLE_PACKED16:
        // Skip sample data — we don't do playback, just pattern visualization
        if (r.canRead(4)) { const l = r.u32be(); r.skip(l); }
        break;

      case CHUNK_EMPTY_SAMPLE:
        // No data; just marks an empty sample slot
        break;

      case CHUNK_PATTERN_EVENTS:
        if (patternData.length === 0) {
          patternData = new Uint8Array(decodeSymArray(r));
        } else {
          if (r.canRead(4)) { const l = r.u32be(); r.skip(l); }
        }
        break;

      case CHUNK_INSTRUMENT_LIST:
        if (instrumentData.length === 0) {
          instrumentData = new Uint8Array(decodeSymArray(r));
        } else {
          if (r.canRead(4)) { const l = r.u32be(); r.skip(l); }
        }
        break;

      case CHUNK_SEQUENCES:
        if (sequencesData.length === 0) {
          sequencesData = new Uint8Array(decodeSymArray(r));
        } else {
          if (r.canRead(4)) { const l = r.u32be(); r.skip(l); }
        }
        break;

      case CHUNK_INFO_TEXT: {
        const textData = decodeSymChunk(r);
        if (textData.length > 0) {
          // Use first line as song name
          let end = 0;
          while (end < textData.length && textData[end] !== 0x0A && textData[end] !== 0x0D && textData[end] !== 0) {
            end++;
          }
          infoText = readAmigaString(textData, 0, end);
        }
        break;
      }

      case CHUNK_INFO_TYPE:
      case CHUNK_INFO_BINARY:
      case CHUNK_INFO_STRING:
        if (r.canRead(4)) { const l = r.u32be(); r.skip(l); }
        break;

      default:
        // Unknown chunk — stop reading (matches OpenMPT behaviour of setting unknownHunks flag)
        // But we do NOT return null here since some files have garbage at the end (Natsh1.SymMOD)
        break;
    }
  }

  // ── Validation ────────────────────────────────────────────────────────────
  if (trackLen === 0 || instrumentData.length === 0) return null;
  if (positionsData.length === 0 || patternData.length === 0 || sequencesData.length === 0) return null;

  // ── Parse structs ─────────────────────────────────────────────────────────
  const symInstruments = readSymInstruments(instrumentData);
  const symEvents      = readSymEvents(patternData);
  const symSequences   = readSymSequences(sequencesData);
  const symPositions   = readSymPositions(positionsData);

  const numInstruments = Math.min(symInstruments.length, 255);
  const patternSize    = numChannels * trackLen;
  const numRawPatterns = patternSize > 0 ? Math.floor(symEvents.length / patternSize) : 0;

  // ── Build InstrumentConfig list ───────────────────────────────────────────
  const instruments: InstrumentConfig[] = [];

  for (let i = 0; i < numInstruments; i++) {
    const si = symInstruments[i];
    const id  = i + 1;

    // Check for empty instrument: first byte of name/header is 0, or type < 0
    const isEmpty = si.nameOrHeader[0] === 0 || si.type < 0;

    instruments.push({
      id,
      name: (isEmpty ? `(empty)` : (si.name || `Instrument ${id}`)),
      type:      'sample' as const,
      synthType: 'Sampler' as const,
      effects:   [],
      volume:    0,
      pan:       0,
    } as unknown as InstrumentConfig);
  }

  // ── Build patterns ────────────────────────────────────────────────────────
  // Mirrors OpenMPT's sequence/position → pattern conversion.
  // In Symphonie, sequences list positions; positions reference raw pattern blocks.
  // We convert each unique (pattern+start+length+transpose+speed) to a TrackerSong pattern.
  // Multiple order entries pointing to the same raw pattern data → same TrackerSong pattern index.

  // Key: "pattern-start-length-transpose-speed"
  const patternMap = new Map<string, number>();
  const patterns: Pattern[] = [];
  const sequence: number[]  = [];

  // First pass: collect the first seen speed in patterns for initialSpeed
  let foundSpeed = false;

  for (const seq of symSequences) {
    if (seq.info === 1) continue;    // skip
    if (seq.info === -1) break;      // end of sequences

    if (seq.start >= symPositions.length
      || seq.length === 0
      || seq.length > symPositions.length
      || symPositions.length - seq.length < seq.start) {
      continue;
    }

    // Insert a separator in sequence for multi-sequence songs (skip if first)
    // OpenMPT uses PATTERNINDEX_SKIP; we simply don't do separators here.

    for (let pi = seq.start; pi < seq.start + seq.length; pi++) {
      const pos = symPositions[pi];
      if (!pos) continue;

      const effectiveTranspose = pos.transpose + seq.transpose;
      const key = `${pos.pattern}-${pos.start}-${pos.length}-${effectiveTranspose}-${pos.speed}`;

      if (!patternMap.has(key)) {
        const patIdx = patterns.length;
        patternMap.set(key, patIdx);

        // Build the pattern
        const numRows   = pos.length;
        const rowStart  = pos.start;
        const patSpeed  = pos.speed > 0 ? pos.speed : 6;

        if (!foundSpeed) {
          initialSpeed = patSpeed;
          foundSpeed = true;
        }

        const channels: ChannelData[] = [];

        for (let ch = 0; ch < numChannels; ch++) {
          const rows: TrackerCell[] = [];

          for (let row = 0; row < numRows; row++) {
            const cell: TrackerCell = {
              note: 0, instrument: 0, volume: 0,
              effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
            };

            // Get event from raw pattern data
            const srcRow = rowStart + row;
            const eventIdx = pos.pattern * patternSize + srcRow * numChannels + ch;

            if (eventIdx >= 0 && eventIdx < symEvents.length) {
              const ev = symEvents[eventIdx];
              _convertEvent(ev, cell, effectiveTranspose, numInstruments);
            }

            // Speed command on row 0 of channel 0
            if (row === 0 && ch === 0) {
              cell.effTyp = 0x0F; // Fxx
              cell.eff    = patSpeed;
            }

            rows.push(cell);
          }

          // Panning: odd channels → right (+50), even → left (-50)
          // (OpenMPT: ChnSettings[chn].nPan = (chn & 1) ? 256 : 0)
          const pan = (ch & 1) ? 50 : -50;

          channels.push({
            id:           `channel-${ch}`,
            name:         `Channel ${ch + 1}`,
            muted:        false,
            solo:         false,
            collapsed:    false,
            volume:       100,
            pan,
            instrumentId: null,
            color:        null,
            rows,
          });
        }

        patterns.push({
          id:      `pattern-${patIdx}`,
          name:    `Pattern ${patIdx}`,
          length:  numRows,
          channels,
          importMetadata: {
            sourceFormat:            'Symphonie',
            sourceFile:              filename,
            importedAt:              new Date().toISOString(),
            originalChannelCount:    numChannels,
            originalPatternCount:    numRawPatterns,
            originalInstrumentCount: numInstruments,
          },
        });
      }

      const patIdx = patternMap.get(key)!;
      const loopCount = Math.max(pos.loopNum, 1);
      for (let lp = 0; lp < loopCount; lp++) {
        sequence.push(patIdx);
      }
    }
  }

  // Fallback: at least one empty pattern
  if (patterns.length === 0) {
    const emptyRows: TrackerCell[] = Array.from({ length: 64 }, (): TrackerCell => ({
      note: 0, instrument: 0, volume: 0,
      effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
    }));
    const emptyChannels: ChannelData[] = Array.from({ length: numChannels }, (_, ch) => ({
      id:           `channel-${ch}`,
      name:         `Channel ${ch + 1}`,
      muted:        false,
      solo:         false,
      collapsed:    false,
      volume:       100,
      pan:          (ch & 1) ? 50 : -50,
      instrumentId: null,
      color:        null,
      rows:         emptyRows,
    }));
    patterns.push({
      id:      'pattern-0',
      name:    'Pattern 0',
      length:  64,
      channels: emptyChannels,
      importMetadata: {
        sourceFormat:            'Symphonie',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    numChannels,
        originalPatternCount:    0,
        originalInstrumentCount: numInstruments,
      },
    });
    sequence.push(0);
  }

  // ── Song name ─────────────────────────────────────────────────────────────
  const baseName = filename.replace(/\.[^/.]+$/, '');
  const songName = infoText.trim() || baseName;

  return {
    name:            songName,
    format:          'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions:   sequence,
    songLength:      sequence.length,
    restartPosition: 0,
    numChannels,
    initialSpeed,
    initialBPM,
    linearPeriods:   false,
  };
}

/**
 * Convert a SymEvent to a TrackerCell note/instrument/volume entry.
 * We extract note and instrument from KeyOn events only.
 * Effect conversion is deliberately minimal — just volume and note.
 */
function _convertEvent(
  ev: SymEvent,
  cell: TrackerCell,
  transpose: number,
  numInstruments: number,
): void {
  switch (ev.command) {
    case CMD_KEYON: {
      if (ev.param > VOL_COMMAND) {
        // Special param codes
        switch (ev.param) {
          case VOL_STOP:
            // Note cut
            break;
          case VOL_KEYOFF:
            // Key-off — no direct equivalent in our simple cell format
            break;
          case VOL_SPEEDDOWN:
          case VOL_SPEEDUP:
            // Global speed events — ignore for display
            break;
          case VOL_SETPITCH:
            // Pitch set command — carry note without instrument change
            if (ev.note >= 0 && ev.note <= 84) {
              const n = clampNote(ev.note + 25 + transpose);
              if (n > 0) cell.note = n;
            }
            break;
          default:
            break;
        }
      } else {
        // Normal key-on: note + optional instrument + optional volume
        if (ev.note >= 0 && ev.note <= 84) {
          const n = clampNote(ev.note + 25 + transpose);
          if (n > 0) cell.note = n;
        }

        if (ev.inst > 0 && ev.inst < numInstruments) {
          cell.instrument = ev.inst + 1; // 1-based
        }

        if (ev.param > 0 && ev.param <= 100) {
          // Volume 1-100 → scale to 0-64 range (OpenMPT: param * 0.64)
          const vol = Math.round(ev.param * 0.64);
          cell.volume = Math.min(vol, 64);
        }
      }
      break;
    }

    case CMD_SET_SPEED:
      // This is a global speed change — we handle it at the pattern level,
      // so just record as Fxx effect here for display
      cell.effTyp = 0x0F;
      cell.eff    = ev.param > 0 ? ev.param : 4;
      break;

    case CMD_VOLSLIDE_UP:
      cell.effTyp = 0x0A; // Axx (volume slide up)
      cell.eff    = Math.min(ev.param, 0x0F) << 4;
      break;

    case CMD_VOLSLIDE_DOWN:
      cell.effTyp = 0x0A;
      cell.eff    = Math.min(ev.param, 0x0F);
      break;

    case CMD_PITCH_UP:
      cell.effTyp = 0x01; // 1xx (portamento up)
      cell.eff    = Math.min(ev.param, 0xFF);
      break;

    case CMD_PITCH_DOWN:
      cell.effTyp = 0x02; // 2xx (portamento down)
      cell.eff    = Math.min(ev.param, 0xFF);
      break;

    case CMD_VIBRATO:
      cell.effTyp = 0x04; // 4xx
      cell.eff    = (Math.min(ev.inst >> 3, 15) << 4) | Math.min(ev.param, 15);
      break;

    case CMD_TREMOLO:
      cell.effTyp = 0x07; // 7xx
      cell.eff    = (Math.min(ev.inst >> 3, 15) << 4) | Math.min(ev.param >> 3, 15);
      break;

    case CMD_RETRIG:
      cell.effTyp = 0x1B; // Qxx (retrigger)
      cell.eff    = Math.min(ev.inst + 1, 15);
      break;

    case CMD_ADD_HALFTONE:
      // Portamento by half-tones — map as note slide
      if (ev.note >= 0 && ev.note <= 84) {
        const n = clampNote(ev.note + 25 + transpose);
        if (n > 0) {
          cell.note   = n;
          cell.effTyp = 0x03; // 3xx (tone portamento)
          cell.eff    = 0;
        }
      }
      break;

    case CMD_REPLAY_FROM:
    case CMD_FROM_AND_PITCH:
      // Sample offset — note is preserved from last state (we don't track that here)
      cell.effTyp = 0x09; // 9xx (sample offset)
      cell.eff    = Math.min(ev.param, 0xFF);
      break;

    default:
      // All other effects (CV, Filter, DSP, etc.) — skip for display
      break;
  }
}

/** Clamp note to valid range (1-119 in XM convention, 0 = no note). */
function clampNote(n: number): number {
  if (n < 1) return 0;
  if (n > 119) return 119;
  return n;
}
