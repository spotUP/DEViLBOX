const MIN_FILE_SIZE = 272;
const CHUNK_AREA_OFFSET = 256;
const DEFAULT_CHANNELS = 4;
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function matchesId(buf, off, id) {
  if (off + id.length > buf.length) return false;
  for (let i = 0; i < id.length; i++) {
    if (buf[off + i] !== id.charCodeAt(i)) return false;
  }
  return true;
}
function isDavidHanneyFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  return buf[0] === 68 && // D
  buf[1] === 83 && // S
  buf[2] === 78 && // N
  buf[3] === 71 && // G
  buf[4] === 83 && // S
  buf[5] === 69 && // E
  buf[6] === 81 && // Q
  buf[7] === 85;
}
function readInfoChunk(buf) {
  const searchLimit = Math.min(CHUNK_AREA_OFFSET + 32, buf.length - 8);
  for (let off = CHUNK_AREA_OFFSET; off <= searchLimit; off++) {
    if (!matchesId(buf, off, "INFO")) continue;
    const sizeOff = off + 4;
    if (sizeOff + 4 > buf.length) break;
    const size = u32BE(buf, sizeOff);
    const dataOff = sizeOff + 4;
    if (dataOff + size > buf.length || size < 6) break;
    const numChannels = u16BE(buf, dataOff + 4);
    return {
      numChannels: numChannels > 0 && numChannels <= 32 ? numChannels : DEFAULT_CHANNELS
    };
  }
  return null;
}
function parseDavidHanneyFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (!isDavidHanneyFormat(buf)) {
    throw new Error("Not a David Hanney module");
  }
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^dh\./i, "").replace(/\.dh$/i, "") || baseName;
  const info = readInfoChunk(buf);
  const numChannels = (info == null ? void 0 : info.numChannels) ?? DEFAULT_CHANNELS;
  const channelPans = Array.from({ length: numChannels }, (_, i) => {
    const pos = i % 4;
    return pos === 0 || pos === 3 ? -50 : 50;
  });
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
    channels: Array.from({ length: numChannels }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: channelPans[ch],
      instrumentId: null,
      color: null,
      rows: emptyRows
    })),
    importMetadata: {
      sourceFormat: "MOD",
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: numChannels,
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
    name: `${moduleName} [DavidHanney]`,
    format: "MOD",
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename
  };
}
export {
  isDavidHanneyFormat,
  parseDavidHanneyFile
};
