/**
 * DTMParser.ts — Digital Tracker / Digital Home Studio (.dtm) format parser
 *
 * Big-endian, IFF-style chunked format created by Digital Tracker for the
 * Amiga. Three pattern formats are supported by the format: PT (ProTracker
 * compatible 4-byte cells), 2.04 (compact 4-byte cells with XM-style notes),
 * and 2.06 (tick-based — not implemented here; empty patterns returned).
 *
 * Binary layout:
 *   DTMFileHeader (22 bytes):
 *     +0  magic[4]          = "D.T."
 *     +4  headerSize        uint32BE — total header size including magic+size (≥14)
 *     +8  type              uint16BE — must be 0
 *     +10 stereoMode        uint8    — 0xFF=panoramic, 0x00=old LRRL stereo
 *     +11 bitDepth          uint8    — ignored
 *     +12 reserved          uint16BE
 *     +14 speed             uint16BE — initial ticks/row (default 6)
 *     +16 tempo             uint16BE — initial BPM (default 125)
 *     +18 forcedSampleRate  uint32BE — used for PT format samples
 *   +22  song name          null-terminated, (headerSize - 14) bytes available
 *   Then IFF chunks until EOF:
 *     chunk: id[4](uint32BE) + length(uint32BE) + data
 *
 * Reference: OpenMPT Load_dtm.cpp
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument, periodToNoteIndex, amigaNoteToXM } from './AmigaUtils';

// ── Binary helpers (big-endian throughout) ────────────────────────────────────

function u8(v: DataView, off: number): number  { return v.getUint8(off); }
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

// ── Chunk ID helpers ──────────────────────────────────────────────────────────

/** Build a big-endian 32-bit magic number from a 4-character ASCII string. */
function magic(s: string): number {
  return (
    (s.charCodeAt(0) << 24) |
    (s.charCodeAt(1) << 16) |
    (s.charCodeAt(2) <<  8) |
     s.charCodeAt(3)
  ) >>> 0;
}

const CHUNK_SQ   = magic('S.Q.');
const CHUNK_PATT = magic('PATT');
const CHUNK_INST = magic('INST');
const CHUNK_DAPT = magic('DAPT');
const CHUNK_DAIT = magic('DAIT');

// Pattern format identifiers
const DTM_PT_FORMAT  = 0x00000000;
const DTM_204_FORMAT = magic('2.04');
const DTM_206_FORMAT = magic('2.06');

// ── Constants ─────────────────────────────────────────────────────────────────

/** Maximum number of channels / instruments supported by the format. */
const MAX_CHANNELS    = 32;
const MAX_INSTRUMENTS = 256;

/** LRRL alternating panning for old stereo mode (Amiga standard). */
const LRRL_PAN = [-50, 50, 50, -50] as const;

// ── Internal chunk table ──────────────────────────────────────────────────────

interface Chunk {
  id:     number;
  offset: number;  // byte offset of chunk data (after 8-byte header)
  length: number;
}

/**
 * Walk the file from `startOffset` and collect every IFF-style chunk.
 * Returns one entry per occurrence; DAPT and DAIT may appear multiple times.
 */
function readChunks(v: DataView, startOffset: number): Chunk[] {
  const chunks: Chunk[] = [];
  let pos = startOffset;
  while (pos + 8 <= v.byteLength) {
    const id     = u32(v, pos);
    const length = u32(v, pos + 4);
    chunks.push({ id, offset: pos + 8, length });
    pos += 8 + length;
    // Pad to even boundary (IFF convention)
    if (length & 1) pos++;
  }
  return chunks;
}

// ── Effect conversion (MOD command → TrackerCell effTyp) ──────────────────────

/**
 * Convert a MOD/DTM effect command and parameter to TrackerCell (effTyp, eff).
 * MOD effects 0–F map directly to XM/IT effects 0–F.
 * Fix-ups from OpenMPT: zero-param portamento/volume-slide → no effect.
 */
