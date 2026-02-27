/**
 * Composer667Parser.ts — Composer 669 / UNIS 669 (.669) format parser
 *
 * Despite the filename, this parser handles the Composer 669 / UNIS 669 format
 * (.669 files) — a PC DOS 8-channel tracker format — not the OPL-based
 * Composer 667 format. The test suite uses .669 files and imports from this module.
 *
 * Two magic signatures:
 *   "if" (0x69 0x66) — Composer 669
 *   "JN" (0x4A 0x4E) — UNIS 669 extended
 *
 * Binary layout:
 *   +0    magic[2]         — 'if' or 'JN'
 *   +2    songMessage[108] — 3 × 36-char message lines
 *   +110  samples (uint8)  — number of samples (0-64)
 *   +111  patterns (uint8) — number of patterns (0-128)
 *   +112  restartPos (uint8)
 *   +113  orders[128]      — 0xFF = end, 0xFE = end+restart
 *   +241  tempoList[128]   — speed per order (0-15)
 *   +369  breaks[128]      — break row per order (0-63)
 *   +497  sample headers: numSamples × 25 bytes
 *         filename[13] + length(uint32le) + loopStart(uint32le) + loopEnd(uint32le)
 *   after sample headers: numPatterns × 1536 bytes (64 rows × 8 ch × 3 bytes/cell)
 *   after patterns: raw PCM sample data
 *
 * Reference: OpenMPT soundlib/Load_669.cpp
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// ── Binary helpers ────────────────────────────────────────────────────────────

function u8dv(v: DataView, off: number): number    { return v.getUint8(off); }
function u32le(v: DataView, off: number): number   { return v.getUint32(off, true); }

function readString669(v: DataView, off: number, len: number): string {
  const bytes: number[] = [];
  for (let i = 0; i < len; i++) {
    const b = v.getUint8(off + i);
    if (b === 0) break;
    bytes.push(b);
  }
  return String.fromCharCode(...bytes).replace(/[\x00-\x1F]/g, ' ').trim();
}

// ── Constants ─────────────────────────────────────────────────────────────────

const HEADER_SIZE      = 497;
const SAMPLE_HDR_SIZE  = 25;
const NUM_CHANNELS     = 8;
const ROWS_PER_PATTERN = 64;
const BYTES_PER_CELL   = 3;
const PATTERN_SIZE     = ROWS_PER_PATTERN * NUM_CHANNELS * BYTES_PER_CELL; // 1536
const SAMPLE_RATE      = 8363;

const OFFSET_SONG_MSG   = 2;
const OFFSET_SAMPLES    = 110;
const OFFSET_PATTERNS   = 111;
const OFFSET_RESTART    = 112;
const OFFSET_ORDERS     = 113;
const OFFSET_TEMPO_LIST = 241;
const OFFSET_BREAKS     = 369;

const ORDER_END     = 0xFF;
const ORDER_RESTART = 0xFE;

const CHANNEL_PAN = [-60, 60, 60, -60, -60, 60, 60, -60] as const;

const EFF_PORTA_UP      = 0x01;
const EFF_PORTA_DOWN    = 0x02;
const EFF_TONE_PORTA    = 0x03;
const EFF_VIBRATO       = 0x04;
const EFF_SPEED         = 0x0F;
const EFF_PATTERN_BREAK = 0x0D;
const EFF_NONE          = 0x00;

// ── Format detection ─────────────────────────────────────────────────────────

/**
 * Returns true if the buffer looks like a Composer 669 / UNIS 669 file.
 * Mirrors ValidateHeader() from OpenMPT Load_669.cpp.
 */
export function isComposer667Format(bytes: Uint8Array): boolean {
  if (bytes.length < HEADER_SIZE) return false;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const m0 = u8dv(v, 0);
  const m1 = u8dv(v, 1);
  const isComposer = (m0 === 0x69 && m1 === 0x66); // 'if'
  const isUNIS     = (m0 === 0x4A && m1 === 0x4E); // 'JN'
  if (!isComposer && !isUNIS) return false;

  const numSamples  = u8dv(v, OFFSET_SAMPLES);
  const numPatterns = u8dv(v, OFFSET_PATTERNS);
  const restartPos  = u8dv(v, OFFSET_RESTART);

  if (numSamples  > 64)  return false;
  if (numPatterns > 128) return false;
  if (restartPos  >= 128) return false;

  // Song message: at most 40 control chars before being rejected
  let invalidCount = 0;
  for (let i = 0; i < 108; i++) {
    const c = u8dv(v, OFFSET_SONG_MSG + i);
    if (c > 0 && c <= 31 && ++invalidCount > 40) return false;
  }

  // Validate order/tempo/break tables
  for (let i = 0; i < 128; i++) {
    const order = u8dv(v, OFFSET_ORDERS + i);
    const tempo  = u8dv(v, OFFSET_TEMPO_LIST + i);
    const brk    = u8dv(v, OFFSET_BREAKS + i);
    if (order >= 128 && order < 0xFE) return false;
    if (order < 128 && tempo === 0)   return false;
    if (tempo > 15)                   return false;
    if (brk >= 64)                    return false;
  }

  const minSize = HEADER_SIZE + numSamples * SAMPLE_HDR_SIZE + numPatterns * PATTERN_SIZE;
  if (bytes.length < minSize) return false;

  return true;
}

