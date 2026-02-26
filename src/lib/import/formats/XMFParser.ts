/**
 * XMFParser.ts — Astroidea XMF / Imperium Galactica module format (.xmf)
 *
 * XMF is a DOS tracker format used in "Imperium Galactica" and various
 * Astroidea demos. NOTE: This has NOTHING to do with the MIDI XMF format.
 *
 * Binary layout:
 *   +0    type (uint8)          — file type: 2, 3, or 4
 *     Type 2: Old UltraTracker finetune, automatic tone portamento
 *     Type 3: Normal finetune, automatic tone portamento (Imperium Galactica files)
 *     Type 4: Normal finetune, manual tone portamento (MOD-like)
 *   +1    sampleHeaders[256]    — 256 × XMFSampleHeader (16 bytes each = 4096 bytes)
 *   +4097 orders[256]           — uint8 order list (0xFF = end-of-list terminator)
 *   +4353 lastChannel (uint8)   — 0-based index of last active channel (max 31)
 *   +4354 lastPattern (uint8)   — 0-based last pattern index (numPatterns = lastPattern+1)
 *   +4355 channelPans[channels] — uint8 pan per channel (0-255, × 0x11 = 0-255)
 *   +4355+channels  pattern data — numPatterns × channels × 64 rows × 6 bytes
 *   after patterns  sample data  — raw signed PCM (8-bit or 16-bit LE per flags)
 *
 * XMFSampleHeader (16 bytes, little-endian, uint24 values):
 *   loopStart[3], loopEnd[3], dataStart[3], dataEnd[3]
 *   defaultVolume(uint8), flags(uint8), sampleRate(uint16le)
 *   flags: 0x04=16bit, 0x08=loop, 0x10=bidi-loop
 *
 * Pattern cell (6 bytes per cell, iterates channels then rows):
 *   [0] note    — 0=empty, 1-77 → NOTE_MIN+35+note
 *   [1] instr   — sample number (1-based)
 *   [2] eff1    — effect command 1
 *   [3] eff2    — effect command 2
 *   [4] param2  — param for eff2
 *   [5] param1  — param for eff1
 *
 * Effect translation:
 *   0x0B param<0xFF → param+1 (position jump, 1-based)
 *   0x10 → Exx (0x80 | (0x10<<4) | (param&0x0F)) = 0x8x
 *   0x11 → Exx (0x80 | (0x11<<4) | (param&0x0F)) = 0x9x (but 0x91+ only low nibble)
 *   0x12 → ignored (ULT cmd5 translator artifact)
 *   >0x12 → invalid (abort)
 *   type=4, CMD_VOLUME: param = (param+3)/4 if !(param&3) || param==0xFF
 *   else CMD_VOLUME8
 *   type!=4, CMD_TEMPO with param=0x20 → CMD_SPEED
 *
 * Note: sample data is laid out sequentially after patterns in sample-index order,
 * using absolute offsets from dataStart/dataEnd in the sample headers.
 * The OpenMPT loader reads sample data after patterns using SampleIO.
 *
 * Reference: OpenMPT soundlib/Load_xmf.cpp
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// ── Binary helpers ─────────────────────────────────────────────────────────

function u8(v: DataView, off: number): number    { return v.getUint8(off); }
function u16le(v: DataView, off: number): number { return v.getUint16(off, true); }

/** Read a 24-bit little-endian unsigned integer */
function u24le(v: DataView, off: number): number {
  return v.getUint8(off) | (v.getUint8(off + 1) << 8) | (v.getUint8(off + 2) << 16);
}

// ── Constants ──────────────────────────────────────────────────────────────

const SAMPLE_HDR_SIZE  = 16;
const NUM_SAMPLE_SLOTS = 256;
const ROWS_PER_PATTERN = 64;
const CELL_SIZE        = 6;

// Sample flag bits
const SMP_16BIT       = 0x04;
const SMP_LOOP        = 0x08;
const SMP_BIDI_LOOP   = 0x10;

// Offset to the start of sample header array (byte 1, after the type byte)
const SAMPLES_OFFSET   = 1;
// Order list starts at byte 1 + 256*16 = 4097
const ORDERS_OFFSET    = 1 + NUM_SAMPLE_SLOTS * SAMPLE_HDR_SIZE;
// After order list (256 bytes): last channel byte, last pattern byte, pan bytes
const CHANNEL_OFFSET   = ORDERS_OFFSET + NUM_SAMPLE_SLOTS;

