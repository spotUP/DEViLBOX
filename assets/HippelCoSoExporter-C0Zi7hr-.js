import { UADEChipEditor } from "./UADEChipEditor-DnALwiXS.js";
import { aA as UADEEngine } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function writeU8(buf, off, val) {
  buf[off] = val & 255;
}
function writeU16BE(buf, off, val) {
  buf[off] = val >> 8 & 255;
  buf[off + 1] = val & 255;
}
function writeU32BE(buf, off, val) {
  buf[off] = val >>> 24 & 255;
  buf[off + 1] = val >>> 16 & 255;
  buf[off + 2] = val >>> 8 & 255;
  buf[off + 3] = val & 255;
}
function writeString(buf, off, str, len) {
  for (let i = 0; i < len; i++) {
    buf[off + i] = i < str.length ? str.charCodeAt(i) & 255 : 0;
  }
}
function s8toByte(v) {
  return v < 0 ? v + 256 : v & 255;
}
const PT_PERIODS = [
  856,
  808,
  762,
  720,
  678,
  640,
  604,
  570,
  538,
  508,
  480,
  453,
  428,
  404,
  381,
  360,
  339,
  320,
  302,
  285,
  269,
  254,
  240,
  226,
  214,
  202,
  190,
  180,
  170,
  160,
  151,
  143,
  135,
  127,
  120,
  113,
  107,
  101,
  95,
  90,
  85,
  80,
  76,
  72,
  68,
  64,
  60,
  57
];
const COSO_PERIODS = [
  1712,
  1616,
  1524,
  1440,
  1356,
  1280,
  1208,
  1140,
  1076,
  1016,
  960,
  906,
  856,
  808,
  762,
  720,
  678,
  640,
  604,
  570,
  538,
  508,
  480,
  453,
  428,
  404,
  381,
  360,
  339,
  320,
  302,
  285,
  269,
  254,
  240,
  226,
  214,
  202,
  190,
  180,
  170,
  160,
  151,
  143,
  135,
  127,
  120,
  113,
  107,
  101,
  95,
  90,
  85,
  80,
  76,
  72,
  68,
  64,
  60,
  57,
  54,
  51,
  48,
  45,
  43,
  40,
  38,
  36,
  34,
  32,
  30,
  28,
  27,
  25,
  24,
  23,
  21,
  20,
  19,
  18,
  17,
  16,
  15,
  14
];
function xmNoteToCoSo(xmNote) {
  if (xmNote <= 0 || xmNote > 96) return 0;
  const ptIdx = xmNote - 13;
  if (ptIdx < 0 || ptIdx >= PT_PERIODS.length) {
    return Math.max(0, Math.min(83, xmNote - 1));
  }
  const period = PT_PERIODS[ptIdx];
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < COSO_PERIODS.length; i++) {
    const d = Math.abs(COSO_PERIODS[i] - period);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}
