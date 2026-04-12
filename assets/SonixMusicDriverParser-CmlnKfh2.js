const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/IffSmusParser-CFXS4lKv.js","assets/main-BbV5VyEH.js","assets/client-DHYdgbIN.js","assets/vendor-ui-AJ7AT9BN.js","assets/vendor-react-Dgd_wxYf.js","assets/vendor-utils-a-Usm5Xm.js","assets/vendor-tone-48TQc1H3.js","assets/main-c6CPs1E0.css"])))=>i.map(i=>d[i]);
import { c5 as registerVariableEncoder, am as __vitePreload, c8 as idGenerator } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function encodeSnxVoiceStream(rows, _channel) {
  const words = [];
  let lastInstr = 1;
  let i = 0;
  while (i < rows.length) {
    const cell = rows[i];
    const note = cell.note ?? 0;
    const instr = cell.instrument ?? 0;
    const vol = cell.volume ?? 0;
    const isEmpty = note === 0 && instr === 0 && vol === 0;
    if (isEmpty) {
      let count = 0;
      while (i < rows.length) {
        const r = rows[i];
        if ((r.note ?? 0) !== 0 || (r.instrument ?? 0) !== 0 || (r.volume ?? 0) !== 0) break;
        count++;
        i++;
      }
      if (count === 1) {
        words.push(0);
      } else {
        let remaining = count;
        while (remaining > 0) {
          const chunk = Math.min(remaining, 16383);
          words.push(49152 | chunk);
          remaining -= chunk;
        }
      }
      continue;
    }
    if (instr > 0 && instr !== lastInstr) {
      const register = instr - 1;
      words.push(32768 | register & 255);
      lastInstr = instr;
    }
    if (vol >= 16) {
      const snxVol = Math.round((Math.min(vol, 80) - 16) / 64 * 127);
      words.push(33536 | snxVol & 255);
    }
    if (note > 0 && note <= 96) {
      const noteIndex = Math.max(1, Math.min(127, note));
      let velByte;
      if (vol >= 16) {
        velByte = Math.round((Math.min(vol, 80) - 16) / 64 * 127);
      } else {
        velByte = 100;
      }
      words.push((noteIndex & 127) << 8 | velByte & 255);
    } else {
      words.push(0);
    }
    i++;
  }
  words.push(65535);
  const out = new Uint8Array(words.length * 2);
  for (let w = 0; w < words.length; w++) {
    out[w * 2] = words[w] >> 8 & 255;
    out[w * 2 + 1] = words[w] & 255;
  }
  return out;
}
const sonixEncoder = {
  formatId: "sonixMusicDriver",
  encodePattern: encodeSnxVoiceStream
};
registerVariableEncoder(sonixEncoder);
const MIN_FILE_SIZE_SNX = 21;
const MIN_FILE_SIZE_SMUS = 28;
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function isSnxFormat(buf) {
  const fileSize = buf.length;
  if (fileSize < MIN_FILE_SIZE_SNX) return false;
  if (fileSize < 20) return false;
  let offA0 = 0;
  let offA1 = 0;
  let d3 = 20;
  const lengths = [];
  for (let i = 0; i < 4; i++) {
    if (offA0 + 4 > fileSize) return false;
    const d2 = u32BE(buf, offA0);
    offA0 += 4;
    if (d2 === 0) return false;
    if ((d2 & 2147483648) !== 0) return false;
    if ((d2 & 1) !== 0) return false;
    d3 += d2;
    lengths.push(d2);
  }
  if (d3 >= fileSize) return false;
  offA0 += 4;
  for (let i = 0; i < 4; i++) {
    if (offA0 >= fileSize) return false;
    const b = buf[offA0];
    if ((b & 128) === 0) return false;
    if (offA0 + 2 <= fileSize) {
      const w = u16BE(buf, offA0);
      if (w !== 65535) {
        if (b > 132) return false;
      }
    } else {
      if (b > 132) return false;
    }
    if (offA1 + 4 > fileSize) return false;
    offA0 += lengths[offA1 / 4];
    offA1 += 4;
  }
  if (offA0 >= fileSize) return false;
  if (buf[offA0] === 0) return false;
  return true;
}
function isTinyFormat(buf) {
  const fileSize = buf.length;
  if (fileSize <= 332) return false;
  if (fileSize < 56) return false;
  if (u32BE(buf, 48) !== 320) return false;
  let offA1 = 52;
  for (let i = 0; i < 3; i++) {
    if (offA1 + 4 > fileSize) return false;
    const d2 = u32BE(buf, offA1);
    offA1 += 4;
    if (d2 === 0) return false;
    if ((d2 & 2147483648) !== 0) return false;
    if ((d2 & 1) !== 0) return false;
    if (d2 >= fileSize) return false;
    const offA2 = d2;
    if (offA2 + 2 > fileSize) return false;
    const w = u16BE(buf, offA2);
    if (w === 65535) {
      continue;
    }
    if (offA2 + 7 > fileSize) return false;
    if (u32BE(buf, offA2) !== 0) return false;
    if (u16BE(buf, offA2 + 4) !== 0) return false;
    const b = buf[offA2 + 6];
    if ((b & 128) === 0) return false;
    if (b > 130) return false;
  }
  return true;
}
function isSmusFormat(buf) {
  const fileSize = buf.length;
  if (fileSize < MIN_FILE_SIZE_SMUS) return false;
  if (u32BE(buf, 8) !== 1397577043) return false;
  if (buf[23] === 0) return false;
  let off = 24;
  if (off + 8 > fileSize) return false;
  if (u32BE(buf, off) !== 1312902469) return false;
  off += 4;
  let chunkSize = u32BE(buf, off);
  off += 4;
  if ((chunkSize & 2147483648) !== 0) return false;
  chunkSize = chunkSize + 1 & -2;
  off += chunkSize;
  if (off + 8 > fileSize) return false;
  if (u32BE(buf, off) !== 1397643313) return false;
  off += 4;
  chunkSize = u32BE(buf, off);
  off += 4;
  if ((chunkSize & 2147483648) !== 0) return false;
  chunkSize = chunkSize + 1 & -2;
  off += chunkSize;
  while (true) {
    if (off + 4 > fileSize) return false;
    const tag = u32BE(buf, off);
    if (tag === 1414676811) {
      break;
    }
    if (tag !== 1229869873) return false;
    off += 4;
    if (off + 4 > fileSize) return false;
    chunkSize = u32BE(buf, off);
    off += 4;
    if ((chunkSize & 2147483648) !== 0) return false;
    if (off >= fileSize) return false;
    if (buf[off] > 63) return false;
    if (off + 1 >= fileSize) return false;
    if (buf[off + 1] !== 0) return false;
    chunkSize = chunkSize + 1 & -2;
    off += chunkSize;
  }
  return true;
}
function detectSonixFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < 4) return null;
  const firstLong = u32BE(buf, 0);
  if (firstLong === 1179603533) {
    return isSmusFormat(buf) ? "smus" : null;
  }
  const firstWord = u16BE(buf, 0);
  if ((firstWord & 240) !== 0) {
    return isTinyFormat(buf) ? "tiny" : null;
  }
  return isSnxFormat(buf) ? "snx" : null;
}
function isSonixFormat(buffer) {
  return detectSonixFormat(buffer) !== null;
}
function emptyCell() {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}
function parseSnxVoiceStream(buf, startOff, length) {
  const cells = [];
  const endOff = Math.min(startOff + length, buf.length);
  let pos = startOff;
  let currentInstr = 1;
  let currentVol = 0;
  while (pos + 2 <= endOff) {
    const word = u16BE(buf, pos);
    pos += 2;
    if (word === 65535) break;
    if (word >= 49152) {
      const ticks = Math.max(1, word & 16383);
      for (let t = 0; t < ticks; t++) cells.push(emptyCell());
      continue;
    }
    if (word >= 32768) {
      const cmd = word >> 8 & 255;
      const param = word & 255;
      switch (cmd) {
        case 128:
          currentInstr = param + 1;
          break;
        case 131:
          currentVol = param > 0 ? 16 + Math.min(64, Math.round(param / 127 * 64)) : 16;
          break;
      }
      continue;
    }
    if (word === 0) {
      cells.push(emptyCell());
      continue;
    }
    const noteIndex = word >> 8 & 127;
    const velByte = word & 255;
    if (noteIndex === 0) {
      cells.push(emptyCell());
    } else {
      const xmNote = Math.max(1, Math.min(96, noteIndex));
      const xmVol = currentVol !== 0 ? currentVol : velByte > 0 ? 16 + Math.min(64, Math.round(velByte / 127 * 64)) : 0;
      cells.push({
        note: xmNote,
        instrument: currentInstr,
        volume: xmVol,
        effTyp: 0,
        eff: 0,
        effTyp2: 0,
        eff2: 0
      });
    }
  }
  return cells;
}
function buildPatterns(channelFlat, filename, numChannels) {
  let totalRows = 0;
  for (const ch of channelFlat) {
    if (ch.length > totalRows) totalRows = ch.length;
  }
  if (totalRows === 0) totalRows = 64;
  for (const ch of channelFlat) {
    while (ch.length < totalRows) ch.push(emptyCell());
  }
  const PATTERN_LENGTH = 64;
  const numPatterns = Math.max(1, Math.ceil(totalRows / PATTERN_LENGTH));
  const patterns = [];
  const AMIGA_PAN = [-50, 50, 50, -50];
  for (let p = 0; p < numPatterns; p++) {
    const startRow = p * PATTERN_LENGTH;
    const endRow = Math.min(startRow + PATTERN_LENGTH, totalRows);
    const patLen = endRow - startRow;
    const channels = channelFlat.map((cells, ch) => ({
      id: idGenerator.generate("sonix-ch"),
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: AMIGA_PAN[ch % 4] ?? 0,
      instrumentId: null,
      color: null,
      rows: cells.slice(startRow, endRow)
    }));
    patterns.push({
      id: idGenerator.generate("sonix-pat"),
      name: `Pattern ${p + 1}`,
      length: patLen,
      channels,
      importMetadata: {
        sourceFormat: "MOD",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: numChannels,
        originalPatternCount: numPatterns,
        originalInstrumentCount: 0
      }
    });
  }
  return patterns;
}
function parseSnxBinary(buf, filename) {
  const fileSize = buf.length;
  if (fileSize < 22) throw new Error("SNX file too small");
  const sectionLengths = [
    u32BE(buf, 0),
    u32BE(buf, 4),
    u32BE(buf, 8),
    u32BE(buf, 12)
  ];
  let totalVoiceBytes = 20;
  for (const len of sectionLengths) totalVoiceBytes += len;
  if (totalVoiceBytes > fileSize) throw new Error("SNX section lengths exceed file size");
  const voiceStart = 20;
  let offset = voiceStart;
  const channelFlat = [];
  for (let ch = 0; ch < 4; ch++) {
    channelFlat.push(parseSnxVoiceStream(buf, offset, sectionLengths[ch]));
    offset += sectionLengths[ch];
  }
  const usedRegisters = /* @__PURE__ */ new Set();
  for (const cells of channelFlat) {
    for (const cell of cells) {
      if (cell.instrument > 0) usedRegisters.add(cell.instrument);
    }
  }
  const instruments = Array.from(
    { length: Math.max(1, usedRegisters.size) },
    (_, i) => ({
      id: i + 1,
      name: `Sample ${i + 1}`,
      type: "synth",
      synthType: "Sampler",
      effects: [],
      volume: 0,
      pan: 0
    })
  );
  const baseName = (filename.split("/").pop() ?? filename).replace(/^snx\./i, "");
  const patterns = buildPatterns(channelFlat, filename, 4);
  const NUM_CHANNELS = 4;
  const voiceStreamStart = 20;
  const filePatternAddrs = [];
  const filePatternSizes = [];
  let streamOffset = voiceStreamStart;
  for (let ch = 0; ch < NUM_CHANNELS; ch++) {
    filePatternAddrs.push(streamOffset);
    filePatternSizes.push(sectionLengths[ch]);
    streamOffset += sectionLengths[ch];
  }
  const trackMap = patterns.map(
    () => Array.from({ length: NUM_CHANNELS }, (_, ch) => ch)
  );
  const rowsPerPattern = patterns.map((p) => p.length);
  const uadeVariableLayout = {
    formatId: "sonixMusicDriver",
    numChannels: NUM_CHANNELS,
    numFilePatterns: NUM_CHANNELS,
    // one file-level stream per voice
    rowsPerPattern,
    moduleSize: fileSize,
    encoder: sonixEncoder,
    filePatternAddrs,
    filePatternSizes,
    trackMap
  };
  return {
    name: `${baseName} [SNX]`,
    format: "MOD",
    patterns,
    instruments,
    songPositions: patterns.map((_, i) => i),
    songLength: patterns.length,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    uadeEditableFileName: filename,
    uadeVariableLayout
  };
}
async function parseSonixFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  const subFormat = detectSonixFormat(buf);
  if (subFormat === null) throw new Error("Not a Sonix Music Driver module");
  if (subFormat === "smus") {
    const { parseIffSmusFile } = await __vitePreload(async () => {
      const { parseIffSmusFile: parseIffSmusFile2 } = await import("./IffSmusParser-CFXS4lKv.js");
      return { parseIffSmusFile: parseIffSmusFile2 };
    }, true ? __vite__mapDeps([0,1,2,3,4,5,6,7]) : void 0);
    const song2 = await parseIffSmusFile(buffer, filename);
    song2.sonixFileData = buffer.slice(0);
    return song2;
  }
  if (subFormat === "tiny") {
    throw new Error(
      "Sonix TINY binary format requires external instrument files; use UADE for playback"
    );
  }
  const song = parseSnxBinary(buf, filename);
  song.sonixFileData = buffer.slice(0);
  return song;
}
export {
  detectSonixFormat,
  isSonixFormat,
  parseSonixFile
};