// Effect commands (used in cell translation — XM/MOD style numbers)
const CMD_NONE         = 0;
const CMD_PORTA_UP     = 0x01;
const CMD_PORTA_DOWN   = 0x02;
const CMD_TONE_PORTA   = 0x03;
const CMD_VIBRATO      = 0x04;
const CMD_TREMOLO      = 0x07;
const CMD_PAN          = 0x08;
const CMD_OFFSET       = 0x09;
const CMD_VOLSLIDE     = 0x0A;
const CMD_POSIJMP      = 0x0B;
const CMD_VOLUME       = 0x0C;
const CMD_PATBRK       = 0x0D;
const CMD_EXTFX        = 0x0E;
const CMD_SPEED        = 0x0F;
const CMD_VOLUME8      = 0x10;  // DEViLBOX internal: volume 0-255

// ── XMF effect command translator ─────────────────────────────────────────

interface EffectResult {
  command: number;
  param:   number;
}

/**
 * Translate an XMF raw effect command+param into a DEViLBOX TrackerCell effect.
 * Returns {command:0, param:0} for no-effect or ignored effects.
 * Returns null if the command is invalid (>0x12), which aborts the pattern.
 */
function translateXMFEffect(rawCmd: number, rawParam: number, type: number): EffectResult | null {
  if (rawCmd === 0 && rawParam === 0) {
    return { command: CMD_NONE, param: 0 };
  }

  let cmd   = rawCmd;
  let param = rawParam;

  if (cmd === 0x0B && param < 0xFF) {
    param++;
  } else if (cmd === 0x10 || cmd === 0x11) {
    // Extended effects: encode as 0xExy where x = cmd high nibble, y = low nibble of param
    param = 0x80 | ((cmd & 0x0F) << 4) | (param & 0x0F);
    cmd   = 0x0E;
  } else if (cmd === 0x12) {
    // Ignored (ULT command 5 translator artifact)
    return { command: CMD_NONE, param: 0 };
  } else if (cmd > 0x12) {
    return null;  // Invalid — abort
  }

  // Map raw XMF command numbers to DEViLBOX effect codes
  // XMF uses the same effect numbers as MOD/XM (Protracker-style)
  let outCmd: number;
  switch (cmd) {
    case 0x00: outCmd = 0;              break;  // Arpeggio
    case 0x01: outCmd = CMD_PORTA_UP;   break;
    case 0x02: outCmd = CMD_PORTA_DOWN; break;
    case 0x03: outCmd = CMD_TONE_PORTA; break;
    case 0x04: outCmd = CMD_VIBRATO;    break;
    case 0x05: outCmd = CMD_TONE_PORTA; break;  // Tone porta + vol slide
    case 0x06: outCmd = CMD_VIBRATO;    break;  // Vibrato + vol slide
    case 0x07: outCmd = CMD_TREMOLO;    break;
    case 0x08: outCmd = CMD_PAN;        break;
    case 0x09: outCmd = CMD_OFFSET;     break;
    case 0x0A: outCmd = CMD_VOLSLIDE;   break;
    case 0x0B: outCmd = CMD_POSIJMP;    break;
    case 0x0C: outCmd = CMD_VOLUME;     break;
    case 0x0D: outCmd = CMD_PATBRK;     break;
    case 0x0E: outCmd = CMD_EXTFX;      break;
    case 0x0F: outCmd = CMD_SPEED;      break;
    default:   outCmd = CMD_NONE; param = 0;
  }

  // Type-specific volume adjustment (OpenMPT: TranslateXMFEffect)
  if (type === 4 && outCmd === CMD_VOLUME) {
    if (!(param & 0x03) || param === 0xFF) {
      param = Math.floor((param + 3) / 4);
    } else {
      outCmd = CMD_VOLUME8;
    }
  } else if (outCmd === CMD_VOLUME) {
    outCmd = CMD_VOLUME8;
  }

  // Type!=4: CMD_SPEED (0x0F) with param=0x20 → use as speed not tempo
  if (type !== 4 && outCmd === CMD_SPEED && param === 0x20) {
    // Keep as speed (already CMD_SPEED)
  }

  return { command: outCmd, param };
}

// ── Sample header validation ───────────────────────────────────────────────

interface XMFSampleInfo {
  loopStart:     number;
  loopEnd:       number;
  dataStart:     number;
  dataEnd:       number;
  defaultVolume: number;
  flags:         number;
  sampleRate:    number;
  is16Bit:       boolean;
  hasLoop:       boolean;
  hasBidiLoop:   boolean;
  length:        number;  // in sample frames
  lengthBytes:   number;  // in bytes
  hasSampleData: boolean;
}

