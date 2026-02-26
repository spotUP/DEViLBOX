/**
 * AMSParser.ts — AMS (Extreme's Tracker 1.x / Velvet Studio 2.x) format parser
 *
 * AMS is a PC tracker format with two distinct variants:
 *   - AMS 1.x: "Extreme's Tracker" — magic "Extreme" + header byte versionHigh=1
 *   - AMS 2.x: "Velvet Studio"     — magic "AMShdr\x1A" + versionHigh=2, versionLow=0..2
 *
 * Both formats share the same compressed pattern encoding (ReadAMSPattern).
 * Samples may be stored uncompressed (signed PCM) or AMS-packed (RLE + bit-unpack + delta).
 *
 * Reference: OpenMPT Load_ams.cpp (BSD licence)
 * Reference: https://github.com/Patosc/VelvetStudio/commits/master
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';

// ── Binary helpers (little-endian throughout) ─────────────────────────────────

function u8(buf: Uint8Array, off: number): number {
  return buf[off] ?? 0;
}

function u16le(buf: Uint8Array, off: number): number {
  return ((buf[off] ?? 0) | ((buf[off + 1] ?? 0) << 8)) >>> 0;
}

function u32le(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] ?? 0) |
      ((buf[off + 1] ?? 0) << 8) |
      ((buf[off + 2] ?? 0) << 16) |
      ((buf[off + 3] ?? 0) << 24)) >>>
    0
  );
}

function i8(buf: Uint8Array, off: number): number {
  const v = buf[off] ?? 0;
  return v < 128 ? v : v - 256;
}

function i8s(v: number): number {
  return v < 128 ? v : v - 256;
}

/** Read a length-prefixed string (1-byte length + characters). */
function readLenString(buf: Uint8Array, off: number): { str: string; nextOff: number } {
  if (off >= buf.length) return { str: '', nextOff: off };
  const len = buf[off] ?? 0;
  let s = '';
  for (let i = 1; i <= len && off + i < buf.length; i++) {
    const ch = buf[off + i] ?? 0;
    if (ch !== 0) s += String.fromCharCode(ch);
  }
  return { str: s.trim(), nextOff: off + 1 + len };
}

// ── AMS unpack algorithm ───────────────────────────────────────────────────────
//
// OpenMPT AMSUnpack — three-stage decode:
//   Stage 1: RLE decode (run-length encoding via pack character)
//   Stage 2: Bit-unpack (transpose bit planes)
//   Stage 3: Delta decode (running sum of differences)

function amsUnpack(packed: Uint8Array, packChar: number, decompSize: number): Uint8Array {
  // Stage 1: RLE decode
  const tempBuf = new Int8Array(decompSize);
  let depackSize = decompSize;

  {
    let i = 0; // packed read cursor
    let j = 0; // tempBuf write cursor

    while (i < packed.length && j < decompSize) {
      const ch = i8s(packed[i++]);
      if (i < packed.length && ch === i8s(packChar)) {
        let repCount = packed[i++];
        repCount = Math.min(repCount, decompSize - j);
        if (i < packed.length && repCount > 0) {
          const repCh = i8s(packed[i++]);
          for (let r = 0; r < repCount; r++) {
            tempBuf[j++] = repCh;
          }
        } else {
          tempBuf[j++] = i8s(packChar);
        }
      } else {
        tempBuf[j++] = ch;
      }
    }
    // j should only be < decompSize for truncated samples
    depackSize = j;
  }

  // Stage 2: Bit-unpack (OpenMPT's bit transposition loop)
  const dest = new Uint8Array(decompSize);

  {
    let bitcount = 0x80;
    let k = 0;
    for (let i = 0; i < depackSize; i++) {
      const al = tempBuf[i] as number;
      let dh = 0;
      for (let count = 0; count < 8; count++) {
        let bl = (al & bitcount) & 0xff;
        // OpenMPT: bl = (bl | (bl << 8)) >> ((dh + 8 - count) & 7)
        // This is a 16-bit value then right-shifted
        const blFull = (bl | (bl << 8)) & 0xffff;
        const shift = (dh + 8 - count) & 7;
        bl = (blFull >> shift) & 0xff;
        // Advance bitcount: bitcount = ((bitcount | (bitcount << 8)) >> 1) & 0xFF
        bitcount = (((bitcount | (bitcount << 8)) & 0xffff) >> 1) & 0xff;
        dest[k] |= bl & 0xff;
        k++;
        if (k >= decompSize) {
          k = 0;
          dh++;
        }
      }
      // After 8-bit group: bitcount = ((bitcount | (bitcount << 8)) >> dh) & 0xFF
      bitcount = (((bitcount | (bitcount << 8)) & 0xffff) >> dh) & 0xff;
    }
  }

  // Stage 3: Delta decode
  {
    let old = 0;
    for (let i = 0; i < depackSize; i++) {
      let pos = dest[i] as number;
      // OpenMPT: if(pos != 128 && (pos & 0x80) != 0) pos = -(pos & 0x7F);
      if (pos !== 128 && (pos & 0x80) !== 0) {
        pos = -(pos & 0x7f);
      }
      old = (old - pos) & 0xff;
      dest[i] = old;
    }
  }

  return dest;
}

// ── WAV encoding helpers ───────────────────────────────────────────────────────

function pcm8ToWAV(pcm: Uint8Array, sampleRate: number): ArrayBuffer {
  const numSamples = pcm.length;
  const dataSize = numSamples * 2; // upconvert 8-bit → 16-bit
  const fileSize = 44 + dataSize;
  const buf = new ArrayBuffer(fileSize);
  const view = new DataView(buf);

  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, fileSize - 8, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  let off = 44;
  for (let i = 0; i < numSamples; i++) {
    const s8v = (pcm[i] as number) < 128 ? (pcm[i] as number) : (pcm[i] as number) - 256;
    view.setInt16(off, s8v * 256, true);
    off += 2;
  }
  return buf;
}

function pcm16leToWAV(pcm: Uint8Array, sampleRate: number): ArrayBuffer {
  const numFrames = Math.floor(pcm.length / 2);
  const dataSize = numFrames * 2;
  const fileSize = 44 + dataSize;
  const buf = new ArrayBuffer(fileSize);
  const view = new DataView(buf);

  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, fileSize - 8, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  const dst = new Uint8Array(buf, 44);
  dst.set(pcm.subarray(0, numFrames * 2));

  return buf;
}

