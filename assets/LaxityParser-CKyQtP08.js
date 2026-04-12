const MOD_TAGS = ["M.K.", "M!K!", "FLT4", "FLT8", "4CHN", "6CHN", "8CHN"];
function readTag(buf, offset) {
  if (buf.length < offset + 4) return "";
  return String.fromCharCode(buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3]);
}
function isLaxityFormat(buffer, filename) {
  if (!filename) return false;
  const base = (filename.split("/").pop() ?? filename).split("\\").pop().toLowerCase();
  if (base.startsWith("powt.")) return true;
  if (base.startsWith("pt.")) {
    const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const tag = readTag(buf, 1080);
    if (MOD_TAGS.includes(tag)) return false;
    return true;
  }
  return false;
}
function parseLaxityFile(buffer, filename) {
  if (!isLaxityFormat(buffer, filename)) throw new Error("Not a Laxity module");
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^(powt|pt)\./i, "") || baseName;
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
    name: `${moduleName} [Laxity]`,
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
  isLaxityFormat,
  parseLaxityFile
};
