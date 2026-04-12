/**
 * SymphonieProParser.ts — Symphonie / Symphonie Pro (.symmod) native parser
 *
 * Symphonie was an Amiga tracker with an interesting chunk-based format.
 * Symphonie Pro is an enhanced version with additional stereo/sample-boost features.
 * Files are identified by the 4-byte magic "SymM" at offset 0.
 *
 * Reference: third-party/openmpt-master/soundlib/Load_symmod.cpp (authoritative)
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
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig, UADEChipRamInfo, SynthType } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { arrayBufferToBase64 } from '@/lib/import/InstrumentConverter';
import { encodeSymphonieProCell } from '@/engine/uade/encoders/SymphonieProEncoder';
import type {
  SymphoniePlaybackData,
  SymphonieInstrumentData,
  SymphoniePattern,
  SymphoniePatternEvent,
  SymphonieDSPEvent,
} from '@/engine/symphonie/SymphoniePlaybackData';

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
    // Strip Amiga device/path prefix (e.g. "HD3:Samples/Sample7" → "Sample7")
    const rawName = isVirt ? 'Virtual' : readAmigaString(nameOrHeader, 0, 128);
    const slashIdx = rawName.lastIndexOf('/');
    const colonIdx = rawName.lastIndexOf(':');
    const stripIdx = Math.max(slashIdx, colonIdx);
    const name = stripIdx >= 0 ? rawName.substring(stripIdx + 1) : rawName;

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
const CMD_SET_SPEED     =  9;
const CMD_TREMOLO       = 12;
const CMD_VIBRATO       = 13;
const CMD_RETRIG        = 16;
const CMD_ADD_HALFTONE  = 18;
const CMD_DSP_ECHO      = 24;
const CMD_DSP_DELAY     = 25; // dropped by OpenMPT (not implemented) but present in files

// SymEvent::Volume enum (special param values > 200)
const VOL_COMMAND   = 200;
const VOL_STOP      = 254;
const VOL_KEYOFF    = 251;
const VOL_SPEEDDOWN = 250;
const VOL_SPEEDUP   = 249;
const VOL_SETPITCH  = 248;

/**
 * Parse a Symphonie Pro (.symmod) file into a TrackerSong.
 * Returns null on any validation failure (never throws).
 *
 * Also calls parseSymphonieForPlayback() to attach SymphoniePlaybackData to
 * the first instrument so InstrumentFactory can instantiate SymphonieSynth.
 */
/** Convert Float32Array PCM to a minimal mono WAV ArrayBuffer */
function float32ToWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const numSamples = samples.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);       // chunk size
  view.setUint16(20, 1, true);        // PCM
  view.setUint16(22, 1, true);        // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true);        // block align
  view.setUint16(34, 16, true);       // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return buffer;
}

