import { c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const MIN_FILE_SIZE = 1800;
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function scanKimDataPointers(buf) {
  const len = buf.length;
  let pos = 0;
  let d0Pos = -1;
  for (let i = 0; i < 100 && pos + 5 < len; i++, pos += 2) {
    if (u16BE(buf, pos) === 8316) {
      d0Pos = pos;
      pos += 6;
      break;
    }
  }
  if (d0Pos < 0) return null;
  let d1Pos = -1;
  for (let i = 0; i < 800 && pos + 5 < len; i++, pos += 2) {
    if (u16BE(buf, pos) === 1664) {
      d1Pos = pos;
      pos += 2;
      break;
    }
  }
  if (d1Pos < 0) return null;
  let e341Pos = -1;
  for (let i = 0; i < 800 && pos + 1 < len; i++, pos += 2) {
    if (u16BE(buf, pos) === 58177) {
      e341Pos = pos;
      pos += 2;
      break;
    }
  }
  if (e341Pos < 0 || e341Pos < 6) return null;
  const d7 = u32BE(buf, e341Pos - 4);
  let d2Pos = -1;
  for (let i = 0; i < 800 && pos + 5 < len; i++, pos += 2) {
    if (u16BE(buf, pos) === 8828) {
      d2Pos = pos;
      pos += 2;
      break;
    }
  }
  if (d2Pos < 0) return null;
  pos = d2Pos + 6;
  let d3Pos = -1;
  for (let i = 0; i < 800 && pos + 5 < len; i++, pos += 2) {
    if (u16BE(buf, pos) === 1664) {
      d3Pos = pos;
      pos += 2;
      break;
    }
  }
  if (d3Pos < 0) return null;
  const d3Val = u32BE(buf, d3Pos + 2);
  pos = d3Pos + 6;
  let pos0087 = -1;
  for (let i = 0; i < 800 && pos + 1 < len; i++, pos += 2) {
    if (u16BE(buf, pos) === 135) {
      pos0087 = pos;
      break;
    }
  }
  if (pos0087 < 0) return null;
  const origin = d7 - (pos0087 - 4) >>> 0;
  const sampleTableFileOff = d3Val - origin >>> 0;
  if (sampleTableFileOff + 4 > buf.length) return null;
  const firstDword = u32BE(buf, sampleTableFileOff);
  const d3Absolute = d3Val;
  const tableBytes = firstDword - d3Absolute >>> 0;
  if (tableBytes === 0 || tableBytes % 6 !== 0) return null;
  const sampleCount = tableBytes / 6;
  return { origin, sampleTableFileOff, sampleCount };
}
function isKimChristensenFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  let pos = 0;
  let found207C = false;
  for (let i = 0; i < 100; i++) {
    if (pos + 2 > buf.length) return false;
    if (u16BE(buf, pos) === 8316) {
      found207C = true;
      pos += 2;
      break;
    }
    pos += 2;
  }
  if (!found207C) return false;
  let d2 = 799;
  let found = false;
  while (d2 >= 0) {
    if (pos + 2 > buf.length) return false;
    if (u16BE(buf, pos) === 1664) {
      pos += 2;
      found = true;
      break;
    }
    pos += 2;
    d2--;
  }
  if (!found) return false;
  found = false;
  while (d2 >= 0) {
    if (pos + 2 > buf.length) return false;
    if (u16BE(buf, pos) === 58177) {
      pos += 2;
      found = true;
      break;
    }
    pos += 2;
    d2--;
  }
  if (!found) return false;
  found = false;
  while (d2 >= 0) {
    if (pos + 2 > buf.length) return false;
    if (u16BE(buf, pos) === 8828) {
      pos += 2;
      found = true;
      break;
    }
    pos += 2;
    d2--;
  }
  if (!found) return false;
  found = false;
  while (d2 >= 0) {
    if (pos + 2 > buf.length) return false;
    if (u16BE(buf, pos) === 1664) {
      pos += 2;
      found = true;
      break;
    }
    pos += 2;
    d2--;
  }
  if (!found) return false;
  while (d2 >= 0) {
    if (pos + 2 > buf.length) return false;
    if (u16BE(buf, pos) === 135) return true;
    pos += 2;
    d2--;
  }
  return false;
}
function parseKimChristensenFile(buffer, filename) {
  var _a;
  const buf = new Uint8Array(buffer);
  const _base = ((_a = filename.split("/").pop()) == null ? void 0 : _a.toLowerCase()) ?? "";
  if (!_base.startsWith("kim.") && !_base.endsWith(".adsc") && !_base.endsWith(".as") && !isKimChristensenFormat(buf)) throw new Error("Not a Kim Christensen module");
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^kim\./i, "") || baseName;
  const instruments = [];
  const ptrs = scanKimDataPointers(buf);
  if (ptrs) {
    const { origin, sampleTableFileOff, sampleCount } = ptrs;
    for (let i = 0; i < sampleCount; i++) {
      const descOff = sampleTableFileOff + i * 6;
      if (descOff + 6 > buf.length) break;
      const addr = u32BE(buf, descOff);
      const length = u16BE(buf, descOff + 4) * 2;
      const fileOff = addr - origin >>> 0;
      if (fileOff + length <= buf.length && length > 0) {
        const pcm = buf.slice(fileOff, fileOff + length);
        instruments.push(createSamplerInstrument(
          i + 1,
          `KIM Sample ${i + 1}`,
          pcm,
          64,
          8287,
          0,
          0
        ));
      } else {
        instruments.push({
          id: i + 1,
          name: `KIM Sample ${i + 1}`,
          type: "synth",
          synthType: "Synth",
          effects: [],
          volume: 0,
          pan: 0
        });
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
  return {
    name: `${moduleName} [Kim Christensen]`,
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
  isKimChristensenFormat,
  parseKimChristensenFile
};
