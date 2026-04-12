const MIN_FILE_SIZE = 16;
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function isSpecialFXFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  if (u16BE(buf, 0) !== 24576) return false;
  const d2 = u16BE(buf, 2);
  if (d2 === 0 || (d2 & 32768) !== 0 || (d2 & 1) !== 0) return false;
  if (u16BE(buf, 4) !== 24576) return false;
  const d3 = u16BE(buf, 6);
  if (d3 === 0 || (d3 & 32768) !== 0 || (d3 & 1) !== 0) return false;
  if (u16BE(buf, 8) !== 24576) return false;
  const d4 = u16BE(buf, 10);
  if (d4 === 0 || (d4 & 32768) !== 0 || (d4 & 1) !== 0) return false;
  if (u16BE(buf, 12) !== 24576) return false;
  const d5 = u16BE(buf, 14);
  if (d5 === 0 || (d5 & 32768) !== 0 || (d5 & 1) !== 0) return false;
  return true;
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function parseSpecialFXFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (!isSpecialFXFormat(buf)) throw new Error("Not a Special FX module");
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^jd\./i, "").replace(/^doda\./i, "").replace(/\.jd$/i, "").replace(/\.doda$/i, "") || baseName;
  const braTargets = [];
  for (let i = 0; i < 4; i++) {
    const disp = u16BE(buf, i * 4 + 2);
    const target = i * 4 + 2 + disp;
    if (target < buf.length) {
      braTargets.push(target);
    }
  }
  const instruments = [];
  let sampleCount = 0;
  try {
    const scanStart = braTargets.length > 0 ? Math.min(braTargets[0], buf.length - 4) : 16;
    const scanEnd = Math.min(buf.length - 4, scanStart + 2048);
    const tableRefs = [];
    for (let off = scanStart; off < scanEnd; off += 2) {
      const opcode = u16BE(buf, off);
      if ((opcode === 16890 || opcode === 17402 || opcode === 17914 || opcode === 18426) && off + 4 <= buf.length) {
        const disp = u16BE(buf, off + 2);
        const signedDisp = disp < 32768 ? disp : disp - 65536;
        const target = off + 2 + signedDisp;
        if (target > 0 && target < buf.length) {
          const reg = opcode === 16890 ? "A0" : opcode === 17402 ? "A1" : opcode === 17914 ? "A2" : "A3";
          tableRefs.push({ target, register: reg });
        }
      }
    }
    for (const ref of tableRefs) {
      let off = ref.target;
      const candidates = [];
      for (let i = 0; i < 32 && off + 8 <= buf.length; i++) {
        const smpOff = u32BE(buf, off);
        const smpLen = u32BE(buf, off + 4);
        if (smpLen === 0 || smpLen > 524288) break;
        if (smpOff > buf.length * 2) break;
        candidates.push(smpLen);
        off += 8;
      }
      if (candidates.length >= 2) {
        sampleCount = candidates.length;
        for (let i = 0; i < sampleCount; i++) {
          instruments.push({
            id: i + 1,
            name: `Sample ${i + 1} (${candidates[i]} bytes)`,
            type: "synth",
            synthType: "Synth",
            effects: [],
            volume: 0,
            pan: 0
          });
        }
        break;
      }
      off = ref.target;
      const candidates6 = [];
      for (let i = 0; i < 32 && off + 6 <= buf.length; i++) {
        const smpOff = u32BE(buf, off);
        const smpLen = u16BE(buf, off + 4) * 2;
        if (smpLen === 0 || smpLen > 524288) break;
        if (smpOff > buf.length * 2) break;
        candidates6.push(smpLen);
        off += 6;
      }
      if (candidates6.length >= 2) {
        sampleCount = candidates6.length;
        for (let i = 0; i < sampleCount; i++) {
          instruments.push({
            id: i + 1,
            name: `Sample ${i + 1} (${candidates6[i]} bytes)`,
            type: "synth",
            synthType: "Synth",
            effects: [],
            volume: 0,
            pan: 0
          });
        }
        break;
      }
    }
  } catch {
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
    sampleCount = 1;
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
      originalInstrumentCount: sampleCount,
      braTargets
    }
  };
  return {
    name: `${moduleName} [Special FX]`,
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
  isSpecialFXFormat,
  parseSpecialFXFile
};
