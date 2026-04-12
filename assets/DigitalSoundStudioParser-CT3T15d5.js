import { c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const MAGIC = 1296913714;
const MIN_FILE_SIZE = 1566;
const NUM_SAMPLES = 31;
const SAMPLE_INFO_SIZE = 46;
const SAMPLE_INFO_BASE = 10;
const NUM_POSITIONS_OFF = 1436;
const POSITION_LIST_OFF = 1438;
const PATTERN_DATA_OFF = 1566;
const ROWS_PER_PATTERN = 64;
const CHANNELS = 4;
const BYTES_PER_CELL = 4;
const BYTES_PER_ROW = CHANNELS * BYTES_PER_CELL;
const BYTES_PER_PATTERN = ROWS_PER_PATTERN * BYTES_PER_ROW;
const PAL_CLOCK = 3546895;
const AMIGA_PAN = [-50, 50, 50, -50];
const DSS_PERIODS = [
  // Finetune 0 (normal)
  [
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
  // Finetune 1
  [
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
  // Finetune 2
  [
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
  // Finetune 3
  [
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
  // Finetune 4
  [
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
  // Finetune 5
  [
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
  // Finetune 6
  [
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
  // Finetune 7
  [
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
  // Finetune -8 (index 8)
  [
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
  // Finetune -7 (index 9)
  [
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
  // Finetune -6 (index 10)
  [
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
  // Finetune -5 (index 11)
  [
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
  // Finetune -4 (index 12)
  [
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
  // Finetune -3 (index 13)
  [
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
  // Finetune -2 (index 14)
  [
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
  // Finetune -1 (index 15)
  [
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
const DSS_PERIODS_FT0 = DSS_PERIODS[0];
function u8(buf, off) {
  return buf[off] ?? 0;
}
function u16BE(buf, off) {
  return (buf[off] ?? 0) << 8 | (buf[off + 1] ?? 0);
}
function u32BE(buf, off) {
  return ((buf[off] ?? 0) << 24 | (buf[off + 1] ?? 0) << 16 | (buf[off + 2] ?? 0) << 8 | (buf[off + 3] ?? 0)) >>> 0;
}
function readString(buf, off, len) {
  let s = "";
  for (let i = 0; i < len; i++) {
    const c = buf[off + i];
    if (c === void 0 || c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}
function periodToXMNote(period) {
  if (period === 0 || period === 2047) return 0;
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < DSS_PERIODS_FT0.length; i++) {
    const p = DSS_PERIODS_FT0[i];
    if (p === void 0) continue;
    const d = Math.abs(p - period);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  const xmNote = bestIdx + 13;
  return Math.max(1, Math.min(96, xmNote));
}
function periodToFreq(period) {
  if (period <= 0) return 8287;
  return Math.round(PAL_CLOCK / (2 * period));
}
function emptyCell() {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}
function isDigitalSoundStudioFormat(bytes) {
  if (bytes.length < MIN_FILE_SIZE) return false;
  if (u32BE(bytes, 0) !== MAGIC) return false;
  const numPositions = u16BE(bytes, NUM_POSITIONS_OFF);
  if (numPositions === 0 || numPositions > 128) return false;
  let highest = 0;
  for (let i = 0; i < numPositions; i++) {
    const pat = u8(bytes, POSITION_LIST_OFF + i);
    if (pat > highest) highest = pat;
  }
  const patternBlockEnd = PATTERN_DATA_OFF + (highest + 1) * BYTES_PER_PATTERN;
  if (patternBlockEnd >= bytes.length) return false;
  return true;
}
function parseDigitalSoundStudioFile(bytes, filename) {
  try {
    if (!isDigitalSoundStudioFormat(bytes)) return null;
    const songTempo = u8(bytes, 8);
    const songSpeed = u8(bytes, 9);
    const initialBPM = songTempo === 0 ? 125 : songTempo;
    const initialSpeed = songSpeed === 0 ? 6 : songSpeed;
    const sampleInfos = [];
    for (let i = 0; i < NUM_SAMPLES; i++) {
      const base = SAMPLE_INFO_BASE + i * SAMPLE_INFO_SIZE;
      const name = readString(bytes, base + 0, 30);
      const startOff = u32BE(bytes, base + 30) & 4294967294;
      const length = u16BE(bytes, base + 34);
      const loopStart = u32BE(bytes, base + 36);
      const loopLength = u16BE(bytes, base + 40);
      const finetune = u8(bytes, base + 42);
      const volume = u8(bytes, base + 43);
      const frequency = u16BE(bytes, base + 44);
      sampleInfos.push({ name, startOffset: startOff, length, loopStart, loopLength, finetune, volume, frequency });
    }
    const numPositions = u16BE(bytes, NUM_POSITIONS_OFF);
    const positions = [];
    for (let i = 0; i < numPositions; i++) {
      positions.push(u8(bytes, POSITION_LIST_OFF + i));
    }
    const numPatterns = Math.max(...positions) + 1;
    const rawPatterns = [];
    for (let p = 0; p < numPatterns; p++) {
      const rows = [];
      const patBase = PATTERN_DATA_OFF + p * BYTES_PER_PATTERN;
      for (let row = 0; row < ROWS_PER_PATTERN; row++) {
        const cells = [];
        for (let ch = 0; ch < CHANNELS; ch++) {
          const off = patBase + row * BYTES_PER_ROW + ch * BYTES_PER_CELL;
          const b1 = u8(bytes, off);
          const b2 = u8(bytes, off + 1);
          const b3 = u8(bytes, off + 2);
          const b4 = u8(bytes, off + 3);
          cells.push({
            sample: b1 >> 3,
            period: (b1 & 7) << 8 | b2,
            effect: b3,
            effectArg: b4
          });
        }
        rows.push(cells);
      }
      rawPatterns.push(rows);
    }
    const sampleDataBase = PATTERN_DATA_OFF + numPatterns * BYTES_PER_PATTERN;
    const instruments = [];
    for (let i = 0; i < NUM_SAMPLES; i++) {
      const info = sampleInfos[i];
      const id = i + 1;
      const hasLoop = info.loopLength > 1;
      const totalWords = info.length + (hasLoop ? info.loopLength : 0);
      const totalBytes = totalWords * 2;
      if (info.length === 0 || totalBytes === 0) {
        const _dssChipRamInfo = { moduleBase: 0, moduleSize: bytes.length, instrBase: SAMPLE_INFO_BASE + i * SAMPLE_INFO_SIZE, instrSize: SAMPLE_INFO_SIZE, sections: {} };
        instruments.push({
          id,
          name: info.name.trim() || `Sample ${id}`,
          type: "synth",
          synthType: "Synth",
          effects: [],
          volume: 0,
          pan: 0,
          uadeChipRam: _dssChipRamInfo
        });
        continue;
      }
      const absOffset = sampleDataBase + info.startOffset;
      const dataEnd = absOffset + totalBytes;
      if (dataEnd > bytes.length) {
        const _dssChipRamInfo2 = { moduleBase: 0, moduleSize: bytes.length, instrBase: SAMPLE_INFO_BASE + i * SAMPLE_INFO_SIZE, instrSize: SAMPLE_INFO_SIZE, sections: {} };
        instruments.push({
          id,
          name: info.name.trim() || `Sample ${id}`,
          type: "synth",
          synthType: "Synth",
          effects: [],
          volume: 0,
          pan: 0,
          uadeChipRam: _dssChipRamInfo2
        });
        continue;
      }
      const pcm = bytes.slice(absOffset, dataEnd);
      const loopStartBytes = hasLoop ? Math.max(0, info.loopStart - info.startOffset) : 0;
      const loopEndBytes = hasLoop ? loopStartBytes + info.loopLength * 2 : 0;
      const ftIdx = info.finetune & 15;
      const ftRow = DSS_PERIODS[ftIdx];
      const c3Period = ftRow && ftRow[24] !== void 0 ? ftRow[24] : 214;
      const sampleRate = info.frequency > 0 ? info.frequency : periodToFreq(c3Period);
      const _dssChipRam = { moduleBase: 0, moduleSize: bytes.length, instrBase: SAMPLE_INFO_BASE + i * SAMPLE_INFO_SIZE, instrSize: SAMPLE_INFO_SIZE, sections: {} };
      const _dssInst = createSamplerInstrument(id, info.name.trim() || "Sample " + id, pcm, info.volume, sampleRate, loopStartBytes, loopEndBytes);
      instruments.push({ ..._dssInst, uadeChipRam: _dssChipRam });
    }
    const trackerPatterns = [];
    for (let p = 0; p < numPatterns; p++) {
      const raw = rawPatterns[p];
      if (!raw) continue;
      const channelRows = Array.from({ length: CHANNELS }, () => []);
      for (let row = 0; row < ROWS_PER_PATTERN; row++) {
        const cells = raw[row];
        for (let ch = 0; ch < CHANNELS; ch++) {
          const cell = cells == null ? void 0 : cells[ch];
          if (!cell) {
            channelRows[ch].push(emptyCell());
            continue;
          }
          const xmNote = periodToXMNote(cell.period);
          const instrNum = cell.sample;
          let effTyp = 0;
          let eff = 0;
          switch (cell.effect) {
            case 0:
              effTyp = 0;
              eff = cell.effectArg;
              break;
            case 1:
              effTyp = 1;
              eff = cell.effectArg;
              break;
            case 2:
              effTyp = 2;
              eff = cell.effectArg;
              break;
            case 3:
              effTyp = 12;
              eff = cell.effectArg;
              break;
            case 5:
              effTyp = 15;
              eff = cell.effectArg;
              break;
            case 6:
              effTyp = 11;
              eff = cell.effectArg;
              break;
            case 11:
              effTyp = 15;
              eff = cell.effectArg;
              break;
            case 27:
              effTyp = 3;
              eff = cell.effectArg;
              break;
            default:
              effTyp = 0;
              eff = 0;
              break;
          }
          channelRows[ch].push({
            note: xmNote,
            instrument: instrNum,
            volume: 0,
            effTyp,
            eff,
            effTyp2: 0,
            eff2: 0
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
          rows
        })),
        importMetadata: {
          sourceFormat: "DSS",
          sourceFile: filename,
          importedAt: (/* @__PURE__ */ new Date()).toISOString(),
          originalChannelCount: CHANNELS,
          originalPatternCount: numPatterns,
          originalInstrumentCount: NUM_SAMPLES
        }
      });
    }
    if (trackerPatterns.length === 0) {
      trackerPatterns.push({
        id: "pattern-0",
        name: "Pattern 0",
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
          rows: Array.from({ length: ROWS_PER_PATTERN }, () => emptyCell())
        })),
        importMetadata: {
          sourceFormat: "DSS",
          sourceFile: filename,
          importedAt: (/* @__PURE__ */ new Date()).toISOString(),
          originalChannelCount: CHANNELS,
          originalPatternCount: 0,
          originalInstrumentCount: NUM_SAMPLES
        }
      });
    }
    const moduleName = filename.replace(/\.[^/.]+$/, "");
    return {
      name: `${moduleName} [Digital Sound Studio]`,
      format: "DSS",
      patterns: trackerPatterns,
      instruments,
      songPositions: positions.map((p) => p),
      songLength: positions.length,
      restartPosition: 0,
      numChannels: CHANNELS,
      initialSpeed,
      initialBPM,
      linearPeriods: false,
      uadeEditableFileData: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      uadeEditableFileName: filename
      // uadePatternLayout omitted: native Sampler instruments handle audio directly.
      // UADE audio is silent for DSS — samples are extracted as PCM Samplers.
    };
  } catch {
    return null;
  }
}
export {
  isDigitalSoundStudioFormat,
  parseDigitalSoundStudioFile
};
