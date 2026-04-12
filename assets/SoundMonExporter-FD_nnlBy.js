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
function writeS8(buf, off, val) {
  buf[off] = val < 0 ? val + 256 & 255 : val & 255;
}
function writeU16BE(buf, off, val) {
  buf[off] = val >> 8 & 255;
  buf[off + 1] = val & 255;
}
function writeString(buf, off, str, len) {
  for (let i = 0; i < len; i++) {
    buf[off + i] = i < str.length ? str.charCodeAt(i) & 255 : 0;
  }
}
function xmNoteToSM(xmNote) {
  if (xmNote === 0 || xmNote === 97) return 0;
  const smNote = xmNote - 12;
  if (smNote < 1 || smNote > 48) return 0;
  return smNote;
}
function xmEffectToSM(xmEffTyp, xmEff) {
  switch (xmEffTyp) {
    case 0:
      return { smOpt: xmEff !== 0 ? 0 : 0, smParam: xmEff };
    case 1:
      return { smOpt: 4, smParam: xmEff };
    case 2:
      return { smOpt: 5, smParam: xmEff };
    case 4:
      return { smOpt: 6, smParam: xmEff };
    case 11:
      return { smOpt: 7, smParam: xmEff };
    case 14:
      return { smOpt: 3, smParam: xmEff ? 1 : 0 };
    case 15:
      return { smOpt: 2, smParam: xmEff };
    default:
      return { smOpt: 0, smParam: 0 };
  }
}
function encodeCell(cell, buf, off) {
  const note = xmNoteToSM(cell.note ?? 0);
  writeS8(buf, off, note);
  const instr = (cell.instrument ?? 0) & 15;
  const xmEffTyp = cell.effTyp ?? 0;
  const xmEff = cell.eff ?? 0;
  const vol = cell.volume ?? 0;
  if (vol >= 16 && vol <= 80) {
    buf[off + 1] = instr << 4 | 1;
    writeS8(buf, off + 2, vol - 16);
  } else if (xmEffTyp !== 0 || xmEff !== 0) {
    const { smOpt, smParam } = xmEffectToSM(xmEffTyp, xmEff);
    buf[off + 1] = instr << 4 | smOpt & 15;
    writeS8(buf, off + 2, smParam);
  } else {
    buf[off + 1] = instr << 4;
    buf[off + 2] = 0;
  }
}
function isBlockEmpty(rows) {
  for (const cell of rows) {
    if ((cell.note ?? 0) !== 0 || (cell.instrument ?? 0) !== 0 || (cell.effTyp ?? 0) !== 0 || (cell.eff ?? 0) !== 0) return false;
  }
  return true;
}
function blocksEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if ((a[i].note ?? 0) !== (b[i].note ?? 0) || (a[i].instrument ?? 0) !== (b[i].instrument ?? 0) || (a[i].effTyp ?? 0) !== (b[i].effTyp ?? 0) || (a[i].eff ?? 0) !== (b[i].eff ?? 0)) return false;
  }
  return true;
}
function extractPCM8FromWAV(audioBuffer) {
  const view = new DataView(audioBuffer);
  if (audioBuffer.byteLength < 44) return new Int8Array(0);
  const dataLen = view.getUint32(40, true);
  const frames = Math.floor(dataLen / 2);
  const result = new Int8Array(frames);
  for (let i = 0; i < frames; i++) {
    result[i] = view.getInt16(44 + i * 2, true) >> 8;
  }
  return result;
}
function generateBuiltinWave(waveType) {
  const wave = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    const t = i / 64;
    let val = 0;
    switch (waveType & 15) {
      case 0:
        val = 127 - Math.round(254 * t);
        break;
      case 1:
        val = t < 0.5 ? 127 : -128;
        break;
      case 2:
        val = t < 0.25 ? Math.round(t * 4 * 127) : t < 0.75 ? Math.round((0.5 - t) * 4 * 127) : Math.round((t - 1) * 4 * 127);
        break;
      case 3:
        val = Math.round(Math.sin(t * Math.PI * 2) * 127);
        break;
      default:
        val = Math.round(Math.sin(t * Math.PI * 2) * 127);
    }
    wave[i] = val < 0 ? val + 256 & 255 : val & 255;
  }
  return wave;
}
function exportSongToSoundMon(song) {
  var _a, _b, _c, _d;
  const warnings = [];
  const ROWS_PER_BLOCK = 16;
  const CHANNELS = 4;
  const MAX_INSTRUMENTS = 15;
  const songLength = song.patterns.length || 1;
  const blockPool = [];
  const trackTable = [];
  for (let seqIdx = 0; seqIdx < songLength; seqIdx++) {
    const pat = song.patterns[seqIdx];
    for (let ch = 0; ch < CHANNELS; ch++) {
      const rows = [];
      for (let row = 0; row < ROWS_PER_BLOCK; row++) {
        rows.push(((_a = pat == null ? void 0 : pat.channels[ch]) == null ? void 0 : _a.rows[row]) ?? {
          note: 0,
          instrument: 0,
          volume: 0,
          effTyp: 0,
          eff: 0,
          effTyp2: 0,
          eff2: 0
        });
      }
      if (isBlockEmpty(rows)) {
        trackTable.push({ pattern: 0, soundTranspose: 0, transpose: 0 });
      } else {
        let found = -1;
        for (let i = 0; i < blockPool.length; i++) {
          if (blocksEqual(blockPool[i], rows)) {
            found = i;
            break;
          }
        }
        if (found >= 0) {
          trackTable.push({ pattern: found + 1, soundTranspose: 0, transpose: 0 });
        } else {
          blockPool.push(rows);
          trackTable.push({ pattern: blockPool.length, soundTranspose: 0, transpose: 0 });
        }
      }
    }
  }
  const higherPattern = blockPool.length;
  const instruments = song.instruments.slice(0, MAX_INSTRUMENTS);
  const nInstruments = 15;
  const synthTables = [];
  const instrData = [];
  for (let i = 0; i < nInstruments; i++) {
    const inst = instruments[i];
    if (!inst) {
      instrData.push({
        isSynth: false,
        name: "",
        pcm: new Int8Array(0),
        volume: 0,
        loop: 0,
        repeat: 2,
        tableIdx: 0
      });
      continue;
    }
    const smConfig = inst.soundMon;
    if (smConfig && inst.synthType === "SoundMonSynth") {
      const tableIdx = synthTables.length;
      const wave = generateBuiltinWave(smConfig.waveType);
      synthTables.push(wave);
      const adsrTableIdx = synthTables.length;
      const adsrTable = new Uint8Array(64);
      for (let j = 0; j < 64; j++) {
        const t = j / 63;
        adsrTable[j] = Math.round(smConfig.attackVolume * (1 - t) + smConfig.sustainVolume * t) & 255;
      }
      synthTables.push(adsrTable);
      instrData.push({
        isSynth: true,
        name: inst.name || "",
        pcm: new Int8Array(0),
        volume: smConfig.sustainVolume ?? 64,
        loop: 0,
        repeat: 0,
        smConfig,
        tableIdx,
        adsrTableIdx
      });
    } else {
      let pcm = new Int8Array(0);
      if ((_b = inst.sample) == null ? void 0 : _b.audioBuffer) {
        try {
          pcm = extractPCM8FromWAV(inst.sample.audioBuffer);
        } catch {
          warnings.push(`Instrument ${i + 1}: PCM extraction failed.`);
        }
      }
      const loop = ((_c = inst.sample) == null ? void 0 : _c.loopStart) ?? 0;
      const repeat = ((_d = inst.sample) == null ? void 0 : _d.loopEnd) ? Math.max(2, inst.sample.loopEnd - loop) : 2;
      instrData.push({
        isSynth: false,
        name: inst.name || "",
        pcm,
        volume: Math.min(64, Math.round((inst.volume ?? -6) > -60 ? 64 : 0)),
        loop,
        repeat,
        tableIdx: 0
      });
    }
  }
  const nTables = synthTables.length;
  const HEADER_SIZE = 32;
  const INSTR_SIZE = nInstruments * 32;
  const TRACK_SIZE = songLength * CHANNELS * 4;
  const PATTERN_DATA_SIZE = higherPattern * ROWS_PER_BLOCK * 3;
  const SYNTH_TABLE_SIZE = nTables * 64;
  let sampleDataSize = 0;
  for (const d of instrData) {
    if (!d.isSynth) sampleDataSize += d.pcm.length;
  }
  const totalSize = HEADER_SIZE + INSTR_SIZE + TRACK_SIZE + PATTERN_DATA_SIZE + SYNTH_TABLE_SIZE + sampleDataSize;
  const output = new Uint8Array(totalSize);
  let pos = 0;
  const title = (song.name || "Untitled").slice(0, 25);
  writeString(output, 0, title, 26);
  pos = 26;
  writeU8(output, pos, 86);
  pos++;
  writeU8(output, pos, 46);
  pos++;
  writeU8(output, pos, 50);
  pos++;
  writeU8(output, pos, nTables);
  pos++;
  writeU16BE(output, pos, songLength);
  pos += 2;
  for (let i = 0; i < nInstruments; i++) {
    const d = instrData[i];
    const base = pos;
    if (d.isSynth && d.smConfig) {
      const sm = d.smConfig;
      writeU8(output, base, 255);
      writeU8(output, base + 1, d.tableIdx);
      writeU16BE(output, base + 2, 32);
      writeU8(output, base + 4, sm.attackSpeed > 0 ? 1 : 0);
      writeU8(output, base + 5, d.adsrTableIdx ?? 0);
      writeU16BE(output, base + 6, 32);
      writeU8(output, base + 8, Math.min(63, sm.attackSpeed));
      const hasVib = sm.vibratoSpeed > 0 && sm.vibratoDepth > 0;
      writeU8(output, base + 9, hasVib ? 1 : 0);
      writeU8(output, base + 10, d.tableIdx);
      writeU8(output, base + 11, Math.min(64, sm.vibratoDepth));
      writeU16BE(output, base + 12, 32);
      writeU8(output, base + 14, 0);
      writeU8(output, base + 15, sm.vibratoDelay);
      writeU8(output, base + 16, Math.min(63, sm.vibratoSpeed));
      writeU8(output, base + 17, 0);
      writeU8(output, base + 18, 0);
      writeU8(output, base + 19, 0);
      writeU16BE(output, base + 20, 0);
      writeU8(output, base + 22, 0);
      writeU8(output, base + 23, 0);
      writeU8(output, base + 24, 1);
      writeU8(output, base + 25, d.volume);
    } else {
      writeString(output, base, d.name.slice(0, 24), 24);
      const lenWords = Math.floor(d.pcm.length / 2);
      writeU16BE(output, base + 24, lenWords);
      if (d.pcm.length > 0) {
        writeU16BE(output, base + 26, Math.floor(d.loop / 2));
        writeU16BE(output, base + 28, Math.max(1, Math.floor(d.repeat / 2)));
        writeU16BE(output, base + 30, Math.min(64, d.volume));
      }
    }
    pos += 32;
  }
  for (let i = 0; i < trackTable.length; i++) {
    const t = trackTable[i];
    writeU16BE(output, pos, t.pattern);
    writeS8(output, pos + 2, t.soundTranspose);
    writeS8(output, pos + 3, t.transpose);
    pos += 4;
  }
  for (let blockIdx = 0; blockIdx < higherPattern; blockIdx++) {
    const block = blockPool[blockIdx];
    for (let row = 0; row < ROWS_PER_BLOCK; row++) {
      const cell = block[row] ?? { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0 };
      encodeCell(cell, output, pos);
      pos += 3;
    }
  }
  for (let t = 0; t < nTables; t++) {
    output.set(synthTables[t], pos);
    pos += 64;
  }
  for (let i = 0; i < nInstruments; i++) {
    const d = instrData[i];
    if (!d.isSynth && d.pcm.length > 0) {
      for (let j = 0; j < d.pcm.length; j++) {
        output[pos + j] = d.pcm[j] & 255;
      }
      pos += d.pcm.length;
    }
  }
  const baseName = (song.name || "untitled").replace(/[^a-zA-Z0-9_-]/g, "_");
  return {
    data: new Blob([output.slice(0, pos)], { type: "application/octet-stream" }),
    filename: `${baseName}.bp`,
    warnings
  };
}
async function exportAsSoundMon(song) {
  var _a, _b, _c;
  const warnings = [];
  try {
    const result = exportSongToSoundMon(song);
    if (result.data.size > 0) {
      return { ...result, warnings: [...warnings, ...result.warnings] };
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
          filename: `${baseName}.bp`,
          warnings
        };
      }
    }
  } catch (e) {
    warnings.push(`Chip RAM readback failed: ${e.message}.`);
  }
  throw new Error("No export method available for SoundMon: " + warnings.join(" "));
}
export {
  exportAsSoundMon
};
