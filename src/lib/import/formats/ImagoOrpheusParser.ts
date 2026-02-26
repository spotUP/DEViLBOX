/**
 * ImagoOrpheusParser.ts — Imago Orpheus (.imf) module loader
 *
 * Imago Orpheus is a PC DOS tracker that supports up to 32 channels,
 * multi-sample instruments with envelopes, and a rich effect set.
 *
 * Binary layout:
 *   IMFFileHeader (576 bytes):
 *     +0    title[32]         — song name (null-terminated)
 *     +32   ordNum (uint16LE) — number of orders
 *     +34   patNum (uint16LE) — number of patterns
 *     +36   insNum (uint16LE) — number of instruments
 *     +38   flags  (uint16LE) — bit 0 = linear slides
 *     +40   unused1[8]
 *     +48   tempo  (uint8)    — initial speed (Axx)
 *     +49   bpm    (uint8)    — initial BPM (Txx, 32-255)
 *     +50   master (uint8)    — master volume (0-64)
 *     +51   amp    (uint8)    — amplification (4-127)
 *     +52   unused2[8]
 *     +60   im10[4]           — "IM10" magic
 *     +64   channels[32]      — 32 x IMFChannel (16 bytes each = 512 bytes)
 *
 *   After header:
 *     orders[256]             — uint8 order list (0xFF = end)
 *     patNum x pattern chunks:
 *       length  (uint16LE)   — total chunk size in bytes (includes the 4-byte header)
 *       numRows (uint16LE)   — row count
 *       packed row data      — variable-length
 *     insNum x IMFInstrument (384 bytes each)
 *     For each instrument: smpNum x IMFSample (64 bytes) + raw PCM data
 *
 * Pattern row encoding (mask byte per event):
 *   0x00         → next row
 *   mask & 0x1F  = channel (0-based)
 *   mask & 0x20  → read note (uint8) + instrument (uint8)
 *   mask & 0xC0 == 0x40 → read effect1 (cmd+data, 2 bytes)
 *   mask & 0xC0 == 0x80 → read effect2 (cmd+data, 2 bytes)
 *   mask & 0xC0 == 0xC0 → read both effects (4 bytes)
 *
 * Note encoding:
 *   0xA0 = key off
 *   0xFF = empty
 *   else: (note >> 4) * 12 + (note & 0x0F) + 12 + 1  (XM 1-based)
 *
 * Reference: OpenMPT soundlib/Load_imf.cpp
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// ── Binary helpers ────────────────────────────────────────────────────────────

function u8(bytes: Uint8Array, off: number): number  { return bytes[off] ?? 0; }
function u16le(bytes: Uint8Array, off: number): number {
  return ((bytes[off] ?? 0) | ((bytes[off + 1] ?? 0) << 8)) >>> 0;
}
function u32le(bytes: Uint8Array, off: number): number {
  return (((bytes[off] ?? 0) | ((bytes[off + 1] ?? 0) << 8) | ((bytes[off + 2] ?? 0) << 16) | ((bytes[off + 3] ?? 0) << 24)) >>> 0);
}

function readString(bytes: Uint8Array, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = bytes[off + i] ?? 0;
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
}

// ── Constants ─────────────────────────────────────────────────────────────────

const IMF_HDR_SIZE        = 576;   // sizeof(IMFFileHeader)
const IMF_CHANNEL_SIZE    = 16;    // sizeof(IMFChannel)
const IMF_INSTRUMENT_SIZE = 384;   // sizeof(IMFInstrument)
const IMF_SAMPLE_SIZE     = 64;    // sizeof(IMFSample)
const MAX_CHANNELS        = 32;
const NOTE_KEYOFF         = 97;    // XM note-off

// IMFFileHeader field offsets
const OFF_TITLE    =  0;
const OFF_ORD_NUM  = 32;
const OFF_PAT_NUM  = 34;
const OFF_INS_NUM  = 36;
const OFF_FLAGS    = 38;
const OFF_TEMPO    = 48;
const OFF_BPM      = 49;
const OFF_MASTER   = 50;
const OFF_AMP      = 51;
const OFF_IM10     = 60;
const OFF_CHANNELS = 64;

// IMFChannel sub-offsets (relative to channel base)
const CHOFF_PAN    = 12;
const CHOFF_STATUS = 13;

// Flag bits
const FLAG_LINEAR_SLIDES = 0x01;

// ── Format detection ──────────────────────────────────────────────────────────

export function isImagoOrpheusFormat(bytes: Uint8Array): boolean {
  if (bytes.length < IMF_HDR_SIZE + 256) return false;

  // Check "IM10" magic at offset 60
  if (bytes[OFF_IM10]     !== 0x49  // 'I'
   || bytes[OFF_IM10 + 1] !== 0x4D  // 'M'
   || bytes[OFF_IM10 + 2] !== 0x31  // '1'
   || bytes[OFF_IM10 + 3] !== 0x30) // '0'
    return false;

  const ordNum = u16le(bytes, OFF_ORD_NUM);
  const insNum = u16le(bytes, OFF_INS_NUM);
  const bpm    = u8(bytes, OFF_BPM);
  const master = u8(bytes, OFF_MASTER);
  const amp    = u8(bytes, OFF_AMP);

  if (ordNum > 256)   return false;
  if (insNum >= 256)  return false;  // MAX_INSTRUMENTS
  if (bpm < 32)       return false;
  if (master > 64)    return false;
  if (amp < 4 || amp > 127) return false;

  // Count valid channels (status must be 0, 1, or 2; anything >2 is invalid)
  let detectedChannels = 0;
  for (let chn = 0; chn < MAX_CHANNELS; chn++) {
    const base   = OFF_CHANNELS + chn * IMF_CHANNEL_SIZE;
    const status = u8(bytes, base + CHOFF_STATUS);
    if (status < 2) detectedChannels = chn + 1;
    else if (status > 2) return false;
  }
  if (detectedChannels === 0) return false;

  return true;
}

// ── Effect translation ────────────────────────────────────────────────────────

// Maps IMF effect command (0x00-0x23) to XM effect type.
// 0 = none. Values > 0x23 map to 0.
const IMF_EFFECTS: number[] = [
  0x00, // 0x00 none
  0x0F, // 0x01 Axx set speed
  0x0F, // 0x02 Bxx set tempo — will be promoted to CMD_TEMPO by speed>=0x20 logic
  0x03, // 0x03 Cxx tone porta
  0x05, // 0x04 Dxy tone porta + vol slide
  0x04, // 0x05 Exy vibrato
  0x06, // 0x06 Fxy vibrato + vol slide
  0x04, // 0x07 Gxy fine vibrato — reuse vibrato (no dedicated XM slot)
  0x07, // 0x08 Hxy tremolo
  0x00, // 0x09 Ixy arpeggio — map to none (arpeggio = 0x00 in XM)
  0x08, // 0x0A Axx set pan
  0x19, // 0x0B Bxy pan slide (XM Pxy = 0x19)
  0x0C, // 0x0C Cxx set volume
  0x0A, // 0x0D Dxy volume slide
  0x0A, // 0x0E Exy fine volume slide (adjusted below)
  0x24, // 0x0F Fxx set finetune — map to XM finetune extension
  0x00, // 0x10 Gxy note slide up  (no XM equiv)
  0x00, // 0x11 Hxy note slide down (no XM equiv)
  0x01, // 0x12 Ixx porta up
  0x02, // 0x13 Jxx porta down
  0x01, // 0x14 Kxx fine porta up (adjusted)
  0x02, // 0x15 Lxx fine porta down (adjusted)
  0x00, // 0x16 Mxx filter cutoff → ignored
  0x00, // 0x17 Nxy filter slide   → ignored
  0x09, // 0x18 Oxx sample offset
  0x00, // 0x19 Pxx fine sample offset → unsupported
  0x14, // 0x1A Qxx key off (XM = 0x14)
  0x1B, // 0x1B Rxy retrig (not standard XM but we pass through)
  0x1D, // 0x1C Sxy tremor — no XM equiv, map none
  0x0B, // 0x1D Txx position jump
  0x0D, // 0x1E Uxx pattern break
  0x10, // 0x1F Vxx set master vol (XM global vol = 0x10)
  0x11, // 0x20 Wxy master vol slide (XM = 0x11)
  0x0E, // 0x21 Xxx extended (S3MCMDEX → XM Exy)
  0x00, // 0x22 Yxx chorus → ignored
  0x00, // 0x23 Zxx reverb → ignored
];

/** Translate an IMF effect (cmd, param) → {effTyp, eff} for TrackerCell. */
function translateIMFEffect(cmd: number, param: number): { effTyp: number; eff: number } {
  // Adjust parameters before mapping (mirrors OpenMPT TranslateIMFEffect)
  switch (cmd) {
    case 0x01: // set speed — pass through as-is
      break;
    case 0x02: // set BPM — map to XM tempo (effect F with param >= 0x20 means BPM)
      // We use 0x0F (speed/tempo). Param is already BPM value so just use F effect.
      // In XM: effect F with param >= 0x20 = set BPM
      return { effTyp: 0x0F, eff: param };
    case 0x0E: // fine vol slide
      if (param === 0) {
        /* nothing */
      } else if (param === 0xF0) {
        param = 0xEF;
      } else if (param === 0x0F) {
        param = 0xFE;
      } else if (param & 0xF0) {
        param = (param & 0xF0) | 0x0F;
      } else {
        param = (param & 0x0F) | 0xF0;
      }
      return { effTyp: 0x0A, eff: param };
    case 0x0F: // set finetune — XM uses E5x for set finetune? We pass as-is noting it's irrelevant
      param ^= 0x80;
      return { effTyp: 0x00, eff: 0 }; // no direct XM mapping; suppress
    case 0x14: // fine porta up
    case 0x15: // fine porta down
      if (param >> 4) {
        param = 0xF0 | (param >> 4);
      } else {
        param = 0xE0 | (param & 0x0F);
      }
      return { effTyp: cmd === 0x14 ? 0x01 : 0x02, eff: param };
    case 0x1F: // set master vol — param * 2 (mirrors OpenMPT)
      param = Math.min(0xFF, param * 2);
      return { effTyp: 0x10, eff: param };
    case 0x21: { // extended
      let n = 0;
      switch (param >> 4) {
        case 0:    /* undefined, allow */ break;
        case 0x1:  /* set filter */
        case 0xF:  /* invert loop */
          return { effTyp: 0x00, eff: 0 };
        case 0x3: n = 0x20; break; // glissando
        case 0x5: n = 0x30; break; // vibrato waveform
        case 0x8: n = 0x40; break; // tremolo waveform
        case 0xA: n = 0xB0; break; // pattern loop
        case 0xB: n = 0xE0; break; // pattern delay
        case 0xC: // note cut
        case 0xD: // note delay
          if (!param) return { effTyp: 0x00, eff: 0 };
          break;
        case 0xE: // ignore envelope
          switch (param & 0x0F) {
            case 0: param = 0x77; break;
            case 1: param = 0x77; break;
            case 2: param = 0x79; break;
            case 3: param = 0x7B; break;
            default: return { effTyp: 0x00, eff: 0 };
          }
          return { effTyp: 0x0E, eff: param };
        default:
          return { effTyp: 0x00, eff: 0 };
      }
      if (n) param = n | (param & 0x0F);
      return { effTyp: 0x0E, eff: param };
    }
    default:
      break;
  }

  const effTyp = cmd < IMF_EFFECTS.length ? IMF_EFFECTS[cmd] : 0;
  return { effTyp, eff: param };
}