function convertModEffect(
  cmd: number,
  param: number,
): { effTyp: number; eff: number } {
  let effTyp = cmd & 0x0F;
  let eff    = param;

  switch (effTyp) {
    // Portamento up/down: zero param means "no effect" in DTM
    case 0x01:
    case 0x02:
      if (eff === 0) { effTyp = 0; }
      break;

    // Volume slide / tone porta+vol / vibrato+vol:
    // upper nibble takes precedence; zero means no effect
    case 0x0A:
    case 0x05:
    case 0x06:
      if (eff & 0xF0) {
        eff &= 0xF0;
      } else if (eff === 0) {
        effTyp = 0;
      }
      break;

    default:
      break;
  }

  return { effTyp, eff };
}

// ── PT format — period-based cell decoder ─────────────────────────────────────

/**
 * Decode one 4-byte MOD-style pattern cell (PT format).
 * Cell layout:
 *   data[0] bits[7:4] = instrument high nibble [7:4]
 *   data[0] bits[5:4] = instrument extra bits  [5:4]  (allows >31 instruments)
 *   data[0] bits[3:0] = period high byte
 *   data[1]           = period low byte
 *   data[2] bits[7:4] = instrument low nibble  [3:0]
 *   data[2] bits[3:0] = effect command
 *   data[3]           = effect parameter
 */
function decodePTCell(
  d0: number,
  d1: number,
  d2: number,
  d3: number,
): TrackerCell {
  const period     = ((d0 & 0x0F) << 8) | d1;
  const instrument = ((d0 & 0xF0) | (d2 >> 4)) | ((d0 & 0x30) << 4);
  const cmd        = d2 & 0x0F;
  const param      = d3;

  // Convert Amiga period to XM note number
  let note = 0;
  if (period > 0) {
    const amigaIdx = periodToNoteIndex(period);  // 1-based index into period table
    note = amigaNoteToXM(amigaIdx);              // → XM note
  }

  const { effTyp, eff } = convertModEffect(cmd, param);

  return { note, instrument, volume: 0, effTyp, eff, effTyp2: 0, eff2: 0 };
}

// ── 2.04 format — note-encoded cell decoder ───────────────────────────────────

/**
 * Decode one 4-byte 2.04-format pattern cell.
 * Cell layout:
 *   data[0] = note    (0=empty, 1–0x7F=encoded note, 0x80+=invalid)
 *   data[1] = instrVol
 *     bits[7:2] = volume+1 (0 = no volume column)
 *     bits[1:0] = instrument high bits [5:4]
 *   data[2] = instrCmd
 *     bits[7:4] = instrument low bits [3:0]
 *     bits[3:0] = effect command
 *   data[3] = effect parameter
 *
 * Note encoding: octave = note >> 4, semitone = note & 0x0F
 *   XM note = octave * 12 + semitone + 12   (matches OpenMPT: NOTE_MIN + 11 = 12)
 */
function decode204Cell(
  d0: number,
  d1: number,
  d2: number,
  d3: number,
): TrackerCell {
  // Note
  let note = 0;
  if (d0 > 0 && d0 < 0x80) {
    note = ((d0 >> 4) * 12) + (d0 & 0x0F) + 12;
  }

  // Volume column: instrVol bits[7:2], non-zero means vol = (field - 1)
  const volField = d1 >> 2;
  const volume   = volField > 0 ? (volField - 1) : 0;   // 0–62

  // Instrument
  const instrument = ((d1 & 0x03) << 4) | (d2 >> 4);

  // Effect
  const cmd   = d2 & 0x0F;
  const param = d3;
  const { effTyp, eff } = convertModEffect(cmd, param);

  return { note, instrument, volume, effTyp, eff, effTyp2: 0, eff2: 0 };
}

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Returns true when the buffer looks like a Digital Tracker (.dtm) file.
 *   1. "D.T." at offset 0
 *   2. headerSize ≥ 14
 *   3. type == 0
 */
export function isDTMFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 22) return false;
  const v = new DataView(buffer);

  if (u8(v, 0) !== 0x44 /* D */
   || u8(v, 1) !== 0x2E /* . */
   || u8(v, 2) !== 0x54 /* T */
   || u8(v, 3) !== 0x2E /* . */) {
    return false;
  }

  const headerSize = u32(v, 4);
  if (headerSize < 14) return false;

  const type = u16(v, 8);
  if (type !== 0) return false;

  return true;
}

