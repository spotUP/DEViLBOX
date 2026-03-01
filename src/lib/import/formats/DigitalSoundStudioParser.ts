/**
 * DigitalSoundStudioParser.ts — Digital Sound Studio (DSS) native parser
 *
 * Digital Sound Studio is an Amiga tracker format. Files use the extension .dss
 * and begin with the magic "MMU2" at offset 0. The format uses 4 channels,
 * 31 instrument slots, and up to 128 song positions referencing 64-row patterns.
 *
 * Reference: NostalgicPlayer DigitalSoundStudioWorker.cs (authoritative loader)
 * Reference spec: thoughts/shared/research/nostalgicplayer/DSS.txt
 *
 * File layout (big-endian):
 *   0x000   4 bytes  Magic "MMU2"
 *   0x004   4 bytes  Song length or offset to first sample (informational)
 *   0x008   1 byte   Song tempo (0 = 125)
 *   0x009   1 byte   Song speed
 *   0x00A  31*46     Sample information (31 samples, 0x2E bytes each)
 *   0x59C   2 bytes  Number of positions (≤128)
 *   0x59E  128 bytes Position list (pattern indices, 0-based)
 *   0x61E  N*1024   Pattern data (N = highest pattern index + 1)
 *   (remainder)     Sample data
 *
 * Sample information (46 bytes each):
 *   0x00  30 bytes  Sample name
 *   0x1E   4 bytes  Start offset (masked to even)
 *   0x22   2 bytes  Length in words (one-shot part)
 *   0x24   4 bytes  Loop start
 *   0x28   2 bytes  Loop length in words
 *   0x2A   1 byte   Finetune (0-15, signed: 8-15 = -8 to -1)
 *   0x2B   1 byte   Volume (0-64)
 *   0x2C   2 bytes  Frequency (unused in tracker; informational)
 *
 * Pattern rows (4 bytes per cell):
 *   AAAAABBB BBBBBBBB CCCCCCCC DDDDDDDD
 *   A = sample number (5 bits)
 *   B = period (11 bits)
 *   C = effect number
 *   D = effect argument
 *
 * Amiga LRRL stereo panning: channels 0,3 → pan -50, channels 1,2 → pan +50
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';
import type { UADEChipRamInfo } from '@/types/instrument';

// ── Constants ──────────────────────────────────────────────────────────────

const MAGIC            = 0x4d4d5532; // "MMU2"
const MIN_FILE_SIZE    = 0x61e;       // minimum: header + positions + at least no patterns
const NUM_SAMPLES      = 31;
const SAMPLE_INFO_SIZE = 0x2e;        // 46 bytes per sample info entry
const SAMPLE_INFO_BASE = 0x0a;        // offset where sample info begins
const NUM_POSITIONS_OFF= 0x59c;
const POSITION_LIST_OFF= 0x59e;
const PATTERN_DATA_OFF = 0x61e;
const ROWS_PER_PATTERN = 64;
const CHANNELS         = 4;
const BYTES_PER_CELL   = 4;
const BYTES_PER_ROW    = CHANNELS * BYTES_PER_CELL;  // 16
const BYTES_PER_PATTERN= ROWS_PER_PATTERN * BYTES_PER_ROW; // 1024

const PAL_CLOCK = 3546895;

/** Amiga LRRL panning: channels 0 and 3 → left, 1 and 2 → right */
const AMIGA_PAN = [-50, 50, 50, -50] as const;

