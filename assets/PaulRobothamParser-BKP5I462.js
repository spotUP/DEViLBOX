import { c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const MIN_FILE_SIZE = 270;
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function safeU16(buf, off) {
  if (off < 0 || off + 1 >= buf.length) return 65535;
  return u16BE(buf, off);
}
function safeU32(buf, off) {
  if (off < 0 || off + 3 >= buf.length) return 0;
  return u32BE(buf, off);
}
function isPaulRobothamFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  const D1 = safeU16(buf, 0);
  if (D1 === 0 || D1 > 4) return false;
  if (buf[2] !== 0) return false;
  const D2 = safeU16(buf, 2);
  if (buf[4] !== 0) return false;
  const D3 = safeU16(buf, 4);
  const D4 = safeU16(buf, 6);
  let pos = 8;
  for (let i = 0; i < D1; i++) {
    if (safeU16(buf, pos) !== 0) return false;
    if (safeU32(buf, pos) === 0) return false;
    pos += 4;
  }
  for (let i = 0; i < D2; i++) {
    const val = safeU32(buf, pos);
    if (val === 0) return false;
    if (val & 2147483648) return false;
    if (val & 1) return false;
    pos += 4;
  }
  const D2_ref = safeU32(buf, pos);
  for (let i = 0; i < D3; i++) {
    const val = safeU32(buf, pos);
    if (val === 0) return false;
    if (val & 2147483648) return false;
    if (val & 1) return false;
    pos += 4;
  }
  pos += D4 * 12;
  if (pos !== D2_ref) return false;
  const finalBase = D2_ref;
  for (let i = 0; i < 127; i++) {
    if (safeU16(buf, finalBase + i * 2) !== 16191) return false;
  }
  return true;
}
function parsePaulRobothamFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (!isPaulRobothamFormat(buf)) throw new Error("Not a Paul Robotham module");
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^dat\./i, "") || baseName;
  const D7 = safeU16(buf, 0);
  const D6 = safeU16(buf, 2);
  const D5 = safeU16(buf, 4);
  const D4 = safeU16(buf, 6);
  const instrTableOff = 8 + D7 * 4 + D6 * 4 + D5 * 4;
  const instrTableEnd = instrTableOff + D4 * 12;
  const sampleDataBase = instrTableEnd + 254;
  const instruments = [];
  let samplesExtracted = false;
  if (D4 > 0 && instrTableOff + D4 * 12 <= buf.length) {
    for (let i = 0; i < D4 && i < 64; i++) {
      const descOff = instrTableOff + i * 12;
      if (descOff + 6 > buf.length) break;
      const sampleAddr = u32BE(buf, descOff);
      const lengthWords = safeU16(buf, descOff + 4);
      const lengthBytes = lengthWords * 2;
      const pcmOff = sampleDataBase + sampleAddr;
      if (lengthBytes > 0 && pcmOff >= 0 && pcmOff + lengthBytes <= buf.length) {
        const pcm = buf.slice(pcmOff, pcmOff + lengthBytes);
        instruments.push(createSamplerInstrument(
          i + 1,
          `PR Sample ${i + 1}`,
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
          name: `PR Sample ${i + 1}`,
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
    channels: Array.from({ length: D7 || 4 }, (_, ch) => ({
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
      originalChannelCount: D7 || 4,
      originalPatternCount: D5,
      originalInstrumentCount: D4
    }
  };
  const nameParts = [`${moduleName} [Paul Robotham]`];
  if (samplesExtracted) nameParts.push(`(${instruments.length} smp)`);
  else if (D4 > 0) nameParts.push(`(${D4} inst)`);
  return {
    name: nameParts.join(" "),
    format: "MOD",
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: D7 || 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename
  };
}
export {
  isPaulRobothamFormat,
  parsePaulRobothamFile
};
