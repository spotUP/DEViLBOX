/**
 * ULTParser.ts — UltraTracker (.ult) PC format parser
 *
 * UltraTracker is a PC tracker (DOS) created by MAS. It stores samples as
 * uncompressed PCM (8-bit signed or 16-bit signed LE), and patterns in a
 * channel-interleaved RLE-compressed format with two effects per cell.
 *
 * Binary layout:
 *   UltFileHeader (48 bytes):
 *     +0   signature[14] = "MAS_UTrack_V00"
 *     +14  version (uint8)  '1'–'4' (ASCII 0x31–0x34)
 *     +15  songName[32]     space-padded ASCII
 *     +47  messageLength    number of 32-byte message lines
 *
 *   After header:
 *     messageLength × 32 bytes   song message (ignored)
 *     numSamples (uint8)
 *     numSamples × UltSample     v≥'4': 66 bytes; v<'4': 64 bytes
 *     256 bytes                  order list (uint8 each; 0xFF=end, 0xFE=loop)
 *     numChannels (uint8, stored as numChannels-1)
 *     numPatterns (uint8, stored as numPatterns-1)
 *     numChannels bytes           panning (v≥'3': per-channel nibble*16+8; else LRRL)
 *     pattern data                channel-interleaved RLE
 *     sample PCM                  sequential, signed 8-bit or 16-bit LE
 *
 * Reference: OpenMPT Load_ult.cpp (BSD licence)
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// ── Binary helpers (little-endian throughout) ────────────────────────────────

function u8(v: DataView, off: number): number  { return v.getUint8(off); }
function i16le(v: DataView, off: number): number { return v.getInt16(off, true); }
function u16le(v: DataView, off: number): number { return v.getUint16(off, true); }
function u32le(v: DataView, off: number): number { return v.getUint32(off, true); }

/** Read a fixed-length ASCII field, trimming trailing null bytes and spaces. */
function readString(v: DataView, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const ch = v.getUint8(off + i);
    if (ch === 0) break;
    s += String.fromCharCode(ch);
  }
  return s.trim();
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SIGNATURE         = 'MAS_UTrack_V00';
const HEADER_SIZE       = 48;
const ROWS_PER_PATTERN  = 64;

/** UltSample flags */
const ULT_16BIT     = 4;
const ULT_LOOP      = 8;
const ULT_PINGPONG  = 16;

// ── XM effect numbers used in output cells ────────────────────────────────────
// These match the TrackerReplayer dispatch table (XM numbering).
const XM_ARPEGGIO    = 0x00;  // Axx
const XM_PORTA_UP    = 0x01;  // 1xx
const XM_PORTA_DOWN  = 0x02;  // 2xx
const XM_TONE_PORTA  = 0x03;  // 3xx
const XM_VIBRATO     = 0x04;  // 4xx
const XM_TREMOLO     = 0x07;  // 7xx
const XM_OFFSET      = 0x09;  // 9xx
const XM_VOL_SLIDE   = 0x0A;  // Axx
const XM_POS_JUMP    = 0x0B;  // Bxx
const XM_SET_VOLUME  = 0x0C;  // Cxx
const XM_PAT_BREAK   = 0x0D;  // Dxx
const XM_EXTENDED    = 0x0E;  // Exx
const XM_SPEED       = 0x0F;  // Fxx (< 0x20)
const XM_TEMPO       = 0x0F;  // Fxx (≥ 0x20) — same slot, param distinguishes
const XM_KEYOFF_NOTE = 97;    // XM note value for key-off

/** S3MCMDEX: represented as effect 0x0E (extended) with the S3M param byte.
 *  The TrackerReplayer extended handler dispatches S3MCMDEX-like params
 *  via the standard XM extended effect block, so we re-encode them as Exx. */
const XM_S3M_CMDEX   = 0x0E;  // param carries the S3M extended byte

/** No effect — effTyp 0 with param 0 is treated as no-op arpeggio. */
const EFF_NONE = 0;
const PAR_NONE = 0;

// ── ULT → XM effect translation ──────────────────────────────────────────────

