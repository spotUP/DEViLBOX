/**
 * ArtOfNoiseParser.ts — Art of Noise native parser
 *
 * Art of Noise is a 4- or 8-channel Amiga tracker with chunk-based IFF-like
 * file format. Supports both sample-based and synthesis-based instruments,
 * arpeggios, vibrato, and envelope modulation.
 *
 * Two variants:
 *   AON4 — 4-channel (file magic "AON4")
 *   AON8 — 8-channel (file magic "AON8")
 *
 * Reference: NostalgicPlayer ArtOfNoiseWorker.cs (authoritative loader/replayer)
 * Reference music: /Users/spot/Code/DEViLBOX/Reference Music/Art Of Noise/
 *
 * File layout:
 *   0x000 – 0x02D  46-byte header (player code / signature, skipped)
 *   0x02E –        Chunks: each chunk is [4-byte name][4-byte BE size][data]
 *
 * Chunks:
 *   NAME  — Song name (null-terminated string)
 *   AUTH  — Author name
 *   RMRK  — Comments
 *   INFO  — version(1) + numberOfPositions(1) + restartPosition(1) + rest skipped
 *   ARPG  — 16 arpeggios × 4 bytes each (64 bytes total)
 *   PLST  — Position list (chunkSize bytes of pattern indices)
 *   PATT  — Pattern data: numPatterns × 64rows × numChannels × 4 bytes
 *   INST  — Instrument data: numInstruments × 32 bytes
 *   INAM  — Instrument names: numInstruments × 32 bytes (optional)
 *   WLEN  — Waveform lengths: numWaveforms × 4 bytes (uint32 BE each)
 *   WAVE  — Waveform sample data (8-bit signed, concatenated)
 *
 * Pattern cell encoding (4 bytes):
 *   b1: note  = b1 & 0x3F
 *   b2: instr = b2 & 0x3F
 *       arpIdx hi bits: ((b3 & 0xC0) >> 4) | ((b2 & 0xC0) >> 6)
 *   b3: effect = b3 & 0x3F
 *   b4: effectArg
 *
 * Instrument type 0 = Sample, type 1 = Synth (32 bytes each):
 *   type(1) + volume(1) + fineTune(1) + waveForm(1) +
 *   [sample: startOffset(4) + length(4) + loopStart(4) + loopLength(4) + pad(8)]
 *   [synth:  length(1) + pad(5) + vibParam(1) + vibDelay(1) + vibWave(1) +
 *            waveSpeed(1) + waveLength(1) + waveLoopStart(1) + waveLoopLength(1) +
 *            waveLoopControl(1) + pad(10)]
 *   envelopeStart(1) + envelopeAdd(1) + envelopeEnd(1) + envelopeSub(1)
 *
 * Note encoding: AON uses its own 5-octave period table (Tables.Periods).
 * Note index 0 = no note; 1-60 = valid (5 octaves × 12 notes).
 * The table row is selected by instrument.FineTune (0-15, maps to rows 0-7 and -8 to -1).
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';
import type { UADEChipRamInfo } from '@/types/instrument';

// ── Constants ─────────────────────────────────────────────────────────────

/** PAL Amiga clock frequency (Hz) */
const PAL_CLOCK = 3546895;

/**
 * AON period table (16 fine-tune rows × 60 notes).
 * Rows 0-7 are fine-tunes 0..7; rows 8-15 are fine-tunes -8..-1.
 * Copied verbatim from NostalgicPlayer Tables.cs.
 */