// ── Effect mapping ────────────────────────────────────────────────────────────

function map669Effect(command: number, param: number): { effTyp: number; eff: number } {
  switch (command) {
    case 0: return { effTyp: EFF_PORTA_UP,   eff: param };
    case 1: return { effTyp: EFF_PORTA_DOWN, eff: param };
    case 2: return { effTyp: EFF_TONE_PORTA, eff: param };
    case 3: return { effTyp: EFF_PORTA_UP,   eff: 0xF0 | param };
    case 4: return { effTyp: EFF_VIBRATO,    eff: (param << 4) | param };
    case 5: return { effTyp: EFF_SPEED,      eff: param };
    case 6:
      switch (param) {
        case 0:  return { effTyp: 0x0E, eff: 0x04 };
        case 1:  return { effTyp: 0x0E, eff: 0x14 };
        default: return { effTyp: EFF_NONE, eff: 0 };
      }
    case 7: return { effTyp: 0x0E, eff: 0x90 | param };
    default: return { effTyp: EFF_NONE, eff: 0 };
  }
}

// ── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parse a Composer 669 / UNIS 669 (.669) file into a TrackerSong.
 * Returns null on any parse failure (never throws).
 */
export function parseComposer667File(bytes: Uint8Array, filename: string): TrackerSong | null {
  try {
    return _parse669(bytes, filename);
  } catch {
    return null;
  }
}

