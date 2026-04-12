const MIN_FILE_SIZE = 5 + 138 + 18 + 4;
const MAX_INSTRUMENTS = 127;
function isCinemawareFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  if (buf[0] !== 73 || buf[1] !== 66 || buf[2] !== 76 || buf[3] !== 75) {
    return false;
  }
  const sampleCount = buf[4];
  if (sampleCount === 0 || sampleCount >= 128) return false;
  const searchStart = 4 + sampleCount * 138 + 18;
  const searchEnd = searchStart + 256;
  if (searchEnd > buf.length) return false;
  for (let off = searchStart; off < searchEnd; off += 2) {
    if (buf[off] === 65 && buf[off + 1] === 83 && buf[off + 2] === 69 && buf[off + 3] === 81) {
      return true;
    }
  }
  return false;
}
function parseCinemawareFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (!isCinemawareFormat(buf)) {
    throw new Error("Not a Cinemaware module");
  }
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^cin\./i, "").replace(/\.cin$/i, "") || baseName;
  const sampleCount = Math.min(buf[4], MAX_INSTRUMENTS);
  const songName = sampleCount > 0 ? `${moduleName} [Cinemaware](${sampleCount} smp)` : moduleName;
  const instrumentLength = Math.max(sampleCount, 1);
  const instruments = Array.from(
    { length: instrumentLength },
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
  return {
    name: songName,
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
  isCinemawareFormat,
  parseCinemawareFile
};