/**
 * Translate a single UltraTracker effect nibble + param byte into an XM
 * effTyp / eff pair.
 *
 * The ULT effect table (0–F) maps to OpenMPT's CMD_* constants; we output
 * the corresponding XM effect numbers used by TrackerReplayer.
 *
 * Returns [effTyp, eff].
 */
function translateULTEffect(
  e: number,
  param: number,
  version: number,  // ASCII char code: 0x31='1' … 0x34='4'
): [number, number] {
  const nibble = e & 0x0F;

  switch (nibble) {
    case 0x0: // Arpeggio — only meaningful in v≥'3' and param≠0
      if (param !== 0 && version >= 0x33 /* '3' */) {
        return [XM_ARPEGGIO, param];
      }
      return [EFF_NONE, PAR_NONE];

    case 0x1: // Portamento up
      return [XM_PORTA_UP, param];

    case 0x2: // Portamento down
      return [XM_PORTA_DOWN, param];

    case 0x3: // Tone portamento
      return [XM_TONE_PORTA, param];

    case 0x4: // Vibrato
      return [XM_VIBRATO, param];

    case 0x5: // Play backwards / key-off
      if ((param & 0x0F) === 0x02 || (param & 0xF0) === 0x20) {
        // S3MCMDEX 9F — sample reverse
        return [XM_S3M_CMDEX, 0x9F];
      }
      if (((param & 0x0F) === 0x0C || (param & 0xF0) === 0xC0) && version >= 0x33) {
        // Key-off: encode as note-off note rather than effect
        // We return a sentinel that the caller can detect.
        // Use a special effect code that we intercept in the caller.
        return [0xFF /* KEYOFF_SENTINEL */, 0];
      }
      return [EFF_NONE, PAR_NONE];

    case 0x6: // Undefined
      return [EFF_NONE, PAR_NONE];

    case 0x7: // Tremolo — only in v≥'4'
      if (version >= 0x34 /* '4' */) {
        return [XM_TREMOLO, param];
      }
      return [EFF_NONE, PAR_NONE];

    case 0x8: // Undefined
      return [EFF_NONE, PAR_NONE];

    case 0x9: // Sample offset
      return [XM_OFFSET, param];

    case 0xA: // Volume slide — ULT only uses one nibble at a time
      if (param & 0xF0) {
        return [XM_VOL_SLIDE, param & 0xF0];
      }
      return [XM_VOL_SLIDE, param];

    case 0xB: // Panning — param = (param & 0x0F) * 0x11 → 0x00–0xFF range
      return [0x08 /* XM set panning */, (param & 0x0F) * 0x11];

    case 0xC: // Set volume (CMD_VOLUME8 — raw 0–255, clamp to 64 for XM)
      return [XM_SET_VOLUME, Math.min(64, param)];

    case 0xD: // Pattern break — BCD encoded
      return [XM_PAT_BREAK, 10 * (param >> 4) + (param & 0x0F)];

    case 0xE: { // Extended effects
      const hiNibble = param >> 4;
      const loNibble = param & 0x0F;
      switch (hiNibble) {
        case 0x1: // Fine portamento up
          return [XM_PORTA_UP, 0xF0 | loNibble];
        case 0x2: // Fine portamento down
          return [XM_PORTA_DOWN, 0xF0 | loNibble];
        case 0x8: // Pan position (v≥'4' only)
          if (version >= 0x34) {
            return [XM_S3M_CMDEX, 0x60 | loNibble];
          }
          return [EFF_NONE, PAR_NONE];
        case 0x9: // Retrigger
          return [XM_EXTENDED, 0x90 | loNibble];
        case 0xA: // Fine volume slide up
          return [XM_VOL_SLIDE, (loNibble << 4) | 0x0F];
        case 0xB: // Fine volume slide down
          return [XM_VOL_SLIDE, 0xF0 | loNibble];
        case 0xC: // Note cut at tick
          return [XM_S3M_CMDEX, 0xC0 | loNibble];
        case 0xD: // Note delay
          return [XM_S3M_CMDEX, 0xD0 | loNibble];
        default:
          return [EFF_NONE, PAR_NONE];
      }
    }

    case 0xF: // Speed / BPM
      if (param > 0x2F) {
        return [XM_TEMPO, param];
      }
      return [XM_SPEED, param];

    default:
      return [EFF_NONE, PAR_NONE];
  }
}

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Returns true if the buffer begins with the UltraTracker signature and has a
 * valid version byte.
 */
