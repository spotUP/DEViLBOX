import { e as encodeQCCell } from "./QuadraComposerEncoder-JE3-GGZi.js";
import { c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function u8(view, off) {
  return view.getUint8(off);
}
function i8(view, off) {
  return view.getInt8(off);
}
function u16(view, off) {
  return view.getUint16(off, false);
}
function u32(view, off) {
  return view.getUint32(off, false);
}
function readString(view, off, len) {
  let s = "";
  for (let i = 0; i < len; i++) {
    const ch = view.getUint8(off + i);
    if (ch === 0) break;
    s += String.fromCharCode(ch);
  }
  return s;
}
function isQuadraComposerFormat(buffer) {
  if (buffer.byteLength < 12) return false;
  const view = new DataView(buffer);
  return readString(view, 0, 4) === "FORM" && readString(view, 8, 4) === "EMOD";
}
async function parseQuadraComposerFile(buffer, filename) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  if (buffer.byteLength < 12) throw new Error("QC: file too small");
  if (readString(view, 0, 4) !== "FORM") throw new Error("QC: missing FORM magic");
  if (readString(view, 8, 4) !== "EMOD") throw new Error("QC: not an EMOD file");
  let pos = 12;
  let songName = filename.replace(/\.[^/.]+$/, "");
  let initialBPM = 125;
  const instruments = [];
  const patternInfos = [];
  const reorder = new Uint8Array(256);
  let songTable = [];
  let pattStart = -1;
  let pattSize = 0;
  let smpStart = -1;
  let smpSize = 0;
  while (pos + 8 <= buffer.byteLength) {
    const id = readString(view, pos, 4);
    const size = u32(view, pos + 4);
    const data = pos + 8;
    pos = data + size;
    if (pos & 1) pos++;
    if (id === "EMIC") {
      let p = data;
      u16(view, p);
      p += 2;
      const name = readString(view, p, 20).trim();
      p += 20;
      if (name) songName = name;
      p += 20;
      initialBPM = u8(view, p);
      p += 1;
      const numSamples = u8(view, p);
      p += 1;
      for (let i = 0; i < numSamples; i++) {
        p += 1;
        const vol = u8(view, p);
        p += 1;
        const len = u16(view, p) * 2;
        p += 2;
        const smpName = readString(view, p, 20).trim();
        p += 20;
        const ctrl = u8(view, p);
        p += 1;
        i8(view, p);
        p += 1;
        const lps = u16(view, p) * 2;
        p += 2;
        const lpl = u16(view, p) * 2;
        p += 2;
        p += 4;
        instruments.push({
          name: smpName || `Sample ${i + 1}`,
          volume: vol,
          length: len,
          hasLoop: (ctrl & 1) !== 0,
          loopStart: lps,
          loopEnd: lpl > 0 ? lps + lpl : 0
        });
      }
      p += 1;
      const numPatterns = u8(view, p);
      p += 1;
      for (let i = 0; i < numPatterns; i++) {
        const origNum = u8(view, p);
        p += 1;
        const rows = u8(view, p) + 1;
        p += 1;
        p += 20;
        p += 4;
        reorder[origNum] = i;
        patternInfos.push({ origNumber: origNum, rows });
      }
      const numPositions = u8(view, p);
      p += 1;
      for (let i = 0; i < numPositions; i++) {
        songTable.push(reorder[u8(view, p)]);
        p += 1;
      }
    } else if (id === "PATT") {
      pattStart = data;
      pattSize = size;
    } else if (id === "8SMP") {
      smpStart = data;
      smpSize = size;
    }
  }
  const patternData = [];
  {
    let p = pattStart >= 0 ? pattStart : 0;
    const end = pattStart >= 0 ? Math.min(pattStart + pattSize, buffer.byteLength) : 0;
    for (const pi of patternInfos) {
      const pattRows = [];
      for (let row = 0; row < pi.rows; row++) {
        const rowCells = [];
        for (let ch = 0; ch < 4; ch++) {
          if (pattStart < 0 || p + 4 > end) {
            rowCells.push({ ins: 0, note: 255, fxt: 0, fxp: 0 });
            continue;
          }
          const ins = u8(view, p);
          const note = u8(view, p + 1);
          const fxt = u8(view, p + 2) & 15;
          let fxp = u8(view, p + 3);
          p += 4;
          if (fxt === 4) {
            fxp = fxp & 240 | (fxp & 15) << 1;
          }
          if (fxt === 9) {
            fxp = Math.min(fxp * 2, 255);
          }
          rowCells.push({ ins, note, fxt, fxp });
        }
        pattRows.push(rowCells);
      }
      patternData.push(pattRows);
    }
  }
  const sampleBuffers = [];
  {
    let p = smpStart >= 0 ? smpStart : 0;
    const end = smpStart >= 0 ? Math.min(smpStart + smpSize, buffer.byteLength) : 0;
    for (const inst of instruments) {
      if (smpStart < 0 || inst.length === 0) {
        sampleBuffers.push(null);
      } else {
        const avail = Math.min(inst.length, Math.max(0, end - p));
        sampleBuffers.push(avail > 0 ? bytes.slice(p, p + avail) : null);
        p += inst.length;
      }
    }
  }
  const instrConfigs = instruments.map((inst, i) => {
    const pcm = sampleBuffers[i];
    if (!pcm || pcm.length === 0) {
      return {
        id: i + 1,
        name: inst.name,
        type: "sample",
        synthType: "Sampler",
        effects: [],
        volume: -60,
        pan: 0
      };
    }
    return createSamplerInstrument(
      i + 1,
      inst.name,
      pcm,
      inst.volume,
      8287,
      inst.hasLoop ? inst.loopStart : 0,
      inst.hasLoop ? inst.loopEnd : 0
    );
  });
  const PANNING = [-50, 50, 50, -50];
  const patterns = patternData.map((pRows, pIdx) => {
    const channels = Array.from({ length: 4 }, (_, ch) => {
      const rows = pRows.map((rowCells) => {
        const c = rowCells[ch];
        const xmNote = c.note <= 35 ? c.note + 13 : 0;
        let volCol = 0;
        let effTyp = c.fxt;
        let eff = c.fxp;
        if (c.fxt === 12) {
          volCol = 16 + Math.min(c.fxp, 64);
          effTyp = 0;
          eff = 0;
        }
        return {
          note: xmNote,
          instrument: c.ins,
          volume: volCol,
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
        pan: PANNING[ch],
        instrumentId: null,
        color: null,
        rows
      };
    });
    return {
      id: `pattern-${pIdx}`,
      name: `Pattern ${pIdx}`,
      length: pRows.length,
      channels,
      importMetadata: {
        sourceFormat: "QuadraComposer",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: 4,
        originalPatternCount: patternInfos.length,
        originalInstrumentCount: instruments.length
      }
    };
  });
  if (patterns.length === 0) {
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
        pan: PANNING[ch],
        instrumentId: null,
        color: null,
        rows: Array.from({ length: 64 }, () => ({
          note: 0,
          instrument: 0,
          volume: 0,
          effTyp: 0,
          eff: 0,
          effTyp2: 0,
          eff2: 0
        }))
      })),
      importMetadata: {
        sourceFormat: "QuadraComposer",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: 4,
        originalPatternCount: 0,
        originalInstrumentCount: 0
      }
    });
  }
  const songPositions = songTable.length > 0 ? songTable.filter((idx) => idx < patterns.length) : [0];
  if (songPositions.length === 0) songPositions.push(0);
  const patternByteOffsets = [];
  {
    let off = pattStart >= 0 ? pattStart : 0;
    for (const pi of patternInfos) {
      patternByteOffsets.push(off);
      off += pi.rows * 4 * 4;
    }
  }
  const uadePatternLayout = {
    formatId: "quadraComposer",
    patternDataFileOffset: pattStart >= 0 ? pattStart : 0,
    bytesPerCell: 4,
    rowsPerPattern: 64,
    // nominal; actual rows vary per pattern
    numChannels: 4,
    numPatterns: patternInfos.length,
    moduleSize: buffer.byteLength,
    encodeCell: encodeQCCell,
    getCellFileOffset: (pattern, row, channel) => {
      const base = patternByteOffsets[pattern] ?? 0;
      return base + (row * 4 + channel) * 4;
    }
  };
  return {
    name: songName,
    format: "MOD",
    patterns,
    instruments: instrConfigs,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: Math.max(32, Math.min(255, initialBPM || 125)),
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename,
    uadePatternLayout
  };
}
export {
  isQuadraComposerFormat,
  parseQuadraComposerFile
};
