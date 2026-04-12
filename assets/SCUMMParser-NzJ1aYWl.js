import { e as encodeSCUMMCell } from "./SCUMMEncoder-DscPMg-Y.js";
import "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function emptyCell() {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function isSCUMMFormat(buffer) {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (data.length < 16) return false;
  return data[4] === 96;
}
function parseSCUMMFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  const name = filename.replace(/\.[^.]+$/, "").replace(/^[^.]+\./, "");
  const NUM_CHANNELS = 4;
  const ROWS = 64;
  let sampleCount = NUM_CHANNELS;
  try {
    const scanEnd = Math.min(buf.length - 4, 1024);
    for (let off = 0; off < Math.min(4, buf.length - 2); off += 2) {
      const val = u16BE(buf, off);
      if (val >= 1 && val <= 32) {
        sampleCount = val;
        break;
      }
    }
    for (let off = 8; off < scanEnd; off += 2) {
      const op = u16BE(buf, off);
      if (op === 16890 && off + 4 <= buf.length) {
        const disp = u16BE(buf, off + 2);
        const signedDisp = disp < 32768 ? disp : disp - 65536;
        const target = off + 2 + signedDisp;
        if (target > 0 && target + 8 <= buf.length) {
          let count = 0;
          let soff = target;
          for (let i = 0; i < 32 && soff + 4 <= buf.length; i++) {
            const ptr = u32BE(buf, soff);
            if (ptr === 0 || ptr > buf.length * 4) break;
            count++;
            soff += 4;
          }
          if (count >= 2 && count <= 32) {
            sampleCount = count;
            break;
          }
        }
      }
    }
  } catch {
  }
  const pattern = {
    id: "pattern-0",
    name: "Pattern 0",
    length: ROWS,
    channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `SCUMM ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: ROWS }, () => emptyCell())
    })),
    importMetadata: {
      sourceFormat: "MOD",
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: NUM_CHANNELS,
      originalPatternCount: 1,
      originalInstrumentCount: sampleCount
    }
  };
  const instruments = Array.from({ length: sampleCount }, (_, i) => ({
    id: i + 1,
    name: `SCUMM Sound ${i + 1}`,
    type: "sample",
    synthType: "Sampler",
    effects: [],
    volume: -6,
    pan: 0
  }));
  const uadePatternLayout = {
    formatId: "scumm",
    patternDataFileOffset: 0,
    bytesPerCell: 4,
    rowsPerPattern: ROWS,
    numChannels: NUM_CHANNELS,
    numPatterns: 1,
    moduleSize: buffer.byteLength,
    encodeCell: encodeSCUMMCell
  };
  return {
    name: `${name} [SCUMM]`,
    format: "MOD",
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename,
    uadePatternLayout
  };
}
export {
  isSCUMMFormat,
  parseSCUMMFile
};
