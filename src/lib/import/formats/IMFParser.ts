/**
 * IMFParser.ts — Imago Orpheus (.imf) parser
 *
 * Imago Orpheus is a PC DOS tracker format from 1994. The file is little-endian
 * throughout. Layout:
 *
 *   Offset   Size  Description
 *   0        32    Song title (null-terminated)
 *   32       2     ordNum  — number of orders (uint16le)
 *   34       2     patNum  — number of patterns (uint16le)
 *   36       2     insNum  — number of instruments (uint16le)
 *   38       2     flags   — bit0 = linear slides
 *   40       8     unused1
 *   48       1     tempo   — default speed (1–255)
 *   49       1     bpm     — default BPM (32–255)
 *   50       1     master  — default master volume (0–64)
 *   51       1     amp     — amplification (4–127)
 *   52       8     unused2
 *   60       4     'IM10' or 'IM20' magic
 *   64       512   channel settings: 32 × IMFChannel (16 bytes each)
 *   576      256   order list (bytes, 0xFF = end)
 *   832      ...   patterns: each has (length:u16le, numRows:u16le, data[length-4])
 *   ...      ...   instruments: each is IMFInstrument (384 bytes) + samples
 *
 * Each instrument (384 bytes) is followed by smpNum × (IMFSample header 64 bytes
 * + raw sample data of `length` bytes).
 *
 * IMFSample.length is in bytes. If the 16-bit flag is set, length counts bytes
 * (halve to get frames). Loop points are also in bytes.
 *
 * The instrument map[] array maps note index (0..119) → sample-within-instrument
 * (0-based). In OpenMPT this drives keyboard splitting; here we take only
 * sample 0 per instrument for simplicity.
 *
 * FM instruments (smpNum == 0) get a silent placeholder InstrumentConfig.
 *
 * Reference: OpenMPT soundlib/Load_imf.cpp
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// ── Binary helpers ────────────────────────────────────────────────────────────

function u8(v: DataView, off: number): number    { return v.getUint8(off); }
function u16le(v: DataView, off: number): number { return v.getUint16(off, true); }
function u32le(v: DataView, off: number): number { return v.getUint32(off, true); }

function readNullStr(v: DataView, off: number, maxLen: number): string {
  let s = '';
  for (let i = 0; i < maxLen; i++) {
    const c = v.getUint8(off + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
}

function readMagic(v: DataView, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(v.getUint8(off + i));
  return s;
}

// ── IMFChannel layout (16 bytes each, 32 channels = 512 bytes total) ──────────
// +0  name[12] — ASCIIZ channel name (max 11 chars)
// +12 chorus   — default chorus
// +13 reverb   — default reverb
// +14 panning  — 0x00–0xFF
// +15 status   — 0=enabled, 1=mute, 2=disabled

const IMF_CHANNEL_SIZE = 16;

// ── IMFInstrument layout (384 bytes) ─────────────────────────────────────────
// +0   name[32]           ASCIIZ, max 31 chars
// +32  map[120]           note→sample index (0-based within instrument)
// +152 unused[8]
// +160 nodes[3][16]       3 envelopes × 16 nodes × 4 bytes (uint16le tick, uint16le value)
// +352 env[3]             3 × IMFEnvelope (8 bytes each) = 24 bytes
// +376 fadeout (uint16le)
// +378 smpNum  (uint16le)
// +380 ii10[4]            'II10'
// Total = 384 bytes

const IMF_INST_SIZE = 384;

// ── IMFSample layout (64 bytes) ───────────────────────────────────────────────
// +0   filename[13]       8.3 filename, ASCIIZ
// +13  unused1[3]
// +16  length  (uint32le) — byte count (for 16-bit: 2 bytes per frame)
// +20  loopStart (uint32le) — in bytes
// +24  loopEnd   (uint32le) — in bytes
// +28  c5Speed   (uint32le) — sample rate in Hz
// +32  volume    (uint8)   — 0..64
// +33  panning   (uint8)   — 0..255
// +34  unused2[14]
// +48  flags     (uint8)   — 0x01=loop, 0x02=pingpong, 0x04=16bit, 0x08=defaultpan
// +49  unused3[5]
// +54  ems       (uint16le) — reserved
// +56  dram      (uint32le) — reserved
// +60  is10[4]              — 'IS10' or 'IW10'
// Total = 64 bytes

const IMF_SAMPLE_SIZE = 64;

const IMF_SMP_LOOP     = 0x01;
const IMF_SMP_PINGPONG = 0x02;
const IMF_SMP_16BIT    = 0x04;
// const IMF_SMP_PANNING  = 0x08;  // not used in our output

interface IMFSampleHeader {
  filename:  string;
  length:    number;   // in bytes
  loopStart: number;   // in bytes
  loopEnd:   number;   // in bytes
  c5Speed:   number;
  volume:    number;   // 0..64
  panning:   number;   // 0..255
  flags:     number;
}

function readIMFSampleHeader(v: DataView, off: number): IMFSampleHeader {
  return {
    filename:  readNullStr(v, off,       13),
    length:    u32le(v, off + 16),
    loopStart: u32le(v, off + 20),
    loopEnd:   u32le(v, off + 24),
    c5Speed:   u32le(v, off + 28),
    volume:    u8(v,    off + 32),
    panning:   u8(v,    off + 33),
    flags:     u8(v,    off + 48),
  };
}

// ── Effect conversion ─────────────────────────────────────────────────────────
//
// imfEffects[] from Load_imf.cpp (0-indexed by raw IMF command byte):
// 0x00=none, 0x01=speed, 0x02=tempo, 0x03=tonePorta, 0x04=tonePortaVol,
// 0x05=vibrato, 0x06=vibratoVol, 0x07=fineVibrato, 0x08=tremolo,
// 0x09=arpeggio, 0x0A=panning, 0x0B=panSlide, 0x0C=setVol, 0x0D=volSlide,
// 0x0E=fineVolSlide, 0x0F=finetune, 0x10=noteSlideUp, 0x11=noteSlideDown,
// 0x12=portaUp, 0x13=portaDn, 0x14=finePortaUp, 0x15=finePortaDn,
// 0x16=midi(cutoff), 0x17=midi(filter+res), 0x18=offset, 0x19=none(fineSmpOffset),
// 0x1A=keyOff, 0x1B=retrig, 0x1C=tremor, 0x1D=posJump, 0x1E=patBreak,
// 0x1F=globalVol, 0x20=globalVolSlide, 0x21=S3MCmdEx, 0x22=none(chorus),
// 0x23=none(reverb)

// XM effTyp codes used:
// 0x0F=speed, 0x0F=tempo (disambiguate by param), 0x03=tonePorta,
// 0x05=tonePortaVol, 0x04=vibrato, 0x06=vibratoVol, 0x07=tremolo,
// 0x09=arpeggio, 0x08=panning, 0x0B=panSlide, 0x0C=setVol, 0x0A=volSlide,
// 0x01=portaUp, 0x02=portaDn, 0x09=offset, 0x14=keyOff, 0x1B=retrig,
// 0x1D=tremor, 0x0B=posJump, 0x0D=patBreak, 0x10=globalVol, 0x11=globalVolSlide,
// 0x13=S3MCmdEx (IT extended)

// We use XM effTyp numbering.
const XM_SPEED        = 0x0F; // Fxx with param<32 = speed
const XM_TEMPO        = 0x0F; // Fxx with param>=32 = BPM (same slot, disambiguated by replayer)
const XM_TONEPORTA    = 0x03;
const XM_TONEPORTAVOL = 0x05;
const XM_VIBRATO      = 0x04;
const XM_VIBRATOVOL   = 0x06;
const XM_FINEVIBRATO  = 0x04; // We map fine vibrato to regular vibrato (no direct XM fine vibrato)
const XM_TREMOLO      = 0x07;
const XM_ARPEGGIO     = 0x00;
const XM_PANNING8     = 0x08;
const XM_PANSLIDE     = 0x19;
const XM_SETVOLUME    = 0x0C;
const XM_VOLSLIDE     = 0x0A;
const XM_PORTAUP      = 0x01;
const XM_PORTADN      = 0x02;
const XM_OFFSET       = 0x09;
const XM_KEYOFF       = 0x14;
const XM_RETRIG       = 0x1B;
const XM_TREMOR       = 0x1C;
const XM_POSJUMP      = 0x0B;
const XM_PATBREAK     = 0x0D;
const XM_GLOBALVOL    = 0x10;
const XM_GLOBALVOLSL  = 0x11;
const XM_S3MCMDEX     = 0x13;
const XM_NONE         = 0xFF; // sentinel

// Map from IMF command index to XM effTyp (CMD_NONE = 0xFF means skip)
const IMF_EFFECT_MAP: number[] = [
  XM_NONE,        // 0x00 none
  XM_SPEED,       // 0x01 set tempo (speed in XM nomenclature — param is SPD)
  XM_TEMPO,       // 0x02 set BPM   (same XM slot, replayer picks by param value)
  XM_TONEPORTA,   // 0x03
  XM_TONEPORTAVOL,// 0x04
  XM_VIBRATO,     // 0x05
  XM_VIBRATOVOL,  // 0x06
  XM_FINEVIBRATO, // 0x07
  XM_TREMOLO,     // 0x08
  XM_ARPEGGIO,    // 0x09
  XM_PANNING8,    // 0x0A
  XM_PANSLIDE,    // 0x0B
  XM_SETVOLUME,   // 0x0C
  XM_VOLSLIDE,    // 0x0D
  XM_VOLSLIDE,    // 0x0E fine vol slide (special param handling)
  XM_NONE,        // 0x0F set finetune (CMD_FINETUNE — no direct XM equiv; skip)
  XM_NONE,        // 0x10 note slide up (CMD_NOTESLIDEUP — skip)
  XM_NONE,        // 0x11 note slide down (CMD_NOTESLIDEDOWN — skip)
  XM_PORTAUP,     // 0x12
  XM_PORTADN,     // 0x13
  XM_PORTAUP,     // 0x14 fine slide up (mapped to portaUp with E-param)
  XM_PORTADN,     // 0x15 fine slide down (mapped to portaDn with F-param)
  XM_NONE,        // 0x16 set filter cutoff — skip (MIDI macro would be needed)
  XM_NONE,        // 0x17 filter slide + resonance — skip
  XM_OFFSET,      // 0x18
  XM_NONE,        // 0x19 fine sample offset — skip
  XM_KEYOFF,      // 0x1A
  XM_RETRIG,      // 0x1B
  XM_TREMOR,      // 0x1C
  XM_POSJUMP,     // 0x1D
  XM_PATBREAK,    // 0x1E
  XM_GLOBALVOL,   // 0x1F
  XM_GLOBALVOLSL, // 0x20
  XM_S3MCMDEX,    // 0x21 extended (Xxx)
  XM_NONE,        // 0x22 chorus — skip
  XM_NONE,        // 0x23 reverb — skip
];

// XM note-off value
const XM_NOTE_OFF = 97;

/**
 * Convert an IMF effect command + param to an XM effTyp + eff pair.
 *
 * Follows TranslateIMFEffect() from Load_imf.cpp.
 */
