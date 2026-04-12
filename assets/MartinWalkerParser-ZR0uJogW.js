import { c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const MIN_FILE_SIZE = 300;
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function s16BE(buf, off) {
  const v = (buf[off] << 8 | buf[off + 1]) & 65535;
  return v >= 32768 ? v - 65536 : v;
}
function safeU16(buf, off) {
  if (off < 0 || off + 1 >= buf.length) return 0;
  return u16BE(buf, off);
}
function safeU32(buf, off) {
  if (off < 0 || off + 3 >= buf.length) return 0;
  return u32BE(buf, off);
}
function checkInnerLoop(buf, bodyOffset) {
  const D1 = 1223163134;
  if (safeU32(buf, bodyOffset + 4) !== 3913379840) return false;
  if (safeU16(buf, bodyOffset + 8) !== 16890) return false;
  const at140 = safeU32(buf, bodyOffset + 148);
  const at156 = safeU32(buf, bodyOffset + 164);
  const at160 = safeU32(buf, bodyOffset + 168);
  return at140 === D1 || at156 === D1 || at160 === D1;
}
function isMartinWalkerFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  const D1_MAGIC = 1223163134;
  if (safeU32(buf, 0) === D1_MAGIC) {
    if (safeU16(buf, 220) === 17914) ;
    else {
      if (checkInnerLoop(buf, 0)) return true;
    }
  }
  if (safeU32(buf, 0) === 789070330) {
    const rel2 = safeU16(buf, 4);
    const bodyAfterRel = 4 + rel2;
    const bodyOffset = bodyAfterRel + 28;
    if (safeU16(buf, bodyOffset + 220) !== 17914) return false;
    return checkInnerLoop(buf, bodyOffset);
  }
  if (safeU32(buf, 28) === D1_MAGIC) {
    const bodyOffset = 28;
    if (safeU16(buf, bodyOffset + 220) !== 17914) return false;
    return checkInnerLoop(buf, bodyOffset);
  }
  if (safeU16(buf, 0) === 24576) {
    const D2 = 24576;
    let ok4 = true;
    for (let i = 4; i <= 28; i += 4) {
      if (safeU16(buf, i) !== D2) {
        ok4 = false;
        break;
      }
    }
    if (ok4) {
      const at32 = safeU16(buf, 32);
      if (at32 !== D2) ;
      else {
        if (safeU16(buf, 36) !== D2) return false;
      }
      const rel4a = safeU16(buf, 14);
      const bodyA = 14 + rel4a;
      if (safeU32(buf, bodyA) === D1_MAGIC) {
        if (safeU16(buf, bodyA + 268) === 17914) {
          return checkInnerLoop(buf, bodyA);
        }
        if (safeU16(buf, bodyA + 274) === 59714) {
          return checkInnerLoop(buf, bodyA);
        }
        return false;
      }
      const rel4b = safeU16(buf, 26);
      const bodyB = 26 + rel4b;
      if (safeU32(buf, bodyB) !== D1_MAGIC) return false;
      if (safeU16(buf, bodyB + 4) !== 17402) return false;
      return true;
    }
  }
  for (let i = 0; i <= 4 * 2; i += 2) {
    if (safeU32(buf, i + 28) === 789070330) {
      for (let j = 0; j <= 75 * 2; j += 2) {
        const scanOff = i + j;
        if (safeU32(buf, scanOff) === D1_MAGIC) {
          if (safeU16(buf, scanOff + 268) === 17914) {
            return checkInnerLoop(buf, scanOff);
          }
          if (safeU16(buf, scanOff + 274) === 59714) {
            return checkInnerLoop(buf, scanOff);
          }
          return false;
        }
      }
    }
  }
  return false;
}
function scanMartinWalkerSamplePointers(buf) {
  const len = buf.length;
  let magicPos = -1;
  for (let i = 0; i + 3 < len; i += 2) {
    if (u32BE(buf, i) === 707940352) {
      magicPos = i;
      break;
    }
  }
  if (magicPos < 2) return null;
  const infoBase = magicPos - 2;
  if (infoBase + 1 >= len) return null;
  const samplesInfoOff = infoBase + s16BE(buf, infoBase);
  if (samplesInfoOff < 0 || samplesInfoOff >= len) return null;
  const sampBase = magicPos + 6;
  if (sampBase + 1 >= len) return null;
  let samplesOff = sampBase + s16BE(buf, sampBase);
  if (samplesOff & 1) samplesOff += 1;
  if (samplesOff < 0 || samplesOff >= len) return null;
  let endInfoOff = -1;
  let scanPos = magicPos + 6;
  for (let i = 0; i <= 10 && scanPos + 1 < len; i++, scanPos += 2) {
    if (u16BE(buf, scanPos) === 51964) {
      const a2Base = scanPos + 2 + 4;
      if (a2Base + 1 < len) {
        endInfoOff = a2Base + s16BE(buf, a2Base);
      }
      break;
    }
  }
  let entryCount;
  if (endInfoOff > samplesInfoOff && endInfoOff <= len) {
    entryCount = Math.floor((endInfoOff - samplesInfoOff) / 4);
  } else {
    entryCount = 0;
    for (let off = samplesInfoOff; off + 4 <= len && entryCount < 32; off += 4) {
      const val = u32BE(buf, off);
      if (val >= len - samplesOff) break;
      entryCount++;
    }
  }
  if (entryCount > 32) entryCount = 32;
  if (entryCount < 2) return null;
  const sampleCount = entryCount - 1;
  return { samplesInfoOff, samplesOff, sampleCount };
}
function parseMartinWalkerFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (!isMartinWalkerFormat(buf)) throw new Error("Not a Martin Walker module");
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^(avp|mw)\./i, "") || baseName;
  const instruments = [];
  const ptrs = scanMartinWalkerSamplePointers(buf);
  if (ptrs) {
    const { samplesInfoOff, samplesOff, sampleCount } = ptrs;
    for (let i = 0; i < sampleCount; i++) {
      const entryOff = samplesInfoOff + i * 4;
      if (entryOff + 8 > buf.length) break;
      const currentOffset = u32BE(buf, entryOff);
      const nextOffset = u32BE(buf, entryOff + 4);
      const sampleLen = nextOffset - currentOffset >>> 0;
      const pcmFileOff = samplesOff + currentOffset;
      if (sampleLen > 0 && sampleLen < 1048576 && pcmFileOff + sampleLen <= buf.length) {
        const pcm = buf.slice(pcmFileOff, pcmFileOff + sampleLen);
        instruments.push(createSamplerInstrument(
          i + 1,
          `MW Sample ${i + 1}`,
          pcm,
          64,
          8287,
          0,
          0
        ));
      } else {
        instruments.push({
          id: i + 1,
          name: `MW Sample ${i + 1}`,
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
    name: `${moduleName} [Martin Walker]`,
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
  isMartinWalkerFormat,
  parseMartinWalkerFile
};
