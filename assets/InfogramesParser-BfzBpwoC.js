function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function isInfogramesFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < 4) return false;
  const headerOff = u16BE(buf, 0);
  if (headerOff === 0) return false;
  if (headerOff & 1) return false;
  if (buf.length <= headerOff) return false;
  if (headerOff + 3 >= buf.length) return false;
  const rel = u16BE(buf, headerOff + 2);
  const nullPos = headerOff + rel;
  if (nullPos + 1 >= buf.length) return false;
  if (buf[nullPos] !== 0) return false;
  if (buf[nullPos + 1] !== 15) return false;
  return true;
}
function parseInfogramesFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (!isInfogramesFormat(buf)) {
    throw new Error("Not an Infogrames module");
  }
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/\.dum$/i, "") || baseName;
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
    name: `${moduleName} [Infogrames]`,
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
  isInfogramesFormat,
  parseInfogramesFile
};
