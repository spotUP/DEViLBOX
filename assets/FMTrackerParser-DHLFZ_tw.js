const NUM_CHANNELS = 4;
const MIN_FILE_SIZE = 30;
function isFMTrackerFormat(bytes) {
  if (bytes.length < MIN_FILE_SIZE) return false;
  return bytes[0] === 96 && bytes[1] === 26 && bytes[28] === 16 && bytes[29] === 16;
}
function parseFMTrackerFile(bytes, filename) {
  if (!isFMTrackerFormat(bytes)) return null;
  const songName = filename.replace(/\.[^/.]+$/, "");
  const instruments = Array.from({ length: 16 }, (_, i) => ({
    id: i + 1,
    name: `Sample ${i + 1}`,
    type: "synth",
    synthType: "Synth",
    effects: [],
    volume: 0,
    pan: 0
  }));
  const emptyRows = Array.from({ length: 64 }, () => ({
    note: 0,
    instrument: 0,
    volume: 0,
    effTyp: 0,
    eff: 0,
    effTyp2: 0,
    eff2: 0
  }));
  const CHAN_PAN = [-50, 50, 50, -50];
  const pattern = {
    id: "pattern-0",
    name: "Pattern 0",
    length: 64,
    channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: CHAN_PAN[ch],
      instrumentId: null,
      color: null,
      rows: emptyRows
    })),
    importMetadata: {
      sourceFormat: "TF",
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: NUM_CHANNELS,
      originalPatternCount: 1,
      originalInstrumentCount: instruments.length
    }
  };
  return {
    name: `${songName} [Tim Follin]`,
    format: "MOD",
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    uadeEditableFileName: filename
  };
}
export {
  isFMTrackerFormat,
  parseFMTrackerFile
};