export async function parseSymphonieProFile(
  bytes: Uint8Array,
  filename: string,
): Promise<TrackerSong | null> {
  try {
    const song = _parseSymphonieProFile(bytes, filename);
    if (!song) return null;

    // Store original file data for export
    song.symphonieFileData = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

    // Use libopenmpt for audio playback (it handles Symphonie Pro correctly,
    // including CMD_REPLAY_FROM). The native parser provides pattern display.
    song.libopenmptFileData = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

    // Populate instruments with decoded PCM sample data for the sample editor.
    // Audio playback is handled by libopenmpt, not individual synth instances.
    try {
      const playbackData = await parseSymphonieForPlayback(bytes.buffer as ArrayBuffer, filename);

      for (let i = 0; i < playbackData.instruments.length && i < song.instruments.length; i++) {
        const si = playbackData.instruments[i];
        const inst = song.instruments[i] as unknown as Record<string, unknown>;
        if (si.samples && si.samples.length > 0) {
          const sampleRate = si.sampledFrequency > 0 ? si.sampledFrequency : 8363;
          const wavBuffer = float32ToWav(si.samples, sampleRate);
          const dataUrl = `data:audio/wav;base64,${arrayBufferToBase64(wavBuffer)}`;
          const loopEnabled = si.type === 4 || si.type === 8;
          const loopStart = Math.floor((si.loopStart / (100 * 65536)) * si.samples.length);
          const loopEnd = Math.floor(((si.loopStart + si.loopLen) / (100 * 65536)) * si.samples.length);

          inst['name'] = si.name || `Instrument ${i + 1}`;
          inst['volume'] = si.volume > 0 ? -12 + (si.volume / 100) * 12 : -60;
          inst['sample'] = {
            audioBuffer: wavBuffer,
            url: dataUrl,
            sampleRate,
            baseNote: 'C4',
            detune: 0,
            loop: loopEnabled,
            loopType: loopEnabled ? 'forward' : 'off',
            loopStart,
            loopEnd,
            reverse: false,
            playbackRate: 1.0,
          };
          inst['parameters'] = {
            sampleUrl: dataUrl,
          };
        }

        // Populate per-instrument SymphonieConfig for the synth editor UI
        inst['symphonie'] = {
          type: si.type,
          volume: si.volume,
          tune: si.tune,
          fineTune: si.fineTune,
          noDsp: si.noDsp,
          multiChannel: si.multiChannel,
          loopStart: si.loopStart,
          loopLen: si.loopLen,
          numLoops: si.numLoops,
          newLoopSystem: si.newLoopSystem,
          sampledFrequency: si.sampledFrequency,
        };
      }
    } catch (err) {
      console.warn('[SymphonieProParser] parseSymphonieForPlayback failed (sample editor data unavailable):', err);
    }

    // Set synthType to SymphonieSynth so the editor routes to SymphonieControls.
    // Audio playback is still handled by libopenmpt via libopenmptFileData.
    for (let i = 0; i < song.instruments.length; i++) {
      (song.instruments[i] as unknown as Record<string, unknown>)['synthType'] = 'SymphonieSynth';
    }

    return song;
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
  let instrumentChunkFileOffset = 0;  // file offset of INSTRUMENT_LIST chunk payload start
  let patternEventsFileOffset = 0;   // file offset of decoded PATTERN_EVENTS data (for layout)
  let displaySampleCount = 0;  // count sample chunks to trim trailing empty instruments

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
        displaySampleCount++;
        break;

      case CHUNK_EMPTY_SAMPLE:
        // No data; just marks an empty sample slot
        displaySampleCount++;
        break;

      case CHUNK_PATTERN_EVENTS:
        if (patternData.length === 0) {
          patternEventsFileOffset = r.pos;  // record before data is consumed
          patternData = new Uint8Array(decodeSymArray(r));
        } else {
          if (r.canRead(4)) { const l = r.u32be(); r.skip(l); }
        }
        break;

      case CHUNK_INSTRUMENT_LIST:
        if (instrumentData.length === 0) {
          instrumentChunkFileOffset = r.pos;  // record before length+data are consumed
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
  // Emit one entry per Symphonie instrument so TrackerReplayer can find each
  // instrument by its 1-based ID. parseSymphonieProFile will attach the full
  // SymphoniePlaybackData (and set synthType = 'SymphonieSynth') to index 0.
  const songTitle = infoText || filename.replace(/\.symmod$/i, '');
  const SYMMOD_INST_SIZE = 256;
  // Trim to real instrument count: max of sample chunk count and last named instrument
  let realCount = displaySampleCount;
  for (let i = symInstruments.length - 1; i >= realCount; i--) {
    if (symInstruments[i].name) { realCount = i + 1; break; }
  }
  // Cap at 128 instruments — InstrumentStore clamps IDs to 1-128 range
  const cappedInstruments = symInstruments.slice(0, Math.min(realCount, 128));
  const instruments: InstrumentConfig[] = cappedInstruments.length > 0
    ? cappedInstruments.map((si, i) => ({
        id:        i + 1,
        name:      si.name || `Instrument ${i + 1}`,
        type:      'synth' as const,
        synthType: 'SymphonieSynth' as SynthType,
        effects:   [],
        volume:    si.volume ?? 0,
        pan:       0,
        uadeChipRam: {
          moduleBase: 0,
          moduleSize: bytes.length,
          instrBase:  instrumentChunkFileOffset + i * SYMMOD_INST_SIZE,
          instrSize:  SYMMOD_INST_SIZE,
        } as UADEChipRamInfo,
      } as unknown as InstrumentConfig))
    : [{
        id:        1,
        name:      songTitle,
        type:      'synth' as const,
        synthType: 'SymphonieSynth' as SynthType,
        effects:   [],
        volume:    0,
        pan:       0,
        uadeChipRam: {
          moduleBase: 0,
          moduleSize: bytes.length,
          instrBase:  instrumentChunkFileOffset,
          instrSize:  SYMMOD_INST_SIZE,
        } as UADEChipRamInfo,
      } as unknown as InstrumentConfig];

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

  // ── Build UADEPatternLayout for editing infrastructure ──────────────────
  // SymEvents are 4 bytes each, stored in a flat array: event[patternSize * rawPatIdx + row * numChannels + ch]
  // patternSize = numChannels * trackLen
  // The patterns in TrackerSong are built from positions/sequences with indirection,
  // so we use getCellFileOffset to map back to the raw event index.
  const uadePatternLayout: UADEPatternLayout = {
    formatId: 'symphoniePro',
    patternDataFileOffset: patternEventsFileOffset,
    bytesPerCell: 4,
    rowsPerPattern: trackLen,
    numChannels,
    numPatterns: patterns.length,
    moduleSize: bytes.length,
    encodeCell: encodeSymphonieProCell,
    decodeCell: (raw: Uint8Array): TrackerCell => {
      const cmd  = raw[0];
      const note = raw[1] >= 128 ? raw[1] - 256 : raw[1]; // signed int8
      const param = raw[2];
      const inst  = raw[3];

      const cell: TrackerCell = { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };

      switch (cmd) {
        case 0: // CMD_KEYON
          if (note >= 0 && note <= 84) {
            const n = note + 25;
            if (n >= 1 && n <= 119) cell.note = Math.min(96, n);
          }
          if (inst < 255) cell.instrument = inst + 1;
          if (param > 0 && param <= 100) cell.volume = Math.min(Math.round(param * 0.64), 64);
          break;
        case 9: // CMD_SET_SPEED
          cell.effTyp = 0x0F; cell.eff = param > 0 ? param : 4; break;
        case 1: // CMD_VOLSLIDE_UP
          cell.effTyp = 0x0A; cell.eff = (Math.min(param, 0x0F) << 4); break;
        case 2: // CMD_VOLSLIDE_DOWN
          cell.effTyp = 0x0A; cell.eff = Math.min(param, 0x0F); break;
        case 3: // CMD_PITCH_UP
          cell.effTyp = 0x01; cell.eff = param; break;
        case 4: // CMD_PITCH_DOWN
          cell.effTyp = 0x02; cell.eff = param; break;
        case 13: // CMD_VIBRATO
          cell.effTyp = 0x04; cell.eff = (Math.min(inst >> 3, 15) << 4) | Math.min(param, 15); break;
        case 12: // CMD_TREMOLO
          cell.effTyp = 0x07; cell.eff = (Math.min(inst >> 3, 15) << 4) | Math.min(param >> 3, 15); break;
        case 5: // CMD_REPLAY_FROM
          cell.effTyp = 0x09; cell.eff = param; break;
        case 18: // CMD_ADD_HALFTONE
          cell.effTyp = 0x03; break;
      }
      return cell;
    },
    getCellFileOffset(pattern: number, row: number, channel: number): number {
      // Look up which raw pattern block this TrackerSong pattern came from.
      // The pattern's importMetadata or the patternMap key encodes this.
      // Since patterns are built from symPositions, we need the position info.
      // We stored positions in the sequence; each unique key maps to a pattern.
      // For simplicity, compute from the raw event array using the pattern's
      // source data. The event index = rawPatIdx * patternSize + srcRow * numChannels + ch.
      // We can't easily reverse this without storing extra metadata per pattern.
      // Use a simple linear scan: pattern * patternSize + row * numChannels + ch * 4.
      // This works for patterns that map 1:1 to raw pattern blocks at row offset 0.
      return patternEventsFileOffset + (pattern * patternSize + row * numChannels + channel) * 4;
    },
  };

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
    uadePatternLayout,
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
        // Normal key-on: note + optional instrument + optional volume.
        // Instrument is only set when a note is present — matches OpenMPT
        // which only writes m.instr when event.note >= 0. Without this guard
        // every empty row (note=-1, inst=0) would show "--- 01 .." in the UI.
        if (ev.note >= 0 && ev.note <= 84) {
          const n = clampNote(ev.note + 25 + transpose);
          if (n > 0) {
            cell.note = n;
            if (ev.inst < numInstruments) {
              cell.instrument = ev.inst + 1; // 0-based file → 1-based TrackerCell
            }
          }
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

    case CMD_DSP_ECHO: {
      // DSP Echo: note=type(0-4), param=bufLen(0-127), inst=feedback(0-127)
      // Use same encoding as OpenMPTConverter DSP cells:
      //   effTyp=0x50 ('D') + bufLen, effTyp2=0x50+type ('C/E/L/X') + feedback
      const dspType = ev.note >= 0 && ev.note <= 4 ? ev.note : 0;
      cell.effTyp  = 0x50;
      cell.eff     = Math.min(ev.param, 0x7F);
      cell.effTyp2 = 0x50 + dspType;
      cell.eff2    = Math.min(ev.inst, 0x7F);
      break;
    }

    default:
      // All other effects (CV, Filter, etc.) — skip for display
      break;
  }
}

/** Clamp note to valid range (1-119 in XM convention, 0 = no note). */
function clampNote(n: number): number {
  if (n < 1) return 0;
  if (n > 119) return 119;
  return n;
}

// ── Delta / raw decode helpers (for parseSymphonieForPlayback) ────────────────

function _decodeDelta8(bytes: Uint8Array): Float32Array {
  const out = new Float32Array(bytes.length);
  let acc = 0;
  for (let i = 0; i < bytes.length; i++) {
    acc = (acc + bytes[i]) & 0xFF;
    out[i] = (acc < 128 ? acc : acc - 256) / 128.0;
  }
  return out;
}

function _decodeDelta16(bytes: Uint8Array): Float32Array {
  // ASM reference: Proc16ModBlk calls UnPackDelta16 in ≤4096-byte blocks.
  // UnPackDelta16 = UnpackD162 (delta-decode bytes) + PD16preUncode (interleave).
  //
  // CRITICAL: Delta16 chunks store the ENTIRE original sample FILE (WAV/IFF/AIFF),
  // not raw PCM. The Amiga save routine reads sample files from disk, splits 16-bit
  // words into LSB/MSB byte halves, then delta-encodes the byte stream.
  // On load: delta-unpack → reassemble words → reconstruct file → parse container.
  const BLOCK_BYTES = 4096;
  const totalBytes = bytes.length;

  // Reconstruct the original file bytes
  const fileBytes = new Uint8Array(totalBytes);
  let outIdx = 0;
  let srcOffset = 0;
  let remaining = totalBytes;

  while (remaining > 0) {
    const blockSize = Math.min(remaining, BLOCK_BYTES);
    const halfBlock = blockSize >> 1;

    // Step 1: Delta-decode blockSize bytes (first byte = seed)
    const decoded = new Uint8Array(blockSize);
    let acc = bytes[srcOffset];
    decoded[0] = acc;
    for (let i = 1; i < blockSize; i++) {
      acc = (acc + bytes[srcOffset + i]) & 0xFF;
      decoded[i] = acc;
    }

    // Step 2: Reassemble interleaved halves back into original file bytes.
    // First half = LSBs (odd bytes), second half = MSBs (even bytes) of 16-bit words.
    // Amiga big-endian: word in memory is [MSB, LSB], so file byte order is MSB first.
    for (let i = 0; i < halfBlock; i++) {
      const lsb = decoded[i];
      const msb = decoded[halfBlock + i];
      fileBytes[outIdx++] = msb;
      fileBytes[outIdx++] = lsb;
    }

    // Handle odd-length blocks (last byte has no pair)
    if (blockSize & 1) {
      fileBytes[outIdx++] = decoded[blockSize - 1];
    }

    srcOffset += blockSize;
    remaining -= blockSize;
  }

  const reconstructed = fileBytes.subarray(0, outIdx);

  // Step 3: Parse the reconstructed file through the container format parser.
  // _decodeRaw8 handles RIFF/WAV, IFF 8SVX, AIFF, MAESTRO, 16BT formats.
  if (reconstructed.length >= 4) {
    const magic4 = String.fromCharCode(reconstructed[0], reconstructed[1], reconstructed[2], reconstructed[3]);
    if (magic4 === 'RIFF' || magic4 === 'FORM' || magic4 === '16BT' ||
        (reconstructed.length >= 8 && magic4 === 'MAES')) {
      return _decodeRaw8(reconstructed);
    }
  }

  // No recognized container: treat as raw 16-bit big-endian signed PCM (Amiga native)
  return _decode16bitBE(reconstructed, 0, false);
}

/**
 * Extract PCM from a CHUNK_SAMPLE_FILE.
 * Matches OpenMPT detection order: IFF → WAV → AIFF → raw (MAESTRO/16BT/8-bit).
 * See Load_symmod.cpp:1158 and ReadRawSymSample().
 */
function _decodeRaw8(bytes: Uint8Array): Float32Array {
  if (bytes.length < 4) return _decodeRawFallback(bytes);

  const magic4 = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);

  // IFF containers: "FORM" + size + type
  if (magic4 === 'FORM' && bytes.length >= 12) {
    const formType = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (formType === '8SVX') return _decodeIFF8SVX(bytes);
    if (formType === 'AIFF') return _decodeAIFF(bytes);
  }
  // WAV: "RIFF"
  if (magic4 === 'RIFF') return _decodeWAV(bytes);

  // MAESTRO\0 → 16-bit big-endian signed, data at offset 24
  if (bytes.length >= 24 &&
      bytes[0] === 0x4D && bytes[1] === 0x41 && bytes[2] === 0x45 && bytes[3] === 0x53 &&
      bytes[4] === 0x54 && bytes[5] === 0x52 && bytes[6] === 0x4F && bytes[7] === 0x00) {
    const isStereo = (bytes[12] | bytes[13] | bytes[14] | bytes[15]) === 0;
    return _decode16bitBE(bytes, 24, isStereo);
  }

  // 16BT → 16-bit big-endian signed (first 4 bytes are anti-click nulls)
  if (magic4 === '16BT') {
    return _decode16bitBE(bytes, 0, false);
  }

  // Fallback: raw signed 8-bit PCM
  const out = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    out[i] = (b < 128 ? b : b - 256) / 128.0;
  }
  return out;
}

