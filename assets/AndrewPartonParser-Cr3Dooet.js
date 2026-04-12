import { c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const MIN_FILE_SIZE = 244;
const NUM_SAMPLES = 20;
const SAMPLE_DATA_OFFSET = 484;
const SAMPLE_NAME_LEN = 16;
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function isAndrewPartonFormat(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (filename !== void 0) {
    const base = (filename.split("/").pop() ?? filename).toLowerCase();
    if (!base.startsWith("bye.")) return false;
  }
  if (buf.length < MIN_FILE_SIZE) return false;
  if (u32BE(buf, 0) !== 1111576139) return false;
  const MAX_CHIP_RAM = 2097152;
  let off = 4;
  for (let i = 0; i < 20; i++, off += 4) {
    if (u32BE(buf, off) >= MAX_CHIP_RAM) return false;
  }
  const MAX_SAMPLE_LEN = 65536;
  for (let i = 0; i < 40; i++, off += 4) {
    if (u32BE(buf, off) >= MAX_SAMPLE_LEN) return false;
  }
  return true;
}
async function parseAndrewPartonFile(buffer, filename) {
  if (!isAndrewPartonFormat(buffer, filename)) {
    throw new Error("Not an Andrew Parton module");
  }
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^bye\./i, "") || baseName;
  const buf = new Uint8Array(buffer);
  const instruments = [];
  let dataPos = SAMPLE_DATA_OFFSET;
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const ptr = u32BE(buf, 4 + i * 4);
    const len = u32BE(buf, 84 + i * 4);
    if (ptr === 0 || len === 0) {
      instruments.push({
        id: i + 1,
        name: `Sample ${i + 1}`,
        type: "synth",
        synthType: "Synth",
        effects: [],
        volume: 0,
        pan: 0
      });
      continue;
    }
    const nameOff = dataPos;
    const nameEnd = Math.min(nameOff + SAMPLE_NAME_LEN, buf.length);
    let name = "";
    for (let j = nameOff; j < nameEnd; j++) {
      const c = buf[j];
      if (c === 0) break;
      if (c >= 32 && c < 127) name += String.fromCharCode(c);
    }
    dataPos += SAMPLE_NAME_LEN;
    const pcmOff = dataPos;
    const safeLen = Math.min(len, buf.length - pcmOff);
    if (safeLen > 0 && pcmOff < buf.length) {
      const pcm = buf.slice(pcmOff, pcmOff + safeLen);
      instruments.push(createSamplerInstrument(
        i + 1,
        name || `Sample ${i + 1}`,
        pcm,
        64,
        // volume (EPS_Volume = 64)
        8287,
        // Amiga PAL ~8287 Hz base sample rate
        0,
        // no loop info in this format
        0
      ));
    } else {
      instruments.push({
        id: i + 1,
        name: name || `Sample ${i + 1}`,
        type: "synth",
        synthType: "Synth",
        effects: [],
        volume: 0,
        pan: 0
      });
    }
    dataPos += len;
  }
  if (instruments.length === 0) {
    for (let i = 0; i < 8; i++) {
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
      originalInstrumentCount: instruments.length
    }
  };
  return {
    name: `${moduleName} [Andrew Parton]`,
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
  isAndrewPartonFormat,
  parseAndrewPartonFile
};
