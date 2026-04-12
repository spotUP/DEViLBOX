function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
const MIN_FILE_SIZE = 14;
function isSteveBarrettFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  let pos = 0;
  let lastD2 = 0;
  for (let i = 0; i < 4; i++) {
    if (pos + 4 > buf.length) return false;
    if (u16BE(buf, pos) !== 24576) return false;
    const d2 = u16BE(buf, pos + 2);
    if (d2 === 0) return false;
    if (d2 & 32768) return false;
    if (d2 & 1) return false;
    lastD2 = d2;
    pos += 4;
  }
  const targetPos = pos + lastD2;
  if (targetPos + 6 > buf.length) return false;
  if (u16BE(buf, targetPos) !== 10876) return false;
  if (u32BE(buf, targetPos + 2) !== 14676136) return false;
  return true;
}
function parseSteveBarrettFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (!isSteveBarrettFormat(buf)) throw new Error("Not a Steve Barrett module");
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^sb\./i, "").replace(/\.sb$/i, "") || baseName;
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
    name: `${moduleName} [Steve Barrett]`,
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
  isSteveBarrettFormat,
  parseSteveBarrettFile
};
