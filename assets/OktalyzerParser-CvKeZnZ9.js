import { b$ as registerPatternEncoder, c2 as createSamplerInstrument, c7 as amigaNoteToXM } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function reverseOKTEffect(effTyp, eff) {
  if (effTyp === 0 && eff === 0) return { cmd: 0, data: 0 };
  switch (effTyp) {
    case 15:
      return { cmd: 1, data: eff };
    // set speed
    case 11:
      return { cmd: 2, data: eff };
    // position jump
    case 12:
      return { cmd: 10, data: eff };
    // set volume
    case 1:
      return { cmd: 11, data: eff };
    // portamento up
    case 2:
      return { cmd: 12, data: eff };
    // portamento down
    case 3:
      return { cmd: 13, data: eff };
    // tone portamento
    case 10:
      return { cmd: 17, data: eff };
    // volume slide
    case 14: {
      if ((eff & 240) === 192) return { cmd: 30, data: eff & 15 };
      return { cmd: 0, data: 0 };
    }
    default:
      return { cmd: 0, data: 0 };
  }
}
function encodeOktalyzerCell(cell) {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;
  if (note > 0 && note > 36) {
    out[0] = note - 36 & 255;
  } else {
    out[0] = 0;
  }
  out[1] = (cell.instrument ?? 0) & 255;
  const { cmd, data } = reverseOKTEffect(cell.effTyp ?? 0, cell.eff ?? 0);
  out[2] = cmd & 255;
  out[3] = data & 255;
  return out;
}
registerPatternEncoder("oktalyzer", () => encodeOktalyzerCell);
const TEXT_DECODER = new TextDecoder("iso-8859-1");
function readStr(buf, offset, len) {
  let end = offset;
  while (end < offset + len && buf[end] !== 0) end++;
  return TEXT_DECODER.decode(buf.subarray(offset, end));
}
function readU16BE(buf, offset) {
  return buf[offset] << 8 | buf[offset + 1];
}
function readU32BE(buf, offset) {
  return (buf[offset] << 24 | buf[offset + 1] << 16 | buf[offset + 2] << 8 | buf[offset + 3]) >>> 0;
}
function parseOktalyzerFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  const magic = TEXT_DECODER.decode(buf.subarray(0, 8));
  if (magic !== "OKTASONG") {
    throw new Error(`Not a valid Oktalyzer file (expected OKTASONG magic, got ${magic.slice(0, 8)})`);
  }
  let offset = 8;
  const fileSize = buf.byteLength;
  const samples = [];
  let speed = 6;
  let songLength = 0;
  let patternCount = 0;
  const sequence = [];
  const patterns = [];
  const patternFileOffsets = [];
  const samplePcmQueue = [];
  while (offset + 8 <= fileSize) {
    const chunkId = TEXT_DECODER.decode(buf.subarray(offset, offset + 4));
    const chunkSize = readU32BE(buf, offset + 4);
    const dataStart = offset + 8;
    offset += 8 + chunkSize;
    if (chunkSize & 1) offset++;
    switch (chunkId) {
      case "CMOD": {
        for (let i = 0; i < 4 && i * 2 + 1 < chunkSize; i++) {
          readU16BE(buf, dataStart + i * 2);
        }
        break;
      }
      case "SAMP": {
        const sampCount = Math.floor(chunkSize / 32);
        for (let i = 0; i < sampCount; i++) {
          const base = dataStart + i * 32;
          const name = readStr(buf, base, 20);
          const length = readU32BE(buf, base + 20);
          const loopStart = readU16BE(buf, base + 24) * 2;
          const loopLength = readU16BE(buf, base + 26) * 2;
          const volume = readU16BE(buf, base + 28);
          const type = readU16BE(buf, base + 30);
          samples.push({ name, length, loopStart, loopLength, volume, type, pcm: null });
        }
        break;
      }
      case "SPEE": {
        speed = readU16BE(buf, dataStart);
        break;
      }
      case "SLEN": {
        songLength = readU16BE(buf, dataStart);
        break;
      }
      case "PLEN": {
        patternCount = readU16BE(buf, dataStart);
        break;
      }
      case "PATT": {
        for (let i = 0; i < songLength && i < chunkSize; i++) {
          sequence.push(buf[dataStart + i]);
        }
        break;
      }
      case "PBOD": {
        const numRows = readU16BE(buf, dataStart);
        patternFileOffsets.push(dataStart + 2);
        const numChans = 8;
        const cells = [];
        for (let row = 0; row < numRows; row++) {
          const rowCells = [];
          for (let ch = 0; ch < numChans; ch++) {
            const cellBase = dataStart + 2 + row * numChans * 4 + ch * 4;
            const note = buf[cellBase];
            const sample = buf[cellBase + 1];
            const cmd = buf[cellBase + 2];
            const data = buf[cellBase + 3];
            rowCells.push(note, sample, cmd, data);
          }
          cells.push(rowCells);
        }
        patterns.push({ rows: numRows, channels: numChans, cells });
        break;
      }
      case "SBOD": {
        samplePcmQueue.push(buf.slice(dataStart, dataStart + chunkSize));
        break;
      }
    }
  }
  for (let i = 0; i < samples.length && i < samplePcmQueue.length; i++) {
    samples[i].pcm = samplePcmQueue[i];
  }
  const instruments = samples.map((samp, i) => {
    const pcm = samp.pcm ?? new Uint8Array(samp.length);
    const loopEnd = samp.loopStart + samp.loopLength;
    const hasValidLoop = samp.loopLength > 2 && loopEnd <= samp.length;
    return createSamplerInstrument(
      i + 1,
      samp.name,
      pcm,
      samp.volume,
      8287,
      // Amiga C-3 sample rate (Paula standard)
      hasValidLoop ? samp.loopStart : 0,
      hasValidLoop ? loopEnd : 0
    );
  });
  const trackerPatterns = patterns.map((pat, patIdx) => {
    const channels = Array.from({ length: pat.channels }, (_, ch) => {
      const rows = pat.cells.map((rowCells) => {
        const base = ch * 4;
        const rawNote = rowCells[base];
        const sampleNum = rowCells[base + 1];
        const cmd = rowCells[base + 2];
        const data = rowCells[base + 3];
        const { effTyp, eff } = mapOKTEffect(cmd, data);
        return {
          note: amigaNoteToXM(rawNote),
          instrument: sampleNum,
          volume: 0,
          effTyp,
          eff,
          effTyp2: 0,
          eff2: 0
        };
      });
      return {
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: ch < 4 ? -25 : 25,
        // LRRL LRRL panning like ProTracker
        instrumentId: null,
        color: null,
        rows
      };
    });
    return {
      id: `pattern-${patIdx}`,
      name: `Pattern ${patIdx}`,
      length: pat.rows,
      channels,
      importMetadata: {
        sourceFormat: "OKT",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: pat.channels,
        originalPatternCount: patternCount,
        originalInstrumentCount: samples.length
      }
    };
  });
  const songPositions = sequence.slice(0, songLength);
  const uadePatternLayout = {
    formatId: "oktalyzer",
    patternDataFileOffset: 0,
    // overridden by getCellFileOffset
    bytesPerCell: 4,
    rowsPerPattern: 64,
    numChannels: 8,
    numPatterns: trackerPatterns.length,
    moduleSize: buffer.byteLength,
    encodeCell: encodeOktalyzerCell,
    getCellFileOffset: (pattern, row, channel) => {
      const cellDataStart = patternFileOffsets[pattern];
      if (cellDataStart === void 0) return 0;
      return cellDataStart + row * 8 * 4 + channel * 4;
    }
  };
  return {
    name: filename.replace(/\.[^/.]+$/, ""),
    format: "OKT",
    patterns: trackerPatterns,
    instruments,
    songPositions: songPositions.length > 0 ? songPositions : [0],
    songLength: songPositions.length || 1,
    restartPosition: 0,
    numChannels: 8,
    initialSpeed: speed,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename,
    uadePatternLayout
  };
}
function mapOKTEffect(cmd, data) {
  switch (cmd) {
    case 0:
      return { effTyp: 0, eff: 0 };
    // No effect
    case 1:
      return { effTyp: 15, eff: data };
    // Set speed
    case 2:
      return { effTyp: 11, eff: data };
    // Position jump
    case 10:
      return { effTyp: 12, eff: data };
    // Set volume
    case 11:
      return { effTyp: 1, eff: data };
    // Portamento up
    case 12:
      return { effTyp: 2, eff: data };
    // Portamento down
    case 13:
      return { effTyp: 3, eff: data };
    // Tone portamento
    case 17:
      return { effTyp: 10, eff: data };
    // Volume slide
    case 30:
      return { effTyp: 14, eff: 12 << 4 | data & 15 };
    // Cut note (EC)
    default:
      return { effTyp: 0, eff: 0 };
  }
}
export {
  parseOktalyzerFile
};
