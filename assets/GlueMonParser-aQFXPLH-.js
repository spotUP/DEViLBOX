const MIN_FILE_SIZE = 16;
const NUM_CHANNELS = 4;
const CHANNEL_PANS = [-50, 50, 50, -50];
function readAsciiTrimmed(buf, off, len) {
  let end = off + len;
  while (end > off && (buf[end - 1] === 0 || buf[end - 1] === 32)) end--;
  return Array.from(buf.subarray(off, end)).map((b) => b >= 32 && b < 127 ? String.fromCharCode(b) : "?").join("");
}
function isGlueMonFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  return buf[0] === 71 && // G
  buf[1] === 76 && // L
  buf[2] === 85 && // U
  buf[3] === 69;
}
function parseGlueMonFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (!isGlueMonFormat(buf)) {
    throw new Error("Not a GlueMon module");
  }
  const rawName = readAsciiTrimmed(buf, 8, 8);
  const baseName = filename.split("/").pop() ?? filename;
  const fileBaseName = baseName.replace(/^glue\./i, "").replace(/^gm\./i, "") || baseName;
  const moduleName = rawName || fileBaseName;
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
    channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: CHANNEL_PANS[ch],
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
      originalInstrumentCount: 0
    }
  };
  const instruments = [
    {
      id: 1,
      name: "Sample 1",
      type: "synth",
      synthType: "Synth",
      effects: [],
      volume: 0,
      pan: 0
    }
  ];
  return {
    name: `${moduleName} [GlueMon]`,
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
  isGlueMonFormat,
  parseGlueMonFile
};
