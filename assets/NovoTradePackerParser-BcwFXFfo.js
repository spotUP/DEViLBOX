import { c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const MIN_FILE_SIZE = 32;
const MAX_INSTRUMENTS = 64;
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) & 65535;
}
function isNovoTradePackerFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  if (buf[0] !== 77 || buf[1] !== 79 || buf[2] !== 68 || buf[3] !== 85) {
    return false;
  }
  const d1 = u16BE(buf, 16);
  if (d1 === 0) return false;
  if (d1 & 32768) return false;
  if (d1 & 1) return false;
  const d2 = u16BE(buf, 24);
  if (d2 === 0) return false;
  if (d2 & 32768) return false;
  if (d2 & 1) return false;
  const bodyOffset = 4 + d1;
  if (bodyOffset + 4 > buf.length) return false;
  if (buf[bodyOffset] !== 66 || buf[bodyOffset + 1] !== 79 || buf[bodyOffset + 2] !== 68 || buf[bodyOffset + 3] !== 89) {
    return false;
  }
  const sampOffset = 4 + d1 + d2;
  if (sampOffset + 4 > buf.length) return false;
  if (buf[sampOffset] !== 83 || buf[sampOffset + 1] !== 65 || buf[sampOffset + 2] !== 77 || buf[sampOffset + 3] !== 80) {
    return false;
  }
  return true;
}
function parseNovoTradePackerFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (!isNovoTradePackerFormat(buf)) {
    throw new Error("Not a NovoTrade Packer module");
  }
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^ntp\./i, "").replace(/\.ntp$/i, "") || baseName;
  let sampleCount = 0;
  let songLength = 0;
  let patternCount = 0;
  if (buf.length >= MIN_FILE_SIZE) {
    sampleCount = u16BE(buf, 22);
    songLength = u16BE(buf, 24);
    patternCount = u16BE(buf, 26);
  }
  const instruments = [];
  let samplesExtracted = false;
  if (sampleCount > 0 && buf.length >= MIN_FILE_SIZE) {
    const songSize = 12 + u16BE(buf, 20) + u16BE(buf, 28);
    const samplesFileOff = songSize;
    const descBase = 32;
    let pcmCursor = samplesFileOff;
    const count = Math.min(sampleCount, MAX_INSTRUMENTS);
    for (let i = 0; i < count; i++) {
      const descOff = descBase + i * 8;
      if (descOff + 8 > buf.length) break;
      const lengthWords = u16BE(buf, descOff);
      const lengthBytes = lengthWords * 2;
      if (lengthBytes > 0 && pcmCursor + lengthBytes <= buf.length) {
        const pcm = buf.slice(pcmCursor, pcmCursor + lengthBytes);
        instruments.push(createSamplerInstrument(
          i + 1,
          `NTP Sample ${i + 1}`,
          pcm,
          64,
          8287,
          0,
          0
        ));
        samplesExtracted = true;
      } else {
        instruments.push({
          id: i + 1,
          name: `NTP Sample ${i + 1}`,
          type: "synth",
          synthType: "Synth",
          effects: [],
          volume: 0,
          pan: 0
        });
      }
      pcmCursor += lengthBytes;
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
      originalPatternCount: patternCount,
      originalInstrumentCount: sampleCount
    }
  };
  const nameParts = [`${moduleName} [NovoTrade]`];
  if (patternCount > 0) nameParts.push(`(${patternCount} patt)`);
  if (samplesExtracted) nameParts.push(`(${instruments.length} smp)`);
  return {
    name: nameParts.join(" "),
    format: "MOD",
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: songLength || 1,
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
  isNovoTradePackerFormat,
  parseNovoTradePackerFile
};