/** Decode 16-bit big-endian signed PCM starting at `offset`. */
function _decode16bitBE(bytes: Uint8Array, offset: number, stereo: boolean): Float32Array {
  const bytesPerFrame = stereo ? 4 : 2;
  const numSamples = Math.floor((bytes.length - offset) / bytesPerFrame);
  if (stereo) {
    const out = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      const p = offset + i * 4;
      const rawL = (bytes[p] << 8) | bytes[p + 1];
      const rawR = (bytes[p + 2] << 8) | bytes[p + 3];
      const sL = rawL > 32767 ? rawL - 65536 : rawL;
      const sR = rawR > 32767 ? rawR - 65536 : rawR;
      out[i] = ((sL + sR) / 2) / 32768.0;
    }
    return out;
  }
  const out = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const p = offset + i * 2;
    const raw = (bytes[p] << 8) | bytes[p + 1];
    out[i] = (raw > 32767 ? raw - 65536 : raw) / 32768.0;
  }
  return out;
}

/** Parse IFF 8SVX and extract BODY chunk as signed 8-bit mono PCM. */
function _decodeIFF8SVX(bytes: Uint8Array): Float32Array {
  let pos = 12;
  while (pos + 8 <= bytes.length) {
    const id = String.fromCharCode(bytes[pos], bytes[pos+1], bytes[pos+2], bytes[pos+3]);
    const size = (bytes[pos+4] << 24) | (bytes[pos+5] << 16) | (bytes[pos+6] << 8) | bytes[pos+7];
    pos += 8;
    if (id === 'BODY') {
      const bodyLen = Math.min(size, bytes.length - pos);
      const out = new Float32Array(bodyLen);
      for (let i = 0; i < bodyLen; i++) {
        const b = bytes[pos + i];
        out[i] = (b < 128 ? b : b - 256) / 128.0;
      }
      return out;
    }
    pos += size + (size & 1);
  }
  return _decodeRawFallback(bytes);
}

