const EASO_MAGIC = "EASO";
const NUM_CHANNELS = 4;
const MIN_HDR_SIZE = 28;
function readFourCC(bytes, off) {
  return String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);
}
function isEasyTraxFormat(bytes) {
  if (bytes.length < MIN_HDR_SIZE) return false;
  return readFourCC(bytes, 0) === EASO_MAGIC;
}
function parseEasyTraxFile(bytes, filename) {
  if (!isEasyTraxFormat(bytes)) return null;
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
      sourceFormat: "EA",
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: NUM_CHANNELS,
      originalPatternCount: 1,
      originalInstrumentCount: instruments.length
    }
  };
  return {
    name: `${songName} [EarAche]`,
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
  isEasyTraxFormat,
  parseEasyTraxFile
};
