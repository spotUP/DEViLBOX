import { b$ as registerPatternEncoder, c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function createFCEncoder(instrReverseMap) {
  return function encodeFCCell(cell) {
    const out = new Uint8Array(2);
    const xmNote = cell.note ?? 0;
    if (xmNote === 97) {
      out[0] = 73;
    } else if (xmNote > 0 && xmNote <= 96) {
      const raw = xmNote - 37;
      if (raw >= 1 && raw <= 72) {
        out[0] = raw;
      }
    }
    const instrId = cell.instrument ?? 0;
    if (instrId > 0) {
      const fcIdx = instrReverseMap.get(instrId) ?? 0;
      out[1] = fcIdx & 63;
    }
    return out;
  };
}
registerPatternEncoder("futureComposer", () => createFCEncoder(/* @__PURE__ */ new Map()));
function u16BE(buf, off) {
  return buf[off] << 8 | buf[off + 1];
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function s8(v) {
  return v < 128 ? v : v - 256;
}
function fcPeriodIdxToXM(periodIdx) {
  const idx = periodIdx & 127;
  const period = idx < FC_PERIODS.length ? FC_PERIODS[idx] : 113;
  const p = Math.max(113, Math.min(3424, period));
  const note = Math.round(12 * Math.log2(3424 / p)) + 1;
  return Math.max(1, Math.min(96, note));
}
const FC_PERIODS = [
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
  113,
  113,
  113,
  113,
  113,
  113,
  113,
  113,
  113,
  113,
  113,
  113,
  113,
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
  113,
  113,
  113,
  113,
  113,
  113,
  113,
  113,
  113,
  113,
  113,
  113,
  113
];
const FC13_WAVES = [
  // Lengths (47 values): waves 0-31 = 16 words each, 32-39 = 8 words each, then misc
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  8,
  8,
  8,
  8,
  8,
  8,
  8,
  8,
  16,
  8,
  16,
  16,
  8,
  8,
  24,
  // Wave 0: XOR triangle variant (32 bytes)
  -64,
  -64,
  -48,
  -40,
  -32,
  -24,
  -16,
  -8,
  0,
  -8,
  -16,
  -24,
  -32,
  -40,
  -48,
  -56,
  63,
  55,
  47,
  39,
  31,
  23,
  15,
  7,
  -1,
  7,
  15,
  23,
  31,
  39,
  47,
  55,
  // Wave 1
  -64,
  -64,
  -48,
  -40,
  -32,
  -24,
  -16,
  -8,
  0,
  -8,
  -16,
  -24,
  -32,
  -40,
  -48,
  -56,
  -64,
  55,
  47,
  39,
  31,
  23,
  15,
  7,
  -1,
  7,
  15,
  23,
  31,
  39,
  47,
  55,
  // Wave 2
  -64,
  -64,
  -48,
  -40,
  -32,
  -24,
  -16,
  -8,
  0,
  -8,
  -16,
  -24,
  -32,
  -40,
  -48,
  -56,
  -64,
  -72,
  47,
  39,
  31,
  23,
  15,
  7,
  -1,
  7,
  15,
  23,
  31,
  39,
  47,
  55,
  // Wave 3
  -64,
  -64,
  -48,
  -40,
  -32,
  -24,
  -16,
  -8,
  0,
  -8,
  -16,
  -24,
  -32,
  -40,
  -48,
  -56,
  -64,
  -72,
  -80,
  39,
  31,
  23,
  15,
  7,
  -1,
  7,
  15,
  23,
  31,
  39,
  47,
  55,
  // Wave 4
  -64,
  -64,
  -48,
  -40,
  -32,
  -24,
  -16,
  -8,
  0,
  -8,
  -16,
  -24,
  -32,
  -40,
  -48,
  -56,
  -64,
  -72,
  -80,
  -88,
  31,
  23,
  15,
  7,
  -1,
  7,
  15,
  23,
  31,
  39,
  47,
  55,
  // Wave 5
  -64,
  -64,
  -48,
  -40,
  -32,
  -24,
  -16,
  -8,
  0,
  -8,
  -16,
  -24,
  -32,
  -40,
  -48,
  -56,
  -64,
  -72,
  -80,
  -88,
  -96,
  23,
  15,
  7,
  -1,
  7,
  15,
  23,
  31,
  39,
  47,
  55,
  // Wave 6
  -64,
  -64,
  -48,
  -40,
  -32,
  -24,
  -16,
  -8,
  0,
  -8,
  -16,
  -24,
  -32,
  -40,
  -48,
  -56,
  -64,
  -72,
  -80,
  -88,
  -96,
  -104,
  15,
  7,
  -1,
  7,
  15,
  23,
  31,
  39,
  47,
  55,
  // Wave 7
  -64,
  -64,
  -48,
  -40,
  -32,
  -24,
  -16,
  -8,
  0,
  -8,
  -16,
  -24,
  -32,
  -40,
  -48,
  -56,
  -64,
  -72,
  -80,
  -88,
  -96,
  -104,
  -112,
  7,
  -1,
  7,
  15,
  23,
  31,
  39,
  47,
  55,
  // Wave 8
  -64,
  -64,
  -48,
  -40,
  -32,
  -24,
  -16,
  -8,
  0,
  -8,
  -16,
  -24,
  -32,
  -40,
  -48,
  -56,
  -64,
  -72,
  -80,
  -88,
  -96,
  -104,
  -112,
  -120,
  -1,
  7,
  15,
  23,
  31,
  39,
  47,
  55,
  // Wave 9
  -64,
  -64,
  -48,
  -40,
  -32,
  -24,
  -16,
  -8,
  0,
  -8,
  -16,
  -24,
  -32,
  -40,
  -48,
  -56,
  -64,
  -72,
  -80,
  -88,
  -96,
  -104,
  -112,
  -120,
  -128,
  7,
  15,
  23,
  31,
  39,
  47,
  55,
  // Wave 10
  -64,
  -64,
  -48,
  -40,
  -32,
  -24,
  -16,
  -8,
  0,
  -8,
  -16,
  -24,
  -32,
  -40,
  -48,
  -56,
  -64,
  -72,
  -80,
  -88,
  -96,
  -104,
  -112,
  -120,
  -128,
  -120,
  15,
  23,
  31,
  39,
  47,
  55,
  // Wave 11
  -64,
  -64,
  -48,
  -40,
  -32,
  -24,
  -16,
  -8,
  0,
  -8,
  -16,
  -24,
  -32,
  -40,
  -48,
  -56,
  -64,
  -72,
  -80,
  -88,
  -96,
  -104,
  -112,
  -120,
  -128,
  -120,
  -112,
  23,
  31,
  39,
  47,
  55,
  // Wave 12
  -64,
  -64,
  -48,
  -40,
  -32,
  -24,
  -16,
  -8,
  0,
  -8,
  -16,
  -24,
  -32,
  -40,
  -48,
  -56,
  -64,
  -72,
  -80,
  -88,
  -96,
  -104,
  -112,
  -120,
  -128,
  -120,
  -112,
  -104,
  31,
  39,
  47,
  55,
  // Wave 13
  -64,
  -64,
  -48,
  -40,
  -32,
  -24,
  -16,
  -8,
  0,
  -8,
  -16,
  -24,
  -32,
  -40,
  -48,
  -56,
  -64,
  -72,
  -80,
  -88,
  -96,
  -104,
  -112,
  -120,
  -128,
  -120,
  -112,
  -104,
  -96,
  39,
  47,
  55,
  // Wave 14
  -64,
  -64,
  -48,
  -40,
  -32,
  -24,
  -16,
  -8,
  0,
  -8,
  -16,
  -24,
  -32,
  -40,
  -48,
  -56,
  -64,
  -72,
  -80,
  -88,
  -96,
  -104,
  -112,
  -120,
  -128,
  -120,
  -112,
  -104,
  -96,
  -88,
  47,
  55,
  // Wave 15
  -64,
  -64,
  -48,
  -40,
  -32,
  -24,
  -16,
  -8,
  0,
  -8,
  -16,
  -24,
  -32,
  -40,
  -48,
  -56,
  -64,
  -72,
  -80,
  -88,
  -96,
  -104,
  -112,
  -120,
  -128,
  -120,
  -112,
  -104,
  -96,
  -88,
  -80,
  55,
  // Waves 16-31: pulse waves (32 bytes each, varying duty cycle)
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  127,
  127,
  127,
  127,
  127,
  127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  127,
  127,
  127,
  127,
  127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  -127,
  127,
  127,
  127,
  127,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  127,
  127,
  127,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  127,
  127,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  127,
  // Waves 32-39: tiny pulse waves (16 bytes each)
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  -128,
  -128,
  -128,
  -128,
  -128,
  -128,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  -128,
  -128,
  -128,
  -128,
  -128,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  -128,
  -128,
  -128,
  -128,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  -128,
  -128,
  -128,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  -128,
  -128,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  -128,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  // Wave 40: sawtooth (32 bytes)
  -128,
  -128,
  -112,
  -104,
  -96,
  -88,
  -80,
  -72,
  -64,
  -56,
  -48,
  -40,
  -32,
  -24,
  -16,
  -8,
  0,
  8,
  16,
  24,
  32,
  40,
  48,
  56,
  64,
  72,
  80,
  88,
  96,
  104,
  112,
  127,
  // Wave 41: tiny sawtooth (16 bytes)
  -128,
  -96,
  -80,
  -64,
  -48,
  -32,
  -16,
  0,
  16,
  32,
  48,
  64,
  80,
  96,
  112,
  127,
  // Wave 42: custom waveform 1 (32 bytes)
  69,
  69,
  121,
  125,
  122,
  119,
  112,
  102,
  97,
  88,
  83,
  77,
  44,
  32,
  24,
  18,
  4,
  -37,
  -45,
  -51,
  -58,
  -68,
  -75,
  -82,
  -88,
  -93,
  -99,
  -103,
  -109,
  -114,
  -117,
  -118,
  // Wave 43: custom waveform 2 (32 bytes)
  69,
  69,
  121,
  125,
  122,
  119,
  112,
  102,
  91,
  75,
  67,
  55,
  44,
  32,
  24,
  18,
  4,
  -8,
  -24,
  -37,
  -49,
  -58,
  -66,
  -80,
  -88,
  -92,
  -98,
  -102,
  -107,
  -108,
  -115,
  -125,
  // Wave 44: tiny triangle (16 bytes)
  0,
  0,
  64,
  96,
  127,
  96,
  64,
  32,
  0,
  -32,
  -64,
  -96,
  -128,
  -96,
  -64,
  -32,
  // Wave 45: tiny triangle variant (16 bytes)
  0,
  0,
  64,
  96,
  127,
  96,
  64,
  32,
  0,
  -32,
  -64,
  -96,
  -128,
  -96,
  -64,
  -32,
  // Wave 46: sawtooth + tiny saw combined (48 bytes)
  -128,
  -128,
  -112,
  -104,
  -96,
  -88,
  -80,
  -72,
  -64,
  -56,
  -48,
  -40,
  -32,
  -24,
  -16,
  -8,
  0,
  8,
  16,
  24,
  32,
  40,
  48,
  56,
  64,
  72,
  80,
  88,
  96,
  104,
  112,
  127,
  -128,
  -96,
  -80,
  -64,
  -48,
  -32,
  -16,
  0,
  16,
  32,
  48,
  64,
  80,
  96,
  112,
  127
];
function extractFC13Wave(waveIndex) {
  if (waveIndex < 0 || waveIndex >= 47) return new Uint8Array(0);
  let dataOffset = 47;
  for (let i = 0; i < waveIndex; i++) {
    dataOffset += FC13_WAVES[i] * 2;
  }
  const byteLen = FC13_WAVES[waveIndex] * 2;
  const result = new Uint8Array(byteLen);
  for (let i = 0; i < byteLen; i++) {
    result[i] = FC13_WAVES[dataOffset + i] & 255;
  }
  return result;
}
function createVoice() {
  return {
    note: 0,
    transpose: 0,
    pitch: 0,
    frqMacroIdx: 0,
    frqStep: 0,
    frqSustain: 0,
    frqTranspose: 0,
    volMacroIdx: 0,
    volStep: 0,
    volCtr: 1,
    volSpeed: 1,
    volSustain: 0,
    volBendFlag: 0,
    volBendSpeed: 0,
    volBendTime: 0,
    volume: 0,
    enabled: 0,
    vibratoFlag: 0,
    vibratoSpeed: 0,
    vibratoDepth: 0,
    vibratoDelay: 0,
    vibrato: 0,
    pitchBendFlag: 0,
    pitchBendSpeed: 0,
    pitchBendTime: 0,
    portamentoFlag: 0,
    portamento: 0,
    currentWaveform: -1,
    instrIdx: 0
  };
}
function processFreqMacro(voice, freqMacros) {
  let loopSustain;
  do {
    loopSustain = false;
    if (voice.frqSustain > 0) {
      voice.frqSustain--;
      break;
    }
    let fm = freqMacros[voice.frqMacroIdx];
    if (!fm) break;
    let loopEffect;
    do {
      loopEffect = false;
      if (voice.frqStep >= 64) break;
      let info = fm[voice.frqStep];
      if (info === 225) break;
      if (info === 224) {
        voice.frqStep = (voice.frqStep + 1 < 64 ? fm[voice.frqStep + 1] : 0) & 63;
        if (voice.frqStep >= 64) break;
        info = fm[voice.frqStep];
        if (info === 225) break;
      }
      switch (info) {
        case 226:
          voice.enabled = 1;
          voice.volCtr = 1;
          voice.volStep = 0;
          if (voice.frqStep + 1 < 64) {
            voice.currentWaveform = fm[voice.frqStep + 1];
          }
          voice.frqStep += 2;
          break;
        case 228:
          if (voice.frqStep + 1 < 64) {
            voice.currentWaveform = fm[voice.frqStep + 1];
          }
          voice.frqStep += 2;
          break;
        case 233: {
          if (voice.frqStep + 2 < 64) {
            voice.currentWaveform = 100 + fm[voice.frqStep + 1] * 10 + fm[voice.frqStep + 2];
          }
          voice.enabled = 1;
          voice.volCtr = 1;
          voice.volStep = 0;
          voice.frqStep += 3;
          break;
        }
        case 231: {
          loopEffect = true;
          if (voice.frqStep + 1 < 64) {
            const newIdx = fm[voice.frqStep + 1];
            if (newIdx < freqMacros.length) {
              voice.frqMacroIdx = newIdx;
              fm = freqMacros[newIdx];
            }
          }
          voice.frqStep = 0;
          break;
        }
        case 234:
          if (voice.frqStep + 2 < 64) {
            voice.pitchBendSpeed = s8(fm[voice.frqStep + 1]);
            voice.pitchBendTime = fm[voice.frqStep + 2];
          }
          voice.frqStep += 3;
          break;
        case 232:
          loopSustain = true;
          if (voice.frqStep + 1 < 64) {
            voice.frqSustain = fm[voice.frqStep + 1];
          }
          voice.frqStep += 2;
          break;
        case 227:
          if (voice.frqStep + 2 < 64) {
            voice.vibratoSpeed = fm[voice.frqStep + 1];
            voice.vibratoDepth = fm[voice.frqStep + 2];
          }
          voice.frqStep += 3;
          break;
      }
      if (!loopSustain && !loopEffect) {
        if (voice.frqStep < 64) {
          voice.frqTranspose = s8(fm[voice.frqStep]);
          voice.frqStep++;
        }
      }
    } while (loopEffect);
  } while (loopSustain);
}
function processVolMacro(voice, volMacros) {
  if (voice.volSustain > 0) {
    voice.volSustain--;
    return;
  }
  if (voice.volBendTime > 0) {
    voice.volBendFlag ^= 1;
    if (voice.volBendFlag) {
      voice.volBendTime--;
      voice.volume += voice.volBendSpeed;
      if (voice.volume < 0 || voice.volume > 64) voice.volBendTime = 0;
    }
    return;
  }
  voice.volCtr--;
  if (voice.volCtr > 0) return;
  voice.volCtr = voice.volSpeed;
  const vm = volMacros[voice.volMacroIdx];
  if (!vm) return;
  let loopEffect;
  do {
    loopEffect = false;
    const pos = 5 + voice.volStep;
    if (pos >= 64) break;
    const info = vm[pos];
    if (info === 225) break;
    switch (info) {
      case 234:
        if (pos + 2 < 64) {
          voice.volBendSpeed = s8(vm[pos + 1]);
          voice.volBendTime = vm[pos + 2];
        }
        voice.volStep += 3;
        voice.volBendFlag ^= 1;
        if (voice.volBendFlag) {
          voice.volBendTime--;
          voice.volume += voice.volBendSpeed;
          if (voice.volume < 0 || voice.volume > 64) voice.volBendTime = 0;
        }
        break;
      case 232:
        if (pos + 1 < 64) {
          voice.volSustain = vm[pos + 1];
        }
        voice.volStep += 2;
        break;
      case 224: {
        loopEffect = true;
        const target = pos + 1 < 64 ? vm[pos + 1] & 63 : 5;
        voice.volStep = Math.max(0, target - 5);
        break;
      }
      default:
        voice.volume = info;
        voice.volStep++;
        break;
    }
  } while (loopEffect);
}
function processVoicePitch(voice) {
  if (voice.vibratoDelay > 0) {
    voice.vibratoDelay--;
  } else if (voice.vibratoSpeed > 0 && voice.vibratoDepth > 0) {
    let temp = voice.vibrato;
    if (voice.vibratoFlag) {
      const delta = voice.vibratoDepth << 1;
      temp += voice.vibratoSpeed;
      if (temp > delta) {
        temp = delta;
        voice.vibratoFlag = 0;
      }
    } else {
      temp -= voice.vibratoSpeed;
      if (temp < 0) {
        temp = 0;
        voice.vibratoFlag = 1;
      }
    }
    voice.vibrato = temp;
  }
  voice.portamentoFlag ^= 1;
  if (voice.portamentoFlag && voice.portamento > 0) {
    if (voice.portamento > 31) {
      voice.pitch += voice.portamento & 31;
    } else {
      voice.pitch -= voice.portamento;
    }
  }
  voice.pitchBendFlag ^= 1;
  if (voice.pitchBendFlag && voice.pitchBendTime > 0) {
    voice.pitchBendTime--;
    voice.pitch -= voice.pitchBendSpeed;
  }
}
function isFollinFormat(buf) {
  if (buf.length < 32) return false;
  return buf[0] === 96 && buf[1] === 26;
}
function isFUCOFormat(buf) {
  if (buf.length < 16) return false;
  return buf[0] === 70 && buf[1] === 85 && buf[2] === 67 && buf[3] === 79;
}
function stubTrackerSong(filename, formatLabel) {
  const moduleName = filename.replace(/\.[^/.]+$/, "");
  const emptyRows = Array.from({ length: 32 }, () => ({
    note: 0,
    instrument: 0,
    volume: 0,
    effTyp: 0,
    eff: 0,
    effTyp2: 0,
    eff2: 0
  }));
  const pattern = {
    id: "pattern-0",
    name: "Pattern 0",
    length: 32,
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
      rows: emptyRows
    })),
    importMetadata: {
      sourceFormat: "FC",
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: 4,
      originalPatternCount: 0,
      originalInstrumentCount: 0
    }
  };
  return {
    name: `${moduleName} [${formatLabel}]`,
    format: "FC",
    patterns: [pattern],
    instruments: [],
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false
  };
}
function parseFCFile(buffer, filename, moduleBase = 0) {
  const buf = new Uint8Array(buffer);
  if (isFollinFormat(buf)) {
    return stubTrackerSong(filename, "Follin Player II");
  }
  if (isFUCOFormat(buf)) {
    return stubTrackerSong(filename, "FC BSI");
  }
  const magic = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
  if (magic !== "FC13" && magic !== "FC14" && magic !== "SMOD") {
    throw new Error(`Not a Future Composer file: magic="${magic}"`);
  }
  const isFC14 = magic === "FC14";
  let off = 4;
  const seqLen = u32BE(buf, off);
  off += 4;
  const patPtr = u32BE(buf, off);
  off += 4;
  const patLen = u32BE(buf, off);
  off += 4;
  const freqMacroPtr = u32BE(buf, off);
  off += 4;
  const freqMacroLen = u32BE(buf, off);
  off += 4;
  const volMacroPtr = u32BE(buf, off);
  off += 4;
  const volMacroLen = u32BE(buf, off);
  off += 4;
  const samplePtr = u32BE(buf, off);
  off += 4;
  const wavePtr = u32BE(buf, off);
  off += 4;
  const sampleDefsFileOffset = off;
  const sampleDefs = [];
  for (let i = 0; i < 10; i++) {
    sampleDefs.push({
      len: u16BE(buf, off),
      loopStart: u16BE(buf, off + 2),
      loopLen: u16BE(buf, off + 4)
    });
    off += 6;
  }
  const waveLengths = [];
  if (isFC14) {
    for (let i = 0; i < 80; i++) waveLengths.push(buf[off++]);
  }
  const numSeqs = Math.floor(seqLen / 13);
  const sequences = [];
  for (let i = 0; i < numSeqs; i++) {
    sequences.push({
      pat: [buf[off], buf[off + 3], buf[off + 6], buf[off + 9]],
      transpose: [s8(buf[off + 1]), s8(buf[off + 4]), s8(buf[off + 7]), s8(buf[off + 10])],
      offsetIns: [s8(buf[off + 2]), s8(buf[off + 5]), s8(buf[off + 8]), s8(buf[off + 11])],
      speed: buf[off + 12]
    });
    off += 13;
  }
  const numFCPatterns = Math.floor(patLen / 64);
  const fcPatterns = [];
  for (let i = 0; i < numFCPatterns; i++) {
    const base = patPtr + i * 64;
    const note = new Uint8Array(32);
    const val = new Uint8Array(32);
    for (let row = 0; row < 32; row++) {
      note[row] = buf[base + row * 2];
      val[row] = buf[base + row * 2 + 1];
    }
    fcPatterns.push({ note, val });
  }
  const numFreqMacros = Math.floor(freqMacroLen / 64);
  const freqMacros = [];
  for (let i = 0; i < numFreqMacros; i++) {
    freqMacros.push(buf.slice(freqMacroPtr + i * 64, freqMacroPtr + i * 64 + 64));
  }
  const numVolMacros = Math.floor(volMacroLen / 64);
  const volMacros = [];
  for (let i = 0; i < numVolMacros; i++) {
    volMacros.push(buf.slice(volMacroPtr + i * 64, volMacroPtr + i * 64 + 64));
  }
  const samplePCMs = [];
  let sampleReadOff = samplePtr;
  for (let i = 0; i < 10; i++) {
    const byteLen = sampleDefs[i].len * 2;
    if (byteLen > 0 && sampleReadOff + byteLen <= buf.length) {
      samplePCMs.push(buf.slice(sampleReadOff, sampleReadOff + byteLen));
    } else {
      samplePCMs.push(new Uint8Array(0));
    }
    sampleReadOff += byteLen;
    if (isFC14 && byteLen > 0) sampleReadOff += 2;
  }
  const waveTablePCMs = [];
  if (isFC14) {
    let waveReadOff = wavePtr;
    for (let i = 0; i < 80; i++) {
      const byteLen = waveLengths[i] * 2;
      if (byteLen > 0 && waveReadOff + byteLen <= buf.length) {
        waveTablePCMs.push(buf.slice(waveReadOff, waveReadOff + byteLen));
      } else {
        waveTablePCMs.push(new Uint8Array(0));
      }
      waveReadOff += byteLen;
    }
  }
  const instruments = [];
  const waveToInstrument = /* @__PURE__ */ new Map();
  const macroToInstrument = /* @__PURE__ */ new Map();
  let nextInstrumentId = 1;
  function buildFCConfig(instrIdx) {
    const vm = instrIdx < volMacros.length ? volMacros[instrIdx] : null;
    if (!vm) {
      return {
        waveNumber: 0,
        synthTable: [],
        synthSpeed: 1,
        atkLength: 4,
        atkVolume: 64,
        decLength: 8,
        decVolume: 32,
        sustVolume: 32,
        relLength: 8,
        vibDelay: 0,
        vibSpeed: 0,
        vibDepth: 0,
        arpTable: new Array(16).fill(0)
      };
    }
    const volSpeed = vm[0] > 0 ? vm[0] : 1;
    const freqMacroIdx = vm[1] || 0;
    const vibSpeed = vm[2] || 0;
    const vibDepth = vm[3] || 0;
    const vibDelay = vm[4] || 0;
    const synthTable = [];
    let initialWaveNum = 0;
    const fm = freqMacroIdx < freqMacros.length ? freqMacros[freqMacroIdx] : null;
    if (fm) {
      let i = 0;
      while (i < 64 && synthTable.length < 16) {
        const b = fm[i];
        if (b === 225) break;
        if (b === 224) {
          i += 2;
          continue;
        }
        if (b === 226 || b === 228) {
          if (i + 1 < 64) {
            const waveRef = fm[i + 1];
            const maxRef = isFC14 ? 90 : 57;
            if (waveRef >= 10 && waveRef < maxRef) {
              const fcWaveIdx = waveRef - 10;
              if (synthTable.length === 0) initialWaveNum = fcWaveIdx;
              synthTable.push({ waveNum: fcWaveIdx, transposition: 0, effect: b === 226 ? 1 : 0 });
            }
            i += 2;
            continue;
          }
        }
        if (b === 227 || b === 234 || b === 232) {
          i += 3;
          continue;
        }
        if (b === 233) {
          i += 4;
          continue;
        }
        if (b === 231) {
          i += 2;
          continue;
        }
        i++;
      }
    }
    let atkVolume = 32, atkLength = 4;
    let decVolume = 16, decLength = 8;
    let sustVolume = 16, relLength = 8;
    let maxVol = 0, maxVolPos = 0;
    for (let i = 5; i < 64; i++) {
      const v = vm[i];
      if (v === 225) break;
      if (v < 224 && v > maxVol) {
        maxVol = v;
        maxVolPos = i - 5;
      }
    }
    if (maxVol > 0) {
      atkVolume = Math.min(64, maxVol);
      atkLength = Math.min(255, Math.max(1, maxVolPos) * volSpeed);
      decVolume = Math.min(64, Math.round(atkVolume * 0.5));
      decLength = Math.min(255, 8 * volSpeed);
      sustVolume = Math.min(64, Math.max(8, Math.round(atkVolume * 0.4)));
      relLength = Math.min(255, 8 * volSpeed);
    }
    let rawWave;
    if (isFC14 && initialWaveNum < waveTablePCMs.length && waveTablePCMs[initialWaveNum].length > 0) {
      rawWave = waveTablePCMs[initialWaveNum];
    } else {
      rawWave = extractFC13Wave(Math.min(46, initialWaveNum));
    }
    const wavePCM = [];
    for (let i = 0; i < rawWave.length; i++) {
      wavePCM.push(rawWave[i] < 128 ? rawWave[i] : rawWave[i] - 256);
    }
    const volMacroData = [];
    for (let i = 5; i < 64; i++) {
      volMacroData.push(vm[i]);
    }
    return {
      waveNumber: initialWaveNum,
      wavePCM: wavePCM.length > 0 ? wavePCM : void 0,
      volMacroData,
      volMacroSpeed: volSpeed,
      synthTable,
      synthSpeed: Math.max(1, Math.min(15, volSpeed)),
      atkLength,
      atkVolume,
      decLength,
      decVolume,
      sustVolume,
      relLength,
      vibDelay,
      vibSpeed,
      vibDepth,
      arpTable: new Array(16).fill(0)
    };
  }
  function getOrCreateFCInstrument(instrIdx) {
    if (macroToInstrument.has(instrIdx)) return macroToInstrument.get(instrIdx);
    const id = nextInstrumentId++;
    macroToInstrument.set(instrIdx, id);
    const config = buildFCConfig(instrIdx);
    const chipRam = {
      moduleBase,
      moduleSize: buffer.byteLength,
      instrBase: moduleBase + volMacroPtr + instrIdx * 64,
      instrSize: 64,
      sections: {
        freqMacros: moduleBase + freqMacroPtr,
        volMacros: moduleBase + volMacroPtr,
        waveData: moduleBase + wavePtr,
        sampleData: moduleBase + samplePtr,
        sampleDefs: moduleBase + sampleDefsFileOffset
      }
    };
    instruments.push({
      id,
      name: `FC Inst ${instrIdx + 1}`,
      type: "synth",
      synthType: "FCSynth",
      fc: config,
      effects: [],
      volume: -6,
      pan: 0,
      uadeChipRam: chipRam
    });
    return id;
  }
  function getOrCreateInstrument(waveIdx) {
    if (waveToInstrument.has(waveIdx)) return waveToInstrument.get(waveIdx);
    const id = nextInstrumentId++;
    waveToInstrument.set(waveIdx, id);
    const chipRam = {
      moduleBase,
      moduleSize: buffer.byteLength,
      instrBase: moduleBase + sampleDefsFileOffset + waveIdx * 6,
      instrSize: 6,
      sections: {
        freqMacros: moduleBase + freqMacroPtr,
        volMacros: moduleBase + volMacroPtr,
        waveData: moduleBase + wavePtr,
        sampleData: moduleBase + samplePtr,
        sampleDefs: moduleBase + sampleDefsFileOffset
      }
    };
    if (waveIdx < 10) {
      if (sampleDefs[waveIdx].len > 0) {
        const def = sampleDefs[waveIdx];
        const loopStart = def.loopLen > 1 ? def.loopStart : 0;
        const loopEnd = def.loopLen > 1 ? def.loopStart + def.loopLen * 2 : 0;
        const instr = createSamplerInstrument(
          id,
          `Sample ${waveIdx}`,
          samplePCMs[waveIdx],
          64,
          8287,
          loopStart,
          loopEnd
        );
        instr.uadeChipRam = chipRam;
        instruments.push(instr);
      } else {
        const instr = makePlaceholder(id, `Sample ${waveIdx}`);
        instr.uadeChipRam = chipRam;
        instruments.push(instr);
      }
    } else if (waveIdx >= 100) {
      instruments.push(makePlaceholder(id, `Pack ${Math.floor((waveIdx - 100) / 10)}:${(waveIdx - 100) % 10}`));
    } else {
      instruments.push(makePlaceholder(id, `Unknown ${waveIdx}`));
    }
    return id;
  }
  function makePlaceholder(id, name) {
    return {
      id,
      name,
      type: "synth",
      synthType: "Synth",
      effects: [],
      volume: -6,
      pan: 0
    };
  }
  const voices = [createVoice(), createVoice(), createVoice(), createVoice()];
  let currentSpeed = 3;
  const trackerPatterns = [];
  for (let seqIdx = 0; seqIdx < sequences.length; seqIdx++) {
    const seq = sequences[seqIdx];
    const channelRows = [[], [], [], []];
    if (seq.speed > 0) currentSpeed = seq.speed;
    for (let row = 0; row < 32; row++) {
      const triggered = [false, false, false, false];
      const waveformBefore = voices.map((v) => v.currentWaveform);
      for (let ch = 0; ch < 4; ch++) {
        const voice = voices[ch];
        const patIdx = seq.pat[ch];
        const fcPat = patIdx < fcPatterns.length ? fcPatterns[patIdx] : null;
        const fcNote = fcPat ? fcPat.note[row] : 0;
        const fcVal = fcPat ? fcPat.val[row] : 0;
        if (fcNote !== 0 && fcNote < 73) {
          voice.note = fcNote & 127;
          voice.pitch = 0;
          voice.portamento = 0;
          voice.enabled = 0;
          triggered[ch] = true;
          const instrIdx = Math.max(0, (fcVal & 63) + seq.offsetIns[ch]);
          voice.instrIdx = instrIdx;
          if (instrIdx < volMacros.length) {
            const vm = volMacros[instrIdx];
            voice.volMacroIdx = instrIdx;
            voice.volStep = 0;
            voice.volSpeed = vm[0] || 1;
            voice.volCtr = voice.volSpeed;
            voice.volSustain = 0;
            const freqIdx = vm[1];
            if (freqIdx < freqMacros.length) {
              voice.frqMacroIdx = freqIdx;
            }
            voice.frqStep = 0;
            voice.frqSustain = 0;
            voice.vibratoFlag = 0;
            voice.vibratoSpeed = vm[2];
            voice.vibratoDepth = vm[3];
            voice.vibrato = 0;
            voice.vibratoDelay = vm[4];
            voice.frqTranspose = 0;
            voice.volBendFlag = 0;
            voice.volBendSpeed = 0;
            voice.volBendTime = 0;
            voice.pitchBendFlag = 0;
            voice.pitchBendSpeed = 0;
            voice.pitchBendTime = 0;
          }
        }
        if (fcVal & 64) {
          voice.portamento = 0;
        } else if (fcVal & 128) {
          if (row < 31 && fcPat) {
            voice.portamento = fcPat.val[row + 1];
            if (!isFC14) voice.portamento <<= 1;
          }
        }
      }
      const stableTranspose = [0, 0, 0, 0];
      for (let ch = 0; ch < 4; ch++) {
        if (triggered[ch]) {
          const v = voices[ch];
          const fm = v.frqMacroIdx < freqMacros.length ? freqMacros[v.frqMacroIdx] : null;
          if (fm) {
            let step = 0;
            for (let iter = 0; iter < 64 && step < 64; iter++) {
              const b = fm[step];
              if (b === 225) break;
              if (b === 224) {
                step = (step + 1 < 64 ? fm[step + 1] : 0) & 63;
                continue;
              }
              if (b === 226 || b === 228) {
                step += 2;
                continue;
              }
              if (b === 227 || b === 234) {
                step += 3;
                continue;
              }
              if (b === 231) {
                step += 2;
                continue;
              }
              if (b === 232) {
                step += 2;
                continue;
              }
              if (b === 233) {
                step += 3;
                continue;
              }
              const sb = b < 128 ? b : b - 256;
              if (sb !== 0) {
                stableTranspose[ch] = sb;
                break;
              }
              step++;
            }
          }
        }
      }
      for (let tick = 0; tick < currentSpeed; tick++) {
        for (let ch = 0; ch < 4; ch++) {
          processFreqMacro(voices[ch], freqMacros);
          processVolMacro(voices[ch], volMacros);
          processVoicePitch(voices[ch]);
        }
      }
      for (let ch = 0; ch < 4; ch++) {
        const voice = voices[ch];
        const fcPat = seq.pat[ch] < fcPatterns.length ? fcPatterns[seq.pat[ch]] : null;
        const fcNote = fcPat ? fcPat.note[row] : 0;
        const isFCSynth = voice.currentWaveform >= 10;
        let xmNote = 0;
        if (triggered[ch]) {
          const transpose = voice.frqTranspose !== 0 ? voice.frqTranspose : stableTranspose[ch];
          let periodIdx;
          if (transpose >= 0) {
            periodIdx = transpose + voice.note + seq.transpose[ch] & 127;
          } else {
            periodIdx = transpose & 127;
          }
          xmNote = fcPeriodIdxToXM(periodIdx);
        } else if (fcNote === 73 || fcPat && fcPat.val[row] === 240) {
          xmNote = 97;
        }
        let instrument = 0;
        if (voice.currentWaveform >= 0) {
          if (triggered[ch] || voice.currentWaveform !== waveformBefore[ch]) {
            if (voice.currentWaveform < 10) {
              instrument = getOrCreateInstrument(voice.currentWaveform);
            } else {
              instrument = getOrCreateFCInstrument(voice.instrIdx);
            }
          }
        }
        let xmVolume = 0;
        if (!isFCSynth) {
          const vol = Math.max(0, Math.min(64, voice.volume));
          xmVolume = triggered[ch] || voice.enabled ? 16 + vol : 0;
        }
        let effTyp = 0, eff = 0;
        let effTyp2 = 0, eff2 = 0;
        if (voice.vibratoSpeed > 0 && voice.vibratoDepth > 0 && voice.vibratoDelay === 0) {
          effTyp = 4;
          const vSpeed = Math.min(voice.vibratoSpeed, 15);
          const vDepth = Math.min(voice.vibratoDepth, 15);
          eff = vSpeed << 4 | vDepth;
        }
        if (effTyp === 0 && voice.portamento > 0) {
          if (voice.portamento > 31) {
            effTyp = 2;
            eff = Math.min(voice.portamento & 31, 255);
          } else {
            effTyp = 1;
            eff = Math.min(voice.portamento, 255);
          }
        }
        if (effTyp === 0 && voice.pitchBendTime > 0 && voice.pitchBendSpeed !== 0) {
          if (voice.pitchBendSpeed > 0) {
            effTyp = 1;
            eff = Math.min(voice.pitchBendSpeed, 255);
          } else {
            effTyp = 2;
            eff = Math.min(-voice.pitchBendSpeed, 255);
          }
        }
        if (ch === 3 && row === 0 && seq.speed > 0) {
          if (effTyp === 0) {
            effTyp = 15;
            eff = seq.speed;
          } else {
            effTyp2 = 15;
            eff2 = seq.speed;
          }
        }
        channelRows[ch].push({
          note: xmNote,
          instrument,
          volume: xmVolume,
          effTyp,
          eff,
          effTyp2,
          eff2
        });
      }
    }
    trackerPatterns.push({
      id: `pattern-${seqIdx}`,
      name: `Pattern ${seqIdx}`,
      length: 32,
      channels: channelRows.map((rows, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: ch === 0 || ch === 3 ? -50 : 50,
        // Amiga LRRL hard stereo
        instrumentId: null,
        color: null,
        rows
      })),
      importMetadata: {
        sourceFormat: "FC",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: 4,
        originalPatternCount: numFCPatterns,
        originalInstrumentCount: numVolMacros || 10
      }
    });
  }
  if (trackerPatterns.length === 0) {
    trackerPatterns.push({
      id: "pattern-0",
      name: "Pattern 0",
      length: 32,
      channels: Array.from({ length: 4 }, (_, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: ch === 0 || ch === 3 ? -50 : 50,
        // Amiga LRRL hard stereo
        instrumentId: null,
        color: null,
        rows: Array.from({ length: 32 }, () => ({
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
        sourceFormat: "FC",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: 4,
        originalPatternCount: 0,
        originalInstrumentCount: 0
      }
    });
  }
  const moduleName = filename.replace(/\.[^/.]+$/, "");
  const instrReverseMap = /* @__PURE__ */ new Map();
  for (const [macroIdx, instrId] of macroToInstrument) instrReverseMap.set(instrId, macroIdx);
  for (const [waveIdx, instrId] of waveToInstrument) instrReverseMap.set(instrId, waveIdx);
  const uadePatternLayout = {
    formatId: "futureComposer",
    patternDataFileOffset: patPtr,
    bytesPerCell: 2,
    rowsPerPattern: 32,
    numChannels: 4,
    numPatterns: numFCPatterns,
    moduleSize: buffer.byteLength,
    encodeCell: createFCEncoder(instrReverseMap),
    getCellFileOffset: (pattern, row, channel) => {
      const seq = sequences[pattern];
      if (!seq) return 0;
      const fcPatIdx = seq.pat[channel];
      return patPtr + fcPatIdx * 64 + row * 2;
    }
  };
  return {
    name: moduleName,
    format: "FC",
    patterns: trackerPatterns,
    instruments,
    songPositions: trackerPatterns.map((_, i) => i),
    songLength: trackerPatterns.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: sequences.length > 0 && sequences[0].speed > 0 ? sequences[0].speed : 3,
    // FC speed maps directly to MOD ticks-per-row; VBlank is always 50 Hz
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename,
    uadePatternLayout
  };
}
export {
  FC_PERIODS,
  extractFC13Wave,
  parseFCFile
};
