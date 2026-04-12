function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function isManiacsOfNoiseFormat(_buffer, filename) {
  if (!filename) return false;
  const base = (filename.split("/").pop() ?? filename).split("\\").pop().toLowerCase();
  if (base.startsWith("mon_old.")) return false;
  if (base.startsWith("mon.")) return true;
  if (base.endsWith(".mon")) return true;
  return false;
}
function parseManiacsOfNoiseFile(buffer, filename) {
  if (!isManiacsOfNoiseFormat(buffer, filename)) throw new Error("Not a Maniacs of Noise module");
  const buf = new Uint8Array(buffer);
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^mon\./i, "").replace(/\.mon$/i, "") || baseName;
  const NUM_CHANNELS = 4;
  let sampleCount = NUM_CHANNELS;
  try {
    const scanEnd = Math.min(buf.length - 4, 2048);
    for (let off = 0; off < scanEnd; off += 2) {
      const op = u16BE(buf, off);
      if (op === 16890 && off + 4 <= buf.length) {
        const disp = u16BE(buf, off + 2);
        const signedDisp = disp < 32768 ? disp : disp - 65536;
        const target = off + 2 + signedDisp;
        if (target > 0 && target + 8 <= buf.length) {
          let count = 0;
          let soff = target;
          for (let i = 0; i < 32 && soff + 6 <= buf.length; i++) {
            const ptr = u32BE(buf, soff);
            const len = u16BE(buf, soff + 4) * 2;
            if (len === 0 || len > 524288) break;
            if (ptr > buf.length * 4) break;
            count++;
            soff += 6;
          }
          if (count >= 2) {
            sampleCount = count;
            break;
          }
        }
      }
    }
  } catch {
  }
  const instruments = [];
  for (let i = 0; i < sampleCount; i++) {
    instruments.push({
      id: i + 1,
      name: `MoN Sample ${i + 1}`,
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
    channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
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
      originalChannelCount: NUM_CHANNELS,
      originalPatternCount: 1,
      originalInstrumentCount: sampleCount
    }
  };
  return {
    name: `${moduleName} [Maniacs of Noise]`,
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
  isManiacsOfNoiseFormat,
  parseManiacsOfNoiseFile
};
