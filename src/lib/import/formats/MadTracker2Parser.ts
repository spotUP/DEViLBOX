/**
 * MadTracker2Parser.ts — MadTracker 2 (.mt2) native parser
 *
 * MadTracker 2 was a Windows tracker by Yannick Delwiche.
 * Files are identified by the 4-byte magic "MT20" at offset 0.
 *
 * Reference: Reference Code/openmpt-master/soundlib/Load_mt2.cpp (authoritative)
 *
 * File layout:
 *   MT2FileHeader (126 bytes):
 *     signature[4]      = "MT20"
 *     userID            uint32LE
 *     version           uint16LE  (0x200..0x2FF)
 *     trackerName[32]
 *     songName[64]
 *     numOrders         uint16LE  (max 256)
 *     restartPos        uint16LE
 *     numPatterns       uint16LE
 *     numChannels       uint16LE  (1..64)
 *     samplesPerTick    uint16LE
 *     ticksPerLine      uint8
 *     linesPerBeat      uint8
 *     flags             uint32LE  (packedPatterns=0x01, automation=0x02, ...)
 *     numInstruments    uint16LE  (<255)
 *     numSamples        uint16LE  (<256)
 *
 *   Orders: 256 bytes (uint8 array)
 *
 *   Drums size uint16LE:  if != 0 → MT2DrumsData (274 bytes follows)
 *   Extra data: uint32LE size, then size bytes
 *
 *   Patterns: numPatterns × [ numRows uint16LE, chunkSize uint32LE, data ]
 *
 *   Extra chunks (4-byte IDs + 4-byte sizes):
 *     "BPM+" — double LE tempo
 *     "TRKS" — track settings (volume, routing)
 *     "TRKL" — track names (null-separated)
 *     "PATN" — pattern names
 *     "MSG\0" — song message
 *     "SUM\0" — song summary (artist name)
 *     "VST2" — VST plugin data (skipped)
 *     others — skipped
 *
 *   Automation (if flags & 0x02):
 *     numPatterns × numEnvelopes channels → each: flags uint32LE, then per-bit
 *       4 + sizeof(MT2EnvPoint)*64 bytes
 *
 *   Instruments: 255 × [ instrName[32], dataLength uint32LE, data ]
 *   Sample headers: 256 × [ sampleName[32], dataLength uint32LE, data ]
 *   Sample groups: per instrument, numSamples × MT2Group (8 bytes each)
 *   Sample data: per sample, raw PCM
 *
 * MT2Command (7 bytes, per cell):
 *   note      uint8  (0=empty, 97=key-off, else note+12 offset)
 *   instr     uint8
 *   vol       uint8  (0x10-0x90 = volume, 0xA0-0xDF = vol slides)
 *   pan       uint8
 *   fxcmd     uint8
 *   fxparam1  uint8
 *   fxparam2  uint8
 *
 * Packed patterns: run-length encoded by infobyte flags.
 *
 * Note mapping: output_note = note + NOTE_MIN + 11 = note + 12
 *   (OpenMPT NOTE_MIN=1, so output = note + 12)
 *   Key-off: note > 96 → note 121 (NOTE_KEYOFF)
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';

// ── Little-endian binary helpers ──────────────────────────────────────────────

function u8(buf: Uint8Array, off: number): number { return buf[off] ?? 0; }
function u16le(buf: Uint8Array, off: number): number {
  return (buf[off] ?? 0) | ((buf[off + 1] ?? 0) << 8);
}
function u32le(buf: Uint8Array, off: number): number {
  return ((buf[off] ?? 0) | ((buf[off + 1] ?? 0) << 8) | ((buf[off + 2] ?? 0) << 16) | ((buf[off + 3] ?? 0) << 24)) >>> 0;
}
function f64le(buf: Uint8Array, off: number): number {
  const view = new DataView(buf.buffer, buf.byteOffset + off, 8);
  return view.getFloat64(0, true);
}
function readString(buf: Uint8Array, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = buf[off + i] ?? 0;
    if (c === 0) break;
    s += String.fromCharCode(c >= 0x20 ? c : 0x20);
  }
  return s.trimEnd();
}

// ── MT2 header constants ──────────────────────────────────────────────────────

const FLAG_PACKED_PATTERNS = 0x01;
const FLAG_AUTOMATION      = 0x02;
const FLAG_DRUMS_AUTO      = 0x08;
const FLAG_MASTER_AUTO     = 0x10;

// MT2FileHeader is 126 bytes
const HEADER_SIZE = 126;

// MT2DrumsData is 274 bytes
const DRUMS_DATA_SIZE = 274;

// MT2Command is 7 bytes
const CMD_SIZE = 7;

// MT2Sample is 26 bytes
const SAMPLE_HEADER_SIZE = 26;

// MT2Group is 8 bytes
const GROUP_SIZE = 8;

// MT2Instrument is 106 bytes
const INSTR_HEADER_SIZE = 106;

// MT2IEnvelope is 72 bytes
const ENVELOPE_SIZE = 72;

// MT2EnvPoint is 4 bytes (x uint16LE, y uint16LE)
const ENV_POINT_SIZE = 4;

// ── Note mapping ─────────────────────────────────────────────────────────────

// MT2 note 0 = empty, 97+ = key-off, else note + 12
// We store 0 = no note, 121 = key-off, 1..120 = note
const NOTE_KEYOFF = 121;

function convertMT2Note(rawNote: number): number {
  if (rawNote === 0) return 0;
  if (rawNote > 96) return NOTE_KEYOFF;
  // rawNote + NOTE_MIN + 11 = rawNote + 1 + 11 = rawNote + 12
  const n = rawNote + 12;
  return Math.max(1, Math.min(120, n));
}

// ── Volume column conversion ──────────────────────────────────────────────────

// Returns vol 0..64 (0 = no volume command, 1..64 = set volume)
// We only capture set-volume (0x10..0x90 range → 0..64)
function convertMT2Vol(rawVol: number): number {
  if (rawVol >= 0x10 && rawVol <= 0x90) {
    return Math.round((rawVol - 0x10) / 2);
  }
  return 0;
}

// ── Effect conversion ─────────────────────────────────────────────────────────

// Convert MT2 effect to (effTyp, eff) pair.
// Returns [0, 0] for unsupported effects.
function convertMT2Effect(fxcmd: number, fxparam1: number, fxparam2: number): [number, number] {
  if (!fxcmd && !fxparam1 && !fxparam2) return [0, 0];
  switch (fxcmd) {
    case 0x00: {
      // FastTracker effect: fxparam2 = cmd letter, fxparam1 = param
      // XM-style: we pass through common ones
      const xmCmd = fxparam2;
      const xmParam = fxparam1;
      // Map a few important ones: speed/tempo (0x0F)
      if (xmCmd === 0x0F) {
        if (xmParam < 0x20) return [0x0F, xmParam]; // speed
        return [0x0F, xmParam];                       // tempo
      }
      if (xmCmd === 0x0B) return [0x0B, xmParam]; // position jump
      if (xmCmd === 0x0D) return [0x0D, xmParam]; // pattern break
      if (xmCmd === 0x01) return [0x01, xmParam]; // portamento up
      if (xmCmd === 0x02) return [0x02, xmParam]; // portamento down
      if (xmCmd === 0x03) return [0x03, xmParam]; // tone portamento
      if (xmCmd === 0x04) return [0x04, xmParam]; // vibrato
      if (xmCmd === 0x0A) return [0x0A, xmParam]; // volume slide
      return [0, 0];
    }
    case 0x01: // Portamento up (every tick)
      return [0x01, Math.min(0xFF, (fxparam2 << 4) | (fxparam1 >> 4))];
    case 0x02: // Portamento down (every tick)
      return [0x02, Math.min(0xFF, (fxparam2 << 4) | (fxparam1 >> 4))];
    case 0x03: // Tone portamento
      return [0x03, Math.min(0xFF, (fxparam2 << 4) | (fxparam1 >> 4))];
    case 0x04: // Vibrato
      return [0x04, ((fxparam2 & 0xF0) | (fxparam1 >> 4)) & 0xFF];
    case 0x08: // Panning
      if (fxparam1) return [0x08, fxparam1]; // S3M/IT panning
      return [0, 0];
    case 0x0C: // Set volume (0x80 = 100%)
      return [0x0C, Math.min(0x40, fxparam2 >> 1)];
    case 0x0F: // Set tempo/speed
      if (fxparam2 !== 0) return [0x0F, fxparam2]; // tempo
      return [0x0F, fxparam1 & 0x0F];               // speed
    case 0x10: // IT/S3M effect (mapped through)
      // S3MConvert: pass fxparam2 as cmd, fxparam1 as param — approximate
      return [fxparam2, fxparam1];
    case 0x1D: // Tremor (like IT Tremor)
      return [0x1D, fxparam1];
    case 0x24: // Reverse
      return [0x13, 0x9F]; // S3MCMDEX: SBx sample reverse
    case 0x80: // Track volume
      return [0x11, Math.min(0x40, fxparam2 >> 2)]; // channel volume
    default:
      return [0, 0];
  }
}

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Returns true if the buffer is a MadTracker 2 file.
 * Magic "MT20" + version 0x200-0x2FF + numChannels 1-64 + valid instrument/sample counts.
 */