const AON_PERIODS: number[][] = [
  // Tuning 0 (normal)
  [3434,3232,3048,2880,2712,2560,2416,2280,2152,2032,1920,1812,
   1712,1616,1524,1440,1356,1280,1208,1140,1076,1016, 960, 906,
    856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
    428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
    214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113],
  // Tuning 1
  [3400,3208,3028,2860,2696,2548,2404,2268,2140,2020,1908,1800,
   1700,1604,1514,1430,1348,1274,1202,1134,1070,1010, 954, 900,
    850, 802, 757, 715, 674, 637, 601, 567, 535, 505, 477, 450,
    425, 401, 379, 357, 337, 318, 300, 284, 268, 253, 239, 225,
    213, 201, 189, 179, 169, 159, 150, 142, 134, 126, 119, 113],
  // Tuning 2
  [3376,3184,3008,2836,2680,2528,2388,2252,2128,2008,1896,1788,
   1688,1592,1504,1418,1340,1264,1194,1126,1064,1004, 948, 894,
    844, 796, 752, 709, 670, 632, 597, 563, 532, 502, 474, 447,
    422, 398, 376, 355, 335, 316, 298, 282, 266, 251, 237, 224,
    211, 199, 188, 177, 167, 158, 149, 141, 133, 125, 118, 112],
  // Tuning 3
  [3352,3164,2984,2816,2660,2512,2368,2236,2112,1992,1880,1776,
   1676,1582,1492,1408,1330,1256,1184,1118,1056, 996, 940, 888,
    838, 791, 746, 704, 665, 628, 592, 559, 528, 498, 470, 444,
    419, 395, 373, 352, 332, 314, 296, 280, 264, 249, 235, 222,
    209, 198, 187, 176, 166, 157, 148, 140, 132, 125, 118, 111],
  // Tuning 4
  [3328,3140,2964,2796,2640,2492,2352,2220,2096,1980,1868,1764,
   1664,1570,1482,1398,1320,1246,1176,1110,1048, 990, 934, 882,
    832, 785, 741, 699, 660, 623, 588, 555, 524, 495, 467, 441,
    416, 392, 370, 350, 330, 312, 294, 278, 262, 247, 233, 220,
    208, 196, 185, 175, 165, 156, 147, 139, 131, 124, 117, 110],
  // Tuning 5
  [3304,3116,2944,2776,2620,2476,2336,2204,2080,1964,1852,1748,
   1652,1558,1472,1388,1310,1238,1168,1102,1040, 982, 926, 874,
    826, 779, 736, 694, 655, 619, 584, 551, 520, 491, 463, 437,
    413, 390, 368, 347, 328, 309, 292, 276, 260, 245, 232, 219,
    206, 195, 184, 174, 164, 155, 146, 138, 130, 123, 116, 109],
  // Tuning 6
  [3280,3096,2920,2756,2604,2456,2320,2188,2064,1948,1840,1736,
   1640,1548,1460,1378,1302,1228,1160,1094,1032, 974, 920, 868,
    820, 774, 730, 689, 651, 614, 580, 547, 516, 487, 460, 434,
    410, 387, 365, 345, 325, 307, 290, 274, 258, 244, 230, 217,
    205, 193, 183, 172, 163, 154, 145, 137, 129, 122, 115, 109],
  // Tuning 7
  [3256,3072,2900,2736,2584,2440,2300,2172,2052,1936,1828,1724,
   1628,1536,1450,1368,1292,1220,1150,1086,1026, 968, 914, 862,
    814, 768, 725, 684, 646, 610, 575, 543, 513, 484, 457, 431,
    407, 384, 363, 342, 323, 305, 288, 272, 256, 242, 228, 216,
    204, 192, 181, 171, 161, 152, 144, 136, 128, 121, 114, 108],
  // Tuning -8
  [3628,3424,3232,3048,2880,2712,2560,2416,2280,2152,2032,1920,
   1814,1712,1616,1524,1440,1356,1280,1208,1140,1076,1016, 960,
    907, 856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480,
    453, 428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240,
    226, 214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120],
  // Tuning -7
  [3600,3400,3208,3028,2860,2700,2544,2404,2268,2140,2020,1908,
   1800,1700,1604,1514,1430,1350,1272,1202,1134,1070,1010, 954,
    900, 850, 802, 757, 715, 675, 636, 601, 567, 535, 505, 477,
    450, 425, 401, 379, 357, 337, 318, 300, 284, 268, 253, 238,
    225, 212, 200, 189, 179, 169, 159, 150, 142, 134, 126, 119],
  // Tuning -6
  [3576,3376,3184,3008,2836,2680,2528,2388,2252,2128,2008,1896,
   1788,1688,1592,1504,1418,1340,1264,1194,1126,1064,1004, 948,
    894, 844, 796, 752, 709, 670, 632, 597, 563, 532, 502, 474,
    447, 422, 398, 376, 355, 335, 316, 298, 282, 266, 251, 237,
    223, 211, 199, 188, 177, 167, 158, 149, 141, 133, 125, 118],
  // Tuning -5
  [3548,3352,3164,2984,2816,2660,2512,2368,2236,2112,1992,1880,
   1774,1676,1582,1492,1408,1330,1256,1184,1118,1056, 996, 940,
    887, 838, 791, 746, 704, 665, 628, 592, 559, 528, 498, 470,
    444, 419, 395, 373, 352, 332, 314, 296, 280, 264, 249, 235,
    222, 209, 198, 187, 176, 166, 157, 148, 140, 132, 125, 118],
  // Tuning -4
  [3524,3328,3140,2964,2796,2640,2492,2352,2220,2096,1976,1868,
   1762,1664,1570,1482,1398,1320,1246,1176,1110,1048, 988, 934,
    881, 832, 785, 741, 699, 660, 623, 588, 555, 524, 494, 467,
    441, 416, 392, 370, 350, 330, 312, 294, 278, 262, 247, 233,
    220, 208, 196, 185, 175, 165, 156, 147, 139, 131, 123, 117],
  // Tuning -3
  [3500,3304,3116,2944,2776,2620,2476,2336,2204,2080,1964,1852,
   1750,1652,1558,1472,1388,1310,1238,1168,1102,1040, 982, 926,
    875, 826, 779, 736, 694, 655, 619, 584, 551, 520, 491, 463,
    437, 413, 390, 368, 347, 328, 309, 292, 276, 260, 245, 232,
    219, 206, 195, 184, 174, 164, 155, 146, 138, 130, 123, 116],
  // Tuning -2
  [3472,3280,3096,2920,2756,2604,2456,2320,2188,2064,1948,1840,
   1736,1640,1548,1460,1378,1302,1228,1160,1094,1032, 974, 920,
    868, 820, 774, 730, 689, 651, 614, 580, 547, 516, 487, 460,
    434, 410, 387, 365, 345, 325, 307, 290, 274, 258, 244, 230,
    217, 205, 193, 183, 172, 163, 154, 145, 137, 129, 122, 115],
  // Tuning -1
  [3448,3256,3072,2900,2736,2584,2440,2300,2172,2052,1936,1828,
   1724,1628,1536,1450,1368,1292,1220,1150,1086,1026, 968, 914,
    862, 814, 768, 725, 684, 646, 610, 575, 543, 513, 484, 457,
    431, 407, 384, 363, 342, 323, 305, 288, 272, 256, 242, 228,
    216, 203, 192, 181, 171, 161, 152, 144, 136, 128, 121, 114],
];

