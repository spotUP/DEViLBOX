import { e as encodeTFMXCell } from "./TFMXEncoder-CCEY1ckI.js";
import "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const TFMX_MAGIC = new Uint8Array([
  84,
  70,
  77,
  88,
  45,
  83,
  79,
  78,
  71,
  32
]);
const HEADER_SIZE = 512;
const NUM_CHANNELS = 4;
const TRACKSTEP_ENTRY_SIZE = 16;
function writeU16BE(view, off, val) {
  view.setUint16(off, val & 65535, false);
}
function writeU32BE(view, off, val) {
  view.setUint32(off, val >>> 0, false);
}
async function exportTFMX(song) {
  var _a, _b, _c;
  const warnings = [];
  const tfmxPatterns = [];
  const patMap = [];
  for (let p = 0; p < song.patterns.length; p++) {
    const pat = song.patterns[p];
    const chMap = [];
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const rows = ((_a = pat.channels[ch]) == null ? void 0 : _a.rows) ?? [];
      const tfmxIdx = tfmxPatterns.length;
      chMap.push(tfmxIdx);
      const cmds = [];
      for (let row = 0; row < rows.length; row++) {
        cmds.push(encodeTFMXCell(rows[row]));
      }
      const lastCmd = cmds.length > 0 ? cmds[cmds.length - 1] : null;
      if (!lastCmd || lastCmd[0] !== 240) {
        cmds.push(new Uint8Array([240, 0, 0, 0]));
      }
      const buf = new Uint8Array(cmds.length * 4);
      for (let i = 0; i < cmds.length; i++) {
        buf.set(cmds[i], i * 4);
      }
      tfmxPatterns.push(buf);
    }
    patMap.push(chMap);
  }
  if (tfmxPatterns.length > 128) {
    warnings.push(
      `TFMX supports up to 128 patterns; ${tfmxPatterns.length} generated. Extra patterns will be truncated.`
    );
  }
  const numTfmxPatterns = Math.min(128, tfmxPatterns.length);
  const macroDataBuffers = [];
  for (const inst of song.instruments) {
    if (((_b = inst == null ? void 0 : inst.tfmx) == null ? void 0 : _b.volModSeqData) && inst.tfmx.volModSeqData.length > 0) {
      macroDataBuffers.push(new Uint8Array(inst.tfmx.volModSeqData));
    } else {
      macroDataBuffers.push(new Uint8Array(4));
    }
  }
  if (macroDataBuffers.length === 0) {
    macroDataBuffers.push(new Uint8Array(4));
  }
  const numMacros = macroDataBuffers.length;
  const songLen = song.songPositions.length;
  const trackstepEntries = [];
  for (let i = 0; i < songLen; i++) {
    const trackerPatIdx = song.songPositions[i] ?? 0;
    const entry = new Uint8Array(TRACKSTEP_ENTRY_SIZE);
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const tfmxPatNum = ((_c = patMap[trackerPatIdx]) == null ? void 0 : _c[ch]) ?? 0;
      if (tfmxPatNum >= numTfmxPatterns) {
        entry[ch * 2] = 254;
        entry[ch * 2 + 1] = 0;
      } else {
        entry[ch * 2] = tfmxPatNum & 255;
        entry[ch * 2 + 1] = 0;
      }
    }
    for (let ch = NUM_CHANNELS; ch < 8; ch++) {
      entry[ch * 2] = 254;
      entry[ch * 2 + 1] = 0;
    }
    trackstepEntries.push(entry);
  }
  const endEntry = new Uint8Array(TRACKSTEP_ENTRY_SIZE);
  endEntry[0] = 255;
  trackstepEntries.push(endEntry);
  const patPtrTableSize = numTfmxPatterns * 4;
  const macroPtrTableSize = numMacros * 4;
  const trackstepSize = trackstepEntries.length * TRACKSTEP_ENTRY_SIZE;
  const patternDataSize = tfmxPatterns.slice(0, numTfmxPatterns).reduce((sum, buf) => sum + buf.length, 0);
  const macroDataSize = macroDataBuffers.reduce((sum, buf) => sum + buf.length, 0);
  const patPtrTableOffset = HEADER_SIZE;
  const macroPtrTableOffset = patPtrTableOffset + patPtrTableSize;
  const trackstepOffset = macroPtrTableOffset + macroPtrTableSize;
  const patternDataOffset = trackstepOffset + trackstepSize;
  const macroDataOffset = patternDataOffset + patternDataSize;
  const totalSize = macroDataOffset + macroDataSize;
  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);
  output.set(TFMX_MAGIC, 0);
  const titleStr = (song.name ?? "Untitled").substring(0, 40);
  for (let i = 0; i < titleStr.length; i++) {
    output[16 + i] = titleStr.charCodeAt(i) & 127;
  }
  const firstStep = 0;
  const lastStep = Math.max(0, songLen - 1);
  let tempoVal = song.initialBPM ?? 125;
  if (tempoVal <= 15) {
    tempoVal = Math.max(0, tempoVal);
  }
  writeU16BE(view, 256, firstStep);
  writeU16BE(view, 320, lastStep);
  writeU16BE(view, 384, tempoVal);
  writeU32BE(view, 464, trackstepOffset);
  writeU32BE(view, 468, patPtrTableOffset);
  writeU32BE(view, 472, macroPtrTableOffset);
  let patDataPos = patternDataOffset;
  for (let i = 0; i < numTfmxPatterns; i++) {
    writeU32BE(view, patPtrTableOffset + i * 4, patDataPos);
    patDataPos += tfmxPatterns[i].length;
  }
  let macroDataPos = macroDataOffset;
  for (let i = 0; i < numMacros; i++) {
    writeU32BE(view, macroPtrTableOffset + i * 4, macroDataPos);
    macroDataPos += macroDataBuffers[i].length;
  }
  for (let i = 0; i < trackstepEntries.length; i++) {
    output.set(trackstepEntries[i], trackstepOffset + i * TRACKSTEP_ENTRY_SIZE);
  }
  let writePos = patternDataOffset;
  for (let i = 0; i < numTfmxPatterns; i++) {
    output.set(tfmxPatterns[i], writePos);
    writePos += tfmxPatterns[i].length;
  }
  writePos = macroDataOffset;
  for (let i = 0; i < numMacros; i++) {
    output.set(macroDataBuffers[i], writePos);
    writePos += macroDataBuffers[i].length;
  }
  const baseName = (song.name ?? "untitled").replace(/[^a-zA-Z0-9_.-]/g, "_");
  const filename = `mdat.${baseName}`;
  return {
    data: new Blob([output.buffer], { type: "application/octet-stream" }),
    filename,
    warnings
  };
}
export {
  exportTFMX
};
