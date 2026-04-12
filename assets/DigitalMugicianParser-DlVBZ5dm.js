import { b$ as registerPatternEncoder, bR as arrayBufferToBase64 } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const DM_PERIODS_FT0 = [
  3220,
  3040,
  2869,
  2708,
  2556,
  2412,
  2277,
  2149,
  2029,
  1915,
  1807,
  1706,
  1610,
  1520,
  1434,
  1354,
  1278,
  1206,
  1139,
  1075,
  1014,
  957,
  904,
  853,
  805,
  760,
  717,
  677,
  639,
  603,
  569,
  537,
  507,
  479,
  452,
  426,
  403,
  380,
  359,
  338,
  319,
  302,
  285,
  269,
  254,
  239,
  226,
  213,
  201,
  190,
  179,
  169,
  160,
  151,
  142,
  134,
  127
];
function xmNoteToDMIndex(xmNote) {
  if (xmNote <= 0 || xmNote > 96) return 0;
  const idx = xmNote - 1;
  return Math.max(0, Math.min(DM_PERIODS_FT0.length - 1, idx));
}
function encodeDigitalMugicianCell(cell) {
  const out = new Uint8Array(4);
  const xmNote = cell.note ?? 0;
  if (xmNote > 0 && xmNote <= 96) {
    out[0] = xmNoteToDMIndex(xmNote);
  } else {
    out[0] = 0;
  }
  out[1] = (cell.instrument ?? 0) & 63;
  const effTyp = cell.effTyp ?? 0;
  if (effTyp === 0) {
    out[2] = 64;
  } else if (effTyp === 15 && (cell.eff ?? 0) > 0 && (cell.eff ?? 0) <= 15) {
    out[2] = 68;
  } else if (effTyp === 14 && (cell.eff ?? 0) === 1) {
    out[2] = 69;
  } else if (effTyp === 14 && (cell.eff ?? 0) === 0) {
    out[2] = 70;
  } else if (effTyp === 3) {
    out[2] = 74;
  } else {
    out[2] = 64;
  }
  if (effTyp === 1) {
    out[3] = Math.min(cell.eff ?? 0, 127) & 255;
  } else if (effTyp === 2) {
    out[3] = -Math.min(cell.eff ?? 0, 127) & 255;
  } else if (effTyp === 15) {
    out[3] = (cell.eff ?? 0) & 255;
  } else if (effTyp === 3) {
    out[3] = (cell.eff ?? 0) & 255;
  } else {
    out[3] = 0;
  }
  return out;
}
registerPatternEncoder("digitalMugician", () => encodeDigitalMugicianCell);
function pcm8ToWavDataUrl(pcm, sampleRate = 8363) {
  const n = pcm.length;
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const w = (off, s) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  w(0, "RIFF");
  v.setUint32(4, 36 + n, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  w(36, "data");
  v.setUint32(40, n, true);
  const dst = new Uint8Array(buf, 44);
  for (let i = 0; i < n; i++) dst[i] = pcm[i] + 128 & 255;
  return `data:audio/wav;base64,${arrayBufferToBase64(buf)}`;
}
function readString(buf, off, len) {
  let s = "";
  for (let i = 0; i < len; i++) {
    const c = buf[off + i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}
function u8(buf, off) {
  return buf[off];
}
function s8(buf, off) {
  const v = buf[off];
  return v < 128 ? v : v - 256;
}
function u16BE(buf, off) {
  return buf[off] << 8 | buf[off + 1];
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
const DM_PERIODS = [
  3220,
  3040,
  2869,
  2708,
  2556,
  2412,
  2277,
  2149,
  2029,
  1915,
  1807,
  1706,
  1610,
  1520,
  1434,
  1354,
  1278,
  1206,
  1139,
  1075,
  1014,
  957,
  904,
  853,
  805,
  760,
  717,
  677,
  639,
  603,
  569,
  537,
  507,
  479,
  452,
  426,
  403,
  380,
  359,
  338,
  319,
  302,
  285,
  269,
  254,
  239,
  226,
  213,
  201,
  190,
  179,
  169,
  160,
  151,
  142,
  134,
  127,
  4842,
  4571,
  4314,
  4072,
  3843,
  3628,
  3424,
  3232,
  3051,
  2879,
  2718,
  2565,
  2421,
  2285,
  2157,
  2036,
  1922,
  1814,
  1712,
  1616,
  1525,
  1440,
  1359,
  1283,
  1211,
  1143,
  1079,
  1018,
  961,
  907,
  856,
  808,
  763,
  720,
  679,
  641,
  605,
  571,
  539,
  509,
  480,
  453,
  428,
  404,
  381,
  360,
  340,
  321,
  303,
  286,
  270,
  254,
  240,
  227,
  214,
  202,
  191,
  180,
  170,
  160,
  151,
  143,
  135,
  127,
  4860,
  4587,
  4330,
  4087,
  3857,
  3641,
  3437,
  3244,
  3062,
  2890,
  2728,
  2574,
  2430,
  2294,
  2165,
  2043,
  1929,
  1820,
  1718,
  1622,
  1531,
  1445,
  1364,
  1287,
  1215,
  1147,
  1082,
  1022,
  964,
  910,
  859,
  811,
  765,
  722,
  682,
  644,
  607,
  573,
  541,
  511,
  482,
  455,
  430,
  405,
  383,
  361,
  341,
  322,
  304,
  287,
  271,
  255,
  241,
  228,
  215,
  203,
  191,
  181,
  170,
  161,
  152,
  143,
  135,
  128,
  4878,
  4604,
  4345,
  4102,
  3871,
  3654,
  3449,
  3255,
  3073,
  2900,
  2737,
  2584,
  2439,
  2302,
  2173,
  2051,
  1936,
  1827,
  1724,
  1628,
  1536,
  1450,
  1369,
  1292,
  1219,
  1151,
  1086,
  1025,
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
  4895,
  4620,
  4361,
  4116,
  3885,
  3667,
  3461,
  3267,
  3084,
  2911,
  2747,
  2593,
  2448,
  2310,
  2181,
  2058,
  1943,
  1834,
  1731,
  1634,
  1542,
  1455,
  1374,
  1297,
  1224,
  1155,
  1090,
  1029,
  971,
  917,
  865,
  817,
  771,
  728,
  687,
  648,
  612,
  578,
  545,
  515,
  486,
  458,
  433,
  408,
  385,
  364,
  343,
  324,
  306,
  289,
  273,
  257,
  243,
  229,
  216,
  204,
  193,
  182,
  172,
  162,
  153,
  144,
  136,
  129,
  4913,
  4637,
  4377,
  4131,
  3899,
  3681,
  3474,
  3279,
  3095,
  2921,
  2757,
  2603,
  2456,
  2319,
  2188,
  2066,
  1950,
  1840,
  1737,
  1639,
  1547,
  1461,
  1379,
  1301,
  1228,
  1159,
  1094,
  1033,
  975,
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
  4931,
  4654,
  4393,
  4146,
  3913,
  3694,
  3486,
  3291,
  3106,
  2932,
  2767,
  2612,
  2465,
  2327,
  2196,
  2073,
  1957,
  1847,
  1743,
  1645,
  1553,
  1466,
  1384,
  1306,
  1233,
  1163,
  1098,
  1037,
  978,
  923,
  872,
  823,
  777,
  733,
  692,
  653,
  616,
  582,
  549,
  518,
  489,
  462,
  436,
  411,
  388,
  366,
  346,
  326,
  308,
  291,
  275,
  259,
  245,
  231,
  218,
  206,
  194,
  183,
  173,
  163,
  154,
  145,
  137,
  130,
  4948,
  4671,
  4409,
  4161,
  3928,
  3707,
  3499,
  3303,
  3117,
  2942,
  2777,
  2621,
  2474,
  2335,
  2204,
  2081,
  1964,
  1854,
  1750,
  1651,
  1559,
  1471,
  1389,
  1311,
  1237,
  1168,
  1102,
  1040,
  982,
  927,
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
  4966,
  4688,
  4425,
  4176,
  3942,
  3721,
  3512,
  3315,
  3129,
  2953,
  2787,
  2631,
  2483,
  2344,
  2212,
  2088,
  1971,
  1860,
  1756,
  1657,
  1564,
  1477,
  1394,
  1315,
  1242,
  1172,
  1106,
  1044,
  985,
  930,
  878,
  829,
  782,
  738,
  697,
  658,
  621,
  586,
  553,
  522,
  493,
  465,
  439,
  414,
  391,
  369,
  348,
  329,
  310,
  293,
  277,
  261,
  246,
  233,
  219,
  207,
  196,
  185,
  174,
  164,
  155,
  146,
  138,
  131,
  4984,
  4705,
  4441,
  4191,
  3956,
  3734,
  3524,
  3327,
  3140,
  2964,
  2797,
  2640,
  2492,
  2352,
  2220,
  2096,
  1978,
  1867,
  1762,
  1663,
  1570,
  1482,
  1399,
  1320,
  1246,
  1176,
  1110,
  1048,
  989,
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
  5002,
  4722,
  4457,
  4206,
  3970,
  3748,
  3537,
  3339,
  3151,
  2974,
  2807,
  2650,
  2501,
  2361,
  2228,
  2103,
  1985,
  1874,
  1769,
  1669,
  1576,
  1487,
  1404,
  1325,
  1251,
  1180,
  1114,
  1052,
  993,
  937,
  884,
  835,
  788,
  744,
  702,
  662,
  625,
  590,
  557,
  526,
  496,
  468,
  442,
  417,
  394,
  372,
  351,
  331,
  313,
  295,
  279,
  263,
  248,
  234,
  221,
  209,
  197,
  186,
  175,
  166,
  156,
  148,
  139,
  131,
  5020,
  4739,
  4473,
  4222,
  3985,
  3761,
  3550,
  3351,
  3163,
  2985,
  2818,
  2659,
  2510,
  2369,
  2236,
  2111,
  1992,
  1881,
  1775,
  1675,
  1581,
  1493,
  1409,
  1330,
  1255,
  1185,
  1118,
  1055,
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
  5039,
  4756,
  4489,
  4237,
  3999,
  3775,
  3563,
  3363,
  3174,
  2996,
  2828,
  2669,
  2519,
  2378,
  2244,
  2118,
  2e3,
  1887,
  1781,
  1681,
  1587,
  1498,
  1414,
  1335,
  1260,
  1189,
  1122,
  1059,
  1e3,
  944,
  891,
  841,
  794,
  749,
  707,
  667,
  630,
  594,
  561,
  530,
  500,
  472,
  445,
  420,
  397,
  374,
  353,
  334,
  315,
  297,
  281,
  265,
  250,
  236,
  223,
  210,
  198,
  187,
  177,
  167,
  157,
  149,
  140,
  132,
  5057,
  4773,
  4505,
  4252,
  4014,
  3788,
  3576,
  3375,
  3186,
  3007,
  2838,
  2679,
  2528,
  2387,
  2253,
  2126,
  2007,
  1894,
  1788,
  1688,
  1593,
  1503,
  1419,
  1339,
  1264,
  1193,
  1126,
  1063,
  1003,
  947,
  894,
  844,
  796,
  752,
  710,
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
  5075,
  4790,
  4521,
  4268,
  4028,
  3802,
  3589,
  3387,
  3197,
  3018,
  2848,
  2688,
  2538,
  2395,
  2261,
  2134,
  2014,
  1901,
  1794,
  1694,
  1599,
  1509,
  1424,
  1344,
  1269,
  1198,
  1130,
  1067,
  1007,
  951,
  897,
  847,
  799,
  754,
  712,
  672,
  634,
  599,
  565,
  533,
  504,
  475,
  449,
  423,
  400,
  377,
  356,
  336,
  317,
  299,
  283,
  267,
  252,
  238,
  224,
  212,
  200,
  189,
  178,
  168,
  159,
  150,
  141,
  133,
  5093,
  4808,
  4538,
  4283,
  4043,
  3816,
  3602,
  3399,
  3209,
  3029,
  2859,
  2698,
  2547,
  2404,
  2269,
  2142,
  2021,
  1908,
  1801,
  1700,
  1604,
  1514,
  1429,
  1349,
  1273,
  1202,
  1134,
  1071,
  1011,
  954,
  900,
  850,
  802,
  757,
  715,
  675,
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
  238,
  225,
  212,
  201,
  189,
  179,
  169,
  159,
  150,
  142,
  134
];
function dmPeriodToXMNote(period) {
  if (period <= 0) return 0;
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < 57 && i < DM_PERIODS.length; i++) {
    const d = Math.abs(DM_PERIODS[i] - period);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  const xmNote = bestIdx + 1;
  return Math.max(1, Math.min(96, xmNote));
}
const MAGIC_V1 = " MUGICIAN/SOFTEYES 1990 ";
const MAGIC_V2 = " MUGICIAN2/SOFTEYES 1990";
async function parseDigitalMugicianFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (buf.length < 76) {
    throw new Error("File too small to be a Digital Mugician module");
  }
  const id = readString(buf, 0, 24);
  if (id !== MAGIC_V1 && id !== MAGIC_V2) {
    throw new Error(`Not a Digital Mugician file: magic="${id}"`);
  }
  const arpeggioFlag = u16BE(buf, 24);
  const waveDataLen = u16BE(buf, 26);
  const totalPatternRows = waveDataLen << 6;
  const songTrackCounts = [];
  for (let i = 0; i < 8; i++) {
    songTrackCounts[i] = u32BE(buf, 28 + i * 4);
  }
  const sampleCount = u32BE(buf, 60);
  const wavetableCount = u32BE(buf, 64);
  const wavetableBytes = wavetableCount << 7;
  const instrHeaderCount = u32BE(buf, 68);
  const songs = [];
  let pos = 76;
  for (let i = 0; i < 8; i++) {
    const loop = u8(buf, pos);
    const loopStep = u8(buf, pos + 1) << 2;
    const speed = u8(buf, pos + 2);
    const length = u8(buf, pos + 3) << 2;
    const title = readString(buf, pos + 4, 12);
    songs.push({ title, speed, length, loop, loopStep, tracks: [] });
    pos += 16;
  }
  pos = 204;
  for (let i = 0; i < 8; i++) {
    const numSteps2 = songTrackCounts[i] << 2;
    for (let j = 0; j < numSteps2; j++) {
      if (pos + 1 >= buf.length) break;
      const pattern = u8(buf, pos) << 6;
      const transpose = s8(buf, pos + 1);
      songs[i].tracks.push({ pattern, transpose });
      pos += 2;
    }
  }
  const samples = [];
  const numInstruments = sampleCount + 1;
  const sampleTableBase = pos;
  for (let i = 1; i < numInstruments; i++) {
    if (pos + 16 > buf.length) break;
    const sample = {
      wave: u8(buf, pos),
      waveLen: u8(buf, pos + 1) << 1,
      volume: u8(buf, pos + 2),
      volumeSpeed: u8(buf, pos + 3),
      arpeggio: u8(buf, pos + 4),
      pitch: u8(buf, pos + 5),
      effectStep: u8(buf, pos + 6),
      pitchDelay: u8(buf, pos + 7),
      finetune: u8(buf, pos + 8) << 6,
      pitchLoop: u8(buf, pos + 9),
      pitchSpeed: u8(buf, pos + 10),
      effect: u8(buf, pos + 11),
      source1: u8(buf, pos + 12),
      source2: u8(buf, pos + 13),
      effectSpeed: u8(buf, pos + 14),
      volumeLoop: u8(buf, pos + 15),
      pointer: 0,
      sampleLength: 0,
      loopOffset: 0,
      repeat: 0,
      name: ""
    };
    samples.push(sample);
    pos += 16;
  }
  if (samples.length > 0) {
    samples.unshift(samples[0]);
  }
  const wavetableData = new Uint8Array(wavetableBytes);
  for (let i = 0; i < wavetableBytes && pos + i < buf.length; i++) {
    wavetableData[i] = buf[pos + i];
  }
  pos += wavetableBytes;
  const instrHeaderStart = pos;
  let instrDataSize = 0;
  if (instrHeaderCount > 0) {
    const instrDataStart = instrHeaderStart + (instrHeaderCount << 5);
    instrDataSize = u32BE(buf, 72);
    const pcmDataOffset = instrDataStart + totalPatternRows * 4;
    for (let i = 1; i < samples.length; i++) {
      const sample = samples[i];
      if (sample.wave < 32) continue;
      const headerOff = instrHeaderStart + (sample.wave - 32 << 5);
      if (headerOff + 24 > buf.length) continue;
      const ptrStart = u32BE(buf, headerOff);
      const ptrEnd = u32BE(buf, headerOff + 4);
      const loopPtr = u32BE(buf, headerOff + 8);
      const sName = readString(buf, headerOff + 12, 12).trim();
      sample.pointer = ptrStart;
      sample.sampleLength = ptrEnd - ptrStart;
      sample.name = sName;
      if (loopPtr > 0) {
        sample.loopOffset = loopPtr - ptrStart;
        sample.repeat = sample.sampleLength - sample.loopOffset;
        if ((sample.repeat & 1) !== 0) sample.repeat--;
      } else {
        sample.loopOffset = 0;
        sample.repeat = 0;
      }
      if ((sample.pointer & 1) !== 0) sample.pointer--;
      if ((sample.sampleLength & 1) !== 0) sample.sampleLength--;
      sample.pointer += pcmDataOffset;
    }
  }
  const patternDataStart = instrHeaderStart + (instrHeaderCount << 5);
  const patternRows = [];
  let ppos = patternDataStart;
  for (let i = 0; i < totalPatternRows; i++) {
    if (ppos + 4 > buf.length) {
      patternRows.push({ note: 0, sample: 0, effect: 0, param: 0 });
      ppos += 4;
      continue;
    }
    patternRows.push({
      note: u8(buf, ppos),
      sample: u8(buf, ppos + 1) & 63,
      effect: u8(buf, ppos + 2),
      param: s8(buf, ppos + 3)
    });
    ppos += 4;
  }
  const arpeggios = new Uint8Array(256);
  if (arpeggioFlag === 1) {
    const patternDataEnd = patternDataStart + totalPatternRows * 4;
    const arpPos = patternDataEnd + instrDataSize;
    if (arpPos < buf.length) {
      const arpLen = Math.min(256, buf.length - arpPos);
      for (let i = 0; i < arpLen; i++) {
        arpeggios[i] = buf[arpPos + i];
      }
    }
  }
  const instruments = [];
  const sampleToInstrumentId = /* @__PURE__ */ new Map();
  let nextInstrId = 1;
  function getOrCreateInstrument(sampleIdx) {
    if (sampleIdx <= 0 || sampleIdx >= samples.length) return 0;
    if (sampleToInstrumentId.has(sampleIdx)) return sampleToInstrumentId.get(sampleIdx);
    const sample = samples[sampleIdx];
    const id2 = nextInstrId++;
    sampleToInstrumentId.set(sampleIdx, id2);
    const arpTableArr = [];
    for (let a = 0; a < 8; a++) {
      const aidx = sample.arpeggio + a;
      arpTableArr.push(aidx < arpeggios.length ? arpeggios[aidx] : 0);
    }
    const vol = Math.min(64, sample.volume);
    const chipRam = {
      moduleBase: 0,
      moduleSize: buf.byteLength,
      instrBase: sampleTableBase + (sampleIdx - 1) * 16,
      instrSize: 16,
      sections: {
        sampleTable: sampleTableBase
      }
    };
    if (sample.wave >= 32 && sample.sampleLength > 0) {
      const pcmStart = sample.pointer;
      const pcmEnd = pcmStart + sample.sampleLength;
      const pcm = pcmEnd <= buf.length && sample.sampleLength > 0 ? buf.slice(pcmStart, pcmEnd) : void 0;
      const config = {
        wavetable: [0, 0, 0, 0],
        waveBlend: 0,
        waveSpeed: 0,
        volume: vol,
        arpTable: arpTableArr,
        arpSpeed: Math.min(15, sample.pitchSpeed),
        vibSpeed: 0,
        vibDepth: 0,
        pcmData: pcm,
        loopStart: sample.loopOffset,
        loopLength: sample.repeat > 0 ? sample.repeat : 0
      };
      const sampleUrl = pcm && pcm.length > 0 ? pcm8ToWavDataUrl(pcm) : void 0;
      const loopEnabled = sample.repeat > 0 && sample.loopOffset >= 0;
      instruments.push({
        id: id2,
        name: sample.name || `PCM ${sampleIdx}`,
        type: "synth",
        synthType: "DigMugSynth",
        digMug: config,
        effects: [],
        volume: -6,
        pan: 0,
        uadeChipRam: chipRam,
        metadata: { modPlayback: { usePeriodPlayback: true, periodMultiplier: 3546895, finetune: 0 } },
        ...sampleUrl ? {
          sample: {
            url: sampleUrl,
            sampleRate: 8363,
            baseNote: "C4",
            detune: 0,
            loop: loopEnabled,
            loopType: loopEnabled ? "forward" : "off",
            loopStart: sample.loopOffset,
            loopEnd: loopEnabled ? sample.loopOffset + sample.repeat : 0,
            reverse: false,
            playbackRate: 1
          },
          parameters: { sampleUrl }
        } : {}
      });
    } else if (sample.wave < 32) {
      const waveOffset = sample.wave << 7;
      const waveLen = sample.waveLen > 0 ? Math.min(sample.waveLen, 128) : 128;
      const waveformData = waveOffset + waveLen <= wavetableData.length ? wavetableData.slice(waveOffset, waveOffset + waveLen) : void 0;
      const config = {
        wavetable: [sample.wave, sample.wave, sample.wave, sample.wave],
        waveBlend: 0,
        waveSpeed: 0,
        volume: vol,
        arpTable: arpTableArr,
        arpSpeed: Math.min(15, sample.pitchSpeed),
        vibSpeed: 0,
        vibDepth: 0,
        waveformData
      };
      instruments.push({
        id: id2,
        name: `Wave ${sample.wave}`,
        type: "synth",
        synthType: "DigMugSynth",
        digMug: config,
        effects: [],
        volume: -6,
        pan: 0,
        uadeChipRam: chipRam,
        metadata: { modPlayback: { usePeriodPlayback: true, periodMultiplier: 3546895, finetune: 0 } }
      });
    } else {
      instruments.push({
        id: id2,
        name: `Instrument ${sampleIdx}`,
        type: "synth",
        synthType: "Synth",
        effects: [],
        volume: -6,
        pan: 0
      });
    }
    return id2;
  }
  const song = songs[0];
  if (!song || song.length === 0) {
    throw new Error("Digital Mugician file contains no song data");
  }
  const songSpeed = song.speed & 15;
  for (let si = 1; si < numInstruments; si++) {
    getOrCreateInstrument(si);
  }
  const numSteps = Math.floor(song.length / 4);
  const trackerPatterns = [];
  const songPositions = [];
  const patternCache = /* @__PURE__ */ new Map();
  const patternChannelBaseRows = [];
  for (let stepIdx = 0; stepIdx < numSteps; stepIdx++) {
    const trackBase = stepIdx * 4;
    if (trackBase + 3 >= song.tracks.length) break;
    const ch0 = song.tracks[trackBase];
    const ch1 = song.tracks[trackBase + 1];
    const ch2 = song.tracks[trackBase + 2];
    const ch3 = song.tracks[trackBase + 3];
    const cacheKey = `${ch0.pattern}:${ch0.transpose}:${ch1.pattern}:${ch1.transpose}:${ch2.pattern}:${ch2.transpose}:${ch3.pattern}:${ch3.transpose}`;
    if (patternCache.has(cacheKey)) {
      songPositions.push(patternCache.get(cacheKey));
      continue;
    }
    const patIdx = trackerPatterns.length;
    patternCache.set(cacheKey, patIdx);
    songPositions.push(patIdx);
    patternChannelBaseRows.push([ch0.pattern, ch1.pattern, ch2.pattern, ch3.pattern]);
    const channelRows = [[], [], [], []];
    for (let row = 0; row < 64; row++) {
      for (let ch = 0; ch < 4; ch++) {
        const step = song.tracks[trackBase + ch];
        const rowOffset = step.pattern + row;
        let note = 0;
        let sampleNum = 0;
        let effect = 0;
        let param = 0;
        if (rowOffset >= 0 && rowOffset < patternRows.length) {
          const pRow = patternRows[rowOffset];
          note = pRow.note;
          sampleNum = pRow.sample;
          effect = pRow.effect;
          param = pRow.param;
        }
        let xmNote = 0;
        if (note > 0) {
          let finetune = 0;
          let transposeVal = step.transpose;
          if (sampleNum > 0 && sampleNum < samples.length) {
            finetune = samples[sampleNum].finetune;
          }
          const noteIdx = note + transposeVal + finetune;
          if (noteIdx >= 0 && noteIdx < DM_PERIODS.length) {
            const period = DM_PERIODS[noteIdx];
            xmNote = dmPeriodToXMNote(period);
          }
        }
        let instrument = 0;
        if (sampleNum > 0) {
          instrument = getOrCreateInstrument(sampleNum);
        }
        const val1 = note > 0 ? effect < 64 ? 1 : effect - 62 : 0;
        const val2 = param;
        let effTyp = 0;
        let eff = 0;
        if (note > 0) {
          switch (val1) {
            case 1: {
              const targetPitch = effect;
              if (targetPitch >= 0 && targetPitch < DM_PERIODS.length) {
                const targetNote = dmPeriodToXMNote(DM_PERIODS[targetPitch]);
                if (targetNote > 0) {
                  xmNote = targetNote;
                  effTyp = 3;
                  eff = Math.min(Math.abs(val2), 255);
                }
              } else if (val2 !== 0) {
                effTyp = val2 > 0 ? 1 : 2;
                eff = Math.min(Math.abs(val2), 255);
              }
              break;
            }
            case 5:
              break;
            case 6:
              if (val2 > 0 && val2 <= 15) {
                effTyp = 15;
                eff = val2 & 255;
              }
              break;
            case 7:
              effTyp = 14;
              eff = 1;
              break;
            case 8:
              effTyp = 14;
              eff = 0;
              break;
            case 9:
              if (val2 !== 0) {
                if (val2 > 0) {
                  effTyp = 1;
                  eff = Math.min(val2, 255);
                } else {
                  effTyp = 2;
                  eff = Math.min(-val2, 255);
                }
              }
              break;
            case 10:
              break;
            case 11:
              break;
            case 12: {
              if (val2 !== 0) {
                effTyp = 3;
                eff = Math.min(Math.abs(val2), 255);
              }
              break;
            }
            case 13: {
              const lo = val2 & 15;
              const hi = val2 >> 4 & 15;
              if (lo > 0 && hi > 0) {
                effTyp = 15;
                eff = lo;
              }
              break;
            }
          }
        }
        const xmVolume = 0;
        channelRows[ch].push({
          note: xmNote,
          instrument,
          volume: xmVolume,
          effTyp,
          eff,
          effTyp2: 0,
          eff2: 0
        });
      }
    }
    trackerPatterns.push({
      id: `pattern-${patIdx}`,
      name: `Pattern ${patIdx}`,
      length: 64,
      channels: channelRows.map((rows, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: ch === 0 || ch === 3 ? -50 : 50,
        // LRRL Amiga panning
        instrumentId: null,
        color: null,
        rows
      })),
      importMetadata: {
        sourceFormat: "MOD",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: 4,
        originalPatternCount: Math.floor(totalPatternRows / 64),
        originalInstrumentCount: sampleCount
      }
    });
  }
  if (trackerPatterns.length === 0) {
    trackerPatterns.push(makeEmptyPattern(filename));
    songPositions.push(0);
  }
  const restartPos = song.loop > 0 ? Math.min(Math.floor(song.loopStep / 4), songPositions.length - 1) : 0;
  const moduleName = song.title.trim() || filename.replace(/\.[^/.]+$/, "");
  const numDMPatterns = Math.floor(totalPatternRows / 64);
  const uadePatternLayout = {
    formatId: "digitalMugician",
    patternDataFileOffset: patternDataStart,
    bytesPerCell: 4,
    rowsPerPattern: 64,
    numChannels: 4,
    numPatterns: numDMPatterns,
    moduleSize: buf.byteLength,
    encodeCell: encodeDigitalMugicianCell,
    getCellFileOffset: (pattern, row, channel) => {
      if (pattern < 0 || pattern >= patternChannelBaseRows.length) return patternDataStart;
      if (channel < 0 || channel >= 4) return patternDataStart;
      const baseRow = patternChannelBaseRows[pattern][channel];
      return patternDataStart + (baseRow + row) * 4;
    }
  };
  return {
    name: moduleName,
    format: "MOD",
    patterns: trackerPatterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: restartPos,
    numChannels: 4,
    initialSpeed: songSpeed > 0 ? songSpeed : 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename,
    uadePatternLayout
  };
}
function makeEmptyPattern(filename) {
  return {
    id: "pattern-0",
    name: "Pattern 0",
    length: 64,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
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
      sourceFormat: "MOD",
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: 4,
      originalPatternCount: 0,
      originalInstrumentCount: 0
    }
  };
}
export {
  parseDigitalMugicianFile
};