// ── DSS period table (finetune 0-7, -8 to -1 = indices 8-15) ─────────────
// Direct transcription from Tables.cs, 4 octaves × 12 notes per finetune row.
// Row index: 0-7 = finetune 0..7, 8-15 = finetune -8..-1
const DSS_PERIODS: readonly (readonly number[])[] = [
  // Finetune 0 (normal)
  [1712, 1616, 1524, 1440, 1356, 1280, 1208, 1140, 1076, 1016,  960,  906,
    856,  808,  762,  720,  678,  640,  604,  570,  538,  508,  480,  453,
    428,  404,  381,  360,  339,  320,  302,  285,  269,  254,  240,  226,
    214,  202,  190,  180,  170,  160,  151,  143,  135,  127,  120,  113],
  // Finetune 1
  [1700, 1604, 1514, 1430, 1348, 1274, 1202, 1134, 1070, 1010,  954,  900,
    850,  802,  757,  715,  674,  637,  601,  567,  535,  505,  477,  450,
    425,  401,  379,  357,  337,  318,  300,  284,  268,  253,  239,  225,
    213,  201,  189,  179,  169,  159,  150,  142,  134,  126,  119,  113],
  // Finetune 2
  [1688, 1592, 1504, 1418, 1340, 1264, 1194, 1126, 1064, 1004,  948,  894,
    844,  796,  752,  709,  670,  632,  597,  563,  532,  502,  474,  447,
    422,  398,  376,  355,  335,  316,  298,  282,  266,  251,  237,  224,
    211,  199,  188,  177,  167,  158,  149,  141,  133,  125,  118,  112],
  // Finetune 3
  [1676, 1582, 1492, 1408, 1330, 1256, 1184, 1118, 1056,  996,  940,  888,
    838,  791,  746,  704,  665,  628,  592,  559,  528,  498,  470,  444,
    419,  395,  373,  352,  332,  314,  296,  280,  264,  249,  235,  222,
    209,  198,  187,  176,  166,  157,  148,  140,  132,  125,  118,  111],
  // Finetune 4
  [1664, 1570, 1482, 1398, 1320, 1246, 1176, 1110, 1048,  990,  934,  882,
    832,  785,  741,  699,  660,  623,  588,  555,  524,  495,  467,  441,
    416,  392,  370,  350,  330,  312,  294,  278,  262,  247,  233,  220,
    208,  196,  185,  175,  165,  156,  147,  139,  131,  124,  117,  110],
  // Finetune 5
  [1652, 1558, 1472, 1388, 1310, 1238, 1168, 1102, 1040,  982,  926,  874,
    826,  779,  736,  694,  655,  619,  584,  551,  520,  491,  463,  437,
    413,  390,  368,  347,  328,  309,  292,  276,  260,  245,  232,  219,
    206,  195,  184,  174,  164,  155,  146,  138,  130,  123,  116,  109],
  // Finetune 6
  [1640, 1548, 1460, 1378, 1302, 1228, 1160, 1094, 1032,  974,  920,  868,
    820,  774,  730,  689,  651,  614,  580,  547,  516,  487,  460,  434,
    410,  387,  365,  345,  325,  307,  290,  274,  258,  244,  230,  217,
    205,  193,  183,  172,  163,  154,  145,  137,  129,  122,  115,  109],
  // Finetune 7
  [1628, 1536, 1450, 1368, 1292, 1220, 1150, 1086, 1026,  968,  914,  862,
    814,  768,  725,  684,  646,  610,  575,  543,  513,  484,  457,  431,
    407,  384,  363,  342,  323,  305,  288,  272,  256,  242,  228,  216,
    204,  192,  181,  171,  161,  152,  144,  136,  128,  121,  114,  108],
  // Finetune -8 (index 8)
  [1814, 1712, 1616, 1524, 1440, 1356, 1280, 1208, 1140, 1076, 1016,  960,
    907,  856,  808,  762,  720,  678,  640,  604,  570,  538,  508,  480,
    453,  428,  404,  381,  360,  339,  320,  302,  285,  269,  254,  240,
    226,  214,  202,  190,  180,  170,  160,  151,  143,  135,  127,  120],
  // Finetune -7 (index 9)
  [1800, 1700, 1604, 1514, 1430, 1350, 1272, 1202, 1134, 1070, 1010,  954,
    900,  850,  802,  757,  715,  675,  636,  601,  567,  535,  505,  477,
    450,  425,  401,  379,  357,  337,  318,  300,  284,  268,  253,  238,
    225,  212,  200,  189,  179,  169,  159,  150,  142,  134,  126,  119],
  // Finetune -6 (index 10)
  [1788, 1688, 1592, 1504, 1418, 1340, 1264, 1194, 1126, 1064, 1004,  948,
    894,  844,  796,  752,  709,  670,  632,  597,  563,  532,  502,  474,
    447,  422,  398,  376,  355,  335,  316,  298,  282,  266,  251,  237,
    223,  211,  199,  188,  177,  167,  158,  149,  141,  133,  125,  118],
  // Finetune -5 (index 11)
  [1774, 1676, 1582, 1492, 1408, 1330, 1256, 1184, 1118, 1056,  996,  940,
    887,  838,  791,  746,  704,  665,  628,  592,  559,  528,  498,  470,
    444,  419,  395,  373,  352,  332,  314,  296,  280,  264,  249,  235,
    222,  209,  198,  187,  176,  166,  157,  148,  140,  132,  125,  118],
  // Finetune -4 (index 12)
  [1762, 1664, 1570, 1482, 1398, 1320, 1246, 1176, 1110, 1048,  988,  934,
    881,  832,  785,  741,  699,  660,  623,  588,  555,  524,  494,  467,
    441,  416,  392,  370,  350,  330,  312,  294,  278,  262,  247,  233,
    220,  208,  196,  185,  175,  165,  156,  147,  139,  131,  123,  117],
  // Finetune -3 (index 13)
  [1750, 1652, 1558, 1472, 1388, 1310, 1238, 1168, 1102, 1040,  982,  926,
    875,  826,  779,  736,  694,  655,  619,  584,  551,  520,  491,  463,
    437,  413,  390,  368,  347,  328,  309,  292,  276,  260,  245,  232,
    219,  206,  195,  184,  174,  164,  155,  146,  138,  130,  123,  116],
  // Finetune -2 (index 14)
  [1736, 1640, 1548, 1460, 1378, 1302, 1228, 1160, 1094, 1032,  974,  920,
    868,  820,  774,  730,  689,  651,  614,  580,  547,  516,  487,  460,
    434,  410,  387,  365,  345,  325,  307,  290,  274,  258,  244,  230,
    217,  205,  193,  183,  172,  163,  154,  145,  137,  129,  122,  115],
  // Finetune -1 (index 15)
  [1724, 1628, 1536, 1450, 1368, 1292, 1220, 1150, 1086, 1026,  968,  914,
    862,  814,  768,  725,  684,  646,  610,  575,  543,  513,  484,  457,
    431,  407,  384,  363,  342,  323,  305,  288,  272,  256,  242,  228,
    216,  203,  192,  181,  171,  161,  152,  144,  136,  128,  121,  114],
];

