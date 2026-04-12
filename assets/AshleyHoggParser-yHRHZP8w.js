import { c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const MIN_FILE_SIZE = 20;
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function s16BE(buf, off) {
  const v = u16BE(buf, off);
  return v >= 32768 ? v - 65536 : v;
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function isAshleyHoggFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  let off = 0;
  for (let i = 0; i < 4; i++) {
    if (off + 4 > buf.length) return false;
    if (u16BE(buf, off) !== 24576) return false;
    off += 2;
    const d2 = u16BE(buf, off);
    off += 2;
    if (d2 === 0) return false;
    if (d2 & 32768) return false;
    if (d2 & 1) return false;
  }
  if (off + 4 <= buf.length) {
    const w0 = u16BE(buf, off);
    if (w0 === 24576) {
      const d2a = u16BE(buf, off + 2);
      if (d2a !== 0 && !(d2a & 32768) && !(d2a & 1)) {
        const off2 = off + 4;
        if (off2 + 4 <= buf.length) {
          const w1 = u16BE(buf, off2);
          if (w1 === 24576) {
            const d2b = u16BE(buf, off2 + 2);
            if (d2b !== 0 && !(d2b & 32768) && !(d2b & 1)) {
              const codeOff = off2 + 2 + d2b;
              if (codeOff + 10 <= buf.length) {
                if (u32BE(buf, codeOff) === 1223163902 && u16BE(buf, codeOff + 4) === 24832) {
                  const bsrOff = s16BE(buf, codeOff + 6);
                  const leaOff = codeOff + 6 + bsrOff;
                  if (leaOff + 6 <= buf.length && u16BE(buf, leaOff) === 19961 && u32BE(buf, leaOff + 2) === 14675968) {
                    return true;
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  if (off + 8 <= buf.length) {
    if (u32BE(buf, off) === 809238528 && u32BE(buf, off + 4) === 1713517504) {
      return true;
    }
  }
  return false;
}
function isOldFormat(buf) {
  if (buf.length < 24) return false;
  let off = 0;
  for (let i = 0; i < 4; i++) {
    if (u16BE(buf, off) !== 24576) return false;
    const d2 = u16BE(buf, off + 2);
    if (d2 === 0 || d2 & 32768 || d2 & 1) return false;
    off += 4;
  }
  return u32BE(buf, 16) === 809238528 && u32BE(buf, 20) === 1713517504;
}
function scanWord(buf, off, needle, limit) {
  const end = Math.min(buf.length - 1, off + limit);
  for (let i = off; i < end; i += 2) {
    if (u16BE(buf, i) === needle) return i + 2;
  }
  return -1;
}
function extractOldFormatSamples(buf) {
  const instruments = [];
  const len = buf.length;
  if (len < 20) return instruments;
  let a0 = 2;
  const jumpDist = u16BE(buf, a0);
  a0 += jumpDist;
  if (a0 >= len) return instruments;
  let a2 = 16;
  const find5Pos = scanWord(buf, a2, 49916, 65536);
  if (find5Pos < 0) return instruments;
  a2 = find5Pos;
  a2 += 4;
  let samplesInfoPtr = a2;
  if (samplesInfoPtr + 2 > len) return instruments;
  const infoDisp = s16BE(buf, samplesInfoPtr);
  samplesInfoPtr += infoDisp;
  if (samplesInfoPtr < 0 || samplesInfoPtr >= len) return instruments;
  const find6Pos = scanWord(buf, a2, 18426, 65536);
  if (find6Pos < 0) return instruments;
  a0 = find6Pos;
  const sampDisp = s16BE(buf, find6Pos);
  let samplesPtr = find6Pos + sampDisp;
  if (samplesPtr < 0 || samplesPtr >= len) return instruments;
  let find7Pos = scanWord(buf, a0, 18938, 65536);
  if (find7Pos < 0) return instruments;
  const find8Pos = scanWord(buf, find7Pos, 18938, 65536);
  if (find8Pos < 0) return instruments;
  if (find8Pos + 2 > len) return instruments;
  const endDisp = s16BE(buf, find8Pos);
  const endInfoPtr = find8Pos + endDisp;
  const rawCount = Math.floor((endInfoPtr - samplesInfoPtr) / 44);
  const sampleCount = Math.min(Math.max(0, rawCount), 64);
  for (let i = 0; i < sampleCount; i++) {
    const descOff = samplesInfoPtr + i * 44;
    if (descOff + 44 > len) break;
    const sampleOffset = u32BE(buf, descOff + 32);
    if (sampleOffset >= 2147483648) continue;
    const lengthInWords = u16BE(buf, descOff + 40);
    const sampleLen = lengthInWords * 2;
    const pcmFileOff = samplesPtr + sampleOffset;
    if (sampleLen > 0 && pcmFileOff + sampleLen <= len) {
      const pcm = buf.slice(pcmFileOff, pcmFileOff + sampleLen);
      instruments.push(createSamplerInstrument(
        i + 1,
        `ASH Sample ${i + 1}`,
        pcm,
        64,
        8287,
        0,
        0
      ));
    } else {
      instruments.push({
        id: i + 1,
        name: `ASH Sample ${i + 1}`,
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
function extractNewFormatSamples(_buf) {
  return [];
}
function parseAshleyHoggFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (!isAshleyHoggFormat(buf)) throw new Error("Not an Ashley Hogg module");
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^ash\./i, "") || baseName;
  let instruments;
  if (isOldFormat(buf)) {
    instruments = extractOldFormatSamples(buf);
  } else {
    instruments = extractNewFormatSamples();
  }
  if (instruments.length === 0) {
    instruments = [{
      id: 1,
      name: "Sample 1",
      type: "synth",
      synthType: "Synth",
      effects: [],
      volume: 0,
      pan: 0
    }];
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
    name: `${moduleName} [Ashley Hogg]`,
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
  isAshleyHoggFormat,
  parseAshleyHoggFile
};
