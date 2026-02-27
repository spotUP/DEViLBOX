/**
 * ITParser.ts — Impulse Tracker (.it) and OpenMPT (.mptm) format parser
 *
 * IT Header (0xC0 = 192 bytes):
 *   +0x00  magic[4] = "IMPM"
 *   +0x04  songname[26]
 *   +0x1E  hilight[2]
 *   +0x20  ordnum u16LE
 *   +0x22  insnum u16LE
 *   +0x24  smpnum u16LE
 *   +0x26  patnum u16LE
 *   +0x28  cwtv u16LE      (created-with tracker version)
 *   +0x2A  cmwt u16LE      (compatible-with tracker version; >= 0x200 = instrument mode possible)
 *   +0x2C  flags u16LE     (0x04 = use instruments, 0x08 = linear slides)
 *   +0x2E  special u16LE
 *   +0x30  globalvol u8
 *   +0x31  mv u8           (mix volume)
 *   +0x32  speed u8
 *   +0x33  tempo u8
 *   +0x34  sep u8          (panning separation)
 *   +0x35  pwd u8          (pitch wheel depth)
 *   +0x36  msglength u16LE
 *   +0x38  msgoffset u32LE
 *   +0x3C  reserved u32
 *   +0x40  chnpan[64]      (0-64 = L→R, 100 = surround, +128 = disabled)
 *   +0x80  chnvol[64]      (0-64)
 *
 * Offset tables (base = 0xC0):
 *   orders[ordnum]       u8  (255=end, 254=skip)
 *   instOffsets[insnum]  u32LE
 *   sampleOffsets[smpnum] u32LE
 *   patternOffsets[patnum] u32LE
 *
 * Sample header (80 bytes, "IMPS" magic):
 *   +0x00  magic[4] = "IMPS"
 *   +0x04  filename[12]
 *   +0x10  zero u8
 *   +0x11  gvl u8          (global volume 0-64)
 *   +0x12  flags u8        (0x01=has data, 0x02=16-bit, 0x04=stereo,
 *                           0x08=compressed, 0x10=loop, 0x20=sustain,
 *                           0x40=pingpong loop, 0x80=pingpong sustain)
 *   +0x13  vol u8          (default volume 0-64)
 *   +0x14  name[26]
 *   +0x2E  cvt u8          (0x01=signed; if NOT set → unsigned)
 *   +0x2F  dfp u8          (panning: bit7=use panning, bits 0-5 = 0-63)
 *   +0x30  length u32LE
 *   +0x34  loopbegin u32LE
 *   +0x38  loopend u32LE
 *   +0x3C  C5Speed u32LE
 *   +0x40  susloopbegin u32LE
 *   +0x44  susloopend u32LE
 *   +0x48  samplepointer u32LE
 *   +0x4C  vis u8, vid u8, vir u8, vit u8
 *
 * Instrument header (554 bytes, "IMPI" magic, only when flags & 0x04 and cmwt >= 0x200):
 *   +0x00  magic[4] = "IMPI"
 *   +0x04  filename[12]
 *   +0x10  zero u8
 *   +0x11  nna u8          (new note action)
 *   +0x12  dct u8          (duplicate check type)
 *   +0x13  dca u8          (duplicate check action)
 *   +0x14  fadeout u16LE
 *   +0x16  pps u8, ppc u8
 *   +0x18  gbv u8          (global volume 0-128)
 *   +0x19  dfp u8          (default panning: bit7=use, bits 0-6 = 0-64)
 *   +0x1A  rv u8, rp u8
 *   +0x1C  trkver u16LE
 *   +0x1E  nos u8          (number of samples)
 *   +0x1F  reserved u8
 *   +0x20  name[26]
 *   +0x3A  ifc u8, ifr u8
 *   +0x3C  mch u8, mpr u8
 *   +0x3E  midibank u16LE
 *   +0x40  keyboard[240]   (note[120] then sample1based[120])
 *   +0x130 volenv[82]
 *   +0x182 panenv[82]
 *   +0x1D4 pitchenv[82]
 *
 * Envelope (82 bytes):
 *   +0  flags u8    (0x01=on, 0x02=loop, 0x04=sustain)
 *   +1  num u8      (number of nodes, 0-25)
 *   +2  lpb u8      (loop begin node)
 *   +3  lpe u8      (loop end node)
 *   +4  slb u8      (sustain loop begin)
 *   +5  sle u8      (sustain loop end)
 *   +6  nodes[25]   (3 bytes each: value u8, tick u16LE)
 *
 * Pattern (packed RLE):
 *   header: packed_len u16LE, rows u16LE, reserved[4]
 *   Row decode:
 *     channel byte; if 0 → end of row
 *     channel = (byte - 1) & 63
 *     if byte & 0x80: read maskvariable u8; else reuse lastmask[channel]
 *     mask bits:
 *       0x01: read note u8  (0-119=note, 120=fade, 254=cut, 255=none)
 *       0x02: read instrument u8
 *       0x04: read volcmd u8
 *       0x08: read command u8, param u8
 *       0x10: use lastnote[channel]
 *       0x20: use lastinst[channel]
 *       0x40: use lastvol[channel]
 *       0x80: use lastcmd/param[channel]
 *
 * Reference: OpenMPT Load_it.cpp, ITTools.h, ITCompression.cpp
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell } from '@/types';
import type { ParsedSample, ParsedInstrument, EnvelopePoints, EnvelopePoint } from '@/types/tracker';
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

const ROWS_PER_PATTERN = 64; // default; IT patterns specify their own row count
const IT_NOTE_FADE     = 120;
const IT_NOTE_CUT      = 254;
const IT_NOTE_NONE     = 255;
const XM_NOTE_OFF      = 97;   // note cut in XM convention

// ── Format detection ──────────────────────────────────────────────────────────

/** Returns true if buffer has "IMPM" magic at offset 0. */
export function isITFormat(buffer: Uint8Array | ArrayBuffer): boolean {
  const raw = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (raw.length < 0xC0) return false;
  return raw[0] === 0x49 &&  // 'I'
         raw[1] === 0x4D &&  // 'M'
         raw[2] === 0x50 &&  // 'P'
         raw[3] === 0x4D;    // 'M'
}

