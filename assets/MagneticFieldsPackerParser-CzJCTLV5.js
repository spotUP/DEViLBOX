const MIN_FILE_SIZE = 400;
const DEFAULT_INSTRUMENTS = 8;
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function isMagneticFieldsPackerFormat(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (filename !== void 0) {
    const base = (filename.split("/").pop() ?? filename).toLowerCase();
    if (!base.startsWith("mfp.")) return false;
  }
  if (buf.length <= MIN_FILE_SIZE) return false;
  const d1 = buf[248];
  if (d1 === 0) return false;
  if (buf[249] !== 127) return false;
  if (buf.length < 382) return false;
  const d2 = u16BE(buf, 378);
  if (d2 !== u16BE(buf, 380)) return false;
  if (d2 > 127) return false;
  if ((d2 & 255) !== d1) return false;
  return true;
}
async function parseMagneticFieldsPackerFile(buffer, filename) {
  if (!isMagneticFieldsPackerFormat(buffer, filename)) {
    throw new Error("Not a Magnetic Fields Packer module");
  }
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^mfp\./i, "") || baseName;
  const instruments = [];
  for (let i = 0; i < DEFAULT_INSTRUMENTS; i++) {
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
      originalInstrumentCount: DEFAULT_INSTRUMENTS
    }
  };
  return {
    name: `${moduleName} [Magnetic Fields Packer]`,
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
  isMagneticFieldsPackerFormat,
  parseMagneticFieldsPackerFile
};