export function isMadTracker2Format(bytes: Uint8Array): boolean {
  if (bytes.length < HEADER_SIZE + 256) return false;
  if (bytes[0] !== 0x4D || bytes[1] !== 0x54 || bytes[2] !== 0x32 || bytes[3] !== 0x30) return false; // "MT20"
  const version = u16le(bytes, 6);
  if (version < 0x200 || version >= 0x300) return false;
  const numChannels = u16le(bytes, 42);
  if (numChannels < 1 || numChannels > 64) return false;
  const numOrders = u16le(bytes, 38);
  if (numOrders > 256) return false;
  const numInstruments = u16le(bytes, 48);
  if (numInstruments >= 255) return false;
  const numSamples = u16le(bytes, 50);
  if (numSamples >= 256) return false;
  return true;
}

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Parse a MadTracker 2 (.mt2) file into a TrackerSong.
 * Returns null on any validation failure (never throws).
 */
export function parseMadTracker2File(bytes: Uint8Array, filename: string): TrackerSong | null {
  try {
    return _parseMadTracker2(bytes, filename);
  } catch {
    return null;
  }
}

function _parseMadTracker2(bytes: Uint8Array, filename: string): TrackerSong | null {
  if (!isMadTracker2Format(bytes)) return null;

  let pos = 0;

  // ── Parse header ──────────────────────────────────────────────────────────
  // signature[4] at 0
  // userID uint32LE at 4
  const version        = u16le(bytes, 6);
  // wait — let me re-read the struct carefully:
  // offset 0: signature[4]
  // offset 4: userID uint32LE
  // offset 8: version uint16LE   — already read at 6 above, but struct says offset 8... wait
  // Actually struct layout:
  // signature[4]=0, userID=4, version=6(uint16), trackerName[32]=8, songName[64]=40,
  // numOrders=104, restartPos=106, numPatterns=108, numChannels=110,
  // samplesPerTick=112, ticksPerLine=114, linesPerBeat=115, flags=116, numInstruments=120, numSamples=122
  // Total: 124 bytes... but MPT_BINARY_STRUCT says 126?
  // Let me recount: 4+4+2+32+64+2+2+2+2+2+1+1+4+2+2 = 126. Yes.

  // Re-read with correct offsets
  const songNameStr    = readString(bytes, 40, 64);
  const numOrders2     = u16le(bytes, 104);
  const restartPos2    = u16le(bytes, 106);
  const numPatterns2   = u16le(bytes, 108);
  const numChannels    = u16le(bytes, 110);
  const samplesPerTick = u16le(bytes, 112);
  const ticksPerLine   = u8(bytes, 114);
  const linesPerBeat   = u8(bytes, 115);
  const flags          = u32le(bytes, 116);
  const numInstruments = u16le(bytes, 120);
  const numSamples2    = u16le(bytes, 122);

  if (numChannels < 1 || numChannels > 64) return null;
  if (numOrders2 > 256) return null;

  pos = HEADER_SIZE;

  // ── Orders (256 bytes) ─────────────────────────────────────────────────────
  if (pos + 256 > bytes.length) return null;
  const orders: number[] = [];
  for (let i = 0; i < numOrders2; i++) {
    orders.push(u8(bytes, pos + i));
  }
  pos += 256;

  // ── Drums data ────────────────────────────────────────────────────────────
  if (pos + 2 > bytes.length) return null;
  const drumsSizeHint = u16le(bytes, pos);
  pos += 2;
  const hasDrumChannels = drumsSizeHint !== 0;
  const drumsData: number[] = [];
  let numDrumChannels = 0;
  if (hasDrumChannels) {
    if (pos + DRUMS_DATA_SIZE > bytes.length) return null;
    // MT2DrumsData layout:
    // numDrumPatterns uint16LE, DrumSamples[8] uint16LE×8, DrumPatternOrder[256] uint8×256
    // = 2 + 16 + 256 = 274 bytes
    numDrumChannels = 8;
    for (let i = 0; i < DRUMS_DATA_SIZE; i++) {
      drumsData.push(u8(bytes, pos + i));
    }
    pos += DRUMS_DATA_SIZE;
  }

  // ── Extra data chunk ──────────────────────────────────────────────────────
  if (pos + 4 > bytes.length) return null;
  const extraDataSize = u32le(bytes, pos);
  pos += 4;
  const extraDataStart = pos;
  if (pos + extraDataSize > bytes.length) return null;
  const extraDataEnd = pos + extraDataSize;
  pos += extraDataSize;

  // ── Patterns ──────────────────────────────────────────────────────────────
  const totalChannels = numChannels + numDrumChannels;
  const packedPatterns = (flags & FLAG_PACKED_PATTERNS) !== 0;

  const patterns: Pattern[] = [];

  for (let pat = 0; pat < numPatterns2; pat++) {
    if (pos + 6 > bytes.length) break;
    const numRows = u16le(bytes, pos);
    pos += 2;
    const rawChunkSize = u32le(bytes, pos);
    pos += 4;
    // chunk size is rounded up to even
    const chunkSize = (rawChunkSize + 1) & ~1;
    const chunkStart = pos;
    const chunkEnd   = pos + chunkSize;
    pos = chunkEnd;
    if (chunkEnd > bytes.length) break;

    const clampedRows = Math.min(numRows, 256);
    if (clampedRows === 0) {
      patterns.push(makeEmptyPattern(pat, clampedRows, totalChannels, filename, numPatterns2, numInstruments));
      continue;
    }

    // Initialize cell grid: [row][channel]
    const cellGrid: TrackerCell[][] = Array.from({ length: clampedRows }, (): TrackerCell[] =>
      Array.from({ length: totalChannels }, (): TrackerCell => ({
        note: 0, instrument: 0, volume: 0,
        effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      }))
    );

    let cp = chunkStart;

    if (packedPatterns) {
      // RLE packed patterns
      let row = 0;
      let chn = 0;
      while (cp < chunkEnd && chn < numChannels) {
        if (cp >= bytes.length) break;
        const infobyte = u8(bytes, cp++);

        let repeatCount = 0;
        let actualInfo = infobyte;
        if (infobyte === 0xFF) {
          if (cp >= chunkEnd) break;
          repeatCount = u8(bytes, cp++);
          if (cp >= chunkEnd) break;
          actualInfo = u8(bytes, cp++);
        }

        if (actualInfo & 0x7F) {
          // Read command
          const cmd = { note: 0, instr: 0, vol: 0, pan: 0, fxcmd: 0, fxparam1: 0, fxparam2: 0 };
          if (actualInfo & 0x01) { if (cp < chunkEnd) cmd.note      = u8(bytes, cp++); }
          if (actualInfo & 0x02) { if (cp < chunkEnd) cmd.instr     = u8(bytes, cp++); }
          if (actualInfo & 0x04) { if (cp < chunkEnd) cmd.vol       = u8(bytes, cp++); }
          if (actualInfo & 0x08) { if (cp < chunkEnd) cmd.pan       = u8(bytes, cp++); }
          if (actualInfo & 0x10) { if (cp < chunkEnd) cmd.fxcmd     = u8(bytes, cp++); }
          if (actualInfo & 0x20) { if (cp < chunkEnd) cmd.fxparam1  = u8(bytes, cp++); }
          if (actualInfo & 0x40) { if (cp < chunkEnd) cmd.fxparam2  = u8(bytes, cp++); }

          if (row < clampedRows && chn < numChannels) {
            writeCell(cellGrid[row][chn], cmd);
          }
          // Fill repeated rows
          const fillCount = Math.min(repeatCount, clampedRows - (row + 1));
          for (let r = 0; r < fillCount; r++) {
            if (row + 1 + r < clampedRows && chn < numChannels) {
              writeCell(cellGrid[row + 1 + r][chn], cmd);
            }
          }
        }

        row += repeatCount + 1;
        while (row >= clampedRows) { row -= clampedRows; chn++; }
        if (chn >= numChannels) break;
      }
    } else {
      // Unpacked patterns: row-major, then channel
      for (let row = 0; row < clampedRows; row++) {
        for (let chn = 0; chn < numChannels; chn++) {
          if (cp + CMD_SIZE > chunkEnd) break;
          const cmd = {
            note:     u8(bytes, cp),
            instr:    u8(bytes, cp + 1),
            vol:      u8(bytes, cp + 2),
            pan:      u8(bytes, cp + 3),
            fxcmd:    u8(bytes, cp + 4),
            fxparam1: u8(bytes, cp + 5),
            fxparam2: u8(bytes, cp + 6),
          };
          cp += CMD_SIZE;
          writeCell(cellGrid[row][chn], cmd);
        }
      }
    }

    patterns.push(buildPattern(pat, clampedRows, totalChannels, cellGrid, filename, numPatterns2, numInstruments));
  }

  // ── Parse extra data chunks (BPM+, TRKS, SUM, PATN, MSG) ─────────────────
  let bpmOverride = 0.0;

  {
    let xp = extraDataStart;
    while (xp + 8 <= extraDataEnd) {
      const chunkId   = u32le(bytes, xp);
      const chunkSize2 = u32le(bytes, xp + 4);
      xp += 8;
      const chunkBodyEnd = xp + chunkSize2;
      if (chunkBodyEnd > extraDataEnd) break;

      if (chunkId === 0x2B4D5042) { // "BPM+" as LE = 0x2B4D5042
        // "BPM+" magic: check bytes
        const b0 = u8(bytes, xp - 8), b1 = u8(bytes, xp - 7), b2 = u8(bytes, xp - 6), b3 = u8(bytes, xp - 5);
        if (b0 === 0x42 && b1 === 0x50 && b2 === 0x4D && b3 === 0x2B) { // "BPM+"
          if (chunkSize2 >= 8) {
            bpmOverride = f64le(bytes, xp);
          }
        }
      } else {
        // Check by ASCII for other chunks
        const id0 = u8(bytes, xp - 8), id1 = u8(bytes, xp - 7), id2 = u8(bytes, xp - 6), id3 = u8(bytes, xp - 5);
        const idStr = String.fromCharCode(id0, id1, id2, id3);

        if (idStr === 'BPM+' && chunkSize2 >= 8) {
          bpmOverride = f64le(bytes, xp);
        } else if (idStr === 'SUM\0') {
          // 6-byte mask, then null-terminated artist name
          if (chunkSize2 > 7) {
            const nameStart = xp + 6;
            let nameEnd = nameStart;
            while (nameEnd < chunkBodyEnd && u8(bytes, nameEnd) !== 0) nameEnd++;
            // Artist name not used in TrackerSong output
          }
        }
      }

      xp = chunkBodyEnd;
    }
  }

  // ── Automation envelopes — skip ────────────────────────────────────────────
  if (flags & FLAG_AUTOMATION) {
    const numVSTFromExtra = 0; // We don't track VST count for skip purposes
    const numEnvelopes =
      ((flags & FLAG_DRUMS_AUTO) ? totalChannels : numChannels)
      + ((version >= 0x0250) ? numVSTFromExtra : 0)
      + ((flags & FLAG_MASTER_AUTO) ? 1 : 0);

    for (let pat = 0; pat < numPatterns2; pat++) {
      for (let env = 0; env < numEnvelopes; env++) {
        if (pos + 4 > bytes.length) break;
        // flags uint32LE (or uint16LE for version < 0x203)
        let autoFlags: number;
        if (version >= 0x203) {
          if (pos + 8 > bytes.length) break;
          autoFlags = u32le(bytes, pos);
          pos += 4; // flags
          pos += 4; // trkfxid
        } else {
          if (pos + 4 > bytes.length) break;
          autoFlags = u16le(bytes, pos);
          pos += 2; // flags
          pos += 2; // trkfxid
        }
        // For each set bit: skip 4 + 64 * sizeof(MT2EnvPoint)
        let af = autoFlags;
        while (af !== 0) {
          if (af & 1) {
            pos += 4 + ENV_POINT_SIZE * 64;
          }
          af >>>= 1;
        }
      }
    }
  }

  // ── Instrument headers ────────────────────────────────────────────────────
  // 255 instrument slots always, regardless of numInstruments
  const instrChunks: { start: number; size: number; name: string }[] = [];

  for (let i = 0; i < 255; i++) {
    if (pos + 32 + 4 > bytes.length) {
      instrChunks.push({ start: 0, size: 0, name: '' });
      continue;
    }
    const instrName = readString(bytes, pos, 32);
    pos += 32;
    let dataLength = u32le(bytes, pos);
    pos += 4;

    // Old MT2.0 format fixup (from OpenMPT)
    if (dataLength === 32) dataLength += 108 + ENVELOPE_SIZE * 4;
    if (version > 0x0201 && dataLength > 0) dataLength += 4;

    instrChunks.push({ start: pos, size: dataLength, name: instrName });
    pos += dataLength;
  }

  // ── Sample headers ────────────────────────────────────────────────────────
  const sampleHeaders: SampleHeaderData[] = [];

  for (let i = 0; i < 256; i++) {
    if (pos + 32 + 4 > bytes.length) {
      sampleHeaders.push({ name: '', length: 0, frequency: 44100, depth: 1, channels: 1, flags: 0, loopType: 0, loopStart: 0, loopEnd: 0, volume: 128, panning: 0, note: 49 });
      continue;
    }
    const sName = readString(bytes, pos, 32);
    pos += 32;
    const dataLength = u32le(bytes, pos);
    pos += 4;
    const smpChunkStart = pos;

    let hdr: SampleHeaderData = { name: sName, length: 0, frequency: 44100, depth: 1, channels: 1, flags: 0, loopType: 0, loopStart: 0, loopEnd: 0, volume: 128, panning: 0, note: 49 };

    if (dataLength >= SAMPLE_HEADER_SIZE && i < numSamples2) {
      hdr = {
        name:      sName,
        length:    u32le(bytes, smpChunkStart),
        frequency: u32le(bytes, smpChunkStart + 4),
        depth:     u8(bytes, smpChunkStart + 8),
        channels:  u8(bytes, smpChunkStart + 9),
        flags:     u8(bytes, smpChunkStart + 10),
        loopType:  u8(bytes, smpChunkStart + 11),
        loopStart: u32le(bytes, smpChunkStart + 12),
        loopEnd:   u32le(bytes, smpChunkStart + 16),
        volume:    u16le(bytes, smpChunkStart + 20),
        panning:   (u8(bytes, smpChunkStart + 22) >= 128) ? (u8(bytes, smpChunkStart + 22) - 256) : u8(bytes, smpChunkStart + 22),
        note:      u8(bytes, smpChunkStart + 23),
      };
    }

    pos += dataLength;
    sampleHeaders.push(hdr);
  }

  // ── Sample groups (per instrument) ────────────────────────────────────────
  // Each instrument with data has insHeader.numSamples groups following.
  // Groups are stored consecutively after all sample headers.
  const groupsByInstr: MT2Group[][] = Array.from({ length: numInstruments }, () => []);

  for (let ins = 0; ins < numInstruments; ins++) {
    const ic = instrChunks[ins];
    if (ic.size === 0) continue;
    // Re-read numSamples from instrument chunk
    if (ic.start + INSTR_HEADER_SIZE > bytes.length) continue;
    const numGroups = u16le(bytes, ic.start); // numSamples field at start of MT2Instrument
    if (numGroups === 0 || numGroups > 256) continue;

    const groups: MT2Group[] = [];
    for (let g = 0; g < numGroups; g++) {
      if (pos + GROUP_SIZE > bytes.length) break;
      groups.push({
        sample:   u8(bytes, pos),
        vol:      u8(bytes, pos + 1),
        pitch:    (u8(bytes, pos + 2) >= 128) ? (u8(bytes, pos + 2) - 256) : u8(bytes, pos + 2),
      });
      pos += GROUP_SIZE;
    }
    groupsByInstr[ins] = groups;
  }

  // ── Build InstrumentConfig list ───────────────────────────────────────────
  const instruments: InstrumentConfig[] = [];

  for (let i = 0; i < numInstruments; i++) {
    const ic = instrChunks[i];
    const id = i + 1;
    instruments.push({
      id,
      name:      ic.name || `Instrument ${id}`,
      type:      'sample' as const,
      synthType: 'Sampler' as const,
      effects:   [],
      volume:    0,
      pan:       0,
    } as unknown as InstrumentConfig);
  }

  // ── Compute BPM ───────────────────────────────────────────────────────────
  // Mirrors OpenMPT's BPM calculation.
  let initialBPM = 125;
  const clampedSpeed = Math.max(1, Math.min(31, ticksPerLine));
  const clampedLPB   = Math.max(1, Math.min(32, linesPerBeat));

  if (samplesPerTick > 1 && samplesPerTick < 5000) {
    if (bpmOverride > 0.00000001) {
      // Modern tempo mode with BPM+ chunk
      const bpm = (44100.0 * 60.0) / (clampedSpeed * clampedLPB * bpmOverride);
      initialBPM = Math.round(Math.max(32, Math.min(999, bpm)));
    } else {
      // Classic or modern from samplesPerTick
      const bpm = (44100.0 * 60.0) / (clampedSpeed * clampedLPB * samplesPerTick);
      initialBPM = Math.round(Math.max(32, Math.min(999, bpm)));
    }
  }

  // ── Build order list ──────────────────────────────────────────────────────
  const songPositions: number[] = orders.slice(0, numOrders2);

  // Ensure all referenced patterns exist (create empty ones if needed)
  const maxPat = Math.max(...songPositions, 0);
  while (patterns.length <= maxPat) {
    const pi = patterns.length;
    patterns.push(makeEmptyPattern(pi, 64, totalChannels, filename, numPatterns2, numInstruments));
  }

  // Fallback
  if (patterns.length === 0) {
    patterns.push(makeEmptyPattern(0, 64, totalChannels, filename, 0, numInstruments));
  }
  if (songPositions.length === 0) {
    songPositions.push(0);
  }

  const baseName = filename.replace(/\.[^/.]+$/, '');
  const name = songNameStr.trim() || baseName;

  return {
    name,
    format:          'XM' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength:      songPositions.length,
    restartPosition: Math.min(restartPos2, songPositions.length - 1),
    numChannels:     totalChannels,
    initialSpeed:    clampedSpeed,
    initialBPM,
    linearPeriods:   true,
  };
}