/**
 * The reference note in AON is note index 25 (0-based in period table row),
 * which is C-2 in octave-2 (period 856 for tuning 0).
 * This corresponds to XM note 37 (C-3 in XM's 1-based 5-octave scheme).
 * AON notes are 1-based in pattern data (0 = no note).
 */
const AON_REFERENCE_NOTE_IDX = 24; // 0-based index in period table → period 856
const AON_REFERENCE_XM_NOTE  = 37; // XM C-3

// ── Utility ────────────────────────────────────────────────────────────────

function u32BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}

function s8(v: number): number {
  return v < 128 ? v : v - 256;
}

/** Read a 4-character ASCII mark (chunk ID) at offset */
function readMark(buf: Uint8Array, off: number): string {
  return String.fromCharCode(buf[off], buf[off + 1], buf[off + 2], buf[off + 3]);
}

/** Read a null-terminated string of up to maxLen bytes from buf */
function readString(buf: Uint8Array, off: number, maxLen: number): string {
  let end = off;
  while (end < off + maxLen && buf[end] !== 0) end++;
  // Strip non-printable characters (Amiga encoding quirks)
  let result = '';
  for (let i = off; i < end; i++) {
    const c = buf[i];
    result += c >= 32 ? String.fromCharCode(c) : '';
  }
  return result;
}

/**
 * Convert AON note index (1-based, 1-60) and instrument fineTune to XM note number.
 * AON period table: row = fineTune (0-15, maps to Tables.Periods rows 0-15 in C#).
 * The C# NostalgicPlayer index mapping: fineTune 0-7 → rows 0-7; fineTune 8-15 → rows 8-15.
 * We look up the period, then find the closest period in the standard Amiga table to
 * get an XM note number, or use direct index arithmetic since AON periods map
 * cleanly to 5 octaves of 12 semitones.
 *
 * AON note 1 = period table index 0 (highest period = lowest pitch).
 * AON note 25 = period 856 (C-2 ProTracker) = XM note 37 (C-3).
 * AON note index 0-based: i → XM note = AON_REFERENCE_XM_NOTE + (i - AON_REFERENCE_NOTE_IDX)
 */
function aonNoteToXM(aonNote: number, _fineTune: number): number {
  if (aonNote === 0) return 0;
  const idx = aonNote - 1; // 0-based
  // Direct semitone mapping: AON has 5 octaves × 12 semitones = 60 notes
  // AON idx 24 → period 856 → XM C-3 = note 37
  const xmNote = AON_REFERENCE_XM_NOTE + (idx - AON_REFERENCE_NOTE_IDX);
  return Math.max(1, Math.min(96, xmNote));
}

/**
 * Get the sample rate for an AON note using the period table.
 * Used to determine the base sample rate for instrument creation.
 */
function aonPeriodToRate(period: number): number {
  return Math.round(PAL_CLOCK / (2 * period));
}

// ── Format Identification ──────────────────────────────────────────────────

/**
 * Returns true if `bytes` is an Art of Noise module (AON4 or AON8).
 * Magic: bytes 0-3 = "AON4" or "AON8". Minimum size: 54 bytes (header + first chunk header).
 */
export function isArtOfNoiseFormat(bytes: Uint8Array): boolean {
  if (bytes.length < 54) return false;
  const mark = readMark(bytes, 0);
  return mark === 'AON4' || mark === 'AON8';
}

// ── Internal types ─────────────────────────────────────────────────────────

interface AonSampleInstrument {
  type: 'sample';
  name: string;
  volume: number;
  fineTune: number;
  waveForm: number;      // which waveform (index into waveForms array)
  startOffset: number;   // in words (multiply × 2 for bytes)
  length: number;        // in words
  loopStart: number;     // in words
  loopLength: number;    // in words
  envelopeStart: number;
  envelopeAdd: number;
  envelopeEnd: number;
  envelopeSub: number;
  instrBase?: number;    // file offset of this 32-byte entry in the INST chunk
}

interface AonSynthInstrument {
  type: 'synth';
  name: string;
  volume: number;
  fineTune: number;
  waveForm: number;
  length: number;
  vibParam: number;
  vibDelay: number;
  vibWave: number;
  waveSpeed: number;
  waveLength: number;
  waveLoopStart: number;
  waveLoopLength: number;
  waveLoopControl: number;
  envelopeStart: number;
  envelopeAdd: number;
  envelopeEnd: number;
  envelopeSub: number;
  instrBase?: number;    // file offset of this 32-byte entry in the INST chunk
}

