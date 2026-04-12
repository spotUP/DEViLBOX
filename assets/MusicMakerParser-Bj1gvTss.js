import { c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const MIN_IFF_SIZE = 12;
const MMV8_SONGID = 21317;
const DEFAULT_INSTNUM = 26;
const MAX_INSTNUM = 64;
const AMIGA_SAMPLE_RATE = 8363;
const TEXT_DECODER = new TextDecoder("iso-8859-1");
function readTag4(buf, offset) {
  if (buf.length < offset + 4) return "";
  return String.fromCharCode(buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3]);
}
function readTag2(buf, offset) {
  if (buf.length < offset + 2) return "";
  return String.fromCharCode(buf[offset], buf[offset + 1]);
}
function u16be(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) & 65535;
}
function u32be(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function readStr(buf, off, len) {
  let end = off;
  while (end < off + len && buf[end] !== 0) end++;
  return TEXT_DECODER.decode(buf.subarray(off, end)).trim();
}
function readChunks(buf) {
  const chunks = /* @__PURE__ */ new Map();
  let pos = 12;
  const fileEnd = buf.length;
  while (pos + 8 <= fileEnd) {
    const id = readTag4(buf, pos);
    const size = u32be(buf, pos + 4);
    const dataStart = pos + 8;
    if (dataStart + size > fileEnd) break;
    if (!chunks.has(id)) chunks.set(id, { offset: dataStart, size });
    pos = dataStart + size;
    if (pos & 1) pos++;
  }
  return chunks;
}
function readInamNames(buf, chunk) {
  const names = /* @__PURE__ */ new Map();
  if (chunk.size < 4) return names;
  const entry_size = u16be(buf, chunk.offset);
  const name_off = u16be(buf, chunk.offset + 2);
  if (entry_size === 0 || name_off >= entry_size) return names;
  const nameFieldLen = entry_size - name_off;
  const dataStart = chunk.offset + 4;
  const numEntries = Math.floor((chunk.size - 4) / entry_size);
  for (let i = 0; i < numEntries && i < MAX_INSTNUM; i++) {
    const eoff = dataStart + i * entry_size;
    if (eoff + entry_size > chunk.offset + chunk.size) break;
    const nameStart = eoff + name_off;
    const raw = readStr(buf, nameStart, nameFieldLen);
    if (!raw) continue;
    const slash = raw.lastIndexOf("/");
    const name = slash >= 0 ? raw.slice(slash + 1) : raw;
    if (name.length >= 2) names.set(i, name);
  }
  return names;
}
function parseMusicMakerFile(buffer, filename, numChannels, label) {
  const buf = new Uint8Array(buffer);
  const baseName = filename.split("/").pop() ?? filename;
  let moduleName = baseName.replace(/^(mm4|mm8|sdata)\./i, "") || baseName;
  const isIFF = buf.length >= MIN_IFF_SIZE && readTag4(buf, 0) === "FORM";
  const chunks = isIFF ? readChunks(buf) : /* @__PURE__ */ new Map();
  const sdat = chunks.get("SDAT");
  if (sdat && sdat.size >= 26) {
    const base = sdat.offset;
    if (u16be(buf, base + 4) === MMV8_SONGID) {
      const songName = readStr(buf, base + 6, 20);
      if (songName.length > 0) moduleName = songName;
    }
  }
  const inam = chunks.get("INAM");
  const inamNames = inam ? readInamNames(buf, inam) : /* @__PURE__ */ new Map();
  const instruments = [];
  const inst = chunks.get("PINS") ?? chunks.get("INST");
  if (inst && inst.size >= 8) {
    const chunkEnd = inst.offset + inst.size;
    let hdrPos = inst.offset;
    let instCount = DEFAULT_INSTNUM;
    if (hdrPos + 8 <= chunkEnd && readTag4(buf, hdrPos) === "SEI1" && readTag2(buf, hdrPos + 4) === "XX") {
      instCount = u16be(buf, hdrPos + 6);
      hdrPos += 8;
    }
    instCount = Math.min(instCount, MAX_INSTNUM);
    const sampleDataStart = hdrPos + instCount * 8 + 4;
    if (sampleDataStart <= chunkEnd) {
      let sampleOff = sampleDataStart;
      for (let i = 0; i < instCount; i++) {
        const entryOff = hdrPos + i * 8;
        if (entryOff + 8 > chunkEnd) break;
        const sampleLenBytes = u16be(buf, entryOff + 0);
        const repeatLenBytes = u16be(buf, entryOff + 2);
        const loopStartBytes = u16be(buf, entryOff + 4);
        const loopLenWords = u16be(buf, entryOff + 6);
        if (sampleLenBytes === 0) continue;
        const sampleEnd = sampleOff + sampleLenBytes;
        if (sampleEnd > chunkEnd) break;
        const pcm = buf.slice(sampleOff, sampleEnd);
        sampleOff = sampleEnd;
        const hasLoop = repeatLenBytes > 0 && loopLenWords > 0;
        const loopStartSamples = hasLoop ? loopStartBytes : 0;
        const loopEndSamples = hasLoop ? loopStartBytes + loopLenWords * 2 : pcm.length;
        instruments.push(createSamplerInstrument(
          i + 1,
          inamNames.get(i) ?? `Sample ${i + 1}`,
          pcm,
          64,
          // default volume (max)
          AMIGA_SAMPLE_RATE,
          loopStartSamples,
          loopEndSamples
        ));
      }
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
    channels: Array.from({ length: numChannels }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: numChannels === 4 ? ch === 0 || ch === 3 ? -50 : 50 : Math.round((ch / (numChannels - 1) * 2 - 1) * 50),
      instrumentId: null,
      color: null,
      rows: emptyRows
    })),
    importMetadata: {
      sourceFormat: "MOD",
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: numChannels,
      originalPatternCount: 1,
      originalInstrumentCount: instruments.length
    }
  };
  return {
    name: `${moduleName} [${label}]`,
    format: "MOD",
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename
  };
}
function baseLower(filename) {
  return ((filename.split("/").pop() ?? filename).split("\\").pop() ?? filename).toLowerCase();
}
function isMusicMaker4VFormat(buffer, filename) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const base = filename ? baseLower(filename) : "";
  if (buf.length >= MIN_IFF_SIZE && readTag4(buf, 0) === "FORM") {
    const tag = readTag4(buf, 8);
    if (tag === "MMV4") return true;
    if (tag === "MMV8" && base.endsWith(".mm4")) return true;
  }
  if (!filename) return false;
  return base.startsWith("mm4.") || base.startsWith("sdata.");
}
function parseMusicMaker4VFile(buffer, filename) {
  if (!isMusicMaker4VFormat(buffer, filename)) throw new Error("Not a Music Maker 4V module");
  return parseMusicMakerFile(buffer, filename, 4, "Music Maker 4V");
}
function isMusicMaker8VFormat(buffer, filename) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const base = filename ? baseLower(filename) : "";
  if (buf.length >= MIN_IFF_SIZE && readTag4(buf, 0) === "FORM") {
    if (readTag4(buf, 8) === "MMV8") {
      if (base.endsWith(".mm4")) return false;
      return true;
    }
  }
  if (!filename) return false;
  return base.startsWith("mm8.");
}
function parseMusicMaker8VFile(buffer, filename) {
  if (!isMusicMaker8VFormat(buffer, filename)) throw new Error("Not a Music Maker 8V module");
  return parseMusicMakerFile(buffer, filename, 8, "Music Maker 8V");
}
export {
  isMusicMaker4VFormat,
  isMusicMaker8VFormat,
  parseMusicMaker4VFile,
  parseMusicMaker8VFile
};