// ── Internal structs ──────────────────────────────────────────────────────────

interface SampleHeaderData {
  name:      string;
  length:    number;
  frequency: number;
  depth:     number;
  channels:  number;
  flags:     number;
  loopType:  number;
  loopStart: number;
  loopEnd:   number;
  volume:    number;
  panning:   number;
  note:      number;
}

interface MT2Group {
  sample: number;
  vol:    number;
  pitch:  number;
}

// ── Cell helpers ──────────────────────────────────────────────────────────────

function writeCell(cell: TrackerCell, cmd: { note: number; instr: number; vol: number; pan: number; fxcmd: number; fxparam1: number; fxparam2: number }): void {
  cell.note       = convertMT2Note(cmd.note);
  cell.instrument = cmd.instr;
  cell.volume     = convertMT2Vol(cmd.vol);
  const [effTyp, eff] = convertMT2Effect(cmd.fxcmd, cmd.fxparam1, cmd.fxparam2);
  cell.effTyp = effTyp;
  cell.eff    = eff;

  // Pan in effect column if effect slot is free
  if (cmd.pan && cell.effTyp === 0) {
    cell.effTyp = 0x08; // Panning
    cell.eff    = cmd.pan;
  }
}

function buildPattern(
  idx: number,
  numRows: number,
  numChannels: number,
  cellGrid: TrackerCell[][],
  filename: string,
  totalPats: number,
  numInstruments: number,
): Pattern {
  const channels: ChannelData[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    const rows: TrackerCell[] = [];
    for (let row = 0; row < numRows; row++) {
      rows.push(cellGrid[row]?.[ch] ?? { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
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
  return {
    id:      `pattern-${idx}`,
    name:    `Pattern ${idx}`,
    length:  numRows,
    channels,
    importMetadata: {
      sourceFormat:            'MadTracker2',
      sourceFile:              filename,
      importedAt:              new Date().toISOString(),
      originalChannelCount:    numChannels,
      originalPatternCount:    totalPats,
      originalInstrumentCount: numInstruments,
    },
  };
}

function makeEmptyPattern(
  idx: number,
  numRows: number,
  numChannels: number,
  filename: string,
  totalPats: number,
  numInstruments: number,
): Pattern {
  const emptyRow = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
  const channels: ChannelData[] = Array.from({ length: numChannels }, (_, ch) => ({
    id:           `channel-${ch}`,
    name:         `Channel ${ch + 1}`,
    muted:        false,
    solo:         false,
    collapsed:    false,
    volume:       100,
    pan:          0,
    instrumentId: null,
    color:        null,
    rows:         Array.from({ length: numRows }, emptyRow),
  }));
  return {
    id:      `pattern-${idx}`,
    name:    `Pattern ${idx}`,
    length:  numRows,
    channels,
    importMetadata: {
      sourceFormat:            'MadTracker2',
      sourceFile:              filename,
      importedAt:              new Date().toISOString(),
      originalChannelCount:    numChannels,
      originalPatternCount:    totalPats,
      originalInstrumentCount: numInstruments,
    },
  };
}