function readSampleHeader(v: DataView, off: number, type: number): XMFSampleInfo | null {
  const loopStart  = u24le(v, off + 0);
  const loopEnd    = u24le(v, off + 3);
  const dataStart  = u24le(v, off + 6);
  const dataEnd    = u24le(v, off + 9);
  const defVol     = u8(v, off + 12);
  const flags      = u8(v, off + 13);
  const sampleRate = u16le(v, off + 14);

  // Validate flags: no unknown bits
  if (flags & ~(SMP_16BIT | SMP_LOOP | SMP_BIDI_LOOP)) return null;
  // bidi-loop without loop-enable is invalid
  if ((flags & (SMP_LOOP | SMP_BIDI_LOOP)) === SMP_BIDI_LOOP) return null;
  // dataStart must be <= dataEnd
  if (dataStart > dataEnd) return null;

  const lengthBytes = dataEnd - dataStart;

  // Sample rate validation
  if (type !== 2 && lengthBytes > 0 && sampleRate < 100) return null;
  if (type === 2 && lengthBytes > 0 && sampleRate >= 0x8000) return null;

  // 16-bit: byte length must be even
  if ((flags & SMP_16BIT) && (lengthBytes % 2 !== 0)) return null;

  // Loop validation
  if ((flags & SMP_LOOP) && !loopEnd) return null;
  if (loopStart > loopEnd || loopStart > lengthBytes) return null;
  if (loopEnd !== 0 && (loopEnd >= lengthBytes || loopStart >= loopEnd)) return null;

  const is16Bit = (flags & SMP_16BIT) !== 0;
  const length  = is16Bit ? lengthBytes / 2 : lengthBytes;

  return {
    loopStart, loopEnd, dataStart, dataEnd,
    defaultVolume: defVol,
    flags, sampleRate,
    is16Bit,
    hasLoop:     (flags & SMP_LOOP) !== 0,
    hasBidiLoop: (flags & SMP_BIDI_LOOP) !== 0,
    length,
    lengthBytes,
    hasSampleData: dataEnd > dataStart,
  };
}

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Returns true if the buffer looks like an XMF (Astroidea/Imperium Galactica) file.
 * Mirrors ProbeFileHeaderXMF from OpenMPT Load_xmf.cpp.
 */
export function isXMFFormat(bytes: Uint8Array): boolean {
  // Minimum: 1 (type) + enough for at least some sample headers
  if (bytes.length < 1 + SAMPLE_HDR_SIZE) return false;

  const v    = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const type = u8(v, 0);

  if (type < 2 || type > 4) return false;

  // Check that we have the full header: type(1) + 256 headers + 256 orders + 3 bytes
  const minSize = 1 + NUM_SAMPLE_SLOTS * SAMPLE_HDR_SIZE + NUM_SAMPLE_SLOTS + 3;
  if (bytes.length < minSize) return false;

  // Validate the first sample headers (up to 256)
  const toCheck = Math.min(NUM_SAMPLE_SLOTS, Math.floor((bytes.length - 1) / SAMPLE_HDR_SIZE));
  for (let i = 0; i < toCheck; i++) {
    const off = SAMPLES_OFFSET + i * SAMPLE_HDR_SIZE;
    if (off + SAMPLE_HDR_SIZE > bytes.length) break;
    if (readSampleHeader(v, off, type) === null) return false;
  }

  return true;
}

// ── Parser ─────────────────────────────────────────────────────────────────

/**
 * Parse an XMF (Astroidea/Imperium Galactica) file into a TrackerSong.
 * Returns null on any parse failure (never throws).
 */
export function parseXMFFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  try {
    return _parse(bytes, filename);
  } catch {
    return null;
  }
}