type AonInstrument = AonSampleInstrument | AonSynthInstrument;

interface AonTrackLine {
  note: number;       // 0 = no note, 1-60 = note
  instrument: number; // 0-based
  arpeggio: number;   // 4-bit arpeggio index
  effect: number;     // Effect enum value (0-33)
  effectArg: number;
}

interface AonPattern {
  rows: AonTrackLine[][];  // [row][channel]
}

// ── Main Parser ────────────────────────────────────────────────────────────

/**
 * Parse an Art of Noise (.aon / .aon8) module file and return a TrackerSong.
 * Returns null if the file cannot be parsed.
 */
export function parseArtOfNoiseFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  if (!isArtOfNoiseFormat(bytes)) return null;

  const mark = readMark(bytes, 0);
  const numberOfChannels = mark === 'AON8' ? 8 : 4;

  // ── Parse chunks starting at offset 46 ────────────────────────────────
  let off = 46;

  let songName = '';
  let numberOfPositions = 0;
  let restartPosition = 0;
  let arpeggios: number[][] | null = null;
  let positionList: number[] | null = null;
  let patterns: AonPattern[] | null = null;
  let instruments: AonInstrument[] | null = null;
  let waveForms: Int8Array[] | null = null;

  while (off + 8 <= bytes.length) {
    const chunkName = readMark(bytes, off);
    const chunkSize = u32BE(bytes, off + 4);
    off += 8;

    if (off > bytes.length) break;

    const chunkEnd = off + chunkSize;
    if (chunkEnd > bytes.length) {
      // Truncated chunk — stop parsing
      break;
    }

    switch (chunkName) {
      case 'NAME': {
        songName = readString(bytes, off, chunkSize);
        break;
      }

      case 'AUTH': {
        // Author string — not used in TrackerSong output
        break;
      }

      case 'RMRK': {
        // Comments — ignore for TrackerSong
        break;
      }

      case 'INFO': {
        if (chunkSize < 3) break;
        // version(1) + numberOfPositions(1) + restartPosition(1) + rest ignored
        numberOfPositions = bytes[off + 1];
        restartPosition = bytes[off + 2];
        if (restartPosition >= numberOfPositions) restartPosition = 0;
        break;
      }

      case 'ARPG': {
        // 16 arpeggios × 4 bytes each
        arpeggios = [];
        for (let i = 0; i < 16; i++) {
          const arp: number[] = [];
          for (let j = 0; j < 4; j++) {
            arp.push(bytes[off + i * 4 + j]);
          }
          arpeggios.push(arp);
        }
        break;
      }

      case 'PLST': {
        positionList = [];
        for (let i = 0; i < chunkSize; i++) {
          positionList.push(bytes[off + i]);
        }
        break;
      }

      case 'PATT': {
        // numPatterns × 64rows × numChannels × 4 bytes
        const numPatterns = Math.floor(chunkSize / (4 * numberOfChannels * 64));
        patterns = [];
        let pOff = off;
        for (let p = 0; p < numPatterns; p++) {
          const rowsData: AonTrackLine[][] = [];
          for (let r = 0; r < 64; r++) {
            const row: AonTrackLine[] = [];
            for (let c = 0; c < numberOfChannels; c++) {
              const b1 = bytes[pOff];
              const b2 = bytes[pOff + 1];
              const b3 = bytes[pOff + 2];
              const b4 = bytes[pOff + 3];
              pOff += 4;
              row.push({
                instrument: b2 & 0x3f,
                note:       b1 & 0x3f,
                arpeggio:   ((b3 & 0xc0) >> 4) | ((b2 & 0xc0) >> 6),
                effect:     b3 & 0x3f,
                effectArg:  b4,
              });
            }
            rowsData.push(row);
          }
          patterns.push({ rows: rowsData });
        }
        break;
      }

      case 'INST': {
        // numInstruments × 32 bytes each
        const numInstruments = Math.floor(chunkSize / 32);
        instruments = [];
        let iOff = off;
        for (let i = 0; i < numInstruments; i++) {
          const type    = bytes[iOff];
          const volume  = bytes[iOff + 1];
          const fineTune = bytes[iOff + 2];
          const waveForm = bytes[iOff + 3];
          iOff += 4;

          let instr: AonInstrument;

          if (type === 0) {
            // Sample instrument
            const startOffset = u32BE(bytes, iOff);
            const length      = u32BE(bytes, iOff + 4);
            const loopStart   = u32BE(bytes, iOff + 8);
            const loopLength  = u32BE(bytes, iOff + 12);
            iOff += 20; // 4×4 + 4 pad bytes
            // 4 shared envelope bytes come after the type-specific section
            const envelopeStart = bytes[iOff];
            const envelopeAdd   = bytes[iOff + 1];
            const envelopeEnd   = bytes[iOff + 2];
            const envelopeSub   = bytes[iOff + 3];
            iOff += 4;
            // skip remaining to reach the 32-byte boundary
            // We already consumed: 4 (common) + 20 (sample-specific) + 4 (envelope) = 28 bytes
            // Remaining: 32 - 28 = 4 bytes of padding are already consumed in the iOff += 20 step
            // Wait — NostalgicPlayer reads: type(1)+vol(1)+ft(1)+wf(1) + startOff(4)+len(4)+loopStart(4)+loopLen(4) + seek(8) + envelope(4)
            // = 4 + 16 + 8 + 4 = 32 bytes. So the seek(8) is BEFORE the envelope.
            // Let's rewind the envelope read — we need to reparse correctly.
            // We will fix: after reading the 4 type-specific words, seek 8, then read 4 envelope bytes.
            // But we already consumed iOff += 20 (= 4×4 + 4 padding words = 20).
            // Actually 4×4=16 bytes for the 4 fields + seek(8) should skip 8 bytes.
            // But we consumed iOff += 20 which is 16+4. Let me redo:
            // (Reset: this code path is wrong — see rewrite below after this block.)
            instr = {
              type: 'sample',
              name: '',
              volume, fineTune, waveForm,
              startOffset, length, loopStart, loopLength,
              envelopeStart, envelopeAdd, envelopeEnd, envelopeSub,
            };
          } else if (type === 1) {
            // Synth instrument
            // Per C#: length(1) + seek(5) + vibParam(1)+vibDelay(1)+vibWave(1)+waveSpeed(1)+
            //         waveLength(1)+waveLoopStart(1)+waveLoopLength(1)+waveLoopControl(1)+seek(10)
            // = 1 + 5 + 8 + 10 = 24 bytes of type-specific data
            const synthLength     = bytes[iOff];
            iOff += 1;
            iOff += 5; // 5 padding bytes
            const vibParam        = bytes[iOff];
            const vibDelay        = bytes[iOff + 1];
            const vibWave         = bytes[iOff + 2];
            const waveSpeed       = bytes[iOff + 3];
            const waveLength      = bytes[iOff + 4];
            const waveLoopStart   = bytes[iOff + 5];
            const waveLoopLength  = bytes[iOff + 6];
            const waveLoopControl = bytes[iOff + 7];
            iOff += 8;
            iOff += 10; // 10 padding bytes
            // Now envelope (4 bytes)
            const envelopeStart = bytes[iOff];
            const envelopeAdd   = bytes[iOff + 1];
            const envelopeEnd   = bytes[iOff + 2];
            const envelopeSub   = bytes[iOff + 3];
            iOff += 4;
            instr = {
              type: 'synth',
              name: '',
              volume, fineTune, waveForm,
              length: synthLength,
              vibParam, vibDelay, vibWave,
              waveSpeed, waveLength, waveLoopStart, waveLoopLength, waveLoopControl,
              envelopeStart, envelopeAdd, envelopeEnd, envelopeSub,
            };
          } else {
            // Unknown type — skip to next instrument boundary
            iOff += 28; // 32 - 4 already consumed
            continue;
          }
          instruments.push(instr);
        }
        // Fix up instrument parsing: NostalgicPlayer for sample type does:
        //   startOffset(4) + length(4) + loopStart(4) + loopLength(4) + seek(8) + then falls through to envelope
        // The seek(8) skips 8 bytes after the 4 uint32 fields.
        // But in the sample branch above we did iOff += 20 (= 16 data + 4 extra) then read 4 envelope.
        // That means we consumed 4+20+4 = 28 bytes. Missing: 32-4-28 = 0 bytes. Wait, 4 common + 28 = 32. OK.
        // Actually: 4(common) + 4×4(data)=16 + 8(seek) + 4(envelope) = 32. We consumed 4+20+4 = 28.
        // The 20 covers: 4×4 bytes (16) + 4 (NOT 8 for seek). We're 4 bytes short.
        // We must re-examine: iOff += 20 should be iOff += 24 (16 data + 8 seek), then +4 envelope = 28+4=32. Let me fix below.
        break;
      }

      case 'INAM': {
        // Instrument names — 32 bytes each
        if (instruments) {
          let nOff = off;
          for (let i = 0; i < instruments.length && nOff + 32 <= chunkEnd; i++) {
            instruments[i].name = readString(bytes, nOff, 32);
            nOff += 32;
          }
        }
        break;
      }

      case 'WLEN': {
        // numWaveforms × uint32 BE = waveform lengths in bytes
        const numWaveforms = Math.floor(chunkSize / 4);
        waveForms = [];
        let wOff = off;
        for (let i = 0; i < numWaveforms; i++) {
          const len = u32BE(bytes, wOff);
          wOff += 4;
          waveForms.push(len > 0 ? new Int8Array(len) : new Int8Array(0));
        }
        break;
      }

      case 'WAVE': {
        // Raw waveform data (8-bit signed), sequentially for all waveforms
        if (waveForms) {
          let wOff = off;
          for (let i = 0; i < waveForms.length; i++) {
            const w = waveForms[i];
            if (w.length > 0) {
              for (let j = 0; j < w.length && wOff < chunkEnd; j++) {
                w[j] = s8(bytes[wOff++]);
              }
            }
          }
        }
        break;
      }

      default:
        break;
    }

    off = chunkEnd;
  }

  // ── Validate required chunks ──────────────────────────────────────────
  if (numberOfPositions === 0 || !arpeggios || !positionList || !patterns || !instruments || !waveForms) {
    return null;
  }

  // ── Re-parse instruments with correct offset arithmetic ────────────────
  // The inline parsing above had a bug in the sample branch (seek offset).
  // Redo instrument parsing from raw bytes using the correct C# layout.
  const correctedInstruments = reparseinstruments(bytes, instruments.length, numberOfChannels, positionList, patterns);

  const finalInstruments = correctedInstruments !== null ? correctedInstruments : instruments;

  // ── Build InstrumentConfig[] ──────────────────────────────────────────
  const instrumentConfigs: InstrumentConfig[] = [];

  for (let i = 0; i < finalInstruments.length; i++) {
    const instr = finalInstruments[i];
    const id = i + 1; // 1-based
    const instrBase = instr.instrBase ?? 0;
    const chipRam: UADEChipRamInfo = {
      moduleBase: 0,
      moduleSize: bytes.length,
      instrBase,
      instrSize: 32,
      sections: { instTable: instrBase - i * 32 },
    };

    if (instr.type === 'sample' && waveForms) {
      const si = instr as AonSampleInstrument;
      const wfIdx = si.waveForm;
      const wf = wfIdx < waveForms.length ? waveForms[wfIdx] : null;

      if (wf && wf.length > 0 && si.length > 0) {
        // Sample data: si.startOffset and si.length are in words → multiply by 2 for bytes
        const byteStart  = si.startOffset * 2;
        const byteLength = si.length * 2;
        const byteLoopStart  = si.loopStart * 2;
        const byteLoopLength = si.loopLength * 2;

        const endByte = Math.min(byteStart + byteLength, wf.length);
        const pcmLen  = Math.max(0, endByte - byteStart);
        const pcm = new Uint8Array(pcmLen);
        for (let j = 0; j < pcmLen; j++) {
          pcm[j] = (j + byteStart < wf.length ? wf[j + byteStart] : 0) & 0xff;
        }

        // Determine base sample rate using reference note period (tuning 0, note 25 = period 856)
        const ftRow = si.fineTune < 16 ? si.fineTune : 0;
        const refPeriod = AON_PERIODS[ftRow][AON_REFERENCE_NOTE_IDX]; // period 856 for tuning 0
        const sampleRate = aonPeriodToRate(refPeriod);

        const hasLoop = byteLoopLength > 1;
        const loopStart = hasLoop ? byteLoopStart : 0;
        const loopEnd   = hasLoop ? byteLoopStart + byteLoopLength : 0;

        instrumentConfigs.push({
          ...createSamplerInstrument(id, instr.name || `Sample ${i}`, pcm, si.volume, sampleRate, loopStart, loopEnd),
          uadeChipRam: chipRam,
        });
      } else {
        instrumentConfigs.push({ ...makeSynthPlaceholder(id, instr.name || `Instrument ${i}`), uadeChipRam: chipRam });
      }
    } else if (instr.type === 'synth' && waveForms) {
      const si = instr as AonSynthInstrument;
      const wfIdx = si.waveForm;
      const wf = wfIdx < waveForms.length ? waveForms[wfIdx] : null;

      if (wf && wf.length > 0) {
        // Synth: loop the waveform. Length is in words → bytes.
        const byteLength = si.length * 2;
        const playLen = Math.max(1, Math.min(byteLength, wf.length));
        const pcm = new Uint8Array(playLen);
        for (let j = 0; j < playLen; j++) {
          pcm[j] = wf[j % wf.length] & 0xff;
        }

        const ftRow = si.fineTune < 16 ? si.fineTune : 0;
        const refPeriod = AON_PERIODS[ftRow][AON_REFERENCE_NOTE_IDX];
        const sampleRate = aonPeriodToRate(refPeriod);

        instrumentConfigs.push({
          ...createSamplerInstrument(id, instr.name || `Synth ${i}`, pcm, si.volume, sampleRate, 0, playLen),
          uadeChipRam: chipRam,
        });
      } else {
        instrumentConfigs.push({ ...makeSynthPlaceholder(id, instr.name || `Instrument ${i}`), uadeChipRam: chipRam });
      }
    } else {
      instrumentConfigs.push({ ...makeSynthPlaceholder(id, instr.name || `Instrument ${i}`), uadeChipRam: chipRam });
    }
  }

  // ── Build TrackerSong patterns ────────────────────────────────────────
  // AON uses position list: each position entry is a pattern index.
  // All channels play the same pattern simultaneously (4-voice or 8-voice).
  const trackerPatterns: Pattern[] = [];

  for (let pos = 0; pos < numberOfPositions; pos++) {
    const patIdx = positionList[pos];
    const pat = patIdx < patterns.length ? patterns[patIdx] : null;

    const channelRows: TrackerCell[][] = Array.from({ length: numberOfChannels }, () => []);

    for (let r = 0; r < 64; r++) {
      for (let c = 0; c < numberOfChannels; c++) {
        const line = pat ? pat.rows[r][c] : null;

        if (!line) {
          channelRows[c].push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          continue;
        }

        const instrId = line.instrument > 0 ? line.instrument : 0;
        const fineTune = instrId > 0 && instrId - 1 < finalInstruments.length
          ? finalInstruments[instrId - 1].fineTune
          : 0;
        const xmNote = aonNoteToXM(line.note, fineTune);

        // Map AON effects to XM effects
        let effTyp = 0, eff = 0;
        const arg = line.effectArg;
        switch (line.effect) {
          case 0:  break;                              // Arpeggio (handled inline by player)
          case 1:  effTyp = 0x01; eff = arg; break;   // SlideUp → portamento up
          case 2:  effTyp = 0x02; eff = arg; break;   // SlideDown → portamento down
          case 3:  effTyp = 0x03; eff = arg; break;   // TonePortamento
          case 4:  effTyp = 0x04; eff = arg; break;   // Vibrato
          case 5:  effTyp = 0x05; eff = arg; break;   // TonePortamento+VolumeSlide
          case 6:  effTyp = 0x06; eff = arg; break;   // Vibrato+VolumeSlide
          case 9:  effTyp = 0x09; eff = arg; break;   // SetSampleOffset
          case 10: effTyp = 0x0A; eff = arg; break;   // VolumeSlide
          case 11: effTyp = 0x0B; eff = arg; break;   // PositionJump
          case 12: effTyp = 0x0C; eff = Math.min(64, arg); break; // SetVolume
          case 13: effTyp = 0x0D; eff = arg; break;   // PatternBreak
          case 14: effTyp = 0x0E; eff = arg; break;   // ExtraEffects
          case 15: effTyp = 0x0F; eff = arg; break;   // SetSpeed
          default: break;
        }

        channelRows[c].push({
          note:       xmNote,
          instrument: instrId,
          volume:     0,
          effTyp,
          eff,
          effTyp2: 0,
          eff2:    0,
        });
      }
    }

    trackerPatterns.push({
      id:     `pattern-${pos}`,
      name:   `Position ${pos}`,
      length: 64,
      channels: channelRows.map((rows, ch) => ({
        id:          `channel-${ch}`,
        name:        `Channel ${ch + 1}`,
        muted:       false,
        solo:        false,
        collapsed:   false,
        volume:      100,
        // AON4: LRRL hard stereo. AON8: LLRR RRLL
        pan: numberOfChannels === 8
          ? ([  -50, -50, 50, 50, 50, 50, -50, -50 ][ch] ?? 0)
          : ([ -50, 50, 50, -50 ][ch] ?? 0),
        instrumentId: null,
        color:        null,
        rows,
      })),
      importMetadata: {
        sourceFormat: 'AON',
        sourceFile:   filename,
        importedAt:   new Date().toISOString(),
        originalChannelCount:    numberOfChannels,
        originalPatternCount:    patterns.length,
        originalInstrumentCount: finalInstruments.length,
      },
    });
  }

  // Ensure at least one pattern
  if (trackerPatterns.length === 0) {
    trackerPatterns.push(makeEmptyPattern(filename, numberOfChannels, finalInstruments.length));
  }

  const moduleName = (songName || filename).replace(/\.[^/.]+$/, '');

  return {
    name:             moduleName,
    format:           'AON' as TrackerFormat,
    patterns:         trackerPatterns,
    instruments:      instrumentConfigs,
    songPositions:    trackerPatterns.map((_, i) => i),
    songLength:       trackerPatterns.length,
    restartPosition:  restartPosition,
    numChannels:      numberOfChannels,
    initialSpeed:     6,
    initialBPM:       125,
    linearPeriods:    false,
  };
}

