function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
const MIN_FILE_SIZE = 548;
const PATH_AB_CHECK4 = 264507303;
const PATH_AB_CHECK8 = 260771694;
const SCAN_STEP = 2;
const SCAN_ITERATIONS = 128;
const SCAN_ADDEND = 284;
function isSeanConranFormat(buf) {
  if (buf.length < MIN_FILE_SIZE) return false;
  const first = u32BE(buf, 0);
  let scanStart;
  if (first === 268373986 || first === 268439522) {
    if (u32BE(buf, 4) !== PATH_AB_CHECK4) return false;
    if (u32BE(buf, 8) !== PATH_AB_CHECK8) return false;
    scanStart = 8 + SCAN_ADDEND;
  } else if (first === 253497102 && u32BE(buf, 4) === 251662066 && u32BE(buf, 8) === 249827030) {
    scanStart = 168 + SCAN_ADDEND;
  } else {
    return false;
  }
  const scanEnd = scanStart + SCAN_ITERATIONS * SCAN_STEP;
  if (buf.length < scanEnd) return false;
  for (let pos = scanStart; pos < scanEnd; pos += SCAN_STEP) {
    if (u32BE(buf, pos) === 2139062143) return false;
    if (u16BE(buf, pos) === 65535) return false;
  }
  return true;
}
async function parseSeanConranFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (!isSeanConranFormat(buf)) {
    throw new Error("Not a Sean Conran module");
  }
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^scr\./i, "") || baseName;
  const NUM_PLACEHOLDER_INSTRUMENTS = 8;
  const instruments = [];
  for (let i = 0; i < NUM_PLACEHOLDER_INSTRUMENTS; i++) {
    instruments.push({
      id: i + 1,
      name: `Sample ${i + 1}`,
      type: "synth",
      synthType: "Synth",
      effects: [],
      volume: 0,
      pan: 0
    });
  }
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
      originalInstrumentCount: NUM_PLACEHOLDER_INSTRUMENTS
    }
  };
  return {
    name: `${moduleName} [Sean Conran]`,
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
  isSeanConranFormat,
  parseSeanConranFile
};