function _parse669(bytes: Uint8Array, filename: string): TrackerSong | null {
  if (!isComposer667Format(bytes)) return null;

  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const v      = new DataView(buffer);

  const numSamples  = u8dv(v, OFFSET_SAMPLES);
  const numPatterns = u8dv(v, OFFSET_PATTERNS);
  const restartPos  = u8dv(v, OFFSET_RESTART);
  const songName    = readString669(v, OFFSET_SONG_MSG, 36);

  // Sample headers
  const sampleHeaders: Array<{ filename: string; length: number; loopStart: number; loopEnd: number }> = [];
  let sampleHdrBase = HEADER_SIZE;
  for (let i = 0; i < numSamples; i++) {
    sampleHeaders.push({
      filename:  readString669(v, sampleHdrBase,      13),
      length:    u32le(v, sampleHdrBase + 13),
      loopStart: u32le(v, sampleHdrBase + 17),
      loopEnd:   u32le(v, sampleHdrBase + 21),
    });
    sampleHdrBase += SAMPLE_HDR_SIZE;
  }

  // Order list
  const rawOrders: number[] = [];
  for (let i = 0; i < 128; i++) {
    const ord = u8dv(v, OFFSET_ORDERS + i);
    if (ord === ORDER_END || ord === ORDER_RESTART) break;
    rawOrders.push(ord);
  }
  if (rawOrders.length === 0) rawOrders.push(0);

  const tempoList: number[] = [];
  const breakList: number[] = [];
  for (let i = 0; i < rawOrders.length; i++) {
    tempoList.push(u8dv(v, OFFSET_TEMPO_LIST + i));
    breakList.push(u8dv(v, OFFSET_BREAKS     + i));
  }

  const patternDataBase = HEADER_SIZE + numSamples * SAMPLE_HDR_SIZE;

  function buildPattern(patIdx: number, orderPos: number, speed: number, breakRow: number): Pattern {
    const patBase = patternDataBase + patIdx * PATTERN_SIZE;
    const channelEffect = new Uint8Array(NUM_CHANNELS).fill(0xFF);
    const channelRows: TrackerCell[][] = Array.from({ length: NUM_CHANNELS }, () => []);

    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const cellBase  = patBase + (row * NUM_CHANNELS + ch) * BYTES_PER_CELL;
        const noteInstr = (cellBase     < buffer.byteLength) ? u8dv(v, cellBase)     : 0xFF;
        const instrVol  = (cellBase + 1 < buffer.byteLength) ? u8dv(v, cellBase + 1) : 0x00;
        const effParam  = (cellBase + 2 < buffer.byteLength) ? u8dv(v, cellBase + 2) : 0xFF;

        let note = 0;
        let instrument = 0;
        let volume = 0;

        if (noteInstr < 0xFE) {
          const rawNote = noteInstr >> 2;
          instrument    = ((noteInstr & 0x03) << 4) | (instrVol >> 4);
          note = rawNote + 37;
          if (note < 1)  note = 1;
          if (note > 96) note = 96;
          channelEffect[ch] = 0xFF;
        }
        if (noteInstr <= 0xFE) {
          const rawVol = instrVol & 0x0F;
          volume = Math.round((rawVol * 64 + 8) / 15);
        }
        if (effParam !== 0xFF) {
          channelEffect[ch] = effParam;
        }

        let effTyp = EFF_NONE;
        let eff    = 0;
        if (channelEffect[ch] !== 0xFF) {
          const command = channelEffect[ch] >> 4;
          const param   = channelEffect[ch] & 0x0F;
          const mapped  = map669Effect(command, param);
          effTyp = mapped.effTyp;
          eff    = mapped.eff;
          if (command !== 6) channelEffect[ch] = 0xFF;
        }

        if (row === 0 && ch === 0 && speed > 0 && effTyp !== EFF_SPEED) {
          effTyp = EFF_SPEED;
          eff    = speed;
        }
        if (breakRow < 63 && row === breakRow && ch === 0 && effTyp === EFF_NONE) {
          effTyp = EFF_PATTERN_BREAK;
          eff    = 0;
        }

        channelRows[ch].push({
          note,
          instrument: noteInstr < 0xFE ? instrument + 1 : 0,
          volume,
          effTyp, eff, effTyp2: 0, eff2: 0,
        });
      }
    }

    const channels: ChannelData[] = channelRows.map((rows, ch) => ({
      id:           `c${orderPos}-p${patIdx}-ch${ch}`,
      name:         `Channel ${ch + 1}`,
      muted:        false,
      solo:         false,
      collapsed:    false,
      volume:       100,
      pan:          CHANNEL_PAN[ch],
      instrumentId: null,
      color:        null,
      rows,
    }));

    return {
      id:     `pattern-${orderPos}-${patIdx}`,
      name:   `Pattern ${patIdx}`,
      length: ROWS_PER_PATTERN,
      channels,
      importMetadata: {
        sourceFormat:            '669',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    NUM_CHANNELS,
        originalPatternCount:    numPatterns,
        originalInstrumentCount: numSamples,
      },
    };
  }

  const patterns: Pattern[]     = [];
  const songPositions: number[] = [];
  for (let i = 0; i < rawOrders.length; i++) {
    const patIdx   = rawOrders[i];
    const speed    = tempoList[i] > 0 ? tempoList[i] : 4;
    const breakRow = breakList[i];
    patterns.push(buildPattern(patIdx, i, speed, breakRow));
    songPositions.push(i);
  }

  const sampleDataBase = patternDataBase + numPatterns * PATTERN_SIZE;

  const instruments: InstrumentConfig[] = sampleHeaders.map((hdr, i) => {
    const id   = i + 1;
    const name = hdr.filename || `Sample ${id}`;

    if (hdr.length === 0 || hdr.length >= 0x4000000) {
      return { id, name, type: 'sample' as const, synthType: 'Sampler' as const, effects: [], volume: -60, pan: 0 } as InstrumentConfig;
    }

    let startOff = sampleDataBase;
    for (let j = 0; j < i; j++) startOff += sampleHeaders[j].length;
    const endOff = startOff + hdr.length;

    if (endOff > buffer.byteLength) {
      return { id, name, type: 'sample' as const, synthType: 'Sampler' as const, effects: [], volume: -60, pan: 0 } as InstrumentConfig;
    }

    let loopStart = 0;
    let loopEnd   = 0;
    if (!(hdr.loopEnd > hdr.length && hdr.loopStart === 0) && hdr.loopEnd !== 0) {
      loopStart = hdr.loopStart;
      loopEnd   = Math.min(hdr.loopEnd, hdr.length);
    }

    const pcm = bytes.subarray(bytes.byteOffset + startOff, bytes.byteOffset + endOff);
    return createSamplerInstrument(id, name, pcm, 64, SAMPLE_RATE, loopStart, loopEnd);
  });

  const effectiveRestart = restartPos < rawOrders.length ? restartPos : 0;

  return {
    name:            songName || filename.replace(/\.[^/.]+$/, ''),
    format:          'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength:      songPositions.length,
    restartPosition: effectiveRestart,
    numChannels:     NUM_CHANNELS,
    initialSpeed:    4,
    initialBPM:      125,
    linearPeriods:   false,
  };
}
