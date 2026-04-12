const MIN_FILE_SIZE = 1728;
const MAX_SAMPLES = 30;
const MAX_SIZE_FIELD = 2097152;
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function isTomyTrackerFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  const d1 = u32BE(buf, 0);
  const d2 = u32BE(buf, 4);
  if (d1 < 1 || d1 > MAX_SIZE_FIELD) return false;
  if (d1 & 1) return false;
  if (d2 > d1) return false;
  if (d2 & 1) return false;
  if (d2 < 704) return false;
  if ((d2 - 704) % 1024 !== 0) return false;
  return true;
}
function parseTomyTrackerFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (!isTomyTrackerFormat(buf)) {
    throw new Error("Not a Tomy Tracker module");
  }
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^sg\./i, "") || baseName;
  const d2 = u32BE(buf, 4);
  const patternCount = (d2 - 704) / 1024;
  const instruments = Array.from(
    { length: MAX_SAMPLES },
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
    name: `${moduleName} [TomyTracker]${nameSuffix}`,
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
  isTomyTrackerFormat,
  parseTomyTrackerFile
};