// ── Helper: re-parse instruments with correct byte layout ─────────────────

/**
 * Re-parse instrument data from the INST chunk using the correct NostalgicPlayer layout.
 *
 * The inline parsing inside the switch-case above had a byte-count error in the
 * sample branch. This function finds the INST chunk again and parses it correctly.
 *
 * NostalgicPlayer layout per instrument (32 bytes total):
 *   Common header (4 bytes): type(1) + volume(1) + fineTune(1) + waveForm(1)
 *
 *   If type == 0 (Sample, 24 bytes):
 *     startOffset(4) + length(4) + loopStart(4) + loopLength(4) = 16 bytes
 *     seek(8) bytes = 8 bytes
 *     Total: 24 bytes
 *
 *   If type == 1 (Synth, 24 bytes):
 *     length(1) + seek(5) + vibParam(1)+vibDelay(1)+vibWave(1)+waveSpeed(1)+
 *     waveLength(1)+waveLoopStart(1)+waveLoopLength(1)+waveLoopControl(1) = 14 bytes
 *     seek(10) = 10 bytes
 *     Total: 24 bytes
 *
 *   Envelope (4 bytes): envelopeStart(1)+envelopeAdd(1)+envelopeEnd(1)+envelopeSub(1)
 *
 *   Grand total: 4 + 24 + 4 = 32 bytes ✓
 */
