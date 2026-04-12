function isEupFormat(data) {
  if (data.byteLength < 100) return false;
  const view = new Uint8Array(data);
  let validMappings = 0;
  for (let i = 32; i < 48 && i < view.length; i++) {
    if (view[i] <= 15) validMappings++;
  }
  return validMappings >= 12;
}
async function parseEupFile(fileName, data) {
  if (data.byteLength < 100) {
    throw new Error(
      `Invalid EUP file: too small (${data.byteLength} bytes, minimum 100)`
    );
  }
  const numChannels = 11;
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
      pan: 0,
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
    name: "FM Towns",
    type: "synth",
    synthType: "Synth",
    effects: [],
    volume: 0,
    pan: 0
  }];
  return {
    name: `${baseName} [EUP]`,
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
    eupFileData: data.slice(0)
  };
}
export {
  isEupFormat,
  parseEupFile
};
