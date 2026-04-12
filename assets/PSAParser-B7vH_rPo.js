const MIN_FILE_SIZE = 52;
const MAX_INSTRUMENTS = 64;
const MAX_SUBSONGS = 128;
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function isPSAFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < 4) return false;
  return buf[0] === 80 && buf[1] === 83 && buf[2] === 65 && buf[3] === 0;
}
function parsePSAFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (!isPSAFormat(buf)) {
    throw new Error("Not a PSA module");
  }
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^psa\./i, "").replace(/\.psa$/i, "") || baseName;
  let subsongCount = 1;
  let instrumentCount = 0;
  if (buf.length >= MIN_FILE_SIZE) {
    const dataOffset = u32BE(buf, 40);
    if (dataOffset >= 56 && dataOffset < buf.length) {
      const rawSubs = dataOffset - 56 >> 3;
      if (rawSubs > 0) subsongCount = Math.min(rawSubs, MAX_SUBSONGS);
    }
    const instTableStart = u32BE(buf, 40);
    const instTableEnd = u32BE(buf, 44);
    if (instTableEnd > instTableStart && instTableEnd < buf.length) {
      const rawInst = instTableEnd - instTableStart >> 6;
      if (rawInst > 0) instrumentCount = Math.min(rawInst, MAX_INSTRUMENTS);
    }
  }
  const instruments = Array.from(
    { length: instrumentCount || 1 },
    (_, i) => ({
      id: i + 1,
      name: `Sample ${i + 1}`,
      type: "synth",
      synthType: "Synth",
      effects: [],
      volume: 0,
      pan: 0
    })
  );
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
      originalInstrumentCount: instrumentCount
    }
  };
  const nameParts = [`${moduleName} [PSA]`];
  if (subsongCount > 1) nameParts.push(`(${subsongCount} subsongs)`);
  if (instrumentCount > 0) nameParts.push(`(${instrumentCount} smp)`);
  return {
    name: nameParts.join(" "),
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
  isPSAFormat,
  parsePSAFile
};
