import { c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function readAmigaStr(buf, off, len) {
  let s = "";
  for (let i = 0; i < len && off + i < buf.length; i++) {
    const c = buf[off + i];
    if (c === 0) break;
    if (c >= 32 && c <= 126) s += String.fromCharCode(c);
  }
  return s.trim();
}
const MIN_FILE_SIZE = 1084 + 1024 + 4 + 1;
const MAGIC_OFFSET = 1080;
const MAGIC_JS92 = (74 << 24 | 83 << 16 | 57 << 8 | 50) >>> 0;
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function isJanneSalmijarviFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  return u32BE(buf, MAGIC_OFFSET) === MAGIC_JS92;
}
function parseJanneSalmijarviFile(buffer, filename) {
  var _a;
  const buf = new Uint8Array(buffer);
  const _base = ((_a = filename.split("/").pop()) == null ? void 0 : _a.toLowerCase()) ?? "";
  if (!_base.startsWith("js.") && !_base.endsWith(".bss") && !isJanneSalmijarviFormat(buf)) throw new Error("Not a Janne Salmijarvi Optimizer module");
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^js\./i, "") || baseName;
  const songLen = buf[950];
  let maxPatIdx = 0;
  for (let i = 0; i < Math.min(songLen, 128); i++) {
    if (buf[952 + i] > maxPatIdx) maxPatIdx = buf[952 + i];
  }
  const numPatterns = maxPatIdx + 1;
  const pcmStart = 1084 + numPatterns * 1024;
  const instruments = [];
  let pcmPos = pcmStart;
  let smpCount = 0;
  for (let i = 0; i < 31; i++) {
    const descOff = 20 + i * 30;
    const name = readAmigaStr(buf, descOff, 22) || `JS Sample ${i + 1}`;
    const lenWords = u16BE(buf, descOff + 22);
    const lenBytes = lenWords * 2;
    const loopStart = u16BE(buf, descOff + 26) * 2;
    const loopLen = u16BE(buf, descOff + 28) * 2;
    if (lenBytes > 0 && pcmPos + lenBytes <= buf.length) {
      const pcm = buf.slice(pcmPos, pcmPos + lenBytes);
      const loopEnd = loopLen > 2 ? loopStart + loopLen : 0;
      instruments.push(createSamplerInstrument(
        i + 1,
        name,
        pcm,
        64,
        8287,
        loopLen > 2 ? loopStart : 0,
        loopEnd
      ));
      smpCount++;
    } else if (lenBytes > 0) {
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
    pcmPos += lenBytes;
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
      originalPatternCount: numPatterns,
      originalInstrumentCount: instruments.length
    }
  };
  return {
    name: `${moduleName} [JS92] (${numPatterns} patt, ${smpCount} smp)`,
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
  isJanneSalmijarviFormat,
  parseJanneSalmijarviFile
};
