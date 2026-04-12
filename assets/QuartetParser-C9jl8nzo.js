function u8(buf, off) {
  return buf[off] ?? 0;
}
function u16BE(buf, off) {
  return ((buf[off] ?? 0) << 8 | (buf[off + 1] ?? 0)) >>> 0;
}
function u32BE(buf, off) {
  return ((buf[off] ?? 0) << 24 | (buf[off + 1] ?? 0) << 16 | (buf[off + 2] ?? 0) << 8 | (buf[off + 3] ?? 0)) >>> 0;
}
function detectPrefix(basename) {
  const lower = basename.toLowerCase();
  if (lower.startsWith("qpa.")) return "qpa";
  if (lower.startsWith("sqt.")) return "sqt";
  if (lower.startsWith("qts.")) return "qts";
  return null;
}
function stripPrefix(basename) {
  return basename.replace(/^(qpa|sqt|qts)\./i, "") || basename;
}
function isQPAFormat(buf) {
  if (buf.length < 8) return false;
  if (u8(buf, 1) !== 80) return false;
  const tempo = u8(buf, 0);
  if (tempo === 0 || tempo > 30) return false;
  if (3e3 % tempo !== 0) return false;
  const endEven = buf.length & -2;
  const scanStart = endEven;
  const scanWords = 16;
  let found = false;
  for (let i = 0; i < scanWords; i++) {
    const wordOff = scanStart - 2 - i * 2;
    if (wordOff < 0) break;
    const w = u16BE(buf, wordOff);
    if (w === 0) continue;
    if (w === 65535) {
      if (wordOff - 2 < 0 || wordOff - 6 < 0) break;
      const l1 = u32BE(buf, wordOff - 2);
      const l2 = u32BE(buf, wordOff - 6);
      if (l1 === 4294967295 && l2 === 4294967295) {
        found = true;
      }
      break;
    }
    break;
  }
  return found;
}
function isSQTFormat(buf) {
  if (buf.length < 24) return false;
  let off = 0;
  for (let i = 0; i < 4; i++) {
    if (u16BE(buf, off) !== 24576) return false;
    const disp = u16BE(buf, off + 2);
    if (disp === 0) return false;
    if (disp & 32768) return false;
    if (disp & 1) return false;
    off += 4;
  }
  if (u16BE(buf, 16) !== 18938) return false;
  const disp10 = u16BE(buf, 10);
  const dest = 10 + disp10;
  if (dest + 10 > buf.length) return false;
  if (u32BE(buf, dest) !== 1223163902) return false;
  if (u16BE(buf, dest + 4) !== 19962) return false;
  if (u16BE(buf, dest + 8) !== 20974) return false;
  if (dest + 12 + 2 > buf.length) return false;
  if (u16BE(buf, dest + 12) !== 24832) return false;
  return true;
}
function isQTSFormat(buf) {
  if (buf.length < 28) return false;
  const speed = u16BE(buf, 0);
  if (speed === 0 || speed > 16) return false;
  if (u8(buf, 7) !== 4) return false;
  if (u8(buf, 6) > 4) return false;
  if (u32BE(buf, 8) !== 0) return false;
  const wt = u16BE(buf, 12);
  if (wt !== 22356) {
    if (u32BE(buf, 12) !== 0) return false;
  }
  const d24 = u32BE(buf, 24);
  if (d24 > 76) return false;
  if ((d24 & 3) !== 0) return false;
  if (u16BE(buf, 16) !== 86) return false;
  return true;
}
function resolveVariant(buf, filename) {
  if (filename) {
    const basename = filename.split("/").pop() ?? filename;
    const prefix = detectPrefix(basename);
    if (prefix) return prefix;
  }
  if (isQPAFormat(buf)) return "qpa";
  if (isSQTFormat(buf)) return "sqt";
  if (isQTSFormat(buf)) return "qts";
  return null;
}
function buildEmptyPattern(filename, numInstruments) {
  const emptyRows = Array.from({ length: 64 }, () => ({
    note: 0,
    instrument: 0,
    volume: 0,
    effTyp: 0,
    eff: 0,
    effTyp2: 0,
    eff2: 0
  }));
  return {
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
      originalInstrumentCount: numInstruments
    }
  };
}
const VARIANT_LABEL = {
  qpa: "Quartet",
  sqt: "Quartet PSG",
  qts: "Quartet ST"
};
async function parseQuartetFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  const basename = filename.split("/").pop() ?? filename;
  const variant = resolveVariant(buf, filename);
  if (variant === null) {
    throw new Error("Not a Quartet module");
  }
  const moduleName = stripPrefix(basename);
  const label = VARIANT_LABEL[variant];
  let tempoValue = 6;
  if (variant === "qpa" && buf.length >= 1) {
    const qpaTempo = u8(buf, 0);
    if (qpaTempo >= 1 && qpaTempo <= 30) {
      tempoValue = qpaTempo;
    }
  } else if (variant === "qts" && buf.length >= 2) {
    const qtsSpeed = u16BE(buf, 0);
    if (qtsSpeed >= 1 && qtsSpeed <= 16) {
      tempoValue = qtsSpeed;
    }
  }
  const numInstruments = variant === "qpa" ? 16 : variant === "qts" ? 20 : 0;
  const instruments = [];
  for (let i = 0; i < numInstruments; i++) {
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
  if (instruments.length === 0) {
    instruments.push({
      id: 1,
      name: "Channel 1",
      type: "synth",
      synthType: "Synth",
      effects: [],
      volume: 0,
      pan: 0
    });
  }
  const pattern = buildEmptyPattern(filename, numInstruments);
  return {
    name: `${moduleName} [${label}]`,
    format: "MOD",
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: tempoValue,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename
  };
}
export {
  parseQuartetFile
};
