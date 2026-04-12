const MIN_FILE_SIZE = 60;
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function isBenDaglishSIDFormat(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (filename !== void 0) {
    const base = (filename.split("/").pop() ?? filename).toLowerCase();
    if (!base.endsWith(".bds")) return false;
  }
  if (buf.length < MIN_FILE_SIZE) return false;
  if (u32BE(buf, 0) !== 1011) return false;
  if (buf[20] === 0) return false;
  if (u32BE(buf, 32) !== 1895779957) return false;
  if (u32BE(buf, 36) !== 1145128780) return false;
  if (u32BE(buf, 40) !== 1230194721) return false;
  if (u32BE(buf, 44) === 0) return false;
  if (u32BE(buf, 48) === 0) return false;
  if (u32BE(buf, 52) === 0) return false;
  if (u32BE(buf, 56) === 0) return false;
  return true;
}
async function parseBenDaglishSIDFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (!isBenDaglishSIDFormat(buffer, filename)) {
    throw new Error("Not a Ben Daglish SID module");
  }
  const baseName = filename.split("/").pop() ?? filename;
  let moduleName = baseName.replace(/\.bds$/i, "") || baseName;
  const rawSubsongs = u32BE(buf, 56);
  const subsongCount = Math.min(Math.max(rawSubsongs, 1), 64);
  const initSongPtr = u32BE(buf, 52);
  const instruments = [];
  for (let i = 0; i < 3; i++) {
    instruments.push({
      id: i + 1,
      name: `SID Voice ${i + 1}`,
      type: "synth",
      synthType: "Synth",
      effects: [],
      volume: 0,
      pan: 0
    });
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
    channels: Array.from({ length: 3 }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `SID Voice ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: ch === 0 ? -50 : ch === 1 ? 0 : 50,
      instrumentId: null,
      color: null,
      rows: emptyRows
    })),
    importMetadata: {
      sourceFormat: "MOD",
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: 3,
      originalPatternCount: 1,
      originalInstrumentCount: 3,
      subsongCount,
      initSongPtr
    }
  };
  let displayName = `${moduleName} [Ben Daglish SID]`;
  if (subsongCount > 1) {
    displayName += ` (${subsongCount} subsongs)`;
  }
  return {
    name: displayName,
    format: "MOD",
    patterns: [pattern],
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: 3,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename
  };
}
export {
  isBenDaglishSIDFormat,
  parseBenDaglishSIDFile
};
