import { e as encodeSoundFXCell } from "./SoundFXEncoder-BhznWvHj.js";
import { c2 as createSamplerInstrument, c3 as periodToNoteIndex } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function readUint32BE(buf, off) {
  return buf.getUint32(off, false);
}
function readUint16BE(buf, off) {
  return buf.getUint16(off, false);
}
function readInt16BE(buf, off) {
  return buf.getInt16(off, false);
}
function readUint8(buf, off) {
  return buf.getUint8(off);
}
function readString(buf, off, len) {
  let result = "";
  for (let i = 0; i < len; i++) {
    const ch = buf.getUint8(off + i);
    if (ch === 0) break;
    result += String.fromCharCode(ch);
  }
  return result;
}
function sfxPeriodToNote(period) {
  if (period === 0) return 0;
  if (period < 0) return 0;
  const noteIdx = periodToNoteIndex(period);
  if (noteIdx === 0) return 0;
  return noteIdx + 12;
}
function isSoundFXFormat(buffer) {
  if (buffer.byteLength < 1686) return false;
  const view = new DataView(buffer);
  const magic1 = readString(view, 60, 4);
  if (magic1 === "SONG") return true;
  if (buffer.byteLength >= 2350) {
    const magic2 = readString(view, 124, 4);
    if (magic2 === "SO31") return true;
  }
  return false;
}
async function parseSoundFXFile(buffer, filename) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  if (buffer.byteLength < 1686) {
    throw new Error("SoundFX: file too small");
  }
  let version;
  let numSampleSlots;
  let sampleTableOffset;
  const magic1 = readString(view, 60, 4);
  if (magic1 === "SONG") {
    version = "v1";
    numSampleSlots = 16;
    sampleTableOffset = 0;
  } else {
    if (buffer.byteLength < 2350) {
      throw new Error("SoundFX: file too small for v2.0");
    }
    const magic2 = readString(view, 124, 4);
    if (magic2 !== "SO31") {
      throw new Error(`SoundFX: unrecognized magic bytes`);
    }
    version = "v2";
    numSampleSlots = 32;
    sampleTableOffset = 544;
  }
  const sampleTableBase = numSampleSlots * 4 + 20;
  const tempoOffset = version === "v1" ? 64 : 128;
  const tempo = readUint16BE(view, tempoOffset);
  let pos = 0;
  const sampleSizes = [];
  for (let i = 0; i < numSampleSlots; i++) {
    const val = readUint32BE(view, pos);
    sampleSizes.push(val);
    pos += 4;
  }
  pos += 20;
  const samples = [];
  const samplePointers = [];
  let ptrAccum = 0;
  for (let i = 0; i < numSampleSlots; i++) {
    samplePointers.push(ptrAccum);
    if (i > 0 && sampleSizes[i] > 0) {
      ptrAccum += sampleSizes[i];
    }
  }
  for (let i = 0; i < numSampleSlots; i++) {
    if (i === 0) {
      samples.push(null);
      continue;
    }
    if (sampleSizes[i] === 0) {
      samples.push(null);
      pos += 30;
      continue;
    }
    const name = readString(view, pos, 22);
    const length = readUint16BE(view, pos + 22) << 1;
    readUint8(view, pos + 24);
    const volume = readUint8(view, pos + 25);
    const loop = readUint16BE(view, pos + 26);
    const repeat = readUint16BE(view, pos + 28) << 1;
    samples.push({
      name,
      length,
      volume: Math.min(volume, 64),
      loop,
      repeat,
      pointer: samplePointers[i]
    });
    pos += 30;
  }
  const songInfoOffset = 530 + sampleTableOffset;
  const songLength = readUint8(view, songInfoOffset);
  let trackPos = songInfoOffset + 2;
  const songPositions = [];
  let highestPosition = 0;
  for (let i = 0; i < songLength; i++) {
    const value = readUint8(view, trackPos);
    songPositions.push(value);
    if (value > highestPosition) highestPosition = value;
    trackPos++;
  }
  let patternDataOffset = 660 + sampleTableOffset;
  if (version === "v2") patternDataOffset += 4;
  const totalPatternEntries = (highestPosition + 1) * 256;
  const rawRows = [];
  let readPos = patternDataOffset;
  for (let i = 0; i < totalPatternEntries; i++) {
    if (readPos + 4 > buffer.byteLength) {
      rawRows.push({ note: 0, sample: 0, effect: 0, param: 0 });
      readPos += 4;
      continue;
    }
    const note = readInt16BE(view, readPos);
    const byte3 = readUint8(view, readPos + 2);
    const param = readUint8(view, readPos + 3);
    const effect = byte3 & 15;
    let sampleNum = byte3 >> 4;
    if (version === "v2") {
      if (note & 4096) {
        sampleNum += 16;
      }
    }
    if (sampleNum >= numSampleSlots || samples[sampleNum] == null) {
      sampleNum = 0;
    }
    rawRows.push({
      note: version === "v2" && note & 4096 && note > 0 ? note & 61439 : note,
      sample: sampleNum,
      effect,
      param
    });
    readPos += 4;
  }
  const sampleDataStart = readPos;
  const instruments = [];
  for (let i = 1; i < numSampleSlots; i++) {
    const sample = samples[i];
    if (!sample || sample.length === 0) continue;
    const pcmStart = sampleDataStart + sample.pointer;
    const pcmEnd = pcmStart + sample.length;
    if (pcmEnd > buffer.byteLength) continue;
    const pcm = bytes.slice(pcmStart, pcmEnd);
    let loopStart = 0;
    let loopEnd = 0;
    if (sample.loop > 0 && sample.repeat > 2) {
      loopStart = sample.loop;
      loopEnd = sample.loop + sample.repeat;
    } else if (sample.repeat > 2) {
      loopEnd = sample.repeat;
    }
    const chipRam = {
      moduleBase: 0,
      moduleSize: buffer.byteLength,
      instrBase: sampleTableBase + (i - 1) * 30,
      instrSize: 30,
      sections: {
        sampleTable: sampleTableBase
      }
    };
    const instr = createSamplerInstrument(
      i,
      sample.name || `Sample ${i}`,
      pcm,
      sample.volume,
      8287,
      // Standard Amiga C-3 sample rate
      loopStart,
      loopEnd
    );
    instr.uadeChipRam = chipRam;
    instruments.push(instr);
  }
  const uniquePatternIndices = [...new Set(songPositions)].sort((a, b) => a - b);
  const patternIndexMap = /* @__PURE__ */ new Map();
  const patterns = [];
  for (let pidx = 0; pidx < uniquePatternIndices.length; pidx++) {
    const srcIdx = uniquePatternIndices[pidx];
    patternIndexMap.set(srcIdx, pidx);
    const baseRow = srcIdx * 256;
    const channels = [];
    for (let ch = 0; ch < 4; ch++) {
      const rows = [];
      for (let row = 0; row < 64; row++) {
        const entryIdx = baseRow + row * 4 + ch;
        const raw = entryIdx < rawRows.length ? rawRows[entryIdx] : { note: 0, sample: 0, effect: 0, param: 0 };
        let xmNote = 0;
        let instrument = 0;
        let volume = 0;
        let effTyp = 0;
        let eff = 0;
        if (raw.note === -3) ;
        else if (raw.note === -2) {
          xmNote = 97;
        } else if (raw.note === -4) {
          effTyp = 13;
          eff = 0;
        } else if (raw.note === -5) ;
        else if (raw.note > 0) {
          xmNote = sfxPeriodToNote(raw.note);
        }
        if (raw.sample > 0) {
          instrument = raw.sample;
          const smp = samples[raw.sample];
          if (smp) {
            volume = 16 + Math.min(smp.volume, 64);
          }
        }
        if (raw.effect === 5 && raw.sample > 0) {
          const smp = samples[raw.sample];
          if (smp) {
            volume = 16 + Math.min(smp.volume + raw.param, 64);
          }
        } else if (raw.effect === 6 && raw.sample > 0) {
          const smp = samples[raw.sample];
          if (smp) {
            volume = 16 + Math.max(smp.volume - raw.param, 0);
          }
        }
        if (effTyp === 0) {
          switch (raw.effect) {
            case 0:
              break;
            case 1:
              if (raw.param !== 0) {
                effTyp = 0;
                eff = raw.param;
              }
              break;
            case 2:
              {
                const hi = raw.param >> 4;
                const lo = raw.param & 15;
                if (hi > 0) {
                  effTyp = 2;
                  eff = hi;
                } else if (lo > 0) {
                  effTyp = 1;
                  eff = lo;
                }
              }
              break;
            case 3:
              effTyp = 14;
              eff = 1;
              break;
            case 4:
              effTyp = 14;
              eff = 0;
              break;
            case 5:
              break;
            case 6:
              break;
            case 7:
              {
                const speed = raw.param & 15;
                if (speed > 0) {
                  effTyp = 1;
                  eff = speed;
                }
              }
              break;
            case 8:
              {
                const speed = raw.param & 15;
                if (speed > 0) {
                  effTyp = 2;
                  eff = speed;
                }
              }
              break;
            case 9:
              if (raw.param !== 0) {
                effTyp = 2;
                eff = raw.param & 15;
              }
              break;
          }
        }
        rows.push({
          note: xmNote,
          instrument,
          volume,
          effTyp,
          eff,
          effTyp2: 0,
          eff2: 0,
          period: raw.note > 0 ? raw.note : void 0
        });
      }
      const pan = ch === 0 || ch === 3 ? -50 : 50;
      channels.push({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan,
        instrumentId: null,
        color: null,
        rows
      });
    }
    patterns.push({
      id: `pattern-${pidx}`,
      name: `Pattern ${pidx}`,
      length: 64,
      channels,
      importMetadata: {
        sourceFormat: "MOD",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: 4,
        originalPatternCount: uniquePatternIndices.length,
        originalInstrumentCount: instruments.length
      }
    });
  }
  const mappedPositions = songPositions.map((idx) => patternIndexMap.get(idx) ?? 0);
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
        pan: ch === 0 || ch === 3 ? -50 : 50,
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
        sourceFormat: "MOD",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: 4,
        originalPatternCount: 0,
        originalInstrumentCount: 0
      }
    });
    mappedPositions.push(0);
  }
  const initialBPM = tempo > 0 ? Math.round(14565 * 122 / tempo) : 125;
  const moduleName = filename.replace(/\.[^/.]+$/, "");
  const uadePatternLayout = {
    formatId: "soundfx",
    patternDataFileOffset: patternDataOffset,
    bytesPerCell: 4,
    rowsPerPattern: 64,
    numChannels: 4,
    numPatterns: highestPosition + 1,
    moduleSize: buffer.byteLength,
    encodeCell: encodeSoundFXCell
  };
  return {
    name: moduleName,
    format: "MOD",
    patterns,
    instruments,
    songPositions: mappedPositions,
    songLength: mappedPositions.length,
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
  isSoundFXFormat,
  parseSoundFXFile
};
