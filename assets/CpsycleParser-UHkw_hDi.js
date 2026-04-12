const PSY3_MAGIC = "PSY3SONG";
const PSY2_MAGIC = "PSY2SONG";
function isPsycleFormat(data) {
  if (data.byteLength < 8) return false;
  const header = new Uint8Array(data, 0, 8);
  let magic = "";
  for (let i = 0; i < 8; i++) {
    magic += String.fromCharCode(header[i]);
  }
  return magic === PSY3_MAGIC || magic === PSY2_MAGIC;
}
async function parsePsycleFile(buffer, filename) {
  if (!isPsycleFormat(buffer)) {
    throw new Error("Invalid Psycle file: missing PSY2SONG or PSY3SONG magic");
  }
  const numChannels = 64;
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
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: numChannels,
      originalPatternCount: 1,
      originalInstrumentCount: 0
    }
  };
  const instruments = [{
    id: 1,
    name: "Machine 1",
    type: "synth",
    synthType: "Synth",
    effects: [],
    volume: 0,
    pan: 0
  }];
  return {
    name: `${baseName} [Psycle]`,
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
    psycleFileData: buffer.slice(0)
  };
}
export {
  isPsycleFormat,
  parsePsycleFile
};