// ── IT decompressor ───────────────────────────────────────────────────────────

/**
 * Decompress IT-compressed samples (IT2.14+ compression).
 * Reference: OpenMPT ITCompression.cpp, Load_it.cpp.
 *
 * Format: stream of blocks, each prefixed by uint16LE = compressed block size.
 * Within each block, bits are read LSB-first with variable-width accumulator.
 *
 * 8-bit mode (initial width = 9):
 *   width < 7:
 *     raw == (1<<width)-1 → widen; else delta = raw - ((1<<(width-1))-1)
 *   7 ≤ width < 9:
 *     hi = 1<<(width-1)
 *     raw == hi+1 → set width = raw & 0xFF
 *     raw == hi   → widen
 *     else        → signed delta
 *   width == 9:
 *     raw < 256 → delta = int8(raw)
 *     (raw>>1) & 0xFF → set width = ((raw>>1)&0xFF)+1
 *     else       → widen
 *
 * 16-bit mode: same structure, initial width=17, thresholds shift by 8.
 */
function decompressITSamples(
  src: Uint8Array,
  destLen: number,
  is16bit: boolean,
): ArrayBuffer {
  const out    = new ArrayBuffer(destLen * (is16bit ? 2 : 1));
  const outI8  = new Int8Array(out);
  const outI16 = new Int16Array(out);
  let srcPos   = 0;
  let destPos  = 0;

  // Bit reader state (per block)
  let blockBits   = 0;
  let bitBuf      = 0;
  let blockBytes: Uint8Array | null = null;
  let blockPos    = 0;

  function readBit(): number {
    if (blockBits === 0) return 0;
    const bit = bitBuf & 1;
    bitBuf >>= 1;
    blockBits--;
    if (blockBits === 0 && blockPos < (blockBytes?.length ?? 0)) {
      bitBuf    = blockBytes![blockPos++];
      blockBits = 8;
    }
    return bit;
  }

  function readBits(n: number): number {
    let val = 0;
    for (let i = 0; i < n; i++) {
      val |= readBit() << i;
    }
    return val;
  }

  while (srcPos + 2 <= src.length && destPos < destLen) {
    // Read block size
    const blockSize = src[srcPos] | (src[srcPos + 1] << 8);
    srcPos += 2;
    if (srcPos + blockSize > src.length) break;

    // Initialize bit reader for this block
    blockBytes = src.subarray(srcPos, srcPos + blockSize);
    srcPos    += blockSize;
    blockPos   = 0;
    // Pre-load first byte
    bitBuf    = blockBytes.length > 0 ? blockBytes[blockPos++] : 0;
    blockBits = blockBytes.length > 0 ? 8 : 0;

    if (!is16bit) {
      // 8-bit decompression
      let width  = 9;
      let accum  = 0; // int8 accumulator

      while (destPos < destLen) {
        const raw = readBits(width);

        if (width < 7) {
          const limit = (1 << width) - 1;
          if (raw === limit) { width++; continue; }
          // Signed delta: map [0..limit-1] to [-(limit>>1)..(limit>>1)]
          const delta = raw - ((1 << (width - 1)) - 1);
          accum = ((accum + delta) & 0xFF) << 24 >> 24; // int8
          outI8[destPos++] = accum;
        } else if (width < 9) {
          const hi = 1 << (width - 1);
          if (raw === hi + 1) {
            // Set new width
            const newWidth = raw & 0xFF;
            width = newWidth === 0 ? 1 : Math.min(newWidth, 9);
            continue;
          } else if (raw === hi) {
            width++;
            continue;
          } else {
            // Signed delta
            const delta = raw < hi ? raw : raw - (hi << 1);
            accum = ((accum + delta) & 0xFF) << 24 >> 24;
            outI8[destPos++] = accum;
          }
        } else {
          // width == 9
          if (raw < 256) {
            // Normal value (already int8)
            accum = (raw & 0xFF) << 24 >> 24;
            outI8[destPos++] = accum;
          } else {
            const inner = (raw >> 1) & 0xFF;
            if (inner) {
              width = inner + 1;
            } else {
              width++;
            }
          }
        }
      }
    } else {
      // 16-bit decompression
      let width  = 17;
      let accum  = 0; // int16 accumulator

      while (destPos < destLen) {
        const raw = readBits(width);

        if (width < 7) {
          const limit = (1 << width) - 1;
          if (raw === limit) { width++; continue; }
          const delta = raw - ((1 << (width - 1)) - 1);
          accum = ((accum + delta) & 0xFFFF) << 16 >> 16; // int16
          outI16[destPos++] = accum;
        } else if (width < 17) {
          const hi = 1 << (width - 1);
          if (raw === hi + 1) {
            const newWidth = raw & 0xFF;
            width = newWidth === 0 ? 1 : Math.min(newWidth, 17);
            continue;
          } else if (raw === hi) {
            width++;
            continue;
          } else {
            const delta = raw < hi ? raw : raw - (hi << 1);
            accum = ((accum + delta) & 0xFFFF) << 16 >> 16;
            outI16[destPos++] = accum;
          }
        } else {
          // width == 17
          if (raw < 0x10000) {
            accum = (raw & 0xFFFF) << 16 >> 16;
            outI16[destPos++] = accum;
          } else {
            const inner = (raw >> 1) & 0xFF;
            if (inner) {
              width = inner + 1;
            } else {
              width++;
            }
          }
        }
      }
    }
  }

  return out;
}