export function isULTFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < HEADER_SIZE) return false;
  const v = new DataView(buffer);

  // Check signature (14 bytes at offset 0)
  for (let i = 0; i < SIGNATURE.length; i++) {
    if (v.getUint8(i) !== SIGNATURE.charCodeAt(i)) return false;
  }

  // Version byte must be '1'–'4'
  const version = v.getUint8(14);
  if (version < 0x31 || version > 0x34) return false;

  return true;
}

// ── WAV encoding for 16-bit signed LE PCM ────────────────────────────────────

/** Encode raw 16-bit signed LE PCM bytes into a WAV ArrayBuffer. */
function pcm16ToWAV(pcmBytes: Uint8Array, sampleRate: number): ArrayBuffer {
  const numFrames = pcmBytes.length >> 1;   // 2 bytes per frame
  const dataSize  = numFrames * 2;
  const fileSize  = 44 + dataSize;
  const buf  = new ArrayBuffer(fileSize);
  const view = new DataView(buf);

  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4,  fileSize - 8, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16,              true);  // chunk size
  view.setUint16(20, 1,               true);  // PCM
  view.setUint16(22, 1,               true);  // mono
  view.setUint32(24, sampleRate,      true);  // sample rate
  view.setUint32(28, sampleRate * 2,  true);  // byte rate (16-bit mono)
  view.setUint16(32, 2,               true);  // block align
  view.setUint16(34, 16,              true);  // bit depth
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  // Copy raw 16-bit signed LE samples directly
  for (let i = 0; i < numFrames; i++) {
    const sample = view.constructor === DataView
      ? new DataView(pcmBytes.buffer, pcmBytes.byteOffset + i * 2, 2).getInt16(0, true)
      : (pcmBytes[i * 2] | (pcmBytes[i * 2 + 1] << 8));
    view.setInt16(44 + i * 2, sample < 0x8000 ? sample : sample - 0x10000, true);
  }

  return buf;
}

/** Read raw signed 16-bit LE samples and encode as WAV. */
function buildWAV16(
  pcmBytes: Uint8Array,
  sampleRate: number,
  loopStart: number,
  loopEnd: number,
): ArrayBuffer {
  // PCM bytes are already raw signed 16-bit LE — just wrap into WAV
  const numFrames = pcmBytes.length >> 1;
  const dataSize  = numFrames * 2;
  const fileSize  = 44 + dataSize;
  const buf  = new ArrayBuffer(fileSize);
  const view = new DataView(buf);
  void loopStart; void loopEnd;  // embedded in sampler config, not WAV

  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4,  fileSize - 8, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16,            true);
  view.setUint16(20, 1,             true);  // PCM
  view.setUint16(22, 1,             true);  // mono
  view.setUint32(24, sampleRate,    true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2,             true);
  view.setUint16(34, 16,            true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  // Copy raw bytes
  const dst = new Uint8Array(buf, 44);
  dst.set(pcmBytes.subarray(0, numFrames * 2));

  return buf;
}

// ── 8-bit signed PCM → WAV (inline, matching AmigaUtils.pcm8ToWAV style) ────

function pcm8ToWAV(pcm: Uint8Array, sampleRate: number): ArrayBuffer {
  const numSamples = pcm.length;
  const dataSize   = numSamples * 2;  // upconvert to 16-bit
  const fileSize   = 44 + dataSize;
  const buf  = new ArrayBuffer(fileSize);
  const view = new DataView(buf);

  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4,  fileSize - 8, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16,            true);
  view.setUint16(20, 1,             true);
  view.setUint16(22, 1,             true);
  view.setUint32(24, sampleRate,    true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2,             true);
  view.setUint16(34, 16,            true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  let off = 44;
  for (let i = 0; i < numSamples; i++) {
    const s8 = pcm[i] < 128 ? pcm[i] : pcm[i] - 256;
    view.setInt16(off, s8 * 256, true);
    off += 2;
  }
  return buf;
}