function translateIMFEffect(cmd: number, param: number): { effTyp: number; eff: number } {
  if (cmd === 0) return { effTyp: 0, eff: 0 };

  const rawTyp = (cmd < IMF_EFFECT_MAP.length) ? IMF_EFFECT_MAP[cmd] : XM_NONE;
  if (rawTyp === XM_NONE || rawTyp === undefined) return { effTyp: 0, eff: 0 };

  let effTyp = rawTyp;
  let eff    = param;

  switch (cmd) {
    case 0x0E: // fine volume slide
      // Hackaround from Load_imf.cpp TranslateIMFEffect:
      // "hackaround to get almost-right behavior for fine slides"
      if (eff === 0) {
        /* nothing */
      } else if (eff === 0xF0) {
        eff = 0xEF;
      } else if (eff === 0x0F) {
        eff = 0xFE;
      } else if (eff & 0xF0) {
        eff |= 0x0F;
      } else {
        eff |= 0xF0;
      }
      break;

    case 0x14: // fine slide up → portaUp with 0xEx param
    case 0x15: // fine slide down → portaDn with 0xEx / 0xFx param
      // Load_imf.cpp: "this is about as close as we can do..."
      if (param >> 4) {
        eff = 0xF0 | (param >> 4);
      } else {
        eff = param | 0xE0;
      }
      break;

    case 0x1F: // set global volume
      // Load_imf.cpp: param * 2
      eff = Math.min(255, param * 2);
      break;

    case 0x21: // extended effect (Xxx)
      // Translate sub-commands (from Load_imf.cpp)
      switch (param >> 4) {
        case 0x0: // undefined — allow S00 pick-up
          break;
        case 0x3: // glissando
          eff = 0x20 | (param & 0x0F);
          break;
        case 0x5: // vibrato waveform
          eff = 0x30 | (param & 0x0F);
          break;
        case 0x8: // tremolo waveform
          eff = 0x40 | (param & 0x0F);
          break;
        case 0xA: // pattern loop
          eff = 0xB0 | (param & 0x0F);
          break;
        case 0xB: // pattern delay
          eff = 0xE0 | (param & 0x0F);
          break;
        case 0xC: // note cut
        case 0xD: // note delay
          // Orpheus doesn't cut on tick 0
          if (!param) return { effTyp: 0, eff: 0 };
          eff = ((param >> 4) << 4) | (param & 0x0F);
          break;
        case 0xE: // ignore envelope
          switch (param & 0x0F) {
            case 0: case 1: eff = 0x77; break;  // all/volume
            case 2:         eff = 0x79; break;  // panning
            case 3:         eff = 0x7B; break;  // filter
            default:        return { effTyp: 0, eff: 0 };
          }
          break;
        case 0x1: // set filter
        case 0xF: // invert loop
        default:
          return { effTyp: 0, eff: 0 };
      }
      break;

    default:
      break;
  }

  return { effTyp, eff };
}

