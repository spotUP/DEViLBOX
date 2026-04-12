import { c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const MIN_FILE_SIZE = 10;
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function isNickPellingPackerFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  if (u32BE(buf, 0) !== 1129270608) return false;
  if (u16BE(buf, 4) !== 0) return false;
  const size = u16BE(buf, 6);
  if (size < 16) return false;
  if (size > 272) return false;
  if ((size & 3) !== 0) return false;
  const decompSizeOff = 6 + size - 10;
  if (buf.length < decompSizeOff + 4) return false;
  const decompSize = u32BE(buf, decompSizeOff);
  if (decompSize > buf.length) return false;
  return true;
}
function extractNPPSamples(buf, scanFrom) {
  for (let off = scanFrom; off + 2 < buf.length; off += 2) {
    const count = u16BE(buf, off);
    if (count === 0 || count > 31) continue;
    const headerStart = off + 2;
    const headerSize = count * 30;
    if (headerStart + headerSize > buf.length) continue;
    let totalPCMBytes = 0;
    let valid = true;
    for (let i = 0; i < count; i++) {
      const entryOff = headerStart + i * 30;
      const lenWords = u16BE(buf, entryOff + 22);
      const vol = buf[entryOff + 25];
      if (vol > 64) {
        valid = false;
        break;
      }
      totalPCMBytes += lenWords * 2;
    }
    if (!valid) continue;
    const pcmStart = headerStart + headerSize;
    if (totalPCMBytes === 0) continue;
    if (pcmStart + totalPCMBytes > buf.length) continue;
    const instruments = [];
    let pcmOff = pcmStart;
    let validSamples = 0;
    for (let i = 0; i < count; i++) {
      const entryOff = headerStart + i * 30;
      let name = "";
      for (let c = 0; c < 22; c++) {
        const ch = buf[entryOff + c];
        if (ch === 0) break;
        name += String.fromCharCode(ch);
      }
      if (!name) name = `NPP Sample ${i + 1}`;
      const lenWords = u16BE(buf, entryOff + 22);
      const lenBytes = lenWords * 2;
      const flags = buf[entryOff + 24];
      const vol = buf[entryOff + 25];
      const repeatStartWords = u16BE(buf, entryOff + 26);
      const repeatLenWords = u16BE(buf, entryOff + 28);
      if (lenBytes > 0 && pcmOff + lenBytes <= buf.length) {
        const pcm = new Uint8Array(lenBytes);
        pcm.set(buf.subarray(pcmOff, pcmOff + lenBytes));
        if (flags & 128) {
          for (let k = 1; k < lenBytes; k++) {
            pcm[k] = pcm[k] + pcm[k - 1] & 255;
          }
        }
        const loopStart = repeatStartWords * 2;
        const loopLen = repeatLenWords * 2;
        let loopEnd = 0;
        if (loopLen >= 4 && loopStart + loopLen <= lenBytes) {
          loopEnd = loopStart + loopLen;
        }
        instruments.push(createSamplerInstrument(
          i + 1,
          name,
          pcm,
          Math.min(vol, 64),
          8287,
          loopStart,
          loopEnd
        ));
        validSamples++;
      } else {
        instruments.push({
          id: i + 1,
          name,
          type: "synth",
          synthType: "Synth",
          effects: [],
          volume: 0,
          pan: 0
        });
      }
      pcmOff += lenBytes;
    }
    if (validSamples > 0) return instruments;
  }
  return null;
}
function parseNickPellingPackerFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (!isNickPellingPackerFormat(buf)) throw new Error("Not a Nick Pelling Packer module");
  const baseName = (filename.split("/").pop() ?? filename).split("\\").pop() ?? filename;
  const moduleName = baseName.replace(/^npp\./i, "") || baseName;
  const compHeaderSize = u16BE(buf, 6);
  const scanFrom = 6 + compHeaderSize;
  let instruments = [];
  let samplesExtracted = false;
  const extracted = extractNPPSamples(buf, scanFrom);
  if (extracted) {
    instruments = extracted;
    samplesExtracted = true;
  }
  const sampleInfo = samplesExtracted ? ` (${instruments.length} samples)` : "";
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
      originalInstrumentCount: instruments.length
    }
  };
  return {
    name: `${moduleName}${sampleInfo} [Nick Pelling Packer]`,
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
  isNickPellingPackerFormat,
  parseNickPellingPackerFile
};
