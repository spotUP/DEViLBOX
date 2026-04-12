import { c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const MIN_FILE_SIZE = 20;
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
const MAGIC_MXTX = 1297634392;
function isMaximumEffectFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  if (u32BE(buf, 0) === MAGIC_MXTX) return true;
  const fileSize = buf.length;
  const d1_0 = u32BE(buf, 0);
  if (d1_0 === 0) return false;
  if (d1_0 > 15) return false;
  const d1_4 = u32BE(buf, 4);
  if (d1_4 !== 0) {
    if (d1_4 & 2147483648) return false;
    if (d1_4 & 1) return false;
    if (d1_4 > fileSize) return false;
    const adjusted = d1_4 - 2;
    if (adjusted === 0) return false;
    if (adjusted % 18 !== 0) return false;
  }
  let foundOne = false;
  for (let i = 0; i < 3; i++) {
    const off = 8 + i * 4;
    if (off + 4 > buf.length) return false;
    const d0 = u32BE(buf, off);
    if (d0 & 2147483648) return false;
    if (d0 === 0) continue;
    if (d0 & 1) return false;
    if (d0 > fileSize) return false;
    const testOff = d0 - 6;
    if (testOff + 4 > buf.length) return false;
    if (u32BE(buf, testOff) !== 0) return false;
    foundOne = true;
  }
  return foundOne;
}
function findModuleDataEnd(buf) {
  let maxPtr = 20;
  for (let i = 1; i < 5; i++) {
    const off = i * 4;
    if (off + 4 > buf.length) break;
    const ptr = u32BE(buf, off);
    if (ptr > 0 && !(ptr & 2147483648) && ptr <= buf.length) {
      if (ptr > maxPtr) maxPtr = ptr;
    }
  }
  return maxPtr;
}
function extractSamples(buf, smpOffset) {
  if (smpOffset + 2 > buf.length) return null;
  const sampleCount = u16BE(buf, smpOffset);
  if (sampleCount === 0 || sampleCount > 256) return null;
  const tableStart = smpOffset + 2;
  const tableSize = (sampleCount + 1) * 16;
  if (tableStart + tableSize > buf.length) return null;
  const instruments = [];
  let validSamples = 0;
  for (let i = 0; i <= sampleCount; i++) {
    const entryOff = tableStart + i * 16;
    const smpAddr = u32BE(buf, entryOff);
    const lenWords = u16BE(buf, entryOff + 4);
    const loopAddr = u32BE(buf, entryOff + 8);
    const loopLenWords = u16BE(buf, entryOff + 12);
    const lenBytes = lenWords * 2;
    const loopLenBytes = loopLenWords * 2;
    const pcmFileOff = smpOffset + smpAddr;
    if (lenBytes > 0 && pcmFileOff >= 0 && pcmFileOff + lenBytes <= buf.length) {
      const pcm = buf.slice(pcmFileOff, pcmFileOff + lenBytes);
      let loopStart = 0;
      let loopEnd = 0;
      if (loopLenBytes > 2 && loopAddr >= smpAddr) {
        loopStart = loopAddr - smpAddr;
        loopEnd = loopStart + loopLenBytes;
        if (loopEnd > lenBytes) {
          loopStart = 0;
          loopEnd = 0;
        }
      }
      instruments.push(createSamplerInstrument(
        i + 1,
        `MAX Sample ${i + 1}`,
        pcm,
        64,
        8287,
        loopStart,
        loopEnd
      ));
      validSamples++;
    } else {
      instruments.push({
        id: i + 1,
        name: `MAX Sample ${i + 1}`,
        type: "synth",
        synthType: "Synth",
        effects: [],
        volume: 0,
        pan: 0
      });
    }
  }
  return validSamples > 0 ? instruments : null;
}
function parseMaximumEffectFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (!isMaximumEffectFormat(buf)) throw new Error("Not a Maximum Effect module");
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^max\./i, "") || baseName;
  let instruments = [];
  let samplesExtracted = false;
  if (u32BE(buf, 0) !== MAGIC_MXTX) {
    const moduleEnd = findModuleDataEnd(buf);
    if (moduleEnd < buf.length) {
      const extracted = extractSamples(buf, moduleEnd);
      if (extracted) {
        instruments = extracted;
        samplesExtracted = true;
      }
    }
  }
  if (!samplesExtracted) {
    instruments = [{
      id: 1,
      name: "Sample 1",
      type: "synth",
      synthType: "Synth",
      effects: [],
      volume: 0,
      pan: 0
    }];
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
  const sampleInfo = samplesExtracted ? ` (${instruments.length} samples)` : "";
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
      originalInstrumentCount: instruments.length
    }
  };
  return {
    name: `${moduleName}${sampleInfo} [Maximum Effect]`,
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
  isMaximumEffectFormat,
  parseMaximumEffectFile
};
