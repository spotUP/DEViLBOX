function isZxtuneFormat(data) {
  if (data.byteLength < 2) return false;
  const bytes = new Uint8Array(data, 0, Math.min(data.byteLength, 16));
  if (data.byteLength >= 8) {
    const sig = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7]);
    if (sig === "ZXAYEMUL") return true;
  }
  if (bytes[0] === 97 && bytes[1] === 121) return true;
  if (bytes[0] === 121 && bytes[1] === 109) return true;
  if (bytes[0] === 26) return true;
  if (data.byteLength >= 14) {
    const header = String.fromCharCode(...bytes.slice(0, 14));
    if (header.startsWith("ProTracker 3")) return true;
    if (header.startsWith("Vortex Tracker")) return true;
  }
  if (data.byteLength >= 27) {
    const tempo = bytes[0];
    const posCount = bytes[1];
    if (tempo >= 1 && tempo <= 31 && posCount >= 1 && posCount <= 128) {
      return true;
    }
  }
  return true;
}
async function parseZxtuneFile(fileName, data) {
  if (data.byteLength < 2) {
    throw new Error(
      `Invalid ZXTune file: too small (${data.byteLength} bytes, minimum 2)`
    );
  }
  const numChannels = 3;
  const numRows = 64;
  const baseName = fileName.replace(/\.[^.]+$/, "");
  const channelNames = ["A", "B", "C"];
  const emptyRows = Array.from({ length: numRows }, () => ({
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
    length: numRows,
    channels: Array.from({ length: numChannels }, (_, ch) => ({
      id: `channel-${ch}`,
      name: channelNames[ch],
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: ch === 0 ? -50 : ch === 2 ? 50 : 0,
      instrumentId: null,
      color: null,
      rows: emptyRows
    })),
    importMetadata: {
      sourceFormat: "MOD",
      sourceFile: fileName,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: numChannels,
      originalPatternCount: 1,
      originalInstrumentCount: 0
    }
  };
  const instruments = [{
    id: 1,
    name: "Sample 1",
    type: "synth",
    synthType: "Synth",
    effects: [],
    volume: 0,
    pan: 0
  }];
  return {
    name: `${baseName} [ZXTune]`,
    format: "MOD",
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    zxtuneFileData: data.slice(0)
  };
}
export {
  isZxtuneFormat,
  parseZxtuneFile
};
