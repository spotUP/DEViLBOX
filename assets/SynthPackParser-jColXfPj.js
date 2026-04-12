const MAGIC = "OBISYNTHPACK";
const MIN_FILE_SIZE = MAGIC.length;
function isSynthPackFormat(buffer, filename) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  let match = true;
  for (let i = 0; i < MAGIC.length; i++) {
    if (buf[i] !== MAGIC.charCodeAt(i)) {
      match = false;
      break;
    }
  }
  if (match) return true;
  if (!filename) return false;
  const base = (filename.split("/").pop() ?? filename).split("\\").pop().toLowerCase();
  return base.startsWith("osp.");
}
function parseSynthPackFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (!isSynthPackFormat(buf, filename)) throw new Error("Not a SynthPack module");
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^osp\./i, "") || baseName;
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
    name: `${moduleName} [SynthPack]`,
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
  isSynthPackFormat,
  parseSynthPackFile
};
