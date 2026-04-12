function isIxsFormat(data) {
  if (data.byteLength < 32) return false;
  const view = new DataView(data);
  return view.getUint8(0) === 73 && view.getUint8(1) === 88 && view.getUint8(2) === 83 && view.getUint8(3) === 33;
}
async function parseIxsFile(fileName, data) {
  if (data.byteLength <= 100) {
    throw new Error(
      `Invalid IXS file: too small (${data.byteLength} bytes, minimum 100)`
    );
  }
  const numChannels = 64;
  const numRows = 64;
  const baseName = fileName.replace(/\.[^.]+$/, "");
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
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: ch % 2 === 0 ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: emptyRows
    })),
    importMetadata: {
      sourceFormat: "IXS",
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
    name: `${baseName} [Ixalance]`,
    format: "IXS",
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    ixsFileData: data.slice(0)
  };
}
export {
  isIxsFormat,
  parseIxsFile
};