/** Parse AIFF (FORM...AIFF) and extract SSND chunk as signed PCM. */
function _decodeAIFF(bytes: Uint8Array): Float32Array {
  let pos = 12;
  let numCh = 1;
  let bits = 8;
  while (pos + 8 <= bytes.length) {
    const id = String.fromCharCode(bytes[pos], bytes[pos+1], bytes[pos+2], bytes[pos+3]);
    const size = (bytes[pos+4] << 24) | (bytes[pos+5] << 16) | (bytes[pos+6] << 8) | bytes[pos+7];
    pos += 8;
    if (id === 'COMM' && size >= 8) {
      numCh = (bytes[pos] << 8) | bytes[pos+1];
      bits = (bytes[pos+6] << 8) | bytes[pos+7];
      pos += size + (size & 1);
    } else if (id === 'SSND') {
      const ssndOff = (bytes[pos] << 24) | (bytes[pos+1] << 16) | (bytes[pos+2] << 8) | bytes[pos+3];
      const dataStart = pos + 8 + ssndOff;
      const dataLen = Math.min(size - 8 - ssndOff, bytes.length - dataStart);
      if (bits === 16) {
        const n = Math.floor(dataLen / (2 * numCh));
        const out = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          const p = dataStart + i * 2 * numCh;
          const raw = (bytes[p] << 8) | bytes[p + 1];
          out[i] = (raw > 32767 ? raw - 65536 : raw) / 32768.0;
        }
        return out;
      }
      const n = Math.floor(dataLen / numCh);
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const b = bytes[dataStart + i * numCh];
        out[i] = (b < 128 ? b : b - 256) / 128.0;
      }
      return out;
    } else {
      pos += size + (size & 1);
    }
  }
  return _decodeRawFallback(bytes);
}