// ── Envelope reader ───────────────────────────────────────────────────────────

/**
 * Parse a 82-byte IT envelope into EnvelopePoints.
 * Returns undefined if the envelope is disabled or has no nodes.
 */
function readEnvelope(v: DataView, off: number): EnvelopePoints | undefined {
  const flags = u8(v, off);
  const num   = u8(v, off + 1);
  const lpb   = u8(v, off + 2);
  const lpe   = u8(v, off + 3);
  const slb   = u8(v, off + 4);

  if (!(flags & 0x01) || num === 0) return undefined;

  const points: EnvelopePoint[] = [];
  for (let i = 0; i < num && i < 25; i++) {
    const nodeOff = off + 6 + i * 3;
    const value   = u8(v, nodeOff);
    const tick    = u16le(v, nodeOff + 1);
    points.push({ tick, value });
  }

  return {
    enabled:        true,
    points,
    sustainPoint:   (flags & 0x04) ? slb : null,
    loopStartPoint: (flags & 0x02) ? lpb : null,
    loopEndPoint:   (flags & 0x02) ? lpe : null,
  };
}

// ── Sample reader ─────────────────────────────────────────────────────────────

/** Parse one IT sample header and extract PCM data. Returns null for empty samples. */
function readITSample(
  v: DataView,
  raw: Uint8Array,
  smpOff: number,
  id: number,
): ParsedSample | null {
  if (smpOff + 80 > v.byteLength) return null;

  // Verify "IMPS" magic
  if (u8(v, smpOff) !== 0x49 || u8(v, smpOff + 1) !== 0x4D ||
      u8(v, smpOff + 2) !== 0x50 || u8(v, smpOff + 3) !== 0x53) {
    return null;
  }

  const flags         = u8(v, smpOff + 0x12);
  const vol           = Math.min(u8(v, smpOff + 0x13), 64);
  const sampleName    = readString(v, smpOff + 0x14, 26);
  const name          = sampleName.replace(/\0/g, '').trim() || `Sample ${id}`;
  const cvt           = u8(v, smpOff + 0x2E);
  const dfp           = u8(v, smpOff + 0x2F);
  const length        = u32le(v, smpOff + 0x30);
  const loopbegin     = u32le(v, smpOff + 0x34);
  const loopend       = u32le(v, smpOff + 0x38);
  const c5speed       = u32le(v, smpOff + 0x3C);
  const samplepointer = u32le(v, smpOff + 0x48);

  // Bit 0x01 of flags = sample data present
  if (!(flags & 0x01) || length === 0 || samplepointer === 0 || samplepointer >= v.byteLength) {
    return null;
  }

  const is16bit    = !!(flags & 0x02);
  const compressed = !!(flags & 0x08);
  const isUnsigned = !(cvt & 0x01); // cvt bit 0x01 set = signed; clear = unsigned

  let pcmData: ArrayBuffer;

  if (compressed) {
    // IT compression (ImpulseTracker 2.14+ / OpenMPT)
    const compressedBytes = raw.subarray(samplepointer);
    pcmData = decompressITSamples(compressedBytes, length, is16bit);

    // After decompression, data is signed. If unsigned flag was set, convert.
    if (isUnsigned) {
      if (!is16bit) {
        const bytes = new Uint8Array(pcmData);
        for (let i = 0; i < bytes.length; i++) bytes[i] ^= 0x80;
      } else {
        const shorts = new Int16Array(pcmData);
        for (let i = 0; i < shorts.length; i++) shorts[i] = (shorts[i] + 32768) & 0xFFFF;
      }
    }
  } else {
    // Raw PCM
    const bytesPerSample = is16bit ? 2 : 1;
    const byteLength     = length * bytesPerSample;
    const end            = Math.min(samplepointer + byteLength, raw.length);
    const actualLen      = end - samplepointer;

    if (!is16bit) {
      const buf = new ArrayBuffer(actualLen);
      const out = new Uint8Array(buf);
      for (let i = 0; i < actualLen; i++) {
        out[i] = isUnsigned ? (raw[samplepointer + i] ^ 0x80) : raw[samplepointer + i];
      }
      pcmData = buf;
    } else {
      const numSamples = actualLen >> 1;
      const buf        = new ArrayBuffer(numSamples * 2);
      const outView    = new DataView(buf);
      for (let i = 0; i < numSamples; i++) {
        const bOff = samplepointer + i * 2;
        if (bOff + 1 >= raw.length) break;
        if (isUnsigned) {
          const uval = raw[bOff] | (raw[bOff + 1] << 8);
          outView.setInt16(i * 2, (uval - 32768) & 0xFFFF, true);
        } else {
          outView.setInt16(i * 2, (raw[bOff] | (raw[bOff + 1] << 8)), true);
        }
      }
      pcmData = buf;
    }
  }

  const hasLoop      = !!(flags & 0x10) && loopend > loopbegin;
  const hasPingpong  = !!(flags & 0x40);
  const loopLength   = hasLoop ? loopend - loopbegin : 0;

  const panning = (dfp & 0x80) ? Math.min((dfp & 0x7F) * 4, 255) : 128;

  return {
    id,
    name,
    pcmData,
    bitDepth:     is16bit ? 16 : 8,
    sampleRate:   c5speed || 8363,
    length,
    loopStart:    hasLoop ? loopbegin : 0,
    loopLength,
    loopType:     !hasLoop ? 'none' : hasPingpong ? 'pingpong' : 'forward',
    volume:       vol,
    finetune:     0,
    relativeNote: 0,
    panning,
  };
}

