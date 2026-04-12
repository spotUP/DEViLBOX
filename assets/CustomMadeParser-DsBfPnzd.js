const MIN_FILE_SIZE = 3001;
const DELITRACKER_CUSTOM_MAGIC = 1011;
const DEFAULT_INSTRUMENTS = 8;
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function isCustomMadeFormat(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (buf.length <= MIN_FILE_SIZE - 1) return false;
  if (buf.length >= 4 && u32BE(buf, 0) === DELITRACKER_CUSTOM_MAGIC) {
    return true;
  }
  if (filename !== void 0) {
    const base = (filename.split("/").pop() ?? filename).toLowerCase();
    if (!base.startsWith("cm.") && !base.startsWith("rk.") && !base.startsWith("rkb.")) {
      return false;
    }
  }
  if (buf.length < 8) return false;
  const word0 = u16BE(buf, 0);
  let scanStart = 8;
  if (word0 === 20217 || word0 === 20153) {
    if (u16BE(buf, 6) !== 20217) return false;
  } else if (word0 === 24576) {
    if (buf.length < 6) return false;
    if (u16BE(buf, 4) !== 24576) return false;
  } else {
    return false;
  }
  const scanEnd = scanStart + 400;
  if (buf.length < scanStart + 12) return false;
  const end = Math.min(scanEnd, buf.length - 12);
  for (let off = scanStart; off <= end; off += 2) {
    if (u32BE(buf, off + 0) === 1109917744 && u32BE(buf, off + 4) === 1109917745 && u32BE(buf, off + 8) === 1109917746) {
      return true;
    }
  }
  return false;
}
async function parseCustomMadeFile(buffer, filename) {
  if (!isCustomMadeFormat(buffer, filename)) {
    throw new Error("Not a Custom Made module");
  }
  const buf = new Uint8Array(buffer);
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^(cm|rk|rkb)\./i, "") || baseName;
  const isDelitracker = buf.length >= 4 && u32BE(buf, 0) === DELITRACKER_CUSTOM_MAGIC;
  const word0 = u16BE(buf, 0);
  const isBRAVariant = word0 === 24576;
  const variantLabel = isDelitracker ? "Delitracker Custom" : "Custom Made";
  let sampleCount = DEFAULT_INSTRUMENTS;
  const instruments = [];
  try {
    if (isDelitracker) {
      for (let off = 32; off < Math.min(buf.length - 4, 512); off += 2) {
        const op = u16BE(buf, off);
        if ((op & 61951) === 12348) {
          const val = u16BE(buf, off + 2);
          if (val >= 1 && val <= 64) {
            sampleCount = val;
            break;
          }
        }
      }
    } else {
      const scanStart = 8;
      const scanEnd = Math.min(scanStart + 400, buf.length - 12);
      let sigOffset = -1;
      for (let off = scanStart; off <= scanEnd; off += 2) {
        if (u32BE(buf, off + 0) === 1109917744 && u32BE(buf, off + 4) === 1109917745 && u32BE(buf, off + 8) === 1109917746) {
          sigOffset = off + 12;
          break;
        }
      }
      if (sigOffset > 0) {
        for (let off = sigOffset; off < Math.min(sigOffset + 512, buf.length - 4); off += 2) {
          const op = u16BE(buf, off);
          if (op === 16890 && off + 4 <= buf.length) {
            const disp = u16BE(buf, off + 2);
            const signedDisp = disp < 32768 ? disp : disp - 65536;
            const target = off + 2 + signedDisp;
            if (target > 0 && target + 8 <= buf.length) {
              let count = 0;
              let soff = target;
              for (let i = 0; i < 64 && soff + 6 <= buf.length; i++) {
                const len = u32BE(buf, soff);
                if (len === 0 || len > 1048576) break;
                const period = u16BE(buf, soff + 4);
                if (period === 0) break;
                count++;
                soff += 6 + len;
              }
              if (count >= 2) {
                sampleCount = count;
                break;
              }
            }
          }
        }
      }
    }
  } catch {
  }
  for (let i = 0; i < sampleCount; i++) {
    instruments.push({
      id: i + 1,
      name: `${variantLabel} Sample ${i + 1}`,
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
      originalInstrumentCount: sampleCount,
      variant: isDelitracker ? "delitracker" : isBRAVariant ? "bra" : "jmp"
    }
  };
  return {
    name: `${moduleName} [${variantLabel}]`,
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
  isCustomMadeFormat,
  parseCustomMadeFile
};