// ── Parser ────────────────────────────────────────────────────────────────────

export function parseImagoOrpheusFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  try {
    return parseInternal(bytes, filename);
  } catch {
    return null;
  }
}

function parseInternal(bytes: Uint8Array, filename: string): TrackerSong | null {
  if (!isImagoOrpheusFormat(bytes)) return null;

  const ordNum = u16le(bytes, OFF_ORD_NUM);
  const patNum = u16le(bytes, OFF_PAT_NUM);
  const insNum = u16le(bytes, OFF_INS_NUM);
  const flags  = u16le(bytes, OFF_FLAGS);
  const tempo  = u8(bytes, OFF_TEMPO);  // initial speed (Axx)
  const bpm    = u8(bytes, OFF_BPM);    // initial BPM
  const title  = readString(bytes, OFF_TITLE, 32) || filename.replace(/\.[^/.]+$/, '');

  const linearSlides = !!(flags & FLAG_LINEAR_SLIDES);

  // Count used channels and build pan/mute info
  const numChannels = (() => {
    let n = 0;
    for (let chn = 0; chn < MAX_CHANNELS; chn++) {
      const base   = OFF_CHANNELS + chn * IMF_CHANNEL_SIZE;
      const status = u8(bytes, base + CHOFF_STATUS);
      if (status < 2) n = chn + 1;
    }
    return n;
  })();
  if (numChannels === 0) return null;

  const channelPan: number[]  = [];
  const channelMute: boolean[] = [];
  for (let chn = 0; chn < numChannels; chn++) {
    const base   = OFF_CHANNELS + chn * IMF_CHANNEL_SIZE;
    const pan    = u8(bytes, base + CHOFF_PAN);
    const status = u8(bytes, base + CHOFF_STATUS);
    // Remap IMF pan 0x00-0xFF → -128..+128 (XM/tracker convention)
    channelPan.push(Math.round((pan / 255) * 256) - 128);
    channelMute.push(status === 1 || status === 2);
  }

  // Read order list (256 bytes after the header)
  let cursor = IMF_HDR_SIZE;
  const orderList: number[] = [];
  for (let i = 0; i < 256; i++) {
    const ord = u8(bytes, cursor + i);
    if (ord === 0xFF) break;
    if (i < ordNum) orderList.push(ord);
  }
  if (orderList.length === 0) orderList.push(0);
  cursor += 256;

  // ── Patterns ──────────────────────────────────────────────────────────────

  const patterns: Pattern[] = [];

  for (let pat = 0; pat < patNum; pat++) {
    if (cursor + 4 > bytes.length) {
      patterns.push(makeEmptyPattern(pat, numChannels, channelPan, filename));
      continue;
    }

    const chunkLen = u16le(bytes, cursor);
    const numRows  = u16le(bytes, cursor + 2);
    cursor += 4;

    const dataEnd = cursor + chunkLen - 4; // chunkLen includes the 4-byte header

    // Build channel row arrays
    const channelRows: TrackerCell[][] = Array.from({ length: numChannels }, () =>
      Array.from({ length: numRows }, () => emptyCell())
    );

    let row = 0;
    let pos = cursor;

    while (row < numRows && pos < dataEnd) {
      const mask = u8(bytes, pos++);
      if (mask === 0) {
        row++;
        continue;
      }

      const channel = mask & 0x1F;
      const validCh = channel < numChannels;
      const cell    = validCh ? channelRows[channel][row] : emptyCell();

      if (mask & 0x20) {
        // note + instrument
        if (pos + 2 > dataEnd) break;
        const note  = u8(bytes, pos++);
        const instr = u8(bytes, pos++);

        if (note === 0xA0) {
          cell.note = NOTE_KEYOFF;
        } else if (note !== 0xFF) {
          const xmNote = ((note >> 4) * 12) + (note & 0x0F) + 12 + 1;
          cell.note = (xmNote >= 1 && xmNote <= 96) ? xmNote : 0;
        }
        cell.instrument = instr;
      }

      const effBits = mask & 0xC0;
      if (effBits === 0xC0) {
        // Two effects
        if (pos + 4 > dataEnd) break;
        const e1c = u8(bytes, pos++);
        const e1d = u8(bytes, pos++);
        const e2c = u8(bytes, pos++);
        const e2d = u8(bytes, pos++);
        const { effTyp: t1, eff: p1 } = translateIMFEffect(e1c, e1d);
        const { effTyp: t2, eff: p2 } = translateIMFEffect(e2c, e2d);
        // Store first non-zero effect in slot 1, second in slot 2
        if (t1 !== 0) {
          cell.effTyp  = t1;
          cell.eff     = p1;
          cell.effTyp2 = t2;
          cell.eff2    = p2;
        } else {
          cell.effTyp  = t2;
          cell.eff     = p2;
        }
      } else if (effBits) {
        // One effect
        if (pos + 2 > dataEnd) break;
        const e1c = u8(bytes, pos++);
        const e1d = u8(bytes, pos++);
        const { effTyp, eff } = translateIMFEffect(e1c, e1d);
        // Volume set (CMD_VOLUME = 0x0C) → volume column
        if (effTyp === 0x0C) {
          cell.volume = eff;
        } else {
          cell.effTyp = effTyp;
          cell.eff    = eff;
        }
      }
    }

    cursor = dataEnd;

    const channels: ChannelData[] = channelRows.map((rows, ch) => ({
      id:           `channel-${ch}`,
      name:         `Channel ${ch + 1}`,
      muted:        channelMute[ch] ?? false,
      solo:         false,
      collapsed:    false,
      volume:       100,
      pan:          channelPan[ch] ?? 0,
      instrumentId: null,
      color:        null,
      rows,
    }));

    patterns.push({
      id:      `pattern-${pat}`,
      name:    `Pattern ${pat}`,
      length:  numRows,
      channels,
      importMetadata: {
        sourceFormat:            'IMF',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    numChannels,
        originalPatternCount:    patNum,
        originalInstrumentCount: insNum,
      },
    });
  }

  // ── Instruments + Samples ─────────────────────────────────────────────────

  const instruments: InstrumentConfig[] = [];
  let firstSampleId = 1;

  for (let ins = 0; ins < insNum; ins++) {
    if (cursor + IMF_INSTRUMENT_SIZE > bytes.length) {
      instruments.push(silentInstrument(ins + 1, `Instrument ${ins + 1}`));
      continue;
    }

    // IMFInstrument layout (384 bytes):
    //   +0    name[32]
    //   +32   map[120]      — multisample note-to-sample map
    //   +152  unused[8]
    //   +160  nodes[3][16]  — envelope nodes: 3 types × 16 nodes × 4 bytes
    //   +352  env[3]        — 3 × IMFEnvelope (8 bytes each = 24 bytes)
    //   +376  fadeout (uint16LE)
    //   +378  smpNum (uint16LE)
    //   +380  ii10[4]
    const insBase  = cursor;
    const insName  = readString(bytes, insBase, 32) || `Instrument ${ins + 1}`;
    const smpNum   = u16le(bytes, insBase + 378);
    cursor += IMF_INSTRUMENT_SIZE;

    // Read this instrument's samples
    const sampleInstruments: InstrumentConfig[] = [];
    for (let smp = 0; smp < smpNum; smp++) {
      if (cursor + IMF_SAMPLE_SIZE > bytes.length) break;

      // IMFSample layout (64 bytes):
      //   +0   filename[13]
      //   +13  unused1[3]
      //   +16  length    (uint32LE)  — bytes
      //   +20  loopStart (uint32LE)
      //   +24  loopEnd   (uint32LE)
      //   +28  c5Speed   (uint32LE)
      //   +32  volume    (uint8, 0-64)
      //   +33  panning   (uint8, 0-255)
      //   +34  unused2[14]
      //   +48  flags     (uint8)
      //   +49  unused3[5]
      //   +54  ems       (uint16LE) — internal
      //   +56  dram      (uint32LE) — internal
      //   +60  is10[4]   — 'IS10' or 'IW10'
      const smpBase  = cursor;
      const smpName  = readString(bytes, smpBase, 13) || `${insName} ${smp + 1}`;
      let   length   = u32le(bytes, smpBase + 16);
      let   loopStart = u32le(bytes, smpBase + 20);
      let   loopEnd   = u32le(bytes, smpBase + 24);
      const c5Speed  = u32le(bytes, smpBase + 28);
      const volume   = u8(bytes, smpBase + 32);
      const smpFlags = u8(bytes, smpBase + 48);

      cursor += IMF_SAMPLE_SIZE;

      const hasLoop     = !!(smpFlags & 0x01);
      const pingPong    = !!(smpFlags & 0x02);
      const is16bit     = !!(smpFlags & 0x04);

      if (is16bit) {
        // Convert byte lengths to sample lengths
        length    = Math.floor(length / 2);
        loopStart = Math.floor(loopStart / 2);
        loopEnd   = Math.floor(loopEnd / 2);
      }

      const sampleRate = c5Speed > 0 ? c5Speed : 8363;
      const smpId = firstSampleId + smp;

      if (length === 0 || cursor + (is16bit ? length * 2 : length) > bytes.length) {
        // Skip past any data and push silent placeholder
        cursor += is16bit ? length * 2 : length;
        sampleInstruments.push(silentInstrument(smpId, smpName));
        continue;
      }

      // Read PCM data — convert to 8-bit unsigned for createSamplerInstrument
      const byteLen = is16bit ? length * 2 : length;
      const rawPcm  = bytes.subarray(cursor, cursor + byteLen);
      cursor += byteLen;

      // Convert signed PCM to unsigned 8-bit (createSamplerInstrument expects unsigned)
      let pcm8: Uint8Array;
      if (is16bit) {
        // Downsample 16-bit signed LE to 8-bit signed, then reinterpret as unsigned
        pcm8 = new Uint8Array(length);
        for (let i = 0; i < length; i++) {
          const lo = rawPcm[i * 2] ?? 0;
          const hi = rawPcm[i * 2 + 1] ?? 0;
          const s16 = (lo | (hi << 8)) << 16 >> 16; // sign-extend
          // Truncate to 8-bit signed range, then convert to unsigned
          const s8 = Math.max(-128, Math.min(127, s16 >> 8));
          pcm8[i] = (s8 + 256) & 0xFF;
        }
      } else {
        // 8-bit signed → unsigned: add 128 (IMF stores signed PCM)
        pcm8 = new Uint8Array(length);
        for (let i = 0; i < length; i++) {
          const s = rawPcm[i] ?? 0;
          pcm8[i] = ((s < 128 ? s : s - 256) + 128) & 0xFF;
        }
      }

      const loopS = hasLoop ? loopStart : 0;
      const loopE = hasLoop ? loopEnd   : 0;
      const inst  = createSamplerInstrument(smpId, smpName, pcm8, volume, sampleRate, loopS, loopE);
      if (pingPong && inst.sample) {
        inst.sample.loopType = 'pingpong';
      }
      sampleInstruments.push(inst);
    }

    // Use the first sample as the instrument representative (multi-sample mapping is complex;
    // for display purposes we expose the first sample under the instrument name).
    if (sampleInstruments.length > 0) {
      const primary = { ...sampleInstruments[0], id: ins + 1, name: insName };
      instruments.push(primary);
    } else {
      instruments.push(silentInstrument(ins + 1, insName));
    }

    firstSampleId += smpNum;
  }

  // ── Assemble TrackerSong ──────────────────────────────────────────────────

  return {
    name:            title,
    format:          'XM' as TrackerFormat,
    patterns,
    instruments,
    songPositions:   orderList,
    songLength:      orderList.length,
    restartPosition: 0,
    numChannels,
    initialSpeed:    tempo > 0 ? tempo : 6,
    initialBPM:      bpm >= 32 ? bpm : 125,
    linearPeriods:   linearSlides,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function makeEmptyPattern(idx: number, numChannels: number, channelPan: number[], filename: string): Pattern {
  const channels: ChannelData[] = Array.from({ length: numChannels }, (_, ch) => ({
    id:           `channel-${ch}`,
    name:         `Channel ${ch + 1}`,
    muted:        false,
    solo:         false,
    collapsed:    false,
    volume:       100,
    pan:          channelPan[ch] ?? 0,
    instrumentId: null,
    color:        null,
    rows:         Array.from({ length: 64 }, () => emptyCell()),
  }));
  return {
    id:       `pattern-${idx}`,
    name:     `Pattern ${idx}`,
    length:   64,
    channels,
    importMetadata: {
      sourceFormat:            'IMF',
      sourceFile:              filename,
      importedAt:              new Date().toISOString(),
      originalChannelCount:    numChannels,
      originalPatternCount:    0,
      originalInstrumentCount: 0,
    },
  };
}

function silentInstrument(id: number, name: string): InstrumentConfig {
  return {
    id,
    name,
    type:      'sample' as const,
    synthType: 'Sampler' as const,
    effects:   [],
    volume:    0,
    pan:       0,
  } as InstrumentConfig;
}
