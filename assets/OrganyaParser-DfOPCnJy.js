function isOrganyaFormat(buffer) {
  if (buffer.byteLength < 4) return false;
  const view = new Uint8Array(buffer, 0, 4);
  return view[0] === 79 && view[1] === 114 && view[2] === 103 && view[3] === 45;
}
async function parseOrganyaFile(buffer, filename) {
  if (buffer.byteLength < 4) {
    throw new Error(
      `Invalid Organya file: too small (${buffer.byteLength} bytes, minimum 4)`
    );
  }
  if (!isOrganyaFormat(buffer)) {
    throw new Error('Invalid Organya file: missing "Org-" magic bytes');
  }
  const numChannels = 16;
  const numRows = 64;
  const baseName = filename.replace(/\.[^.]+$/, "");
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
      name: ch < 8 ? `Melody ${ch + 1}` : `Drum ${ch - 7}`,
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
      sourceFile: filename,
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
    name: `${baseName} [Organya]`,
    format: "Organya",
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    organyaFileData: buffer.slice(0)
  };
}
export {
  isOrganyaFormat,
  parseOrganyaFile
};
