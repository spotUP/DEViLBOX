import { c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const MIN_FILE_SIZE = 530;
const NUM_SAMPLES = 15;
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function safeU16(buf, off) {
  if (off < 0 || off + 1 >= buf.length) return 1;
  return u16BE(buf, off);
}
function safeU32(buf, off) {
  if (off < 0 || off + 3 >= buf.length) return 0;
  return u32BE(buf, off);
}
function detectVariant(buf) {
  if (buf.length < MIN_FILE_SIZE) return null;
  if (safeU32(buf, 0) !== 0) return null;
  if (safeU32(buf, 4) !== 0) return null;
  if (safeU16(buf, 8) !== 0) return null;
  const d1_new = safeU16(buf, 164);
  if (d1_new === safeU16(buf, 168) && d1_new === safeU16(buf, 172) && d1_new === safeU16(buf, 176)) {
    const ptr_new = safeU16(buf, 160);
    if (ptr_new !== 0 && (ptr_new & 32768) === 0 && (ptr_new & 1) === 0) {
      if (safeU32(buf, ptr_new) === 11796662) return "new";
    }
  }
  const d1_old = safeU16(buf, 516);
  if (d1_old === safeU16(buf, 520) && d1_old === safeU16(buf, 524) && d1_old === safeU16(buf, 528)) {
    const ptr_old = safeU16(buf, 512);
    if (ptr_old !== 0 && (ptr_old & 32768) === 0 && (ptr_old & 1) === 0) {
      if (safeU32(buf, ptr_old) === 34865686) return "old";
    }
  }
  const d1_vold = safeU16(buf, 514);
  if (d1_vold === safeU16(buf, 518) && d1_vold === safeU16(buf, 522) && d1_vold === safeU16(buf, 526)) {
    const ptr_vold = safeU16(buf, 516);
    if (ptr_vold !== 0 && (ptr_vold & 32768) === 0 && (ptr_vold & 1) === 0) {
      const wordBefore = safeU16(buf, ptr_vold - 2);
      if (wordBefore === 65516 || wordBefore === 65512) return "veryold";
    }
  }
  return null;
}
function isPaulShieldsFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return detectVariant(buf) !== null;
}
function findSampleDataOffset(buf, variant) {
  let ptrOffsets;
  if (variant === "new") {
    ptrOffsets = [166, 170, 174, 178];
  } else if (variant === "old") {
    ptrOffsets = [518, 522, 526, 530];
  } else {
    ptrOffsets = [514, 518, 522, 526];
  }
  let maxPtr = 0;
  for (const off of ptrOffsets) {
    const val = safeU16(buf, off);
    if (val > maxPtr) maxPtr = val;
  }
  if (maxPtr === 0 || maxPtr >= buf.length) return 0;
  let pos = maxPtr;
  if (pos < 2) return 0;
  const sentinel = safeU16(buf, pos - 2);
  while (pos + 1 < buf.length) {
    if (safeU16(buf, pos) !== sentinel) break;
    pos += 2;
  }
  return pos;
}
function parsePaulShieldsFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  const variant = detectVariant(buf);
  if (!variant) throw new Error("Not a Paul Shields module");
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^ps\./i, "").replace(/\.ps$/i, "") || baseName;
  const isNew = variant === "new";
  const recordSize = isNew ? 10 : 32;
  const recordStart = isNew ? 10 : 32;
  const lenOffset = isNew ? 2 : 22;
  const sampleDataStart = findSampleDataOffset(buf, variant);
  const instruments = [];
  let pcmPos = sampleDataStart;
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const recOff = recordStart + i * recordSize;
    if (recOff + recordSize > buf.length) {
      instruments.push({
        id: i + 1,
        name: `Sample ${i + 1}`,
        type: "synth",
        synthType: "Synth",
        effects: [],
        volume: 0,
        pan: 0
      });
      continue;
    }
    const lenWords = u16BE(buf, recOff + lenOffset);
    const lenBytes = lenWords * 2;
    let loopStart = 0;
    let loopLen = 0;
    if (isNew) {
      loopStart = u16BE(buf, recOff + 4);
      loopLen = u16BE(buf, recOff + 6);
    } else {
      loopStart = u16BE(buf, recOff + 26);
      loopLen = u16BE(buf, recOff + 28);
    }
    let name = "";
    if (!isNew) {
      for (let j = 0; j < 22; j++) {
        const c = buf[recOff + j];
        if (c === 0) break;
        if (c >= 32 && c < 127) name += String.fromCharCode(c);
      }
    }
    if (lenBytes === 0 || sampleDataStart === 0) {
      instruments.push({
        id: i + 1,
        name: name || `Sample ${i + 1}`,
        type: "synth",
        synthType: "Synth",
        effects: [],
        volume: 0,
        pan: 0
      });
      continue;
    }
    const safeLen = Math.min(lenBytes, buf.length - pcmPos);
    if (safeLen > 0 && pcmPos < buf.length) {
      const pcm = buf.slice(pcmPos, pcmPos + safeLen);
      const hasLoop = loopLen >= 2;
      const loopStartBytes = loopStart;
      const loopEndBytes = hasLoop ? loopStartBytes + loopLen * 2 : 0;
      instruments.push(createSamplerInstrument(
        i + 1,
        name || `Sample ${i + 1}`,
        pcm,
        64,
        // EPS_Volume = 64
        8287,
        // Amiga PAL base rate
        hasLoop ? loopStartBytes : 0,
        hasLoop ? loopEndBytes : 0
      ));
    } else {
      instruments.push({
        id: i + 1,
        name: name || `Sample ${i + 1}`,
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
    for (let i = 0; i < 8; i++) {
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
    name: `${moduleName} [Paul Shields]`,
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
  isPaulShieldsFormat,
  parsePaulShieldsFile
};
