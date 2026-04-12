import { c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function readString(buf, off, maxLen) {
  let s = "";
  for (let i = 0; i < maxLen && off + i < buf.length; i++) {
    if (buf[off + i] === 0) break;
    s += String.fromCharCode(buf[off + i]);
  }
  return s;
}
const MIN_FILE_SIZE = 6849;
const EXPECTED_DIFFS = [
  [0, 64],
  [4, 1088],
  [8, 2112],
  [12, 3136],
  [16, 4160],
  [20, 4416],
  [24, 4672],
  [28, 4928]
];
function isThomasHermannFormat(buf) {
  if (buf.length < MIN_FILE_SIZE) return false;
  if (buf.length < 50) return false;
  const origin = u32BE(buf, 46);
  if (origin === 0) return false;
  if ((origin & 2147483648) !== 0) return false;
  if ((origin & 1) !== 0) return false;
  for (const [fileOff, expectedDiff] of EXPECTED_DIFFS) {
    const pointer = u32BE(buf, fileOff);
    if (pointer - origin >>> 0 !== expectedDiff) return false;
  }
  return true;
}
async function parseThomasHermannFile(buffer, filename) {
  var _a;
  const buf = new Uint8Array(buffer);
  const _base = ((_a = filename.split("/").pop()) == null ? void 0 : _a.toLowerCase()) ?? "";
  if (!_base.startsWith("thm.") && !_base.endsWith(".riff") && !isThomasHermannFormat(buf)) {
    throw new Error("Not a Thomas Hermann module");
  }
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^thm\./i, "").replace(/^tw\./i, "").replace(/\.(thm|tw)$/i, "") || baseName;
  const sampleCount = buf[35];
  const SAMPLE_TABLE_OFF = 5358;
  const DESCRIPTOR_SIZE = 48;
  const instruments = [];
  for (let i = 0; i < sampleCount; i++) {
    const descOff = SAMPLE_TABLE_OFF + i * DESCRIPTOR_SIZE;
    if (descOff + DESCRIPTOR_SIZE > buf.length) break;
    const sampleLen = u32BE(buf, descOff);
    const name = readString(buf, descOff + 16, 22);
    let pcmStart = SAMPLE_TABLE_OFF + sampleCount * DESCRIPTOR_SIZE;
    for (let j = 0; j < i; j++) {
      const prevDescOff = SAMPLE_TABLE_OFF + j * DESCRIPTOR_SIZE;
      if (prevDescOff + 4 <= buf.length) {
        pcmStart += u32BE(buf, prevDescOff);
      }
    }
    if (sampleLen > 0 && pcmStart + sampleLen <= buf.length) {
      const pcm = buf.slice(pcmStart, pcmStart + sampleLen);
      instruments.push(createSamplerInstrument(
        i + 1,
        name || `THM Sample ${i + 1}`,
        pcm,
        64,
        8287,
        0,
        0
      ));
    } else {
      instruments.push({
        id: i + 1,
        name: name || `THM Sample ${i + 1}`,
        type: "synth",
        synthType: "Synth",
        effects: [],
        volume: 0,
        pan: 0
      });
    }
  }
  if (instruments.length === 0) {
    instruments.push({
      id: 1,
      name: "Sample 1",
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
      originalInstrumentCount: instruments.length
    }
  };
  return {
    name: `${moduleName} [Thomas Hermann]`,
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
  isThomasHermannFormat,
  parseThomasHermannFile
};
