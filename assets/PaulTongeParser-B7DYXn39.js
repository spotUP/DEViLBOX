import { c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const MIN_FILE_SIZE = 8;
const MAX_INSTRUMENTS = 64;
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function s16BE(buf, off) {
  const v = u16BE(buf, off);
  return v >= 32768 ? v - 65536 : v;
}
function isPaulTongeFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  let off = 0;
  if (u16BE(buf, off) !== 12) return false;
  off += 2;
  let foundOne = false;
  for (let i = 0; i < 3; i++) {
    if (off + 2 > buf.length) return false;
    const d1raw = u16BE(buf, off);
    off += 2;
    if (d1raw & 32768) return false;
    if (d1raw === 0) continue;
    if (d1raw & 1) return false;
    const indOff = d1raw;
    if (indOff + 2 > buf.length) return false;
    const indWord = s16BE(buf, indOff);
    if (indWord <= 0) return false;
    const byteOff = d1raw - 1;
    if (byteOff >= buf.length) return false;
    const b = buf[byteOff];
    if (b !== 128 && b !== 143) return false;
    foundOne = true;
  }
  return foundOne;
}
function parsePaulTongeFile(buffer, filename) {
  var _a;
  const buf = new Uint8Array(buffer);
  const _base = ((_a = filename.split("/").pop()) == null ? void 0 : _a.toLowerCase()) ?? "";
  if (!_base.startsWith("pat.") && !_base.endsWith(".tf") && !isPaulTongeFormat(buf)) throw new Error("Not a Paul Tonge module");
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^pat\./i, "") || baseName;
  const instruments = [];
  let samplesExtracted = false;
  let sampleCount = 0;
  let maxModuleOff = 8;
  for (let i = 0; i < 4; i++) {
    const voff = u16BE(buf, i * 2);
    if (voff > 0 && voff < buf.length) {
      let scan = voff;
      while (scan + 2 <= buf.length) {
        const w = u16BE(buf, scan);
        if (w === 32768 || w === 36608) {
          scan += 2;
          break;
        }
        scan += 2;
      }
      if (scan > maxModuleOff) maxModuleOff = scan;
    }
  }
  function trySampleTableAt(tableOff) {
    const entries = [];
    let pos = tableOff;
    for (let i = 0; i < MAX_INSTRUMENTS; i++) {
      if (pos + 4 > buf.length) return null;
      const off32 = u32BE(buf, pos);
      if (off32 === 0) break;
      if (pos + 6 > buf.length) return null;
      const lenWords = u16BE(buf, pos + 4);
      const lenBytes = lenWords * 2;
      if (off32 & 1) return null;
      if (off32 >= buf.length) return null;
      const absOff = tableOff + off32;
      if (absOff + lenBytes > buf.length) return null;
      if (lenBytes === 0) return null;
      entries.push({ offset: absOff, lengthBytes: lenBytes });
      pos += 12;
    }
    return entries.length > 0 ? entries : null;
  }
  for (let tryOff = maxModuleOff; tryOff < buf.length - 12; tryOff += 2) {
    const entries = trySampleTableAt(tryOff);
    if (entries && entries.length >= 1) {
      sampleCount = entries.length;
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const pcm = buf.slice(entry.offset, entry.offset + entry.lengthBytes);
        instruments.push(createSamplerInstrument(
          i + 1,
          `PT Sample ${i + 1}`,
          pcm,
          64,
          8287,
          0,
          0
        ));
      }
      samplesExtracted = true;
      break;
    }
  }
  if (instruments.length === 0) {
    instruments.push({
      id: 1,
      name: "Sample 1",
      type: "synth",
      synthType: "Synth",
      effects: [],
      volume: 0,
      pan: 0
    });
  }
  const emptyRows = Array.from({ length: 64 }, () => ({
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
      rows: emptyRows
    })),
    importMetadata: {
      sourceFormat: "MOD",
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: 4,
      originalPatternCount: 1,
      originalInstrumentCount: sampleCount
    }
  };
  const nameParts = [`${moduleName} [Paul Tonge]`];
  if (samplesExtracted) nameParts.push(`(${instruments.length} smp)`);
  return {
    name: nameParts.join(" "),
    format: "MOD",
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename
  };
}
export {
  isPaulTongeFormat,
  parsePaulTongeFile
};
