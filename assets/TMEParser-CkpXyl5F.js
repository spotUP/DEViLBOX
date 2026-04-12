const MIN_FILE_SIZE = 7e3;
const INSTRUMENT_COUNT = 31;
const MAX_SUBSONGS = 16;
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function isTMEFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  if (buf[0] !== 0) return false;
  const pattern1 = u32BE(buf, 60) === 1295 && u32BE(buf, 64) === 1295;
  if (pattern1) return true;
  const pattern2 = u32BE(buf, 4740) === 264977 && u32BE(buf, 4488) === 404628265 && u32BE(buf, 4748) === 792083521;
  return pattern2;
}
function parseTMEFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (!isTMEFormat(buf)) {
    throw new Error("Not a TME module");
  }
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^tme\./i, "").replace(/\.tme$/i, "") || baseName;
  const rawSubsongs = buf[5];
  const subsongCount = Math.min(Math.max(rawSubsongs + 1, 1), MAX_SUBSONGS);
  const instruments = Array.from(
    { length: INSTRUMENT_COUNT },
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
      originalPatternCount: 1,
      originalInstrumentCount: INSTRUMENT_COUNT
    }
  };
  const nameParts = [`${moduleName} [TME]`];
  if (subsongCount > 1) nameParts.push(`(${subsongCount} subsongs)`);
  return {
    name: nameParts.join(" "),
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
  isTMEFormat,
  parseTMEFile
};