function reparseinstruments(
  bytes: Uint8Array,
  expectedCount: number,
  _numberOfChannels: number,
  _positionList: number[],
  _patterns: AonPattern[]
): AonInstrument[] | null {
  // Find INST chunk
  let off = 46;
  while (off + 8 <= bytes.length) {
    const chunkName = readMark(bytes, off);
    const chunkSize = u32BE(bytes, off + 4);
    off += 8;
    if (off + chunkSize > bytes.length) break;

    if (chunkName === 'INST') {
      const numInstruments = Math.min(expectedCount, Math.floor(chunkSize / 32));
      const result: AonInstrument[] = [];
      let iOff = off;

      for (let i = 0; i < numInstruments; i++) {
        const instrStart = iOff;
        const type     = bytes[iOff];
        const volume   = bytes[iOff + 1];
        const fineTune = bytes[iOff + 2];
        const waveForm = bytes[iOff + 3];
        iOff += 4;

        let instr: AonInstrument | null = null;

        if (type === 0) {
          // Sample: 16 data bytes + 8 skip = 24 bytes
          const startOffset = u32BE(bytes, iOff);
          const length      = u32BE(bytes, iOff + 4);
          const loopStart   = u32BE(bytes, iOff + 8);
          const loopLength  = u32BE(bytes, iOff + 12);
          iOff += 16;
          iOff += 8;  // skip 8 bytes
          const envelopeStart = bytes[iOff];
          const envelopeAdd   = bytes[iOff + 1];
          const envelopeEnd   = bytes[iOff + 2];
          const envelopeSub   = bytes[iOff + 3];
          iOff += 4;
          instr = {
            type: 'sample', name: '', volume, fineTune, waveForm,
            startOffset, length, loopStart, loopLength,
            envelopeStart, envelopeAdd, envelopeEnd, envelopeSub,
            instrBase: instrStart,
          };
        } else if (type === 1) {
          // Synth: 14 data bytes + 10 skip = 24 bytes
          const synthLength     = bytes[iOff]; iOff += 1;
          iOff += 5; // skip 5 bytes
          const vibParam        = bytes[iOff];
          const vibDelay        = bytes[iOff + 1];
          const vibWave         = bytes[iOff + 2];
          const waveSpeed       = bytes[iOff + 3];
          const waveLength      = bytes[iOff + 4];
          const waveLoopStart   = bytes[iOff + 5];
          const waveLoopLength  = bytes[iOff + 6];
          const waveLoopControl = bytes[iOff + 7];
          iOff += 8;
          iOff += 10; // skip 10 bytes
          const envelopeStart = bytes[iOff];
          const envelopeAdd   = bytes[iOff + 1];
          const envelopeEnd   = bytes[iOff + 2];
          const envelopeSub   = bytes[iOff + 3];
          iOff += 4;
          instr = {
            type: 'synth', name: '', volume, fineTune, waveForm,
            length: synthLength, vibParam, vibDelay, vibWave,
            waveSpeed, waveLength, waveLoopStart, waveLoopLength, waveLoopControl,
            envelopeStart, envelopeAdd, envelopeEnd, envelopeSub,
            instrBase: instrStart,
          };
        }

        // Guard: ensure we consumed exactly 32 bytes
        const consumed = iOff - instrStart;
        if (consumed !== 32) {
          // Realign to instrument boundary
          iOff = instrStart + 32;
        }

        if (instr) result.push(instr);
      }

      // Now scan for INAM chunk to fill names
      let nOff2 = 46;
      while (nOff2 + 8 <= bytes.length) {
        const n = readMark(bytes, nOff2);
        const ns = u32BE(bytes, nOff2 + 4);
        nOff2 += 8;
        if (n === 'INAM') {
          for (let i = 0; i < result.length && nOff2 + 32 <= nOff2 + ns; i++) {
            result[i].name = readString(bytes, nOff2 + i * 32, 32);
          }
          break;
        }
        nOff2 += ns;
        if (nOff2 > bytes.length) break;
      }

      return result;
    }

    off += chunkSize;
  }
  return null;
}