// ── WAV → base64 data URL (matching AmigaUtils.createSamplerInstrument style) ─

function wavToDataUrl(wavBuf: ArrayBuffer): string {
  const bytes  = new Uint8Array(wavBuf);
  let binary   = '';
  const CHUNK  = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, Math.min(i + CHUNK, bytes.length))));
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

// ── UltSample descriptor ──────────────────────────────────────────────────────

interface UltSample {
  name:       string;
  filename:   string;
  loopStart:  number;   // bytes
  loopEnd:    number;   // bytes
  sizeStart:  number;   // bytes (PCM data offset from start of sample data)
  sizeEnd:    number;   // bytes (sizeEnd - sizeStart = sample length)
  volume:     number;   // 0–255
  flags:      number;   // ULT_16BIT, ULT_LOOP, ULT_PINGPONG
  speed:      number;   // uint16LE; C5 speed = speed * 2
  finetune:   number;   // int16LE
}

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Parse a UltraTracker (.ult) file into a TrackerSong.
 *
 * @throws If the file fails format validation.
 */
export async function parseULTFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  if (!isULTFormat(buffer)) {
    throw new Error('ULTParser: not a valid UltraTracker file');
  }

  const v     = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let   pos   = 0;

  // ── File header (48 bytes) ─────────────────────────────────────────────────
  //   +0   signature[14]
  //   +14  version (uint8)
  //   +15  songName[32]
  //   +47  messageLength (uint8)

  const version       = v.getUint8(14);   // 0x31–0x34 ('1'–'4')
  const songName      = readString(v, 15, 32) || filename.replace(/\.[^/.]+$/, '');
  const messageLength = v.getUint8(47);
  pos = HEADER_SIZE;

  // ── Song message (skip) ────────────────────────────────────────────────────
  pos += messageLength * 32;

  // ── Number of samples ─────────────────────────────────────────────────────
  const numSamples = v.getUint8(pos);
  pos += 1;

  // ── Sample headers ─────────────────────────────────────────────────────────
  //   v≥'4': 66 bytes per sample (full UltSample)
  //   v<'4': 64 bytes — read 64, then rewrite finetune = speed; speed = 8363
  //
  //   +0   name[32]
  //   +32  filename[12]
  //   +44  loopStart (uint32LE, bytes)
  //   +48  loopEnd   (uint32LE, bytes)
  //   +52  sizeStart (uint32LE, bytes)
  //   +56  sizeEnd   (uint32LE, bytes)
  //   +60  volume    (uint8)
  //   +61  flags     (uint8)
  //   +62  speed     (uint16LE)   ← only present in v≥'4'
  //   +64  finetune  (int16LE)    ← only present in v≥'4'

  const sampleHeaders: UltSample[] = [];
  for (let s = 0; s < numSamples; s++) {
    const base = pos;

    const name      = readString(v, base,      32);
    const filename_ = readString(v, base + 32, 12);
    const loopStart = u32le(v, base + 44);
    const loopEnd   = u32le(v, base + 48);
    const sizeStart = u32le(v, base + 52);
    const sizeEnd   = u32le(v, base + 56);
    const volume    = u8(v, base + 60);
    const flags     = u8(v, base + 61);

    let speed:    number;
    let finetune: number;

    if (version >= 0x34 /* '4' */) {
      speed    = u16le(v, base + 62);
      finetune = i16le(v, base + 64);
      pos     += 66;
    } else {
      // In v1–v3, only 64 bytes: speed field is at +62 as uint16 but it is
      // actually the finetune field; the real playback speed defaults to 8363.
      finetune = u16le(v, base + 62);   // was stored in "speed" slot
      speed    = 8363;
      pos     += 64;
    }

    sampleHeaders.push({
      name:       name || `Sample ${s + 1}`,
      filename:   filename_,
      loopStart,
      loopEnd,
      sizeStart,
      sizeEnd,
      volume,
      flags,
      speed,
      finetune,
    });
  }

  // ── Order list (256 bytes) ─────────────────────────────────────────────────
  // 0xFF = end-of-list, 0xFE = loop point
  const orderList: number[] = [];
  let restartPos = 0;
  for (let i = 0; i < 256; i++) {
    const b = v.getUint8(pos + i);
    if (b === 0xFF) break;
    if (b === 0xFE) {
      restartPos = orderList.length;
      break;
    }
    orderList.push(b);
  }
  pos += 256;

  // ── Channel / pattern counts ───────────────────────────────────────────────
  const numChannels = v.getUint8(pos) + 1;   // stored as numChannels - 1
  pos += 1;
  const numPatterns = v.getUint8(pos) + 1;   // stored as numPatterns - 1
  pos += 1;

  // ── Channel panning ────────────────────────────────────────────────────────
  // v≥'3': per-channel byte; pan = (byte & 0x0F) * 16 + 8  →  0x08–0xF8
  // v<'3': LRRL alternating: odd channels pan right (192), even pan left (64)
  //
  // We convert to ±50 pan range used by TrackerCell / ChannelData:
  //   XM pan 0=full left (−50), 128=center (0), 255=full right (+50)
  const channelPan: number[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    if (version >= 0x33 /* '3' */) {
      const raw = (v.getUint8(pos + ch) & 0x0F) * 16 + 8;  // 0–248, 8-step
      channelPan.push(Math.round((raw - 128) / 128 * 50));
    } else {
      // LRRL: ch 0,3 → left (64→ −25), ch 1,2 → right (192→ +25)
      channelPan.push((ch & 1) ? 25 : -25);
    }
  }
  if (version >= 0x33) {
    pos += numChannels;
  }
  // (v<'3' reads no pan bytes — LRRL is synthesised above)

  // ── Pattern data — channel-interleaved RLE ─────────────────────────────────
  // Allocate: patterns[patIdx][chIdx][rowIdx] = TrackerCell
  // We fill channel-first, then pattern-first, then row-by-row.
  //
  // Outer loop: for each channel
  //   Inner loop: for each pattern
  //     Read rows until 64 rows consumed:
  //       b = read byte
  //       if b == 0xFC → repeat = read byte; b = read byte (note byte)
  //       else → repeat = 1; note byte = b
  //       Read 4 more bytes: [instr, cmd, para1, para2]
  //       Fill `repeat` rows with the decoded cell

  // Build empty 3-D array: [pat][ch][row]
  const patternData: TrackerCell[][][] = Array.from(
    { length: numPatterns },
    () => Array.from(
      { length: numChannels },
      () => new Array(ROWS_PER_PATTERN).fill(null) as TrackerCell[],
    ),
  );

  // Fill empty cells with a canonical empty TrackerCell
  const emptyCell = (): TrackerCell => ({
    note: 0, instrument: 0, volume: 0,
    effTyp: EFF_NONE, eff: PAR_NONE,
    effTyp2: EFF_NONE, eff2: PAR_NONE,
  });
  for (let pat = 0; pat < numPatterns; pat++) {
    for (let ch = 0; ch < numChannels; ch++) {
      for (let row = 0; row < ROWS_PER_PATTERN; row++) {
        patternData[pat][ch][row] = emptyCell();
      }
    }
  }

  for (let ch = 0; ch < numChannels; ch++) {
    for (let pat = 0; pat < numPatterns; pat++) {
      let row = 0;
      while (row < ROWS_PER_PATTERN) {
        if (pos >= buffer.byteLength) break;

        let repeat = 1;
        let noteByte = bytes[pos++];

        if (noteByte === 0xFC) {
          // Repeat marker: next byte is the count, then the note byte
          if (pos + 1 >= buffer.byteLength) break;
          repeat   = bytes[pos++];
          noteByte = bytes[pos++];
        }

        if (pos + 4 > buffer.byteLength) break;
        const instr = bytes[pos++];
        const cmd   = bytes[pos++];
        const para1 = bytes[pos++];
        const para2 = bytes[pos++];

        // Decode note: 0 = empty; 1–96 valid → XM note = note + 24
        // (OpenMPT: note + 23 + NOTE_MIN, where NOTE_MIN = 1, so note + 24)
        let xmNote = 0;
        if (noteByte > 0 && noteByte < 97) {
          xmNote = noteByte + 24;
        }

        // Translate both effects
        const [eff1Typ, eff1Par] = translateULTEffect(cmd & 0x0F,  para1, version);
        const [eff2Typ, eff2Par] = translateULTEffect(cmd >> 4,    para2, version);

        // Handle key-off sentinel from effect 5
        let finalNote = xmNote;
        let finalEff1Typ = eff1Typ;
        let finalEff1Par = eff1Par;
        let finalEff2Typ = eff2Typ;
        let finalEff2Par = eff2Par;

        if (eff1Typ === 0xFF) {
          finalNote    = XM_KEYOFF_NOTE;
          finalEff1Typ = EFF_NONE;
          finalEff1Par = PAR_NONE;
        }
        if (eff2Typ === 0xFF) {
          finalNote    = XM_KEYOFF_NOTE;
          finalEff2Typ = EFF_NONE;
          finalEff2Par = PAR_NONE;
        }

        // Clamp repeat to remaining rows
        if (repeat + row > ROWS_PER_PATTERN) {
          repeat = ROWS_PER_PATTERN - row;
        }
        if (repeat === 0) break;

        const cell: TrackerCell = {
          note:        finalNote,
          instrument:  instr,
          volume:      0,
          effTyp:      finalEff1Typ,
          eff:         finalEff1Par,
          effTyp2:     finalEff2Typ,
          eff2:        finalEff2Par,
        };

        for (let r = 0; r < repeat; r++) {
          patternData[pat][ch][row + r] = { ...cell };
        }
        row += repeat;
      }
    }
  }

  const pcmDataStart = pos;

  // ── Sample PCM data ────────────────────────────────────────────────────────
  // Samples are stored sequentially. For each sample, the length in bytes is:
  //   sizeEnd - sizeStart
  // Format: 8-bit signed PCM or 16-bit signed LE PCM (flag ULT_16BIT).
  // UltraTracker uses sustain loops; we treat them as regular loops.
  //
  // loopStart / loopEnd are in *bytes*. For 16-bit samples, the C++ reference
  // divides by 2 to get frame indices. We store loop in bytes for our WAV builder.

  let pcmCursor = pcmDataStart;
  const samplePCM: (Uint8Array | null)[] = [];

  for (let s = 0; s < numSamples; s++) {
    const hdr     = sampleHeaders[s];
    const byteLen = hdr.sizeEnd > hdr.sizeStart ? hdr.sizeEnd - hdr.sizeStart : 0;

    if (byteLen > 0 && pcmCursor + byteLen <= buffer.byteLength) {
      samplePCM.push(bytes.slice(pcmCursor, pcmCursor + byteLen));
      pcmCursor += byteLen;
    } else {
      samplePCM.push(null);
      if (byteLen > 0) pcmCursor += byteLen;
    }
  }

  // ── Build InstrumentConfig list ────────────────────────────────────────────

  const instruments: InstrumentConfig[] = [];

  for (let s = 0; s < numSamples; s++) {
    const hdr   = sampleHeaders[s];
    const id    = s + 1;
    const pcm   = samplePCM[s];
    const is16  = (hdr.flags & ULT_16BIT)    !== 0;
    const loop  = (hdr.flags & ULT_LOOP)     !== 0;
    const ping  = (hdr.flags & ULT_PINGPONG) !== 0;

    // C5 speed: UltraTracker stores half the actual rate → multiply by 2
    const c5Speed = hdr.speed * 2;

    if (!pcm || pcm.length === 0) {
      instruments.push({
        id,
        name:      hdr.name,
        type:      'sample'  as const,
        synthType: 'Sampler' as const,
        effects:   [],
        volume:    -60,
        pan:       0,
      } as unknown as InstrumentConfig);
      continue;
    }

    // Loop points: loopStart / loopEnd are byte offsets in the sample data.
    // For 16-bit samples, divide by 2 to get frame counts (OpenMPT does this too).
    let loopStartFrames = 0;
    let loopEndFrames   = 0;
    if (loop) {
      loopStartFrames = is16 ? hdr.loopStart >> 1 : hdr.loopStart;
      loopEndFrames   = is16 ? hdr.loopEnd   >> 1 : hdr.loopEnd;
      const maxFrames = is16 ? pcm.length >> 1 : pcm.length;
      loopEndFrames   = Math.min(loopEndFrames, maxFrames);
    }

    // Volume: ULT stores 0–255; createSamplerInstrument expects 0–64 range for
    // its log conversion. Scale accordingly.
    const vol64 = Math.round(hdr.volume / 4);

    if (is16) {
      // 16-bit: build WAV directly, then createSamplerInstrument-style config
      const wavBuf  = buildWAV16(pcm, c5Speed, loopStartFrames, loopEndFrames);
      const dataUrl = wavToDataUrl(wavBuf);
      const hasLoop = loop && loopEndFrames > loopStartFrames;
      const loopType = ping ? 'pingpong' as const : 'forward' as const;

      instruments.push({
        id,
        name:      hdr.name.replace(/\0/g, '').trim() || `Sample ${id}`,
        type:      'sample'  as const,
        synthType: 'Sampler' as const,
        effects:   [],
        volume:    vol64 > 0 ? 20 * Math.log10(vol64 / 64) : -60,
        pan:       0,
        sample: {
          audioBuffer: wavBuf,
          url:         dataUrl,
          baseNote:    'C3',
          detune:      0,
          loop:        hasLoop,
          loopType:    hasLoop ? loopType : 'off' as const,
          loopStart:   loopStartFrames,
          loopEnd:     loopEndFrames > 0 ? loopEndFrames : pcm.length >> 1,
          sampleRate:  c5Speed,
          reverse:     false,
          playbackRate: 1.0,
        },
      } as unknown as InstrumentConfig);
    } else {
      // 8-bit: use createSamplerInstrument (encodes to 16-bit WAV internally)
      const loopEnd = (loop && loopEndFrames > loopStartFrames) ? loopEndFrames : 0;
      instruments.push(
        createSamplerInstrument(id, hdr.name, pcm, vol64, c5Speed, loopStartFrames, loopEnd),
      );
    }
  }

  // ── Build Pattern list ─────────────────────────────────────────────────────

  const patterns: Pattern[] = [];

  for (let pIdx = 0; pIdx < numPatterns; pIdx++) {
    const channels: ChannelData[] = Array.from(
      { length: numChannels },
      (_, ch): ChannelData => ({
        id:           `channel-${ch}`,
        name:         `Channel ${ch + 1}`,
        muted:        false,
        solo:         false,
        collapsed:    false,
        volume:       100,
        pan:          channelPan[ch] ?? 0,
        instrumentId: null,
        color:        null,
        rows:         patternData[pIdx][ch],
      }),
    );

    patterns.push({
      id:      `pattern-${pIdx}`,
      name:    `Pattern ${pIdx}`,
      length:  ROWS_PER_PATTERN,
      channels,
      importMetadata: {
        sourceFormat:            'ULT',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    numChannels,
        originalPatternCount:    numPatterns,
        originalInstrumentCount: numSamples,
      },
    });
  }

  // ── Assemble TrackerSong ───────────────────────────────────────────────────

  return {
    name:            songName,
    format:          'MOD' as TrackerFormat,  // closest XM-style format for replayer
    patterns,
    instruments,
    songPositions:   orderList,
    songLength:      orderList.length,
    restartPosition: restartPos,
    numChannels,
    initialSpeed:    4,    // UltraTracker default speed
    initialBPM:      125,  // UltraTracker default BPM
    linearPeriods:   false,
  };
}
