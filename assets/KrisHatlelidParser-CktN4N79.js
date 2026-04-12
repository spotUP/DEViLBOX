import { c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const MIN_FILE_SIZE = 68;
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function tag4(buf, off) {
  return String.fromCharCode(buf[off], buf[off + 1], buf[off + 2], buf[off + 3]);
}
function scanIffForms(buf, start) {
  const len = buf.length;
  const forms = [];
  let off = start;
  while (off + 8 <= len) {
    if (tag4(buf, off) === "FORM") break;
    off += 2;
  }
  while (off + 8 <= len && tag4(buf, off) === "FORM") {
    const formSize = u32BE(buf, off + 4);
    if (formSize === 0 || formSize > 16777216 || off + 8 + formSize > len + 4) break;
    forms.push({ formOff: off, formSize });
    off += 8 + formSize;
    if (off & 1) off++;
  }
  return forms;
}
function extractIffSample(buf, formOff, formSize) {
  const dataStart = formOff + 12;
  const dataEnd = formOff + 8 + formSize;
  let pcm = null;
  let name = "";
  let oneShotHiSamples = 0;
  let repeatHiSamples = 0;
  let pos = dataStart;
  while (pos + 8 <= dataEnd) {
    const chunkTag = tag4(buf, pos);
    const chunkSize = u32BE(buf, pos + 4);
    const chunkData = pos + 8;
    if (chunkTag === "BODY") {
      const bodyLen = Math.min(chunkSize, dataEnd - chunkData);
      if (bodyLen > 0) {
        pcm = buf.slice(chunkData, chunkData + bodyLen);
      }
    } else if (chunkTag === "NAME") {
      const nameLen = Math.min(chunkSize, 64, dataEnd - chunkData);
      if (nameLen > 0) {
        const nameBytes = buf.slice(chunkData, chunkData + nameLen);
        name = String.fromCharCode(...Array.from(nameBytes)).replace(/\0/g, "").trim();
      }
    } else if (chunkTag === "VHDR") {
      if (chunkSize >= 8 && chunkData + 8 <= dataEnd) {
        oneShotHiSamples = u32BE(buf, chunkData);
        repeatHiSamples = u32BE(buf, chunkData + 4);
      }
    }
    let nextPos = chunkData + chunkSize;
    if (nextPos & 1) nextPos++;
    if (nextPos <= pos) break;
    pos = nextPos;
  }
  if (!pcm || pcm.length === 0) return null;
  let loopStart = 0;
  let loopEnd = 0;
  if (repeatHiSamples > 2) {
    loopStart = oneShotHiSamples;
    loopEnd = oneShotHiSamples + repeatHiSamples;
  }
  return { pcm, name, loopStart, loopEnd };
}
function isKrisHatlelidFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  if (u32BE(buf, 0) !== 1011) return false;
  if (u32BE(buf, 4) !== 0) return false;
  if (u32BE(buf, 8) !== 3) return false;
  if (u32BE(buf, 12) !== 0) return false;
  if (u32BE(buf, 16) !== 2) return false;
  const d1 = u32BE(buf, 20) & -1073741825;
  if (buf[24] !== 64) return false;
  if (u32BE(buf, 28) !== 1) return false;
  if (u32BE(buf, 32) !== 1001) return false;
  if (u32BE(buf, 36) !== d1) return false;
  if (u32BE(buf, 40) !== 1610612758) return false;
  if (u32BE(buf, 44) !== 43981) return false;
  if (u32BE(buf, 64) === 2960916480) return true;
  return u32BE(buf, 64) === 1106837504 && u32BE(buf, 68) === 20085;
}
function parseKrisHatlelidFile(buffer, filename) {
  var _a;
  const buf = new Uint8Array(buffer);
  const _base = ((_a = filename.split("/").pop()) == null ? void 0 : _a.toLowerCase()) ?? "";
  if (!_base.startsWith("kh.") && !_base.endsWith(".kh") && !isKrisHatlelidFormat(buf)) throw new Error("Not a Kris Hatlelid module");
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^KH\./i, "") || baseName;
  const instruments = [];
  const forms = scanIffForms(buf, 0);
  for (let i = 0; i < forms.length; i++) {
    const { formOff, formSize } = forms[i];
    const sample = extractIffSample(buf, formOff, formSize);
    if (sample) {
      const sampleName = sample.name || `KH Sample ${i + 1}`;
      instruments.push(createSamplerInstrument(
        i + 1,
        sampleName,
        sample.pcm,
        64,
        8287,
        sample.loopStart,
        sample.loopEnd
      ));
    } else {
      instruments.push({
        id: i + 1,
        name: `KH Sample ${i + 1}`,
        type: "synth",
        synthType: "Synth",
        effects: [],
        volume: 0,
        pan: 0
      });
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
      originalInstrumentCount: forms.length
    }
  };
  return {
    name: `${moduleName} [Kris Hatlelid]`,
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
  isKrisHatlelidFormat,
  parseKrisHatlelidFile
};