// Flat period list for finetune 0 only (for quick period-to-note mapping)
// 48 entries: 4 octaves × 12 notes
const DSS_PERIODS_FT0 = DSS_PERIODS[0];

// ── Utility ────────────────────────────────────────────────────────────────

function u8(buf: Uint8Array, off: number): number { return buf[off] ?? 0; }

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] ?? 0) << 8) | (buf[off + 1] ?? 0);
}

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] ?? 0) << 24) |
          ((buf[off + 1] ?? 0) << 16) |
          ((buf[off + 2] ?? 0) << 8)  |
           (buf[off + 3] ?? 0)) >>> 0;
}

/** Read a null-padded ASCII string of `len` bytes from `buf` at `off`. */
function readString(buf: Uint8Array, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = buf[off + i];
    if (c === undefined || c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

/**
 * Convert a DSS period value to a 1-based note index using finetune 0 table.
 * The table has 48 entries covering 4 octaves (C-0 to B-3 in Amiga conventions).
 * We find the closest period. Returns 0 if period is 0 or out of range.
 *
 * DSS table starts at the highest period (lowest pitch), index 0 = C-1 in
 * ProTracker octave convention (period 1712). This maps to XM note 13 (C-1).
 */
function periodToXMNote(period: number): number {
  if (period === 0 || period === 0x7ff) return 0;

  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < DSS_PERIODS_FT0.length; i++) {
    const p = DSS_PERIODS_FT0[i];
    if (p === undefined) continue;
    const d = Math.abs(p - period);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  // bestIdx 0 = C-1 in ProTracker → XM note 13 (C-1 in XM is note 13)
  // XM note numbering: 1 = C-0, 13 = C-1, 25 = C-2, etc.
  const xmNote = bestIdx + 13;
  return Math.max(1, Math.min(96, xmNote));
}

function periodToFreq(period: number): number {
  if (period <= 0) return 8287;
  return Math.round(PAL_CLOCK / (2 * period));
}

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

// ── Internal data structures ───────────────────────────────────────────────

interface DSSSample {
  name: string;
  startOffset: number;   // byte offset within sample block (masked to even)
  length: number;        // in words (oneshot part)
  loopStart: number;     // byte offset of loop start within sample data
  loopLength: number;    // in words
  finetune: number;      // 0-15 (0-7 = positive, 8-15 = -8 to -1)
  volume: number;        // 0-64
  frequency: number;     // informational
}

interface DSSCell {
  sample: number;        // 0 = no sample, 1-31 = sample index
  period: number;        // Amiga period value (11 bits)
  effect: number;        // effect number
  effectArg: number;     // effect argument
}

// ── Format Identification ──────────────────────────────────────────────────

/**
 * Returns true if `bytes` looks like a Digital Sound Studio (.dss) module.
 * Based on NostalgicPlayer's Identify() method.
 *
 * Checks:
 * 1. File is at least 0x61E bytes
 * 2. Magic "MMU2" at offset 0
 * 3. numPositions ≤ 128
 * 4. File size > (highest_pattern + 1) * 1024 + 0x61E (i.e. has sample data)
 */
export function isDigitalSoundStudioFormat(bytes: Uint8Array): boolean {
  if (bytes.length < MIN_FILE_SIZE) return false;

  // Check magic "MMU2"
  if (u32BE(bytes, 0) !== MAGIC) return false;

  // Read number of positions
  const numPositions = u16BE(bytes, NUM_POSITIONS_OFF);
  if (numPositions === 0 || numPositions > 128) return false;

  // Find highest pattern number used
  let highest = 0;
  for (let i = 0; i < numPositions; i++) {
    const pat = u8(bytes, POSITION_LIST_OFF + i);
    if (pat > highest) highest = pat;
  }

  // Verify there is sample data after the pattern block
  const patternBlockEnd = PATTERN_DATA_OFF + (highest + 1) * BYTES_PER_PATTERN;
  if (patternBlockEnd >= bytes.length) return false;

  return true;
}

// ── Main Parser ────────────────────────────────────────────────────────────

/**
 * Parse a Digital Sound Studio (.dss) file and return a TrackerSong.
 * Returns null if the file cannot be parsed.
 */
export function parseDigitalSoundStudioFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  try {
    if (!isDigitalSoundStudioFormat(bytes)) return null;

    // ── Header ──────────────────────────────────────────────────────────
    const songTempo = u8(bytes, 8);
    const songSpeed = u8(bytes, 9);
    const initialBPM = songTempo === 0 ? 125 : songTempo;
    const initialSpeed = songSpeed === 0 ? 6 : songSpeed;

    // ── Sample info ──────────────────────────────────────────────────────
    const sampleInfos: DSSSample[] = [];
    for (let i = 0; i < NUM_SAMPLES; i++) {
      const base = SAMPLE_INFO_BASE + i * SAMPLE_INFO_SIZE;
      const name       = readString(bytes, base + 0x00, 30);
      const startOff   = u32BE(bytes, base + 0x1e) & 0xfffffffe; // mask to even
      const length     = u16BE(bytes, base + 0x22);              // words
      const loopStart  = u32BE(bytes, base + 0x24);              // bytes
      const loopLength = u16BE(bytes, base + 0x28);              // words
      const finetune   = u8(bytes, base + 0x2a);
      const volume     = u8(bytes, base + 0x2b);
      const frequency  = u16BE(bytes, base + 0x2c);
      sampleInfos.push({ name, startOffset: startOff, length, loopStart, loopLength, finetune, volume, frequency });
    }

    // ── Positions ────────────────────────────────────────────────────────
    const numPositions = u16BE(bytes, NUM_POSITIONS_OFF);
    const positions: number[] = [];
    for (let i = 0; i < numPositions; i++) {
      positions.push(u8(bytes, POSITION_LIST_OFF + i));
    }

    // ── Patterns ─────────────────────────────────────────────────────────
    const numPatterns = Math.max(...positions) + 1;
    const rawPatterns: DSSCell[][][] = []; // [patternIdx][row][channel]

    for (let p = 0; p < numPatterns; p++) {
      const rows: DSSCell[][] = [];
      const patBase = PATTERN_DATA_OFF + p * BYTES_PER_PATTERN;
      for (let row = 0; row < ROWS_PER_PATTERN; row++) {
        const cells: DSSCell[] = [];
        for (let ch = 0; ch < CHANNELS; ch++) {
          const off = patBase + row * BYTES_PER_ROW + ch * BYTES_PER_CELL;
          const b1 = u8(bytes, off);
          const b2 = u8(bytes, off + 1);
          const b3 = u8(bytes, off + 2);
          const b4 = u8(bytes, off + 3);
          cells.push({
            sample:    b1 >> 3,
            period:    ((b1 & 0x07) << 8) | b2,
            effect:    b3,
            effectArg: b4,
          });
        }
        rows.push(cells);
      }
      rawPatterns.push(rows);
    }

    // ── Sample data ───────────────────────────────────────────────────────
    // After all patterns, sample data begins.
    const sampleDataBase = PATTERN_DATA_OFF + numPatterns * BYTES_PER_PATTERN;

    // ── Build InstrumentConfig[] ──────────────────────────────────────────
    const instruments: InstrumentConfig[] = [];

    for (let i = 0; i < NUM_SAMPLES; i++) {
      const info = sampleInfos[i];
      const id = i + 1;

      // Total data length in bytes = (length + loopLength) * 2 + startOffset
      // (matching ReadSamples() in C#)
      const hasLoop = info.loopLength > 1;
      const totalWords = info.length + (hasLoop ? info.loopLength : 0);
      const totalBytes = totalWords * 2;

      if (info.length === 0 || totalBytes === 0) {
        // Empty sample slot — create a placeholder synth instrument
        const _dssChipRamInfo: UADEChipRamInfo = { moduleBase: 0, moduleSize: bytes.length, instrBase: SAMPLE_INFO_BASE + i * SAMPLE_INFO_SIZE, instrSize: SAMPLE_INFO_SIZE, sections: {} };
        instruments.push({
          id,
          name: info.name.trim() || `Sample ${id}`,
          type: 'synth' as const,
          synthType: 'Synth' as const,
          effects: [],
          volume: 0,
          pan: 0,
          uadeChipRam: _dssChipRamInfo,
        } as InstrumentConfig);
        continue;
      }

      // Sample data absolute offset in file
      const absOffset = sampleDataBase + info.startOffset;
      const dataEnd   = absOffset + totalBytes;

      if (dataEnd > bytes.length) {
        // Sample data extends past file — create placeholder
        const _dssChipRamInfo2: UADEChipRamInfo = { moduleBase: 0, moduleSize: bytes.length, instrBase: SAMPLE_INFO_BASE + i * SAMPLE_INFO_SIZE, instrSize: SAMPLE_INFO_SIZE, sections: {} };
        instruments.push({
          id,
          name: info.name.trim() || `Sample ${id}`,
          type: 'synth' as const,
          synthType: 'Synth' as const,
          effects: [],
          volume: 0,
          pan: 0,
          uadeChipRam: _dssChipRamInfo2,
        } as InstrumentConfig);
        continue;
      }

      // Extract raw signed PCM bytes (8-bit signed)
      const pcm = bytes.slice(absOffset, dataEnd);

      // Loop boundaries in samples (bytes) relative to start of this sample's data
      // In C#: voiceInfo.LoopStart = sample.StartOffset + sample.LoopStart
      // But sample.LoopStart is an absolute byte offset within the sample block,
      // so relative to sample data it is: info.loopStart - info.startOffset
      // (Both are relative to the sample data block base)
      const loopStartBytes = hasLoop ? info.loopStart : 0;
      const loopEndBytes   = hasLoop ? loopStartBytes + info.loopLength * 2 : 0;

      // C3 rate: use frequency field if non-zero, else use period table for C3
      // The finetune byte: 0-7 = positive, 8-15 = -8 to -1
      // For sample rate, use period at C-3 with the sample's finetune
      const ftIdx = info.finetune & 0x0f;
      const ftRow = DSS_PERIODS[ftIdx];
      // C-3 is at index 24 in the period table (octave 3, note C = index 24)
      const c3Period = (ftRow && ftRow[24] !== undefined) ? ftRow[24] : 214;
      const sampleRate = info.frequency > 0 ? info.frequency : periodToFreq(c3Period);

      const _dssChipRam: UADEChipRamInfo = { moduleBase: 0, moduleSize: bytes.length, instrBase: SAMPLE_INFO_BASE + i * SAMPLE_INFO_SIZE, instrSize: SAMPLE_INFO_SIZE, sections: {} };
      const _dssInst = createSamplerInstrument(id, info.name.trim() || "Sample " + id, pcm, info.volume, sampleRate, loopStartBytes, loopEndBytes);
      instruments.push({ ..._dssInst, uadeChipRam: _dssChipRam });
    }

    // ── Convert patterns to TrackerPatterns ───────────────────────────────
    const trackerPatterns: Pattern[] = [];

    for (let p = 0; p < numPatterns; p++) {
      const raw = rawPatterns[p];
      if (!raw) continue;

      const channelRows: TrackerCell[][] = Array.from({ length: CHANNELS }, () => []);

      for (let row = 0; row < ROWS_PER_PATTERN; row++) {
        const cells = raw[row];
        for (let ch = 0; ch < CHANNELS; ch++) {
          const cell = cells?.[ch];
          if (!cell) {
            channelRows[ch]!.push(emptyCell());
            continue;
          }

          const xmNote = periodToXMNote(cell.period);
          const instrNum = cell.sample; // 0 = no instrument, 1-31 = sample

          // Map DSS effects to XM-style effects where possible
          // DSS effect 0 = Arpeggio, 1 = Slide Up, 2 = Slide Down, 3 = Set Volume
          // 5 = Set Song Speed, 6 = Position Jump, B = Set Tempo
          let effTyp = 0;
          let eff = 0;

          switch (cell.effect) {
            case 0x00: // Arpeggio
              effTyp = 0x00; // XM arpeggio
              eff = cell.effectArg;
              break;
            case 0x01: // Slide up (pitch down = smaller period)
              effTyp = 0x01; // XM portamento up
              eff = cell.effectArg;
              break;
            case 0x02: // Slide down
              effTyp = 0x02; // XM portamento down
              eff = cell.effectArg;
              break;
            case 0x03: // Set volume
              effTyp = 0x0C; // XM set volume
              eff = cell.effectArg;
              break;
            case 0x05: // Set song speed
              effTyp = 0x0F; // XM set speed
              eff = cell.effectArg;
              break;
            case 0x06: // Position jump
              effTyp = 0x0B; // XM position jump
              eff = cell.effectArg;
              break;
            case 0x0B: // Set song tempo (BPM)
              effTyp = 0x0F; // XM set tempo (value >= 32 = BPM in XM)
              eff = cell.effectArg;
              break;
            case 0x1B: // Portamento
              effTyp = 0x03; // XM tone portamento
              eff = cell.effectArg;
              break;
            default:
              effTyp = 0;
              eff = 0;
              break;
          }

          channelRows[ch]!.push({
            note:       xmNote,
            instrument: instrNum,
            volume:     0,
            effTyp,
            eff,
            effTyp2:    0,
            eff2:       0,
          });
        }
      }

      trackerPatterns.push({
        id: `pattern-${p}`,
        name: `Pattern ${p}`,
        length: ROWS_PER_PATTERN,
        channels: channelRows.map((rows, ch) => ({
          id: `channel-${ch}`,
          name: `Channel ${ch + 1}`,
          muted: false,
          solo: false,
          collapsed: false,
          volume: 100,
          pan: AMIGA_PAN[ch] ?? 0,
          instrumentId: null,
          color: null,
          rows,
        })),
        importMetadata: {
          sourceFormat: 'DSS',
          sourceFile: filename,
          importedAt: new Date().toISOString(),
          originalChannelCount: CHANNELS,
          originalPatternCount: numPatterns,
          originalInstrumentCount: NUM_SAMPLES,
        },
      });
    }

    if (trackerPatterns.length === 0) {
      trackerPatterns.push({
        id: 'pattern-0',
        name: 'Pattern 0',
        length: ROWS_PER_PATTERN,
        channels: Array.from({ length: CHANNELS }, (_, ch) => ({
          id: `channel-${ch}`,
          name: `Channel ${ch + 1}`,
          muted: false,
          solo: false,
          collapsed: false,
          volume: 100,
          pan: AMIGA_PAN[ch] ?? 0,
          instrumentId: null,
          color: null,
          rows: Array.from({ length: ROWS_PER_PATTERN }, () => emptyCell()),
        })),
        importMetadata: {
          sourceFormat: 'DSS',
          sourceFile: filename,
          importedAt: new Date().toISOString(),
          originalChannelCount: CHANNELS,
          originalPatternCount: 0,
          originalInstrumentCount: NUM_SAMPLES,
        },
      });
    }

    const moduleName = filename.replace(/\.[^/.]+$/, '');

    return {
      name: moduleName,
      format: 'DSS' as TrackerFormat,
      patterns: trackerPatterns,
      instruments,
      songPositions: positions.map(p => p),
      songLength: positions.length,
      restartPosition: 0,
      numChannels: CHANNELS,
      initialSpeed,
      initialBPM,
      linearPeriods: false,
    };
  } catch {
    return null;
  }
}