// ── Pattern decoder ───────────────────────────────────────────────────────────

/**
 * Decode an IT packed pattern.
 * Returns an array of rows, each row is an array of TrackerCells indexed by channel.
 */
function decodeITPattern(
  rowData: Uint8Array,
  numRows: number,
  numChannels: number,
): TrackerCell[][] {
  const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

  const cells: TrackerCell[][] = Array.from(
    { length: numRows },
    () => Array.from({ length: numChannels }, emptyCell),
  );

  // Per-channel memory for mask and last values
  const lastMask  = new Uint8Array(64);
  const lastNote  = new Uint8Array(64);
  const lastInst  = new Uint8Array(64);
  const lastVol   = new Uint8Array(64);
  const lastEffTyp = new Uint8Array(64);
  const lastEff   = new Uint8Array(64);

  let pos = 0;
  let row = 0;

  while (row < numRows && pos < rowData.length) {
    const channelByte = rowData[pos++];

    if (channelByte === 0) {
      row++;
      continue;
    }

    const ch   = (channelByte - 1) & 63;
    let   mask: number;

    if (channelByte & 0x80) {
      mask         = rowData[pos++];
      lastMask[ch] = mask;
    } else {
      mask = lastMask[ch];
    }

    let note       = 0;
    let instrument = 0;
    let volume     = 0;
    let effTyp     = 0;
    let eff        = 0;

    if (mask & 0x01) {
      const noteByte = rowData[pos++];
      lastNote[ch]   = noteByte;
      if (noteByte === IT_NOTE_CUT) {
        note = XM_NOTE_OFF;
      } else if (noteByte !== IT_NOTE_NONE && noteByte !== IT_NOTE_FADE) {
        // IT note 0 = C-0; XM note 1 = C-0
        note = noteByte + 1;
      }
    }

    if (mask & 0x02) {
      instrument    = rowData[pos++];
      lastInst[ch]  = instrument;
    }

    if (mask & 0x04) {
      volume       = rowData[pos++];
      lastVol[ch]  = volume;
      // Volume column: 0-64 = set volume; 65+ = volume commands (stored as-is)
    }

    if (mask & 0x08) {
      effTyp          = rowData[pos++];
      eff             = rowData[pos++];
      lastEffTyp[ch]  = effTyp;
      lastEff[ch]     = eff;
    }

    // Recall flags (0x10/0x20/0x40/0x80 = recall last values)
    if (mask & 0x10) {
      const noteByte = lastNote[ch];
      if (noteByte === IT_NOTE_CUT) {
        note = XM_NOTE_OFF;
      } else if (noteByte !== IT_NOTE_NONE && noteByte !== IT_NOTE_FADE) {
        note = noteByte + 1;
      }
    }
    if (mask & 0x20) { instrument = lastInst[ch]; }
    if (mask & 0x40) { volume     = lastVol[ch];  }
    if (mask & 0x80) { effTyp = lastEffTyp[ch]; eff = lastEff[ch]; }

    if (ch < numChannels) {
      cells[row][ch] = { note, instrument, volume, effTyp, eff, effTyp2: 0, eff2: 0 };
    }
  }

  return cells;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function makeEmptyPattern(
  patIdx: number,
  numChannels: number,
  filename: string,
  maxPatIdx: number,
  smpNum: number,
): Pattern {
  const emptyCell: TrackerCell = { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
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
      sourceFormat:            'IT',
      sourceFile:              filename,
      importedAt:              new Date().toISOString(),
      originalChannelCount:    numChannels,
      originalPatternCount:    maxPatIdx + 1,
      originalInstrumentCount: smpNum,
    },
  };
}

