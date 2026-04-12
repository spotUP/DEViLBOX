const SS_MAGIC = "SPEEDY-SYSTEM\0";
const NUM_CHANNELS = 4;
const MIN_SS_SIZE = 14;
const MIN_SAS_SIZE = 16;
function checkSSMagic(buf) {
  if (buf.length < MIN_SS_SIZE) return false;
  for (let i = 0; i < SS_MAGIC.length; i++) {
    if (buf[i] !== SS_MAGIC.charCodeAt(i)) return false;
  }
  return true;
}
function checkSASSignature(buf) {
  if (buf.length < MIN_SAS_SIZE) return false;
  if (buf[0] !== 0 || buf[1] !== 0 || buf[2] !== 0) return false;
  if (buf[3] === 0 || buf[3] > 31) return false;
  if (buf[14] !== 2 || buf[15] !== 0) return false;
  return true;
}
function isSpeedySystemFormat(buffer) {
  const buf = new Uint8Array(buffer);
  return checkSSMagic(buf) || checkSASSignature(buf);
}
async function parseSpeedySystemFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  const isSAS = !checkSSMagic(buf) && checkSASSignature(buf);
  const label = isSAS ? "Speedy A1 System" : "Speedy System";
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
      sourceFormat: "MOD",
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: NUM_CHANNELS,
      originalPatternCount: 1,
      originalInstrumentCount: instruments.length
    }
  };
  return {
    name: `${songName} [${label}]`,
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
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename
  };
}
export {
  isSpeedySystemFormat,
  parseSpeedySystemFile
};
