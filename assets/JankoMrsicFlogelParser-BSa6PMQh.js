const MIN_FILE_SIZE = 64;
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function isJankoMrsicFlogelFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  if (u32BE(buf, 0) !== 1011) return false;
  if (buf[20] === 0) return false;
  if (u32BE(buf, 32) !== 1895779957) return false;
  if (u32BE(buf, 36) !== 1244546636) return false;
  if (u32BE(buf, 40) !== 1330070860) return false;
  if (u32BE(buf, 48) === 0) return false;
  if (u32BE(buf, 52) === 0) return false;
  if (u32BE(buf, 56) === 0) return false;
  return true;
}
function parseJankoMrsicFlogelFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (!isJankoMrsicFlogelFormat(buf)) throw new Error("Not a Janko Mrsic-Flogel module");
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^jmf\./i, "") || baseName;
  const instruments = [{
    id: 1,
    name: "Sample 1",
    type: "synth",
    synthType: "Synth",
    effects: [],
    volume: 0,
    pan: 0
  }];
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
    name: `${moduleName} [Janko Mrsic-Flogel]`,
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
  isJankoMrsicFlogelFormat,
  parseJankoMrsicFlogelFile
};