// ── Empty instrument placeholder ─────────────────────────────────────────────

function buildEmptyInstrument(id: number, name: string): InstrumentConfig {
  return {
    id,
    name: name || `Instrument ${id}`,
    type:      'sample'  as const,
    synthType: 'Sampler' as const,
    effects:   [],
    volume:    -60,
    pan:       0,
  } as unknown as InstrumentConfig;
}

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Returns true if the buffer contains a valid Imago Orpheus file.
 *
 * Detection: "IM10" or "IM20" at offset 60.
 * Additional validation: ordNum <= 256, insNum < 256, bpm >= 32, master <= 64,
 * amp in [4..127], at least one non-disabled channel.
 */
export function isIMFFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 576) return false;
  const v = new DataView(buffer);

  const magic = readMagic(v, 60, 4);
  if (magic !== 'IM10' && magic !== 'IM20') return false;

  const ordNum  = u16le(v, 32);
  const insNum  = u16le(v, 36);
  const bpm     = u8(v, 49);
  const master  = u8(v, 50);
  const amp     = u8(v, 51);

  if (ordNum > 256) return false;
  if (insNum >= 256) return false;
  if (bpm < 32) return false;
  if (master > 64) return false;
  if (amp < 4 || amp > 127) return false;

  // Check that at least one channel is enabled or muted (not all disabled)
  let found = false;
  for (let chn = 0; chn < 32; chn++) {
    const status = u8(v, 64 + chn * IMF_CHANNEL_SIZE + 15);
    if (status < 2) {
      found = true;
      break;
    } else if (status > 2) {
      return false; // invalid status value
    }
  }
  if (!found) return false;

  return true;
}

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Parse an Imago Orpheus (.imf) file into a TrackerSong.
 *
 * Follows ReadIMF() from OpenMPT Load_imf.cpp.
 *
 * @throws If the file fails format detection or the buffer is too small.
 */
