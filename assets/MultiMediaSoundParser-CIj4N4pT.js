const NUM_LONGS = 31;
const MAX_LONG_VALUE = 131072;
const MIN_FILE_SIZE = 130;
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function isMultiMediaSoundFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  for (let i = 0; i < NUM_LONGS; i++) {
    const val = u32BE(buf, i * 4);
    if (val & 1) return false;
    if (val > MAX_LONG_VALUE) return false;
  }
  const magicOff = NUM_LONGS * 4;
  if (buf[magicOff] !== 83) return false;
  if (buf[magicOff + 1] !== 79) return false;
  if (buf[magicOff + 2] !== 51) return false;
  if (buf[magicOff + 3] !== 49) return false;
  if (u16BE(buf, magicOff + 4) === 0) return false;
  return true;
}
function parseMultiMediaSoundFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (!isMultiMediaSoundFormat(buf)) {
    throw new Error("Not a MultiMedia Sound module");
  }
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^mms\./i, "").replace(/^sfx20\./i, "") || baseName;
  const instruments = [
    {
      id: 1,
      name: "Sample 1",
      type: "synth",
      synthType: "Synth",
      effects: [],
      volume: 0,
      pan: 0
    }
  ];
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
      originalInstrumentCount: 0
    }
  };
  return {
    name: `${moduleName} [MultiMedia Sound]`,
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
  isMultiMediaSoundFormat,
  parseMultiMediaSoundFile
};