// ── Sample header (50 bytes, big-endian) ──────────────────────────────────────

interface DTMSampleHeader {
  length:     number;   // bytes
  finetune:   number;   // uint8 MOD-style 0–15 (>7 → negative)
  volume:     number;   // 0–64
  loopStart:  number;   // bytes
  loopLength: number;   // bytes
  name:       string;
  stereo:     boolean;  // bit0 of stereo byte
  is16bit:    boolean;  // bitDepth > 8
  sampleRate: number;   // C5 speed in Hz
}

function parseSampleHeader(v: DataView, off: number): DTMSampleHeader {
  // +0  reserved   uint32BE (skip)
  const length     = u32(v, off + 4);
  const finetune   = u8(v, off + 8);
  const volume     = Math.min(u8(v, off + 9), 64);
  const loopStart  = u32(v, off + 10);
  const loopLength = u32(v, off + 14);
  const name       = readString(v, off + 18, 22);
  const stereo     = (u8(v, off + 40) & 0x01) !== 0;
  const is16bit    = u8(v, off + 41) > 8;
  // +42 transpose uint16BE (skip)
  // +44 unknown   uint16BE (skip)
  const sampleRate = u32(v, off + 46);

  return { length, finetune, volume, loopStart, loopLength, name, stereo, is16bit, sampleRate };
}

// ── PCM conversion helpers ────────────────────────────────────────────────────

/**
 * Convert 16-bit big-endian signed PCM to 8-bit signed PCM.
 * Used to normalise all samples to 8-bit before passing to createSamplerInstrument.
 */
function pcm16BETo8(raw: Uint8Array): Uint8Array {
  const frames = Math.floor(raw.length / 2);
  const out    = new Uint8Array(frames);
  const dv     = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  for (let i = 0; i < frames; i++) {
    const s16 = dv.getInt16(i * 2, false);  // big-endian
    out[i] = ((s16 >> 8) + 128) & 0xFF;
  }
  return out;
}

/**
 * De-interleave stereo PCM to left channel only.
 * Amiga stereo is interleaved L/R, so every other sample is left.
 */
function stereoToMono(pcm: Uint8Array): Uint8Array {
  const frames = Math.floor(pcm.length / 2);
  const out    = new Uint8Array(frames);
  for (let i = 0; i < frames; i++) {
    out[i] = pcm[i * 2];   // take left channel
  }
  return out;
}

// ── MOD2XMFineTune equivalent ─────────────────────────────────────────────────

/**
 * Convert MOD-style finetune (0–15, where >7 is negative) to a signed value
 * in semitone-128ths (-8 to +7), then scale to a detune value in cents.
 * OpenMPT maps: finetune > 7 → finetune - 16 (gives -8 to -1).
 * Detune = signed * (100/8) cents (1 semitone / 8 steps).
 */
function mod2xmFinetuneCents(rawFinetune: number): number {
  const signed = rawFinetune > 7 ? rawFinetune - 16 : rawFinetune;
  return signed * (100 / 8);  // each step = 12.5 cents
}

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Parse a Digital Tracker (.dtm) file into a TrackerSong.
 *
 * @throws If the file fails validation or required chunks are missing.
 */