function wavToDataUrl(wavBuf: ArrayBuffer): string {
  const bytes = new Uint8Array(wavBuf);
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(
      ...Array.from(bytes.subarray(i, Math.min(i + CHUNK, bytes.length))),
    );
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

/** Build an InstrumentConfig with sample data. Returns null on bad input. */
function buildSampleInstrument(
  id: number,
  name: string,
  pcmBytes: Uint8Array,
  is16bit: boolean,
  packed: boolean,
  packChar: number,
  length: number,
  loopStart: number,
  loopEnd: number,
  hasLoop: boolean,
  sampleRate: number,
  volume: number,         // 0..127
  pan: number,            // 0..240 (0=no pan)
): InstrumentConfig {
  // Decode the sample data
  let finalPcm: Uint8Array;
  if (packed) {
    const bytesPerSample = is16bit ? 2 : 1;
    const destSize = length * bytesPerSample;
    if (destSize === 0) {
      finalPcm = new Uint8Array(0);
    } else {
      finalPcm = amsUnpack(pcmBytes, packChar, destSize);
    }
  } else {
    finalPcm = pcmBytes;
  }

  const vol = Math.min(127, volume);
  const volLinear = vol > 0 ? vol / 127 : 0;
  const volDb = volLinear > 0 ? 20 * Math.log10(volLinear) : -60;

  // Pan: AMS stores pan in high nibble of panFinetune; value is 0x10..0xF0
  // 0x00 = no panning override; 0x80 = center
  let panValue = 0;
  if (pan !== 0) {
    // pan is already the nibble value * 0x10 (0x10..0xF0)
    // Map to -50..+50: center=0x80=128
    panValue = Math.round(((pan - 128) / 128) * 50);
  }

  if (finalPcm.length === 0) {
    return {
      id,
      name: name || `Sample ${id}`,
      type: 'sample' as const,
      synthType: 'Sampler' as const,
      effects: [],
      volume: volDb,
      pan: panValue,
    } as unknown as InstrumentConfig;
  }

  // Build WAV
  const loopActive = hasLoop && loopEnd > loopStart;
  let wavBuf: ArrayBuffer;
  if (is16bit) {
    wavBuf = pcm16leToWAV(finalPcm, sampleRate);
  } else {
    wavBuf = pcm8ToWAV(finalPcm, sampleRate);
  }
  const dataUrl = wavToDataUrl(wavBuf);

  const totalFrames = is16bit ? Math.floor(finalPcm.length / 2) : finalPcm.length;
  const loopEndFinal = loopActive ? Math.min(loopEnd, totalFrames) : totalFrames;

  return {
    id,
    name: name || `Sample ${id}`,
    type: 'sample' as const,
    synthType: 'Sampler' as const,
    effects: [],
    volume: volDb,
    pan: panValue,
    sample: {
      audioBuffer: wavBuf,
      url: dataUrl,
      baseNote: 'C3',
      detune: 0,
      loop: loopActive,
      loopType: loopActive ? ('forward' as const) : ('off' as const),
      loopStart: loopActive ? loopStart : 0,
      loopEnd: loopActive ? loopEndFinal : totalFrames,
      sampleRate,
      reverse: false,
      playbackRate: 1.0,
    },
  } as unknown as InstrumentConfig;
}

// ── Pattern parsing (shared by both AMS variants) ─────────────────────────────
//
// AMS pattern cell encoding:
//   Each row is terminated by a byte 0xFF (emptyRow) or by a cell's flags byte
//   with bit 7 (endOfRowMask) set.
//
//   Flags byte layout:
//     bits[4:0] = channel number
//     bit 5     = endOfRowMask (if set, no more cells on this row)
//     bit 6     = noteMask (if set, this cell has NO note+instr; only effects)
//     bit 7     = (only on emptyRow sentinel = 0xFF, both bits 7 & 6 & 5 set)
//
//   After flags byte (when noteMask is NOT set):
//     note byte:
//       bit 7 = readNextCmd (more effect commands follow)
//       bits[6:0] = note value
//         0        = no note
//         1        = note-off
//         v1.x: 12..108 → note = v + 12 + NOTE_MIN
//         v2.x:  2..121 → note = v - 2  + NOTE_MIN
//     instr byte (0 = empty)
//
//   Effect command bytes (read while moreCommands=true):
//     bit 7 = moreCommands (another command follows)
//     bit 6 = volCommand (this is a volume column, no param follows)
//     bits[5:0] = effect/volume value
//
//     If NOT volCommand:
//       param byte follows
//       if effect < 0x10 → MOD-style effect
//       if effect < 0x10 + len(effTrans) → extended effect via effTrans[]
//
// NOTE_MIN = 1 in OpenMPT, XM note 1..120 correspond to tracker notes C-0..B-9.
// We use 1-based XM notes throughout (0 = empty, 97 = note-off).

const NOTE_KEYOFF = 97;

// Effect translation table for AMS extended effects (indices 0x10..0x1C correspond
// to OpenMPT CMD_* values — we map them to simple numeric codes for storage).
// We store these as [effTyp, eff] pairs using XM-compatible numbers where possible.
// For effects we cannot represent, we use effTyp=0, eff=0 (no-op).

// XM effect numbers:
const XM_PORTA_UP   = 0x01;
const XM_PORTA_DOWN = 0x02;
const XM_TONE_PORTA = 0x03;
const XM_VIBRATO    = 0x04;
const XM_TPORTA_VOL = 0x05;
const XM_VIB_VOL    = 0x06;
const XM_TREMOLO    = 0x07;
const XM_PAN        = 0x08;
const XM_OFFSET     = 0x09;
const XM_VOL_SLIDE  = 0x0A;
const XM_POS_JUMP   = 0x0B;
const XM_SET_VOL    = 0x0C;
const XM_PAT_BREAK  = 0x0D;
const XM_EXTENDED   = 0x0E;
const XM_SPEED      = 0x0F;
const XM_GLOBAL_VOL = 0x10;
const XM_GLOB_VSLIDE = 0x11;
const XM_KEYOFF_EFF  = 0x14;
const XM_CHAN_VOL    = 0x0C; // channel volume — map to set-volume

/** Decode a MOD-style effect (0..0xF) + param into [effTyp, eff] */
function decodeModEffect(effect: number, param: number): [number, number] {
  // These match standard XM/MOD effect numbering
  switch (effect) {
    case 0x0: return param !== 0 ? [0x00, param] : [0, 0]; // arpeggio
    case 0x1: return [XM_PORTA_UP, param];
    case 0x2: return [XM_PORTA_DOWN, param];
    case 0x3: return [XM_TONE_PORTA, param];
    case 0x4: return [XM_VIBRATO, param];
    case 0x5: return [XM_TPORTA_VOL, param];
    case 0x6: return [XM_VIB_VOL, param];
    case 0x7: return [XM_TREMOLO, param];
    case 0x8: {
      // AMS 4-bit panning: (param & 0x0F) * 0x11
      const panVal = (param & 0x0f) * 0x11;
      return [XM_PAN, panVal];
    }
    case 0x9: return [XM_OFFSET, param];
    case 0xA: return [XM_VOL_SLIDE, param];
    case 0xB: return [XM_POS_JUMP, param];
    case 0xC: {
      // Volume: OpenMPT converts CMD_VOLUME → volcmd. We store as vol effect.
      // vol = (param + 1) / 2, clamped to 64
      const vol = Math.min(64, Math.floor((param + 1) / 2));
      return [XM_SET_VOL, vol];
    }
    case 0xD: return [XM_PAT_BREAK, param];
    case 0xE: {
      // MOD extended: post-fix E8x special case from OpenMPT (break sample loop = no-op)
      if (param === 0x80) return [0, 0];
      // Otherwise pass through as XM extended
      return [XM_EXTENDED, param];
    }
    case 0xF: return param >= 0x20 ? [XM_SPEED, param] : [XM_SPEED, param];
    default:   return [0, 0];
  }
}

/** Decode an AMS extended effect (effTrans[] index 0..0x1C) into [effTyp, eff] */
function decodeExtEffect(effect: number, param: number): [number, number] {
  // Based on effTrans[] + post-fixups in OpenMPT ReadAMSPattern
  const idx = effect - 0x10; // 0..0x1C
  switch (idx) {
    case 0x00: {
      // Forward/backward (S3MCMDEX): param 0 or 1 → S9E/S9F type command
      if (param <= 0x01) {
        // Map to XM extended S9x style: 0x9E or 0x9F
        return [XM_EXTENDED, (param | 0x9e)];
      }
      return [0, 0];
    }
    case 0x01: {
      // Extra fine porta up: param → E(F0 | min(param, 0x0F))
      const p = (Math.min(0x0f, param)) | 0xe0;
      return [XM_PORTA_UP, p];
    }
    case 0x02: {
      // Extra fine porta down
      const p = (Math.min(0x0f, param)) | 0xe0;
      return [XM_PORTA_DOWN, p];
    }
    case 0x03: return [XM_EXTENDED, 0x90 | (param & 0x0f)]; // retrigger
    case 0x04: return [0, 0]; // CMD_NONE
    case 0x05: {
      // Toneporta with fine volume slide → effTyp TPORTA_VOL
      return [XM_TPORTA_VOL, param];
    }
    case 0x06: {
      // Vibrato with fine volume slide
      return [XM_VIB_VOL, param];
    }
    case 0x07: return [0, 0]; // CMD_NONE
    case 0x08: {
      // Panning slide
      return [XM_PAN, param]; // approximate
    }
    case 0x09: return [0, 0]; // CMD_NONE
    case 0x0A: {
      // Volume slide (finer)
      return [XM_VOL_SLIDE, param];
    }
    case 0x0B: return [0, 0]; // CMD_NONE
    case 0x0C: {
      // Channel volume (0..127): map to set-volume clamped to 64
      const vol = Math.min(64, Math.floor((param + 1) / 2));
      return [XM_CHAN_VOL, vol];
    }
    case 0x0D: {
      // Long pattern break (in hex)
      return [XM_PAT_BREAK, param];
    }
    case 0x0E: {
      // Fine slide commands: decode by high nibble
      const hi = param >> 4;
      const lo = param & 0x0f;
      switch (hi) {
        case 0x1: return [XM_PORTA_UP,   (Math.floor((lo + 1) / 2)) | 0xf0];
        case 0x2: return [XM_PORTA_DOWN, (Math.floor((lo + 1) / 2)) | 0xf0];
        case 0xA: return [XM_VOL_SLIDE,  ((Math.floor((lo + 1) / 2)) << 4) | 0x0f];
        case 0xB: return [XM_VOL_SLIDE,  (Math.floor((lo + 1) / 2)) | 0xf0];
        default:  return [0, 0];
      }
    }
    case 0x0F: return [0, 0]; // fractional BPM (unsupported)
    case 0x10: {
      // Key-off at tick xx
      return [XM_KEYOFF_EFF, param];
    }
    case 0x11: return [XM_PORTA_UP,   param]; // porta up all octaves
    case 0x12: return [XM_PORTA_DOWN, param]; // porta down all octaves
    case 0x1A: {
      // Global volume slide
      return [XM_GLOB_VSLIDE, param];
    }
    case 0x1C: {
      // Global volume (0..127): map to XM global vol clamped to 64
      const gv = Math.min(64, Math.floor((param + 1) / 2));
      return [XM_GLOBAL_VOL, gv];
    }
    default: return [0, 0];
  }
}

interface AMSCell {
  note:      number;  // 0=empty, 97=keyoff, 1..96=note
  instr:     number;  // 0=empty, 1..
  volume:    number;  // 0=no volume col, 1..65=vol+1
  effTyp:    number;
  eff:       number;
  effTyp2:   number;
  eff2:      number;
}

/**
 * Parse a single AMS pattern chunk.
 * Returns a 2D array: rows × channels, each entry is AMSCell.
 * @param newVersion true = AMS 2.x (Velvet Studio), false = AMS 1.x (Extreme's Tracker)
 */
function parseAMSPattern(
  data: Uint8Array,
  numRows: number,
  numChannels: number,
  newVersion: boolean,
): AMSCell[][] {
  const emptyCell = (): AMSCell => ({
    note: 0, instr: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  });

  // rows[row][ch]
  const rows: AMSCell[][] = Array.from({ length: numRows }, () =>
    Array.from({ length: numChannels }, emptyCell),
  );

  let pos = 0;

  const readByte = (): number => {
    if (pos < data.length) return data[pos++] ?? 0;
    return 0;
  };

  const canRead = (): boolean => pos < data.length;

  // Masks (from OpenMPT)
  const emptyRowVal   = 0xFF;
  const endOfRowMask  = 0x80;
  const noteMaskBit   = 0x40;
  const channelMask   = 0x1F;
  const readNextCmd   = 0x80;
  const noteDataMask  = 0x7F;
  const volCommand    = 0x40;
  const commandMask   = 0x3F;

  for (let row = 0; row < numRows; row++) {
    const rowCells = rows[row]!;

    while (canRead()) {
      const flags = readByte();

      if (flags === emptyRowVal) {
        // Empty row — done with this row
        break;
      }

      const chn = flags & channelMask;
      const cell: AMSCell = chn < numChannels ? (rowCells[chn] as AMSCell) : emptyCell();
      let moreCommands = true;

      if (!(flags & noteMaskBit)) {
        // Read note + instrument
        const noteByte = readByte();
        moreCommands = (noteByte & readNextCmd) !== 0;
        const noteVal = noteByte & noteDataMask;

        if (noteVal === 1) {
          cell.note = NOTE_KEYOFF;
        } else if (newVersion && noteVal >= 2 && noteVal <= 121) {
          cell.note = noteVal - 2 + 1; // NOTE_MIN = 1
        } else if (!newVersion && noteVal >= 12 && noteVal <= 108) {
          cell.note = noteVal + 12 + 1; // NOTE_MIN = 1 + extra octave
        }
        cell.instr = readByte();
      }

      // Track two effects (effTyp/eff and effTyp2/eff2)
      let firstEff = true;

      while (moreCommands) {
        const cmdByte = readByte();
        const effect = cmdByte & commandMask;
        moreCommands = (cmdByte & readNextCmd) !== 0;

        if (cmdByte & volCommand) {
          // Volume column command (no param byte)
          cell.volume = effect + 1; // 1..65 → volume = value - 1
        } else {
          const param = readByte();

          let effTyp = 0;
          let eff = 0;

          if (effect < 0x10) {
            [effTyp, eff] = decodeModEffect(effect, param);
          } else {
            [effTyp, eff] = decodeExtEffect(effect, param);
          }

          if (effTyp !== 0 || eff !== 0) {
            if (firstEff) {
              cell.effTyp = effTyp;
              cell.eff    = eff;
              firstEff    = false;
            } else if (cell.effTyp2 === 0) {
              cell.effTyp2 = effTyp;
              cell.eff2    = eff;
            }
          }
        }
      }

      if (flags & endOfRowMask) {
        break;
      }
    }
  }

  return rows;
}

// ── MOD2XMFineTune ────────────────────────────────────────────────────────────
//
// AMS stores finetune in low nibble of panFinetune.
// MOD finetune: 0..15, where >7 is negative (two's complement in 4-bit).
// OpenMPT: MOD2XMFineTune maps 0..F → 0, 16, 32, ..., 112, -128, -112, ..., -16
// Then adjusts C5 speed via TransposeToFrequency.
// We approximate by converting finetune to cents.

function mod2xmFinetuneCents(rawFine: number): number {
  const nibble = rawFine & 0x0f;
  const signed = nibble > 7 ? nibble - 16 : nibble;
  return signed * (100 / 8); // each step = 12.5 cents
}

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Returns true if the buffer starts with the AMS magic bytes for either variant.
 *
 * AMS 1.x: bytes 0..6 = "Extreme", byte 8 = versionHigh (must be 0x01)
 *   Full header: "Extreme" (7) + versionLow(1) + versionHigh(1) + channelConfig(1) +
 *                numSamps(1) + numPats(2) + numOrds(2) + midiChannels(1) + extraSize(2) = 18 bytes minimum
 *
 * AMS 2.x: bytes 0..6 = "AMShdr\x1A", then 1-byte song name length, then song name,
 *          then AMS2FileHeader: versionLow(1) + versionHigh(1) = must be versionHigh=2, versionLow≤2
 */
export function isAMSFormat(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;

  // Check AMS 1.x magic "Extreme"
  if (
    bytes[0] === 0x45 && // E
    bytes[1] === 0x78 && // x
    bytes[2] === 0x74 && // t
    bytes[3] === 0x72 && // r
    bytes[4] === 0x65 && // e
    bytes[5] === 0x6d && // m
    bytes[6] === 0x65    // e
  ) {
    // versionHigh is at offset 8 (after versionLow at offset 7)
    if (bytes.length >= 9 && (bytes[8] ?? 0) === 0x01) return true;
    return false;
  }

  // Check AMS 2.x magic "AMShdr\x1A"
  if (
    bytes[0] === 0x41 && // A
    bytes[1] === 0x4d && // M
    bytes[2] === 0x53 && // S
    bytes[3] === 0x68 && // h
    bytes[4] === 0x64 && // d
    bytes[5] === 0x72 && // r
    bytes[6] === 0x1a    // \x1A
  ) {
    // Skip song name length byte + song name bytes
    if (bytes.length < 8) return false;
    const nameLen = bytes[7] ?? 0;
    const headerStart = 8 + nameLen;
    if (bytes.length < headerStart + 2) return false;
    const versionLow  = bytes[headerStart]     ?? 0;
    const versionHigh = bytes[headerStart + 1] ?? 0;
    if (versionHigh === 2 && versionLow <= 2) return true;
    return false;
  }

  return false;
}

// ── AMS 1.x parser ────────────────────────────────────────────────────────────

function parseAMS1(bytes: Uint8Array, filename: string): TrackerSong | null {
  // "Extreme" magic already verified. Header layout:
  //   +0  "Extreme"[7]
  //   +7  versionLow   uint8
  //   +8  versionHigh  uint8   (must be 1)
  //   +9  channelConfig uint8  — numChannels = (channelConfig & 0x1F) + 1
  //   +10 numSamps     uint8
  //   +11 numPats      uint16le
  //   +13 numOrds      uint16le
  //   +15 midiChannels uint8
  //   +16 extraSize    uint16le
  //   total header: 18 bytes

  if (bytes.length < 18) return null;

  const versionLow    = u8(bytes, 7);
  const versionHigh   = u8(bytes, 8);
  if (versionHigh !== 0x01) return null;

  const channelConfig = u8(bytes, 9);
  const numChannels   = (channelConfig & 0x1f) + 1;
  const numSamps      = u8(bytes, 10);
  const numPats       = u16le(bytes, 11);
  const numOrds       = u16le(bytes, 13);
  const extraSize     = u16le(bytes, 16);

  let pos = 18; // after fixed header

  // Skip extra data
  pos += extraSize;
  if (pos > bytes.length) return null;

  // ── Sample headers (17 bytes each) ──────────────────────────────────────────
  //   +0  length    uint32le
  //   +4  loopStart uint32le
  //   +8  loopEnd   uint32le
  //   +12 panFinetune uint8   (high nibble=pan, low nibble=finetune)
  //   +13 sampleRate uint16le
  //   +15 volume    uint8   (0..127)
  //   +16 flags     uint8   (smpPacked=0x03, smp16BitOld=0x04, smp16Bit=0x80)

  interface AMS1SampleHeader {
    length:     number;
    loopStart:  number;
    loopEnd:    number;
    panFinetune: number;
    sampleRate: number;
    volume:     number;
    flags:      number;
    packed:     boolean;
    is16bit:    boolean;
  }

  const sampleHeaders: AMS1SampleHeader[] = [];
  const packChars: number[] = [];

  for (let s = 0; s < numSamps; s++) {
    if (pos + 17 > bytes.length) return null;

    const length     = u32le(bytes, pos);
    const loopStart  = u32le(bytes, pos + 4);
    const loopEnd    = u32le(bytes, pos + 8);
    const panFinetune = u8(bytes, pos + 12);
    const sampleRate  = u16le(bytes, pos + 13);
    const volume      = u8(bytes, pos + 15);
    const flags       = u8(bytes, pos + 16);

    const packed  = (flags & 0x03) !== 0;
    const is16bit = (flags & 0x80) !== 0 || (flags & 0x04) !== 0;

    sampleHeaders.push({ length, loopStart, loopEnd, panFinetune, sampleRate, volume, flags, packed, is16bit });
    pos += 17;
  }

  // ── Texts ───────────────────────────────────────────────────────────────────
  // Song name (length-prefixed)
  const songNameResult = readLenString(bytes, pos);
  const songName = songNameResult.str || filename.replace(/\.[^/.]+$/, '');
  pos = songNameResult.nextOff;

  // Sample names
  const sampleNames: string[] = [];
  for (let s = 0; s < numSamps; s++) {
    const r = readLenString(bytes, pos);
    sampleNames.push(r.str);
    pos = r.nextOff;
  }

  // Channel names (skip)
  for (let c = 0; c < numChannels; c++) {
    const r = readLenString(bytes, pos);
    pos = r.nextOff;
  }

  // Pattern names (skip, patterns already allocated to 64 rows)
  const patternNames: string[] = [];
  for (let p = 0; p < numPats; p++) {
    const r = readLenString(bytes, pos);
    patternNames.push(r.str);
    pos = r.nextOff;
  }

  // ── Packed song message ─────────────────────────────────────────────────────
  if (pos + 2 > bytes.length) return null;
  const packedMsgLen = u16le(bytes, pos);
  pos += 2;
  pos += packedMsgLen; // skip message

  // ── Order list ───────────────────────────────────────────────────────────────
  if (pos + numOrds * 2 > bytes.length) return null;
  const orderList: number[] = [];
  for (let i = 0; i < numOrds; i++) {
    orderList.push(u16le(bytes, pos));
    pos += 2;
  }

  // ── Pattern data ─────────────────────────────────────────────────────────────
  const allPatternRows: (AMSCell[][] | null)[] = [];

  for (let p = 0; p < numPats; p++) {
    if (pos + 4 > bytes.length) {
      allPatternRows.push(null);
      continue;
    }
    const patLength = u32le(bytes, pos);
    pos += 4;

    if (pos + patLength > bytes.length || patLength === 0) {
      pos += patLength;
      allPatternRows.push(null);
      continue;
    }

    const patChunk = bytes.subarray(pos, pos + patLength);
    pos += patLength;

    // AMS 1.x: patterns are always 64 rows
    const cellRows = parseAMSPattern(patChunk, 64, numChannels, false);
    allPatternRows.push(cellRows);
  }

  // ── Sample PCM data ──────────────────────────────────────────────────────────
  // Read one pack-char byte per sample (if packed), then the actual sample data.
  const samplePCM: (Uint8Array | null)[] = [];

  for (let s = 0; s < numSamps; s++) {
    const hdr = sampleHeaders[s]!;
    const bytesPerSample = hdr.is16bit ? 2 : 1;
    const byteLen = hdr.length * bytesPerSample;

    let packChar = 0;
    if (hdr.packed) {
      if (pos < bytes.length) {
        packChar = bytes[pos++] ?? 0;
      }
    }
    packChars.push(packChar);

    if (byteLen > 0 && pos + byteLen <= bytes.length) {
      samplePCM.push(bytes.slice(pos, pos + byteLen));
      pos += byteLen;
    } else {
      samplePCM.push(null);
      if (byteLen > 0) pos = Math.min(pos + byteLen, bytes.length);
    }
  }

  // ── Build instruments ────────────────────────────────────────────────────────
  const instruments: InstrumentConfig[] = [];

  for (let s = 0; s < numSamps; s++) {
    const hdr  = sampleHeaders[s]!;
    const name = sampleNames[s] || `Sample ${s + 1}`;
    const pcm  = samplePCM[s];
    const packChar = packChars[s] ?? 0;

    // C5 speed: AMS stores half the real rate (×2), then adjusted for finetune
    let c5Speed = hdr.sampleRate > 0 ? hdr.sampleRate * 2 : 8363 * 2;
    const finetuneCents = mod2xmFinetuneCents(hdr.panFinetune & 0x0f);

    // Apply finetune via detune offset (we store in sample.detune)
    // The sampleRate is already included; detune is just stored separately.

    const pan = hdr.panFinetune & 0xf0; // high nibble × 16

    const hasLoop = hdr.loopStart < hdr.loopEnd;
    const loopStart = Math.min(hdr.loopStart, hdr.length);
    const loopEnd   = Math.min(hdr.loopEnd,   hdr.length);

    if (!pcm || pcm.length === 0 || hdr.length === 0) {
      instruments.push({
        id:        s + 1,
        name,
        type:      'sample' as const,
        synthType: 'Sampler' as const,
        effects:   [],
        volume:    hdr.volume > 0 ? 20 * Math.log10(hdr.volume / 127) : -60,
        pan:       pan !== 0 ? Math.round(((pan - 128) / 128) * 50) : 0,
      } as unknown as InstrumentConfig);
      continue;
    }

    const inst = buildSampleInstrument(
      s + 1,
      name,
      pcm,
      hdr.is16bit,
      hdr.packed,
      packChar,
      hdr.length,
      loopStart,
      loopEnd,
      hasLoop,
      c5Speed,
      hdr.volume,
      pan,
    );

    // Apply finetune detune
    if (finetuneCents !== 0 && (inst as unknown as Record<string, unknown>)['sample']) {
      ((inst as unknown as Record<string, unknown>)['sample'] as Record<string, unknown>)['detune'] = finetuneCents;
    }

    instruments.push(inst);
  }

  // ── Build patterns ────────────────────────────────────────────────────────────
  const patterns: Pattern[] = [];

  for (let p = 0; p < numPats; p++) {
    const cellRows = allPatternRows[p];
    const patName  = patternNames[p] || `Pattern ${p}`;
    const numRows  = 64;

    const channels: ChannelData[] = Array.from({ length: numChannels }, (_, ch): ChannelData => {
      const rows: TrackerCell[] = Array.from({ length: numRows }, (__, row): TrackerCell => {
        const cellRow = cellRows?.[row];
        const cell    = cellRow?.[ch];
        if (!cell) return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
        return {
          note:       cell.note,
          instrument: cell.instr,
          volume:     cell.volume > 0 ? cell.volume - 1 : 0,
          effTyp:     cell.effTyp,
          eff:        cell.eff,
          effTyp2:    cell.effTyp2,
          eff2:       cell.eff2,
        };
      });

      return {
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
      };
    });

    patterns.push({
      id:      `pattern-${p}`,
      name:    patName,
      length:  numRows,
      channels,
      importMetadata: {
        sourceFormat:            'AMS',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    numChannels,
        originalPatternCount:    numPats,
        originalInstrumentCount: numSamps,
      },
    });
  }

  return {
    name:            songName,
    format:          'IT' as TrackerFormat,  // AMS uses linear slides like IT
    patterns,
    instruments,
    songPositions:   orderList,
    songLength:      orderList.length,
    restartPosition: 0,
    numChannels,
    initialSpeed:    6,
    initialBPM:      125,
    linearPeriods:   false,
    metadata: {
      tracker: `Extreme's Tracker ${versionHigh}.${versionLow}`,
      format: 'AMS',
    },
  } as unknown as TrackerSong;
}

// ── AMS 2.x parser ────────────────────────────────────────────────────────────

function parseAMS2(bytes: Uint8Array, filename: string): TrackerSong | null {
  // "AMShdr\x1A" magic already verified.
  // +0  "AMShdr\x1A"[7]
  // +7  songNameLen  uint8
  // +8  songName[songNameLen]
  // After song name:
  //   versionLow   uint8
  //   versionHigh  uint8   (must be 2)
  //   numIns       uint8
  //   numPats      uint16le
  //   numOrds      uint16le
  // Then version-dependent header continuation.

  let pos = 7;
  const songNameLen = u8(bytes, pos++);
  let songName = '';
  for (let i = 0; i < songNameLen; i++) {
    const ch = u8(bytes, pos + i);
    if (ch !== 0) songName += String.fromCharCode(ch);
  }
  songName = songName.trim() || filename.replace(/\.[^/.]+$/, '');
  pos += songNameLen;

  if (pos + 7 > bytes.length) return null;

  const versionLow  = u8(bytes, pos++);
  const versionHigh = u8(bytes, pos++);
  if (versionHigh !== 2 || versionLow > 2) return null;

  const numIns  = u8(bytes, pos++);
  const numPats = u16le(bytes, pos); pos += 2;
  const numOrds = u16le(bytes, pos); pos += 2;

  // Version-dependent header continuation:
  let initialBPM   = 125;
  let initialSpeed = 6;
  let linearSlides = false;

  if (versionLow >= 2) {
    // 8.8 tempo (uint16le), speed (uint8), 3 bytes padding, headerFlags (uint16le)
    if (pos + 7 > bytes.length) return null;
    const tempoRaw = u16le(bytes, pos); pos += 2;
    const tempoVal = Math.max(32 * 256, tempoRaw);
    initialBPM = Math.max(32, tempoVal >> 8); // integer part only
    initialSpeed = Math.max(1, u8(bytes, pos++));
    pos += 3; // skip 3 default pattern editor values
    const headerFlags = u16le(bytes, pos); pos += 2;
    linearSlides = (headerFlags & 0x40) !== 0;
  } else {
    // uint8 tempo, uint8 speed, uint8 flags
    if (pos + 3 > bytes.length) return null;
    initialBPM   = Math.max(32, u8(bytes, pos++));
    initialSpeed = Math.max(1, u8(bytes, pos++));
    const headerFlags = u8(bytes, pos++);
    linearSlides = (headerFlags & 0x40) !== 0;
  }

  const NUM_CHANNELS = 32;

  // ── Instrument and sample headers ────────────────────────────────────────────
  //
  // For each instrument:
  //   - Length-prefixed name
  //   - numSamples uint8
  //   - sampleAssignment[120] (v2.01+) or sampleAssignment[96] at [12..107] (v2.0)
  //   - 3 envelopes: vol (5+pts*3), pan (5+pts*3), vibrato (5+pts*3)
  //   - AMS2Instrument header (5 bytes):
  //       shadowInstr  uint8
  //       vibampFadeout uint16le
  //       envFlags     uint16le
  //   - For each sample:
  //       length-prefixed name
  //       AMS2SampleHeader (20 bytes):
  //         +0  length     uint32le
  //         +4  loopStart  uint32le
  //         +8  loopEnd    uint32le
  //         +12 sampledRate uint16le
  //         +14 panFinetune uint8
  //         +15 c4speed    uint16le
  //         +17 relativeTone int8
  //         +18 volume     uint8 (0..127)
  //         +19 flags      uint8

  interface AMS2SampleHeader {
    length:      number;
    loopStart:   number;
    loopEnd:     number;
    panFinetune: number;
    c4speed:     number;
    relativeTone: number;
    volume:      number;
    flags:       number;
    packed:      boolean;
    is16bit:     boolean;
    smpLoop:     boolean;
    smpBidi:     boolean;
    smpReverse:  boolean;
  }

  interface AMS2InstrInfo {
    shadowInstr:   number;
    vibampFadeout: number;
    envFlags:      number;
  }

  interface AMS2Instrument {
    name:         string;
    numSamples:   number;
    sampleAssign: number[];  // 120 entries
    instrInfo:    AMS2InstrInfo;
    sampleNames:  string[];
    sampleHdrs:   AMS2SampleHeader[];
    firstSampleIdx: number;  // 0-based global sample index of first sample
  }

  const instruments2: AMS2Instrument[] = [];
  let globalSampleIdx = 0;

  // sampleSettings[globalSampleIdx] = shadow/pack info
  // Lo byte = shadow instrument (0=not shadow), Hi byte lo nibble = sample index in instrument,
  // Hi bit = packed
  const sampleSettingsList: number[] = [];

  for (let ins = 0; ins < numIns; ins++) {
    if (pos >= bytes.length) break;

    const nameResult = readLenString(bytes, pos);
    pos = nameResult.nextOff;
    const instrName = nameResult.str;

    if (pos >= bytes.length) break;
    const numSamples = u8(bytes, pos++);

    if (numSamples === 0) continue;

    // Read sample assignment (120 or 96 notes)
    const sampleAssign = new Array<number>(120).fill(0);
    if (versionLow > 0) {
      // v2.01+: 120 bytes
      if (pos + 120 > bytes.length) break;
      for (let i = 0; i < 120; i++) sampleAssign[i] = u8(bytes, pos + i);
      pos += 120;
    } else {
      // v2.0: 96 bytes at positions 12..107
      if (pos + 96 > bytes.length) break;
      for (let i = 0; i < 96; i++) sampleAssign[12 + i] = u8(bytes, pos + i);
      pos += 96;
    }

    // Read 3 envelopes (vol, pan, vibrato)
    // Each envelope: speed(1) + sustainPoint(1) + loopStart(1) + loopEnd(1) + numPoints(1) + points(numPoints*3)
    for (let envIdx = 0; envIdx < 3; envIdx++) {
      if (pos + 5 > bytes.length) break;
      const numPoints = u8(bytes, pos + 4);
      pos += 5; // read the 5-byte envelope header
      pos += numPoints * 3; // skip envelope points
    }

    // Read AMS2Instrument header (5 bytes)
    if (pos + 5 > bytes.length) break;
    const shadowInstr   = u8(bytes, pos);
    const vibampFadeout = u16le(bytes, pos + 1);
    const envFlags      = u16le(bytes, pos + 3);
    pos += 5;

    const instrInfo: AMS2InstrInfo = { shadowInstr, vibampFadeout, envFlags };

    // Read sample headers
    const thisSampleNames: string[] = [];
    const thisSampleHdrs: AMS2SampleHeader[] = [];
    const firstSmp = globalSampleIdx;

    for (let smp = 0; smp < numSamples; smp++) {
      const snResult = readLenString(bytes, pos);
      pos = snResult.nextOff;
      thisSampleNames.push(snResult.str);

      if (pos + 20 > bytes.length) break;

      const length       = u32le(bytes, pos);
      const loopStart    = u32le(bytes, pos + 4);
      const loopEnd      = u32le(bytes, pos + 8);
      const panFinetune  = u8(bytes, pos + 14);
      const c4speed      = u16le(bytes, pos + 15);
      const relativeTone = i8(bytes, pos + 17);
      const volume       = u8(bytes, pos + 18);
      const flags        = u8(bytes, pos + 19);

      const packed    = (flags & 0x03) !== 0;
      const is16bit   = (flags & 0x04) !== 0;
      const smpLoop   = (flags & 0x08) !== 0;
      const smpBidi   = (flags & 0x10) !== 0;
      const smpReverse = (flags & 0x40) !== 0;

      pos += 20;

      thisSampleHdrs.push({
        length, loopStart, loopEnd, panFinetune, c4speed, relativeTone,
        volume, flags, packed, is16bit, smpLoop, smpBidi, smpReverse,
      });

      // Build sampleSettings entry
      const settings =
        (instrInfo.shadowInstr & 0xff) |
        ((smp << 8) & 0x7f00) |
        (packed ? 0x8000 : 0);
      sampleSettingsList.push(settings);
      globalSampleIdx++;
    }

    instruments2.push({
      name:           instrName,
      numSamples,
      sampleAssign,
      instrInfo,
      sampleNames:    thisSampleNames,
      sampleHdrs:     thisSampleHdrs,
      firstSampleIdx: firstSmp,
    });
  }

  const totalSamples = globalSampleIdx;

  // ── Text: composer name ───────────────────────────────────────────────────────
  const composerResult = readLenString(bytes, pos);
  pos = composerResult.nextOff;
  // Skip composer name (not exposed in TrackerSong currently)

  // Channel names (32 × length-prefixed)
  for (let c = 0; c < 32; c++) {
    if (pos >= bytes.length) break;
    const r = readLenString(bytes, pos);
    pos = r.nextOff;
  }

  // ── RLE-packed description text ───────────────────────────────────────────────
  // AMS2Description: packedLen(4) + unpackedLen(4) + packRoutine(1) + preProcessing(1) + packingMethod(1) = 11 bytes
  if (pos + 11 > bytes.length) {
    // Not enough for description header — skip gracefully
  } else {
    const packedLen = u32le(bytes, pos);
    // const unpackedLen = u32le(bytes, pos + 4);
    pos += 11; // skip full header
    if (packedLen > 11) {
      const textLength = packedLen - 11;
      pos += Math.min(textLength, bytes.length - pos); // skip text
    }
  }

  // ── Order list ────────────────────────────────────────────────────────────────
  if (pos + numOrds * 2 > bytes.length) return null;
  const orderList: number[] = [];
  for (let i = 0; i < numOrds; i++) {
    orderList.push(u16le(bytes, pos));
    pos += 2;
  }

  // ── Pattern data ──────────────────────────────────────────────────────────────
  const allPatternRows: (AMSCell[][] | null)[] = [];
  const patternNumRows: number[] = [];
  const patternNames: string[] = [];

  for (let p = 0; p < numPats; p++) {
    if (pos + 4 > bytes.length) {
      allPatternRows.push(null);
      patternNumRows.push(64);
      patternNames.push(`Pattern ${p}`);
      continue;
    }

    const patLength = u32le(bytes, pos);
    pos += 4;

    if (patLength < 2 || pos + patLength > bytes.length) {
      pos += Math.min(patLength, bytes.length - pos);
      allPatternRows.push(null);
      patternNumRows.push(64);
      patternNames.push(`Pattern ${p}`);
      continue;
    }

    const patStart = pos;
    const numRows  = u8(bytes, pos) + 1;
    pos++; // skip numRows byte
    pos++; // skip numChannels/numCommands byte (unused by us)
    patternNumRows.push(numRows);

    // Pattern name (length-prefixed)
    const patNameResult = readLenString(bytes, pos);
    patternNames.push(patNameResult.str || `Pattern ${p}`);
    pos = patNameResult.nextOff;

    const patternDataEnd = patStart + patLength;
    const remainingPatLen = patternDataEnd - pos;

    if (remainingPatLen <= 0) {
      allPatternRows.push(null);
      pos = patternDataEnd;
      continue;
    }

    const patChunk = bytes.subarray(pos, pos + remainingPatLen);
    pos = patternDataEnd;

    const cellRows = parseAMSPattern(patChunk, numRows, NUM_CHANNELS, true);
    allPatternRows.push(cellRows);
  }

  // ── Sample PCM data ────────────────────────────────────────────────────────
  // Read all non-shadow samples first, then copy shadow samples.
  const samplePCM: (Uint8Array | null)[] = new Array(totalSamples).fill(null);
  const packCharList: number[] = new Array(totalSamples).fill(0);

  for (let smp = 0; smp < totalSamples; smp++) {
    const settings = sampleSettingsList[smp] ?? 0;
    const isShadow = (settings & 0xff) !== 0;

    if (isShadow) continue; // will be copied later

    // Find which instrument+sampleIdx this global sample belongs to
    let foundHdr: AMS2SampleHeader | null = null;
    for (const instr of instruments2) {
      const localIdx = smp - instr.firstSampleIdx;
      if (localIdx >= 0 && localIdx < instr.numSamples) {
        foundHdr = instr.sampleHdrs[localIdx] ?? null;
        break;
      }
    }

    if (!foundHdr) continue;

    const bytesPerSample = foundHdr.is16bit ? 2 : 1;
    const byteLen = foundHdr.length * bytesPerSample;

    let packChar = 0;
    if (foundHdr.packed) {
      if (pos < bytes.length) {
        packChar = bytes[pos++] ?? 0;
      }
    }
    packCharList[smp] = packChar;

    if (byteLen > 0 && pos + byteLen <= bytes.length) {
      samplePCM[smp] = bytes.slice(pos, pos + byteLen);
      pos += byteLen;
    } else {
      if (byteLen > 0) pos = Math.min(pos + byteLen, bytes.length);
    }
  }

  // Copy shadow samples (share PCM with their source)
  for (let smp = 0; smp < totalSamples; smp++) {
    const settings = sampleSettingsList[smp] ?? 0;
    let sourceInstrIdx = (settings & 0xff);
    if (sourceInstrIdx === 0) continue;
    sourceInstrIdx--; // convert to 0-based

    if (sourceInstrIdx >= instruments2.length) continue;
    const sourceInstr = instruments2[sourceInstrIdx]!;

    const sampleIdxInInstr = (settings >> 8) & 0x7f;
    const sourceSmpGlobal = sourceInstr.firstSampleIdx + sampleIdxInInstr;

    if (sourceSmpGlobal < totalSamples && samplePCM[sourceSmpGlobal]) {
      samplePCM[smp] = samplePCM[sourceSmpGlobal]!;
      packCharList[smp] = packCharList[sourceSmpGlobal] ?? 0;
    }
  }

  // ── Build InstrumentConfig array ──────────────────────────────────────────
  // AMS2 uses instrument-based layout. We create one InstrumentConfig per
  // instrument, using the first (or primary) sample of that instrument.
  // This matches how other trackers represent multi-sample instruments.

  const instrumentConfigs: InstrumentConfig[] = [];
  let instId = 1;

  for (const instr of instruments2) {
    if (instr.numSamples === 0) {
      instrumentConfigs.push({
        id:        instId++,
        name:      instr.name || `Instrument ${instId}`,
        type:      'sample' as const,
        synthType: 'Sampler' as const,
        effects:   [],
        volume:    -60,
        pan:       0,
      } as unknown as InstrumentConfig);
      continue;
    }

    // Use first sample as the primary sample for this instrument
    const smpIdx = instr.firstSampleIdx;
    const hdr    = instr.sampleHdrs[0];
    const smpName = (instr.sampleNames[0] || instr.name || `Sample ${smpIdx + 1}`);

    if (!hdr) {
      instrumentConfigs.push({
        id:        instId++,
        name:      instr.name || `Instrument ${instId}`,
        type:      'sample' as const,
        synthType: 'Sampler' as const,
        effects:   [],
        volume:    -60,
        pan:       0,
      } as unknown as InstrumentConfig);
      continue;
    }

    const pcm = samplePCM[smpIdx];

    // C5 speed: c4speed * 2, adjusted for relative tone + finetune
    // We use a simplified approximation: base rate * 2, detune applied separately
    let c5Speed = hdr.c4speed > 0 ? hdr.c4speed * 2 : 8363 * 2;
    const finetuneCents = mod2xmFinetuneCents(hdr.panFinetune & 0x0f);
    // Apply relativeTone as semitone shift: each semitone = 100 cents
    const relToneCents = hdr.relativeTone * 100;

    const pan = hdr.panFinetune & 0xf0;
    const hasLoop = hdr.smpLoop && hdr.loopStart < hdr.loopEnd;
    const loopStart = Math.min(hdr.loopStart, hdr.length);
    const loopEnd   = Math.min(hdr.loopEnd,   hdr.length);
    const packChar  = packCharList[smpIdx] ?? 0;

    if (!pcm || pcm.length === 0 || hdr.length === 0) {
      instrumentConfigs.push({
        id:        instId,
        name:      instr.name || smpName,
        type:      'sample' as const,
        synthType: 'Sampler' as const,
        effects:   [],
        volume:    hdr.volume > 0 ? 20 * Math.log10(hdr.volume / 127) : -60,
        pan:       pan !== 0 ? Math.round(((pan - 128) / 128) * 50) : 0,
      } as unknown as InstrumentConfig);
      instId++;
      continue;
    }

    const inst = buildSampleInstrument(
      instId,
      instr.name || smpName,
      pcm,
      hdr.is16bit,
      hdr.packed,
      packChar,
      hdr.length,
      loopStart,
      loopEnd,
      hasLoop,
      c5Speed,
      hdr.volume,
      pan,
    );

    // Apply pitch adjustments
    const totalDetune = finetuneCents + relToneCents;
    if (totalDetune !== 0 && (inst as unknown as Record<string, unknown>)['sample']) {
      ((inst as unknown as Record<string, unknown>)['sample'] as Record<string, unknown>)['detune'] = totalDetune;
    }

    instrumentConfigs.push(inst);
    instId++;
  }

  // ── Build patterns ────────────────────────────────────────────────────────────
  const patterns: Pattern[] = [];

  for (let p = 0; p < numPats; p++) {
    const cellRows = allPatternRows[p];
    const numRows  = patternNumRows[p] ?? 64;
    const patName  = patternNames[p]   ?? `Pattern ${p}`;

    const channels: ChannelData[] = Array.from(
      { length: NUM_CHANNELS },
      (_, ch): ChannelData => {
        const rows: TrackerCell[] = Array.from({ length: numRows }, (__, row): TrackerCell => {
          const cellRow = cellRows?.[row];
          const cell    = cellRow?.[ch];
          if (!cell) return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
          return {
            note:       cell.note,
            instrument: cell.instr,
            volume:     cell.volume > 0 ? cell.volume - 1 : 0,
            effTyp:     cell.effTyp,
            eff:        cell.eff,
            effTyp2:    cell.effTyp2,
            eff2:       cell.eff2,
          };
        });

        return {
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
        };
      },
    );

    patterns.push({
      id:      `pattern-${p}`,
      name:    patName,
      length:  numRows,
      channels,
      importMetadata: {
        sourceFormat:            'AMS',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    NUM_CHANNELS,
        originalPatternCount:    numPats,
        originalInstrumentCount: numIns,
      },
    });
  }

  return {
    name:            songName,
    format:          'IT' as TrackerFormat,
    patterns,
    instruments:     instrumentConfigs,
    songPositions:   orderList,
    songLength:      orderList.length,
    restartPosition: 0,
    numChannels:     NUM_CHANNELS,
    initialSpeed,
    initialBPM,
    linearPeriods:   linearSlides,
    metadata: {
      tracker: `Velvet Studio ${versionHigh}.${String(versionLow).padStart(2, '0')}`,
      format: 'AMS',
    },
  } as unknown as TrackerSong;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse an AMS (Extreme's Tracker 1.x or Velvet Studio 2.x) file.
 *
 * Returns a TrackerSong on success, or null on any parse failure.
 * Never throws.
 */
export function parseAMSFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  try {
    if (!isAMSFormat(bytes)) return null;

    // Detect variant by magic
    if (
      bytes[0] === 0x45 && // E
      bytes[1] === 0x78 && // x
      bytes[2] === 0x74    // t
    ) {
      return parseAMS1(bytes, filename);
    }

    // AMS 2.x
    return parseAMS2(bytes, filename);
  } catch {
    return null;
  }
}
