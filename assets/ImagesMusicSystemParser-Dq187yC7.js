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
const MIN_FILE_SIZE = 1852;
const MAX_SAMPLES = 31;
const MAX_PATTERNS = 64;
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function isImagesMusicSystemFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  const d1 = u32BE(buf, 1080);
  if (d1 < 1084) return false;
  if ((d1 - 1084) % 768 !== 0) return false;
  if (buf[950] >= 128) return false;
  if (buf.length < d1 + 4) return false;
  return true;
}
function parseImagesMusicSystemFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (!isImagesMusicSystemFormat(buf)) {
    throw new Error("Not an Images Music System module");
  }
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^ims\./i, "").replace(/\.ims$/i, "") || baseName;
  const d1 = u32BE(buf, 1080);
  const patternCount = Math.min((d1 - 1084) / 768, MAX_PATTERNS);
  const pcmStart = 1084 + patternCount * 768;
  const instruments = [];
  let pcmPos = pcmStart;
  let smpCount = 0;
  for (let i = 0; i < MAX_SAMPLES; i++) {
    const descOff = 20 + i * 30;
    const name = readAmigaStr(buf, descOff, 22) || `IMS Sample ${i + 1}`;
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
    pcmPos += lenBytes;
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
      originalPatternCount: patternCount || 1,
      originalInstrumentCount: 0
    }
  };
  const nameSuffix = `(${patternCount} patt, ${smpCount} smp)`;
  return {
    name: `${moduleName} [IMS] ${nameSuffix}`,
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
  isImagesMusicSystemFormat,
  parseImagesMusicSystemFile
};
