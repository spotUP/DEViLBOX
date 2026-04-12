import { c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const MIN_FILE_SIZE = 18;
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function isDscFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const fileSize = buf.length;
  if (fileSize < MIN_FILE_SIZE) return false;
  let off = 0;
  const headerWord = u16BE(buf, off);
  off += 2;
  if (headerWord === 0) return false;
  const nLengths = buf[off];
  off += 1;
  if (nLengths === 0) return false;
  let nSamples = buf[off];
  off += 1;
  if (nSamples === 0) return false;
  if (off + 8 > fileSize) return false;
  const d2 = u32BE(buf, off);
  off += 4;
  if (d2 === 0) return false;
  if ((d2 & 1) !== 0) return false;
  if (d2 > 524288) return false;
  if (d2 >= fileSize) return false;
  const seqCount = u32BE(buf, off);
  off += 4;
  if (seqCount === 0) return false;
  if (seqCount > 131072) return false;
  nSamples -= 2;
  if (nSamples < 0) return false;
  const checkOneIters = nSamples + 1;
  if (off + checkOneIters * 6 + 6 > fileSize) return false;
  for (let i = 0; i < checkOneIters; i++) {
    if (off + 6 > fileSize) return false;
    const d4 = u32BE(buf, off);
    off += 4;
    if (d4 >= 2147483648) return false;
    if ((d4 & 1) !== 0) return false;
    if (d4 > 131072) return false;
    off += 2;
  }
  if (off + 6 > fileSize) return false;
  const zeroLong = u32BE(buf, off);
  off += 4;
  if (zeroLong !== 0) return false;
  const zeroWord = u16BE(buf, off);
  off += 2;
  if (zeroWord !== 0) return false;
  const seqTableSize = seqCount * 4;
  if (off + seqTableSize > fileSize) return false;
  off += seqTableSize;
  const sampleInfoSize = nLengths * 18;
  const a2 = off + sampleInfoSize;
  if (fileSize <= a2) return false;
  let lastSampleOffset = 0;
  let lastSampleLength = 0;
  while (off !== a2) {
    if (off + 18 > fileSize) return false;
    const sampleLen = u32BE(buf, off + 2);
    if (sampleLen === 0) return false;
    if ((sampleLen & 2147483648) !== 0) return false;
    if (sampleLen > d2) return false;
    const sampleOffset = u32BE(buf, off + 12);
    if (sampleOffset > d2) return false;
    lastSampleLength = sampleLen;
    lastSampleOffset = sampleOffset;
    off += 18;
  }
  if (a2 > 0) {
    if (lastSampleOffset + lastSampleLength !== d2) return false;
  }
  return true;
}
function parseDscFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (!isDscFormat(buf)) throw new Error("Not a Digital Sonix & Chrome module");
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^dsc\./i, "").replace(/\.dsc$/i, "") || baseName;
  const nLengths = buf[2];
  const nSamples = buf[3];
  const seqCount = u32BE(buf, 8);
  const instrEntriesOff = 12;
  const seqTableOff = instrEntriesOff + (nSamples - 1) * 6 + 6;
  const sampleInfoOff = seqTableOff + seqCount * 4;
  const pcmDataOff = sampleInfoOff + nLengths * 18;
  const instruments = [];
  for (let i = 0; i < nLengths; i++) {
    const recOff = sampleInfoOff + i * 18;
    const sampleLen = u32BE(buf, recOff + 2);
    const sampleOffset = u32BE(buf, recOff + 12);
    const pcmFileOff = pcmDataOff + sampleOffset;
    if (pcmFileOff + sampleLen <= buf.length && sampleLen > 0) {
      const pcm = buf.slice(pcmFileOff, pcmFileOff + sampleLen);
      instruments.push(createSamplerInstrument(
        i + 1,
        `DSC Sample ${i + 1}`,
        pcm,
        64,
        8287,
        0,
        0
      ));
    } else {
      instruments.push({
        id: i + 1,
        name: `DSC Sample ${i + 1}`,
        type: "synth",
        synthType: "Synth",
        effects: [],
        volume: 0,
        pan: 0
      });
    }
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
      originalInstrumentCount: nLengths
    }
  };
  return {
    name: `${moduleName} [Digital Sonix & Chrome]`,
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
  isDscFormat,
  parseDscFile
};
