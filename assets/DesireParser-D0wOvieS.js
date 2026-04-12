import { c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const MIN_FILE_SIZE = 2501;
const NUM_PLACEHOLDER_INSTRUMENTS = 8;
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function s16BE(buf, off) {
  const v = buf[off] << 8 | buf[off + 1];
  return v < 32768 ? v : v - 65536;
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function scanDesireSamplePointers(buf) {
  const len = buf.length;
  let e341Pos = -1;
  for (let pos = 72; pos + 1 < len && pos < 2e3; pos += 2) {
    if (u16BE(buf, pos) === 58177) {
      e341Pos = pos;
      break;
    }
  }
  if (e341Pos < 0) return null;
  const matches47FA = [];
  for (let pos = e341Pos + 2; pos + 3 < len && matches47FA.length < 3; pos += 2) {
    if (u16BE(buf, pos) === 18426) {
      matches47FA.push(pos);
    }
  }
  if (matches47FA.length < 3) return null;
  const disp1 = s16BE(buf, matches47FA[0] + 2);
  const lengthsOff = matches47FA[0] + 2 + disp1;
  const disp2 = s16BE(buf, matches47FA[1] + 2);
  const offsetsOff = matches47FA[1] + 2 + disp2;
  const ruchWordPos = matches47FA[2] + 4;
  if (ruchWordPos + 1 >= len) return null;
  const ruchWord = u16BE(buf, ruchWordPos);
  const ruch = ruchWord & 3584 ? ruchWord >> 8 >> 1 : 8;
  let count = 0;
  for (let off = lengthsOff; off + 1 < len; off += 2) {
    const val = u16BE(buf, off);
    if (val === 0) break;
    count++;
  }
  if (count === 0 || lengthsOff < 0 || offsetsOff < 0) return null;
  return { lengthsOff, offsetsOff, ruch, count };
}
function isDesireFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  for (let i = 0; i < 4; i++) {
    const off = 8 + i * 16;
    if (off + 3 >= buf.length) return false;
    if (u32BE(buf, off) !== 65793) return false;
  }
  const scanStart = 72;
  const scanEnd = 472;
  for (let pos = scanStart; pos < scanEnd; pos += 2) {
    if (pos + 1 >= buf.length) return false;
    if (u16BE(buf, pos) !== 18938) continue;
    if (pos + 19 >= buf.length) return false;
    if (u32BE(buf, pos + 4) !== 1173946591) continue;
    if (u32BE(buf, pos + 8) !== 4026545532) continue;
    if (u32BE(buf, pos + 12) !== 16711838) continue;
    if (u16BE(buf, pos + 16) !== 16890) continue;
    const rel = s16BE(buf, pos + 18);
    if (pos + 18 + rel !== 0) continue;
    return true;
  }
  return false;
}
function parseDesireFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (!isDesireFormat(buf)) {
    throw new Error("Not a Desire module");
  }
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^dsr\./i, "").replace(/\.dsr$/i, "") || baseName;
  const instruments = [];
  const ptrs = scanDesireSamplePointers(buf);
  if (ptrs) {
    const { lengthsOff, offsetsOff, ruch, count } = ptrs;
    for (let i = 0; i < count; i++) {
      const lengthWord = u16BE(buf, lengthsOff + i * 2);
      const offsetWord = u16BE(buf, offsetsOff + i * 2);
      const pcmOffset = offsetWord << ruch;
      const pcmLength = lengthWord * 2;
      if (pcmOffset + pcmLength <= buf.length && pcmLength > 0) {
        const pcm = buf.slice(pcmOffset, pcmOffset + pcmLength);
        instruments.push(createSamplerInstrument(
          i + 1,
          `DSR Sample ${i + 1}`,
          pcm,
          64,
          8287,
          0,
          0
        ));
      } else {
        instruments.push({
          id: i + 1,
          name: `DSR Sample ${i + 1}`,
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
    for (let i = 0; i < NUM_PLACEHOLDER_INSTRUMENTS; i++) {
      instruments.push({
        id: i + 1,
        name: `Sample ${i + 1}`,
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
      originalInstrumentCount: instruments.length
    }
  };
  return {
    name: `${moduleName} [Desire]`,
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
  isDesireFormat,
  parseDesireFile
};