/** Parse WAV and extract PCM data chunk. Handles 8-bit unsigned and 16-bit signed. */
function _decodeWAV(bytes: Uint8Array): Float32Array {
  if (bytes.length < 44) return _decodeRawFallback(bytes);
  let pos = 12;
  let bitsPerSample = 8;
  while (pos + 8 <= bytes.length) {
    const id = String.fromCharCode(bytes[pos], bytes[pos+1], bytes[pos+2], bytes[pos+3]);
    const size = bytes[pos+4] | (bytes[pos+5] << 8) | (bytes[pos+6] << 16) | (bytes[pos+7] << 24);
    pos += 8;
    if (id === 'fmt ') {
      if (size >= 16) {
        bitsPerSample = bytes[pos+14] | (bytes[pos+15] << 8);
      }
      pos += size;
    } else if (id === 'data') {
      const dataLen = Math.min(size, bytes.length - pos);
      if (bitsPerSample === 16) {
        const numSamples = Math.floor(dataLen / 2);
        const out = new Float32Array(numSamples);
        for (let i = 0; i < numSamples; i++) {
          const raw = bytes[pos + i*2] | (bytes[pos + i*2 + 1] << 8);
          out[i] = (raw > 32767 ? raw - 65536 : raw) / 32768.0;
        }
        return out;
      }
      const out = new Float32Array(dataLen);
      for (let i = 0; i < dataLen; i++) {
        out[i] = (bytes[pos + i] - 128) / 128.0;
      }
      return out;
    } else {
      pos += size + (size & 1);
    }
  }
  return _decodeRawFallback(bytes);
}

function _decodeRawFallback(bytes: Uint8Array): Float32Array {
  const out = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[i] = (bytes[i] < 128 ? bytes[i] : bytes[i] - 256) / 128.0;
  }
  return out;
}

// ── Playback-data parser ──────────────────────────────────────────────────────

/**
 * Parse a Symphonie Pro (.symmod) file into SymphoniePlaybackData for use
 * by the native AudioWorklet replayer.  Unlike parseSymphonieProFile() this
 * function extracts PCM sample data and full command/DSP event streams.
 */
