import { b$ as registerPatternEncoder, c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function reverseEffect(effTyp, eff) {
  if (effTyp === 0 && eff === 0) return { effect: 0, effectArg: 0 };
  switch (effTyp) {
    case 1:
      return { effect: 1, effectArg: eff };
    case 2:
      return { effect: 2, effectArg: eff };
    case 3:
      return { effect: 3, effectArg: eff };
    case 4:
      return { effect: 4, effectArg: eff };
    case 5:
      return { effect: 5, effectArg: eff };
    case 6:
      return { effect: 6, effectArg: eff };
    case 9:
      return { effect: 9, effectArg: eff };
    case 10:
      return { effect: 10, effectArg: eff };
    case 11:
      return { effect: 11, effectArg: eff };
    case 12:
      return { effect: 12, effectArg: eff };
    case 13:
      return { effect: 13, effectArg: eff };
    case 14:
      return { effect: 14, effectArg: eff };
    case 15:
      return { effect: 15, effectArg: eff };
    default:
      return { effect: 0, effectArg: 0 };
  }
}
function encodeAONCell(cell) {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;
  if (note > 0) {
    const aonNote = note - 12;
    out[0] = Math.max(0, Math.min(63, aonNote)) & 63;
  }
  out[1] = (cell.instrument ?? 0) & 63;
  const { effect, effectArg } = reverseEffect(cell.effTyp ?? 0, cell.eff ?? 0);
  out[2] = effect & 63;
  out[3] = effectArg & 255;
  return out;
}
registerPatternEncoder("aon", () => encodeAONCell);
const PAL_CLOCK = 3546895;
const AON_PERIODS = [
  // Tuning 0 (normal)
  [
    3434,
    3232,
    3048,
    2880,
    2712,
    2560,
    2416,
    2280,
    2152,
    2032,
    1920,
    1812,
    1712,
    1616,
    1524,
    1440,
    1356,
    1280,
    1208,
    1140,
    1076,
    1016,
    960,
    906,
    856,
    808,
    762,
    720,
    678,
    640,
    604,
    570,
    538,
    508,
    480,
    453,
    428,
    404,
    381,
    360,
    339,
    320,
    302,
    285,
    269,
    254,
    240,
    226,
    214,
    202,
    190,
    180,
    170,
    160,
    151,
    143,
    135,
    127,
    120,
    113
  ],
  // Tuning 1
  [
    3400,
    3208,
    3028,
    2860,
    2696,
    2548,
    2404,
    2268,
    2140,
    2020,
    1908,
    1800,
    1700,
    1604,
    1514,
    1430,
    1348,
    1274,
    1202,
    1134,
    1070,
    1010,
    954,
    900,
    850,
    802,
    757,
    715,
    674,
    637,
    601,
    567,
    535,
    505,
    477,
    450,
    425,
    401,
    379,
    357,
    337,
    318,
    300,
    284,
    268,
    253,
    239,
    225,
    213,
    201,
    189,
    179,
    169,
    159,
    150,
    142,
    134,
    126,
    119,
    113
  ],
  // Tuning 2
  [
    3376,
    3184,
    3008,
    2836,
    2680,
    2528,
    2388,
    2252,
    2128,
    2008,
    1896,
    1788,
    1688,
    1592,
    1504,
    1418,
    1340,
    1264,
    1194,
    1126,
    1064,
    1004,
    948,
    894,
    844,
    796,
    752,
    709,
    670,
    632,
    597,
    563,
    532,
    502,
    474,
    447,
    422,
    398,
    376,
    355,
    335,
    316,
    298,
    282,
    266,
    251,
    237,
    224,
    211,
    199,
    188,
    177,
    167,
    158,
    149,
    141,
    133,
    125,
    118,
    112
  ],
  // Tuning 3
  [
    3352,
    3164,
    2984,
    2816,
    2660,
    2512,
    2368,
    2236,
    2112,
    1992,
    1880,
    1776,
    1676,
    1582,
    1492,
    1408,
    1330,
    1256,
    1184,
    1118,
    1056,
    996,
    940,
    888,
    838,
    791,
    746,
    704,
    665,
    628,
    592,
    559,
    528,
    498,
    470,
    444,
    419,
    395,
    373,
    352,
    332,
    314,
    296,
    280,
    264,
    249,
    235,
    222,
    209,
    198,
    187,
    176,
    166,
    157,
    148,
    140,
    132,
    125,
    118,
    111
  ],
  // Tuning 4
  [
    3328,
    3140,
    2964,
    2796,
    2640,
    2492,
    2352,
    2220,
    2096,
    1980,
    1868,
    1764,
    1664,
    1570,
    1482,
    1398,
    1320,
    1246,
    1176,
    1110,
    1048,
    990,
    934,
    882,
    832,
    785,
    741,
    699,
    660,
    623,
    588,
    555,
    524,
    495,
    467,
    441,
    416,
    392,
    370,
    350,
    330,
    312,
    294,
    278,
    262,
    247,
    233,
    220,
    208,
    196,
    185,
    175,
    165,
    156,
    147,
    139,
    131,
    124,
    117,
    110
  ],
  // Tuning 5
  [
    3304,
    3116,
    2944,
    2776,
    2620,
    2476,
    2336,
    2204,
    2080,
    1964,
    1852,
    1748,
    1652,
    1558,
    1472,
    1388,
    1310,
    1238,
    1168,
    1102,
    1040,
    982,
    926,
    874,
    826,
    779,
    736,
    694,
    655,
    619,
    584,
    551,
    520,
    491,
    463,
    437,
    413,
    390,
    368,
    347,
    328,
    309,
    292,
    276,
    260,
    245,
    232,
    219,
    206,
    195,
    184,
    174,
    164,
    155,
    146,
    138,
    130,
    123,
    116,
    109
  ],
  // Tuning 6
  [
    3280,
    3096,
    2920,
    2756,
    2604,
    2456,
    2320,
    2188,
    2064,
    1948,
    1840,
    1736,
    1640,
    1548,
    1460,
    1378,
    1302,
    1228,
    1160,
    1094,
    1032,
    974,
    920,
    868,
    820,
    774,
    730,
    689,
    651,
    614,
    580,
    547,
    516,
    487,
    460,
    434,
    410,
    387,
    365,
    345,
    325,
    307,
    290,
    274,
    258,
    244,
    230,
    217,
    205,
    193,
    183,
    172,
    163,
    154,
    145,
    137,
    129,
    122,
    115,
    109
  ],
  // Tuning 7
  [
    3256,
    3072,
    2900,
    2736,
    2584,
    2440,
    2300,
    2172,
    2052,
    1936,
    1828,
    1724,
    1628,
    1536,
    1450,
    1368,
    1292,
    1220,
    1150,
    1086,
    1026,
    968,
    914,
    862,
    814,
    768,
    725,
    684,
    646,
    610,
    575,
    543,
    513,
    484,
    457,
    431,
    407,
    384,
    363,
    342,
    323,
    305,
    288,
    272,
    256,
    242,
    228,
    216,
    204,
    192,
    181,
    171,
    161,
    152,
    144,
    136,
    128,
    121,
    114,
    108
  ],
  // Tuning -8
  [
    3628,
    3424,
    3232,
    3048,
    2880,
    2712,
    2560,
    2416,
    2280,
    2152,
    2032,
    1920,
    1814,
    1712,
    1616,
    1524,
    1440,
    1356,
    1280,
    1208,
    1140,
    1076,
    1016,
    960,
    907,
    856,
    808,
    762,
    720,
    678,
    640,
    604,
    570,
    538,
    508,
    480,
    453,
    428,
    404,
    381,
    360,
    339,
    320,
    302,
    285,
    269,
    254,
    240,
    226,
    214,
    202,
    190,
    180,
    170,
    160,
    151,
    143,
    135,
    127,
    120
  ],
  // Tuning -7
  [
    3600,
    3400,
    3208,
    3028,
    2860,
    2700,
    2544,
    2404,
    2268,
    2140,
    2020,
    1908,
    1800,
    1700,
    1604,
    1514,
    1430,
    1350,
    1272,
    1202,
    1134,
    1070,
    1010,
    954,
    900,
    850,
    802,
    757,
    715,
    675,
    636,
    601,
    567,
    535,
    505,
    477,
    450,
    425,
    401,
    379,
    357,
    337,
    318,
    300,
    284,
    268,
    253,
    238,
    225,
    212,
    200,
    189,
    179,
    169,
    159,
    150,
    142,
    134,
    126,
    119
  ],
  // Tuning -6
  [
    3576,
    3376,
    3184,
    3008,
    2836,
    2680,
    2528,
    2388,
    2252,
    2128,
    2008,
    1896,
    1788,
    1688,
    1592,
    1504,
    1418,
    1340,
    1264,
    1194,
    1126,
    1064,
    1004,
    948,
    894,
    844,
    796,
    752,
    709,
    670,
    632,
    597,
    563,
    532,
    502,
    474,
    447,
    422,
    398,
    376,
    355,
    335,
    316,
    298,
    282,
    266,
    251,
    237,
    223,
    211,
    199,
    188,
    177,
    167,
    158,
    149,
    141,
    133,
    125,
    118
  ],
  // Tuning -5
  [
    3548,
    3352,
    3164,
    2984,
    2816,
    2660,
    2512,
    2368,
    2236,
    2112,
    1992,
    1880,
    1774,
    1676,
    1582,
    1492,
    1408,
    1330,
    1256,
    1184,
    1118,
    1056,
    996,
    940,
    887,
    838,
    791,
    746,
    704,
    665,
    628,
    592,
    559,
    528,
    498,
    470,
    444,
    419,
    395,
    373,
    352,
    332,
    314,
    296,
    280,
    264,
    249,
    235,
    222,
    209,
    198,
    187,
    176,
    166,
    157,
    148,
    140,
    132,
    125,
    118
  ],
  // Tuning -4
  [
    3524,
    3328,
    3140,
    2964,
    2796,
    2640,
    2492,
    2352,
    2220,
    2096,
    1976,
    1868,
    1762,
    1664,
    1570,
    1482,
    1398,
    1320,
    1246,
    1176,
    1110,
    1048,
    988,
    934,
    881,
    832,
    785,
    741,
    699,
    660,
    623,
    588,
    555,
    524,
    494,
    467,
    441,
    416,
    392,
    370,
    350,
    330,
    312,
    294,
    278,
    262,
    247,
    233,
    220,
    208,
    196,
    185,
    175,
    165,
    156,
    147,
    139,
    131,
    123,
    117
  ],
  // Tuning -3
  [
    3500,
    3304,
    3116,
    2944,
    2776,
    2620,
    2476,
    2336,
    2204,
    2080,
    1964,
    1852,
    1750,
    1652,
    1558,
    1472,
    1388,
    1310,
    1238,
    1168,
    1102,
    1040,
    982,
    926,
    875,
    826,
    779,
    736,
    694,
    655,
    619,
    584,
    551,
    520,
    491,
    463,
    437,
    413,
    390,
    368,
    347,
    328,
    309,
    292,
    276,
    260,
    245,
    232,
    219,
    206,
    195,
    184,
    174,
    164,
    155,
    146,
    138,
    130,
    123,
    116
  ],
  // Tuning -2
  [
    3472,
    3280,
    3096,
    2920,
    2756,
    2604,
    2456,
    2320,
    2188,
    2064,
    1948,
    1840,
    1736,
    1640,
    1548,
    1460,
    1378,
    1302,
    1228,
    1160,
    1094,
    1032,
    974,
    920,
    868,
    820,
    774,
    730,
    689,
    651,
    614,
    580,
    547,
    516,
    487,
    460,
    434,
    410,
    387,
    365,
    345,
    325,
    307,
    290,
    274,
    258,
    244,
    230,
    217,
    205,
    193,
    183,
    172,
    163,
    154,
    145,
    137,
    129,
    122,
    115
  ],
  // Tuning -1
  [
    3448,
    3256,
    3072,
    2900,
    2736,
    2584,
    2440,
    2300,
    2172,
    2052,
    1936,
    1828,
    1724,
    1628,
    1536,
    1450,
    1368,
    1292,
    1220,
    1150,
    1086,
    1026,
    968,
    914,
    862,
    814,
    768,
    725,
    684,
    646,
    610,
    575,
    543,
    513,
    484,
    457,
    431,
    407,
    384,
    363,
    342,
    323,
    305,
    288,
    272,
    256,
    242,
    228,
    216,
    203,
    192,
    181,
    171,
    161,
    152,
    144,
    136,
    128,
    121,
    114
  ]
];
const AON_REFERENCE_NOTE_IDX = 24;
const AON_REFERENCE_XM_NOTE = 49;
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function s8(v) {
  return v < 128 ? v : v - 256;
}
function readMark(buf, off) {
  return String.fromCharCode(buf[off], buf[off + 1], buf[off + 2], buf[off + 3]);
}
function readString(buf, off, maxLen) {
  let end = off;
  while (end < off + maxLen && buf[end] !== 0) end++;
  let result = "";
  for (let i = off; i < end; i++) {
    const c = buf[i];
    result += c >= 32 ? String.fromCharCode(c) : "";
  }
  return result;
}
function aonNoteToXM(aonNote, _fineTune) {
  if (aonNote === 0) return 0;
  const idx = aonNote - 1;
  const xmNote = AON_REFERENCE_XM_NOTE + (idx - AON_REFERENCE_NOTE_IDX);
  return Math.max(1, Math.min(96, xmNote));
}
function aonPeriodToRate(period) {
  return Math.round(PAL_CLOCK / (2 * period));
}
function isArtOfNoiseFormat(bytes) {
  if (bytes.length < 54) return false;
  const mark = readMark(bytes, 0);
  return mark === "AON4" || mark === "AON8";
}
function parseArtOfNoiseFile(bytes, filename) {
  if (!isArtOfNoiseFormat(bytes)) return null;
  const mark = readMark(bytes, 0);
  const numberOfChannels = mark === "AON8" ? 8 : 4;
  let off = 46;
  let songName = "";
  let numberOfPositions = 0;
  let restartPosition = 0;
  let arpeggios = null;
  let positionList = null;
  let patterns = null;
  let patternChunkOffset = 0;
  let instruments = null;
  let waveForms = null;
  while (off + 8 <= bytes.length) {
    const chunkName = readMark(bytes, off);
    const chunkSize = u32BE(bytes, off + 4);
    off += 8;
    if (off > bytes.length) break;
    const chunkEnd = off + chunkSize;
    if (chunkEnd > bytes.length) {
      break;
    }
    switch (chunkName) {
      case "NAME": {
        songName = readString(bytes, off, chunkSize);
        break;
      }
      case "AUTH": {
        break;
      }
      case "RMRK": {
        break;
      }
      case "INFO": {
        if (chunkSize < 3) break;
        numberOfPositions = bytes[off + 1];
        restartPosition = bytes[off + 2];
        if (restartPosition >= numberOfPositions) restartPosition = 0;
        break;
      }
      case "ARPG": {
        arpeggios = [];
        for (let i = 0; i < 16; i++) {
          const arp = [];
          for (let j = 0; j < 4; j++) {
            arp.push(bytes[off + i * 4 + j]);
          }
          arpeggios.push(arp);
        }
        break;
      }
      case "PLST": {
        positionList = [];
        for (let i = 0; i < chunkSize; i++) {
          positionList.push(bytes[off + i]);
        }
        break;
      }
      case "PATT": {
        const numPatterns = Math.floor(chunkSize / (4 * numberOfChannels * 64));
        patternChunkOffset = off;
        patterns = [];
        let pOff = off;
        for (let p = 0; p < numPatterns; p++) {
          const rowsData = [];
          for (let r = 0; r < 64; r++) {
            const row = [];
            for (let c = 0; c < numberOfChannels; c++) {
              const b1 = bytes[pOff];
              const b2 = bytes[pOff + 1];
              const b3 = bytes[pOff + 2];
              const b4 = bytes[pOff + 3];
              pOff += 4;
              row.push({
                instrument: b2 & 63,
                note: b1 & 63,
                arpeggio: (b3 & 192) >> 4 | (b2 & 192) >> 6,
                effect: b3 & 63,
                effectArg: b4
              });
            }
            rowsData.push(row);
          }
          patterns.push({ rows: rowsData });
        }
        break;
      }
      case "INST": {
        const numInstruments = Math.floor(chunkSize / 32);
        instruments = [];
        let iOff = off;
        for (let i = 0; i < numInstruments; i++) {
          const type = bytes[iOff];
          const volume = bytes[iOff + 1];
          const fineTune = bytes[iOff + 2];
          const waveForm = bytes[iOff + 3];
          iOff += 4;
          let instr;
          if (type === 0) {
            const startOffset = u32BE(bytes, iOff);
            const length = u32BE(bytes, iOff + 4);
            const loopStart = u32BE(bytes, iOff + 8);
            const loopLength = u32BE(bytes, iOff + 12);
            iOff += 20;
            const envelopeStart = bytes[iOff];
            const envelopeAdd = bytes[iOff + 1];
            const envelopeEnd = bytes[iOff + 2];
            const envelopeSub = bytes[iOff + 3];
            iOff += 4;
            instr = {
              type: "sample",
              name: "",
              volume,
              fineTune,
              waveForm,
              startOffset,
              length,
              loopStart,
              loopLength,
              envelopeStart,
              envelopeAdd,
              envelopeEnd,
              envelopeSub
            };
          } else if (type === 1) {
            const synthLength = bytes[iOff];
            iOff += 1;
            iOff += 5;
            const vibParam = bytes[iOff];
            const vibDelay = bytes[iOff + 1];
            const vibWave = bytes[iOff + 2];
            const waveSpeed = bytes[iOff + 3];
            const waveLength = bytes[iOff + 4];
            const waveLoopStart = bytes[iOff + 5];
            const waveLoopLength = bytes[iOff + 6];
            const waveLoopControl = bytes[iOff + 7];
            iOff += 8;
            iOff += 10;
            const envelopeStart = bytes[iOff];
            const envelopeAdd = bytes[iOff + 1];
            const envelopeEnd = bytes[iOff + 2];
            const envelopeSub = bytes[iOff + 3];
            iOff += 4;
            instr = {
              type: "synth",
              name: "",
              volume,
              fineTune,
              waveForm,
              length: synthLength,
              vibParam,
              vibDelay,
              vibWave,
              waveSpeed,
              waveLength,
              waveLoopStart,
              waveLoopLength,
              waveLoopControl,
              envelopeStart,
              envelopeAdd,
              envelopeEnd,
              envelopeSub
            };
          } else {
            iOff += 28;
            continue;
          }
          instruments.push(instr);
        }
        break;
      }
      case "INAM": {
        if (instruments) {
          let nOff = off;
          for (let i = 0; i < instruments.length && nOff + 32 <= chunkEnd; i++) {
            instruments[i].name = readString(bytes, nOff, 32);
            nOff += 32;
          }
        }
        break;
      }
      case "WLEN": {
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
      case "WAVE": {
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
    }
    off = chunkEnd;
  }
  if (numberOfPositions === 0 || !arpeggios || !positionList || !patterns || !instruments || !waveForms) {
    return null;
  }
  const correctedInstruments = reparseinstruments(bytes, instruments.length);
  const finalInstruments = correctedInstruments !== null ? correctedInstruments : instruments;
  const instrumentConfigs = [];
  for (let i = 0; i < finalInstruments.length; i++) {
    const instr = finalInstruments[i];
    const id = i + 1;
    const instrBase = instr.instrBase ?? 0;
    const chipRam = {
      moduleBase: 0,
      moduleSize: bytes.length,
      instrBase,
      instrSize: 32,
      sections: { instTable: instrBase - i * 32 }
    };
    if (instr.type === "sample" && waveForms) {
      const si = instr;
      const wfIdx = si.waveForm;
      const wf = wfIdx < waveForms.length ? waveForms[wfIdx] : null;
      if (wf && wf.length > 0 && si.length > 0 && si.startOffset * 2 < wf.length) {
        const byteStart = si.startOffset * 2;
        const byteLength = si.length * 2;
        const byteLoopStart = si.loopStart * 2;
        const byteLoopLength = si.loopLength * 2;
        const endByte = Math.min(byteStart + byteLength, wf.length);
        const pcmLen = Math.max(0, endByte - byteStart);
        const pcm = new Uint8Array(pcmLen);
        for (let j = 0; j < pcmLen; j++) {
          pcm[j] = (j + byteStart < wf.length ? wf[j + byteStart] : 0) & 255;
        }
        const ftRow = si.fineTune < 16 ? si.fineTune : 0;
        const refPeriod = AON_PERIODS[ftRow][AON_REFERENCE_NOTE_IDX];
        const sampleRate = aonPeriodToRate(refPeriod);
        const hasLoop = byteLoopLength > 1;
        const loopStart = hasLoop ? byteLoopStart : 0;
        const loopEnd = hasLoop ? byteLoopStart + byteLoopLength : 0;
        instrumentConfigs.push({
          ...createSamplerInstrument(id, instr.name || `Sample ${i}`, pcm, si.volume, sampleRate, loopStart, loopEnd),
          uadeChipRam: chipRam
        });
      } else {
        instrumentConfigs.push({ ...makeSynthPlaceholder(id, instr.name || `Instrument ${i}`), uadeChipRam: chipRam });
      }
    } else if (instr.type === "synth" && waveForms) {
      const si = instr;
      const wfIdx = si.waveForm;
      const wf = wfIdx < waveForms.length ? waveForms[wfIdx] : null;
      if (wf && wf.length > 0) {
        const byteLength = si.length * 2;
        const playLen = Math.max(1, Math.min(byteLength, wf.length));
        const pcm = new Uint8Array(playLen);
        for (let j = 0; j < playLen; j++) {
          pcm[j] = wf[j % wf.length] & 255;
        }
        const ftRow = si.fineTune < 16 ? si.fineTune : 0;
        const refPeriod = AON_PERIODS[ftRow][AON_REFERENCE_NOTE_IDX];
        const sampleRate = aonPeriodToRate(refPeriod);
        instrumentConfigs.push({
          ...createSamplerInstrument(id, instr.name || `Synth ${i}`, pcm, si.volume, sampleRate, 0, playLen),
          uadeChipRam: chipRam
        });
      } else {
        instrumentConfigs.push({ ...makeSynthPlaceholder(id, instr.name || `Instrument ${i}`), uadeChipRam: chipRam });
      }
    } else {
      instrumentConfigs.push({ ...makeSynthPlaceholder(id, instr.name || `Instrument ${i}`), uadeChipRam: chipRam });
    }
  }
  const trackerPatterns = [];
  for (let pos = 0; pos < numberOfPositions; pos++) {
    const patIdx = positionList[pos];
    const pat = patIdx < patterns.length ? patterns[patIdx] : null;
    const channelRows = Array.from({ length: numberOfChannels }, () => []);
    for (let r = 0; r < 64; r++) {
      for (let c = 0; c < numberOfChannels; c++) {
        const line = pat ? pat.rows[r][c] : null;
        if (!line) {
          channelRows[c].push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          continue;
        }
        const instrId = line.instrument > 0 ? line.instrument : 0;
        instrId > 0 && instrId - 1 < finalInstruments.length ? finalInstruments[instrId - 1].fineTune : 0;
        const xmNote = aonNoteToXM(line.note);
        let effTyp = 0, eff = 0;
        const arg = line.effectArg;
        switch (line.effect) {
          case 0:
            break;
          // Arpeggio (handled inline by player)
          case 1:
            effTyp = 1;
            eff = arg;
            break;
          // SlideUp → portamento up
          case 2:
            effTyp = 2;
            eff = arg;
            break;
          // SlideDown → portamento down
          case 3:
            effTyp = 3;
            eff = arg;
            break;
          // TonePortamento
          case 4:
            effTyp = 4;
            eff = arg;
            break;
          // Vibrato
          case 5:
            effTyp = 5;
            eff = arg;
            break;
          // TonePortamento+VolumeSlide
          case 6:
            effTyp = 6;
            eff = arg;
            break;
          // Vibrato+VolumeSlide
          case 9:
            effTyp = 9;
            eff = arg;
            break;
          // SetSampleOffset
          case 10:
            effTyp = 10;
            eff = arg;
            break;
          // VolumeSlide
          case 11:
            effTyp = 11;
            eff = arg;
            break;
          // PositionJump
          case 12:
            effTyp = 12;
            eff = Math.min(64, arg);
            break;
          // SetVolume
          case 13:
            effTyp = 13;
            eff = arg;
            break;
          // PatternBreak
          case 14:
            effTyp = 14;
            eff = arg;
            break;
          // ExtraEffects
          case 15:
            effTyp = 15;
            eff = arg;
            break;
        }
        channelRows[c].push({
          note: xmNote,
          instrument: instrId,
          volume: 0,
          effTyp,
          eff,
          effTyp2: 0,
          eff2: 0
        });
      }
    }
    trackerPatterns.push({
      id: `pattern-${pos}`,
      name: `Position ${pos}`,
      length: 64,
      channels: channelRows.map((rows, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        // AON4: LRRL hard stereo. AON8: LLRR RRLL
        pan: numberOfChannels === 8 ? [-50, -50, 50, 50, 50, 50, -50, -50][ch] ?? 0 : [-50, 50, 50, -50][ch] ?? 0,
        instrumentId: null,
        color: null,
        rows
      })),
      importMetadata: {
        sourceFormat: "AON",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: numberOfChannels,
        originalPatternCount: patterns.length,
        originalInstrumentCount: finalInstruments.length
      }
    });
  }
  if (trackerPatterns.length === 0) {
    trackerPatterns.push(makeEmptyPattern(filename, numberOfChannels, finalInstruments.length));
  }
  const moduleName = (songName || filename).replace(/\.[^/.]+$/, "");
  const uadePatternLayout = patternChunkOffset > 0 ? {
    formatId: "aon",
    patternDataFileOffset: patternChunkOffset,
    bytesPerCell: 4,
    rowsPerPattern: 64,
    numChannels: numberOfChannels,
    numPatterns: (patterns == null ? void 0 : patterns.length) ?? 0,
    moduleSize: bytes.length,
    encodeCell: encodeAONCell
  } : void 0;
  return {
    name: moduleName,
    format: "AON",
    patterns: trackerPatterns,
    instruments: instrumentConfigs,
    songPositions: trackerPatterns.map((_, i) => i),
    songLength: trackerPatterns.length,
    restartPosition,
    numChannels: numberOfChannels,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadePatternLayout,
    artOfNoiseFileData: new Uint8Array(bytes).buffer
  };
}
function reparseinstruments(bytes, expectedCount, _numberOfChannels, _positionList, _patterns) {
  let off = 46;
  while (off + 8 <= bytes.length) {
    const chunkName = readMark(bytes, off);
    const chunkSize = u32BE(bytes, off + 4);
    off += 8;
    if (off + chunkSize > bytes.length) break;
    if (chunkName === "INST") {
      const numInstruments = Math.min(expectedCount, Math.floor(chunkSize / 32));
      const result = [];
      let iOff = off;
      for (let i = 0; i < numInstruments; i++) {
        const instrStart = iOff;
        const type = bytes[iOff];
        const volume = bytes[iOff + 1];
        const fineTune = bytes[iOff + 2];
        const waveForm = bytes[iOff + 3];
        iOff += 4;
        let instr = null;
        if (type === 0) {
          const startOffset = u32BE(bytes, iOff);
          const length = u32BE(bytes, iOff + 4);
          const loopStart = u32BE(bytes, iOff + 8);
          const loopLength = u32BE(bytes, iOff + 12);
          iOff += 16;
          iOff += 8;
          const envelopeStart = bytes[iOff];
          const envelopeAdd = bytes[iOff + 1];
          const envelopeEnd = bytes[iOff + 2];
          const envelopeSub = bytes[iOff + 3];
          iOff += 4;
          instr = {
            type: "sample",
            name: "",
            volume,
            fineTune,
            waveForm,
            startOffset,
            length,
            loopStart,
            loopLength,
            envelopeStart,
            envelopeAdd,
            envelopeEnd,
            envelopeSub,
            instrBase: instrStart
          };
        } else if (type === 1) {
          const synthLength = bytes[iOff];
          iOff += 1;
          iOff += 5;
          const vibParam = bytes[iOff];
          const vibDelay = bytes[iOff + 1];
          const vibWave = bytes[iOff + 2];
          const waveSpeed = bytes[iOff + 3];
          const waveLength = bytes[iOff + 4];
          const waveLoopStart = bytes[iOff + 5];
          const waveLoopLength = bytes[iOff + 6];
          const waveLoopControl = bytes[iOff + 7];
          iOff += 8;
          iOff += 10;
          const envelopeStart = bytes[iOff];
          const envelopeAdd = bytes[iOff + 1];
          const envelopeEnd = bytes[iOff + 2];
          const envelopeSub = bytes[iOff + 3];
          iOff += 4;
          instr = {
            type: "synth",
            name: "",
            volume,
            fineTune,
            waveForm,
            length: synthLength,
            vibParam,
            vibDelay,
            vibWave,
            waveSpeed,
            waveLength,
            waveLoopStart,
            waveLoopLength,
            waveLoopControl,
            envelopeStart,
            envelopeAdd,
            envelopeEnd,
            envelopeSub,
            instrBase: instrStart
          };
        }
        const consumed = iOff - instrStart;
        if (consumed !== 32) {
          iOff = instrStart + 32;
        }
        if (instr) result.push(instr);
      }
      let nOff2 = 46;
      while (nOff2 + 8 <= bytes.length) {
        const n = readMark(bytes, nOff2);
        const ns = u32BE(bytes, nOff2 + 4);
        nOff2 += 8;
        if (n === "INAM") {
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
function makeSynthPlaceholder(id, name) {
  return {
    id,
    name: name.replace(/\0/g, "").trim() || `Instrument ${id}`,
    type: "synth",
    synthType: "Synth",
    effects: [],
    volume: 0,
    pan: 0
  };
}
function makeEmptyPattern(filename, numCh, numInstr) {
  return {
    id: "pattern-0",
    name: "Pattern 0",
    length: 64,
    channels: Array.from({ length: numCh }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: numCh === 8 ? [-50, -50, 50, 50, 50, 50, -50, -50][ch] ?? 0 : [-50, 50, 50, -50][ch] ?? 0,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: 64 }, () => ({
        note: 0,
        instrument: 0,
        volume: 0,
        effTyp: 0,
        eff: 0,
        effTyp2: 0,
        eff2: 0
      }))
    })),
    importMetadata: {
      sourceFormat: "AON",
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: numCh,
      originalPatternCount: 0,
      originalInstrumentCount: numInstr
    }
  };
}
export {
  isArtOfNoiseFormat,
  parseArtOfNoiseFile
};