// ── Helper: placeholder instrument ────────────────────────────────────────

function makeSynthPlaceholder(id: number, name: string): InstrumentConfig {
  return {
    id,
    name: name.replace(/\0/g, '').trim() || `Instrument ${id}`,
    type: 'synth' as const,
    synthType: 'Synth' as const,
    effects: [],
    volume: 0,
    pan: 0,
  } as InstrumentConfig;
}

function makeEmptyPattern(filename: string, numCh: number, numInstr: number): Pattern {
  return {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: 64,
    channels: Array.from({ length: numCh }, (_, ch) => ({
      id:          `channel-${ch}`,
      name:        `Channel ${ch + 1}`,
      muted:       false,
      solo:        false,
      collapsed:   false,
      volume:      100,
      pan:         numCh === 8
        ? ([  -50, -50, 50, 50, 50, 50, -50, -50 ][ch] ?? 0)
        : ([ -50, 50, 50, -50 ][ch] ?? 0),
      instrumentId: null,
      color:        null,
      rows: Array.from({ length: 64 }, () => ({
        note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      })),
    })),
    importMetadata: {
      sourceFormat: 'AON',
      sourceFile:   filename,
      importedAt:   new Date().toISOString(),
      originalChannelCount:    numCh,
      originalPatternCount:    0,
      originalInstrumentCount: numInstr,
    },
  };
}
