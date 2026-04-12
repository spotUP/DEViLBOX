import { dy as JamCrackerEngine } from "./main-BbV5VyEH.js";
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
function xmNoteToJC(xmNote) {
  if (xmNote === 0 || xmNote === 97) return 0;
  const jcNote = xmNote - 12;
  if (jcNote < 1 || jcNote > 36) return 0;
  return jcNote;
}
function encodeCell(cell, buf, off) {
  buf[off + 0] = xmNoteToJC(cell.note ?? 0);
  buf[off + 1] = (cell.instrument ?? 0) & 255;
  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;
  if (effTyp === 15 && eff > 0) {
    buf[off + 2] = eff;
  } else if (effTyp === 0 && eff > 0) {
    buf[off + 3] = eff;
  } else if (effTyp === 4 && eff > 0) {
    buf[off + 4] = eff;
  } else if (effTyp === 3 && eff > 0) {
    buf[off + 7] = eff;
  }
  const vol = cell.volume ?? 0;
  if (vol >= 16 && vol <= 80) {
    buf[off + 6] = vol - 16 + 1;
  }
}
function extractPCM8FromWAV(audioBuffer) {
  const view = new DataView(audioBuffer);
  if (audioBuffer.byteLength < 44) return new Int8Array(0);
  const dataLen = view.getUint32(40, true);
  const frames = Math.floor(dataLen / 2);
  const result = new Int8Array(frames);
  for (let i = 0; i < frames; i++) {
    const s16 = view.getInt16(44 + i * 2, true);
    result[i] = s16 >> 8;
  }
  return result;
}
function exportSongToJam(song) {
  var _a, _b, _c, _d;
  const warnings = [];
  const MAX_INSTRUMENTS = 255;
  const MAX_ORDERS = 256;
  const CHANNELS = 4;
  const CELL_BYTES = 8;
  const instruments = song.instruments.slice(0, MAX_INSTRUMENTS);
  const noi = instruments.length || 1;
  const pcmBuffers = [];
  const instrFlags = [];
  const instrNames = [];
  for (let i = 0; i < noi; i++) {
    const inst = instruments[i];
    if (!inst) {
      pcmBuffers.push(new Int8Array(0));
      instrFlags.push(0);
      instrNames.push("");
      continue;
    }
    instrNames.push((inst.name || `Sample ${i + 1}`).slice(0, 31));
    const jcConfig = inst.jamCracker;
    if ((jcConfig == null ? void 0 : jcConfig.isAM) && jcConfig.waveformData) {
      instrFlags.push(jcConfig.flags ?? 2);
      pcmBuffers.push(new Int8Array(jcConfig.waveformData.buffer));
    } else if ((_a = inst.sample) == null ? void 0 : _a.audioBuffer) {
      try {
        const pcm = extractPCM8FromWAV(inst.sample.audioBuffer);
        const hasLoop = (inst.sample.loopEnd ?? 0) > (inst.sample.loopStart ?? 0);
        instrFlags.push(hasLoop ? 1 : 0);
        pcmBuffers.push(pcm);
      } catch {
        warnings.push(`Instrument ${i + 1}: PCM extraction failed.`);
        instrFlags.push(0);
        pcmBuffers.push(new Int8Array(0));
      }
    } else {
      instrFlags.push(0);
      pcmBuffers.push(new Int8Array(0));
    }
  }
  const patterns = song.patterns;
  const nop = patterns.length || 1;
  const orders = song.songPositions.length > 0 ? song.songPositions.slice(0, MAX_ORDERS) : [0];
  if (song.songPositions.length > MAX_ORDERS) {
    warnings.push(`Song has ${song.songPositions.length} orders; truncated to ${MAX_ORDERS}.`);
  }
  const INST_STRIDE = 40;
  const PATT_STRIDE = 6;
  const headerSize = 4;
  const instrTableSize = 2 + noi * INST_STRIDE;
  const pattTableSize = 2 + nop * PATT_STRIDE;
  const songTableSize = 2 + orders.length * 2;
  let patternDataSize = 0;
  const patternRows = [];
  for (let p = 0; p < nop; p++) {
    const rows = ((_b = patterns[p]) == null ? void 0 : _b.length) ?? 64;
    patternRows.push(rows);
    patternDataSize += rows * CHANNELS * CELL_BYTES;
  }
  let sampleDataSize = 0;
  for (const buf of pcmBuffers) sampleDataSize += buf.length;
  const totalSize = headerSize + instrTableSize + pattTableSize + songTableSize + patternDataSize + sampleDataSize;
  const output = new Uint8Array(totalSize);
  let pos = 0;
  writeString(output, pos, "BeEp", 4);
  pos += 4;
  writeU16BE(output, pos, noi);
  pos += 2;
  for (let i = 0; i < noi; i++) {
    const base = pos + i * INST_STRIDE;
    writeString(output, base, instrNames[i] || "", 31);
    writeU8(output, base + 31, instrFlags[i] || 0);
    writeU32BE(output, base + 32, ((_c = pcmBuffers[i]) == null ? void 0 : _c.length) ?? 0);
  }
  pos += noi * INST_STRIDE;
  writeU16BE(output, pos, nop);
  pos += 2;
  for (let p = 0; p < nop; p++) {
    const base = pos + p * PATT_STRIDE;
    writeU16BE(output, base, patternRows[p]);
  }
  pos += nop * PATT_STRIDE;
  writeU16BE(output, pos, orders.length);
  pos += 2;
  for (let i = 0; i < orders.length; i++) {
    writeU16BE(output, pos, orders[i]);
    pos += 2;
  }
  for (let p = 0; p < nop; p++) {
    const pat = patterns[p];
    const rows = patternRows[p];
    for (let row = 0; row < rows; row++) {
      for (let ch = 0; ch < CHANNELS; ch++) {
        const cell = (_d = pat == null ? void 0 : pat.channels[ch]) == null ? void 0 : _d.rows[row];
        if (cell) {
          encodeCell(cell, output, pos);
        }
        pos += CELL_BYTES;
      }
    }
  }
  for (let i = 0; i < noi; i++) {
    const pcm = pcmBuffers[i];
    if (pcm.length > 0) {
      for (let j = 0; j < pcm.length; j++) {
        output[pos + j] = pcm[j] & 255;
      }
      pos += pcm.length;
    }
  }
  const baseName = (song.name || "untitled").replace(/[^a-zA-Z0-9_-]/g, "_");
  return {
    data: new Blob([output], { type: "application/octet-stream" }),
    filename: `${baseName}.jam`,
    warnings
  };
}
async function exportAsJamCracker(song) {
  const warnings = [];
  if (JamCrackerEngine.hasInstance()) {
    const engine = JamCrackerEngine.getInstance();
    try {
      const buf = await engine.save();
      if (buf.length > 0) {
        const data2 = new Blob([buf.buffer], { type: "application/octet-stream" });
        const baseName2 = (song.name || "untitled").replace(/[^a-zA-Z0-9_-]/g, "_");
        return { data: data2, filename: `${baseName2}.jam`, warnings };
      }
      warnings.push("WASM save returned empty data.");
    } catch (e) {
      warnings.push(`WASM save failed: ${e.message}.`);
    }
  }
  try {
    const result = exportSongToJam(song);
    return { ...result, warnings: [...warnings, ...result.warnings] };
  } catch (e) {
    warnings.push(`From-scratch build failed: ${e.message}.`);
  }
  const fileData = song.jamCrackerFileData;
  if (!fileData || fileData.byteLength === 0) {
    throw new Error("No JamCracker file data available for export");
  }
  warnings.push("Using original file without in-session edits.");
  const data = new Blob([fileData], { type: "application/octet-stream" });
  const baseName = (song.name || "untitled").replace(/[^a-zA-Z0-9_-]/g, "_");
  return { data, filename: `${baseName}.jam`, warnings };
}
export {
  exportAsJamCracker
};
