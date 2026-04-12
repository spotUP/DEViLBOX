const MIN_FILE_SIZE = 100;
const LONG_COUNT = 24;
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
const MAGIC_A = 2857762560 >>> 0;
const MAGIC_B = 1437204735 >>> 0;
function isOnEscapeeFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  if (buf.length >= LONG_COUNT * 4) {
    let match = true;
    for (let i = 0; i < LONG_COUNT; i++) {
      if (u32BE(buf, i * 4) !== MAGIC_A) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  const startB = 4;
  if (buf.length >= startB + LONG_COUNT * 4) {
    let match = true;
    for (let i = 0; i < LONG_COUNT; i++) {
      if (u32BE(buf, startB + i * 4) !== MAGIC_B) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}
function parseOnEscapeeFile(buffer, filename) {
  var _a;
  const buf = new Uint8Array(buffer);
  const _base = ((_a = filename.split("/").pop()) == null ? void 0 : _a.toLowerCase()) ?? "";
  if (!_base.startsWith("one.") && !isOnEscapeeFormat(buf)) throw new Error("Not an onEscapee module");
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^one\./i, "") || baseName;
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
    name: `${moduleName} [onEscapee]`,
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
  isOnEscapeeFormat,
  parseOnEscapeeFile
};
