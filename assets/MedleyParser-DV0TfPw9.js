function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function isMedleyFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < 8) return false;
  return buf[0] === 77 && buf[1] === 83 && buf[2] === 79 && buf[3] === 66;
}
function parseMedleyFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (!isMedleyFormat(buf)) {
    throw new Error("Not a Medley module");
  }
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^mso\./i, "").replace(/\.ml$/i, "") || baseName;
  let subsongCount = 1;
  if (buf.length >= 8) {
    const relPtr = u32BE(buf, 4);
    const targetOffset = 4 + relPtr;
    const subsongWordOffset = targetOffset - 2;
    if (subsongWordOffset >= 0 && subsongWordOffset + 2 <= buf.length) {
      const raw = u16BE(buf, subsongWordOffset);
      if (raw > 0) {
        subsongCount = Math.min(Math.max(raw, 1), 64);
      }
    }
  }
  let sampleCount = 1;
  try {
    const relPtr = u32BE(buf, 4);
    const dataRegion = 4 + relPtr;
    const scanStart = 8;
    const scanEnd = Math.min(dataRegion, buf.length - 4, 4096);
    for (let off = scanStart; off < scanEnd; off += 2) {
      const val = u16BE(buf, off);
      if (val >= 2 && val <= 32) {
        let valid = true;
        for (let i = 1; i <= Math.min(val, 8); i++) {
          if (off + i * 2 + 2 > buf.length) {
            valid = false;
            break;
          }
          const next = u16BE(buf, off + i * 2);
          if (next === 0) {
            valid = false;
            break;
          }
        }
        if (valid) {
          sampleCount = val;
          break;
        }
      }
    }
  } catch {
  }
  const songPositions = Array.from({ length: Math.max(subsongCount, 1) }, (_, i) => i % 1);
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
      subsongCount
    }
  };
  const instruments = [];
  for (let i = 0; i < sampleCount; i++) {
    instruments.push({
      id: i + 1,
      name: `Medley Sample ${i + 1}`,
      type: "synth",
      synthType: "Synth",
      effects: [],
      volume: 0,
      pan: 0
    });
  }
  return {
    name: `${moduleName} [Medley]${subsongCount > 1 ? ` (${subsongCount} subsongs)` : ""}`,
    format: "MOD",
    patterns: [pattern],
    instruments,
    songPositions,
    songLength: songPositions.length,
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
  isMedleyFormat,
  parseMedleyFile
};
