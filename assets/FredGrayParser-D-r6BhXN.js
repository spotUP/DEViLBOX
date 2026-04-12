const MAGIC_OFFSET = 36;
const MAGIC = "FREDGRAY";
const MIN_FILE_SIZE = MAGIC_OFFSET + MAGIC.length;
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function isFredGrayFormat(buffer, filename) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length >= MIN_FILE_SIZE) {
    let match = true;
    for (let i = 0; i < MAGIC.length; i++) {
      if (buf[MAGIC_OFFSET + i] !== MAGIC.charCodeAt(i)) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  if (!filename) return false;
  const base = (filename.split("/").pop() ?? filename).split("\\").pop().toLowerCase();
  return base.startsWith("gray.");
}
function parseFredGrayFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (!isFredGrayFormat(buf, filename)) throw new Error("Not a Fred Gray module");
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^gray\./i, "").replace(/\.gray$/i, "") || baseName;
  const instruments = [];
  let sampleCount = 0;
  try {
    const postMagic = MAGIC_OFFSET + MAGIC.length;
    if (buf.length > postMagic + 8) {
      let off = postMagic;
      for (let i = 0; i < 32 && off + 8 <= buf.length; i++) {
        const val0 = u32BE(buf, off);
        const val1 = u32BE(buf, off + 4);
        if (val0 < buf.length && val1 > 0 && val1 < 262144 && val1 % 2 === 0) {
          sampleCount++;
          off += 8;
        } else {
          break;
        }
      }
      for (let i = 0; i < sampleCount; i++) {
        const sLen = u32BE(buf, postMagic + i * 8 + 4);
        instruments.push({
          id: i + 1,
          name: `Sample ${i + 1} (${sLen} bytes)`,
          type: "synth",
          synthType: "Synth",
          effects: [],
          volume: 0,
          pan: 0
        });
      }
    }
    if (sampleCount === 0 && buf.length >= 8) {
      const candidate = u16BE(buf, 0);
      if (candidate > 0 && candidate <= 64) {
        sampleCount = candidate;
        for (let i = 0; i < sampleCount; i++) {
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
      originalInstrumentCount: sampleCount
    }
  };
  return {
    name: `${moduleName} [Fred Gray]`,
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
  isFredGrayFormat,
  parseFredGrayFile
};
