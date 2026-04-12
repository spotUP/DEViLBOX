const MIN_FILE_SIZE = 8;
const MAX_SAMPLES = 31;
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function isAlcatrazPackerFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  if (buf[0] !== 80 || buf[1] !== 65 || buf[2] !== 110 || buf[3] !== 16) return false;
  const totalSize = u32BE(buf, 4);
  if (totalSize === 0) return false;
  if (totalSize & 2147483648) return false;
  return true;
}
function parseAlcatrazPackerFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (!isAlcatrazPackerFormat(buf)) {
    throw new Error("Not an Alcatraz Packer module");
  }
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^alp\./i, "").replace(/\.alp$/i, "") || baseName;
  let sampleCount = 0;
  let songLength = 1;
  if (buf.length >= MIN_FILE_SIZE + 4) {
    const rawSamples = u16BE(buf, 8) >> 4;
    if (rawSamples > 0) sampleCount = Math.min(rawSamples, MAX_SAMPLES);
    const rawLength = u16BE(buf, 10) >> 1;
    if (rawLength > 0) songLength = rawLength;
  }
  const instrumentCount = Math.max(sampleCount, 1);
  const instruments = Array.from(
    { length: instrumentCount },
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
      originalInstrumentCount: sampleCount
    }
  };
  const nameParts = [`${moduleName} [Alcatraz Packer]`];
  if (sampleCount > 0) nameParts.push(`(${sampleCount} smp)`);
  return {
    name: nameParts.join(" "),
    format: "MOD",
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength,
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
  isAlcatrazPackerFormat,
  parseAlcatrazPackerFile
};
