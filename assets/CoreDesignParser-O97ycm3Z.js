import { c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const MIN_FILE_SIZE = 64;
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function isCoreDesignFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  if (u32BE(buf, 0) !== 1011) return false;
  if (buf[20] === 0) return false;
  if (u32BE(buf, 32) !== 1895779957) return false;
  if (u32BE(buf, 36) !== 1395544136) return false;
  if (u32BE(buf, 40) !== 1230000211) return false;
  if (u32BE(buf, 44) === 0) return false;
  if (u32BE(buf, 48) === 0) return false;
  if (u32BE(buf, 52) === 0) return false;
  if (u32BE(buf, 56) === 0) return false;
  if (u32BE(buf, 60) === 0) return false;
  return true;
}
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function readCString(buf, off, maxLen) {
  let s = "";
  for (let i = 0; i < maxLen && off + i < buf.length; i++) {
    const ch = buf[off + i];
    if (ch === 0) break;
    if (ch >= 32 && ch < 127) s += String.fromCharCode(ch);
  }
  return s;
}
function findHunkCodeBodyStart(buf) {
  if (buf.length < 32) return -1;
  if (u32BE(buf, 0) !== 1011) return -1;
  const stringTableCount = u32BE(buf, 4);
  let off = 8;
  for (let i = 0; i < stringTableCount; i++) {
    if (off + 4 > buf.length) return -1;
    const strLongs = u32BE(buf, off);
    off += 4 + strLongs * 4;
  }
  if (off + 12 > buf.length) return -1;
  const numHunks = u32BE(buf, off);
  off += 12;
  off += numHunks * 4;
  if (off + 8 > buf.length) return -1;
  const hunkType = u32BE(buf, off) & 1073741823;
  if (hunkType !== 1001) return -1;
  off += 8;
  return off;
}
function extractCoreDesignSamples(buf, codeStart) {
  const instruments = [];
  const ENTRY_SIZE = 14;
  const sampleInfoPtrOff = codeStart + 32;
  const endSampleInfoPtrOff = codeStart + 36;
  if (endSampleInfoPtrOff + 4 > buf.length) return instruments;
  const sampleInfoRelative = u32BE(buf, sampleInfoPtrOff);
  const endSampleInfoRelative = u32BE(buf, endSampleInfoPtrOff);
  if (sampleInfoRelative === 0 || endSampleInfoRelative === 0) return instruments;
  if (endSampleInfoRelative <= sampleInfoRelative) return instruments;
  const sampleInfoFileOff = sampleInfoRelative + codeStart;
  const endSampleInfoFileOff = endSampleInfoRelative + codeStart;
  if (sampleInfoFileOff >= buf.length || endSampleInfoFileOff > buf.length) return instruments;
  const tableBytes = endSampleInfoFileOff - sampleInfoFileOff;
  if (tableBytes % ENTRY_SIZE !== 0) return instruments;
  const count = tableBytes / ENTRY_SIZE;
  if (count === 0 || count > 128) return instruments;
  for (let i = 0; i < count; i++) {
    const entryOff = sampleInfoFileOff + i * ENTRY_SIZE;
    if (entryOff + ENTRY_SIZE > buf.length) break;
    const sampleAreaRelative = u32BE(buf, entryOff + 6);
    if (sampleAreaRelative === 0) {
      instruments.push({
        id: i + 1,
        name: `CORE Sample ${i + 1}`,
        type: "synth",
        synthType: "Synth",
        effects: [],
        volume: 0,
        pan: 0
      });
      continue;
    }
    const sampleAreaFileOff = sampleAreaRelative + codeStart;
    if (sampleAreaFileOff + 2 > buf.length) {
      instruments.push({
        id: i + 1,
        name: `CORE Sample ${i + 1}`,
        type: "synth",
        synthType: "Synth",
        effects: [],
        volume: 0,
        pan: 0
      });
      continue;
    }
    const lengthWords = u16BE(buf, sampleAreaFileOff);
    const lengthBytes = lengthWords * 2;
    const pcmStart = sampleAreaFileOff + 2;
    if (lengthBytes > 0 && lengthBytes < 1048576 && pcmStart + lengthBytes <= buf.length) {
      const pcm = buf.slice(pcmStart, pcmStart + lengthBytes);
      instruments.push(createSamplerInstrument(
        i + 1,
        `CORE Sample ${i + 1}`,
        pcm,
        64,
        8287,
        0,
        0
      ));
    } else {
      instruments.push({
        id: i + 1,
        name: `CORE Sample ${i + 1}`,
        type: "synth",
        synthType: "Synth",
        effects: [],
        volume: 0,
        pan: 0
      });
    }
  }
  return instruments;
}
function parseCoreDesignFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (!isCoreDesignFormat(buf)) throw new Error("Not a Core Design module");
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^core\./i, "") || baseName;
  const instruments = [];
  let songName = "";
  let authorName = "";
  const codeStart = findHunkCodeBodyStart(buf);
  if (codeStart > 0) {
    const extracted = extractCoreDesignSamples(buf, codeStart);
    instruments.push(...extracted);
    const songNamePtrOff = codeStart + 40;
    const authorNamePtrOff = codeStart + 44;
    if (songNamePtrOff + 4 <= buf.length) {
      const songNameRelative = u32BE(buf, songNamePtrOff);
      if (songNameRelative > 0) {
        const nameFileOff = songNameRelative + codeStart;
        if (nameFileOff < buf.length) {
          songName = readCString(buf, nameFileOff, 64);
        }
      }
    }
    if (authorNamePtrOff + 4 <= buf.length) {
      const authorNameRelative = u32BE(buf, authorNamePtrOff);
      if (authorNameRelative > 0) {
        const nameFileOff = authorNameRelative + codeStart;
        if (nameFileOff < buf.length) {
          authorName = readCString(buf, nameFileOff, 64);
        }
      }
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
      originalInstrumentCount: instruments.length
    }
  };
  let displayName = songName || moduleName;
  if (authorName) displayName += ` by ${authorName}`;
  displayName += " [Core Design]";
  return {
    name: displayName,
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
  isCoreDesignFormat,
  parseCoreDesignFile
};
