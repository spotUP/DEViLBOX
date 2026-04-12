import { c2 as createSamplerInstrument, c7 as amigaNoteToXM } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function isWallyBebenFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < 10) return false;
  if (u16BE(buf, 0) !== 24576) return false;
  const d1 = u16BE(buf, 2);
  if (d1 === 0 || d1 & 32768 || d1 & 1) return false;
  if (u32BE(buf, 4) !== 1223163902) return false;
  if (u16BE(buf, 8) !== 24832) return false;
  return true;
}
function findOrigin(buf) {
  for (let i = 0; i < Math.min(512, buf.length - 6); i += 2) {
    if (u16BE(buf, i) === 4153) {
      const absAddr = u32BE(buf, i + 2);
      const d0 = i + 2;
      return absAddr - d0 >>> 0;
    }
  }
  return 0;
}
function toFileOff(origin, absAddr, fileLen) {
  const result = origin > 2147483648 ? absAddr - origin + 4294967296 & 4294967295 : absAddr - origin;
  return result > 0 && result < fileLen ? result : -1;
}
function findSubsongCount(buf) {
  for (let i = 0; i < Math.min(512, buf.length - 6); i += 2) {
    if (u16BE(buf, i) === 8764) {
      return u32BE(buf, i + 2);
    }
  }
  return 1;
}
function findSongsPtr(buf, origin) {
  let past223c = false;
  for (let i = 0; i < Math.min(512, buf.length - 6); i += 2) {
    if (u16BE(buf, i) === 8764) past223c = true;
    if (past223c && u16BE(buf, i) === 16889) {
      const foff = toFileOff(origin, u32BE(buf, i + 2), buf.length);
      if (foff > 0 && foff + 4 < buf.length) {
        const isU16Hi = (u32BE(buf, foff) & 65535) === 0;
        return { offset: foff, isU16Hi };
      }
      break;
    }
  }
  return { offset: -1, isU16Hi: false };
}
function findSamplesPtr(buf, origin) {
  for (let i = 0; i < buf.length - 8; i += 2) {
    if (u16BE(buf, i) === 58756) {
      const leaPos = i - 4;
      if (leaPos >= 2) {
        const leaOp = u16BE(buf, leaPos - 2);
        if (leaOp === 16889 || leaOp === 17401) {
          const spOff = toFileOff(origin, u32BE(buf, leaPos), buf.length);
          if (spOff > 0 && spOff < buf.length) return spOff;
        }
      }
      break;
    }
  }
  return -1;
}
function readSongPtr(buf, origin, songsOff, idx, isU16Hi) {
  const ptrOff = songsOff + idx * 4;
  if (ptrOff + 4 > buf.length) return -1;
  if (isU16Hi) {
    const hi16 = u32BE(buf, ptrOff) >>> 16 & 65535;
    return hi16 - (origin & 65535);
  }
  return toFileOff(origin, u32BE(buf, ptrOff), buf.length);
}
function decodePhraseToRows(buf, phraseOff) {
  const rows = [];
  const offsets = [];
  if (phraseOff < 0 || phraseOff >= buf.length) return { rows, offsets };
  let pos = phraseOff;
  let currentInstr = 0;
  for (let i = 0; i < 256 && pos < buf.length; i++) {
    const byteOff = pos;
    const b = buf[pos++];
    if (b === 255) break;
    if (b <= 35) {
      const xmNote = amigaNoteToXM(b + 1);
      rows.push({
        note: xmNote,
        instrument: currentInstr,
        volume: 0,
        effTyp: 0,
        eff: 0,
        effTyp2: 0,
        eff2: 0
      });
      offsets.push(byteOff);
    } else if (b >= 224 && b <= 239) {
      currentInstr = (b & 15) + 1;
    } else if (b >= 192 && b <= 207 && pos < buf.length) {
      pos++;
    } else if (b >= 128) ;
    else {
      rows.push({
        note: 0,
        instrument: 0,
        volume: 0,
        effTyp: 0,
        eff: 0,
        effTyp2: 0,
        eff2: 0
      });
      offsets.push(byteOff);
    }
  }
  return { rows, offsets };
}
function parseWallyBebenFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (!isWallyBebenFormat(buf)) throw new Error("Not a Wally Beben module");
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^wb\./i, "").replace(/\.wb$/i, "") || baseName;
  const origin = findOrigin(buf);
  const nSubsongs = findSubsongCount(buf);
  const { offset: songsOff, isU16Hi } = findSongsPtr(buf, origin);
  const instruments = [];
  const samplesOff = findSamplesPtr(buf, origin);
  let numSamples = 0;
  if (samplesOff > 0) {
    for (let j = 0; j < 64; j++) {
      const ptr = u32BE(buf, samplesOff + j * 4);
      if (ptr === 0 || toFileOff(origin, ptr, buf.length) < 0) break;
      numSamples++;
    }
    for (let i = 0; i < numSamples; i++) {
      const pcmOff = toFileOff(origin, u32BE(buf, samplesOff + i * 4), buf.length);
      if (pcmOff < 0) {
        instruments.push({
          id: i + 1,
          name: `WB Sample ${i + 1}`,
          type: "synth",
          synthType: "Synth",
          effects: [],
          volume: 0,
          pan: 0
        });
        continue;
      }
      let lenBytes = 0;
      if (i + 1 < numSamples) {
        const nextOff = toFileOff(origin, u32BE(buf, samplesOff + (i + 1) * 4), buf.length);
        if (nextOff > pcmOff) lenBytes = nextOff - pcmOff;
      }
      if (lenBytes === 0) lenBytes = Math.min(buf.length - pcmOff, 65536);
      if (lenBytes <= 0 || pcmOff + lenBytes > buf.length) {
        instruments.push({
          id: i + 1,
          name: `WB Sample ${i + 1}`,
          type: "synth",
          synthType: "Synth",
          effects: [],
          volume: 0,
          pan: 0
        });
        continue;
      }
      const pcm = new Uint8Array(lenBytes);
      for (let k = 0; k < lenBytes; k++) pcm[k] = buf[pcmOff + k];
      instruments.push(createSamplerInstrument(
        i + 1,
        `WB Sample ${i + 1}`,
        pcm,
        64,
        8287,
        0,
        0
      ));
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
  const phraseTableStart = songsOff >= 0 ? songsOff + nSubsongs * 4 * 4 : -1;
  const phraseOffsets = [];
  if (phraseTableStart > 0) {
    for (let i = 0; i < 256; i++) {
      const ptrOff = phraseTableStart + i * 4;
      if (ptrOff + 4 > buf.length) break;
      const absPtr = u32BE(buf, ptrOff);
      if (absPtr === 0) break;
      const off = toFileOff(origin, absPtr, buf.length);
      if (off < 0) break;
      phraseOffsets.push(off);
    }
  }
  const patterns = [];
  const songPositions = [];
  const cellOffsetMap = /* @__PURE__ */ new Map();
  if (songsOff >= 0 && phraseOffsets.length > 0) {
    const voiceSeqs = [[], [], [], []];
    for (let v = 0; v < 4; v++) {
      const seqOff = readSongPtr(buf, origin, songsOff, v, isU16Hi);
      if (seqOff < 0) continue;
      let pos = seqOff;
      while (pos < buf.length) {
        const b = buf[pos++];
        if (b === 255) break;
        if (b < 128) {
          voiceSeqs[v].push(b);
        }
      }
    }
    const numSteps = Math.max(...voiceSeqs.map((s) => s.length), 1);
    for (let step = 0; step < numSteps; step++) {
      const channelRows = [];
      const channelOffsets = [];
      let maxRows = 1;
      for (let v = 0; v < 4; v++) {
        const phraseIdx = step < voiceSeqs[v].length ? voiceSeqs[v][step] : -1;
        let rows = [];
        let offsets = [];
        if (phraseIdx >= 0 && phraseIdx < phraseOffsets.length) {
          const result = decodePhraseToRows(buf, phraseOffsets[phraseIdx]);
          rows = result.rows;
          offsets = result.offsets;
        }
        if (rows.length === 0) {
          rows = [{ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 }];
          offsets = [-1];
        }
        channelRows.push(rows);
        channelOffsets.push(offsets);
        maxRows = Math.max(maxRows, rows.length);
      }
      maxRows = Math.min(maxRows, 128);
      const channels = [];
      for (let v = 0; v < 4; v++) {
        const rows = channelRows[v];
        const offsets = channelOffsets[v];
        const trackerRows = [];
        for (let r = 0; r < maxRows; r++) {
          trackerRows.push(r < rows.length ? rows[r] : { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          const off = r < offsets.length ? offsets[r] : -1;
          if (off >= 0) {
            cellOffsetMap.set(`${step}-${v}-${r}`, off);
          }
        }
        channels.push({
          id: `channel-${v}`,
          name: `Channel ${v + 1}`,
          muted: false,
          solo: false,
          collapsed: false,
          volume: 100,
          pan: v === 0 || v === 3 ? -50 : 50,
          instrumentId: null,
          color: null,
          rows: trackerRows
        });
      }
      patterns.push({
        id: `pattern-${step}`,
        name: `Pattern ${step}`,
        length: maxRows,
        channels,
        importMetadata: {
          sourceFormat: "MOD",
          sourceFile: filename,
          importedAt: (/* @__PURE__ */ new Date()).toISOString(),
          originalChannelCount: 4,
          originalPatternCount: numSteps,
          originalInstrumentCount: instruments.length
        }
      });
      songPositions.push(step);
    }
  }
  if (patterns.length === 0) {
    const emptyRows = Array.from({ length: 64 }, () => ({
      note: 0,
      instrument: 0,
      volume: 0,
      effTyp: 0,
      eff: 0,
      effTyp2: 0,
      eff2: 0
    }));
    patterns.push({
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
    });
    songPositions.push(0);
  }
  const wallyBebenLayout = {
    formatId: "wallyBeben",
    patternDataFileOffset: 0,
    // not used — getCellFileOffset is custom
    bytesPerCell: 1,
    rowsPerPattern: patterns.length > 0 ? patterns[0].length : 64,
    numChannels: 4,
    numPatterns: patterns.length,
    moduleSize: buf.byteLength,
    encodeCell: (cell) => {
      const out = new Uint8Array(1);
      if (cell.note > 0) {
        const wbIdx = cell.note - 12 - 1;
        out[0] = wbIdx >= 0 && wbIdx <= 35 ? wbIdx : 36;
      } else {
        out[0] = 36;
      }
      return out;
    },
    getCellFileOffset: (pattern, row, channel) => {
      return cellOffsetMap.get(`${pattern}-${channel}-${row}`) ?? -1;
    }
  };
  return {
    name: `${moduleName} [Wally Beben]`,
    format: "MOD",
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 1,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename,
    uadePatternLayout: wallyBebenLayout
  };
}
export {
  isWallyBebenFormat,
  parseWallyBebenFile
};