export async function parseSymphonieForPlayback(
  buffer: ArrayBuffer,
  filename: string,
): Promise<SymphoniePlaybackData> {
  const bytes = new Uint8Array(buffer);

  if (!isSymphonieProFormat(bytes)) {
    throw new Error(`parseSymphonieForPlayback: not a SymMOD file (${filename})`);
  }

  const r = new Reader(bytes);

  // ── Header ────────────────────────────────────────────────────────────────
  r.skip(4); // "SymM"
  r.skip(4); // version = 1
  r.skip(4); // firstChunkID = -1 (NumChannels)
  const numChannels = Math.min(r.u32be(), 256);

  // ── Chunk type constants (mirrored from _parseSymphonieProFile) ───────────
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

  // CMD_DSP_ECHO (24) and CMD_DSP_DELAY (25) are module-level constants above

  // ── Accumulated state ─────────────────────────────────────────────────────
  let trackLen        = 0;
  let initialBPM      = 125;
  let positionsData   = new Uint8Array(0);
  let sequencesData   = new Uint8Array(0);
  let patternData     = new Uint8Array(0);
  let instrumentData  = new Uint8Array(0);
  let infoText        = '';

  // Instruments with type -8 (Silent) or -4 (Kill) have no PCM.
  // Sample chunks arrive in instrument order; we collect them into this array
  // indexed by sampleIndex, then merge with instrument metadata later.
  const rawSampleData: Array<{ kind: 'raw8' | 'delta8' | 'delta16'; bytes: Uint8Array }> = [];
  // emptySampleCount is used to advance sampleIndex for CHUNK_EMPTY_SAMPLE
  let sampleIndex = 0;

  // ── Chunk walk ────────────────────────────────────────────────────────────
  while (r.canRead(4)) {
    const chunkType = r.s32be();

    switch (chunkType) {
      case CHUNK_NUM_CHANNELS:
        r.skip(4);
        break;

      case CHUNK_TRACK_LENGTH: {
        const tl = r.u32be();
        if (tl > 1024) throw new Error('trackLen > 1024');
        trackLen = tl;
        break;
      }

      case CHUNK_EVENT_SIZE: {
        const es = r.u32be() & 0xFFFF;
        if (es !== 4) throw new Error(`eventSize must be 4, got ${es}`);
        break;
      }

      case CHUNK_TEMPO: {
        const rawTempo = r.u32be();
        const clamped  = Math.min(rawTempo, 800);
        initialBPM = Math.floor(1.24 * clamped);
        if (initialBPM < 32)  initialBPM = 32;
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
      case CHUNK_EXTERNAL_SAMPLES:
        r.skip(4);
        break;

      case CHUNK_POSITION_LIST:
        if (positionsData.length === 0) {
          positionsData = new Uint8Array(decodeSymArray(r));
        } else {
          if (r.canRead(4)) { const l = r.u32be(); r.skip(l); }
        }
        break;

      case CHUNK_SAMPLE_FILE: {
        // Raw 8-bit signed PCM (not delta-compressed)
        const bytes2 = decodeSymChunk(r);
        rawSampleData[sampleIndex] = { kind: 'raw8', bytes: bytes2 };
        sampleIndex++;
        break;
      }

      case CHUNK_SAMPLE_PACKED: {
        // Delta-compressed 8-bit PCM
        const bytes2 = decodeSymChunk(r);
        rawSampleData[sampleIndex] = { kind: 'delta8', bytes: bytes2 };
        sampleIndex++;
        break;
      }

      case CHUNK_SAMPLE_PACKED16: {
        // Delta-compressed 16-bit PCM
        const bytes2 = decodeSymChunk(r);
        rawSampleData[sampleIndex] = { kind: 'delta16', bytes: bytes2 };
        sampleIndex++;
        break;
      }

      case CHUNK_EMPTY_SAMPLE:
        // Marks a slot with no PCM — advance index without storing data
        sampleIndex++;
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
        // Unknown chunk — stop reading (same policy as existing parser)
        break;
    }
  }

  // ── Validate ──────────────────────────────────────────────────────────────
  if (trackLen === 0 || instrumentData.length === 0) {
    throw new Error('parseSymphonieForPlayback: missing trackLen or instrument data');
  }
  if (positionsData.length === 0 || patternData.length === 0 || sequencesData.length === 0) {
    throw new Error('parseSymphonieForPlayback: missing position/pattern/sequence data');
  }

  // ── Parse structs (reuse existing helpers) ────────────────────────────────
  const symInstrumentsRaw = readSymInstruments(instrumentData);
  const symEventsRaw      = readSymEvents(patternData);
  const symSequences      = readSymSequences(sequencesData);
  const symPositions      = readSymPositions(positionsData);

  const numInstruments = Math.min(symInstrumentsRaw.length, 255);
  const patternSize    = numChannels * trackLen;

  // ── Build SymphonieInstrumentData list ────────────────────────────────────
  //
  // The instrument chunk contains 256-byte records.  The raw struct is already
  // partially decoded by readSymInstruments(); we need additional fields that
  // _parseSymphonieProFile doesn't extract:
  //   offset 128  type (int8)            — already in .type
  //   offset 129  loopStartHigh (uint8)  — × 256×256 = raw loopStart
  //   offset 130  loopLenHigh (uint8)    — × 256×256 = raw loopLen
  //   offset 131  numRepetitions (uint8)
  //   offset 132  multiChannel (int8)    — already in .channel
  //   offset 134  volume (uint8)         — already in .volume
  //   offset 138  fineTune (int8)
  //   offset 139  tune (int8)            — already in .transpose
  //   offset 140  lineSampleFlags (uint8)— bit4 = newLoopSystem
  //   offset 142  instFlags (uint8)      — bit1 = noDsp  — already in .instFlags
  //   offset 143  downsample (uint8)     — subtract 12×downsample from tune
  //
  // We re-read these fields from the raw instrumentData bytes.

  const INST_SIZE = 256;

  // Sample chunk → instrument mapping (from ASM WriteModuleSamples / LoadHunkSAMPLE):
  //
  // The file saves one chunk per instrument slot, iterated in order, EXCEPT:
  //   - StereoR (channel=2): NO chunk written — shares StereoL's sample data
  //   - Kill (type=-4), Silent (type=-8), LineSrc (channel=3), empty name,
  //     zero-length file: EMPTYSAMPLE chunk (just a marker, no data)
  //   - All others: SAMPLE / DELTASAMPLE / DELTA16 chunk with PCM data
  //
  // The load side uses MoveNextMonoInstrument which skips StereoR slots after
  // loading each chunk. So chunks map 1:1 to instruments, minus StereoR slots.
  //
  // Count how many chunks we expect (instruments minus StereoR):
  let numStereoR = 0;
  for (let i = 0; i < numInstruments; i++) {
    if (symInstrumentsRaw[i].channel === 2) numStereoR++;
  }
  const expectedChunks = numInstruments - numStereoR;
  console.log(`[SymphonieParser] sampleIndex=${sampleIndex} numInstruments=${numInstruments} stereoR=${numStereoR} expectedChunks=${expectedChunks}`);

  let chunkIdx = 0;  // indexes into rawSampleData (skips StereoR)
  const instruments: SymphonieInstrumentData[] = [];

  for (let i = 0; i < numInstruments; i++) {
    const si  = symInstrumentsRaw[i];
    const base = i * INST_SIZE;

    const loopStartHigh  = instrumentData[base + 129];
    const loopLenHigh    = instrumentData[base + 130];
    const numRepetitions = instrumentData[base + 131];
    const fineTune       = instrumentData[base + 138] >= 128 ? instrumentData[base + 138] - 256 : instrumentData[base + 138];
    const lineSampleFlags = instrumentData[base + 140];
    const downsample     = instrumentData[base + 143];

    // Apply downsample correction to tune (si.transpose is already int8)
    const tune = si.transpose - 12 * downsample;

    // Volume: 0 means default to 100; cap at 100
    const volume = si.volume === 0 ? 100 : Math.min(si.volume, 100);

    // noDsp: bit 1 of instFlags (SPLAYFLAG_NODSP)
    const noDsp = (si.instFlags & 0x02) !== 0;

    // newLoopSystem: bit 4 of lineSampleFlags
    const newLoopSystem = (lineSampleFlags & 0x10) !== 0;

    // Loop points: high byte at offsets 129/130, low word at offsets 150-151/152-153
    // Full 24-bit value: (highByte << 16) + lowWord
    const loopStartLo = base + 151 < instrumentData.length
      ? (instrumentData[base + 150] << 8) | instrumentData[base + 151] : 0;
    const loopLenLo = base + 153 < instrumentData.length
      ? (instrumentData[base + 152] << 8) | instrumentData[base + 153] : 0;
    const loopStart = loopStartHigh * 65536 + loopStartLo;
    const loopLen   = loopLenHigh   * 65536 + loopLenLo;

    // StereoR instruments share the StereoL's sample — no chunk in file
    const isStereoR = (si.channel === 2);

    let samples: Float32Array | null = null;
    if (!isStereoR) {
      // This instrument has a chunk in the file (data or EMPTYSAMPLE)
      const entry = rawSampleData[chunkIdx];
      if (entry) {
        if (entry.kind === 'raw8') {
          samples = _decodeRaw8(entry.bytes);
        } else if (entry.kind === 'delta8') {
          samples = _decodeDelta8(entry.bytes);
        } else {
          samples = _decodeDelta16(entry.bytes);
        }
      }
      chunkIdx++;
    } else {
      // StereoR: find preceding StereoL and share its sample data
      // (For now, leave null — the replayer handles stereo pairs internally)
    }

    instruments.push({
      name:           si.name || `Instrument ${i + 1}`,
      type:           si.type,
      volume,
      tune,
      fineTune,
      noDsp,
      multiChannel:   si.channel,
      loopStart,
      loopLen,
      numLoops:       numRepetitions,
      newLoopSystem,
      samples,
      sampledFrequency: 0,  // unknown → worklet assumes 8363 Hz
    });
  }

  // Trim trailing empty instruments (no sample data, no name, Silent/Kill type)
  while (instruments.length > 0) {
    const last = instruments[instruments.length - 1];
    if (last.samples !== null || (last.type >= 0 && last.name !== `Instrument ${instruments.length}`)) break;
    instruments.pop();
  }

  // ── Extract initial cycle (speed) from first played position ─────────────
  //
  // Mirror the same first-pass scan used by buildSymPhonieTrackerSong() so
  // the worklet starts with the correct ticks-per-row instead of always 6.
  let initialCycle = 6;
  outerCycle:
  for (const seq of symSequences) {
    if (seq.info === 1) continue;
    if (seq.info === -1) break;
    if (
      seq.start >= symPositions.length ||
      seq.length === 0 ||
      seq.length > symPositions.length ||
      symPositions.length - seq.length < seq.start
    ) continue;
    for (let pi = seq.start; pi < seq.start + seq.length; pi++) {
      const pos = symPositions[pi];
      if (!pos) continue;
      if (pos.speed > 0) {
        initialCycle = pos.speed;
        break outerCycle;
      }
    }
  }

  // ── Build patterns + order list ───────────────────────────────────────────
  //
  // Mirror the logic in _parseSymphonieProFile but emit SymphoniePattern
  // objects (with flat event arrays) instead of TrackerSong patterns.

  const patternMap = new Map<string, number>();
  const patterns: SymphoniePattern[] = [];
  const orderList: number[] = [];
  const orderSpeeds: number[] = [];
  const orderTranspose: number[] = [];

  for (const seq of symSequences) {
    if (seq.info === 1) continue;
    if (seq.info === -1) break;

    if (
      seq.start >= symPositions.length ||
      seq.length === 0 ||
      seq.length > symPositions.length ||
      symPositions.length - seq.length < seq.start
    ) {
      continue;
    }

    for (let pi = seq.start; pi < seq.start + seq.length; pi++) {
      const pos = symPositions[pi];
      if (!pos) continue;

      const effectiveTranspose = pos.transpose + seq.transpose;
      const key = `${pos.pattern}-${pos.start}-${pos.length}-${effectiveTranspose}-${pos.speed}`;

      if (!patternMap.has(key)) {
        const patIdx  = patterns.length;
        patternMap.set(key, patIdx);

        const numRows  = pos.length;
        const rowStart = pos.start;

        const events: SymphoniePatternEvent[] = [];
        const dspEvents: SymphonieDSPEvent[]  = [];

        for (let row = 0; row < numRows; row++) {
          for (let ch = 0; ch < numChannels; ch++) {
            const srcRow   = rowStart + row;
            const eventIdx = pos.pattern * patternSize + srcRow * numChannels + ch;

            if (eventIdx < 0 || eventIdx >= symEventsRaw.length) continue;

            const ev = symEventsRaw[eventIdx];

            if (ev.command === CMD_DSP_ECHO || ev.command === CMD_DSP_DELAY) {
              // DSP event: type=note, feedback=instrument, bufLen=param
              dspEvents.push({
                row,
                channel: ch,
                type:     ev.note,
                feedback: ev.inst,
                bufLen:   ev.param,
              });
              // Also add as a regular event so the C player processes it
              // (fx_dsp_echo uses pitch=type, volume=bufLen, instr=feedback)
              events.push({
                row,
                channel: ch,
                note:       (ev.note >= 0 && ev.note <= 255) ? ev.note + 1 : 0,
                instrument: ev.inst + 1,
                volume:     255,
                cmd:        ev.command,
                param:      ev.param,
              });
            } else {
              // Regular pattern event
              let note       = 0;
              let instrument = 0;
              let volume     = 255; // 255 = no volume change

              if (ev.command === CMD_KEYON) {
                if (ev.note >= 0 && ev.note <= 84) {
                  // Raw pitch for WASM (0-84), no display offset
                  note = ev.note + 1; // 1-based (0=no note)
                }
                if (ev.inst < numInstruments) {
                  instrument = ev.inst + 1; // 0-based file → 1-based for worklet
                }
                // Volume commands (>100) need to be forwarded for the WASM player
                if (ev.param > 0 && ev.param <= 100) {
                  volume = ev.param;
                } else if (ev.param > 200) {
                  volume = ev.param; // volume command (242-254)
                } else if (ev.param === 0) {
                  volume = 255; // no explicit volume
                }
              } else {
                // All other commands: note and inst bytes are effect parameters
                // (e.g. vibrato speed, filter reso, retrig interval, emphasis values)
                // Pass them through raw so the C player receives correct values.
                note = (ev.note >= 0 && ev.note <= 255) ? ev.note + 1 : 0;
                instrument = ev.inst + 1; // 1-based encoding, worklet subtracts 1
              }

              events.push({
                row,
                channel:    ch,
                note,
                instrument,
                volume,
                cmd:        ev.command,
                param:      ev.param,
              });
            }
          }
        }

        patterns.push({ numRows, events, dspEvents });
      }

      const patIdx = patternMap.get(key)!;
      const loopCount = Math.max(pos.loopNum, 1);
      for (let lp = 0; lp < loopCount; lp++) {
        orderList.push(patIdx);
        orderSpeeds.push(pos.speed > 0 ? pos.speed : initialCycle);
        orderTranspose.push(effectiveTranspose);
      }
    }
  }

  // Ensure at least one pattern
  if (patterns.length === 0) {
    patterns.push({ numRows: 64, events: [], dspEvents: [] });
    orderList.push(0);
  }

  // ── Song name ─────────────────────────────────────────────────────────────
  const baseName = filename.replace(/\.[^/.]+$/, '');
  const title    = infoText.trim() || baseName;

  return {
    title,
    bpm:              initialBPM,
    cycle:            initialCycle,
    numChannels,
    orderList,
    orderSpeeds,
    orderTranspose,
    patterns,
    instruments,
    globalDspType:     0,
    globalDspFeedback: 0,
    globalDspBufLen:   0,
  };
}
