import { c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const FORMAT3_MIN_SIZE = 3262;
const MAX_SAMPLES = 32;
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function isFormat3(buf) {
  if (buf.length < FORMAT3_MIN_SIZE) return false;
  if (u16BE(buf, 0) !== 0) return false;
  if (u32BE(buf, 128) !== 0) return false;
  if (u32BE(buf, 132) !== 3262) return false;
  if (u32BE(buf, 3254) !== 198846) return false;
  if (u32BE(buf, 3258) !== 199102) return false;
  return true;
}
function detectFormat12(buf) {
  if (buf.length < 50) return null;
  if (u16BE(buf, 0) !== 2) return null;
  if ((buf[3] & 1) !== 0) return null;
  const d1Initial = u16BE(buf, 4);
  if (d1Initial === 0) return null;
  if ((d1Initial & 1) !== 0) return null;
  if (d1Initial + 1 >= buf.length) return null;
  if (u16BE(buf, d1Initial) !== 0) return null;
  if (48 + 1 >= buf.length) return null;
  const d0Baseline = u16BE(buf, 48);
  for (let i = 0; i < 23; i++) {
    const off = 2 + i * 2;
    if (off + 1 >= buf.length) return null;
    const word = u16BE(buf, off);
    if (word === 0) return null;
    if ((buf[off + 1] & 1) !== 0) return null;
    if (d0Baseline <= word) return null;
  }
  if (46 + 1 >= buf.length) return null;
  const disp = u16BE(buf, 46);
  const dest = disp;
  if (dest + 1 >= buf.length) return null;
  const destWord = u16BE(buf, dest);
  if ((destWord & 3840) === 3840) {
    return 1;
  }
  return 2;
}
function isFormat4SteveTurner(buf) {
  if (buf.length < 46) return false;
  if (u16BE(buf, 0) !== 11132) return false;
  if (u16BE(buf, 8) !== 11132) return false;
  if (u16BE(buf, 16) !== 11132) return false;
  if (u16BE(buf, 24) !== 11132) return false;
  if (u32BE(buf, 32) !== 809238783) return false;
  if (u32BE(buf, 36) !== 838880953) return false;
  if (u16BE(buf, 44) !== 20085) return false;
  return true;
}
function detectVariant(buf) {
  if (isFormat3(buf)) return 3;
  if (isFormat4SteveTurner(buf)) return 4;
  const f12 = detectFormat12(buf);
  if (f12 !== null) return f12;
  return null;
}
function basename(path) {
  return path.split(/[/\\]/).pop() ?? path;
}
function hasJasonPagePrefix(name) {
  const lower = name.toLowerCase();
  return lower.startsWith("jpn.") || lower.startsWith("jpnd.") || lower.startsWith("jp.") || lower.startsWith("jpo.") || lower.startsWith("jpold.") || lower.endsWith(".jpo") || lower.endsWith(".jpold");
}
function stripPrefix(name) {
  return name.replace(/^jpnd\./i, "").replace(/^jpn\./i, "").replace(/^jp\./i, "") || name;
}
function isJasonPageFormat(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (filename !== void 0) {
    if (!hasJasonPagePrefix(basename(filename))) return false;
  }
  return detectVariant(buf) !== null;
}
async function parseJasonPageFile(buffer, filename, companionFiles) {
  const buf = new Uint8Array(buffer);
  const variant = detectVariant(buf);
  if (variant === null) {
    throw new Error("Not a Jason Page module");
  }
  const base = basename(filename);
  const moduleName = stripPrefix(base) || base;
  const variantLabel = variant === 1 ? "Old (Format 1)" : variant === 2 ? "New (Format 2)" : variant === 3 ? "Raw (Format 3)" : "Steve Turner (JPO)";
  let smpBuf = null;
  if (companionFiles) {
    const songBase = base.replace(/^jpn\./i, "").replace(/^jpnd\./i, "").replace(/^jp\./i, "").replace(/^jpo\./i, "").replace(/^jpold\./i, "").replace(/\.(jpo|jpold)$/i, "");
    const candidates = [
      `SMP.${songBase}`,
      `smp.${songBase}`,
      `${songBase}.ins`,
      `${songBase}.INS`
    ];
    for (const cand of candidates) {
      for (const [key, val] of companionFiles) {
        const keyBase = key.split("/").pop() ?? key;
        if (keyBase.toLowerCase() === cand.toLowerCase()) {
          smpBuf = new Uint8Array(val);
          break;
        }
      }
      if (smpBuf) break;
    }
  }
  const instruments = [];
  if ((variant === 1 || variant === 2) && buf.length >= 50) {
    const smpTableOff = u16BE(buf, 2);
    const songSize = u16BE(buf, 48);
    const smpTableEnd = songSize;
    const numSmpEntries = Math.min(smpTableEnd - smpTableOff >>> 2, MAX_SAMPLES);
    let smpFileOff = 0;
    for (let i = 0; i < numSmpEntries; i++) {
      const entryOff = smpTableOff + i * 4;
      if (entryOff + 4 > buf.length) break;
      const smpLen = u32BE(buf, entryOff);
      if (smpLen === 0) break;
      const alignedLen = smpLen + (smpLen & 1);
      if (smpBuf && smpFileOff + alignedLen <= smpBuf.length && alignedLen > 2) {
        const pcm = smpBuf.slice(smpFileOff, smpFileOff + alignedLen);
        instruments.push(
          createSamplerInstrument(
            i + 1,
            `Sample ${i + 1}`,
            pcm,
            64,
            8287,
            0,
            // no loop info in the sample table (player handles loops internally)
            0
          )
        );
      } else {
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
      smpFileOff += alignedLen;
    }
  }
  if (instruments.length === 0) {
    for (let i = 0; i < MAX_SAMPLES; i++) {
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
      originalInstrumentCount: MAX_SAMPLES
    }
  };
  return {
    name: `${moduleName} [Jason Page ${variantLabel}]`,
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
  isJasonPageFormat,
  parseJasonPageFile
};
