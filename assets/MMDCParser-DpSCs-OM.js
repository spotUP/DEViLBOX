const MIN_FILE_SIZE = 20;
const MAX_PATTERNS = 128;
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function isMMDCFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  if (buf[0] !== 77 || buf[1] !== 77 || buf[2] !== 68 || buf[3] !== 67)
    return false;
  if (u16BE(buf, 16) !== 0) return false;
  const offset = u16BE(buf, 18);
  if (offset === 0) return false;
  if (offset & 32768) return false;
  if (offset & 1) return false;
  if (offset + 1 >= buf.length) return false;
  if (u16BE(buf, offset) !== 0) return false;
  return true;
}
function parseMMDCFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (!isMMDCFormat(buf)) {
    throw new Error("Not an MMDC module");
  }
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^mmdc\./i, "").replace(/\.mmdc$/i, "") || baseName;
  let patternCount = 0;
  if (buf.length >= 558) {
    const raw = u16BE(buf, 556);
    patternCount = Math.min(raw, MAX_PATTERNS);
  }
  const instruments = Array.from(
    { length: 1 },
    (_, i) => ({
      id: i + 1,
      name: `Sample ${i + 1}`,
      type: "synth",
      synthType: "Synth",
      effects: [],
      volume: 0,
      pan: 0
    })
  );
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
  const nameSuffix = patternCount > 0 ? ` (${patternCount} patt)` : "";
  return {
    name: `${moduleName} [MMDC]${nameSuffix}`,
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
  isMMDCFormat,
  parseMMDCFile
};