function buildCoSoFile(song) {
  var _a;
  const warnings = [];
  const CHANNELS = 4;
  const HEADER_SIZE = 32;
  const hcConfigs = [];
  for (const inst of song.instruments) {
    const hc = inst.hippelCoso;
    hcConfigs.push(hc ?? null);
  }
  if (hcConfigs.length === 0 || hcConfigs.every((c) => c === null)) {
    hcConfigs.length = 0;
    hcConfigs.push({
      fseq: [0, -31],
      vseq: [64, -31],
      volSpeed: 1,
      vibSpeed: 0,
      vibDepth: 0,
      vibDelay: 0
    });
  }
  const fseqPool = [];
  const instrFseqIdx = [];
  for (const hc of hcConfigs) {
    if (!hc) {
      instrFseqIdx.push(0);
      continue;
    }
    const fseq = hc.fseq && hc.fseq.length > 0 ? hc.fseq : [0, -31];
    let found = -1;
    for (let i = 0; i < fseqPool.length; i++) {
      if (fseqPool[i].length === fseq.length && fseqPool[i].every((v, j) => v === fseq[j])) {
        found = i;
        break;
      }
    }
    if (found >= 0) {
      instrFseqIdx.push(found);
    } else {
      instrFseqIdx.push(fseqPool.length);
      fseqPool.push(fseq);
    }
  }
  const nFseqs = fseqPool.length || 1;
  if (fseqPool.length === 0) fseqPool.push([0, -31]);
  const fseqPtrTableSize = nFseqs * 2;
  let fseqDataSize = 0;
  const fseqDataOffsets = [];
  for (const seq of fseqPool) {
    fseqDataOffsets.push(fseqPtrTableSize + fseqDataSize);
    fseqDataSize += seq.length;
  }
  const fseqSectionSize = fseqPtrTableSize + fseqDataSize;
  const nVolseqs = hcConfigs.length;
  const volseqPtrTableSize = nVolseqs * 2;
  let volseqDataSize = 0;
  const volseqDataOffsets = [];
  for (const hc of hcConfigs) {
    volseqDataOffsets.push(volseqPtrTableSize + volseqDataSize);
    const vseq = (hc == null ? void 0 : hc.vseq) ?? [64, -31];
    volseqDataSize += 5 + vseq.length;
  }
  const volseqSectionSize = volseqPtrTableSize + volseqDataSize;
  const patternPool = [];
  const patternMap = [];
  for (let p = 0; p < song.patterns.length; p++) {
    const pat = song.patterns[p];
    const chIndices = [];
    for (let ch = 0; ch < CHANNELS; ch++) {
      const rows = ((_a = pat == null ? void 0 : pat.channels[ch]) == null ? void 0 : _a.rows) ?? [];
      const bytes = [];
      for (let r = 0; r < ((pat == null ? void 0 : pat.length) ?? 16); r++) {
        const cell = rows[r];
        if (!cell || (cell.note ?? 0) <= 0) {
          bytes.push(0);
          bytes.push(0);
        } else {
          const cosoNote = xmNoteToCoSo(cell.note);
          bytes.push(s8toByte(cosoNote));
          const volseqIdx = Math.max(0, (cell.instrument ?? 1) - 1) & 31;
          bytes.push(volseqIdx);
        }
      }
      bytes.push(s8toByte(-1));
      const encoded = new Uint8Array(bytes);
      let found = -1;
      for (let i = 0; i < patternPool.length; i++) {
        const existing = patternPool[i];
        if (existing.length === encoded.length && existing.every((v, j) => v === encoded[j])) {
          found = i;
          break;
        }
      }
      if (found >= 0) {
        chIndices.push(found);
      } else {
        chIndices.push(patternPool.length);
        patternPool.push(encoded);
      }
    }
    patternMap.push(chIndices);
  }
  const nPatterns = patternPool.length;
  const patPtrTableSize = nPatterns * 2;
  let patDataSize = 0;
  const patDataOffsets = [];
  for (const pat of patternPool) {
    patDataOffsets.push(patPtrTableSize + patDataSize);
    patDataSize += pat.length;
  }
  const patternSectionSize = patPtrTableSize + patDataSize;
  const songSteps = song.patterns.length || 1;
  const tracksSectionSize = songSteps * 12;
  const songsSectionSize = 6;
  const headersSectionSize = 0;
  const samplesSectionSize = 0;
  const frqseqsOff = HEADER_SIZE;
  const volseqsOff = frqseqsOff + fseqSectionSize;
  const patternsOff = volseqsOff + volseqSectionSize;
  const tracksOff = patternsOff + patternSectionSize;
  const songsOff = tracksOff + tracksSectionSize;
  const headersOff = songsOff + songsSectionSize;
  const samplesOff = headersOff + headersSectionSize;
  const totalSize = samplesOff + samplesSectionSize;
  const output = new Uint8Array(totalSize);
  writeString(output, 0, "COSO", 4);
  writeU32BE(output, 4, frqseqsOff);
  writeU32BE(output, 8, volseqsOff);
  writeU32BE(output, 12, patternsOff);
  writeU32BE(output, 16, tracksOff);
  writeU32BE(output, 20, songsOff);
  writeU32BE(output, 24, headersOff);
  writeU32BE(output, 28, samplesOff);
  for (let i = 0; i < nFseqs; i++) {
    writeU16BE(output, frqseqsOff + i * 2, frqseqsOff + fseqDataOffsets[i]);
  }
  let fPos = frqseqsOff + fseqPtrTableSize;
  for (const seq of fseqPool) {
    for (const v of seq) {
      writeU8(output, fPos++, s8toByte(v));
    }
  }
  for (let i = 0; i < nVolseqs; i++) {
    writeU16BE(output, volseqsOff + i * 2, volseqsOff + volseqDataOffsets[i]);
  }
  let vPos = volseqsOff + volseqPtrTableSize;
  for (let i = 0; i < nVolseqs; i++) {
    const hc = hcConfigs[i];
    const volSpeed = (hc == null ? void 0 : hc.volSpeed) ?? 1;
    const fseqIdx = instrFseqIdx[i] ?? 0;
    const vibSpeed = (hc == null ? void 0 : hc.vibSpeed) ?? 0;
    const vibDepth = (hc == null ? void 0 : hc.vibDepth) ?? 0;
    const vibDelay = (hc == null ? void 0 : hc.vibDelay) ?? 0;
    const vseq = (hc == null ? void 0 : hc.vseq) ?? [64, -31];
    writeU8(output, vPos, volSpeed & 255);
    vPos++;
    writeU8(output, vPos, s8toByte(fseqIdx));
    vPos++;
    writeU8(output, vPos, s8toByte(vibSpeed));
    vPos++;
    writeU8(output, vPos, s8toByte(vibDepth));
    vPos++;
    writeU8(output, vPos, vibDelay & 255);
    vPos++;
    for (const v of vseq) {
      writeU8(output, vPos++, s8toByte(v));
    }
  }
  for (let i = 0; i < nPatterns; i++) {
    writeU16BE(output, patternsOff + i * 2, patternsOff + patDataOffsets[i]);
  }
  let pPos = patternsOff + patPtrTableSize;
  for (const pat of patternPool) {
    output.set(pat, pPos);
    pPos += pat.length;
  }
  for (let step = 0; step < songSteps; step++) {
    const tBase = tracksOff + step * 12;
    const chIndices = patternMap[step] ?? [0, 0, 0, 0];
    for (let ch = 0; ch < CHANNELS; ch++) {
      writeU8(output, tBase + ch * 3, chIndices[ch] & 255);
      writeU8(output, tBase + ch * 3 + 1, 0);
      writeU8(output, tBase + ch * 3 + 2, 0);
    }
  }
  writeU16BE(output, songsOff, 0);
  writeU16BE(output, songsOff + 2, songSteps - 1);
  writeU16BE(output, songsOff + 4, song.initialSpeed || 6);
  return { data: output, warnings };
}
async function exportAsHippelCoSo(song) {
  var _a, _b, _c;
  const warnings = [];
  try {
    const result = buildCoSoFile(song);
    if (result.data.length > 0) {
      const baseName = (song.name || "untitled").replace(/[^a-zA-Z0-9_-]/g, "_");
      return {
        data: new Blob([result.data], { type: "application/octet-stream" }),
        filename: `${baseName}.coso`,
        warnings: [...warnings, ...result.warnings]
      };
    }
    warnings.push("From-scratch build returned empty data.");
  } catch (e) {
    warnings.push(`From-scratch build failed: ${e.message}.`);
  }
  try {
    const moduleSize = (_c = (_b = (_a = song.instruments) == null ? void 0 : _a[0]) == null ? void 0 : _b.uadeChipRam) == null ? void 0 : _c.moduleSize;
    if (moduleSize && moduleSize > 0) {
      const chipEditor = new UADEChipEditor(UADEEngine.getInstance());
      const chipData = await chipEditor.readEditedModule(moduleSize);
      if (chipData && chipData.byteLength > 0) {
        warnings.push("Exported from UADE chip RAM (runtime state).");
        const baseName = (song.name || "untitled").replace(/[^a-zA-Z0-9_-]/g, "_");
        return {
          data: new Blob([chipData], { type: "application/octet-stream" }),
          filename: `${baseName}.coso`,
          warnings
        };
      }
    }
  } catch (e) {
    warnings.push(`Chip RAM readback failed: ${e.message}.`);
  }
  throw new Error("No export method available for HippelCoSo: " + warnings.join(" "));
}
export {
  exportAsHippelCoSo
};