export async function parseIMFFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  if (!isIMFFormat(buffer)) {
    throw new Error('IMFParser: not an Imago Orpheus file');
  }

  const v   = new DataView(buffer);
  const raw = new Uint8Array(buffer);

  // ── File header (576 bytes = 64-byte fixed + 512-byte channel table) ────────

  const songTitle = readNullStr(v, 0, 32);
  const ordNum    = u16le(v, 32);
  const patNum    = u16le(v, 34);
  const insNum    = u16le(v, 36);
  const flags     = u16le(v, 38);
  const tempo     = u8(v, 48);   // speed (Axx)
  const bpm       = u8(v, 49);   // BPM (Txx)
  // const master = u8(v, 50);   // master volume (unused in output)
  // const amp    = u8(v, 51);   // amp (unused in output)

  const linearSlides = (flags & 0x01) !== 0;

  // Determine active channel count (from GetNumChannels logic in Load_imf.cpp)
  let numChannels = 0;
  for (let chn = 0; chn < 32; chn++) {
    const status = u8(v, 64 + chn * IMF_CHANNEL_SIZE + 15);
    if (status < 2) numChannels = chn + 1;
  }
  numChannels = Math.max(1, numChannels);

  // Channel panning: 0x00–0xFF raw → 0x00–0xFF (pass through)
  const channelPan: number[] = [];
  for (let chn = 0; chn < numChannels; chn++) {
    channelPan.push(u8(v, 64 + chn * IMF_CHANNEL_SIZE + 14));
  }

  // ── Order list: 256 bytes at offset 576 ───────────────────────────────────
  // Entries 0xFF = end-of-song marker (skip past ordNum)
  const songPositions: number[] = [];
  {
    const orderOff = 576;
    const count    = Math.min(ordNum, 256);
    for (let i = 0; i < count; i++) {
      const ord = u8(v, orderOff + i);
      if (ord === 0xFF) break;
      songPositions.push(ord);
    }
  }

  // ── Patterns: starting at offset 832 ─────────────────────────────────────
  // Each pattern:
  //   length  (uint16le) — total byte count INCLUDING this 4-byte header
  //   numRows (uint16le)
  //   data    (length - 4 bytes)
  //
  // Pattern cell encoding (mask byte):
  //   0x00 → end of row (advance to next row)
  //   bits 0x1F = channel index (0-based)
  //   bit  0x20 → note byte + instrument byte follow
  //   bit  0x40 → single effect: command byte + data byte follow
  //   bits 0xC0 = 0xC0 → two effects: c1 d1 c2 d2 follow

  const patterns: Pattern[] = [];
  let cursor = 832;

  for (let pat = 0; pat < patNum; pat++) {
    if (cursor + 4 > buffer.byteLength) break;

    const patLength = u16le(v, cursor);     // total bytes including 4-byte header
    const numRows   = u16le(v, cursor + 2);
    const dataStart = cursor + 4;
    const dataEnd   = cursor + patLength;   // = dataStart + (patLength - 4)
    cursor = cursor + patLength;

    if (dataEnd > buffer.byteLength) break;

    // Allocate grid: grid[row][channel]
    const grid: TrackerCell[][] = Array.from({ length: numRows }, () =>
      Array.from({ length: numChannels }, (): TrackerCell => ({
        note: 0, instrument: 0, volume: 0,
        effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      })),
    );

    let p   = dataStart;
    let row = 0;

    while (row < numRows && p < dataEnd) {
      const mask = u8(v, p++);

      if (mask === 0) {
        // End of row
        row++;
        continue;
      }

      const channel = mask & 0x1F;
      const cell: TrackerCell = (channel < numChannels && row < numRows)
        ? grid[row][channel]!
        : { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };

      // bit 0x20: note + instrument
      if (mask & 0x20) {
        if (p + 2 > dataEnd) break;
        const noteRaw = u8(v, p++);
        const instrRaw = u8(v, p++);
        cell.instrument = instrRaw;

        if (noteRaw === 160) {
          // Key-off
          cell.note = XM_NOTE_OFF;
        } else if (noteRaw === 255) {
          // No note
          cell.note = 0;
        } else {
          // OpenMPT: note = (noteRaw>>4)*12 + (noteRaw&0x0F) + 12 + 1
          // where the outer +12+1 = +13 maps to XM 1-based (C-0 = 1)
          // IMF note format: upper nibble = octave (0-based), lower nibble = semitone (0-based)
          const oct = (noteRaw >> 4) & 0x0F;
          const sem = noteRaw & 0x0F;
          const xmNote = oct * 12 + sem + 13;
          // Validate: XM notes 1-96 are valid
          if (xmNote >= 1 && xmNote <= 96) {
            cell.note = xmNote;
          } else {
            cell.note = 0;
          }
        }
      }

      // bits 0xC0: effect(s)
      const effectBits = mask & 0xC0;
      if (effectBits === 0xC0) {
        // Two effects
        if (p + 4 > dataEnd) break;
        const e1c = u8(v, p++);
        const e1d = u8(v, p++);
        const e2c = u8(v, p++);
        const e2d = u8(v, p++);

        const fx1 = translateIMFEffect(e1c, e1d);
        const fx2 = translateIMFEffect(e2c, e2d);

        // If fx1 is a volume command, route to volume column
        if (fx1.effTyp === XM_SETVOLUME) {
          cell.volume  = Math.min(64, fx1.eff);
          cell.effTyp  = fx2.effTyp !== 0 ? fx2.effTyp : 0;
          cell.eff     = fx2.effTyp !== 0 ? fx2.eff    : 0;
        } else if (fx2.effTyp === XM_SETVOLUME) {
          cell.volume  = Math.min(64, fx2.eff);
          cell.effTyp  = fx1.effTyp;
          cell.eff     = fx1.eff;
        } else {
          cell.effTyp  = fx1.effTyp;
          cell.eff     = fx1.eff;
          cell.effTyp2 = fx2.effTyp;
          cell.eff2    = fx2.eff;
        }
      } else if (effectBits !== 0) {
        // Single effect
        if (p + 2 > dataEnd) break;
        const e1c = u8(v, p++);
        const e1d = u8(v, p++);

        const fx = translateIMFEffect(e1c, e1d);
        if (fx.effTyp === XM_SETVOLUME) {
          cell.volume = Math.min(64, fx.eff);
        } else {
          cell.effTyp = fx.effTyp;
          cell.eff    = fx.eff;
        }
      }
    }

    // Build ChannelData
    const channels: ChannelData[] = Array.from({ length: numChannels }, (_, ch): ChannelData => ({
      id:           `channel-${ch}`,
      name:         readNullStr(v, 64 + ch * IMF_CHANNEL_SIZE, 12) || `Channel ${ch + 1}`,
      muted:        u8(v, 64 + ch * IMF_CHANNEL_SIZE + 15) === 1,
      solo:         false,
      collapsed:    false,
      volume:       100,
      // panning: 0..255 → -128..127 (centre = 128)
      pan:          Math.round(((channelPan[ch] ?? 128) / 128 - 1) * 128),
      instrumentId: null,
      color:        null,
      rows:         grid.map(r => r[ch]!),
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
  // After all patterns, sequential IMFInstrument blocks (384 bytes each),
  // each followed by smpNum × (IMFSample header 64 bytes + raw PCM).
  //
  // We create one InstrumentConfig per instrument. If the instrument has
  // samples, we use sample 0 (per the note map, sample[0] is the default).
  // FM instruments (smpNum == 0) get a silent placeholder.

  const instruments: InstrumentConfig[] = [];

  for (let ins = 0; ins < insNum; ins++) {
    const insId = ins + 1; // 1-based

    if (cursor + IMF_INST_SIZE > buffer.byteLength) {
      instruments.push(buildEmptyInstrument(insId, `Instrument ${insId}`));
      continue;
    }

    // Read instrument header
    const insOff  = cursor;
    const insName = readNullStr(v, insOff, 32);
    // map[120] at +32 — note→sample mapping (not used directly here)
    // env nodes at +160, env headers at +352
    const fadeout = u16le(v, insOff + 376);
    const smpNum  = u16le(v, insOff + 378);
    // const ii10 = readMagic(v, insOff + 380, 4); // 'II10' (not validated)

    void fadeout; // used for instrument envelope (not modelled here)

    cursor += IMF_INST_SIZE;

    if (smpNum === 0) {
      // FM instrument — create silent placeholder
      instruments.push(buildEmptyInstrument(insId, insName || `Instrument ${insId}`));
      continue;
    }

    // Read all sample headers + PCM, keep the first one for our InstrumentConfig
    let firstInst: InstrumentConfig | null = null;

    for (let smp = 0; smp < smpNum; smp++) {
      if (cursor + IMF_SAMPLE_SIZE > buffer.byteLength) {
        cursor += Math.max(0, buffer.byteLength - cursor);
        break;
      }

      const sh = readIMFSampleHeader(v, cursor);
      cursor += IMF_SAMPLE_SIZE;

      // Advance past sample data regardless
      const smpDataStart = cursor;
      const smpDataLen   = sh.length;
      cursor += smpDataLen;

      if (firstInst !== null) {
        // Skip subsequent samples (only use sample 0 per instrument)
        continue;
      }

      if (smpDataLen === 0 || smpDataStart + smpDataLen > buffer.byteLength) {
        firstInst = buildEmptyInstrument(insId, insName || sh.filename || `Instrument ${insId}`);
        continue;
      }

      const is16Bit    = (sh.flags & IMF_SMP_16BIT) !== 0;
      const hasLoopFwd = (sh.flags & IMF_SMP_LOOP)     !== 0;
      const hasLoopPP  = (sh.flags & IMF_SMP_PINGPONG) !== 0;
      const hasLoop    = hasLoopFwd || hasLoopPP;

      const sampleRate = sh.c5Speed || 8363;
      const volume     = Math.min(sh.volume, 64);

      let loopStart = 0;
      let loopEnd   = 0;

      if (is16Bit) {
        // Length and loop points are in bytes; frames = bytes / 2
        const numFrames = Math.floor(smpDataLen / 2);
        loopStart = hasLoop ? Math.floor(sh.loopStart / 2) : 0;
        loopEnd   = hasLoop ? Math.floor(sh.loopEnd   / 2) : 0;

        // Read as little-endian signed 16-bit, convert to 8-bit signed
        const pcm8 = new Uint8Array(numFrames);
        for (let f = 0; f < numFrames; f++) {
          const s16 = v.getInt16(smpDataStart + f * 2, true); // LE
          const s8  = Math.max(-128, Math.min(127, Math.round(s16 / 256)));
          pcm8[f] = s8 < 0 ? s8 + 256 : s8;
        }

        firstInst = createSamplerInstrument(
          insId,
          insName || sh.filename || `Instrument ${insId}`,
          pcm8,
          volume,
          sampleRate,
          loopStart,
          loopEnd,
        );
      } else {
        // 8-bit signed LE PCM (length = frames)
        loopStart = hasLoop ? sh.loopStart : 0;
        loopEnd   = hasLoop ? sh.loopEnd   : 0;

        const pcm8 = raw.subarray(smpDataStart, smpDataStart + smpDataLen);

        firstInst = createSamplerInstrument(
          insId,
          insName || sh.filename || `Instrument ${insId}`,
          pcm8,
          volume,
          sampleRate,
          loopStart,
          loopEnd,
        );
      }
    }

    instruments.push(firstInst ?? buildEmptyInstrument(insId, insName || `Instrument ${insId}`));
  }

  // ── Assemble TrackerSong ───────────────────────────────────────────────────

  return {
    name:            songTitle || filename.replace(/\.[^/.]+$/, ''),
    format:          'XM' as TrackerFormat,  // IMF uses XM-style linear periods / effects
    patterns,
    instruments,
    songPositions,
    songLength:      songPositions.length,
    restartPosition: 0,
    numChannels,
    initialSpeed:    tempo || 6,
    initialBPM:      bpm   || 125,
    linearPeriods:   linearSlides,
  };
}