export async function parseDTMFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  if (!isDTMFormat(buffer)) {
    throw new Error('DTMParser: file does not pass DTM format validation');
  }

  const v    = new DataView(buffer);
  const raw  = new Uint8Array(buffer);

  // ── File header (22 bytes) ────────────────────────────────────────────────

  const headerSize        = u32(v, 4);
  const stereoMode        = u8(v, 10);   // 0x00=old LRRL, 0xFF=panoramic
  const rawSpeed          = u16(v, 14);
  const rawTempo          = u16(v, 16);
  const forcedSampleRate  = u32(v, 18);

  const initialSpeed = rawSpeed > 0 ? rawSpeed : 6;
  const initialBPM   = rawTempo > 0 ? rawTempo : 125;

  // Song name: at offset 22, up to (headerSize - 14) bytes
  const songNameLen = Math.max(0, headerSize - 14);
  const songName    = readString(v, 22, songNameLen) || filename.replace(/\.[^/.]+$/, '');

  // Chunks start at offset (22 + (headerSize - 14)) = headerSize + 8
  // But: headerSize already includes the first 8 bytes (magic+size), so
  // chunks begin at offset (headerSize + 8) in the file.
  // Cross-check with OpenMPT: file.ReadStruct(fileHeader) reads 22 bytes,
  // then ReadString of length (headerSize - (sizeof(DTMFileHeader) - 8))
  //   = headerSize - 14 bytes, then ReadChunks starts from current pos.
  const chunksStart = 22 + songNameLen;

  const chunks = readChunks(v, chunksStart);

  // Helper: find first chunk with given id
  const findChunk = (id: number): Chunk | undefined =>
    chunks.find(c => c.id === id);

  // Helper: find all chunks with given id
  const findAllChunks = (id: number): Chunk[] =>
    chunks.filter(c => c.id === id);

  // ── PATT chunk — pattern format info ─────────────────────────────────────

  const pattChunk = findChunk(CHUNK_PATT);
  if (!pattChunk) {
    throw new Error('DTMParser: missing PATT chunk');
  }

  const numChannels       = u16(v, pattChunk.offset);
  const numStoredPatterns = u16(v, pattChunk.offset + 2);
  const patternFormat     = u32(v, pattChunk.offset + 4);

  if (numChannels < 1 || numChannels > MAX_CHANNELS) {
    throw new Error(`DTMParser: invalid channel count ${numChannels}`);
  }
  if (
    patternFormat !== DTM_PT_FORMAT
    && patternFormat !== DTM_204_FORMAT
    && patternFormat !== DTM_206_FORMAT
  ) {
    throw new Error(`DTMParser: unknown pattern format 0x${patternFormat.toString(16)}`);
  }

  // ── S.Q. chunk — order list ───────────────────────────────────────────────

  const sqChunk = findChunk(CHUNK_SQ);
  if (!sqChunk) {
    throw new Error('DTMParser: missing S.Q. chunk');
  }

  const ordLen      = u16(v, sqChunk.offset);
  const restartPos  = u16(v, sqChunk.offset + 2);
  // skip 4 reserved bytes at +4
  const orderList: number[] = [];
  for (let i = 0; i < ordLen; i++) {
    orderList.push(u8(v, sqChunk.offset + 8 + i));
  }

  // ── INST chunk — sample headers ───────────────────────────────────────────

  interface ParsedSampleSlot {
    realIndex:  number;          // 1-based instrument number in the final array
    header:     DTMSampleHeader;
  }

  const sampleSlots: ParsedSampleSlot[] = [];
  let   maxSampleIndex = 0;

  const instChunk = findChunk(CHUNK_INST);
  if (instChunk) {
    let rawNumSamples = u16(v, instChunk.offset);
    const newSamples  = (rawNumSamples & 0x8000) !== 0;
    rawNumSamples    &= 0x7FFF;

    if (rawNumSamples < MAX_INSTRUMENTS) {
      let pos = instChunk.offset + 2;  // past numSamples field
      for (let i = 0; i < rawNumSamples; i++) {
        let realSample: number;
        if (newSamples) {
          realSample = u16(v, pos) + 1;  // 1-indexed (stored 0-indexed)
          pos += 2;
        } else {
          realSample = i + 1;
        }

        if (pos + 50 > instChunk.offset + instChunk.length) break;
        const hdr = parseSampleHeader(v, pos);
        pos += 50;  // DTMSample is exactly 50 bytes

        if (realSample >= 1 && realSample < MAX_INSTRUMENTS) {
          sampleSlots.push({ realIndex: realSample, header: hdr });
          if (realSample > maxSampleIndex) maxSampleIndex = realSample;
        }
      }
      // Check for Digital Home Studio instrument extension (0x0004 marker)
      // Just skip it — we don't implement DHS instrument envelopes
    }
  }

  // ── DAIT chunks — sample PCM data ────────────────────────────────────────

  // Map from 0-based sample index (chunk stores 0-indexed) to raw bytes
  const samplePCMMap = new Map<number, Uint8Array>();

  for (const chunk of findAllChunks(CHUNK_DAIT)) {
    if (chunk.length < 2) continue;
    const smpIdx    = u16(v, chunk.offset);   // 0-based
    const dataStart = chunk.offset + 2;
    const dataLen   = chunk.length - 2;
    if (dataLen > 0) {
      samplePCMMap.set(smpIdx, raw.slice(dataStart, dataStart + dataLen));
    }
  }

  // ── Build InstrumentConfig array ──────────────────────────────────────────

  // Instruments are sparse — allocate up to maxSampleIndex slots
  const instruments: InstrumentConfig[] = [];

  // Build lookup: realIndex → slot
  const slotMap = new Map<number, ParsedSampleSlot>();
  for (const slot of sampleSlots) {
    slotMap.set(slot.realIndex, slot);
  }

  for (let id = 1; id <= maxSampleIndex; id++) {
    const slot = slotMap.get(id);

    if (!slot) {
      // Placeholder for empty instrument slot
      instruments.push({
        id,
        name:      `Sample ${id}`,
        type:      'sample'  as const,
        synthType: 'Sampler' as const,
        effects:   [],
        volume:    -60,
        pan:       0,
      } as unknown as InstrumentConfig);
      continue;
    }

    const hdr   = slot.header;
    const rawPCM = samplePCMMap.get(id - 1);   // DAIT uses 0-based index

    if (!rawPCM || rawPCM.length === 0) {
      instruments.push({
        id,
        name:      hdr.name || `Sample ${id}`,
        type:      'sample'  as const,
        synthType: 'Sampler' as const,
        effects:   [],
        volume:    hdr.volume > 0 ? 20 * Math.log10(hdr.volume / 64) : -60,
        pan:       0,
      } as unknown as InstrumentConfig);
      continue;
    }

    // Normalise to 8-bit mono
    let pcm8: Uint8Array = rawPCM;
    if (hdr.is16bit) {
      pcm8 = pcm16BETo8(pcm8);
    }
    if (hdr.stereo) {
      pcm8 = stereoToMono(pcm8);
    }

    // Compute sample rate (PT format may use forcedSampleRate from file header)
    const sampleRate = (patternFormat === DTM_PT_FORMAT && forcedSampleRate > 0)
      ? forcedSampleRate
      : (hdr.sampleRate > 0 ? hdr.sampleRate : 8363);

    // Loop: active when loopLength > 1
    let loopStart = 0;
    let loopEnd   = 0;
    if (hdr.loopLength > 1) {
      // Header stores byte offsets; for 16-bit/stereo, OpenMPT divides by 2 each.
      // We already normalised to 8-bit mono, so scale loop points to match.
      let ls = hdr.loopStart;
      let ll = hdr.loopLength;
      if (hdr.is16bit)  { ls = Math.floor(ls / 2); ll = Math.floor(ll / 2); }
      if (hdr.stereo)   { ls = Math.floor(ls / 2); ll = Math.floor(ll / 2); }
      loopStart = ls;
      loopEnd   = Math.min(ls + ll, pcm8.length);
    }

    // Finetune: MOD-style 0–15 (>7 = negative) → detune in cents
    const finetuneCents = mod2xmFinetuneCents(hdr.finetune);

    const inst = createSamplerInstrument(
      id,
      hdr.name || `Sample ${id}`,
      pcm8,
      hdr.volume,
      sampleRate,
      loopStart,
      loopEnd,
    );

    // Patch finetune into the instrument metadata if non-zero
    if (finetuneCents !== 0 && inst.sample) {
      inst.sample.detune = finetuneCents;
    }

    instruments.push(inst);
  }

  // ── DAPT chunks — pattern data ────────────────────────────────────────────

  // Collect all DAPT chunks, keyed by patNum
  const patternMap = new Map<number, Pattern>();

  for (const chunk of findAllChunks(CHUNK_DAPT)) {
    if (chunk.length < 8) continue;

    // First 4 bytes: FF FF FF FF marker
    let pos = chunk.offset + 4;
    const patNum  = u16(v, pos);     pos += 2;
    let   numRows = u16(v, pos);     pos += 2;

    // 2.06: numRows is in ticks, divide by speed to get rows
    if (patternFormat === DTM_206_FORMAT) {
      numRows = Math.max(1, Math.floor(numRows / initialSpeed));
    }

    if (patNum > 255 || numRows === 0) continue;

    // Build channel rows array
    const channels: ChannelData[] = Array.from(
      { length: numChannels },
      (_, ch): ChannelData => ({
        id:           `channel-${ch}`,
        name:         `Channel ${ch + 1}`,
        muted:        false,
        solo:         false,
        collapsed:    false,
        volume:       100,
        pan:          stereoMode === 0x00
                        ? (LRRL_PAN[ch % 4] ?? 0)   // LRRL alternating
                        : 0,                          // panoramic → centre
        instrumentId: null,
        color:        null,
        rows:         [],
      }),
    );

    if (patternFormat === DTM_206_FORMAT) {
      // 2.06 tick-based format — not implemented; fill with empty cells
      for (let row = 0; row < numRows; row++) {
        for (let ch = 0; ch < numChannels; ch++) {
          channels[ch].rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
        }
      }
    } else if (patternFormat === DTM_PT_FORMAT) {
      // PT format: numChannels × numRows × 4 bytes, stored row-major
      for (let row = 0; row < numRows; row++) {
        for (let ch = 0; ch < numChannels; ch++) {
          const cellOff = pos + (row * numChannels + ch) * 4;
          if (cellOff + 4 > chunk.offset + chunk.length) {
            channels[ch].rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          } else {
            const d0 = u8(v, cellOff);
            const d1 = u8(v, cellOff + 1);
            const d2 = u8(v, cellOff + 2);
            const d3 = u8(v, cellOff + 3);
            channels[ch].rows.push(decodePTCell(d0, d1, d2, d3));
          }
        }
      }
    } else {
      // 2.04 format: numChannels × numRows × 4 bytes, stored row-major
      for (let row = 0; row < numRows; row++) {
        for (let ch = 0; ch < numChannels; ch++) {
          const cellOff = pos + (row * numChannels + ch) * 4;
          if (cellOff + 4 > chunk.offset + chunk.length) {
            channels[ch].rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          } else {
            const d0 = u8(v, cellOff);
            const d1 = u8(v, cellOff + 1);
            const d2 = u8(v, cellOff + 2);
            const d3 = u8(v, cellOff + 3);
            channels[ch].rows.push(decode204Cell(d0, d1, d2, d3));
          }
        }
      }
    }

    patternMap.set(patNum, {
      id:      `pattern-${patNum}`,
      name:    `Pattern ${patNum}`,
      length:  numRows,
      channels,
      importMetadata: {
        sourceFormat:            'DTM',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    numChannels,
        originalPatternCount:    numStoredPatterns,
        originalInstrumentCount: maxSampleIndex,
      },
    });
  }

  // Build patterns array indexed by pattern number (sparse → ordered by patNum)
  // Highest patNum in order list determines array needed; fill gaps with empty patterns.
  const highestPatNum = Math.max(
    0,
    ...orderList,
    ...[...patternMap.keys()],
  );

  const patterns: Pattern[] = [];
  for (let i = 0; i <= highestPatNum; i++) {
    const existing = patternMap.get(i);
    if (existing) {
      patterns.push(existing);
    } else {
      // Empty gap pattern
      const emptyChannels: ChannelData[] = Array.from(
        { length: numChannels },
        (_, ch): ChannelData => ({
          id:           `channel-${ch}`,
          name:         `Channel ${ch + 1}`,
          muted:        false,
          solo:         false,
          collapsed:    false,
          volume:       100,
          pan:          stereoMode === 0x00 ? (LRRL_PAN[ch % 4] ?? 0) : 0,
          instrumentId: null,
          color:        null,
          rows:         Array.from({ length: 64 }, (): TrackerCell => ({
            note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
          })),
        }),
      );
      patterns.push({
        id:      `pattern-${i}`,
        name:    `Pattern ${i}`,
        length:  64,
        channels: emptyChannels,
        importMetadata: {
          sourceFormat:            'DTM',
          sourceFile:              filename,
          importedAt:              new Date().toISOString(),
          originalChannelCount:    numChannels,
          originalPatternCount:    numStoredPatterns,
          originalInstrumentCount: maxSampleIndex,
        },
      });
    }
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
    numChannels,
    initialSpeed,
    initialBPM,
    linearPeriods:   false,
  };
}