function _parse(bytes: Uint8Array, filename: string): TrackerSong | null {
  if (!isXMFFormat(bytes)) return null;

  const v    = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const type = u8(v, 0);

  // Read all 256 sample headers, find highest-indexed sample with data
  const sampleInfos: (XMFSampleInfo | null)[] = [];
  let numSamples = 0;
  for (let i = 0; i < NUM_SAMPLE_SLOTS; i++) {
    const off  = SAMPLES_OFFSET + i * SAMPLE_HDR_SIZE;
    const info = readSampleHeader(v, off, type);
    if (info === null) return null;  // Invalid header
    sampleInfos.push(info);
    if (info.hasSampleData) numSamples = i + 1;
  }

  if (numSamples === 0) return null;

  // Read order list: 256 bytes at ORDERS_OFFSET, terminated by 0xFF
  const orders: number[] = [];
  for (let i = 0; i < NUM_SAMPLE_SLOTS; i++) {
    const ord = u8(v, ORDERS_OFFSET + i);
    if (ord === 0xFF) break;
    orders.push(ord);
  }
  if (orders.length === 0) orders.push(0);

  // Read channel count and pattern count
  const lastChannel  = u8(v, CHANNEL_OFFSET);
  if (lastChannel > 31) return null;
  const numChannels  = lastChannel + 1;

  const numPatterns  = u8(v, CHANNEL_OFFSET + 1) + 1;

  // Minimum data check for patterns
  const patternDataSize = numPatterns * numChannels * ROWS_PER_PATTERN * CELL_SIZE;
  const pansOffset      = CHANNEL_OFFSET + 2;
  const patternStart    = pansOffset + numChannels;
  if (patternStart + patternDataSize > bytes.length) return null;

  // Read channel panning
  const channelPans: number[] = [];
  for (let chn = 0; chn < numChannels; chn++) {
    // OpenMPT: pan = u8 * 0x11 gives 0-255; map to DEViLBOX -100..+100
    const rawPan = u8(v, pansOffset + chn) * 0x11;
    channelPans.push(Math.round((rawPan / 255) * 200 - 100));
  }

  // Parse patterns
  // Layout: patterns[0..numPatterns-1], each = numChannels × 64 rows × 6 bytes
  // Cell iteration order in OpenMPT: iterates ModCommand in pat (row-major with all channels)
  // i.e. for each row: for each channel: one cell
  // But looking at the code: `for(ModCommand &m : Patterns[pat])` — iterates all cells in row-major
  // Patterns[pat] iterates as: row 0 ch0, row 0 ch1, ... row 0 chN, row 1 ch0, ...
  // So cell at (row, chn) = file offset patternStart + pat*(numChannels*64*6) + (row*numChannels+chn)*6

  const patternCells: Map<number, TrackerCell[][]> = new Map();

  for (let pat = 0; pat < numPatterns; pat++) {
    const patBase = patternStart + pat * numChannels * ROWS_PER_PATTERN * CELL_SIZE;

    // cells[chn][row]
    const cells: TrackerCell[][] = Array.from({ length: numChannels }, () =>
      Array.from({ length: ROWS_PER_PATTERN }, (): TrackerCell => ({
        note: 0, instrument: 0, volume: 0,
        effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      }))
    );

    let patOk = true;
    for (let row = 0; row < ROWS_PER_PATTERN && patOk; row++) {
      for (let chn = 0; chn < numChannels && patOk; chn++) {
        const off = patBase + (row * numChannels + chn) * CELL_SIZE;
        if (off + CELL_SIZE > bytes.length) { patOk = false; break; }

        const noteRaw  = u8(v, off + 0);
        const instr    = u8(v, off + 1);
        const eff1Cmd  = u8(v, off + 2);
        const eff2Cmd  = u8(v, off + 3);
        const eff2Prm  = u8(v, off + 4);
        const eff1Prm  = u8(v, off + 5);

        // Note: 0=empty, 1-77 → NOTE_MIN+35+noteRaw = 1+35+noteRaw = 36+noteRaw
        let note = 0;
        if (noteRaw > 0 && noteRaw <= 77) {
          note = 36 + noteRaw;
        }

        const e1 = translateXMFEffect(eff1Cmd, eff1Prm, type);
        const e2 = translateXMFEffect(eff2Cmd, eff2Prm, type);

        if (e1 === null || e2 === null) { patOk = false; break; }

        cells[chn][row].note       = note;
        cells[chn][row].instrument = instr;
        cells[chn][row].effTyp     = e1.command;
        cells[chn][row].eff        = e1.param;
        cells[chn][row].effTyp2    = e2.command;
        cells[chn][row].eff2       = e2.param;
      }
    }

    if (!patOk) {
      // Leave pattern as empty rather than aborting entirely
    }

    patternCells.set(pat, cells);
  }

  // Build TrackerSong patterns — one per order entry
  const patterns: Pattern[] = orders.map((patIdx, orderPos) => {
    const cells = patternCells.get(patIdx);

    const channels: ChannelData[] = Array.from({ length: numChannels }, (_, chn) => {
      const rows: TrackerCell[] = Array.from({ length: ROWS_PER_PATTERN }, (_, row): TrackerCell => {
        if (!cells) {
          return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
        }
        return { ...cells[chn][row] };
      });

      return {
        id:           `c${orderPos}-ch${chn}`,
        name:         `Channel ${chn + 1}`,
        muted:        false,
        solo:         false,
        collapsed:    false,
        volume:       100,
        pan:          channelPans[chn] ?? 0,
        instrumentId: null,
        color:        null,
        rows,
      };
    });

    return {
      id:     `pattern-${orderPos}-${patIdx}`,
      name:   `Pattern ${patIdx}`,
      length: ROWS_PER_PATTERN,
      channels,
      importMetadata: {
        sourceFormat:            'xmf',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    numChannels,
        originalPatternCount:    numPatterns,
        originalInstrumentCount: numSamples,
      },
    };
  });

  // Build instruments from sample data.
  // Sample data comes after all pattern data, sequentially for samples 1..numSamples.
  // The OpenMPT loader reads samples after patterns using SampleIO in sample-index order.
  // Each sample's raw data is dataEnd-dataStart bytes, stored sequentially.
  let sampleDataOffset = patternStart + patternDataSize;

  const instruments: InstrumentConfig[] = [];
  for (let i = 0; i < numSamples; i++) {
    const id   = i + 1;
    const info = sampleInfos[i];

    if (!info || !info.hasSampleData || info.lengthBytes === 0) {
      instruments.push({
        id,
        name:      `Sample ${id}`,
        type:      'sample' as const,
        synthType: 'Sampler' as const,
        effects:   [],
        volume:    0,
        pan:       0,
      } as unknown as InstrumentConfig);
      if (info && info.hasSampleData) sampleDataOffset += info.lengthBytes;
      continue;
    }

    const endOff = sampleDataOffset + info.lengthBytes;
    if (endOff > bytes.length) {
      instruments.push({
        id,
        name:      `Sample ${id}`,
        type:      'sample' as const,
        synthType: 'Sampler' as const,
        effects:   [],
        volume:    0,
        pan:       0,
      } as unknown as InstrumentConfig);
      sampleDataOffset += info.lengthBytes;
      continue;
    }

    // OpenMPT converts: nLoopStart = loopStart+1, nLoopEnd = loopEnd+1
    const loopStart = info.hasLoop ? info.loopStart + 1 : 0;
    const loopEnd   = info.hasLoop ? info.loopEnd   + 1 : 0;

    // Sample rate: type!=2 uses sampleRate directly; type==2 is old UltraTracker
    // For simplicity, use sampleRate for all types (type 2 sampleRate < 0x8000 was already validated)
    const sampleRate = info.sampleRate > 0 ? info.sampleRate : 8363;

    if (info.is16Bit) {
      // 16-bit signed little-endian PCM — convert to 8-bit for createSamplerInstrument
      // (or create WAV directly)
      const numFrames = info.length;
      const pcm8 = new Uint8Array(numFrames);
      for (let j = 0; j < numFrames; j++) {
        const sampleOff = sampleDataOffset + j * 2;
        if (sampleOff + 2 > bytes.length) break;
        // Read 16-bit signed LE, downsample to 8-bit
        const s16 = v.getInt16(sampleOff, true);
        pcm8[j] = (s16 >> 8) + 128;  // Convert to unsigned 8-bit
      }
      instruments.push(createSamplerInstrument(
        id,
        `Sample ${id}`,
        pcm8,
        info.defaultVolume,
        sampleRate,
        loopStart,
        loopEnd,
      ));
    } else {
      // 8-bit signed PCM
      const pcm = bytes.subarray(sampleDataOffset, endOff);
      instruments.push(createSamplerInstrument(
        id,
        `Sample ${id}`,
        pcm,
        info.defaultVolume,
        sampleRate,
        loopStart,
        loopEnd,
      ));
    }

    sampleDataOffset += info.lengthBytes;
  }

  const songPositions = patterns.map((_, i) => i);
  const songName      = filename.replace(/\.[^/.]+$/, '');

  // Imperium Galactica files (type 3) have quieter sample pre-amp in OpenMPT,
  // but that's a playback concern we don't model here.

  return {
    name:            songName,
    format:          'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength:      songPositions.length,
    restartPosition: 0,
    numChannels,
    initialSpeed:    6,
    initialBPM:      125,
    linearPeriods:   false,
  };
}