/** Count active channels from chnpan[64] @ 0x40. Active = value < 128 (not disabled). */
function countITChannels(v: DataView): number {
  let highest = 0;
  for (let i = 0; i < 64; i++) {
    if (u8(v, 0x40 + i) < 128) highest = i + 1;
  }
  return Math.max(highest, 1);
}

// ── Main parser ───────────────────────────────────────────────────────────────

export function parseITFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  if (!isITFormat(buffer)) throw new Error('Not a valid IT file');

  const v   = new DataView(buffer);
  const raw = new Uint8Array(buffer);

  // ── Header ──
  const songName   = readString(v, 0x04, 26);
  const ordNum     = u16le(v, 0x20);
  const insNum     = u16le(v, 0x22);
  const smpNum     = u16le(v, 0x24);
  const patNum     = u16le(v, 0x26);
  const cmwt       = u16le(v, 0x2A); // compatible-with version
  const flags      = u16le(v, 0x2C);
  const speed      = u8(v, 0x32) || 6;
  const tempo      = u8(v, 0x33) || 125;

  const linearPeriods  = !!(flags & 0x08);
  const useInstruments = !!(flags & 0x04) && cmwt >= 0x200 && insNum > 0;
  const numChannels    = countITChannels(v);

  // ── Offset tables (base 0xC0) ──
  let cursor = 0xC0;

  const orders: number[] = [];
  for (let i = 0; i < ordNum; i++) {
    const val = u8(v, cursor + i);
    if (val === 255) break;        // end marker
    if (val !== 254) orders.push(val); // skip pattern-skip markers
  }
  cursor += ordNum;

  const instOffsets: number[] = [];
  for (let i = 0; i < insNum; i++) {
    instOffsets.push(u32le(v, cursor + i * 4));
  }
  cursor += insNum * 4;

  const sampleOffsets: number[] = [];
  for (let i = 0; i < smpNum; i++) {
    sampleOffsets.push(u32le(v, cursor + i * 4));
  }
  cursor += smpNum * 4;

  const patternOffsets: number[] = [];
  for (let i = 0; i < patNum; i++) {
    patternOffsets.push(u32le(v, cursor + i * 4));
  }

  // ── Parse samples ──
  const parsedSamples: (ParsedSample | null)[] = sampleOffsets.map((off, si) =>
    readITSample(v, raw, off, si + 1),
  );

  // ── Build instruments ──
  const instruments: InstrumentConfig[] = [];

  if (useInstruments) {
    // Instrument mode: one InstrumentConfig per instrument entry
    for (let ii = 0; ii < insNum; ii++) {
      const id     = ii + 1;
      const insOff = instOffsets[ii];

      if (insOff === 0 || insOff + 554 > buffer.byteLength) {
        instruments.push(makeEmptyInstrumentConfig(id, `Instrument ${id}`));
        continue;
      }

      // Verify "IMPI" magic
      if (u8(v, insOff) !== 0x49 || u8(v, insOff + 1) !== 0x4D ||
          u8(v, insOff + 2) !== 0x50 || u8(v, insOff + 3) !== 0x49) {
        instruments.push(makeEmptyInstrumentConfig(id, `Instrument ${id}`));
        continue;
      }

      const insName  = readString(v, insOff + 0x20, 26).replace(/\0/g, '').trim() || `Instrument ${id}`;
      const fadeout  = u16le(v, insOff + 0x14);
      const volEnv   = readEnvelope(v, insOff + 0x130);
      const panEnv   = readEnvelope(v, insOff + 0x182);

      // Keyboard map: keyboard[120+N] = 1-based sample index for note N
      // Collect all unique sample indices referenced by this instrument
      const sampleIndices = new Set<number>();
      for (let n = 0; n < 120; n++) {
        const smpIdx1 = u8(v, insOff + 0x40 + 120 + n); // 1-based
        if (smpIdx1 > 0 && smpIdx1 <= smpNum) sampleIndices.add(smpIdx1 - 1);
      }

      // Build sampleMap (96 entries: note 0..95 → sample array index)
      const sampleMap: number[] = new Array(96).fill(0);
      const sampleList: ParsedSample[] = [];
      const sampleIdxToListIdx = new Map<number, number>();

      for (const smpIdx of Array.from(sampleIndices).sort((a, b) => a - b)) {
        const ps = parsedSamples[smpIdx];
        if (ps) {
          sampleIdxToListIdx.set(smpIdx, sampleList.length);
          sampleList.push({ ...ps, id: sampleList.length + 1 });
        }
      }

      // Map keyboard entries (note 0..95 → sampleList index)
      for (let n = 0; n < 96; n++) {
        const smpIdx1 = u8(v, insOff + 0x40 + 120 + n); // 1-based
        if (smpIdx1 > 0) {
          const listIdx = sampleIdxToListIdx.get(smpIdx1 - 1);
          if (listIdx !== undefined) sampleMap[n] = listIdx;
        }
      }

      if (sampleList.length === 0) {
        instruments.push(makeEmptyInstrumentConfig(id, insName));
        continue;
      }

      const parsedInst: ParsedInstrument = {
        id,
        name:           insName,
        samples:        sampleList,
        volumeEnvelope: volEnv,
        panningEnvelope: panEnv,
        sampleMap,
        fadeout,
        volumeType:     volEnv?.enabled ? 'envelope' : 'none',
        panningType:    panEnv?.enabled ? 'envelope' : 'none',
      };

      const converted = convertToInstrument(parsedInst, id, 'IT');
      if (converted.length > 0) {
        instruments.push(converted[0]);
      } else {
        instruments.push(makeEmptyInstrumentConfig(id, insName));
      }
    }
  } else {
    // Sample mode: one InstrumentConfig per sample slot
    for (let si = 0; si < smpNum; si++) {
      const id = si + 1;
      const ps = parsedSamples[si];

      if (!ps) {
        const name = `Sample ${id}`;
        instruments.push(makeEmptyInstrumentConfig(id, name));
        continue;
      }

      const parsedInst: ParsedInstrument = {
        id,
        name:        ps.name,
        samples:     [ps],
        fadeout:     0,
        volumeType:  'none',
        panningType: 'none',
      };

      const converted = convertToInstrument(parsedInst, id, 'IT');
      if (converted.length > 0) {
        instruments.push(converted[0]);
      } else {
        instruments.push(makeEmptyInstrumentConfig(id, ps.name));
      }
    }
  }

  // ── Patterns ──
  const patterns: Pattern[] = [];
  const patIndexToArrayIdx  = new Map<number, number>();

  const referencedPats = new Set<number>(orders);
  for (let i = 0; i < patNum; i++) referencedPats.add(i);
  const allPatIdxs = Array.from(referencedPats).sort((a, b) => a - b);
  const maxPatIdx  = allPatIdxs.length > 0 ? allPatIdxs[allPatIdxs.length - 1] : 0;
  const numInst    = useInstruments ? insNum : smpNum;

  for (const patIdx of allPatIdxs) {
    if (patIdx >= patternOffsets.length || patternOffsets[patIdx] === 0) {
      patIndexToArrayIdx.set(patIdx, patterns.length);
      patterns.push(makeEmptyPattern(patIdx, numChannels, filename, maxPatIdx, numInst));
      continue;
    }

    const patOff = patternOffsets[patIdx];
    if (patOff + 8 > buffer.byteLength) {
      patIndexToArrayIdx.set(patIdx, patterns.length);
      patterns.push(makeEmptyPattern(patIdx, numChannels, filename, maxPatIdx, numInst));
      continue;
    }

    const packedLen = u16le(v, patOff);
    const numRows   = u16le(v, patOff + 2) || ROWS_PER_PATTERN;
    const rowData   = raw.subarray(patOff + 8, patOff + 8 + packedLen);
    const cells     = decodeITPattern(rowData, numRows, numChannels);

    const channels: ChannelData[] = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const rows: TrackerCell[] = [];
      for (let row = 0; row < numRows; row++) {
        rows.push(cells[row]?.[ch] ?? { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
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
      length: numRows,
      channels,
      importMetadata: {
        sourceFormat:            'IT',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    numChannels,
        originalPatternCount:    maxPatIdx + 1,
        originalInstrumentCount: numInst,
      },
    });
  }

  // ── Song positions ──
  const songPositions: number[] = [];
  for (const patIdx of orders) {
    const arrIdx = patIndexToArrayIdx.get(patIdx);
    if (arrIdx !== undefined) songPositions.push(arrIdx);
  }
  if (songPositions.length === 0) songPositions.push(0);

  return {
    name:            songName.replace(/\0/g, '').trim() || filename.replace(/\.[^/.]+$/, ''),
    format:          'IT' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength:      songPositions.length,
    restartPosition: 0,
    numChannels,
    initialSpeed:    speed,
    initialBPM:      tempo,
    linearPeriods,
  };
}
