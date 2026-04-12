import { c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const MIN_FILE_SIZE = 15;
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
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
    if (off + 4 <= len && tag4(buf, off) === "FORM") break;
    off += 2;
  }
  while (off + 8 <= len && tag4(buf, off) === "FORM") {
    const formSize = u32BE(buf, off + 4);
    if (formSize === 0 || formSize > 16777216 || off + 8 + formSize > len + 4) break;
    forms.push({ formOff: off, formSize });
    off += 8 + formSize;
    if (off & 1) off++;
    if (forms.length >= 38) break;
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
      if (bodyLen > 0) pcm = buf.slice(chunkData, chunkData + bodyLen);
    } else if (chunkTag === "NAME") {
      const nameLen = Math.min(chunkSize, 64, dataEnd - chunkData);
      if (nameLen > 0) {
        name = String.fromCharCode(...Array.from(buf.slice(chunkData, chunkData + nameLen))).replace(/\0/g, "").trim();
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
function isSoundPlayerFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  if (buf[1] <= 10 || buf[1] > 160) return false;
  if (buf[2] !== 7 && buf[2] !== 15) return false;
  if (buf[3] !== 0) return false;
  if (buf[4] !== 0) return false;
  const b5 = buf[5];
  if (b5 === 0) return false;
  if (u16BE(buf, 6) !== 0) return false;
  if (buf[8] !== b5) return false;
  if (buf[9] !== 0) return false;
  if (buf[10] !== 0) return false;
  if (buf[11] !== b5) return false;
  if (u16BE(buf, 12) !== 0) return false;
  if (buf[2] === 15 && buf[14] !== b5) return false;
  return true;
}
function parseSoundPlayerFile(buffer, filename) {
  var _a;
  const buf = new Uint8Array(buffer);
  const _base = ((_a = filename.split("/").pop()) == null ? void 0 : _a.toLowerCase()) ?? "";
  if (!_base.startsWith("sjs.") && !_base.endsWith(".spl") && !isSoundPlayerFormat(buf)) throw new Error("Not a Sound Player module");
  const baseName = (filename.split("/").pop() ?? filename).split("\\").pop() ?? filename;
  const moduleName = baseName.replace(/^sjs\./i, "") || baseName;
  const instruments = [];
  const forms = scanIffForms(buf, 0);
  for (let i = 0; i < forms.length; i++) {
    const { formOff, formSize } = forms[i];
    const sample = extractIffSample(buf, formOff, formSize);
    if (sample) {
      const sampleName = sample.name || `SJS Sample ${i + 1}`;
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
        name: `SJS Sample ${i + 1}`,
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
    name: `${moduleName} [Sound Player]`,
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
  isSoundPlayerFormat,
  parseSoundPlayerFile
};
